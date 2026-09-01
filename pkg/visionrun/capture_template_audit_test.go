package visionrun

import (
	"path/filepath"
	"testing"
)

func TestCaptureTemplateAuditMatchesStoredRegionTemplates(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	sourceImage := filepath.Join(repoRoot, "fixtures", "layout.png")
	mustWriteSyntheticLayoutPNG(t, sourceImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "capture-template-audit",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}
	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: sourceImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}
	if _, err := RunInfer(bundle, InferOptions{}); err != nil {
		t.Fatalf("RunInfer failed: %v", err)
	}
	if _, err := RunCaptureContract(bundle); err != nil {
		t.Fatalf("RunCaptureContract failed: %v", err)
	}
	result, err := RunCaptureTemplateAudit(bundle)
	if err != nil {
		t.Fatalf("RunCaptureTemplateAudit failed: %v", err)
	}
	if result.Total == 0 || result.Matched == 0 {
		t.Fatalf("expected template matches, got %+v", result)
	}
	report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ReportPath)))
	if report["status"] != "pass" {
		t.Fatalf("expected pass status, got %+v", report)
	}
}
