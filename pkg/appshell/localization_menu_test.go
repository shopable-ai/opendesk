package appshell

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"opendesk/pkg/localization"
)

type localizationNativeUpdate struct {
	id    string
	patch MenuItemPatch
}

type localizationFakeNative struct {
	mu      sync.Mutex
	handler func(string, string)
	state   map[string]MenuItemPatch
	updates []localizationNativeUpdate
}

func newLocalizationFakeNative(manifest Manifest) *localizationFakeNative {
	state := make(map[string]MenuItemPatch)
	visitNativeMenu(nativeMenuForManifest(manifest), func(item nativeMenuItem) {
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
		state[item.ID] = MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}
	})
	return &localizationFakeNative{state: state}
}

func (f *localizationFakeNative) Start(_ context.Context, handler func(string, string)) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.handler = handler
	return nil
}
func (f *localizationFakeNative) Activate(context.Context) error { return nil }
func (f *localizationFakeNative) UpdateMenuItem(_ context.Context, id string, patch MenuItemPatch) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	current, ok := f.state[id]
	if !ok {
		return fmt.Errorf("unknown fake menu item %q", id)
	}
	if patch.Label != nil {
		value := *patch.Label
		current.Label = &value
	}
	if patch.Enabled != nil {
		value := *patch.Enabled
		current.Enabled = &value
	}
	if patch.Visible != nil {
		value := *patch.Visible
		current.Visible = &value
	}
	f.state[id] = current
	f.updates = append(f.updates, localizationNativeUpdate{id: id, patch: patch})
	return nil
}
func (f *localizationFakeNative) Teardown(context.Context) error { return nil }
func (f *localizationFakeNative) Wait()                            {}

func (f *localizationFakeNative) menuState(id string) (MenuItemPatch, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	state, ok := f.state[id]
	return state, ok
}

func localizationTestOptions(t *testing.T, systemLocale *string) localization.Options {
	t.Helper()
	return localization.Options{
		CatalogDir:     filepath.Join("..", "..", "apps", "opendesk", "locales"),
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale: func() (string, error) {
			return *systemLocale, nil
		},
		Diagnostics: func(localization.Diagnostic) {},
	}
}

