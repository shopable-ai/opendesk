package localization

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveLocale(t *testing.T) {
	tests := []struct {
		name       string
		preference string
		system     string
		want       string
	}{
		{"auto zh-CN", PreferenceAuto, "zh-CN", LocaleZhCN},
		{"auto zh-Hans", PreferenceAuto, "zh-Hans", LocaleZhCN},
		{"auto zh-Hans-CN", PreferenceAuto, "zh-Hans-CN", LocaleZhCN},
		{"auto language-only zh", PreferenceAuto, "zh", LocaleZhCN},
		{"auto language-only en", PreferenceAuto, "en", LocaleEnUS},
		{"auto en-US", PreferenceAuto, "en-US", LocaleEnUS},
		{"auto en-GB", PreferenceAuto, "en-GB", LocaleEnUS},
		{"auto en-AU", PreferenceAuto, "en-AU", LocaleEnUS},
		{"auto unsupported", PreferenceAuto, "ja-JP", LocaleEnUS},
		{"German falls back to English", PreferenceAuto, "de-DE", LocaleEnUS},
		{"traditional Chinese unsupported", PreferenceAuto, "zh-TW", LocaleEnUS},
		{"Hong Kong Chinese unsupported", PreferenceAuto, "zh-HK", LocaleEnUS},
		{"explicit zh-CN", LocaleZhCN, "en-US", LocaleZhCN},
		{"explicit en-US", LocaleEnUS, "zh-CN", LocaleEnUS},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ResolveLocale(test.preference, test.system); got != test.want {
				t.Fatalf("ResolveLocale(%q, %q)=%q, want %q", test.preference, test.system, got, test.want)
			}
		})
	}
}

func TestIsSupportedSystemLocale(t *testing.T) {
	for _, test := range []struct {
		locale string
		want   bool
	}{
		{locale: "zh", want: true},
		{locale: "zh-CN", want: true},
		{locale: "zh-Hans-CN", want: true},
		{locale: "en-GB", want: true},
		{locale: "de-DE", want: false},
		{locale: "", want: false},
	} {
		if got := IsSupportedSystemLocale(test.locale); got != test.want {
			t.Errorf("IsSupportedSystemLocale(%q)=%t, want %t", test.locale, got, test.want)
		}
	}
}

func TestPreferencePersistsAndReloads(t *testing.T) {
	preferencePath := filepath.Join(t.TempDir(), "preferences.json")
	newManager := func() *Manager {
		return NewManager(Options{
			PreferencePath: preferencePath,
			SystemLocale:   func() (string, error) { return "en-GB", nil },
			Diagnostics:    func(Diagnostic) {},
		})
	}

	manager := newManager()
	if got := manager.GetLocalePreference(); got != PreferenceAuto {
		t.Fatalf("default preference=%q, want auto", got)
	}
	if got := manager.GetResolvedLocale(); got != LocaleEnUS {
		t.Fatalf("default resolved locale=%q, want en-US", got)
	}

	for _, preference := range []string{LocaleZhCN, LocaleEnUS, PreferenceAuto} {
		if err := manager.SetLocalePreference(preference); err != nil {
			t.Fatalf("SetLocalePreference(%q): %v", preference, err)
		}
		manager = newManager()
		if got := manager.GetLocalePreference(); got != preference {
			t.Fatalf("reloaded preference=%q, want %q", got, preference)
		}
		wantResolved := preference
		if preference == PreferenceAuto {
			wantResolved = LocaleEnUS
		}
		if got := manager.GetResolvedLocale(); got != wantResolved {
			t.Fatalf("reloaded resolved locale=%q, want %q", got, wantResolved)
		}
	}
}

