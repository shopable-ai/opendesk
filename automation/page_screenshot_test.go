package automation

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"path/filepath"
	"testing"
)

func TestParseScreenshotOptionsFromStructPointer(t *testing.T) {
	raw := &ScreenshotOptions{
		Path:   ".runtime/temp/test.png",
		Target: "screen",
		Clip: &ClipOptions{
			X:      10,
			Y:      20,
			Width:  300,
			Height: 200,
		},
	}

	opts, err := parseScreenshotOptions(raw)
	if err != nil {
		t.Fatalf("parseScreenshotOptions returned error: %v", err)
	}
	if opts.Path != ".runtime/temp/test.png" {
		t.Fatalf("unexpected path: %s", opts.Path)
	}
	if opts.Target != "screen" {
		t.Fatalf("unexpected target: %s", opts.Target)
	}
	if opts.Clip == nil {
		t.Fatalf("expected clip to be parsed")
	}
	if opts.Clip.X != 10 || opts.Clip.Y != 20 || opts.Clip.Width != 300 || opts.Clip.Height != 200 {
		t.Fatalf("unexpected clip: %+v", opts.Clip)
	}
}

func TestParseScreenshotOptionsRejectsInvalidClip(t *testing.T) {
	_, err := parseScreenshotOptions(map[string]interface{}{
		"clip": map[string]interface{}{
			"x":      0,
			"y":      0,
			"width":  0,
			"height": 100,
		},
	})
	if err == nil {
		t.Fatalf("expected invalid clip error")
	}
}

func TestParseScreenshotOptionsDefaultTarget(t *testing.T) {
	opts, err := parseScreenshotOptions(nil)
	if err != nil {
		t.Fatalf("parseScreenshotOptions returned error: %v", err)
	}
	if opts.Target != DefaultTarget {
		t.Fatalf("unexpected default target: %s", opts.Target)
	}
}

func TestParseScreenshotOptionsDisplayIndex(t *testing.T) {
	opts, err := parseScreenshotOptions(map[string]interface{}{
		"target":       "screen",
		"displayIndex": 2,
	})
	if err != nil {
		t.Fatalf("parseScreenshotOptions returned error: %v", err)
	}
	if opts.DisplayIndex != 2 {
		t.Fatalf("unexpected displayIndex: %d", opts.DisplayIndex)
	}
}

func TestParseScreenshotOptionsDisplayIndexPascalCase(t *testing.T) {
	opts, err := parseScreenshotOptions(map[string]interface{}{
		"target":       "screen",
		"DisplayIndex": 2,
	})
	if err != nil {
		t.Fatalf("parseScreenshotOptions returned error: %v", err)
	}
	if opts.DisplayIndex != 2 {
		t.Fatalf("unexpected displayIndex: %d", opts.DisplayIndex)
	}
}

func TestParseScreenshotOptionsReturnType(t *testing.T) {
	opts, err := parseScreenshotOptions(map[string]interface{}{
		"returnType": "object",
	})
	if err != nil {
		t.Fatalf("parseScreenshotOptions returned error: %v", err)
	}
	if opts.ReturnType != "object" {
		t.Fatalf("unexpected returnType: %s", opts.ReturnType)
	}
}

func TestParseScreenshotOptionsRejectsNegativeDisplayIndex(t *testing.T) {
	_, err := parseScreenshotOptions(map[string]interface{}{
		"displayIndex": -1,
	})
	if err == nil {
		t.Fatalf("expected invalid displayIndex error")
	}
}

func TestParseScreenshotOptionsRejectsInvalidReturnType(t *testing.T) {
	_, err := parseScreenshotOptions(map[string]interface{}{
		"returnType": "ref",
	})
	if err == nil {
		t.Fatalf("expected invalid returnType error")
	}
}

func TestBuildScreenshotResponsePathAndObject(t *testing.T) {
	tmpDir := t.TempDir()
	page := NewPage()
	pngBytes := makeTinyPNG(t)

	pathResult, err := page.buildScreenshotResponse(
		ScreenshotOptions{Path: filepath.Join(tmpDir, "shot.png"), ReturnType: "path"},
		pngBytes,
		2,
		1,
		"clip",
		"robotgo",
		false,
	)
	if err != nil {
		t.Fatalf("buildScreenshotResponse(path) returned error: %v", err)
	}
	pathString, ok := pathResult.(string)
	if !ok || pathString == "" {
		t.Fatalf("expected path string, got %#v", pathResult)
	}

	objectResult, err := page.buildScreenshotResponse(
		ScreenshotOptions{Path: filepath.Join(tmpDir, "shot-object.png"), ReturnType: "object"},
		pngBytes,
		2,
		1,
		"clip",
		"robotgo",
		false,
	)
	if err != nil {
		t.Fatalf("buildScreenshotResponse(object) returned error: %v", err)
	}
	obj, ok := objectResult.(map[string]interface{})
	if !ok {
		t.Fatalf("expected object result, got %#v", objectResult)
	}
	if obj["mimeType"] != "image/png" {
		t.Fatalf("unexpected mimeType: %v", obj["mimeType"])
	}
	if obj["width"] != 2 || obj["height"] != 1 {
		t.Fatalf("unexpected dimensions: %#v", obj)
	}
	if obj["path"] == "" {
		t.Fatalf("expected object path to be populated")
	}
}

func TestBuildScreenshotResponseGeneratesTempPathForObject(t *testing.T) {
	page := NewPage()
	pngBytes := makeTinyPNG(t)

	result, err := page.buildScreenshotResponse(
		ScreenshotOptions{ReturnType: "object"},
		pngBytes,
		2,
		1,
		"clip",
		"robotgo",
		false,
	)
	if err != nil {
		t.Fatalf("buildScreenshotResponse(object) returned error: %v", err)
	}
	obj := result.(map[string]interface{})
	if obj["path"] == "" {
		t.Fatalf("expected generated temp path")
	}
}

func TestBuildScreenshotResponseNone(t *testing.T) {
	page := NewPage()
	pngBytes := makeTinyPNG(t)

	result, err := page.buildScreenshotResponse(
		ScreenshotOptions{ReturnType: "none"},
		pngBytes,
		2,
		1,
		"clip",
		"robotgo",
		false,
	)
	if err != nil {
		t.Fatalf("buildScreenshotResponse(none) returned error: %v", err)
	}
	if result != nil {
		t.Fatalf("expected nil result, got %#v", result)
	}
}

func TestBuildScreenshotResponseBytes(t *testing.T) {
	page := NewPage()
	pngBytes := makeTinyPNG(t)

	result, err := page.buildScreenshotResponse(
		ScreenshotOptions{ReturnType: "bytes"},
		pngBytes,
		2,
		1,
		"clip",
		"robotgo",
		false,
	)
	if err != nil {
		t.Fatalf("buildScreenshotResponse(bytes) returned error: %v", err)
	}
	out, ok := result.([]byte)
	if !ok {
		t.Fatalf("expected []byte result, got %#v", result)
	}
	if len(out) == 0 {
		t.Fatalf("expected non-empty bytes")
	}
}

func makeTinyPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 1))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	img.Set(1, 0, color.RGBA{G: 255, A: 255})

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}
	return buf.Bytes()
}
