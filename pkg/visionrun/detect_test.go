package visionrun

import (
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunDetectWritesRegionsContract(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	sourceImage := filepath.Join(repoRoot, "fixtures", "layout.png")
	mustWriteSyntheticLayoutPNG(t, sourceImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "detect-contract",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	result, err := RunDetect(bundle, DetectOptions{
		SourceImagePath: sourceImage,
	})
	if err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}

	if result.RegionCount < 3 {
		t.Fatalf("expected at least 3 regions, got %d", result.RegionCount)
	}
	if result.RegionsPath != ".runtime/runs/detect-contract/detect/regions.json" {
		t.Fatalf("unexpected regions path: %s", result.RegionsPath)
	}

	report := mustReadJSON(t, filepath.Join(bundle.DetectDir, "regions.json"))
	if report["runId"] != "detect-contract" {
		t.Fatalf("unexpected runId: %+v", report)
	}
	if report["sourceImage"] != ".runtime/runs/detect-contract/capture/source.png" {
		t.Fatalf("unexpected sourceImage: %+v", report)
	}

	regionsRaw, ok := report["regions"].([]interface{})
	if !ok || len(regionsRaw) < 3 {
		t.Fatalf("regions missing or too small: %+v", report["regions"])
	}
	for _, raw := range regionsRaw {
		region, ok := raw.(map[string]interface{})
		if !ok {
			t.Fatalf("invalid region: %#v", raw)
		}
		for _, key := range []string{"id", "role", "bbox", "avgColor", "ocrText", "confidence"} {
			if _, ok := region[key]; !ok {
				t.Fatalf("region missing key %s: %+v", key, region)
			}
		}
		if region["ocrText"] != "" {
			t.Fatalf("expected empty ocrText baseline, got %+v", region["ocrText"])
		}
	}

	if _, err := os.Stat(filepath.Join(bundle.DetectDir, "annotated.png")); err != nil {
		t.Fatalf("annotated image missing: %v", err)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["nextStep"] != "infer-structure" {
		t.Fatalf("expected nextStep=infer-structure, got %+v", decision)
	}

	auditRaw, err := os.ReadFile(bundle.AuditLog)
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	if !strings.Contains(string(auditRaw), "\"stage\":\"detect.layout\"") {
		t.Fatalf("audit log missing detect event: %s", string(auditRaw))
	}
}

func mustWriteSyntheticLayoutPNG(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}

	img := image.NewRGBA(image.Rect(0, 0, 320, 180))
	fillRect(img, image.Rect(0, 0, 56, 180), color.RGBA{52, 52, 52, 255})
	fillRect(img, image.Rect(56, 0, 160, 180), color.RGBA{237, 237, 237, 255})
	fillRect(img, image.Rect(160, 0, 320, 32), color.RGBA{249, 249, 249, 255})
	fillRect(img, image.Rect(160, 32, 320, 132), color.RGBA{255, 255, 255, 255})
	fillRect(img, image.Rect(160, 132, 320, 180), color.RGBA{246, 246, 246, 255})
	fillRect(img, image.Rect(55, 0, 57, 180), color.RGBA{205, 205, 205, 255})
	fillRect(img, image.Rect(159, 0, 161, 180), color.RGBA{214, 214, 214, 255})
	fillRect(img, image.Rect(160, 31, 320, 33), color.RGBA{224, 224, 224, 255})
	fillRect(img, image.Rect(160, 131, 320, 133), color.RGBA{214, 214, 214, 255})

	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		t.Fatalf("encode %s: %v", path, err)
	}
}

func mustWriteSolidPNG(t *testing.T, path string, width, height int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	fillRect(img, image.Rect(0, 0, width, height), color.RGBA{200, 200, 200, 255})
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		t.Fatalf("encode %s: %v", path, err)
	}
}

func fillRect(img *image.RGBA, rect image.Rectangle, c color.RGBA) {
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			img.SetRGBA(x, y, c)
		}
	}
}

func TestArtifactPathUsesForwardSlashes(t *testing.T) {
	payload := map[string]any{
		"path": artifactPath("demo-run", "detect/regions.json"),
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	if !strings.Contains(string(data), ".runtime/runs/demo-run/detect/regions.json") {
		t.Fatalf("unexpected artifact path json: %s", string(data))
	}
}
