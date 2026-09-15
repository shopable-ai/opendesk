package appshell

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

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
			Menu:          []MenuItem{{ID: "hello", LabelKey: "menu.hello", Action: "hello"}},
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
			Menu:          []MenuItem{{ID: "hello", Label: "Legacy hello", Action: "hello"}},
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

func TestLocalizedMenuValidationRejectsInvalidPresentation(t *testing.T) {
	base := func(item MenuItem) Manifest {
		return Manifest{
			SchemaVersion: 1,
			ID:            "com.example.localized",
			Version:       "1.0.0",
			Entry:         "main.js",
			Window:        WindowManifest{MainID: "main"},
			Tray: TrayManifest{
				Enabled:       true,
				Icons:         TrayIcons{Windows: "assets/tray.ico", MacOS: "assets/tray.png"},
				PrimaryAction: ActionOpen,
				Menu:          []MenuItem{item},
			},
		}
	}
	for _, test := range []struct {
		name string
		item MenuItem
	}{
		{name: "invalid labelKey", item: MenuItem{ID: "hello", LabelKey: "menu invalid", Action: "hello"}},
		{name: "normal item without presentation", item: MenuItem{ID: "hello", Action: "hello"}},
		{name: "separator with labelKey", item: MenuItem{Type: "separator", LabelKey: "menu.hello"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			manifest := base(test.item)
			if err := manifest.Validate(); err == nil {
				t.Fatal("expected localized menu validation failure")
			}
		})
	}
}

func TestOfficialCatalogsHaveMatchingL0MenuKeys(t *testing.T) {
	catalogDir := filepath.Join("..", "..", "apps", "opendesk", "locales")
	loadCatalog := func(locale string) map[string]string {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(catalogDir, locale+".json"))
		if err != nil {
			t.Fatal(err)
		}
		values := make(map[string]string)
		if err := json.Unmarshal(data, &values); err != nil {
			t.Fatal(err)
		}
		return values
	}
	zhCN := loadCatalog(localization.LocaleZhCN)
	enUS := loadCatalog(localization.LocaleEnUS)
	required := []string{
		"menu.open", "menu.assistant", "menu.recorder", "menu.schedulerCenter", "menu.newSchedule",
		"menu.permissions", "menu.runtimeLog", "menu.examples", "menu.apiDocs", "menu.developer",
		"menu.runtimeStatus", "menu.measurement", "menu.inspector", "menu.logs", "menu.debug",
		"menu.debugNormal", "menu.debugDetailed", "menu.helpAndSupport", "menu.website", "menu.help",
		"menu.customize", "menu.language", "menu.language.auto", "menu.language.zhCN", "menu.language.enUS",
		"menu.quit",
	}
	for _, key := range required {
		if strings.TrimSpace(zhCN[key]) == "" || strings.TrimSpace(enUS[key]) == "" {
			t.Fatalf("required L0 menu key %q is missing from zh-CN or en-US", key)
		}
	}
	for key := range zhCN {
		if strings.HasPrefix(key, "menu.") && strings.TrimSpace(enUS[key]) == "" {
			t.Fatalf("zh-CN menu key %q is missing from en-US", key)
		}
	}
	for key := range enUS {
		if strings.HasPrefix(key, "menu.") && strings.TrimSpace(zhCN[key]) == "" {
			t.Fatalf("en-US menu key %q is missing from zh-CN", key)
		}
	}
}

