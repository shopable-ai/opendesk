package appshell

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

const ManifestFileName = "opendesk.app.json"

var actionIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

type Manifest struct {
	Entry          string         `json:"entry"`
	SingleInstance bool           `json:"singleInstance"`
	Window         WindowManifest `json:"window,omitempty"`
	Tray           TrayManifest   `json:"tray,omitempty"`
}

type manifestJSON struct {
	Entry          string         `json:"entry"`
	SingleInstance *bool          `json:"singleInstance"`
	Window         WindowManifest `json:"window,omitempty"`
	Tray           TrayManifest   `json:"tray,omitempty"`
}

type WindowManifest struct {
	CloseBehavior string `json:"closeBehavior,omitempty"`
}

type TrayManifest struct {
	Enabled       bool       `json:"enabled"`
	Icon          string     `json:"icon,omitempty"`
	Tooltip       string     `json:"tooltip,omitempty"`
	PrimaryAction string     `json:"primaryAction,omitempty"`
	MenuMode      string     `json:"menuMode,omitempty"`
	Menu          []MenuItem `json:"menu,omitempty"`
}

type MenuItem struct {
	Type    string `json:"type,omitempty"`
	ID      string `json:"id,omitempty"`
	Label   string `json:"label,omitempty"`
	Action  string `json:"action,omitempty"`
	Enabled *bool  `json:"enabled,omitempty"`
	Visible *bool  `json:"visible,omitempty"`
}

func LoadManifest(packageDir string) (Manifest, error) {
	data, err := os.ReadFile(filepath.Join(packageDir, ManifestFileName))
	if err != nil {
		return Manifest{}, err
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func ParseManifest(data []byte) (Manifest, error) {
	var raw manifestJSON
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", ManifestFileName, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", ManifestFileName, err)
	}

	manifest := Manifest{
		Entry:          raw.Entry,
		SingleInstance: true,
		Window:         raw.Window,
		Tray:           raw.Tray,
	}
	if raw.SingleInstance != nil {
		manifest.SingleInstance = *raw.SingleInstance
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); errors.Is(err, io.EOF) {
		return nil
	} else if err != nil {
		return err
	}
	return errors.New("multiple JSON values are not allowed")
}

func (m *Manifest) Validate() error {
	entry, err := validateSafeRelativePath("entry", m.Entry, true)
	if err != nil {
		return err
	}
	m.Entry = entry

	if m.Window.CloseBehavior == "" {
		m.Window.CloseBehavior = "quit"
	}
	switch m.Window.CloseBehavior {
	case "hide", "quit":
	default:
		return fmt.Errorf("invalid window.closeBehavior %q: expected hide or quit", m.Window.CloseBehavior)
	}

	if m.Tray.MenuMode == "" {
		m.Tray.MenuMode = "merge"
	}
	if m.Tray.MenuMode != "merge" {
		return fmt.Errorf("invalid tray.menuMode %q: P0 supports only merge", m.Tray.MenuMode)
	}
	if m.Tray.Icon != "" {
		icon, err := validateSafeRelativePath("tray.icon", m.Tray.Icon, false)
		if err != nil {
			return err
		}
		m.Tray.Icon = icon
	}
	if m.Tray.PrimaryAction != "" {
		if err := validateActionID("tray.primaryAction", m.Tray.PrimaryAction, true); err != nil {
			return err
		}
	}
	if m.Window.CloseBehavior == "hide" && !m.Tray.Enabled {
		return errors.New("window.closeBehavior=hide requires tray.enabled=true so the hidden window has a reliable reopen path")
	}

	ids := make(map[string]struct{}, len(m.Tray.Menu))
	for i := range m.Tray.Menu {
		item := &m.Tray.Menu[i]
		field := fmt.Sprintf("tray.menu[%d]", i)
		switch item.Type {
		case "separator":
			if item.ID != "" || item.Label != "" || item.Action != "" || item.Enabled != nil || item.Visible != nil {
				return fmt.Errorf("%s: separator cannot define id, label, action, enabled, or visible", field)
			}
		case "":
			if strings.TrimSpace(item.ID) == "" {
				return fmt.Errorf("%s.id is required", field)
			}
			if strings.TrimSpace(item.Label) == "" {
				return fmt.Errorf("%s.label is required", field)
			}
			if err := validateActionID(field+".id", item.ID, false); err != nil {
				return err
			}
			if strings.TrimSpace(item.Action) == "" {
				if item.Enabled == nil || *item.Enabled {
					return fmt.Errorf("%s.action is required unless enabled=false", field)
				}
			} else if err := validateActionID(field+".action", item.Action, false); err != nil {
				return err
			}
			if _, exists := ids[item.ID]; exists {
				return fmt.Errorf("duplicate tray menu item id %q", item.ID)
			}
			ids[item.ID] = struct{}{}
		default:
			return fmt.Errorf("%s.type %q is invalid: expected separator or omitted", field, item.Type)
		}
	}
	return nil
}

func validateActionID(field, value string, allowBuiltins bool) error {
	value = strings.TrimSpace(value)
	if !actionIDPattern.MatchString(value) {
		return fmt.Errorf("%s %q is invalid", field, value)
	}
	if strings.HasPrefix(strings.ToLower(value), "opendesk.") {
		if allowBuiltins && (value == "opendesk.open" || value == "opendesk.quit") {
			return nil
		}
		return fmt.Errorf("%s %q uses reserved opendesk.* namespace", field, value)
	}
	return nil
}

func validateSafeRelativePath(field, value string, required bool) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		if required {
			return "", fmt.Errorf("%s is required", field)
		}
		return "", nil
	}
	if strings.ContainsRune(value, '\x00') {
		return "", fmt.Errorf("%s contains NUL", field)
	}

	portable := strings.ReplaceAll(value, "\\", "/")
	if path.IsAbs(portable) || filepath.IsAbs(value) || filepath.VolumeName(value) != "" || looksLikeWindowsDrivePath(portable) {
		return "", fmt.Errorf("%s must be a relative package path", field)
	}
	clean := path.Clean(portable)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("%s escapes the app package", field)
	}
	return clean, nil
}

func looksLikeWindowsDrivePath(value string) bool {
	return len(value) >= 2 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':'
}
