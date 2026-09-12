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

	"opendesk/pkg/runtimeversion"
)

const ManifestFileName = "opendesk.app.json"
const CurrentManifestSchemaVersion = 1

const (
	ActionOpen     = "opendesk.open"
	ActionRecorder = "opendesk.recorder"
	ActionQuit     = "opendesk.quit"

	RecorderMenuLabel = "打开 Recorder"
)

var (
	actionIDPattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
	packageIDPattern  = regexp.MustCompile(`^[a-z](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)
	windowIDPattern   = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)
	capabilityPattern = regexp.MustCompile(`^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$`)
)

type Manifest struct {
	SchemaVersion  int                          `json:"schemaVersion,omitempty"`
	ID             string                       `json:"id"`
	Version        string                       `json:"version,omitempty"`
	Name           string                       `json:"name,omitempty"`
	Runtime        RuntimeCompatibilityManifest `json:"runtime,omitempty"`
	Entry          string                       `json:"entry"`
	SingleInstance bool                         `json:"singleInstance"`
	Window         WindowManifest               `json:"window"`
	Tray           TrayManifest                 `json:"tray"`
	Capabilities   []string                     `json:"capabilities,omitempty"`
}

type RuntimeCompatibilityManifest struct {
	MinVersion string `json:"minVersion,omitempty"`
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
		code := ErrManifestInvalid
		fix := "make sure the package contains a readable opendesk.app.json"
		if os.IsNotExist(err) {
			code = ErrManifestNotFound
			fix = "add opendesk.app.json at the package root"
		}
		return nil, newPackageError(code, ManifestFileName, "a readable manifest file", manifestPath, fix, fmt.Errorf("read %s: %w", manifestPath, err))
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		return nil, err
	}
	if err := ValidateRuntimeCompatibility(manifest, runtimeversion.Current); err != nil {
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
			cause := fmt.Errorf("validate tray.icons.windows %s: %w", appPackage.WindowsIconPath, err)
			return nil, newPackageError(ErrPackageResourceInvalid, "tray.icons.windows", "a valid Windows .ico file", appPackage.WindowsIconPath, "replace the invalid tray icon with a valid package-local .ico resource", cause)
		}
		appPackage.MacOSIconPath, err = resolvePackageFile(root, "tray.icons.macos", manifest.Tray.Icons.MacOS)
		if err != nil {
			return nil, err
		}
		if err := validateMacOSTemplateIcon(appPackage.MacOSIconPath); err != nil {
			cause := fmt.Errorf("validate tray.icons.macos %s: %w", appPackage.MacOSIconPath, err)
			return nil, newPackageError(ErrPackageResourceInvalid, "tray.icons.macos", "a valid macOS template PNG", appPackage.MacOSIconPath, "replace the invalid tray icon with a valid package-local template PNG", cause)
		}
	}
	return appPackage, nil
}

func ParseManifest(data []byte) (Manifest, error) {
	schemaVersion, hasSchemaVersion, err := detectManifestSchemaVersion(data)
	if err != nil {
		field := "manifest"
		expected := "one valid JSON object"
		fix := "fix the manifest JSON syntax and keep exactly one JSON object"
		if hasSchemaVersion {
			field = "schemaVersion"
			expected = "an integer when present"
			fix = "set schemaVersion to an integer supported by this OpenDesk Runtime"
		}
		return Manifest{}, newPackageError(ErrManifestInvalid, field, expected, "invalid", fix, fmt.Errorf("invalid %s: %w", ManifestFileName, err))
	}
	if hasSchemaVersion && schemaVersion != CurrentManifestSchemaVersion {
		return Manifest{}, newPackageError(
			ErrManifestSchemaUnsupported,
			"schemaVersion",
			fmt.Sprintf("%d", CurrentManifestSchemaVersion),
			fmt.Sprintf("%d", schemaVersion),
			"upgrade OpenDesk for a newer manifest schema or publish the app using a supported schemaVersion",
			fmt.Errorf("unsupported %s schemaVersion %d", ManifestFileName, schemaVersion),
		)
	}

	type manifestWire struct {
		SchemaVersion  *int                         `json:"schemaVersion"`
		ID             string                       `json:"id"`
		Version        string                       `json:"version"`
		Name           string                       `json:"name"`
		Runtime        RuntimeCompatibilityManifest `json:"runtime"`
		Entry          string                       `json:"entry"`
		SingleInstance *bool                        `json:"singleInstance"`
		Window         WindowManifest               `json:"window"`
		Tray           TrayManifest                 `json:"tray"`
		Capabilities   []string                     `json:"capabilities"`
	}
	var wire manifestWire
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return Manifest{}, newPackageError(ErrManifestInvalid, "manifest", "only documented schema fields", "invalid", "remove unknown fields or fix the JSON syntax", fmt.Errorf("invalid %s: %w", ManifestFileName, err))
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return Manifest{}, newPackageError(ErrManifestInvalid, "manifest", "one JSON object", "multiple values", "keep exactly one JSON object in opendesk.app.json", fmt.Errorf("invalid %s: %w", ManifestFileName, err))
	}
	singleInstance := true
	if wire.SingleInstance != nil {
		singleInstance = *wire.SingleInstance
	}
	manifest := Manifest{
		ID:             wire.ID,
		Version:        wire.Version,
		Name:           wire.Name,
		Runtime:        wire.Runtime,
		Entry:          wire.Entry,
		SingleInstance: singleInstance,
		Window:         wire.Window,
		Tray:           wire.Tray,
		Capabilities:   wire.Capabilities,
	}
	if wire.SchemaVersion != nil {
		manifest.SchemaVersion = *wire.SchemaVersion
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func detectManifestSchemaVersion(data []byte) (int, bool, error) {
	var envelope map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&envelope); err != nil {
		return 0, false, err
	}
	if envelope == nil {
		return 0, false, errors.New("manifest must be a JSON object")
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return 0, false, err
	}
	raw, ok := envelope["schemaVersion"]
	if !ok {
		return 0, false, nil
	}
	var version int
	if err := json.Unmarshal(raw, &version); err != nil {
		return 0, true, err
	}
	return version, true, nil
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
	if err := m.validateContractMetadata(); err != nil {
		return err
	}

	m.ID = strings.TrimSpace(m.ID)
	if len(m.ID) > 255 || !packageIDPattern.MatchString(m.ID) || !validPackageIDSegments(m.ID) {
		cause := fmt.Errorf("id %q is invalid: expected a lowercase reverse-DNS package identity", m.ID)
		return newPackageError(ErrPackageIDInvalid, "id", "lowercase reverse-DNS identity, max 255 bytes and 63 bytes per segment", packageErrorActual(m.ID), "use a stable value such as com.example.my-app", cause)
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
			return newPackageError(ErrPackageResourceInvalid, "tray.icons.windows", "a package-local .ico path", windowsIcon, "use a Windows .ico tray resource", errors.New("tray.icons.windows must reference an .ico file"))
		}
		macOSIcon, err := validateSafeRelativePath("tray.icons.macos", m.Tray.Icons.MacOS, true)
		if err != nil {
			return err
		}
		if !strings.EqualFold(filepath.Ext(macOSIcon), ".png") {
			return newPackageError(ErrPackageResourceInvalid, "tray.icons.macos", "a package-local .png path", macOSIcon, "use a macOS template PNG tray resource", errors.New("tray.icons.macos must reference a .png template image"))
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

func (m *Manifest) validateContractMetadata() error {
	switch m.SchemaVersion {
	case 0:
		if m.Version != "" || m.Name != "" || m.Runtime.MinVersion != "" || len(m.Capabilities) != 0 {
			return newPackageError(ErrManifestSchemaUnsupported, "schemaVersion", "1 when versioned package metadata is used", "missing", "add \"schemaVersion\": 1 or remove v1-only metadata", errors.New("legacy manifest cannot use version, name, runtime, or capabilities fields"))
		}
	case CurrentManifestSchemaVersion:
		m.Version = strings.TrimSpace(m.Version)
		if _, ok := parseSemVersion(m.Version); !ok {
			return newPackageError(ErrPackageVersionInvalid, "version", "SemVer such as 1.0.0", packageErrorActual(m.Version), "set version to a valid SemVer without a leading v", fmt.Errorf("version %q is invalid", m.Version))
		}
		if m.Name != "" {
			m.Name = strings.TrimSpace(m.Name)
			if m.Name == "" || len(m.Name) > 128 {
				return newPackageError(ErrManifestInvalid, "name", "1-128 bytes when present", m.Name, "use a short human-readable application name", fmt.Errorf("name %q is invalid", m.Name))
			}
		}
		m.Runtime.MinVersion = strings.TrimSpace(m.Runtime.MinVersion)
		if m.Runtime.MinVersion != "" {
			if _, ok := parseSemVersion(m.Runtime.MinVersion); !ok {
				return newPackageError(ErrManifestInvalid, "runtime.minVersion", "SemVer such as 0.1.0", m.Runtime.MinVersion, "set runtime.minVersion to a valid SemVer without a leading v", fmt.Errorf("runtime.minVersion %q is invalid", m.Runtime.MinVersion))
			}
		}
		seen := make(map[string]struct{}, len(m.Capabilities))
		for i := range m.Capabilities {
			capability := strings.TrimSpace(m.Capabilities[i])
			field := fmt.Sprintf("capabilities[%d]", i)
			if !capabilityPattern.MatchString(capability) {
				return newPackageError(ErrPackageCapabilityInvalid, field, "a lowercase capability token", packageErrorActual(capability), "use a stable token such as custom-ui or desktop-automation", fmt.Errorf("capability %q is invalid", capability))
			}
			if _, exists := seen[capability]; exists {
				return newPackageError(ErrPackageCapabilityInvalid, field, "unique capability tokens", capability, "remove the duplicate capability", fmt.Errorf("duplicate capability %q", capability))
			}
			seen[capability] = struct{}{}
			m.Capabilities[i] = capability
		}
	default:
		return newPackageError(ErrManifestSchemaUnsupported, "schemaVersion", fmt.Sprintf("%d", CurrentManifestSchemaVersion), fmt.Sprintf("%d", m.SchemaVersion), "upgrade OpenDesk or publish using a supported schemaVersion", fmt.Errorf("unsupported %s schemaVersion %d", ManifestFileName, m.SchemaVersion))
	}
	return nil
}

func ValidateRuntimeCompatibility(manifest Manifest, currentRuntimeVersion string) error {
	minimum := strings.TrimSpace(manifest.Runtime.MinVersion)
	if minimum == "" {
		return nil
	}
	required, ok := parseSemVersion(minimum)
	if !ok {
		return newPackageError(ErrManifestInvalid, "runtime.minVersion", "SemVer", minimum, "fix runtime.minVersion in opendesk.app.json", fmt.Errorf("runtime.minVersion %q is invalid", minimum))
	}
	currentRuntimeVersion = strings.TrimSpace(currentRuntimeVersion)
	current, ok := parseSemVersion(currentRuntimeVersion)
	if !ok {
		return newPackageError(ErrRuntimeVersionInvalid, "runtime", "a versioned OpenDesk Runtime", packageErrorActual(currentRuntimeVersion), "use an official versioned OpenDesk build", fmt.Errorf("OpenDesk Runtime version %q is invalid", currentRuntimeVersion))
	}
	if compareSemVersion(current, required) < 0 {
		return newPackageError(ErrRuntimeTooOld, "runtime.minVersion", ">="+minimum, currentRuntimeVersion, "upgrade OpenDesk before running this app package", fmt.Errorf("OpenDesk Runtime %s is older than required %s", currentRuntimeVersion, minimum))
	}
	return nil
}

func validPackageIDSegments(value string) bool {
	for _, segment := range strings.Split(value, ".") {
		if len(segment) == 0 || len(segment) > 63 {
			return false
		}
	}
	return true
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
			code := ErrPackageResourceMissing
			fix := "provide a package-local resource path"
			if field == "entry" {
				code = ErrPackageEntryMissing
				fix = "set entry to the package-local JavaScript entry file"
			}
			cause := fmt.Errorf("%s is required", field)
			return "", newPackageError(code, field, "a package-relative path", "empty", fix, cause)
		}
		return "", nil
	}
	if strings.ContainsRune(value, '\x00') {
		cause := fmt.Errorf("%s contains NUL", field)
		return "", newPackageError(ErrPackageResourceInvalid, field, "a portable package-relative path", value, "remove NUL characters from the path", cause)
	}
	portable := strings.ReplaceAll(value, "\\", "/")
	if path.IsAbs(portable) || filepath.IsAbs(value) || filepath.VolumeName(value) != "" || looksLikeWindowsDrivePath(portable) {
		cause := fmt.Errorf("%s must be a relative package path", field)
		return "", newPackageError(ErrPackageResourceEscape, field, "a path inside the package root", value, "use a relative path such as main.js or assets/tray.png", cause)
	}
	clean := path.Clean(portable)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		cause := fmt.Errorf("%s escapes the app package", field)
		return "", newPackageError(ErrPackageResourceEscape, field, "a path inside the package root", value, "remove parent-directory traversal from the path", cause)
	}
	return clean, nil
}

func canonicalPackageRoot(packageDir string) (string, error) {
	value := strings.TrimSpace(packageDir)
	if value == "" {
		return "", newPackageError(ErrPackageRootInvalid, "packageRoot", "an App Mode package directory", "empty", "pass -app <directory>", errors.New("-app directory is required"))
	}
	abs, err := filepath.Abs(value)
	if err != nil {
		return "", newPackageError(ErrPackageRootInvalid, "packageRoot", "a resolvable directory", value, "pass an existing package directory", fmt.Errorf("resolve app package root: %w", err))
	}
	root, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", newPackageError(ErrPackageRootInvalid, "packageRoot", "an existing directory", abs, "pass an existing package directory", fmt.Errorf("resolve app package root symlinks: %w", err))
	}
	info, err := os.Stat(root)
	if err != nil {
		return "", newPackageError(ErrPackageRootInvalid, "packageRoot", "an existing directory", root, "pass an existing package directory", fmt.Errorf("stat app package root: %w", err))
	}
	if !info.IsDir() {
		return "", newPackageError(ErrPackageRootInvalid, "packageRoot", "a directory", root, "pass the package directory rather than a file", fmt.Errorf("app package root is not a directory: %s", root))
	}
	return filepath.Clean(root), nil
}

func resolvePackageFile(root, field, relative string) (string, error) {
	joined := filepath.Join(root, filepath.FromSlash(relative))
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil {
		code, fix := missingPackageFileError(field)
		return "", newPackageError(code, field, "an existing package-local regular file", packageErrorActual(relative), fix, fmt.Errorf("resolve %s: %w", field, err))
	}
	contained, err := filepath.Rel(root, resolved)
	if err != nil || contained == ".." || strings.HasPrefix(contained, ".."+string(filepath.Separator)) || filepath.IsAbs(contained) {
		cause := fmt.Errorf("%s escapes the app package through a symlink", field)
		return "", newPackageError(ErrPackageResourceEscape, field, "a real path inside the package root", relative, "replace the escaping symlink with a package-local file", cause)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		code, fix := missingPackageFileError(field)
		return "", newPackageError(code, field, "an existing package-local regular file", packageErrorActual(relative), fix, fmt.Errorf("stat %s: %w", field, err))
	}
	if !info.Mode().IsRegular() {
		cause := fmt.Errorf("%s must reference a regular file", field)
		return "", newPackageError(ErrPackageResourceInvalid, field, "a regular file", relative, "reference a regular file rather than a directory or special file", cause)
	}
	return filepath.Clean(resolved), nil
}

func missingPackageFileError(field string) (string, string) {
	if field == "entry" {
		return ErrPackageEntryMissing, "add the entry file inside the app package"
	}
	return ErrPackageResourceMissing, "add the referenced file inside the app package"
}

func packageErrorActual(value string) string {
	if value == "" {
		return "empty"
	}
	return value
}

func looksLikeWindowsDrivePath(value string) bool {
	return len(value) >= 2 && ((value[0] >= 'A' && value[0] <= 'Z') || (value[0] >= 'a' && value[0] <= 'z')) && value[1] == ':'
}
