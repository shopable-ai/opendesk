package execution

import (
	"path/filepath"
	"testing"

	"github.com/dop251/goja"
)

// This is an internal trust-boundary seam that public JavaScript cannot
// construct: a source label must never be interpreted as a trusted file path.
func TestExecutionSourceLabelCannotForgeScriptPath(t *testing.T) {
	runtime := goja.New()
	request := Request{
		ExecutionID: "source-context-test",
		SourceLabel: "file:/forged/by-label.js",
		WorkDir:     t.TempDir(),
		Environment: map[string]string{},
	}
	if err := registerExecutionContext(runtime, request); err != nil {
		t.Fatal(err)
	}
	context := runtime.Get("Execution").ToObject(runtime)
	if !goja.IsNull(context.Get("scriptPath")) || !goja.IsNull(context.Get("scriptDir")) {
		t.Fatalf("untrusted source label produced path metadata: path=%v dir=%v", context.Get("scriptPath"), context.Get("scriptDir"))
	}
}

func TestNormalizeExecutionScriptPathUsesExecutionWorkDir(t *testing.T) {
	workDir := t.TempDir()
	actual, err := normalizeExecutionScriptPath(filepath.Join("recipes", "task.js"), workDir)
	if err != nil {
		t.Fatal(err)
	}
	expected := filepath.Join(workDir, "recipes", "task.js")
	if actual != expected {
		t.Fatalf("script path = %q, want %q", actual, expected)
	}
	empty, err := normalizeExecutionScriptPath("", workDir)
	if err != nil || empty != "" {
		t.Fatalf("empty script path = %q, err=%v", empty, err)
	}
}
