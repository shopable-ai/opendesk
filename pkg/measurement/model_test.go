package measurement

import (
	"image"
	"image/color"
	"math"
	"strings"
	"testing"
	"time"
)

func testContext(t *testing.T) (Snapshot, Reference) {
	t.Helper()
	mapping, err := NewCaptureMapping(Point{X: -1440, Y: -120}, Size{Width: 1440, Height: 900}, PixelSize{Width: 2880, Height: 1800}, "display-negative", 2)
	if err != nil {
		t.Fatal(err)
	}
	return Snapshot{SampledAt: time.Date(2026, 9, 14, 8, 0, 0, 123, time.UTC), Mapping: mapping}, Reference{
		Type:   ReferenceWindowOuter,
		Bounds: Rect{X: -1200, Y: 40, Width: 800, Height: 600},
		Window: &WindowIdentity{ID: "window-1", PID: 42, Title: "Target"},
	}
}

func TestNegativeScreenCoordinatesAndHiDPIRoundTrip(t *testing.T) {
	snapshot, _ := testContext(t)
	logical := Point{X: -1199.75, Y: 40.25}
	imagePoint := snapshot.Mapping.LogicalToImage(logical)
	if imagePoint.X != 480.5 || imagePoint.Y != 320.5 {
		t.Fatalf("image point = %+v", imagePoint)
	}
	roundTrip := snapshot.Mapping.ImageToLogical(imagePoint)
	if math.Abs(roundTrip.X-logical.X) > 1e-9 || math.Abs(roundTrip.Y-logical.Y) > 1e-9 {
		t.Fatalf("round trip = %+v want %+v", roundTrip, logical)
	}
	outside, inside := snapshot.Mapping.PixelAt(Point{X: -1440.25, Y: -120})
	if inside || outside.X != -1 {
		t.Fatalf("outside capture was clamped: pixel=%+v inside=%v", outside, inside)
	}
}

func TestPointColorUsesOriginalCapturePixelAndRGBHex(t *testing.T) {
	snapshot, reference := testContext(t)
	img := image.NewRGBA(image.Rect(0, 0, 2880, 1800))
	img.Set(482, 322, color.RGBA{R: 0x0a, G: 0x7f, B: 0xe1, A: 0xff})
	result, err := BuildPointResult(snapshot, reference, Point{X: -1199, Y: 41}, img)
	if err != nil {
		t.Fatal(err)
	}
	if result.Point.ImagePixel != (ImagePixel{X: 482, Y: 322}) {
		t.Fatalf("pixel = %+v", result.Point.ImagePixel)
	}
	if result.Point.Color == nil || result.Point.Color.Hex != "#0A7FE1" || result.Point.Color.R != 0x0a || result.Point.Color.G != 0x7f || result.Point.Color.B != 0xe1 {
		t.Fatalf("color = %+v", result.Point.Color)
	}
}

func TestRegionOutsideReferencePreservesSignedEdgesAndRatios(t *testing.T) {
	snapshot, reference := testContext(t)
	target := Rect{X: -1300, Y: 20, Width: 1000, Height: 700}
	result, err := BuildRegionResult(snapshot, reference, target)
	if err != nil {
		t.Fatal(err)
	}
	if got := result.Region.EdgeDistances; got.Left != -100 || got.Top != -20 || got.Right != -100 || got.Bottom != -80 {
		t.Fatalf("edge distances = %+v", got)
	}
	if result.Region.Relative.X != -100 || result.Region.Relative.Y != -20 || *result.Region.Relative.XRatio != -0.125 {
		t.Fatalf("relative = %+v", result.Region.Relative)
	}
}

func TestRegionExactMatchAndZeroDimensions(t *testing.T) {
	snapshot, reference := testContext(t)
	exact, err := BuildRegionResult(snapshot, reference, reference.Bounds)
	if err != nil {
		t.Fatal(err)
	}
	if exact.Region.EdgeDistances != (EdgeDistances{}) || *exact.Region.Relative.WidthRatio != 1 || *exact.Region.Relative.HeightRatio != 1 {
		t.Fatalf("exact = %+v", exact.Region)
	}
	zero, err := BuildRegionResult(snapshot, reference, Rect{X: -1200, Y: 40})
	if err != nil {
		t.Fatal(err)
	}
	if zero.Region.Absolute.Width != 0 || zero.Region.Absolute.Height != 0 || zero.Region.Center != (Point{X: -1200, Y: 40}) {
		t.Fatalf("zero region = %+v", zero.Region)
	}
}

func TestRegionSpacingOverlapAdjacentSeparatedAndReverse(t *testing.T) {
	first := Rect{X: 10, Y: 10, Width: 20, Height: 20}
	adjacent := Rect{X: 30, Y: 5, Width: 5, Height: 40}
	spacing := RegionSpacing(first, adjacent)
	if spacing.Horizontal.Gap != 0 || spacing.Horizontal.Relation != "adjacent-right" || spacing.Vertical.Relation != "overlap" {
		t.Fatalf("adjacent spacing = %+v", spacing)
	}
	separated := Rect{X: 50, Y: 60, Width: 10, Height: 10}
	forward := RegionSpacing(first, separated)
	reverse := RegionSpacing(separated, first)
	if forward.Horizontal.Gap != 20 || forward.Vertical.Gap != 30 || forward.Horizontal.Relation != "right" || forward.Vertical.Relation != "below" {
		t.Fatalf("forward spacing = %+v", forward)
	}
	if reverse.Horizontal.Gap != 20 || reverse.Vertical.Gap != 30 || reverse.Horizontal.Relation != "left" || reverse.Vertical.Relation != "above" || reverse.Horizontal.Delta >= 0 {
		t.Fatalf("reverse spacing = %+v", reverse)
	}
	overlap := RegionSpacing(first, Rect{X: 15, Y: 15, Width: 2, Height: 2})
	if overlap.Horizontal.Relation != "overlap" || overlap.Vertical.Relation != "overlap" {
		t.Fatalf("overlap spacing = %+v", overlap)
	}
}

func TestCanonicalOutputsComeFromOneResult(t *testing.T) {
	snapshot, reference := testContext(t)
	result, err := BuildSpacingResult(snapshot, reference, Rect{X: 0, Y: 0, Width: 10, Height: 10}, Rect{X: 15, Y: 20, Width: 5, Height: 5})
	if err != nil {
		t.Fatal(err)
	}
	outputs, err := result.Outputs()
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{"horizontal=5.00", `"kind": "spacing"`, `"sampledAt": "2026-09-14T08:00:00.000000123Z"`} {
		if !strings.Contains(outputs.Human+outputs.JSON, token) {
			t.Fatalf("outputs missing %q: %+v", token, outputs)
		}
	}
}

func TestReferenceTypeCannotGuessContentBounds(t *testing.T) {
	manual := Reference{Type: ReferenceManualRegion, Bounds: Rect{X: 1, Y: 2, Width: 3, Height: 4}}
	if err := manual.Validate(); err != nil {
		t.Fatal(err)
	}
	guessed := Reference{Type: ReferenceWindowContent, Bounds: manual.Bounds, Window: &WindowIdentity{ID: "window-guess"}}
	if err := guessed.Validate(); err == nil {
		t.Fatal("content reference without explicit bounds proof was accepted")
	}
	proven := guessed
	proven.ContentBoundsProven = true
	if err := proven.Validate(); err != nil {
		t.Fatalf("proven content reference rejected: %v", err)
	}
}
