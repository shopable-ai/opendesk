package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	pkgExecution "clawdesk/pkg/execution"
)

func TestResolveScriptSourceFromText(t *testing.T) {
	content, source, ext, err := resolveScriptSource(&Config{ScriptText: "await keyboard.type('hi')"})
	if err != nil {
		t.Fatalf("resolveScriptSource returned error: %v", err)
	}
	if string(content) != "await keyboard.type('hi')" {
		t.Fatalf("unexpected content: %q", string(content))
	}
	if source != "inline" {
		t.Fatalf("unexpected source: %s", source)
	}
	if ext != ".js" {
		t.Fatalf("unexpected ext: %s", ext)
	}
}

func TestResolveScriptSourceFromFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "script.txt")
	if err := os.WriteFile(path, []byte("waitFor(100)"), 0o644); err != nil {
		t.Fatalf("failed to write script fixture: %v", err)
	}

	content, source, ext, err := resolveScriptSource(&Config{ScriptPath: path})
	if err != nil {
		t.Fatalf("resolveScriptSource returned error: %v", err)
	}
	if string(content) != "waitFor(100)" {
		t.Fatalf("unexpected content: %q", string(content))
	}
	if source != "file:"+path {
		t.Fatalf("unexpected source: %s", source)
	}
	if ext != ".txt" {
		t.Fatalf("unexpected ext: %s", ext)
	}
}

func TestResolveScriptSourceFromStdin(t *testing.T) {
	originalStdin := os.Stdin
	defer func() {
		os.Stdin = originalStdin
	}()

	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("failed to create pipe: %v", err)
	}
	if _, err := writer.WriteString("await mouse.move(1, 2)"); err != nil {
		t.Fatalf("failed to write stdin script: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close stdin writer: %v", err)
	}
	os.Stdin = reader

	content, source, ext, err := resolveScriptSource(&Config{ScriptStdin: true})
	if err != nil {
		t.Fatalf("resolveScriptSource returned error: %v", err)
	}
	if string(content) != "await mouse.move(1, 2)" {
		t.Fatalf("unexpected content: %q", string(content))
	}
	if source != "stdin" {
		t.Fatalf("unexpected source: %s", source)
	}
	if ext != ".js" {
		t.Fatalf("unexpected ext: %s", ext)
	}
}

func TestResolveScriptSourceRejectsMultipleSources(t *testing.T) {
	_, _, _, err := resolveScriptSource(&Config{
		ScriptPath: "a.js",
		ScriptText: "console.log(1)",
	})
	if err == nil {
		t.Fatal("expected source conflict error")
	}
}

func TestResolveScriptSourceWithStackModeDoesNotAffectSourceResolution(t *testing.T) {
	content, source, ext, err := resolveScriptSource(&Config{
		ScriptText: "console.log('stack independent')",
		StackMode:  "playwright",
	})
	if err != nil {
		t.Fatalf("resolveScriptSource returned error: %v", err)
	}
	if string(content) != "console.log('stack independent')" || source != "inline" || ext != ".js" {
		t.Fatalf("unexpected resolution result: content=%q source=%q ext=%q", string(content), source, ext)
	}
}

func TestSaveScriptSnapshot(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "artifacts", "last.js")
	if err := saveScriptSnapshot(target, []byte("await waitFor(1)")); err != nil {
		t.Fatalf("saveScriptSnapshot returned error: %v", err)
	}

	content, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("failed to read saved script: %v", err)
	}
	if string(content) != "await waitFor(1)" {
		t.Fatalf("unexpected saved content: %q", string(content))
	}
}

func TestComputeScriptHashStable(t *testing.T) {
	content := []byte("await mouse.move(1, 2)")
	hashA := computeScriptHash(content)
	hashB := computeScriptHash(content)

	if hashA == "" {
		t.Fatal("expected non-empty hash")
	}
	if hashA != hashB {
		t.Fatalf("expected stable hash, got %q and %q", hashA, hashB)
	}
}

