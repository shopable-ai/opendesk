package visionrun

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunInferWritesStructureFirstArtifacts(t *testing.T) {
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
		RunID:         "infer-contract",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: sourceImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}

	result, err := RunInfer(bundle, InferOptions{})
	if err != nil {
		t.Fatalf("RunInfer failed: %v", err)
	}

	for _, rel := range []string{
		"detect/layout_model.json",
		"infer/app_classification.json",
		"infer/zones.json",
		"infer/action_targets.json",
		"infer/ocr_map.json",
		"verify/actionability_report.json",
	} {
		if _, err := os.Stat(filepath.Join(bundle.BaseDir, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("expected artifact missing %s: %v", rel, err)
		}
	}

	layoutModel := mustReadJSON(t, filepath.Join(bundle.DetectDir, "layout_model.json"))
	structure := mapValue(layoutModel["structure"])
	if intValue(structure["columnCount"]) < 2 {
		t.Fatalf("expected at least 2 columns, got %+v", layoutModel)
	}
	columnRatios, ok := structure["columnRatios"].([]interface{})
	if !ok || len(columnRatios) < 2 {
		t.Fatalf("expected column ratios, got %+v", structure)
	}
	boundaries := mapValue(structure["boundaries"])
	if len(arrayOfMaps(boundaries["vertical"])) == 0 {
		t.Fatalf("expected vertical boundaries, got %+v", structure)
	}

	app := mustReadJSON(t, filepath.Join(bundle.InferDir, "app_classification.json"))
	if app["pageType"] != "wechat_chat_page" {
		t.Fatalf("expected wechat_chat_page, got %+v", app)
	}
	if app["canProceed"] != true {
		t.Fatalf("expected canProceed=true, got %+v", app)
	}

	zones := mustReadJSON(t, filepath.Join(bundle.InferDir, "zones.json"))
	if zones["canProceed"] != true {
		t.Fatalf("expected zones canProceed=true, got %+v", zones)
	}
	zoneByIDPayload := mapValue(zones["zoneByID"])
	if _, ok := zoneByIDPayload["search_area"]; !ok {
		t.Fatalf("expected search_area in zone index, got %+v", zoneByIDPayload)
	}
	layoutSummary := mapValue(zones["layoutSummary"])
	if mapValue(layoutSummary["conversation_list"])["widthRatio"] == nil {
		t.Fatalf("expected layout summary width ratio, got %+v", layoutSummary)
	}

	targets := mustReadJSON(t, filepath.Join(bundle.InferDir, "action_targets.json"))
	targetItems, ok := targets["targets"].([]interface{})
	if !ok || len(targetItems) < 4 {
		t.Fatalf("expected >=4 action targets, got %+v", targets)
	}
	firstTarget, ok := targetItems[0].(map[string]interface{})
	if !ok {
		t.Fatalf("invalid first target: %+v", targetItems[0])
	}
	candidates, ok := firstTarget["candidates"].([]interface{})
	if !ok || len(candidates) == 0 {
		t.Fatalf("expected open_chat candidates, got %+v", firstTarget)
	}

	actionability := mustReadJSON(t, filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if actionability["canProceed"] != true {
		t.Fatalf("expected canProceed=true, got %+v", actionability)
	}
	if actionability["canSend"] != false {
		t.Fatalf("expected canSend=false in round 1, got %+v", actionability)
	}

	ocrMap := mustReadJSON(t, filepath.Join(bundle.InferDir, "ocr_map.json"))
	zoneBindings, ok := ocrMap["zoneBindings"].([]interface{})
	if !ok || len(zoneBindings) < 3 {
		t.Fatalf("expected OCR zone bindings, got %+v", ocrMap)
	}
	textAnchors, ok := ocrMap["textAnchors"].([]interface{})
	if !ok || len(textAnchors) == 0 {
		t.Fatalf("expected OCR text anchors, got %+v", ocrMap)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["nextStep"] != "probe-open-chat" {
		t.Fatalf("expected nextStep=probe-open-chat, got %+v", decision)
	}
	if decision["canProceed"] != true {
		t.Fatalf("expected canProceed=true, got %+v", decision)
	}

	if result.TargetCount < 4 || result.ZoneCount < 4 {
		t.Fatalf("unexpected infer result counts: %+v", result)
	}
}
