package appshell

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

var ErrInstanceQuitting = errors.New("the primary App Mode instance is quitting")

const appInstanceActivationTimeout = 3 * time.Second

type appInstanceRequest struct {
	Command string   `json:"command"`
	Token   string   `json:"token,omitempty"`
	Paths   []string `json:"paths,omitempty"`
}

type appInstanceResponse struct {
	Accepted bool   `json:"accepted"`
	State    string `json:"state"`
}

type InstanceLease interface {
	Close() error
	Wait()
}

// AcquireSingleInstance either becomes the primary owner or sends one bounded
// activation request to the existing primary. A secondary result never owns a
// lease and must exit before creating an execution.
func AcquireSingleInstance(ctx context.Context, manifest Manifest, activate func() bool) (lease InstanceLease, primary bool, err error) {
	if activate == nil {
		return nil, false, fmt.Errorf("single-instance activation handler is required")
	}
	return AcquireSingleInstanceWithDocuments(ctx, manifest, nil, func([]string) bool {
		return activate()
	})
}

// AcquireSingleInstanceWithDocuments extends the bounded activation message
// with validated document paths. This is used by Finder/LaunchServices and
// file-association launches so a hot secondary process cannot lose the file
// before the primary FlowInstallService sees it.
func AcquireSingleInstanceWithDocuments(ctx context.Context, manifest Manifest, paths []string, activate func([]string) bool) (lease InstanceLease, primary bool, err error) {
	if !manifest.SingleInstance {
		return nil, true, nil
	}
	if activate == nil {
		return nil, false, fmt.Errorf("single-instance activation handler is required")
	}
	if err := validateInstanceDocumentPaths(paths); err != nil {
		return nil, false, err
	}
	return acquirePlatformSingleInstance(ctx, manifest.InstanceKey(), paths, activate)
}

func validateInstanceDocumentPaths(paths []string) error {
	if len(paths) > 32 {
		return fmt.Errorf("App Mode activation contains too many document paths")
	}
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		if path == "" || len(path) > 4096 || strings.IndexByte(path, 0) >= 0 || !filepath.IsAbs(path) {
			return fmt.Errorf("App Mode activation contains an invalid document path")
		}
		if !strings.EqualFold(filepath.Ext(path), ".odflow") {
			return fmt.Errorf("App Mode activation contains an unsupported document path")
		}
		clean := filepath.Clean(path)
		if _, exists := seen[clean]; exists {
			return fmt.Errorf("App Mode activation contains duplicate document paths")
		}
		seen[clean] = struct{}{}
	}
	return nil
}