func TestOfficialManifestLocalizationRetainsMachineActions(t *testing.T) {
	appPackage, err := LoadPackage(filepath.Join("..", "..", "apps", "opendesk"))
	if err != nil {
		t.Fatal(err)
	}
	if appPackage.Manifest.SchemaVersion != CurrentManifestSchemaVersion {
		t.Fatalf("schemaVersion=%d, want %d", appPackage.Manifest.SchemaVersion, CurrentManifestSchemaVersion)
	}
	wantActions := map[string]string{
		"open-ai-assistant":     "assistant.open",
		"open-scheduler-center": "scheduler.center",
		"new-schedule":          "scheduler.new",
		"open-permissions":      "permissions.open",
		"open-runtime-log":      "runtime.log",
		"open-examples":         ActionProductExamples,
		"open-api-docs":         ActionProductAPIDocs,
	}
	for id, want := range wantActions {
		if got, ok := appPackage.Manifest.MenuAction(id); !ok || got != want {
			t.Fatalf("menu %s action=%q ok=%t, want %q", id, got, ok, want)
		}
	}
}

func TestNativeHostLocalizationConfigurationIsLimitedToLocalizedPresentation(t *testing.T) {
	for _, test := range []struct {
		name     string
		manifest Manifest
		want     bool
	}{
		{name: "official product", manifest: Manifest{ID: OpenDeskProductPackageID}, want: true},
		{name: "third-party label key", manifest: Manifest{ID: "com.example.localized", Tray: TrayManifest{Menu: []MenuItem{{LabelKey: "menu.open"}}}}, want: true},
		{name: "legacy third-party menu", manifest: Manifest{ID: "com.example.legacy", Tray: TrayManifest{Menu: []MenuItem{{Label: "Open"}}}}, want: false},
		{name: "third-party app without tray", manifest: Manifest{ID: "com.example.no-tray"}, want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := shouldConfigureLocalization(test.manifest); got != test.want {
				t.Fatalf("shouldConfigureLocalization(%+v)=%t, want %t", test.manifest, got, test.want)
			}
		})
	}

	productManager := localization.ConfigureDefault(localization.Options{
		CatalogDir:     filepath.Join("..", "..", "apps", "opendesk", "locales"),
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return localization.LocaleZhCN, nil },
		Diagnostics:    func(localization.Diagnostic) {},
	})
	appPackage := &Package{
		Root: t.TempDir(),
		Manifest: Manifest{
			ID:   "com.example.no-tray",
			Tray: TrayManifest{Enabled: false},
		},
	}
	host, err := NewNativeHost(appPackage)
	if err != nil {
		t.Fatal(err)
	}
	if host != nil {
		t.Fatalf("native host=%T, want nil for disabled tray", host)
	}
	if got := localization.Default(); got != productManager {
		t.Fatal("an unlocalized App Mode package replaced the product locale manager")
	}
}

// recordingLocalizedNative is an in-memory native backend. It mirrors the
// platform hosts' patch semantics so this test can prove that a locale refresh
// changes presentation only, without needing a Desktop session.
type recordingLocalizedNative struct {
	mu      sync.Mutex
	handler func(string, string)
	items   map[string]MenuItemPatch
	updates []localizedNativeUpdate
}

type localizedNativeUpdate struct {
	id    string
	patch MenuItemPatch
}

func newRecordingLocalizedNative(items []nativeMenuItem) *recordingLocalizedNative {
	native := &recordingLocalizedNative{items: make(map[string]MenuItemPatch)}
	visitNativeMenu(items, func(item nativeMenuItem) {
		if item.Type == "separator" || item.ID == "" {
			return
		}
		label := item.Label
		enabled, visible := true, true
		if item.Enabled != nil {
			enabled = *item.Enabled
		}
		if item.Visible != nil {
			visible = *item.Visible
		}
		native.items[item.ID] = MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}
	})
	return native
}

func (n *recordingLocalizedNative) Start(_ context.Context, handler func(string, string)) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.handler = handler
	return nil
}

func (n *recordingLocalizedNative) Activate(context.Context) error { return nil }

func (n *recordingLocalizedNative) UpdateMenuItem(_ context.Context, id string, patch MenuItemPatch) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	state, ok := n.items[id]
	if !ok {
		return os.ErrNotExist
	}
	if patch.Label != nil {
		label := *patch.Label
		state.Label = &label
	}
	if patch.Enabled != nil {
		enabled := *patch.Enabled
		state.Enabled = &enabled
	}
	if patch.Visible != nil {
		visible := *patch.Visible
		state.Visible = &visible
	}
	n.items[id] = state
	n.updates = append(n.updates, localizedNativeUpdate{id: id, patch: patch})
	return nil
}

