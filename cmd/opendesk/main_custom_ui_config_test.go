package main

import (
	"opendesk/pkg/customui"
	"opendesk/pkg/runtimeconfig"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveCustomUIActivationForCLI(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "task.js")
	if err := os.WriteFile(script, []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(dir, runtimeconfig.FileName)
	if err := os.WriteFile(configPath, []byte(`{"schemaVersion":1,"runtime":{"capabilities":["ui"]}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name    string
		config  *Config
		enabled bool
		source  customui.ActivationSource
	}{
		{name: "project config", config: &Config{ScriptPath: script}, enabled: true, source: customui.ActivationProjectConfig},
		{name: "CLI enable", config: &Config{ScriptPath: script, CustomUI: true}, enabled: true, source: customui.ActivationCLI},
		{name: "CLI disable wins", config: &Config{ScriptPath: script, CustomUI: true, CustomUIDisabled: true}, source: customui.ActivationDisabled},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := resolveCustomUIActivation(test.config); err != nil {
				t.Fatal(err)
			}
			if test.config.CustomUI != test.enabled || test.config.CustomUIActivationSource != test.source {
				t.Fatalf("activation enabled=%v source=%s", test.config.CustomUI, test.config.CustomUIActivationSource)
			}
		})
	}
}

func TestResolveCustomUIActivationRejectsHostPathInProjectConfig(t *testing.T) {
	path := filepath.Join(t.TempDir(), runtimeconfig.FileName)
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"runtime":{"capabilities":["ui"],"hostPath":"/tmp/untrusted"}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	err := resolveCustomUIActivation(&Config{RuntimeConfigPath: path})
	if err == nil {
		t.Fatal("project hostPath unexpectedly accepted")
	}
}
