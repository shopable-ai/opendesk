package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/scriptloader"
)

type mainTestLoader func(context.Context, string) (*scriptloader.ScriptSource, error)

func (loader mainTestLoader) Load(ctx context.Context, path string) (*scriptloader.ScriptSource, error) {
	return loader(ctx, path)
}

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

func TestResolveProtectedFileUsesScriptLoader(t *testing.T) {
	loadCalls := 0
	loader := mainTestLoader(func(_ context.Context, path string) (*scriptloader.ScriptSource, error) {
		loadCalls++
		return &scriptloader.ScriptSource{
			Content: []byte("protected plaintext in memory"),
			Source:  "package:" + path,
			Ext:     ".js",
			Protection: scriptloader.ProtectionInfo{
				Mode:          scriptloader.ProtectionProtected,
				PackageDigest: "package-digest",
			},
		}, nil
	})
	source, err := resolveScriptSourceWithLoader(context.Background(), &Config{ScriptPath: "recipe.odpkg"}, loader)
	if err != nil {
		t.Fatal(err)
	}
	if loadCalls != 1 || source.Protection.Mode != scriptloader.ProtectionProtected || source.Source != "package:recipe.odpkg" {
		t.Fatalf("protected source resolution calls=%d source=%#v", loadCalls, source)
	}
}

func TestDirectProtectedExportAndHTTPModesFailBeforeSourceLoad(t *testing.T) {
	exportPath := filepath.Join(t.TempDir(), "export.js")
	err := executeScript(&Config{ScriptPath: "missing.odpkg", SaveLastScript: exportPath})
	if err == nil || !strings.Contains(err.Error(), "protected_source_export_denied") {
		t.Fatalf("protected export error = %v", err)
	}
	if _, statErr := os.Stat(exportPath); !os.IsNotExist(statErr) {
		t.Fatalf("protected export path was created: %v", statErr)
	}
	err = executeScript(&Config{ScriptPath: "missing.odpkg", HttpMode: true})
	if err == nil || !strings.Contains(err.Error(), "unsupported_format") {
		t.Fatalf("protected HTTP combination error = %v", err)
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

func TestResolveAccessibilityWorkbenchArtifactRoot(t *testing.T) {
	development := resolveAccessibilityWorkbenchArtifactRoot("/workspace/opendesk", "", true)
	wantDevelopment := filepath.Join("/workspace/opendesk", ".runtime", "accessibility-inspector")
	if development != wantDevelopment {
		t.Fatalf("development artifact root = %q, want %q", development, wantDevelopment)
	}

	installed := resolveAccessibilityWorkbenchArtifactRoot("/tmp", "/user/config", false)
	wantInstalled := filepath.Join("/user/config", "opendesk", "accessibility-inspector")
	if installed != wantInstalled {
		t.Fatalf("installed artifact root = %q, want %q", installed, wantInstalled)
	}
}

func TestAccessibilityWorkbenchUsesOnlyFixedProductPort(t *testing.T) {
	if !accessibilityWorkbenchEnabledOnPort("60844") {
		t.Fatal("fixed Inspector product port was disabled")
	}
	for _, port := range []string{"60845", "0", "", "localhost:60844"} {
		if accessibilityWorkbenchEnabledOnPort(port) {
			t.Fatalf("Inspector unexpectedly enabled on non-product port %q", port)
		}
	}
}

func TestValidateAccessibilityWorkbenchFrontendRoot(t *testing.T) {
	root := t.TempDir()
	if _, err := validateAccessibilityWorkbenchFrontendRoot(root); err == nil {
		t.Fatal("empty frontend root was accepted")
	}
	for _, relative := range []string{"index.html", filepath.Join("assets", "app.css"), filepath.Join("assets", "app.js"), filepath.Join("assets", "model.js")} {
		path := filepath.Join(root, relative)
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(relative), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	validated, err := validateAccessibilityWorkbenchFrontendRoot(root)
	if err != nil || validated != filepath.Clean(root) {
		t.Fatalf("validated frontend root = %q, %v", validated, err)
	}
	first, err := randomAccessibilityWorkbenchControlToken()
	if err != nil {
		t.Fatal(err)
	}
	second, err := randomAccessibilityWorkbenchControlToken()
	if err != nil || len(first) != 64 || len(second) != 64 || first == second {
		t.Fatalf("control tokens are not independent 256-bit values: %q %q, %v", first, second, err)
	}
}
