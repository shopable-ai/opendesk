package runtimeconfig_test

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/customui"
	"opendesk/pkg/runtimeconfig"
)

func TestLoadStrictSchema(t *testing.T) {
	tests := []struct {
		name string
		body string
		code string
	}{
		{name: "valid", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"]}}`},
		{name: "unknown top level", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"]},"hostPath":"/tmp/tool"}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "unknown runtime field", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"],"hostPath":"/tmp/tool"}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "wrong schema type", body: `{"schemaVersion":"1","runtime":{"capabilities":["ui"]}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "null document", body: `null`, code: runtimeconfig.CodeConfigInvalid},
		{name: "missing schema", body: `{"runtime":{"capabilities":["ui"]}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "null schema", body: `{"schemaVersion":null,"runtime":{"capabilities":["ui"]}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "unsupported schema", body: `{"schemaVersion":2,"runtime":{"capabilities":["ui"]}}`, code: runtimeconfig.CodeConfigUnsupported},
		{name: "missing runtime", body: `{"schemaVersion":1}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "null runtime", body: `{"schemaVersion":1,"runtime":null}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "capabilities object", body: `{"schemaVersion":1,"runtime":{"capabilities":{}}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "null capabilities", body: `{"schemaVersion":1,"runtime":{"capabilities":null}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "capability wrong type", body: `{"schemaVersion":1,"runtime":{"capabilities":[1]}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "unknown capability", body: `{"schemaVersion":1,"runtime":{"capabilities":["mouse"]}}`, code: runtimeconfig.CodeConfigUnsupported},
		{name: "duplicate capability", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui","ui"]}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "missing capabilities", body: `{"schemaVersion":1,"runtime":{}}`, code: runtimeconfig.CodeConfigInvalid},
		{name: "trailing value", body: `{"schemaVersion":1,"runtime":{"capabilities":[]}} {}`, code: runtimeconfig.CodeConfigInvalid},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), runtimeconfig.FileName)
			if err := os.WriteFile(path, []byte(test.body), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := runtimeconfig.Load(path)
			if test.code == "" {
				if err != nil {
					t.Fatalf("Load() error = %v", err)
				}
				return
			}
			var configErr *runtimeconfig.Error
			if !errors.As(err, &configErr) || configErr.Code != test.code {
				t.Fatalf("Load() error = %#v, want code %s", err, test.code)
			}
		})
	}
}

func TestResolveUIPriorityAndDiscovery(t *testing.T) {
	root := t.TempDir()
	scriptDir := filepath.Join(root, "script")
	workingDir := filepath.Join(root, "work")
	if err := os.MkdirAll(scriptDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(workingDir, 0o700); err != nil {
		t.Fatal(err)
	}
	scriptPath := filepath.Join(scriptDir, "task.js")
	if err := os.WriteFile(scriptPath, []byte(""), 0o600); err != nil {
		t.Fatal(err)
	}
	writeConfig(t, filepath.Join(scriptDir, runtimeconfig.FileName), true)
	writeConfig(t, filepath.Join(workingDir, runtimeconfig.FileName), true)
	disabledConfig := filepath.Join(root, "disabled.json")
	writeConfig(t, disabledConfig, false)

	tests := []struct {
		name    string
		opts    runtimeconfig.UIResolveOptions
		enabled bool
		source  customui.ActivationSource
	}{
		{name: "no-ui wins", opts: runtimeconfig.UIResolveOptions{ForceDisable: true, ForceEnable: true, ExplicitConfigPath: filepath.Join(root, "missing")}, source: customui.ActivationDisabled},
		{name: "ui wins over config", opts: runtimeconfig.UIResolveOptions{ForceEnable: true, ExplicitConfigPath: filepath.Join(root, "missing")}, enabled: true, source: customui.ActivationCLI},
		{name: "explicit config wins", opts: runtimeconfig.UIResolveOptions{ExplicitConfigPath: disabledConfig, ScriptPath: scriptPath}, source: customui.ActivationDisabled},
		{name: "script adjacent", opts: runtimeconfig.UIResolveOptions{ScriptPath: scriptPath}, enabled: true, source: customui.ActivationProjectConfig},
		{name: "working directory", opts: runtimeconfig.UIResolveOptions{WorkingDirectory: workingDir, UseWorkingDirectory: true}, enabled: true, source: customui.ActivationProjectConfig},
		{name: "default disabled", opts: runtimeconfig.UIResolveOptions{}, source: customui.ActivationDisabled},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			activation, err := runtimeconfig.ResolveUI(test.opts)
			if err != nil {
				t.Fatalf("ResolveUI() error = %v", err)
			}
			if activation.Enabled != test.enabled || activation.Source != test.source {
				t.Fatalf("ResolveUI() = %#v, want enabled=%v source=%s", activation, test.enabled, test.source)
			}
		})
	}
}

func TestResolveUIExplicitMissingIsObservable(t *testing.T) {
	_, err := runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{ExplicitConfigPath: filepath.Join(t.TempDir(), "missing.json")})
	var configErr *runtimeconfig.Error
	if !errors.As(err, &configErr) || configErr.Code != runtimeconfig.CodeConfigNotFound {
		t.Fatalf("ResolveUI() error = %#v", err)
	}
}

func TestResolveUIDiscoversLegacyFilenameOnlyAsFallback(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, runtimeconfig.LegacyFileName)
	writeConfig(t, legacyPath, true)

	activation, err := runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{WorkingDirectory: dir, UseWorkingDirectory: true})
	if err != nil {
		t.Fatal(err)
	}
	if !activation.Enabled || activation.ConfigPath != legacyPath {
		t.Fatalf("legacy fallback activation = %#v, want enabled path %s", activation, legacyPath)
	}

	canonicalPath := filepath.Join(dir, runtimeconfig.FileName)
	writeConfig(t, canonicalPath, false)
	activation, err = runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{WorkingDirectory: dir, UseWorkingDirectory: true})
	if err != nil {
		t.Fatal(err)
	}
	if activation.Enabled || activation.ConfigPath != canonicalPath {
		t.Fatalf("canonical activation = %#v, want disabled path %s", activation, canonicalPath)
	}
}

func writeConfig(t *testing.T, path string, enabled bool) {
	t.Helper()
	capabilities := `[]`
	if enabled {
		capabilities = `["ui"]`
	}
	body := `{"schemaVersion":1,"runtime":{"capabilities":` + capabilities + `}}`
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}
