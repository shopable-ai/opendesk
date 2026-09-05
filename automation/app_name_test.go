package automation

import "testing"

func TestNormalizeMacOSSystemApplicationAlias(t *testing.T) {
	aliases := []string{"计算器", "Calculator"}
	for _, alias := range aliases {
		target := normalizeAppTargetForPlatform("darwin", true, appTarget{Kind: appTargetName, Value: alias})
		if target.Kind != appTargetBundleID || target.Value != macOSCalculatorBundleID || target.PID != 0 {
			t.Fatalf("alias %q normalized to %#v", alias, target)
		}
		observed := desktopApplicationState{PID: 7, Name: "Calculator", BundleIdentifier: macOSCalculatorBundleID}
		if !appMatchesTarget(observed, target) {
			t.Fatalf("alias %q did not match the differently named observed app", alias)
		}
		projection := appGroupProjection(target, []desktopApplicationState{observed})
		identity, _ := projection["identity"].(map[string]interface{})
		if projection["name"] != observed.Name || projection["bundleId"] != observed.BundleIdentifier || identity["kind"] != string(appTargetBundleID) || identity["value"] != macOSCalculatorBundleID {
			t.Fatalf("alias %q projection was not canonical/observed: %#v", alias, projection)
		}
	}

	for _, target := range []appTarget{
		{Kind: appTargetName, Value: "calculator"},
		{Kind: appTargetName, Value: "OpenDesk Unknown Application"},
		{Kind: appTargetBundleID, Value: "计算器"},
		{Kind: appTargetPath, Value: "/Applications/Calculator.app"},
		{Kind: appTargetPID, PID: 42},
	} {
		if got := normalizeAppTargetForPlatform("darwin", true, target); got != target {
			t.Fatalf("explicit or unknown target changed: before=%#v after=%#v", target, got)
		}
	}

	name := appTarget{Kind: appTargetName, Value: "计算器"}
	for _, platform := range []string{"linux", "windows"} {
		if got := normalizeAppTargetForPlatform(platform, true, name); got != name {
			t.Fatalf("%s unexpectedly normalized %#v", platform, got)
		}
	}
	if got := normalizeAppTargetForPlatform("darwin", false, name); got != name {
		t.Fatalf("darwin without native identity unexpectedly normalized %#v", got)
	}
}
