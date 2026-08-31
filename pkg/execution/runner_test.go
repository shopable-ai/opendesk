package execution

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunJavaScriptAcceptsRequestedStackMode(t *testing.T) {
	tests := []struct {
		name      string
		stackMode string
	}{
		{name: "legacy", stackMode: "legacy"},
		{name: "upgraded", stackMode: "upgraded"},
		{name: "playwright", stackMode: "playwright"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run"), "exec-"+tt.name, ".js")
			if err != nil {
				t.Fatalf("PrepareArtifacts returned error: %v", err)
			}

			script := "" +
				"if (typeof page !== 'object') throw new Error('missing current page surface');" +
				"if (typeof browser !== 'object') throw new Error('missing current browser surface');" +
				"if (typeof context !== 'object') throw new Error('missing current context surface');" +
				"if (Execution.stack !== '" + tt.stackMode + "') throw new Error('unexpected stack metadata: ' + Execution.stack);"

			req := Request{
				ExecutionID:    "exec-" + tt.name,
				SourceLabel:    "inline",
				Ext:            ".js",
				StackMode:      tt.stackMode,
				ScriptContent:  []byte(script),
				TimeoutMinutes: 0,
				Artifacts:      artifacts,
				Selection: TerminalSelection{
					Mode:       "quiet",
					Categories: map[string]bool{},
				},
			}
			result, _, err := Run(req)
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			if result.Status != ExecutionStatusSucceeded {
				t.Fatalf("expected succeeded status, got %s", result.Status)
			}
		})
	}
}

func TestRunJavaScriptInjectsExecutionContext(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run-context"), "exec-context", ".js")
	if err != nil {
		t.Fatalf("PrepareArtifacts returned error: %v", err)
	}

	script := "" +
		"if (!Execution) throw new Error('missing Execution context');" +
		"if (Execution.executionId !== 'exec-context') throw new Error('unexpected executionId: ' + Execution.executionId);" +
		"if (Execution.stack !== 'playwright') throw new Error('unexpected stack: ' + Execution.stack);" +
		"if (Execution.artifactDir !== '" + artifacts.RunDir + "') throw new Error('unexpected artifactDir: ' + Execution.artifactDir);"

	req := Request{
		ExecutionID:    "exec-context",
		SourceLabel:    "inline",
		Ext:            ".js",
		StackMode:      "playwright",
		ScriptContent:  []byte(script),
		TimeoutMinutes: 0,
		Artifacts:      artifacts,
		Selection:      TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	}

	result, _, err := Run(req)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Status != ExecutionStatusSucceeded {
		t.Fatalf("expected succeeded status, got %s", result.Status)
	}
}

func TestRunJavaScriptPreservesRequestedStackInSummaryWithoutLegacyFallbackBlob(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run-http-smoke"), "exec-http-smoke", ".js")
	if err != nil {
		t.Fatalf("PrepareArtifacts returned error: %v", err)
	}

	script := "" +
		"console.log('http e2e smoke start');" +
		"console.log('http e2e smoke stack=' + 'playwright');" +
		"console.log('http e2e smoke end');"

	req := Request{
		ExecutionID:    "exec-http-smoke",
		SourceLabel:    "inline",
		Ext:            ".js",
		StackMode:      "playwright",
		ScriptContent:  []byte(script),
		TimeoutMinutes: 0,
		Artifacts:      artifacts,
		Selection:      TerminalSelection{Mode: "agent", Categories: map[string]bool{"script": true, "summary": true, "error": true}},
	}

	_, summary, err := Run(req)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if len(summary.ScriptLogs) == 0 {
		t.Fatal("expected script logs in summary")
	}
	found := false
	for _, item := range summary.ScriptLogs {
		if strings.Contains(item.Message, "http e2e smoke stack=playwright") {
			found = true
		}
		if strings.Contains(item.Message, `\"stack\":\"legacy\"`) {
			t.Fatalf("unexpected legacy fallback blob in script logs: %s", item.Message)
		}
	}
	if !found {
		t.Fatalf("expected stack-specific script log, got %#v", summary.ScriptLogs)
	}
}

func TestRunJavaScriptAsyncLifecycleAcrossStacks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	for _, stack := range []string{"legacy", "upgraded", "playwright"} {
		t.Run(stack, func(t *testing.T) {
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), stack), "async-"+stack, ".js")
			if err != nil {
				t.Fatal(err)
			}
			script := `
                const ticks = [];
                const interval = setInterval(() => ticks.push("tick"), 2);
                const response = await axios.get("` + server.URL + `");
                await new Promise((resolve, reject) => {
                    const observer = setInterval(() => {
                        if (ticks.length > 0) {
                            clearInterval(observer);
                            clearTimeout(deadline);
                            resolve();
                        }
                    }, 1);
                    const deadline = setTimeout(() => {
                        clearInterval(observer);
                        reject(new Error("timer did not tick before lifecycle deadline"));
                    }, 250);
                });
                clearInterval(interval);
                if (!response.data.ok || ticks.length === 0) {
                    throw new Error("async timer/axios lifecycle failed");
                }
            `
			result, _, err := Run(Request{
				ExecutionID: "async-" + stack, SourceLabel: "test", Ext: ".js", StackMode: stack,
				ScriptContent: []byte(script), Timeout: 2 * time.Second, Artifacts: artifacts,
				Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
			})
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			if result.Status != ExecutionStatusSucceeded {
				t.Fatalf("expected succeeded status, got %s", result.Status)
			}
		})
	}
}

func TestRunJavaScriptReportsTimerCallbackFailure(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "timer-error"), "timer-error", ".js")
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = Run(Request{
		ExecutionID: "timer-error", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`setTimeout(() => { throw new Error("timer exploded"); }, 2);`),
		Timeout:       2 * time.Second, Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err == nil || !strings.Contains(err.Error(), "timer exploded") {
		t.Fatalf("expected timer callback failure, got %v", err)
	}
}

func TestRunJavaScriptInterruptsBusyLoopAtDeadline(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "interrupt"), "interrupt", ".js")
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	_, _, err = Run(Request{
		ExecutionID: "interrupt", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`for (;;) {}`), Timeout: 50 * time.Millisecond, Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("expected deadline failure, got %v", err)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("interrupt took too long: %s", elapsed)
	}
}