func TestPrepareRunArtifactsForDirectExecution(t *testing.T) {
	dir := t.TempDir()
	cfg := &Config{
		ScriptText: "console.log('hi')",
		LogDir:     filepath.Join(dir, "logs"),
	}
	startedAt := time.Date(2026, 4, 7, 17, 30, 0, 0, time.FixedZone("CST", 8*3600))

	artifacts, err := prepareRunArtifacts(cfg, "inline", ".js", []byte(cfg.ScriptText), startedAt)
	if err != nil {
		t.Fatalf("prepareRunArtifacts returned error: %v", err)
	}
	if artifacts == nil {
		t.Fatal("expected artifacts")
	}
	if artifacts.Dir != cfg.LogDir {
		t.Fatalf("unexpected dir: %q", artifacts.Dir)
	}
	if artifacts.ScriptSnapshotPath == "" || artifacts.StdoutPath == "" || artifacts.SummaryPath == "" {
		t.Fatalf("expected artifact paths to be populated: %+v", artifacts)
	}
}

func TestPrepareRunArtifactsDefaultsToRuntimeDirectory(t *testing.T) {
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(original) })
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatal(err)
	}

	startedAt := time.Date(2026, 8, 31, 19, 30, 0, 0, time.FixedZone("CST", 8*3600))
	artifacts, err := prepareRunArtifacts(
		&Config{ScriptText: "console.log('hi')"},
		"inline",
		".js",
		[]byte("console.log('hi')"),
		startedAt,
	)
	if err != nil {
		t.Fatalf("prepareRunArtifacts returned error: %v", err)
	}

	want := filepath.Join(".runtime", "runs", "direct-20260831-193000")
	if artifacts == nil || artifacts.Dir != want {
		t.Fatalf("artifact dir = %#v, want %q", artifacts, want)
	}
}

func TestWriteRunSummary(t *testing.T) {
	dir := t.TempDir()
	artifacts := &RunArtifacts{
		Dir:                dir,
		Source:             "inline",
		Ext:                ".js",
		ScriptHash:         "abc123",
		StartedAt:          time.Date(2026, 4, 7, 17, 35, 0, 0, time.FixedZone("CST", 8*3600)),
		StdoutPath:         filepath.Join(dir, "stdout.log"),
		StderrPath:         filepath.Join(dir, "stderr.log"),
		ScriptSnapshotPath: filepath.Join(dir, "script_snapshot.js"),
		SummaryPath:        filepath.Join(dir, "summary.json"),
	}

	if err := writeRunSummary(artifacts, 250*time.Millisecond, nil); err != nil {
		t.Fatalf("writeRunSummary returned error: %v", err)
	}

	content, err := os.ReadFile(artifacts.SummaryPath)
	if err != nil {
		t.Fatalf("failed to read summary: %v", err)
	}

	var summary RunSummary
	if err := json.Unmarshal(content, &summary); err != nil {
		t.Fatalf("failed to decode summary: %v", err)
	}
	if !summary.Success {
		t.Fatalf("expected success summary, got %+v", summary)
	}
	if summary.Source != artifacts.Source || summary.ScriptHash != artifacts.ScriptHash {
		t.Fatalf("unexpected summary content: %+v", summary)
	}
}

func TestExecutionRequestCarriesStackMode(t *testing.T) {
	cfg := &Config{
		ScriptText: "console.log('hi')",
		StackMode:  "playwright",
		Timeout:    3,
	}
	content, sourceLabel, ext, err := resolveScriptSource(cfg)
	if err != nil {
		t.Fatalf("resolveScriptSource returned error: %v", err)
	}
	request := pkgExecution.Request{
		ExecutionID:    "exec-test",
		SourceLabel:    sourceLabel,
		Ext:            ext,
		StackMode:      cfg.StackMode,
		ScriptHash:     pkgExecution.ComputeScriptHash(content),
		ScriptContent:  content,
		TimeoutMinutes: cfg.Timeout,
	}
	if request.StackMode != "playwright" {
		t.Fatalf("expected stack mode to be carried, got %q", request.StackMode)
	}
	if request.SourceLabel != "inline" || request.Ext != ".js" {
		t.Fatalf("unexpected request source fields: %+v", request)
	}
}