func localizationProductManifest(t *testing.T) Manifest {
	t.Helper()
	input := strings.Replace(validManifestJSON(), `"id": "com.opendesk.sample"`, `"id": "com.opendesk.desktop"`, 1)
	manifest, err := ParseManifest([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	manifest.Tray.Menu[0].LabelKey = "menu.assistant"
	manifest.Tray.Menu[0].Label = "AI 助手"
	return EnsureRecorderMenu(manifest)
}

func findNativeMenuItem(items []nativeMenuItem, id string) (nativeMenuItem, bool) {
	for _, item := range items {
		if item.ID == id {
			return item, true
		}
		if found, ok := findNativeMenuItem(item.Children, id); ok {
			return found, true
		}
	}
	return nativeMenuItem{}, false
}

func requireNativeLabel(t *testing.T, items []nativeMenuItem, id, want string) {
	t.Helper()
	item, ok := findNativeMenuItem(items, id)
	if !ok {
		t.Fatalf("menu item %s not found", id)
	}
	if item.Label != want {
		t.Fatalf("menu item %s label=%q want=%q", id, item.Label, want)
	}
}

func TestManifestLocalizationPresentationContract(t *testing.T) {
	legacy, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if legacy.Tray.Menu[0].LabelKey != "" || legacy.Tray.Menu[0].Label != "Sync now" {
		t.Fatalf("legacy label changed: %+v", legacy.Tray.Menu[0])
	}

	withKey := strings.Replace(validManifestJSON(), `"label":"Sync now","action":"sync.now"`, `"labelKey":"menu.assistant","label":"AI 助手","action":"sync.now"`, 1)
	manifest, err := ParseManifest([]byte(withKey))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Tray.Menu[0].LabelKey != "menu.assistant" || manifest.Tray.Menu[0].Action != "sync.now" {
		t.Fatalf("labelKey altered action contract: %+v", manifest.Tray.Menu[0])
	}

	keyOnly := strings.Replace(validManifestJSON(), `"label":"Sync now","action":"sync.now"`, `"labelKey":"menu.assistant","action":"sync.now"`, 1)
	if _, err := ParseManifest([]byte(keyOnly)); err != nil {
		t.Fatalf("labelKey-only item rejected: %v", err)
	}

	unknown := strings.Replace(validManifestJSON(), `"label":"Sync now"`, `"label":"Sync now","localeLabel":"menu.assistant"`, 1)
	if _, err := ParseManifest([]byte(unknown)); err == nil {
		t.Fatal("unknown localization field must remain rejected")
	}
}

func TestOpenDeskProductMenuLocalizesAndMarksPreference(t *testing.T) {
	systemLocale := "zh-CN"
	options := localizationTestOptions(t, &systemLocale)
	manager := localization.ConfigureDefault(options)
	if err := manager.SetLocalePreference(localization.LocaleZhCN); err != nil {
		t.Fatal(err)
	}
	manifest := localizationProductManifest(t)

	zh := openDeskProductMenu(manifest)
	requireNativeLabel(t, zh, ActionOpen, "显示主窗口")
	requireNativeLabel(t, zh, ActionRecorder, "录制自动化")
	requireNativeLabel(t, zh, menuProductLanguage, "语言 / Language")
	requireNativeLabel(t, zh, ActionLocaleAuto, "自动（跟随系统） / System Default")
	requireNativeLabel(t, zh, ActionLocaleZhCN, "✓ 简体中文")
	requireNativeLabel(t, zh, ActionLocaleEnUS, "English")

	if err := manager.SetLocalePreference(localization.LocaleEnUS); err != nil {
		t.Fatal(err)
	}
	en := openDeskProductMenu(manifest)
	requireNativeLabel(t, en, ActionOpen, "Show OpenDesk")
	requireNativeLabel(t, en, ActionRecorder, "Record Automation")
	requireNativeLabel(t, en, menuProductDeveloper, "Developer")
	requireNativeLabel(t, en, menuProductLanguage, "语言 / Language")
	requireNativeLabel(t, en, ActionLocaleZhCN, "简体中文")
	requireNativeLabel(t, en, ActionLocaleEnUS, "✓ English")
	requireNativeLabel(t, en, ActionQuit, "Quit")
}

func TestLocalizedNativeHostSwitchesWithoutBusinessDispatchAndPreservesRuntimeState(t *testing.T) {
	systemLocale := "zh-CN"
	options := localizationTestOptions(t, &systemLocale)
	manager := localization.ConfigureDefault(options)
	if err := manager.SetLocalePreference(localization.LocaleZhCN); err != nil {
		t.Fatal(err)
	}
	manifest := localizationProductManifest(t)
	inner := newLocalizationFakeNative(manifest)
	wrapped := newLocalizedNativeHost(manifest, inner, manager)
	host, ok := wrapped.(*localizedNativeHost)
	if !ok {
		t.Fatalf("expected localized native host, got %T", wrapped)
	}
	shell, err := New(manifest, wrapped)
	if err != nil {
		t.Fatal(err)
	}
	if err := shell.Start(context.Background()); err != nil {
		t.Fatal(err)
	}

	var business []ActionEvent
	if err := shell.BindActionSink(func(event ActionEvent) error {
		business = append(business, event)
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	runtimeLabel := "Runtime-owned status"
	enabled, visible := false, false
	if err := shell.UpdateMenuItem(context.Background(), "sync.now", MenuItemPatch{Label: &runtimeLabel, Enabled: &enabled, Visible: &visible}); err != nil {
		t.Fatal(err)
	}
	debugNormal, debugDetailed := "普通", "✓ 详细"
	if err := shell.UpdateMenuItem(context.Background(), ActionProductDebugNormal, MenuItemPatch{Label: &debugNormal}); err != nil {
		t.Fatal(err)
	}
	if err := shell.UpdateMenuItem(context.Background(), ActionProductDebugDetailed, MenuItemPatch{Label: &debugDetailed}); err != nil {
		t.Fatal(err)
	}

	inner.mu.Lock()
	handler := inner.handler
	updatesBeforeLocale := len(inner.updates)
	inner.mu.Unlock()
	if handler == nil {
		t.Fatal("native locale callback was not installed")
	}
	handler(ActionLocaleEnUS, "tray-menu")
	host.wg.Wait()

	if len(business) != 0 {
		t.Fatalf("locale action leaked into business sink: %+v", business)
	}
	if manager.GetLocalePreference() != localization.LocaleEnUS || manager.GetResolvedLocale() != localization.LocaleEnUS {
		t.Fatalf("locale state preference=%s resolved=%s", manager.GetLocalePreference(), manager.GetResolvedLocale())
	}
	reloaded := localization.NewManager(options)
	if reloaded.GetLocalePreference() != localization.LocaleEnUS {
		t.Fatalf("persisted preference=%s", reloaded.GetLocalePreference())
	}

	state, ok := inner.menuState(ActionOpen)
	if !ok || state.Label == nil || *state.Label != "Show OpenDesk" {
		t.Fatalf("open label after en-US=%+v", state)
	}
	state, _ = inner.menuState(ActionLocaleEnUS)
	if state.Label == nil || *state.Label != "✓ English" {
		t.Fatalf("English selection=%+v", state)
	}
	state, _ = inner.menuState(ActionProductDebugDetailed)
	if state.Label == nil || *state.Label != "✓ Detailed" {
		t.Fatalf("debug detailed state=%+v", state)
	}
	state, _ = inner.menuState("sync.now")
	if state.Label == nil || *state.Label != runtimeLabel || state.Enabled == nil || *state.Enabled || state.Visible == nil || *state.Visible {
		t.Fatalf("runtime-owned menu state changed: %+v", state)
	}
	if shellState, ok := shell.MenuItemState("sync.now"); !ok || shellState.Enabled == nil || *shellState.Enabled || shellState.Visible == nil || *shellState.Visible {
		t.Fatalf("Shell runtime state changed: %+v", shellState)
	}

	inner.mu.Lock()
	for _, update := range inner.updates[updatesBeforeLocale:] {
		if update.patch.Enabled != nil || update.patch.Visible != nil {
			inner.mu.Unlock()
			t.Fatalf("locale refresh changed runtime flags for %s: %+v", update.id, update.patch)
		}
	}
	inner.mu.Unlock()

	handler(ActionLocaleZhCN, "tray-menu")
	host.wg.Wait()
	if manager.GetLocalePreference() != localization.LocaleZhCN {
		t.Fatalf("zh-CN preference=%s", manager.GetLocalePreference())
	}
	state, _ = inner.menuState(ActionOpen)
	if state.Label == nil || *state.Label != "显示主窗口" {
		t.Fatalf("open label after zh-CN=%+v", state)
	}

	systemLocale = "en-GB"
	handler(ActionLocaleAuto, "tray-menu")
	host.wg.Wait()
	if manager.GetLocalePreference() != localization.PreferenceAuto || manager.GetResolvedLocale() != localization.LocaleEnUS {
		t.Fatalf("auto state preference=%s resolved=%s", manager.GetLocalePreference(), manager.GetResolvedLocale())
	}
	state, _ = inner.menuState(ActionLocaleAuto)
	if state.Label == nil || !strings.HasPrefix(*state.Label, "✓ ") {
		t.Fatalf("auto selection=%+v", state)
	}
	if action, ok := manifest.MenuAction("sync.now"); !ok || action != "sync.now" {
		t.Fatalf("business action changed during locale switching: %q %v", action, ok)
	}
}

func TestOfficialManifestKeepsStableLocalizedBusinessActions(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "apps", "opendesk", ManifestFileName))
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := ParseManifest(data)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{
		"open-ai-assistant":     "assistant.open",
		"open-scheduler-center": "scheduler.center",
		"new-schedule":          "scheduler.new",
		"open-permissions":      "permissions.open",
		"open-runtime-log":      "runtime.log",
		"open-examples":         ActionProductExamples,
		"open-api-docs":         ActionProductAPIDocs,
	}
	for id, action := range want {
		if got, ok := manifest.MenuAction(id); !ok || got != action {
			t.Fatalf("menu action %s=%q,%v want=%q", id, got, ok, action)
		}
	}
}
