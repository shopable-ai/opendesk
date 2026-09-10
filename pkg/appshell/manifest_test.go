package appshell

import (
	"strings"
	"testing"
)

func boolPtr(value bool) *bool { return &value }

func validManifestJSON() string {
	return `{
  "entry": "main.js",
  "singleInstance": true,
  "window": {"closeBehavior": "hide"},
  "tray": {
    "enabled": true,
    "icon": "assets/tray.png",
    "tooltip": "Sample",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": [
      {"id":"sync.now","label":"Sync now","action":"sync.now"},
      {"type":"separator"},
      {"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}
    ]
  }
}`
}

func TestParseManifestValid(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Entry != "main.js" || manifest.Window.CloseBehavior != "hide" || !manifest.SingleInstance {
		t.Fatalf("unexpected manifest: %+v", manifest)
	}
}

func TestParseManifestRejectsInvalidJSONAndUnknownFields(t *testing.T) {
	for _, input := range []string{
		`{"entry":`,
		`{"entry":"main.js","unknown":true}`,
		`{"entry":"main.js"} {"entry":"other.js"}`,
	} {
		if _, err := ParseManifest([]byte(input)); err == nil {
			t.Fatalf("expected rejection for %q", input)
		}
	}
}

func TestManifestRejectsUnsafePaths(t *testing.T) {
	for _, entry := range []string{"../main.js", "/tmp/main.js", `C:\\app\\main.js`, `..\\main.js`} {
		input := strings.Replace(validManifestJSON(), `"main.js"`, `"`+entry+`"`, 1)
		if _, err := ParseManifest([]byte(input)); err == nil {
			t.Fatalf("expected unsafe entry %q to fail", entry)
		}
	}
	input := strings.Replace(validManifestJSON(), `"assets/tray.png"`, `"../../tray.png"`, 1)
	if _, err := ParseManifest([]byte(input)); err == nil {
		t.Fatal("expected unsafe icon to fail")
	}
}

func TestManifestRejectsDuplicateAndReservedIDs(t *testing.T) {
	duplicate := strings.Replace(validManifestJSON(), `"sync.pause"`, `"sync.now"`, 1)
	if _, err := ParseManifest([]byte(duplicate)); err == nil {
		t.Fatal("expected duplicate menu id to fail")
	}
	reservedID := strings.Replace(validManifestJSON(), `"sync.now"`, `"opendesk.fake"`, 1)
	if _, err := ParseManifest([]byte(reservedID)); err == nil {
		t.Fatal("expected reserved item id to fail")
	}
	reservedAction := strings.Replace(validManifestJSON(), `"action":"sync.now"`, `"action":"opendesk.fake"`, 1)
	if _, err := ParseManifest([]byte(reservedAction)); err == nil {
		t.Fatal("expected reserved action to fail")
	}
}

func TestManifestRejectsInvalidMenuModeCloseBehaviorAndSeparator(t *testing.T) {
	badMode := strings.Replace(validManifestJSON(), `"menuMode": "merge"`, `"menuMode": "replace"`, 1)
	if _, err := ParseManifest([]byte(badMode)); err == nil {
		t.Fatal("expected invalid menu mode to fail")
	}
	badClose := strings.Replace(validManifestJSON(), `"closeBehavior": "hide"`, `"closeBehavior": "minimize"`, 1)
	if _, err := ParseManifest([]byte(badClose)); err == nil {
		t.Fatal("expected invalid close behavior to fail")
	}
	badSeparator := strings.Replace(validManifestJSON(), `{"type":"separator"}`, `{"type":"separator","id":"x"}`, 1)
	if _, err := ParseManifest([]byte(badSeparator)); err == nil {
		t.Fatal("expected invalid separator to fail")
	}
}

func TestManifestHideRequiresReopenPath(t *testing.T) {
	input := strings.Replace(validManifestJSON(), `"enabled": true`, `"enabled": false`, 1)
	if _, err := ParseManifest([]byte(input)); err == nil || !strings.Contains(err.Error(), "reopen") {
		t.Fatalf("expected reopen validation error, got %v", err)
	}
}