func TestInvalidPersistedPreferenceRecoversToAuto(t *testing.T) {
	tests := []struct {
		name string
		data string
	}{
		{name: "unsupported locale", data: `{"localePreference":"ja-JP"}`},
		{name: "unknown locale", data: `{"localePreference":"foo"}`},
		{name: "empty locale", data: `{"localePreference":""}`},
		{name: "malformed JSON", data: `{"localePreference":`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "preferences.json")
			if err := os.WriteFile(path, []byte(test.data), 0o600); err != nil {
				t.Fatal(err)
			}
			var diagnostics []Diagnostic
			manager := NewManager(Options{
				PreferencePath: path,
				SystemLocale:   func() (string, error) { return "en-US", nil },
				Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
			})
			if got := manager.GetLocalePreference(); got != PreferenceAuto {
				t.Fatalf("invalid persisted preference recovered as %q, want auto", got)
			}
			if got := manager.GetResolvedLocale(); got != LocaleEnUS {
				t.Fatalf("resolved locale=%q, want en-US after auto recovery", got)
			}
			if !hasDiagnostic(diagnostics, DiagnosticPreferenceInvalid) {
				t.Fatalf("missing %s diagnostic: %#v", DiagnosticPreferenceInvalid, diagnostics)
			}
		})
	}
}

func TestSetLocalePreferenceUpdatesMemoryWithoutRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "preferences.json")
	manager := NewManager(Options{
		PreferencePath: path,
		SystemLocale:   func() (string, error) { return "zh-CN", nil },
		Diagnostics:    func(Diagnostic) {},
	})
	if err := manager.SetLocalePreference(LocaleEnUS); err != nil {
		t.Fatal(err)
	}
	if got := manager.GetResolvedLocale(); got != LocaleEnUS {
		t.Fatalf("resolved locale after runtime preference change=%q, want en-US", got)
	}
	if err := manager.SetLocalePreference(PreferenceAuto); err != nil {
		t.Fatal(err)
	}
	if got := manager.GetResolvedLocale(); got != LocaleZhCN {
		t.Fatalf("resolved locale after returning to auto=%q, want zh-CN", got)
	}
}

func TestCatalogLookupFallbackAndInterpolation(t *testing.T) {
	catalogDir := t.TempDir()
	writeTestCatalog(t, catalogDir, LocaleZhCN, map[string]any{
		"menu.onlyChinese": "仅中文",
		"example.count":    "共 {count} 项",
	})
	writeTestCatalog(t, catalogDir, LocaleEnUS, map[string]any{
		"menu.current": "Current",
	})
	manager := NewManager(Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(Diagnostic) {},
	})
	if got := manager.Translate("menu.current"); got != "Current" {
		t.Fatalf("en-US hit=%q", got)
	}
	if err := manager.SetLocalePreference(LocaleZhCN); err != nil {
		t.Fatal(err)
	}
	if got := manager.Translate("menu.onlyChinese"); got != "仅中文" {
		t.Fatalf("zh-CN hit=%q", got)
	}
	if err := manager.SetLocalePreference(LocaleEnUS); err != nil {
		t.Fatal(err)
	}
	if got := manager.Translate("menu.onlyChinese"); got != "仅中文" {
		t.Fatalf("fallback hit=%q", got)
	}
	if got := manager.Translate("example.count", map[string]any{"count": 3}); got != "共 3 项" {
		t.Fatalf("interpolation=%q", got)
	}
	if got := manager.TranslateWithFallback("menu.missing", "Legacy Label"); got != "Legacy Label" {
		t.Fatalf("legacy fallback=%q", got)
	}
	if got := manager.Translate("menu.missing"); got != "menu.missing" {
		t.Fatalf("safe key fallback=%q", got)
	}
}

