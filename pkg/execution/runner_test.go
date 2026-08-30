package execution

import (
	"path/filepath"
	"strings"
	"testing"
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
