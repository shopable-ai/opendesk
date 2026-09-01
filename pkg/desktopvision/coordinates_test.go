package desktopvision

import "testing"

func TestResolveElementCoordinates(t *testing.T) {
	ctx := TransformContext{
		Image: Image{
			Size: ImageSize{Width: 800, Height: 600},
		},
		Window: Window{
			Title:        "Calculator",
			BoundsScreen: ScreenBBox{100, 80, 500, 380},
		},
		Display: Display{
			ID:    "main",
			Scale: 2,
		},
	}

	element := Element{
		ID:       "digit_7",
		BBoxNorm: NormalizedBBox{0.1, 0.5, 0.2, 0.6},
	}

	resolved, err := ResolveElementCoordinates(element, ctx)
	if err != nil {
		t.Fatalf("resolve failed: %v", err)
	}

	if got := resolved.BBoxPx; got != (PixelBBox{80, 300, 160, 360}) {
		t.Fatalf("unexpected pixel bbox: %#v", got)
	}
	if got := resolved.BBoxWindow; got != (WindowBBox{40, 150, 80, 180}) {
		t.Fatalf("unexpected window bbox: %#v", got)
	}
	if got := resolved.CenterWindow; got != (WindowPoint{60, 165}) {
		t.Fatalf("unexpected window center: %#v", got)
	}
	if got := resolved.CenterScreen; got != (ScreenPoint{160, 245}) {
		t.Fatalf("unexpected screen center: %#v", got)
	}
}

func TestNormToPixelRejectsInvalidBoxes(t *testing.T) {
	_, err := NormToPixelBBox(NormalizedBBox{0.4, 0.2, 0.2, 0.3}, ImageSize{Width: 800, Height: 600})
	if err == nil {
		t.Fatal("expected invalid normalized bbox to fail")
	}
}

func TestPixelToWindowRejectsZeroSizedContext(t *testing.T) {
	_, err := PixelToWindowBBox(PixelBBox{10, 10, 20, 20}, ImageSize{}, Window{})
	if err == nil {
		t.Fatal("expected zero-sized image/window context to fail")
	}
}