func TestMissingCatalogFailsSoft(t *testing.T) {
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     t.TempDir(),
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.TranslateWithFallback("menu.foo", "Legacy"); got != "Legacy" {
		t.Fatalf("missing catalog fallback=%q", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticCatalogMissing) {
		t.Fatalf("missing %s diagnostic: %#v", DiagnosticCatalogMissing, diagnostics)
	}
}

func TestMalformedCatalogFailsSoft(t *testing.T) {
	catalogDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(catalogDir, LocaleEnUS+".json"), []byte(`{"broken":`), 0o644); err != nil {
		t.Fatal(err)
	}
	writeTestCatalog(t, catalogDir, LocaleZhCN, map[string]any{"menu.foo": "中文回退"})
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.Translate("menu.foo"); got != "中文回退" {
		t.Fatalf("malformed locale should fall back, got %q", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticCatalogInvalid) {
		t.Fatalf("missing %s diagnostic: %#v", DiagnosticCatalogInvalid, diagnostics)
	}
}

func TestCatalogValueMustBeString(t *testing.T) {
	catalogDir := t.TempDir()
	writeTestCatalog(t, catalogDir, LocaleEnUS, map[string]any{"menu.foo": 42})
	writeTestCatalog(t, catalogDir, LocaleZhCN, map[string]any{"menu.foo": "中文回退"})
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.Translate("menu.foo"); got != "中文回退" {
		t.Fatalf("invalid value should fall back, got %q", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticCatalogInvalid) {
		t.Fatalf("missing %s diagnostic", DiagnosticCatalogInvalid)
	}
}

func TestCatalogRootMustBeObject(t *testing.T) {
	catalogDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(catalogDir, LocaleEnUS+".json"), []byte(`[]`), 0o644); err != nil {
		t.Fatal(err)
	}
	writeTestCatalog(t, catalogDir, LocaleZhCN, map[string]any{"menu.foo": "中文回退"})
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.Translate("menu.foo"); got != "中文回退" {
		t.Fatalf("non-object catalog should fall back, got %q", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticCatalogInvalid) {
		t.Fatalf("missing %s diagnostic: %#v", DiagnosticCatalogInvalid, diagnostics)
	}
}

func TestCatalogReadErrorFailsSoft(t *testing.T) {
	catalogDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(catalogDir, LocaleEnUS+".json"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestCatalog(t, catalogDir, LocaleZhCN, map[string]any{"menu.foo": "中文回退"})
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     catalogDir,
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "en-US", nil },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.Translate("menu.foo"); got != "中文回退" {
		t.Fatalf("catalog read error should fall back, got %q", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticCatalogInvalid) {
		t.Fatalf("missing %s diagnostic: %#v", DiagnosticCatalogInvalid, diagnostics)
	}
}

func TestDiagnosticsAreDeduplicated(t *testing.T) {
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		CatalogDir:     t.TempDir(),
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "", errors.New("unavailable") },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.Translate("menu.missing"); got != "menu.missing" {
		t.Fatalf("missing key fallback=%q", got)
	}
	if err := manager.SetLocalePreference(PreferenceAuto); err != nil {
		t.Fatal(err)
	}
	if got := manager.Translate("menu.missing"); got != "menu.missing" {
		t.Fatalf("repeated missing key fallback=%q", got)
	}

	counts := make(map[string]int)
	for _, diagnostic := range diagnostics {
		counts[diagnostic.Code]++
	}
	if counts[DiagnosticSystemUnavailable] != 1 {
		t.Fatalf("system locale diagnostic count=%d, want 1: %#v", counts[DiagnosticSystemUnavailable], diagnostics)
	}
	if counts[DiagnosticMissingKey] != 1 {
		t.Fatalf("missing key diagnostic count=%d, want 1: %#v", counts[DiagnosticMissingKey], diagnostics)
	}
	if counts[DiagnosticCatalogMissing] != 1 {
		t.Fatalf("catalog missing diagnostic count=%d, want 1 for the resolved product-default locale: %#v", counts[DiagnosticCatalogMissing], diagnostics)
	}
}

func TestSystemLocaleFailureDoesNotBlockStartup(t *testing.T) {
	var diagnostics []Diagnostic
	manager := NewManager(Options{
		PreferencePath: filepath.Join(t.TempDir(), "preferences.json"),
		SystemLocale:   func() (string, error) { return "", errors.New("unavailable") },
		Diagnostics:    func(d Diagnostic) { diagnostics = append(diagnostics, d) },
	})
	if got := manager.GetResolvedLocale(); got != ProductDefaultLocale {
		t.Fatalf("OS locale failure resolved=%q, want product default", got)
	}
	if !hasDiagnostic(diagnostics, DiagnosticSystemUnavailable) {
		t.Fatalf("missing %s diagnostic: %#v", DiagnosticSystemUnavailable, diagnostics)
	}
}

func writeTestCatalog(t *testing.T, root, locale string, values map[string]any) {
	t.Helper()
	data, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, locale+".json"), data, 0o644); err != nil {
		t.Fatal(err)
	}
}

func hasDiagnostic(diagnostics []Diagnostic, code string) bool {
	for _, diagnostic := range diagnostics {
		if diagnostic.Code == code {
			return true
		}
	}
	return false
}
