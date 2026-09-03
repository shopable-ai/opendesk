//go:build opencv

package automation

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestImageColorFindPosKeepsPureGoContractWithOpenCVInstalled(t *testing.T) {
	if templateMatchBackend != "purego" {
		t.Fatalf("expected canonical pure-Go template matching backend, got %q", templateMatchBackend)
	}

	source := image.NewNRGBA(image.Rect(0, 0, 12, 10))
	background := color.NRGBA{R: 3, G: 7, B: 11, A: 255}
	for y := 0; y < source.Bounds().Dy(); y++ {
		for x := 0; x < source.Bounds().Dx(); x++ {
			source.SetNRGBA(x, y, background)
		}
	}

	template := image.NewNRGBA(image.Rect(0, 0, 3, 2))
	pixels := []color.NRGBA{
		{R: 240, G: 10, B: 30, A: 255},
		{R: 20, G: 220, B: 40, A: 255},
		{R: 30, G: 50, B: 230, A: 255},
		{R: 200, G: 180, B: 20, A: 255},
		{R: 120, G: 40, B: 210, A: 255},
		{R: 15, G: 190, B: 180, A: 255},
	}
	for index, pixel := range pixels {
		x := index % template.Bounds().Dx()
		y := index / template.Bounds().Dx()
		template.SetNRGBA(x, y, pixel)
		source.SetNRGBA(6+x, 4+y, pixel)
	}

	if x, y, confidence, ok := findTemplateMatchOpenCVExperimental(source, template); !ok {
		t.Fatal("experimental OpenCV template matching failed")
	} else if x != 6 || y != 4 || confidence < 0.99 {
		t.Fatalf("unexpected direct OpenCV result: x=%d y=%d confidence=%.6f", x, y, confidence)
	}

	result, err := NewImageColor().FindPos(opencvTestDataURL(t, source), opencvTestDataURL(t, template), 0.99)
	if err != nil {
		t.Fatal(err)
	}
	if found, _ := result["found"].(bool); !found {
		t.Fatalf("expected template to be found, result=%v", result)
	}
	if result["x"] != 6 || result["y"] != 4 {
		t.Fatalf("unexpected ImageColor coordinates: result=%v", result)
	}
	if result["width"] != 3 || result["height"] != 2 {
		t.Fatalf("unexpected template dimensions: result=%v", result)
	}
	confidence, ok := result["confidence"].(float64)
	if !ok || confidence < 0.99 {
		t.Fatalf("unexpected ImageColor confidence: result=%v", result)
	}
}

func TestExperimentalOpenCVScoreDoesNotSharePureGoThreshold(t *testing.T) {
	template := image.NewNRGBA(image.Rect(0, 0, 8, 6))
	for y := 0; y < template.Bounds().Dy(); y++ {
		for x := 0; x < template.Bounds().Dx(); x++ {
			template.SetNRGBA(x, y, color.NRGBA{
				R: uint8(30 + x*11 + y*3), G: uint8(60 + x*5 + y*7), B: uint8(90 + x*3 + y*9), A: 255,
			})
		}
	}
	source := image.NewNRGBA(image.Rect(0, 0, 20, 16))
	for y := 0; y < source.Bounds().Dy(); y++ {
		for x := 0; x < source.Bounds().Dx(); x++ {
			source.SetNRGBA(x, y, color.NRGBA{R: 4, G: 8, B: 12, A: 255})
		}
	}
	for y := 0; y < template.Bounds().Dy(); y++ {
		for x := 0; x < template.Bounds().Dx(); x++ {
			pixel := template.NRGBAAt(x, y)
			pixel.R += 20
			pixel.G += 20
			pixel.B += 20
			source.SetNRGBA(7+x, 5+y, pixel)
		}
	}

	pureX, pureY, pureScore := findTemplateMatchPureGo(source, template)
	opencvX, opencvY, opencvScore, ok := findTemplateMatchOpenCVExperimental(source, template)
	if !ok {
		t.Fatal("experimental OpenCV matcher failed")
	}
	if pureX != 7 || pureY != 5 || opencvX != 7 || opencvY != 5 {
		t.Fatalf("location disagreement: pure=(%d,%d), OpenCV=(%d,%d)", pureX, pureY, opencvX, opencvY)
	}
	if pureScore >= 0.95 {
		t.Fatalf("pure-Go score %.6f unexpectedly accepts brightness-shifted fixture at 0.95", pureScore)
	}
	if opencvScore < 0.999 {
		t.Fatalf("OpenCV TM_CCOEFF_NORMED score %.6f unexpectedly lost brightness invariance", opencvScore)
	}
}

func opencvTestDataURL(t *testing.T, img image.Image) string {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("encode test image: %v", err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buffer.Bytes())
}
