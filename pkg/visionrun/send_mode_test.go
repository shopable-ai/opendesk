package visionrun

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunSendModeRecordsExecuteSendStageWhenSendAllowedWouldBeReached(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	golden := filepath.Join(repoRoot, "artifacts", "dev-html-samples", "wechatweb", "capture", "source.png")
	real := filepath.Join(repoRoot, "temp", "mac", "wechat_region_map_source.png")
	report := filepath.Join(repoRoot, "temp", "mac", "wechat_region_map_latest.json")
	mustWriteSyntheticLayoutPNG(t, golden)
	mustWriteSyntheticLayoutPNG(t, real)
	mustWriteJSON(t, report, map[string]any{
		"timestamp":      "2026-04-07T00:00:00Z",
		"workerType":     "wechat_region_map",
		"reportPath":     report,
		"window":         map[string]any{"x": 1, "y": 2, "width": 320, "height": 180},
		"screenshotPath": real,
	})

	oldWd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd failed: %v", err)
	}
	defer func() { _ = os.Chdir(oldWd) }()
	if err := os.Chdir(repoRoot); err != nil {
		t.Fatalf("Chdir failed: %v", err)
	}

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "run-send-mode",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	_, err = Run(bundle, RunOptions{
		Mode:                     RunModeValidate,
		UseRuntimePreflight:      true,
		AllowOfflineSourceImage:  true,
		MaxRealValidationRetries: 1,
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	reportJSON := mustReadJSON(t, bundle.RunReport)
	stages := arrayOfMaps(reportJSON["stages"])
	foundJudgeRealValidation := false
	for _, stage := range stages {
		if stringValue(stage["name"]) == string(StageJudgeRealValidation) {
			foundJudgeRealValidation = true
		}
	}
	if !foundJudgeRealValidation {
		t.Fatalf("expected real validation stage, got %+v", stages)
	}
}
