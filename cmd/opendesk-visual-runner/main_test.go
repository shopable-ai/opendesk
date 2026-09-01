package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opendesk/automation"
	"opendesk/pkg/desktopvision"
)

func TestSameAppIgnoresCaseAndAppSuffix(t *testing.T) {
	if !sameApp("Calculator", "calculator.app") {
		t.Fatal("expected app names to match")
	}
}

func TestMatchingElementsRequiresExactActionableTarget(t *testing.T) {
	elements := []desktopvision.Element{
		{Text: "7", Actionable: true},
		{Text: "7", Actionable: false},
		{Text: "17", Actionable: true},
	}
	matches := matchingElements(elements, "7")
	if len(matches) != 1 {
		t.Fatalf("matches = %d, want 1", len(matches))
	}
}

func TestDisplayForWindowSelectsContainingDisplay(t *testing.T) {
	rows := []map[string]any{
		{"id": "left", "x": -1000, "y": 0, "width": 1000, "height": 800, "scale": 2.0},
		{"id": "main", "x": 0, "y": 0, "width": 1280, "height": 1024, "scale": 1.0},
	}
	display := displayForWindow(rows, &automation.WindowInfo{X: 100, Y: 80, Width: 300, Height: 400})
	if display.ID != "main" || display.Scale != 1 {
		t.Fatalf("unexpected display: %#v", display)
	}
}

func TestPreflightStrategyNameUsesCaptureCount(t *testing.T) {
	if got := preflightStrategyName(12); got != "12_capture_preflight" {
		t.Fatalf("preflightStrategyName(12) = %q", got)
	}
}

func TestRequiredSuccessesRoundsUpNinetyFivePercent(t *testing.T) {
	if got := requiredSuccesses(20); got != 19 {
		t.Fatalf("requiredSuccesses(20) = %d, want 19", got)
	}
	if got := requiredSuccesses(1); got != 1 {
		t.Fatalf("requiredSuccesses(1) = %d, want 1", got)
	}
}

func TestWriteModelInvocationPreservesScreenshotProvenanceAndFailure(t *testing.T) {
	dir := t.TempDir()
	invocation := modelInvocation{
		ImagePath:         "/tmp/fresh.png",
		ImageSHA256:       "abc123",
		RequestedModel:    "gpt-5.6-sol",
		RequestedProvider: "openai",
		RawResponse:       `{"image":{"hash":"wrong"}}`,
		Succeeded:         false,
		Error:             "model response screenshot SHA mismatch",
	}
	if err := writeModelInvocation(dir, invocation); err != nil {
		t.Fatalf("writeModelInvocation: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "model-invocation.json"))
	if err != nil {
		t.Fatalf("read model invocation: %v", err)
	}
	var got modelInvocation
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("decode model invocation: %v", err)
	}
	if got.ImageSHA256 != invocation.ImageSHA256 || got.RawResponse != invocation.RawResponse || got.Error == "" || got.Succeeded {
		t.Fatalf("model invocation lost audit fields: %#v", got)
	}
}

func TestFinalizeRepresentativeArtifactsOmitsVisionProvider(t *testing.T) {
	dir := t.TempDir()
	iterDir := iterationDir(dir, 1)
	if err := os.MkdirAll(iterDir, 0o755); err != nil {
		t.Fatalf("mkdir iter dir: %v", err)
	}
	for _, name := range []string{"pre.png", "perception.json", "annotated.png", "plan.json"} {
		if err := os.WriteFile(filepath.Join(iterDir, name), []byte(name), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	target := desktopvision.NormalizeTarget(desktopvision.Element{
		Text:         "7",
		Role:         "button",
		BBoxNorm:     desktopvision.NormalizedBBox{0.1, 0.1, 0.2, 0.2},
		BBoxWindow:   desktopvision.WindowBBox{10, 10, 20, 20},
		CenterWindow: desktopvision.WindowPoint{15, 15},
		CenterScreen: desktopvision.ScreenPoint{115, 115},
		Confidence:   0.95,
		Actionable:   true,
		Risk:         desktopvision.RiskLow,
	})
	events := []desktopvision.TraceEvent{{
		Stage: "click_7",
		App:   "Calculator",
		Model: desktopvision.ModelRef{Provider: "openai", Model: "gpt-5.6-sol", PromptVersion: "ui-parser-v1"},
		Window: desktopvision.WindowIdentity{
			Title:        "Calculator",
			BoundsScreen: desktopvision.ScreenBBox{100, 100, 300, 300},
		},
		Target:                &target,
		Action:                &desktopvision.ActionRecord{Type: "click", Button: "left"},
		ExpectedPostcondition: &desktopvision.Postcondition{Type: "visual_text", Text: "7", Role: "display"},
	}}

	if err := finalizeRepresentativeArtifacts(dir, 1, "", events); err != nil {
		t.Fatalf("finalizeRepresentativeArtifacts: %v", err)
	}

	script, err := os.ReadFile(filepath.Join(dir, "generated.js"))
	if err != nil {
		t.Fatalf("read generated.js: %v", err)
	}
	if bytes.Contains(script, []byte(`"visionProvider":`)) && !bytes.Contains(script, []byte(`"visionProvider": ""`)) {
		t.Fatalf("expected empty visionProvider in replay script, got:\n%s", string(script))
	}
}
