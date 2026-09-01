package visionrun

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestRunCompareWritesReportAndDiff(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "compare-smoke",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	source := image.NewRGBA(image.Rect(0, 0, 120, 80))
	fillRect(source, image.Rect(0, 0, 120, 80), color.RGBA{240, 240, 240, 255})
	fillRect(source, image.Rect(0, 0, 30, 80), color.RGBA{60, 60, 60, 255})

	mirror := image.NewRGBA(image.Rect(0, 0, 120, 80))
	fillRect(mirror, image.Rect(0, 0, 120, 80), color.RGBA{245, 245, 245, 255})
	fillRect(mirror, image.Rect(0, 0, 26, 80), color.RGBA{80, 80, 80, 255})

	mustWritePNG(t, filepath.Join(bundle.CaptureDir, "source.png"), source)
	mustWritePNG(t, filepath.Join(bundle.MirrorDir, "mirror.png"), mirror)

	result, err := RunCompare(bundle, CompareOptions{})
	if err != nil {
		t.Fatalf("RunCompare failed: %v", err)
	}
	if result.ReportPath != ".runtime/runs/compare-smoke/compare/report.json" {
		t.Fatalf("unexpected report path: %s", result.ReportPath)
	}
	if result.DiffImagePath != ".runtime/runs/compare-smoke/compare/diff.png" {
		t.Fatalf("unexpected diff path: %s", result.DiffImagePath)
	}

	report, err := decodeCompareReport(filepath.Join(bundle.CompareDir, "report.json"))
	if err != nil {
		t.Fatalf("decode report: %v", err)
	}
	for _, key := range []string{"runId", "status", "pixelDiffRatio", "summary", "recommendations", "majorDeviationRegions", "validationTarget", "realValidationPassed", "diagnose"} {
		if _, ok := report[key]; !ok {
			t.Fatalf("compare report missing key %s: %+v", key, report)
		}
	}

	if _, err := os.Stat(filepath.Join(bundle.CompareDir, "diff.png")); err != nil {
		t.Fatalf("diff image missing: %v", err)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["nextStep"] != "ocr-role-inference" {
		t.Fatalf("expected nextStep=ocr-role-inference, got %+v", decision)
	}
}

func mustWritePNG(t *testing.T, path string, img image.Image) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		t.Fatalf("encode %s: %v", path, err)
	}
}
