package measurement

import (
	"image/png"
	"os"
	"testing"
	"time"
)

func TestRenderOverlayPNGUsesCanonicalMappingDimensions(t *testing.T) {
	mapping, err := NewCaptureMapping(Point{X: -10, Y: 20}, Size{Width: 100, Height: 50}, PixelSize{Width: 200, Height: 100}, "display", 1)
	if err != nil {
		t.Fatal(err)
	}
	ref := Reference{Type: ReferenceWindowOuter, Bounds: Rect{X: 0, Y: 25, Width: 50, Height: 30}, Window: &WindowIdentity{ID: "w", PID: 1}}
	result, err := BuildRegionResult(Snapshot{SampledAt: time.Now(), Mapping: mapping}, ref, Rect{X: 10, Y: 30, Width: 20, Height: 10})
	if err != nil {
		t.Fatal(err)
	}
	path := t.TempDir() + "/overlay.png"
	if err := RenderOverlayPNG(path, mapping, ref, ref, &result, nil, nil); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	img, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != mapping.ImageSize.Width || img.Bounds().Dy() != mapping.ImageSize.Height {
		t.Fatalf("overlay size=%v mapping=%+v", img.Bounds(), mapping.ImageSize)
	}
	outside, _ := mapping.PixelAt(Point{X: -5, Y: 22})
	_, _, _, outsideAlpha := img.At(outside.X, outside.Y).RGBA()
	if outsideAlpha == 0 {
		t.Fatal("window exterior must receive the weak measurement mask")
	}
	inside, _ := mapping.PixelAt(Point{X: 25, Y: 45})
	_, _, _, insideAlpha := img.At(inside.X, inside.Y).RGBA()
	if insideAlpha != 0 {
		t.Fatalf("unannotated target-window interior must remain transparent, alpha=%d", insideAlpha)
	}
}

func TestRenderOverlayPNGEmphasisesOnlyProvidedReferenceMargins(t *testing.T) {
	mapping, err := NewCaptureMapping(Point{}, Size{Width: 200, Height: 160}, PixelSize{Width: 200, Height: 160}, "display", 1)
	if err != nil {
		t.Fatal(err)
	}
	window := Reference{Type: ReferenceWindowOuter, Bounds: Rect{X: 10, Y: 10, Width: 180, Height: 140}, Window: &WindowIdentity{ID: "w", PID: 1}}
	local := Reference{Type: ReferenceManualRegion, Bounds: Rect{X: 40, Y: 40, Width: 120, Height: 80}}
	result, err := BuildRegionResult(Snapshot{SampledAt: time.Now(), Mapping: mapping}, local, Rect{X: 70, Y: 60, Width: 50, Height: 30})
	if err != nil {
		t.Fatal(err)
	}
	path := t.TempDir() + "/overlay.png"
	if err := RenderOverlayPNG(path, mapping, window, local, &result, nil, nil); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	img, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	// Left-margin guide is y=75 from local x=40 to target x=70.
	for _, x := range []int{45, 55, 65} {
		_, _, _, alpha := img.At(x, 75).RGBA()
		if alpha == 0 {
			t.Fatalf("expected active local margin guide at (%d,75)", x)
		}
	}
	// A corresponding window-to-target guide would pass x=20; it must not
	// be drawn because only one margin-reference set is emphasised at once.
	_, _, _, inactiveAlpha := img.At(20, 75).RGBA()
	if inactiveAlpha != 0 {
		t.Fatalf("inactive window margin guide leaked into overlay, alpha=%d", inactiveAlpha)
	}
}
