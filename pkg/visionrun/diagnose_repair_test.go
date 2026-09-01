package visionrun

import (
	"path/filepath"
	"testing"
)

func TestRunValidateFailureRecordsDiagnoseRepairAndRerun(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	goldenImage := filepath.Join(repoRoot, "fixtures", "golden.png")
	realImage := filepath.Join(repoRoot, "fixtures", "real_bad.png")
	mustWriteSyntheticLayoutPNG(t, goldenImage)
	mustWriteSolidPNG(t, realImage, 320, 180)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "run-validate-fail",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	_, err = Run(bundle, RunOptions{
		Mode:                     RunModeValidate,
		SourceImagePath:          goldenImage,
		RealScreenshotPath:       realImage,
		UseRuntimePreflight:      true,
		AllowOfflineSourceImage:  true,
		MaxRealValidationRetries: 1,
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	report := mustReadJSON(t, bundle.RunReport)
	stages := arrayOfMaps(report["stages"])
	foundDiagnose := false
	foundRepair := false
	foundRerun := false
	for _, stage := range stages {
		switch stringValue(stage["name"]) {
		case string(StageDiagnose):
			foundDiagnose = true
		case string(StageRepair):
			foundRepair = true
		case string(StageReRun):
			foundRerun = true
		}
	}
	if !foundDiagnose || !foundRepair || !foundRerun {
		t.Fatalf("expected diagnose/repair/rerun stages, got %+v", stages)
	}
	history := arrayOfMaps(report["repairHistory"])
	if len(history) == 0 {
		t.Fatalf("expected repair history, got %+v", report)
	}
}
