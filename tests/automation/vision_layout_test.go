package automation_test

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	. "opendesk/automation"
)

func TestVisionAnalyzeLayoutWithGenericHints(t *testing.T) {
	tmpDir := t.TempDir()
	imagePath := filepath.Join(tmpDir, "wechat_layout.png")
	makeSyntheticWechatLayout(t, imagePath)

	vision := NewVision()
	result, err := vision.AnalyzeLayout(map[string]interface{}{
		"imagePath":     imagePath,
		"cellSize":      6,
		"cellColorMode": "mean", // use mean for backward compatibility test
		"separatorHints": map[string]interface{}{
			"vertical": []interface{}{
				map[string]interface{}{"label": "left", "from": 0.04, "to": 0.12},
				map[string]interface{}{"label": "center", "from": 0.18, "to": 0.32},
			},
			"horizontal": []interface{}{
				map[string]interface{}{"label": "header", "from": 0.05, "to": 0.22},
				map[string]interface{}{"label": "input", "from": 0.60, "to": 0.88},
			},
		},
	})
	if err != nil {
		t.Fatalf("AnalyzeLayout failed: %v", err)
	}

	regions := mustRegions(t, result["regions"])
	if len(regions) != 5 {
		t.Fatalf("expected 5 coarse regions, got %d", len(regions))
	}

	vertical, horizontal := mustSeparatorPositions(t, result["separators"])
	assertPositionNear(t, vertical, 24, 10)
	assertPositionNear(t, vertical, 80, 12)
	assertPositionNear(t, horizontal, 28, 10)
	assertPositionNear(t, horizontal, 132, 14)

	annotatedPath := filepath.Join(tmpDir, "annotated.png")
	annotated, err := vision.AnnotateRegions(map[string]interface{}{
		"imagePath":  imagePath,
		"outputPath": annotatedPath,
		"regions":    result["regions"],
		"separators": result["separators"],
		"title":      "synthetic",
	})
	if err != nil {
		t.Fatalf("AnnotateRegions failed: %v", err)
	}
	if annotated["outputPath"] == "" {
		t.Fatalf("outputPath missing in annotate result")
	}
	if _, err := os.Stat(annotatedPath); err != nil {
		t.Fatalf("annotated file missing: %v", err)
	}
}

func makeSyntheticWechatLayout(t *testing.T, outPath string) {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 320, 180))

	fillRect(img, image.Rect(0, 0, 24, 180), color.RGBA{46, 46, 46, 255})
	fillRect(img, image.Rect(24, 0, 80, 180), color.RGBA{242, 242, 242, 255})
	fillRect(img, image.Rect(80, 0, 320, 28), color.RGBA{249, 249, 249, 255})
	fillRect(img, image.Rect(80, 28, 320, 132), color.RGBA{255, 255, 255, 255})
	fillRect(img, image.Rect(80, 132, 320, 180), color.RGBA{248, 248, 248, 255})

	fillRect(img, image.Rect(23, 0, 25, 180), color.RGBA{205, 205, 205, 255})
	fillRect(img, image.Rect(79, 0, 81, 180), color.RGBA{214, 214, 214, 255})
	fillRect(img, image.Rect(80, 27, 320, 29), color.RGBA{221, 221, 221, 255})
	fillRect(img, image.Rect(80, 131, 320, 133), color.RGBA{214, 214, 214, 255})

	f, err := os.Create(outPath)
	if err != nil {
		t.Fatalf("create image failed: %v", err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("encode image failed: %v", err)
	}
}

func fillRect(img *image.RGBA, rect image.Rectangle, c color.RGBA) {
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			img.SetRGBA(x, y, c)
		}
	}
}

func mustRegions(t *testing.T, raw any) []map[string]any {
	t.Helper()
	regions, ok := raw.([]map[string]any)
	if !ok || len(regions) == 0 {
		t.Fatalf("regions have unexpected public shape: %T %#v", raw, raw)
	}
	return regions
}

func mustSeparatorPositions(t *testing.T, raw any) (vertical, horizontal []int) {
	t.Helper()
	groups, ok := raw.(map[string]any)
	if !ok {
		t.Fatalf("separators have unexpected public shape: %T", raw)
	}
	for _, group := range []struct {
		name string
		out  *[]int
	}{{"vertical", &vertical}, {"horizontal", &horizontal}} {
		items, ok := groups[group.name].([]map[string]any)
		if !ok {
			t.Fatalf("%s separators have unexpected public shape: %T", group.name, groups[group.name])
		}
		for _, item := range items {
			position, ok := item["position"].(int)
			if !ok {
				t.Fatalf("%s separator position has unexpected type: %T", group.name, item["position"])
			}
			*group.out = append(*group.out, position)
		}
	}
	return vertical, horizontal
}

func assertPositionNear(t *testing.T, positions []int, want, tolerance int) {
	t.Helper()
	for _, position := range positions {
		if position-want <= tolerance && want-position <= tolerance {
			return
		}
	}
	t.Fatalf("no separator within %dpx of %d; got %v", tolerance, want, positions)
}
