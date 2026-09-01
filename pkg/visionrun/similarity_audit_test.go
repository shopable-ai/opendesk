package visionrun

import (
	"math"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestGoldenEnvironmentSimilarityIsReportedWithZoneBreakdown(t *testing.T) {
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "..", ".."))
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
		RunID:         "golden-sim-audit",
		PreflightPath: filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json"),
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	goldenImage := filepath.Join(repoRoot, "artifacts", "dev-html-samples", "wechatweb", "capture", "source.png")
	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: goldenImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}
	if _, err := RunInfer(bundle, InferOptions{}); err != nil {
		t.Fatalf("RunInfer failed: %v", err)
	}

	result, err := RunRealAppValidation(bundle, RealAppValidationOptions{
		ScreenshotPath: goldenImage,
		Label:          "golden-self-audit",
	})
	if err != nil {
		t.Fatalf("RunRealAppValidation failed: %v", err)
	}
	if !result.ValidationPassed {
		report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ValidationReportPath)))
		t.Fatalf("expected golden self audit to pass after current comparison updates, got fail: %+v", report)
	}

	report := mustReadJSON(t, filepath.Join(repoRoot, filepath.FromSlash(result.ValidationReportPath)))
	if report["averageZoneScore"] == nil {
		t.Fatalf("expected averageZoneScore in validation report: %+v", report)
	}
	if report["weightedZoneScore"] == nil {
		t.Fatalf("expected weightedZoneScore in validation report: %+v", report)
	}
	zoneDiffs := arrayOfMaps(report["zoneDiffs"])
	if len(zoneDiffs) == 0 {
		t.Fatalf("expected zoneDiffs in validation report: %+v", report)
	}
	foundColor := false
	for _, diff := range zoneDiffs {
		if mapValue(diff["background"])["golden"] != nil {
			foundColor = true
			break
		}
	}
	if !foundColor {
		t.Fatalf("expected background color comparison in zoneDiffs: %+v", zoneDiffs)
	}
}

func TestZoneDiffIncludesColorAndSizeSignals(t *testing.T) {
	goldenZone := map[string]any{
		"bbox":            map[string]any{"x": 60, "y": 0, "width": 288, "height": 999},
		"backgroundColor": "rgb(246, 246, 246)",
	}
	realZone := map[string]any{
		"bbox":            map[string]any{"x": 64, "y": 0, "width": 64, "height": 999},
		"backgroundColor": "#ededed",
	}
	goldenLayout := map[string]any{"window": map[string]any{"width": 1867, "height": 999}}
	realLayout := map[string]any{"window": map[string]any{"width": 1867, "height": 999}}

	diff := zoneDiff("conversation_list", goldenZone, realZone, goldenLayout, realLayout, 1.35)
	if diff["score"] == nil {
		t.Fatalf("expected score in zone diff: %+v", diff)
	}
	if diff["background"] == nil {
		t.Fatalf("expected background comparison: %+v", diff)
	}
	if diff["positionDelta"] == nil {
		t.Fatalf("expected positionDelta comparison: %+v", diff)
	}
	if math.Abs(floatValue(mapValue(diff["positionDelta"])["dw"])) <= 0 {
		t.Fatalf("expected width delta signal: %+v", diff)
	}
}
