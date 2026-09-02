package visionrun

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunValidateModeAutoUsesLatestRealReport(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	golden := filepath.Join(repoRoot, "tests", "wechat", "fixtures", "golden-samples", "sample-a", "capture", "source.png")
	real := filepath.Join(repoRoot, ".runtime", "temp", "mac", "wechat_region_map_source.png")
	report := filepath.Join(repoRoot, ".runtime", "temp", "mac", "wechat_region_map_latest.json")
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
		RunID:         "run-auto-real-report",
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

	runReport := mustReadJSON(t, bundle.RunReport)
	input := mapValue(runReport["input"])
	if stringValue(input["realReportPath"]) == "" {
		t.Fatalf("expected auto-selected realReportPath, got %+v", input)
	}
}
