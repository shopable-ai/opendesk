package execution

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestFlowContextResolvesResourcesAndSeparatesWritableData(t *testing.T) {
	base := t.TempDir()
	flowRoot := filepath.Join(base, "flows", "flow-test")
	dataDir := filepath.Join(base, "flow-data", "flow-test")
	workDir := filepath.Join(base, "unrelated-cwd")
	for _, directory := range []string{filepath.Join(flowRoot, "assets"), dataDir, workDir} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(flowRoot, "assets", "value.json"), []byte(`{"value":"resource-ok"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(flowRoot, "assets", "value.json"), 0o400); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(flowRoot, "assets"), 0o500); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(flowRoot, 0o500); err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = os.Chmod(flowRoot, 0o700)
		_ = os.Chmod(filepath.Join(flowRoot, "assets"), 0o700)
		_ = os.Chmod(filepath.Join(flowRoot, "assets", "value.json"), 0o600)
	}()
	scriptPath := filepath.Join(flowRoot, "payload", "main.js")
	script := []byte(`
if (typeof Flow !== "object" || !Object.isFrozen(Flow)) throw new Error("Flow is not frozen");
if (Flow.root === Execution.workdir) throw new Error("Flow.root was forged from cwd");
if (Execution.scriptPath !== ` + jsString(scriptPath) + `) throw new Error("Execution.scriptPath changed");
const resource = JSON.parse(File.read(Flow.resolve("assets/value.json")));
if (resource.value !== "resource-ok") throw new Error("wrong Flow resource");
File.write(File.join(Flow.dataDir, "state.txt"), resource.value);
let traversalRejected = false;
try { Flow.resolve("../outside"); } catch (_) { traversalRejected = true; }
if (!traversalRejected) throw new Error("Flow.resolve allowed traversal");
let absoluteRejected = false;
try { Flow.resolve(` + jsString(filepath.Join(base, "outside")) + `); } catch (_) { absoluteRejected = true; }
if (!absoluteRejected) throw new Error("Flow.resolve allowed absolute path");
`)
	result, _, err := Run(Request{
		Context: context.Background(), ExecutionID: "flow-context", SourceLabel: "installed-flow:test",
		ScriptPath: scriptPath, Ext: ".js", ScriptContent: script, WorkDir: workDir,
		Flow: &FlowContext{Root: flowRoot, DataDir: dataDir}, Timeout: 3 * time.Second,
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("Flow execution status/error = %s / %v", result.Status, err)
	}
	data, err := os.ReadFile(filepath.Join(dataDir, "state.txt"))
	if err != nil || string(data) != "resource-ok" {
		t.Fatalf("Flow.dataDir result = %q, error = %v", data, err)
	}
}

func TestFlowResolveRejectsSymlinkEvenWhenTargetIsInsideRoot(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation is not generally available to unprivileged Windows tests")
	}
	base := t.TempDir()
	root := filepath.Join(base, "flow")
	dataDir := filepath.Join(base, "data")
	if err := os.MkdirAll(filepath.Join(root, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "assets", "value.txt"), []byte("ok"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("assets/value.txt", filepath.Join(root, "link.txt")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	result, _, err := Run(Request{
		Context: context.Background(), ExecutionID: "flow-symlink", SourceLabel: "installed-flow:test",
		Ext: ".js", ScriptContent: []byte(`
let rejected = false;
try { Flow.resolve("link.txt"); } catch (_) { rejected = true; }
if (!rejected) throw new Error("Flow.resolve accepted symlink");
`), WorkDir: base, Flow: &FlowContext{Root: root, DataDir: dataDir}, Timeout: 3 * time.Second,
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("symlink rejection status/error = %s / %v", result.Status, err)
	}
}

func TestLegacyExecutionHasNoFlowGlobalAndKeepsPathSemantics(t *testing.T) {
	workDir := t.TempDir()
	scriptPath := filepath.Join(workDir, "legacy", "task.js")
	result, _, err := Run(Request{
		Context: context.Background(), ExecutionID: "legacy-no-flow", SourceLabel: "file:" + scriptPath,
		ScriptPath: scriptPath, Ext: ".js", WorkDir: workDir, Timeout: 3 * time.Second,
		ScriptContent: []byte(`
if (typeof Flow !== "undefined") throw new Error("Flow leaked into legacy execution");
if (Execution.scriptPath !== ` + jsString(scriptPath) + `) throw new Error("legacy scriptPath changed");
if (Execution.scriptDir !== ` + jsString(filepath.Dir(scriptPath)) + `) throw new Error("legacy scriptDir changed");
if (File.cwd() !== Execution.workdir) throw new Error("legacy cwd semantics changed");
`),
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("legacy execution status/error = %s / %v", result.Status, err)
	}
}

func TestInvalidFlowContextFailsBeforeJavaScript(t *testing.T) {
	root := t.TempDir()
	marker := filepath.Join(t.TempDir(), "must-not-exist")
	result, _, err := Run(Request{
		Context: context.Background(), ExecutionID: "invalid-flow-context", Ext: ".js", WorkDir: t.TempDir(),
		Flow: &FlowContext{Root: root, DataDir: root}, Timeout: time.Second,
		ScriptContent: []byte(`File.write(` + jsString(marker) + `, "executed")`),
	})
	if err == nil || result.Status != "" {
		t.Fatalf("invalid Flow context result/error = %#v / %v", result, err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("invalid Flow context executed JavaScript; marker stat error = %v", err)
	}
}

func jsString(value string) string {
	quoted := `"`
	for _, character := range value {
		switch character {
		case '\\':
			quoted += `\\`
		case '"':
			quoted += `\"`
		case '\n':
			quoted += `\n`
		case '\r':
			quoted += `\r`
		default:
			quoted += string(character)
		}
	}
	return quoted + `"`
}