func (n *recordingLocalizedNative) Teardown(context.Context) error { return nil }
func (n *recordingLocalizedNative) Wait()                          {}

func (n *recordingLocalizedNative) dispatch(id string) {
	n.mu.Lock()
	handler := n.handler
	n.mu.Unlock()
	if handler == nil {
		panic("localized native handler was not installed")
	}
	handler(id, "tray-menu")
}

func (n *recordingLocalizedNative) resetUpdates() {
	n.mu.Lock()
	n.updates = nil
	n.mu.Unlock()
}

func (n *recordingLocalizedNative) snapshot(id string) (MenuItemPatch, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	state, ok := n.items[id]
	return state, ok
}

func (n *recordingLocalizedNative) updatesSinceReset() []localizedNativeUpdate {
	n.mu.Lock()
	defer n.mu.Unlock()
	return append([]localizedNativeUpdate(nil), n.updates...)
}

func TestLocalizedNativeHostConsumesLocaleActionsAndPreservesRuntimeMenuState(t *testing.T) {
	appPackage, err := LoadPackage(filepath.Join("..", "..", "apps", "opendesk"))
	if err != nil {
		t.Fatal(err)
	}
	preferencePath := filepath.Join(t.TempDir(), "preferences.json")
	manager := localization.ConfigureDefault(localization.Options{
		CatalogDir:     filepath.Join("..", "..", "apps", "opendesk", "locales"),
		PreferencePath: preferencePath,
		SystemLocale:   func() (string, error) { return localization.LocaleZhCN, nil },
		Diagnostics:    func(localization.Diagnostic) {},
	})
	// App Shell composition consumes the process-wide default manager. Restore
	// the product-default test baseline so this concurrent-unaware legacy seam
	// cannot leak the final en-US selection into later package tests.
	restorePreferencePath := filepath.Join(t.TempDir(), "restore-preferences.json")
	t.Cleanup(func() {
		localization.ConfigureDefault(localization.Options{
			PreferencePath: restorePreferencePath,
			SystemLocale:   func() (string, error) { return localization.LocaleZhCN, nil },
			Diagnostics:    func(localization.Diagnostic) {},
		})
	})
	native := newRecordingLocalizedNative(nativeMenuForManifest(appPackage.Manifest))
	host, ok := newLocalizedNativeHost(appPackage.Manifest, native, manager).(*localizedNativeHost)
	if !ok {
		t.Fatal("official OpenDesk package was not wrapped with localized native host")
	}
	var businessActions []string
	if err := host.Start(context.Background(), func(id, _ string) { businessActions = append(businessActions, id) }); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := host.Teardown(context.Background()); err != nil {
			t.Error(err)
		}
	})

	disabled, hidden := false, false
	dynamic := "Runtime-owned dynamic label"
	detailed := "✓ Detailed"
	for _, update := range []struct {
		id    string
		patch MenuItemPatch
	}{
		{id: "open-ai-assistant", patch: MenuItemPatch{Label: &dynamic}},
		{id: "open-permissions", patch: MenuItemPatch{Enabled: &disabled}},
		{id: "open-runtime-log", patch: MenuItemPatch{Visible: &hidden}},
		{id: ActionProductDebugDetailed, patch: MenuItemPatch{Label: &detailed}},
	} {
		if err := host.UpdateMenuItem(context.Background(), update.id, update.patch); err != nil {
			t.Fatal(err)
		}
	}
	native.resetUpdates()

	testCases := []struct {
		action           string
		preference       string
		resolved         string
		openLabel        string
		developerLabel   string
		debugDetail      string
		selectedLocale   string
		unselectedLocale string
	}{
		{ActionLocaleZhCN, localization.LocaleZhCN, localization.LocaleZhCN, "显示主窗口", "开发者", "✓ 详细", ActionLocaleZhCN, ActionLocaleEnUS},
		{ActionLocaleEnUS, localization.LocaleEnUS, localization.LocaleEnUS, "Show OpenDesk", "Developer", "✓ Detailed", ActionLocaleEnUS, ActionLocaleZhCN},
		{ActionLocaleAuto, localization.PreferenceAuto, localization.LocaleZhCN, "显示主窗口", "开发者", "✓ 详细", ActionLocaleAuto, ActionLocaleZhCN},
		{ActionLocaleZhCN, localization.LocaleZhCN, localization.LocaleZhCN, "显示主窗口", "开发者", "✓ 详细", ActionLocaleZhCN, ActionLocaleEnUS},
		{ActionLocaleEnUS, localization.LocaleEnUS, localization.LocaleEnUS, "Show OpenDesk", "Developer", "✓ Detailed", ActionLocaleEnUS, ActionLocaleAuto},
	}
	for _, test := range testCases {
		native.resetUpdates()
		native.dispatch(test.action)
		waitForLocalizedNative(t, func() bool {
			state, ok := native.snapshot(ActionOpen)
			return ok && manager.GetLocalePreference() == test.preference && state.Label != nil && *state.Label == test.openLabel
		})
		if got := manager.GetResolvedLocale(); got != test.resolved {
			t.Fatalf("after %s resolved locale=%q, want %q", test.action, got, test.resolved)
		}
		if len(businessActions) != 0 {
			t.Fatalf("locale action leaked to business action sink: %v", businessActions)
		}
		for _, want := range []struct {
			id    string
			label string
		}{
			{ActionOpen, test.openLabel},
			{menuProductDeveloper, test.developerLabel},
			{ActionProductDebugDetailed, test.debugDetail},
			{"open-ai-assistant", dynamic},
		} {
			state, ok := native.snapshot(want.id)
			if !ok || state.Label == nil || *state.Label != want.label {
				t.Fatalf("after %s %s label=%+v, want %q", test.action, want.id, state.Label, want.label)
			}
		}
		selected, ok := native.snapshot(test.selectedLocale)
		if !ok || selected.Label == nil || !strings.HasPrefix(*selected.Label, "✓ ") {
			t.Fatalf("after %s selected locale=%+v, want checkmark", test.action, selected.Label)
		}
		unselected, ok := native.snapshot(test.unselectedLocale)
		if !ok || unselected.Label == nil || strings.HasPrefix(*unselected.Label, "✓ ") {
			t.Fatalf("after %s unselected locale=%+v, want no checkmark", test.action, unselected.Label)
		}
		permissions, ok := native.snapshot("open-permissions")
		if !ok || permissions.Enabled == nil || *permissions.Enabled {
			t.Fatalf("after %s disabled state=%+v, want disabled", test.action, permissions.Enabled)
		}
		runtimeLog, ok := native.snapshot("open-runtime-log")
		if !ok || runtimeLog.Visible == nil || *runtimeLog.Visible {
			t.Fatalf("after %s visible state=%+v, want hidden", test.action, runtimeLog.Visible)
		}
		for _, update := range native.updatesSinceReset() {
			if update.patch.Label == nil || update.patch.Enabled != nil || update.patch.Visible != nil {
				t.Fatalf("locale refresh changed runtime-owned state: %+v", update)
			}
		}
	}

	reloaded := localization.NewManager(localization.Options{
		PreferencePath: preferencePath,
		SystemLocale:   func() (string, error) { return localization.LocaleZhCN, nil },
		Diagnostics:    func(localization.Diagnostic) {},
	})
	if got := reloaded.GetLocalePreference(); got != localization.LocaleEnUS {
		t.Fatalf("persisted preference=%q, want %q", got, localization.LocaleEnUS)
	}
}

func waitForLocalizedNative(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("timed out waiting for localized native refresh")
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
