package execution

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunJavaScriptAppliesRequestedStackMode(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run"), "exec-stack", ".js")
	if err != nil {
		t.Fatalf("PrepareArtifacts returned error: %v", err)
	}

	tests := []struct {
		name      string
		stackMode string
		script    string
	}{
		{
			name:      "legacy",
			stackMode: "legacy",
			script:    `console.log(typeof page === 'object');`,
		},
		{
			name:      "upgraded",
			stackMode: "upgraded",
			script:    `console.log(page === pageUpgraded);`,
		},
		{
			name:      "playwright",
			stackMode: "playwright",
			script:    `console.log(page === pageUpgraded && browser === browserUpgraded && context === contextUpgraded);`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := Request{
				ExecutionID:    "exec-" + tt.name,
				SourceLabel:    "inline",
				Ext:            ".js",
				StackMode:      tt.stackMode,
				ScriptContent:  []byte(tt.script),
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

func TestRunJavaScriptCliSmokesEmitStandardizedTopLevelFields(t *testing.T) {
	tests := []struct {
		name        string
		stackMode   string
		scriptPath  string
		needle      string
		notNeedles  []string
	}{
		{
			name:       "legacy",
			stackMode:  "legacy",
			scriptPath: filepath.Join("..", "..", "examples", "browser_stack_legacy_smoke.js"),
			needle:     `"stack":"legacy"`,
			notNeedles: []string{`"stack":"upgraded"`, `"stack":"playwright"`},
		},
		{
			name:       "upgraded",
			stackMode:  "upgraded",
			scriptPath: filepath.Join("..", "..", "examples", "browser_stack_upgraded_smoke.js"),
			needle:     `"stack":"upgraded"`,
			notNeedles: []string{`"stack":"legacy"`, `"stack":"playwright"`},
		},
		{
			name:       "playwright",
			stackMode:  "playwright",
			scriptPath: filepath.Join("..", "..", "examples", "browser_stack_playwright_smoke.js"),
			needle:     `"stack":"playwright"`,
			notNeedles: []string{`"stack":"legacy"`, `"stack":"upgraded"`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			content, err := os.ReadFile(tt.scriptPath)
			if err != nil {
				t.Fatalf("failed to read script %s: %v", tt.scriptPath, err)
			}
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), tt.name), "exec-"+tt.name, ".js")
			if err != nil {
				t.Fatalf("PrepareArtifacts returned error: %v", err)
			}
			req := Request{
				ExecutionID:    "exec-" + tt.name,
				SourceLabel:    "file:" + tt.scriptPath,
				Ext:            ".js",
				StackMode:      tt.stackMode,
				ScriptContent:  content,
				TimeoutMinutes: 0,
				Artifacts:      artifacts,
				Selection:      TerminalSelection{Mode: "agent", Categories: map[string]bool{"script": true, "summary": true, "error": true}},
			}
			_, summary, err := Run(req)
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			joined := ""
			for _, item := range summary.ScriptLogs {
				joined += item.Message + "\n"
			}
			for _, field := range []string{"\"ok\":true", tt.needle, "\"finalStatus\":\"succeeded\"", "\"proofLevel\":"} {
				if !strings.Contains(joined, field) {
					t.Fatalf("expected %q in script logs, got %s", field, joined)
				}
			}
			for _, bad := range tt.notNeedles {
				if strings.Contains(joined, bad) {
					t.Fatalf("unexpected conflicting stack marker %q in script logs: %s", bad, joined)
				}
			}
		})
	}
}
