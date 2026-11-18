//go:build darwin || linux

package browserbridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const maxApprovedExtensions = 8

// The primary installation identity is stable. Additional origins require an
// explicit local registration; Chrome sender data can never expand this list.
func validApprovedExtensions(cfg Installation) bool {
	if cfg.ApprovedExtensions == "" {
		return true
	}
	ids := strings.Split(cfg.ApprovedExtensions, ",")
	if len(ids) >= maxApprovedExtensions {
		return false
	}
	last := ""
	for _, id := range ids {
		if !ExtensionIDValid(id) || id == cfg.ExtensionID || id <= last {
			return false
		}
		last = id
	}
	return true
}
func InstallationAllowsExtension(cfg Installation, id string) bool {
	if !ExtensionIDValid(id) || !validApprovedExtensions(cfg) {
		return false
	}
	if id == cfg.ExtensionID {
		return true
	}
	for _, approved := range strings.Split(cfg.ApprovedExtensions, ",") {
		if id == approved {
			return true
		}
	}
	return false
}
func extensionOrigins(cfg Installation) []string {
	ids := []string{cfg.ExtensionID}
	if cfg.ApprovedExtensions != "" {
		ids = append(ids, strings.Split(cfg.ApprovedExtensions, ",")...)
	}
	origins := make([]string, 0, len(ids))
	for _, id := range ids {
		origins = append(origins, "chrome-extension://"+id+"/")
	}
	return origins
}
func equalExtensionOrigins(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
func ExtensionList() (map[string]any, error) {
	cfg, err := Load()
	if err != nil {
		return nil, err
	}
	return extensionList(cfg), nil
}
func extensionList(cfg Installation) map[string]any {
	ids := []string{cfg.ExtensionID}
	if cfg.ApprovedExtensions != "" {
		ids = append(ids, strings.Split(cfg.ApprovedExtensions, ",")...)
	}
	return map[string]any{"primaryExtensionId": cfg.ExtensionID, "extensionIds": ids}
}
func ExtensionApprove(id string) (map[string]any, error) { return changeExtension(id, true) }
func ExtensionRevoke(id string) (map[string]any, error)  { return changeExtension(id, false) }
func changeExtension(id string, approve bool) (map[string]any, error) {
	if !ExtensionIDValid(id) {
		return nil, errors.New("E_EXTENSION_ID")
	}
	ctx := context.Background()
	return withInstallationLock(ctx, func() (map[string]any, error) {
		cfg, err := loadInstallation()
		if err != nil {
			return nil, err
		}
		if id == cfg.ExtensionID {
			if !approve {
				return nil, errors.New("E_PRIMARY_EXTENSION")
			}
			return extensionList(cfg), nil
		}
		found := InstallationAllowsExtension(cfg, id)
		if found == approve {
			return extensionList(cfg), nil
		}
		ids := []string{}
		if cfg.ApprovedExtensions != "" {
			for _, prior := range strings.Split(cfg.ApprovedExtensions, ",") {
				if prior != id {
					ids = append(ids, prior)
				}
			}
		}
		if approve {
			if len(ids)+1 >= maxApprovedExtensions {
				return nil, ErrLimit
			}
			ids = append(ids, id)
		}
		// Permanently fence existing scopes before either revocation or a new
		// approval. Use the union solely to validate old records; it is never published.
		retirementParent := cfg
		if approve {
			retirementIDs := append([]string(nil), ids...)
			sort.Strings(retirementIDs)
			retirementParent.ApprovedExtensions = strings.Join(retirementIDs, ",")
		}
		sort.Strings(ids)
		cfg.ApprovedExtensions = strings.Join(ids, ",")
		cfg.InstalledAt = time.Now().UTC().Format(time.RFC3339Nano)
		manifest, err := ManifestFor(cfg.Browser, cfg.UserDataDir)
		if err != nil {
			return nil, err
		}
		wrapper, _, err := expectedWrapper(cfg.Executable)
		if err != nil {
			return nil, err
		}
		config, err := installationJSON(cfg)
		if err != nil {
			return nil, err
		}
		origins, err := json.MarshalIndent(expectedManifest(cfg), "", "  ")
		if err != nil {
			return nil, err
		}
		// The existing installer journal validates/replays exactly these same
		// three artifacts. No independent trust/config writer is introduced.
		retirementStarted, retired := false, 0
		err = commitInstallationAfterPreflight(ctx, cfg, []installMutation{
			{Path: filepath.Join(cfg.InstallRoot, "native-host"), Data: []byte(wrapper), Mode: 0700},
			{Path: configPath(), Data: append(config, '\n'), Mode: 0600},
			{Path: manifest, Data: append(origins, '\n'), Mode: 0600},
		}, func() error {
			retirementStarted = true
			var err error
			retired, err = retireExtensionConnections(retirementParent, id)
			return err
		})
		if err != nil {
			if retirementStarted {
				return nil, fmt.Errorf("E_EXTENSION_UPDATE_INCOMPLETE: extension=%s retiredConnections=%d; additional retirement or installation state may be incomplete; inspect before reconnecting: %w", id, retired, err)
			}
			return nil, err
		}
		return extensionList(cfg), nil
	})
}

func installationJSON(cfg Installation) ([]byte, error) {
	return json.MarshalIndent(map[string]any{
		"name": cfg.Name, "extensionId": cfg.ExtensionID, "approvedExtensions": cfg.ApprovedExtensions, "browser": cfg.Browser,
		"retainedConnections": cfg.RetainedConnections,
		"userDataDir": func() any {
			if cfg.UserDataDir == "" {
				return nil
			}
			return cfg.UserDataDir
		}(),
		"socketPath": cfg.SocketPath, "clientCredential": cfg.ClientCredential, "installRoot": cfg.InstallRoot,
		"provider": cfg.Provider, "executable": cfg.Executable, "createdAt": cfg.CreatedAt, "installedAt": cfg.InstalledAt,
	}, "", "  ")
}
