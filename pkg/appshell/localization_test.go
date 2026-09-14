package appshell

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/localization"
)

func TestManifestMenuItemLabelKeyIsAdditiveInSchemaV1(t *testing.T) {
	manifestJSON := `{
		"schemaVersion":1,
		"id":"com.example.localized",
		"version":"1.0.0",
		"entry":"main.js",
		"window":{"mainId":"main"},
		"tray":{
			"enabled":true,
			"icons":{"windows":"assets/tray.ico","macos":"assets/tray.png"},
			"primaryAction":"opendesk.open",
			"menu":[{"id":"hello","labelKey":"menu.hello","label":"Legacy hello","action":"hello"}]
		}
	}`
	manifest, err := ParseManifest([]byte(manifestJSON))
	if err != nil {
		t.Fatal(err)
	}
	item := manifest.Tray.Menu[0]
	if item.LabelKey != "menu.hello" || item.Label != "Legacy hello" || item.Action != "hello" {
		t.Fatalf("unexpected localized menu item: %+v", item)
	}
	if manifest.SchemaVersion != 1 {
		t.Fatalf("schemaVersion=%d, want 1", manifest.SchemaVersion)
	}
}

func TestManifestMenuItemMayUseLabelKeyWithoutLegacyLabel(t *testing.T) {
	manifest := Manifest{
		SchemaVersion: 1,
		ID:            "com.example.localized",
		Version:       "1.0.0",
		Entry:         "main.js",
		Window:        WindowManifest{MainID: "main"},
		Tray: TrayManifest{
			Enabled:       true,
			Icons:         TrayIcons{Windows: "assets/tray.ico", MacOS: "assets/tray.png"},
			PrimaryAction: ActionOpen,
			Menu: []MenuItem{{ID: "hello", LabelKey: "menu.hello", Action: "hello"}},
		},
	}
	if err := manifest.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestLegacyManifestLabelOnlyRemainsCompatible(t *testing.T) {
	manifest := Manifest{
		SchemaVersion: 1,
		ID:            "com.example.legacy-label",
		Version:       "1.0.0",
		Entry:         "main.js",
		Window:        WindowManifest{MainID: "main"},
		Tray: TrayManifest{
			Enabled:       true,
			Icons:         TrayIcons{Windows: "assets/tray.ico", MacOS: "assets/tray.png"},
			PrimaryAction: ActionOpen,
			Menu: []MenuItem{{ID: "hello", Label: "Legacy hello", Action: "hello"}},
		},
	}
	if err := manifest.Validate(); err != nil {
		t.Fatal(err)
	}
	if got := ResolveMenuLabel(manifest.Tray.Menu[0]); got != "Legacy hello" {
		t.Fatalf("legacy label resolved as %q", got)
	}
}

func TestResolveMenuLabelUsesCurrentThenProductFallbackThenLegacy(t *testing.T) {
	catalogDir := t.TempDir()
	writeAppShellCatalog(t, catalogDir, localization.LocaleZhCN, map[string]string{
		"menu.fallback": "中文回退",
	})
	writeAppShellCatalog(t, catalogDir, localization.LocaleEnUS, map[string]string{
		"menu.current": "Current locale",
	})
	localization.ConfigureDefault(localization.Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(localization.Diagnostic) {},
	})

	if got := ResolveMenuLabel(MenuItem{LabelKey: "menu.current", Label: "Legacy"}); got != "Current locale" {
		t.Fatalf("current locale label=%q", got)
	}
	if got := ResolveMenuLabel(MenuItem{LabelKey: "menu.fallback", Label: "Legacy"}); got != "中文回退" {
		t.Fatalf("product fallback label=%q", got)
	}
	if got := ResolveMenuLabel(MenuItem{LabelKey: "menu.missing", Label: "Legacy"}); got != "Legacy" {
		t.Fatalf("legacy fallback label=%q", got)
	}
	if got := ResolveMenuLabel(MenuItem{LabelKey: "menu.missing"}); got != "menu.missing" {
		t.Fatalf("safe key fallback=%q", got)
	}
}

func TestLocalizedManifestKeepsStableActionID(t *testing.T) {
	manifest := Manifest{Tray: TrayManifest{Menu: []MenuItem{{ID: "open-center", LabelKey: "menu.schedulerCenter", Label: "计划中心", Action: "scheduler.center"}}}}
	if action, ok := manifest.MenuAction("open-center"); !ok || action != "scheduler.center" {
		t.Fatalf("MenuAction=%q ok=%v", action, ok)
	}
}

func writeAppShellCatalog(t *testing.T, root, locale string, values map[string]string) {
	t.Helper()
	data, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, locale+".json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}
