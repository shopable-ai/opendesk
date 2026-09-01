package visionrun

import (
	"path/filepath"
	"testing"
)

func TestRunValidateModeWithRealScreenshotWritesValidationReport(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	goldenImage := filepath.Join(repoRoot, "fixtures", "golden.png")
	realImage := filepath.Join(repoRoot, "fixtures", "real.png")
	mustWriteSyntheticLayoutPNG(t, goldenImage)
	mustWriteSyntheticLayoutPNG(t, realImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "run-validate-mode",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	result, err := Run(bundle, RunOptions{
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
	gates := mapValue(report["gates"])
	if gates["goldenPassed"] != true {
		t.Fatalf("expected goldenPassed=true, got %+v", gates)
	}
	if gates["realScreenshotValidationPassed"] != true {
		t.Fatalf("expected realScreenshotValidationPassed=true, got %+v", gates)
	}
	if _, err := readJSONMap(filepath.Join(bundle.RealAppDir, "validation_report.json")); err != nil {
		t.Fatalf("expected validation report: %v", err)
	}
	if result.Gates.RealScreenshotValidationPassed != true {
		t.Fatalf("expected returned validation gate=true, got %+v", result.Gates)
	}
}
