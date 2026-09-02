package desktopvision_test

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

func TestAnnotateImageDrawsBoundingBoxAndCenter(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 100, 100))
	fillImage(src, color.RGBA{R: 255, G: 255, B: 255, A: 255})
	perception := samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC))
	perception.Image.Size = desktopvision.ImageSize{Width: 100, Height: 100}
	perception.Window.BoundsScreen = desktopvision.ScreenBBox{100, 80, 200, 180}
	perception.Elements = []desktopvision.Element{
		{ID: "digit_7", BBoxNorm: desktopvision.NormalizedBBox{0.1, 0.2, 0.3, 0.4}, Confidence: 0.97, Risk: desktopvision.RiskLow},
	}

	annotated, err := desktopvision.AnnotateImage(src, perception)
	if err != nil {
		t.Fatalf("annotate failed: %v", err)
	}

	if got := annotated.RGBAAt(10, 20); got == (color.RGBA{R: 255, G: 255, B: 255, A: 255}) {
		t.Fatal("expected top-left bbox edge to be colored")
	}
	if got := annotated.RGBAAt(20, 30); got == (color.RGBA{R: 255, G: 255, B: 255, A: 255}) {
		t.Fatal("expected center marker to be colored")
	}
}

func TestWriteAnnotatedPNGWritesFile(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "input.png")
	outputPath := filepath.Join(dir, "nested", "annotated.png")
	src := image.NewRGBA(image.Rect(0, 0, 40, 40))
	fillImage(src, color.RGBA{R: 255, G: 255, B: 255, A: 255})

	file, err := os.Create(inputPath)
	if err != nil {
		t.Fatalf("create input: %v", err)
	}
	if err := png.Encode(file, src); err != nil {
		t.Fatalf("encode input: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close input: %v", err)
	}

	perception := samplePerception(time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC))
	perception.Image.Size = desktopvision.ImageSize{Width: 40, Height: 40}
	perception.Window.BoundsScreen = desktopvision.ScreenBBox{100, 80, 140, 120}
	perception.Elements = []desktopvision.Element{
		{ID: "digit_7", BBoxNorm: desktopvision.NormalizedBBox{0.25, 0.25, 0.5, 0.5}, Confidence: 0.97, Risk: desktopvision.RiskLow},
	}

	if err := desktopvision.WriteAnnotatedPNG(inputPath, perception, outputPath); err != nil {
		t.Fatalf("write annotated png: %v", err)
	}
	if _, err := os.Stat(outputPath); err != nil {
		t.Fatalf("expected annotated output to exist: %v", err)
	}
}

func fillImage(img *image.RGBA, clr color.RGBA) {
	for y := img.Bounds().Min.Y; y < img.Bounds().Max.Y; y++ {
		for x := img.Bounds().Min.X; x < img.Bounds().Max.X; x++ {
			img.SetRGBA(x, y, clr)
		}
	}
}
