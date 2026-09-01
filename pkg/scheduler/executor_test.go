package scheduler

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

func TestScriptExecutorUsesExistingRuntimeAndWritesEvidence(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "tests", "scheduler", "fixtures", "write-result.js")
	fixture, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	resultPath := filepath.Join(root, "result.txt")
	source := strings.Replace(string(fixture), "__OUTPUT_PATH__", strconv.Quote(filepath.ToSlash(resultPath)), 1)
	if err := os.WriteFile(filepath.Join(root, "write-result.js"), []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	executor, err := NewScriptExecutorWithArtifacts(root, filepath.Join(root, "evidence"), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	result, err := executor.Execute(context.Background(), Job{ID: "job-runtime", ScriptPath: "write-result.js"})
	if err != nil {
		t.Fatalf("execute fixture: %v", err)
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded || result.ExecutionID == "" {
		t.Fatalf("unexpected execution result: %#v", result)
	}
	content, err := os.ReadFile(resultPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "scheduler runtime ok" {
		t.Fatalf("unexpected fixture output %q", content)
	}
	for _, path := range []string{result.Artifacts.ScriptSnapshotPath, result.Artifacts.SummaryPath, result.Artifacts.AgentSummaryPath, result.Artifacts.EventLogPath} {
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			t.Fatalf("missing execution evidence %s: info=%v err=%v", path, info, err)
		}
	}
}

func TestScriptExecutorRunsInlineJavaScriptWithStandardEvidence(t *testing.T) {
	root := t.TempDir()
	markerPath := filepath.Join(root, "inline-marker.txt")
	source := "File.write(" + strconv.Quote(filepath.ToSlash(markerPath)) + ", 'inline runtime ok');\n" +
		"console.log('inline scheduler executed');\n" +
		"return {ok: true};\n"
	executor, err := NewScriptExecutorWithArtifacts(root, filepath.Join(root, "evidence"), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	job := Job{ID: "job-inline-runtime", SourceType: SourceInline, InlineScript: source}
	result, err := executor.Execute(context.Background(), job)
	if err != nil {
		t.Fatalf("execute inline source: %v", err)
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded || result.ExecutionID == "" {
		t.Fatalf("unexpected inline execution result: %#v", result)
	}
	marker, err := os.ReadFile(markerPath)
	if err != nil || string(marker) != "inline runtime ok" {
		t.Fatalf("inline marker=%q err=%v", marker, err)
	}
	snapshot, err := os.ReadFile(result.Artifacts.ScriptSnapshotPath)
	if err != nil || string(snapshot) != source {
		t.Fatalf("inline snapshot mismatch: err=%v", err)
	}
	for _, path := range []string{result.Artifacts.SummaryPath, result.Artifacts.AgentSummaryPath, result.Artifacts.EventLogPath} {
		if info, err := os.Stat(path); err != nil || info.Size() == 0 {
			t.Fatalf("missing inline execution evidence %s: info=%v err=%v", path, info, err)
		}
	}
	summary, err := os.ReadFile(result.Artifacts.SummaryPath)
	if err != nil || !strings.Contains(string(summary), "scheduler:inline:job-inline-runtime") {
		t.Fatalf("inline source label missing from summary: err=%v summary=%s", err, summary)
	}
}

func TestNormalizeScriptPathRejectsTraversalAndNonJavaScript(t *testing.T) {
	root := t.TempDir()
	outside := filepath.Join(t.TempDir(), "outside.js")
	if err := os.WriteFile(outside, []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeScriptPath(root, outside); err == nil {
		t.Fatal("absolute path outside script root unexpectedly accepted")
	}
	textPath := filepath.Join(root, "note.txt")
	if err := os.WriteFile(textPath, []byte("not js"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := NormalizeScriptPath(root, "note.txt"); err == nil {
		t.Fatal("non-JavaScript path unexpectedly accepted")
	}
}
