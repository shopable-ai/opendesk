package runtimeconfig

import (
	"errors"
	"opendesk/pkg/customui"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadStrictSchema(t *testing.T) {
	tests := []struct {
		name string
		body string
		code string
	}{
		{name: "valid", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"]}}`},
		{name: "unknown top level", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"]},"hostPath":"/tmp/tool"}`, code: CodeConfigInvalid},
		{name: "unknown runtime field", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui"],"hostPath":"/tmp/tool"}}`, code: CodeConfigInvalid},
		{name: "wrong schema type", body: `{"schemaVersion":"1","runtime":{"capabilities":["ui"]}}`, code: CodeConfigInvalid},
		{name: "null document", body: `null`, code: CodeConfigInvalid},
		{name: "missing schema", body: `{"runtime":{"capabilities":["ui"]}}`, code: CodeConfigInvalid},
		{name: "null schema", body: `{"schemaVersion":null,"runtime":{"capabilities":["ui"]}}`, code: CodeConfigInvalid},
		{name: "unsupported schema", body: `{"schemaVersion":2,"runtime":{"capabilities":["ui"]}}`, code: CodeConfigUnsupported},
		{name: "missing runtime", body: `{"schemaVersion":1}`, code: CodeConfigInvalid},
		{name: "null runtime", body: `{"schemaVersion":1,"runtime":null}`, code: CodeConfigInvalid},
		{name: "capabilities object", body: `{"schemaVersion":1,"runtime":{"capabilities":{}}}`, code: CodeConfigInvalid},
		{name: "null capabilities", body: `{"schemaVersion":1,"runtime":{"capabilities":null}}`, code: CodeConfigInvalid},
		{name: "capability wrong type", body: `{"schemaVersion":1,"runtime":{"capabilities":[1]}}`, code: CodeConfigInvalid},
		{name: "unknown capability", body: `{"schemaVersion":1,"runtime":{"capabilities":["mouse"]}}`, code: CodeConfigUnsupported},
		{name: "duplicate capability", body: `{"schemaVersion":1,"runtime":{"capabilities":["ui","ui"]}}`, code: CodeConfigInvalid},
		{name: "missing capabilities", body: `{"schemaVersion":1,"runtime":{}}`, code: CodeConfigInvalid},
		{name: "trailing value", body: `{"schemaVersion":1,"runtime":{"capabilities":[]}} {}`, code: CodeConfigInvalid},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), FileName)
			if err := os.WriteFile(path, []byte(test.body), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := Load(path)
			if test.code == "" {
				if err != nil {
					t.Fatalf("Load() error = %v", err)
				}
				return
			}
			var configErr *Error
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
	writeConfig(t, filepath.Join(scriptDir, FileName), true)
	writeConfig(t, filepath.Join(workingDir, FileName), true)
	disabledConfig := filepath.Join(root, "disabled.json")
	writeConfig(t, disabledConfig, false)

	tests := []struct {
		name    string
		opts    UIResolveOptions
		enabled bool
		source  customui.ActivationSource
	}{
		{name: "no-ui wins", opts: UIResolveOptions{ForceDisable: true, ForceEnable: true, ExplicitConfigPath: filepath.Join(root, "missing")}, source: customui.ActivationDisabled},
		{name: "ui wins over config", opts: UIResolveOptions{ForceEnable: true, ExplicitConfigPath: filepath.Join(root, "missing")}, enabled: true, source: customui.ActivationCLI},
		{name: "explicit config wins", opts: UIResolveOptions{ExplicitConfigPath: disabledConfig, ScriptPath: scriptPath}, source: customui.ActivationDisabled},
		{name: "script adjacent", opts: UIResolveOptions{ScriptPath: scriptPath}, enabled: true, source: customui.ActivationProjectConfig},
		{name: "working directory", opts: UIResolveOptions{WorkingDirectory: workingDir, UseWorkingDirectory: true}, enabled: true, source: customui.ActivationProjectConfig},
		{name: "default disabled", opts: UIResolveOptions{}, source: customui.ActivationDisabled},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			activation, err := ResolveUI(test.opts)
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
	_, err := ResolveUI(UIResolveOptions{ExplicitConfigPath: filepath.Join(t.TempDir(), "missing.json")})
	var configErr *Error
	if !errors.As(err, &configErr) || configErr.Code != CodeConfigNotFound {
		t.Fatalf("ResolveUI() error = %#v", err)
	}
}

func TestResolveUIDiscoversLegacyFilenameOnlyAsFallback(t *testing.T) {
	dir := t.TempDir()
	legacyPath := filepath.Join(dir, LegacyFileName)
	writeConfig(t, legacyPath, true)

	activation, err := ResolveUI(UIResolveOptions{WorkingDirectory: dir, UseWorkingDirectory: true})
	if err != nil {
		t.Fatal(err)
	}
	if !activation.Enabled || activation.ConfigPath != legacyPath {
		t.Fatalf("legacy fallback activation = %#v, want enabled path %s", activation, legacyPath)
	}

	canonicalPath := filepath.Join(dir, FileName)
	writeConfig(t, canonicalPath, false)
	activation, err = ResolveUI(UIResolveOptions{WorkingDirectory: dir, UseWorkingDirectory: true})
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
