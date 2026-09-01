package visionrun

import (
	"path/filepath"
	"testing"
)

func TestRunParseModeWritesUnifiedRunReport(t *testing.T) {
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
		RunID:         "run-parse-mode",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	result, err := Run(bundle, RunOptions{
		Mode:                     RunModeParse,
		SourceImagePath:          sourceImage,
		UseRuntimePreflight:      true,
		AllowOfflineSourceImage:  true,
		MaxRealValidationRetries: 1,
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	report := mustReadJSON(t, bundle.RunReport)
	if report["mode"] != "parse" {
		t.Fatalf("expected parse mode, got %+v", report)
	}
	gates := mapValue(report["gates"])
	if gates["goldenPassed"] != true {
		t.Fatalf("expected goldenPassed=true, got %+v", gates)
	}
	if gates["realScreenshotValidationPassed"] != false {
		t.Fatalf("expected realScreenshotValidationPassed=false in parse mode, got %+v", gates)
	}
	stages := arrayOfMaps(report["stages"])
	if len(stages) < 3 {
		t.Fatalf("expected runtime+golden stages, got %+v", stages)
	}
	if result.Gates.GoldenPassed != true {
		t.Fatalf("expected returned gates to reflect parse result, got %+v", result.Gates)
	}
}
