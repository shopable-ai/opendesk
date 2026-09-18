package flowinstall

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/flowpackage"
)

func TestInstallScriptCreatesUntrustedLocalFlowWithoutExecuting(t *testing.T) {
	service := newTestService(t)
	marker := filepath.Join(t.TempDir(), "must-not-exist")
	sourcePath := filepath.Join(t.TempDir(), "local-script.js")
	source := []byte("File.write(" + quoteJS(marker) + ", 'executed')\n")
	if err := os.WriteFile(sourcePath, source, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := service.InstallScript(context.Background(), sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	if result.Record.Origin != "js" || result.Record.State != StateReady || result.Record.InstallID[:6] != "local-" {
		t.Fatalf("local Flow record = %#v", result.Record)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("local import executed JavaScript; marker stat error = %v", err)
	}
	root := filepath.Join(service.Roots.FlowRoot, result.Record.InstallID)
	if _, err := os.Stat(filepath.Join(root, "flow.json")); err != nil {
		t.Fatal(err)
	}
	trusted, err := service.Trust.Evaluate(flowpackageManifestForLocalTest())
	if err != nil || trusted {
		t.Fatalf("local import unexpectedly produced a publisher trust record: trusted=%t error=%v", trusted, err)
	}
	lease, err := service.AcquireRun(context.Background(), result.Record.InstallID)
	if err != nil {
		t.Fatal(err)
	}
	if lease.Entry != filepath.Join(root, result.Record.Entry) || lease.Root != root {
		t.Fatalf("local run lease = %#v", lease)
	}
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	repeated, err := service.InstallScript(context.Background(), sourcePath)
	if err != nil || !repeated.Idempotent {
		t.Fatalf("repeated local import = %#v, error = %v", repeated, err)
	}
}

func TestInstallScriptCopiesAndVerifiesAdjacentRuntimeConfiguration(t *testing.T) {
	service := newTestService(t)
	sourceDir := t.TempDir()
	sourcePath := filepath.Join(sourceDir, "toast.js")
	configPath := filepath.Join(sourceDir, "clawdesk.runtime.json")
	if err := os.WriteFile(sourcePath, []byte("await ui.toast('local toast');\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	config := []byte("{\"schemaVersion\":1,\"runtime\":{\"capabilities\":[\"ui\"]}}\n")
	if err := os.WriteFile(configPath, config, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := service.InstallScript(context.Background(), sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(service.Roots.FlowRoot, result.Record.InstallID)
	installedConfig := filepath.Join(root, "payload", "clawdesk.runtime.json")
	if got, err := os.ReadFile(installedConfig); err != nil || string(got) != string(config) {
		t.Fatalf("installed runtime configuration = %q, error=%v", got, err)
	}
	lease, err := service.AcquireRun(context.Background(), result.Record.InstallID)
	if err != nil {
		t.Fatalf("verified local Flow could not acquire a run lease: %v", err)
	}
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Dir(installedConfig), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(installedConfig, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(installedConfig, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AcquireRun(context.Background(), result.Record.InstallID); CodeOf(err) != CodeTransactionFailed {
		t.Fatalf("tampered runtime configuration acquire error code = %q, error=%v", CodeOf(err), err)
	}
}

func flowpackageManifestForLocalTest() flowpackage.Manifest {
	return flowpackage.Manifest{FlowID: "not-local", PublisherID: "local", PublisherKeyID: "local", PublisherFingerprint: "0000000000000000000000000000000000000000000000000000000000000000"}
}
