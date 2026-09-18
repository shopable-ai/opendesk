package flowcli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/appdata"
	"opendesk/pkg/flowinstall"
)

func TestExecuteLocalInstallRunAndUninstallUsesFlowService(t *testing.T) {
	root := t.TempDir()
	t.Setenv(appdata.RootEnvironment, root)
	source := filepath.Join(root, "recipe.js")
	if err := os.WriteFile(source, []byte("const capability = ui.getCapabilities(); if (!capability.enabled || capability.activationSource !== 'projectConfig') throw new Error('installed runtime configuration was not applied'); File.write(File.join(Flow.dataDir, 'marker'), 'ran');\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "clawdesk.runtime.json"), []byte(`{"schemaVersion":1,"runtime":{"capabilities":["ui"]}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	call := func(args ...string) (int, envelope) {
		t.Helper()
		var stdout bytes.Buffer
		code := Execute(append([]string{"flow"}, args...), &stdout, io.Discard)
		var result envelope
		if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
			t.Fatalf("decode %v output %q: %v", args, stdout.String(), err)
		}
		return code, result
	}

	code, installed := call("install", source)
	if code != 0 || !installed.OK || installed.Result == nil {
		t.Fatalf("local install = code %d, %#v", code, installed)
	}
	var installResult flowinstall.InstallResult
	decodeResult(t, installed.Result, &installResult)
	if installResult.Record.Origin != "js" {
		t.Fatalf("local install origin = %q", installResult.Record.Origin)
	}
	marker := filepath.Join(root, "flow-data", installResult.Record.InstallID, "marker")
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("install executed local source: stat=%v", err)
	}

	code, listed := call("list")
	if code != 0 || !listed.OK {
		t.Fatalf("local list = code %d, %#v", code, listed)
	}
	code, ran := call("run", installResult.Record.InstallID, "--timeout", "30s")
	if code != 0 || !ran.OK {
		t.Fatalf("local run = code %d, %#v", code, ran)
	}
	if data, err := os.ReadFile(marker); err != nil || string(data) != "ran" {
		t.Fatalf("local run marker = %q, error=%v", data, err)
	}
	code, removed := call("uninstall", installResult.Record.InstallID, "--remove-data")
	if code != 0 || !removed.OK {
		t.Fatalf("local uninstall = code %d, %#v", code, removed)
	}
	if _, err := os.Stat(filepath.Join(root, "flows", installResult.Record.InstallID)); !os.IsNotExist(err) {
		t.Fatalf("uninstall left Flow tree: %v", err)
	}

	service, err := flowinstall.NewService(flowinstall.RootsFromAppData(root))
	if err != nil {
		t.Fatal(err)
	}
	if records, err := service.Catalog.List(); err != nil || len(records) != 0 {
		t.Fatalf("catalog after uninstall = %#v, error=%v", records, err)
	}
}

func decodeResult(t *testing.T, value any, target any) {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatal(err)
	}
}
