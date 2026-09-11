package appshell

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
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

const (
	ActionOpen     = "opendesk.open"
	ActionRecorder = "opendesk.recorder"
	ActionQuit     = "opendesk.quit"

	RecorderMenuLabel = "打开 Recorder"
)

var (
	actionIDPattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
	packageIDPattern = regexp.MustCompile(`^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)
	windowIDPattern  = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)
)

type Manifest struct {
	ID             string         `json:"id"`
	Entry          string         `json:"entry"`
	SingleInstance bool           `json:"singleInstance"`
	Window         WindowManifest `json:"window"`
	Tray           TrayManifest   `json:"tray"`
}

type WindowManifest struct {
	MainID        string `json:"mainId"`
	CloseBehavior string `json:"closeBehavior,omitempty"`
}

type TrayManifest struct {
	Enabled       bool       `json:"enabled"`
	Icons         TrayIcons  `json:"icons,omitempty"`
	Tooltip       string     `json:"tooltip,omitempty"`
	PrimaryAction string     `json:"primaryAction,omitempty"`
	MenuMode      string     `json:"menuMode,omitempty"`
	Menu          []MenuItem `json:"menu,omitempty"`
}

type TrayIcons struct {
	Windows string `json:"windows,omitempty"`
	MacOS   string `json:"macos,omitempty"`
}

type MenuItem struct {
	Type    string `json:"type,omitempty"`
	ID      string `json:"id,omitempty"`
	Label   string `json:"label,omitempty"`
	Action  string `json:"action,omitempty"`
	Enabled *bool  `json:"enabled,omitempty"`
	Visible *bool  `json:"visible,omitempty"`

	system bool
}

// Package is the fully resolved, startup-safe App Mode package. Every path is
// canonical and contained by Root; callers never re-resolve manifest paths
// against the process working directory.
type Package struct {
	Root            string
	ManifestPath    string
	EntryPath       string
	WindowsIconPath string
	MacOSIconPath   string
	Manifest        Manifest
}

func LoadManifest(packageDir string) (Manifest, error) {
	appPackage, err := LoadPackage(packageDir)
	if err != nil {
		return Manifest{}, err
	}
	return appPackage.Manifest, nil
}

func LoadPackage(packageDir string) (*Package, error) {
	root, err := canonicalPackageRoot(packageDir)
	if err != nil {
		return nil, err
	}
	manifestPath := filepath.Join(root, ManifestFileName)
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", manifestPath, err)
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		return nil, err
	}
	entryPath, err := resolvePackageFile(root, "entry", manifest.Entry)
	if err != nil {
		return nil, err
	}
	appPackage := &Package{Root: root, ManifestPath: manifestPath, EntryPath: entryPath, Manifest: manifest}
	if manifest.Tray.Enabled {
		appPackage.WindowsIconPath, err = resolvePackageFile(root, "tray.icons.windows", manifest.Tray.Icons.Windows)
		if err != nil {
			return nil, err
		}
		if err := validateWindowsTrayIcon(appPackage.WindowsIconPath); err != nil {
			return nil, fmt.Errorf("validate tray.icons.windows %s: %w", appPackage.WindowsIconPath, err)
		}
		appPackage.MacOSIconPath, err = resolvePackageFile(root, "tray.icons.macos", manifest.Tray.Icons.MacOS)
		if err != nil {
			return nil, err
		}
		if err := validateMacOSTemplateIcon(appPackage.MacOSIconPath); err != nil {
			return nil, fmt.Errorf("validate tray.icons.macos %s: %w", appPackage.MacOSIconPath, err)
		}
	}
	return appPackage, nil
}

func ParseManifest(data []byte) (Manifest, error) {
	type manifestWire struct {
		ID             string         `json:"id"`
		Entry          string         `json:"entry"`
		SingleInstance *bool          `json:"singleInstance"`
		Window         WindowManifest `json:"window"`
		Tray           TrayManifest   `json:"tray"`
	}
	var wire manifestWire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", ManifestFileName, err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return Manifest{}, fmt.Errorf("invalid %s: %w", ManifestFileName, err)
	}
	singleInstance := true
	if wire.SingleInstance != nil {
		singleInstance = *wire.SingleInstance
	}
	manifest := Manifest{ID: wire.ID, Entry: wire.Entry, SingleInstance: singleInstance, Window: wire.Window, Tray: wire.Tray}
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
	m.ID = strings.TrimSpace(m.ID)
	if !packageIDPattern.MatchString(m.ID) {
		return fmt.Errorf("id %q is invalid: expected a lowercase reverse-DNS package identity", m.ID)
	}
	entry, err := validateSafeRelativePath("entry", m.Entry, true)
	if err != nil {
		return err
	}
	m.Entry = entry

	m.Window.MainID = strings.TrimSpace(m.Window.MainID)
	if !windowIDPattern.MatchString(m.Window.MainID) {
		return fmt.Errorf("window.mainId %q is invalid: expected a stable Custom UI window id", m.Window.MainID)
	}
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
	if m.Tray.Enabled {
		windowsIcon, err := validateSafeRelativePath("tray.icons.windows", m.Tray.Icons.Windows, true)
		if err != nil {
			return err
		}
		if !strings.EqualFold(filepath.Ext(windowsIcon), ".ico") {
			return errors.New("tray.icons.windows must reference an .ico file")
		}
		macOSIcon, err := validateSafeRelativePath("tray.icons.macos", m.Tray.Icons.MacOS, true)
		if err != nil {
			return err
		}
		if !strings.EqualFold(filepath.Ext(macOSIcon), ".png") {
			return errors.New("tray.icons.macos must reference a .png template image")
		}
		m.Tray.Icons.Windows = windowsIcon
		m.Tray.Icons.MacOS = macOSIcon
	} else if m.Tray.Icons.Windows != "" || m.Tray.Icons.MacOS != "" || m.Tray.Tooltip != "" || m.Tray.PrimaryAction != "" || len(m.Tray.Menu) != 0 {
		return errors.New("tray configuration requires tray.enabled=true")
	}

	actions := make(map[string]struct{})
	ids := make(map[string]struct{}, len(m.Tray.Menu))
	for i := range m.Tray.Menu {
		item := &m.Tray.Menu[i]
		field := fmt.Sprintf("tray.menu[%d]", i)
		switch item.Type {
		case "separator":
			if item.ID != "" || item.Label != "" || item.Action != "" || item.Enabled != nil || item.Visible != nil {
				return fmt.Errorf("%s: separator must be exactly {\"type\":\"separator\"}", field)
			}
		case "":
			item.ID = strings.TrimSpace(item.ID)
			item.Label = strings.TrimSpace(item.Label)
			item.Action = strings.TrimSpace(item.Action)
			if item.ID == "" {
				return fmt.Errorf("%s.id is required", field)
			}
			if item.Label == "" {
				return fmt.Errorf("%s.label is required", field)
			}
			if err := validateActionID(field+".id", item.ID, item.system); err != nil {
				return err
			}
			if _, exists := ids[item.ID]; exists {
				return fmt.Errorf("duplicate tray menu item id %q", item.ID)
			}
			ids[item.ID] = struct{}{}
			if item.Action == "" {
				if item.Enabled == nil || *item.Enabled {
					return fmt.Errorf("%s without action must be permanently disabled", field)
				}
			} else {
				if err := validateActionID(field+".action", item.Action, item.system); err != nil {
					return err
				}
				actions[item.Action] = struct{}{}
			}
		default:
			return fmt.Errorf("%s.type %q is invalid: expected separator or omitted", field, item.Type)
		}
	}

	m.Tray.PrimaryAction = strings.TrimSpace(m.Tray.PrimaryAction)
	if m.Tray.Enabled {
		if m.Tray.PrimaryAction == "" {
			return errors.New("tray.primaryAction is required when tray is enabled")
		}
		if err := validateActionID("tray.primaryAction", m.Tray.PrimaryAction, true); err != nil {
			return err
		}
		if m.Tray.PrimaryAction == ActionQuit {
			return fmt.Errorf("tray.primaryAction cannot be %s", ActionQuit)
		}
		if m.Tray.PrimaryAction != ActionOpen {
			if _, ok := actions[m.Tray.PrimaryAction]; !ok {
				return fmt.Errorf("tray.primaryAction %q does not reference a declared business action", m.Tray.PrimaryAction)
			}
		}
	}
	if m.Window.CloseBehavior == "hide" && (!m.Tray.Enabled || m.Tray.PrimaryAction != ActionOpen) {
		return fmt.Errorf("window.closeBehavior=hide requires tray.enabled=true and tray.primaryAction=%s", ActionOpen)
	}
	return nil
}

func (m Manifest) InstanceKey() string {
	sum := sha256.Sum256([]byte(m.ID))
	return hex.EncodeToString(sum[:])
}

func (m Manifest) MenuAction(itemID string) (string, bool) {
	for _, item := range m.Tray.Menu {
		if item.Type == "" && item.ID == itemID {
			return item.Action, item.Action != ""
		}
	}
	return "", false
}

func (m Manifest) StatusOnlyMenuItem(itemID string) bool {
	for _, item := range m.Tray.Menu {
		if item.Type == "" && item.ID == itemID {
			return item.Action == ""
		}
	}
	return false
}

func EnsureRecorderMenu(manifest Manifest) Manifest {
	if !manifest.Tray.Enabled {
		return manifest
	}
	for _, item := range manifest.Tray.Menu {
		if item.Type == "" && item.ID == ActionRecorder {
			return manifest
		}
	}
	recorder := MenuItem{ID: ActionRecorder, Label: RecorderMenuLabel, Action: ActionRecorder, system: true}
	if len(manifest.Tray.Menu) == 0 {
		manifest.Tray.Menu = []MenuItem{recorder}
		return manifest
	}
	menu := make([]MenuItem, 0, len(manifest.Tray.Menu)+2)
	menu = append(menu, recorder)
	if manifest.Tray.Menu[0].Type != "separator" {
		menu = append(menu, MenuItem{Type: "separator"})
	}
	menu = append(menu, manifest.Tray.Menu...)
	manifest.Tray.Menu = menu
	return manifest
}

func validateActionID(field, value string, allowBuiltins bool) error {
	value = strings.TrimSpace(value)
	if !actionIDPattern.MatchString(value) {
		return fmt.Errorf("%s %q is invalid", field, value)
	}
	if strings.HasPrefix(strings.ToLower(value), "opendesk.") {
		if allowBuiltins && isBuiltinAction(value) {
			return nil
		}
		return fmt.Errorf("%s %q uses reserved opendesk.* namespace", field, value)
	}
	return nil
}

func isBuiltinAction(value string) bool {
	switch value {
	case ActionOpen, ActionRecorder, ActionQuit:
		return true
	default:
		return false
	}
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

func canonicalPackageRoot(packageDir string) (string, error) {
	value := strings.TrimSpace(packageDir)
	if value == "" {
		return "", errors.New("-app directory is required")
	}
	abs, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve app package root: %w", err)
	}
	root, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("resolve app package root symlinks: %w", err)
	}
	info, err := os.Stat(root)
	if err != nil {
		return "", fmt.Errorf("stat app package root: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("app package root is not a directory: %s", root)
	}
	return filepath.Clean(root), nil
}

func resolvePackageFile(root, field, relative string) (string, error) {
	joined := filepath.Join(root, filepath.FromSlash(relative))
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", field, err)
	}
	contained, err := filepath.Rel(root, resolved)
	if err != nil || contained == ".." || strings.HasPrefix(contained, ".."+string(filepath.Separator)) || filepath.IsAbs(contained) {
		return "", fmt.Errorf("%s escapes the app package through a symlink", field)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("stat %s: %w", field, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%s must reference a regular file", field)
	}
	return filepath.Clean(resolved), nil
}

func looksLikeWindowsDrivePath(value string) bool {
	return len(value) >= 2 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':'
}
