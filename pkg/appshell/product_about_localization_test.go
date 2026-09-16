package appshell

import (
	"testing"

	"opendesk/pkg/localization"
)

func TestOpenDeskAboutLocalizationContract(t *testing.T) {
	systemLocale := "zh-CN"
	manager := localization.ConfigureDefault(localizationTestOptions(t, &systemLocale))
	manifest := localizationProductManifest(t)

	if err := manager.SetLocalePreference(localization.LocaleZhCN); err != nil {
		t.Fatal(err)
	}
	zhMenu := openDeskProductMenu(manifest)
	requireNativeLabel(t, zhMenu, ActionProductAbout, "关于 OpenDesk")
	if got := manager.TranslateWithFallback("about.versionLabel", "版本"); got != "版本" {
		t.Fatalf("zh about.versionLabel=%q want=%q", got, "版本")
	}
	if got := manager.TranslateWithFallback("about.description", "Agent 驱动的桌面自动化"); got != "Agent 驱动的桌面自动化" {
		t.Fatalf("zh about.description=%q", got)
	}

	if err := manager.SetLocalePreference(localization.LocaleEnUS); err != nil {
		t.Fatal(err)
	}
	enMenu := openDeskProductMenu(manifest)
	requireNativeLabel(t, enMenu, ActionProductAbout, "About OpenDesk")
	if got := manager.TranslateWithFallback("about.versionLabel", "版本"); got != "Version" {
		t.Fatalf("en about.versionLabel=%q want=%q", got, "Version")
	}
	if got := manager.TranslateWithFallback("about.description", "Agent 驱动的桌面自动化"); got != "Agent-driven desktop automation" {
		t.Fatalf("en about.description=%q", got)
	}

	// Unsupported system locales follow the product's existing auto-locale
	// contract and resolve to English; About must not invent its own fallback.
	systemLocale = "de-DE"
	if err := manager.SetLocalePreference(localization.PreferenceAuto); err != nil {
		t.Fatal(err)
	}
	autoMenu := openDeskProductMenu(manifest)
	requireNativeLabel(t, autoMenu, ActionProductAbout, "About OpenDesk")
	if got := manager.TranslateWithFallback("about.versionLabel", "版本"); got != "Version" {
		t.Fatalf("auto about.versionLabel=%q want=%q", got, "Version")
	}
}
