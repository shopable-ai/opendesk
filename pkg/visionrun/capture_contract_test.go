package visionrun

import (
	"path/filepath"
	"testing"
)

func TestCaptureContractEmitsPreciseAndCoarseRegions(t *testing.T) {
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
		RunID:         "capture-contract",
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

	result, err := RunCaptureContract(bundle)
	if err != nil {
		t.Fatalf("RunCaptureContract failed: %v", err)
	}
	report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ReportPath)))
	captures := arrayOfMaps(report["captures"])
	if len(captures) < 6 {
		t.Fatalf("expected capture entries, got %+v", report)
	}
	foundSearch := false
	foundReplyCoarse := false
	foundReferenceImage := false
	for _, item := range captures {
		if stringValue(item["zoneId"]) == "search_area" && stringValue(item["precision"]) == "high" {
			foundSearch = true
		}
		if stringValue(item["zoneId"]) == "message_list" && stringValue(item["precision"]) == "coarse" {
			foundReplyCoarse = true
		}
		templateMatch := mapValue(item["templateMatch"])
		searchWindow := mapValue(item["searchWindow"])
		if stringValue(item["referenceImagePath"]) != "" &&
			mapValue(item["visualFingerprint"])["avgColor"] != nil &&
			intValue(searchWindow["width"]) > 0 &&
			floatValue(templateMatch["minScore"]) > 0 {
			foundReferenceImage = true
		}
	}
	if !foundSearch || !foundReplyCoarse || !foundReferenceImage {
		t.Fatalf("expected weighted capture contract categories, got %+v", captures)
	}
}
