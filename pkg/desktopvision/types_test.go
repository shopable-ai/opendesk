package desktopvision

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPerceptionJSONContract(t *testing.T) {
	timestamp := time.Date(2026, 8, 30, 12, 0, 0, 0, time.UTC)
	snapshot := Perception{
		App: "Calculator",
		Window: Window{
			Title:        "Calculator",
			BoundsScreen: ScreenBBox{100, 80, 500, 380},
		},
		Image: Image{
			Size:       ImageSize{Width: 800, Height: 600},
			Hash:       "sha256:abc123",
			CapturedAt: timestamp,
		},
		Display: Display{
			ID:    "main",
			Scale: 2,
			Bounds: ScreenBBox{
				0, 0, 1440, 900,
			},
		},
		Elements: []Element{
			{
				ID:           "digit_7",
				Role:         "button",
				Text:         "7",
				BBoxNorm:     NormalizedBBox{0.1, 0.5, 0.2, 0.6},
				BBoxPx:       PixelBBox{80, 300, 160, 360},
				CenterScreen: ScreenPoint{160, 245},
				Confidence:   0.97,
				Risk:         RiskLow,
			},
		},
	}

	raw, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	for _, key := range []string{"app", "window", "image", "display", "elements"} {
		if _, ok := decoded[key]; !ok {
			t.Fatalf("expected top-level key %q", key)
		}
	}

	image, ok := decoded["image"].(map[string]any)
	if !ok {
		t.Fatal("expected image object")
	}
	if image["hash"] != "sha256:abc123" {
		t.Fatalf("expected image hash to round-trip, got %#v", image["hash"])
	}

	elements, ok := decoded["elements"].([]any)
	if !ok || len(elements) != 1 {
		t.Fatalf("expected one element, got %#v", decoded["elements"])
	}

	element, ok := elements[0].(map[string]any)
	if !ok {
		t.Fatal("expected element object")
	}
	for _, key := range []string{"bbox_norm", "bbox_px", "center_screen", "confidence", "risk"} {
		if _, ok := element[key]; !ok {
			t.Fatalf("expected element key %q", key)
		}
	}
}

func TestRiskOrdering(t *testing.T) {
	if !RiskLow.AllowedBy(RiskLow) {
		t.Fatal("expected low risk to be allowed by low ceiling")
	}
	if !RiskMedium.AllowedBy(RiskHigh) {
		t.Fatal("expected medium risk to be allowed by high ceiling")
	}
	if RiskHigh.AllowedBy(RiskMedium) {
		t.Fatal("did not expect high risk to be allowed by medium ceiling")
	}
}
