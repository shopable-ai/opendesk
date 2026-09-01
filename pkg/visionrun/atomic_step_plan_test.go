package visionrun

import (
	"path/filepath"
	"testing"
)

func TestAtomicStepPlanEmitsSingleStepsAndBundles(t *testing.T) {
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
		RunID:         "atomic-step-plan",
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
	mustWriteJSON(t, filepath.Join(bundle.VerifyDir, "actionability_report.json"), map[string]any{
		"allowedActions": []string{"open_chat", "focus_input", "read_reply"},
	})

	result, err := RunAtomicStepPlan(bundle, AtomicStepPlanOptions{})
	if err != nil {
		t.Fatalf("RunAtomicStepPlan failed: %v", err)
	}
	report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ReportPath)))
	if intValue(report["stepCount"]) < 10 {
		t.Fatalf("expected many atomic steps, got %+v", report)
	}
	steps := arrayOfMaps(report["steps"])
	foundSearch := false
	foundSend := false
	for _, step := range steps {
		switch stringValue(step["id"]) {
		case "focus_search_input":
			foundSearch = true
		case "click_send":
			foundSend = true
		}
	}
	if !foundSearch || !foundSend {
		t.Fatalf("expected search/send atomic steps, got %+v", steps)
	}
	if len(arrayOfMaps(report["bundles"])) < 3 {
		t.Fatalf("expected gradual integration bundles, got %+v", report)
	}
}
