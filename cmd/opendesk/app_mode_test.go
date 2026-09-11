package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundledAppModePathIsOptInForDesktopEntries(t *testing.T) {
	root := t.TempDir()
	macExecutable := filepath.Join(root, "OpenDesk.app", "Contents", "MacOS", "opendesk")
	macPackage := filepath.Join(root, "OpenDesk.app", "Contents", "Resources", "AppMode")
	if err := os.MkdirAll(macPackage, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(macPackage, "opendesk.app.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := bundledAppModePathForExecutable(macExecutable, "darwin"); got != macPackage {
		t.Fatalf("macOS bundled package = %q, want %q", got, macPackage)
	}

	windowsExecutable := filepath.Join(root, "opendesk.exe")
	windowsPackage := filepath.Join(root, "app-mode")
	if err := os.MkdirAll(windowsPackage, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(windowsPackage, "opendesk.app.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := bundledAppModePathForExecutable(windowsExecutable, "windows"); got != windowsPackage {
		t.Fatalf("Windows bundled package = %q, want %q", got, windowsPackage)
	}
	if got := bundledAppModePathForExecutable(filepath.Join(root, "plain"), "darwin"); got != "" {
		t.Fatalf("plain executable unexpectedly selected package %q", got)
	}
}

func TestAppModeRequestedRecognizesFlagWithoutInspectingScriptArguments(t *testing.T) {
	for _, args := range [][]string{{"-app", "example"}, {"-app=example"}, {"-console-mode", "script", "-app", "example"}} {
		if !appModeRequested(args) {
			t.Fatalf("did not detect -app in %v", args)
		}
	}
	if appModeRequested([]string{"--", "-app", "script-data"}) {
		t.Fatal("interpreted script data after -- as App Mode")
	}
}

func TestValidateAppModeConfigRejectsEveryCompetingStartupMode(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Config)
		want   string
	}{
		{"script", func(config *Config) { config.ScriptPath = "main.js" }, "-script"},
		{"script text", func(config *Config) { config.ScriptText = "1" }, "-script-text"},
		{"script stdin", func(config *Config) { config.ScriptStdin = true }, "-script-stdin"},
		{"http", func(config *Config) { config.HttpMode = true }, "-http"},
		{"vision OCR", func(config *Config) { config.VisionOCRImagePath = "image.png" }, "vision CLI"},
		{"vision detection", func(config *Config) { config.VisionDetectImagePath = "image.png" }, "vision CLI"},
		{"native extension", func(config *Config) { config.NativeExtension = "extension" }, "-native-extension"},
		{"permission helper", func(config *Config) { config.MacPermissionHelper = "accessibility" }, "-mac-permission-helper"},
		{"disabled UI", func(config *Config) { config.CustomUIDisabled = true }, "-no-ui"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			config := &Config{AppPath: "example"}
			test.mutate(config)
			err := validateAppModeConfig(config)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("error=%v", err)
			}
		})
	}
	if err := validateAppModeConfig(&Config{AppPath: "example"}); err != nil {
		t.Fatalf("standalone App Mode rejected: %v", err)
	}
}

func TestValidateAppModeHelperConflictRunsBeforePrivateHelperDispatch(t *testing.T) {
	if err := validateAppModeHelperConflict([]string{"-app", "example", "--opendesk-internal-macos-notify"}); err == nil || !strings.Contains(err.Error(), "helper") {
		t.Fatalf("helper conflict error=%v", err)
	}
	if err := validateAppModeHelperConflict([]string{"--opendesk-internal-macos-notify"}); err != nil {
		t.Fatalf("ordinary helper invocation rejected: %v", err)
	}
}
