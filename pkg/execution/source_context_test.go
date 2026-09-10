package execution

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
)

func TestInternalResultSinkIsExplicitPrivateTransport(t *testing.T) {
	workDir := t.TempDir()
	ordinary, _, err := Run(Request{
		Context: context.Background(), ExecutionID: NewExecutionID("ordinary"),
		ScriptContent: []byte(`if (typeof __opendeskInspectorResult !== "undefined") throw new Error("private sink leaked");`),
		WorkDir:       workDir, Timeout: 2 * time.Second,
	})
	if err != nil || ordinary.Status != ExecutionStatusSucceeded {
		t.Fatalf("ordinary execution status/error = %s / %v", ordinary.Status, err)
	}
	var captured []byte
	internal, summary, err := Run(Request{
		Context: context.Background(), ExecutionID: NewExecutionID("internal"),
		ScriptContent: []byte(`__opendeskInspectorResult(JSON.stringify({ok:true,secret:"kept in process"}));`),
		WorkDir:       workDir, Timeout: 2 * time.Second,
		InternalResultSink: func(value []byte) error {
			captured = append([]byte(nil), value...)
			return nil
		},
	})
	if err != nil || internal.Status != ExecutionStatusSucceeded {
		t.Fatalf("internal execution status/error = %s / %v", internal.Status, err)
	}
	if string(captured) != `{"ok":true,"secret":"kept in process"}` {
		t.Fatalf("captured private result = %q", captured)
	}
	encodedSummary, _ := json.Marshal(summary)
	if strings.Contains(string(encodedSummary), "kept in process") {
		t.Fatal("private result leaked to execution console")
	}
}

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
