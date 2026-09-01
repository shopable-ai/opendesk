package visionrun

import (
	"path/filepath"
	"testing"
)

func TestProbePlanIncludesCapturePreferences(t *testing.T) {
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
		RunID:         "probe-plan-capture-pref",
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
	mustWriteJSON(t, filepath.Join(bundle.InferDir, "chat_candidates.json"), map[string]any{
		"candidates": []map[string]any{{"id": "candidate-1"}},
	})

	result, err := RunProbePlan(bundle, ProbePlanOptions{})
	if err != nil {
		t.Fatalf("RunProbePlan failed: %v", err)
	}
	report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ReportPath)))
	steps := arrayOfMaps(report["steps"])
	if len(steps) == 0 {
		t.Fatalf("expected probe steps, got %+v", report)
	}
	foundConversationCapture := false
	foundInputCapture := false
	foundVisualReference := false
	for _, step := range steps {
		switch stringValue(step["action"]) {
		case "open_chat":
			if stringValue(step["capturePreference"]) == "conversation_capture" {
				foundConversationCapture = true
			}
		case "focus_input":
			if stringValue(step["capturePreference"]) == "input_capture" {
				foundInputCapture = true
			}
		}
		if mapValue(step["visualReference"])["referenceImagePath"] != nil {
			foundVisualReference = true
		}
	}
	if !foundConversationCapture || !foundInputCapture || !foundVisualReference {
		t.Fatalf("expected capture preferences in probe plan, got %+v", steps)
	}
}
