package desktopvision_test

import (
	"testing"
	"time"

	"opendesk/pkg/desktopvision"
)

func TestEvaluateActionGateAllowsSafeUniqueTarget(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 1, 0, 0, time.UTC)
	snapshot := samplePerception(now.Add(-2 * time.Second))
	target := sampleElement()

	result := desktopvision.EvaluateActionGate(snapshot, []desktopvision.Element{target}, desktopvision.GateExpectations{
		App: "Calculator", WindowTitle: "Calculator", MaxScreenshotAge: 5 * time.Second,
		MinConfidence: 0.85, MaxRisk: desktopvision.RiskMedium, Now: now,
	})

	if !result.Allowed {
		t.Fatalf("expected gate to allow action, failures=%v", result.Failures)
	}
	if result.Target == nil || result.Target.ID != target.ID {
		t.Fatalf("expected resolved target to be returned, got %#v", result.Target)
	}
}

func TestEvaluateActionGateFailsClosed(t *testing.T) {
	now := time.Date(2026, 8, 30, 12, 1, 0, 0, time.UTC)

	t.Run("stale screenshot", func(t *testing.T) {
		result := desktopvision.EvaluateActionGate(samplePerception(now.Add(-10*time.Second)), []desktopvision.Element{sampleElement()}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", MaxScreenshotAge: 5 * time.Second, Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureScreenshotStale)
	})
	t.Run("wrong app", func(t *testing.T) {
		result := desktopvision.EvaluateActionGate(samplePerception(now), []desktopvision.Element{sampleElement()}, desktopvision.GateExpectations{App: "Finder", WindowTitle: "Calculator", Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureAppMismatch)
	})
	t.Run("ambiguous target", func(t *testing.T) {
		result := desktopvision.EvaluateActionGate(samplePerception(now), []desktopvision.Element{sampleElement(), sampleElement()}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureTargetNotUnique)
	})
	t.Run("low confidence", func(t *testing.T) {
		target := sampleElement()
		target.Confidence = 0.84
		result := desktopvision.EvaluateActionGate(samplePerception(now), []desktopvision.Element{target}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureConfidenceTooLow)
	})
	t.Run("center outside bbox", func(t *testing.T) {
		target := sampleElement()
		target.CenterScreen = desktopvision.ScreenPoint{1000, 1000}
		result := desktopvision.EvaluateActionGate(samplePerception(now), []desktopvision.Element{target}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureCenterOutsideTarget)
	})
	t.Run("center outside display", func(t *testing.T) {
		snapshot := samplePerception(now)
		snapshot.Display.Bounds = desktopvision.ScreenBBox{0, 0, 150, 200}
		result := desktopvision.EvaluateActionGate(snapshot, []desktopvision.Element{sampleElement()}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureCenterOutsideDisplay)
	})
	t.Run("risk too high", func(t *testing.T) {
		target := sampleElement()
		target.Risk = desktopvision.RiskHigh
		result := desktopvision.EvaluateActionGate(samplePerception(now), []desktopvision.Element{target}, desktopvision.GateExpectations{App: "Calculator", WindowTitle: "Calculator", MaxRisk: desktopvision.RiskMedium, Now: now})
		assertGateFailure(t, result, desktopvision.GateFailureRiskTooHigh)
	})
}

func samplePerception(capturedAt time.Time) desktopvision.Perception {
	return desktopvision.Perception{
		App:     "Calculator",
		Window:  desktopvision.Window{Title: "Calculator", BoundsScreen: desktopvision.ScreenBBox{100, 80, 500, 380}},
		Image:   desktopvision.Image{Size: desktopvision.ImageSize{Width: 800, Height: 600}, Hash: "sha256:test", CapturedAt: capturedAt},
		Display: desktopvision.Display{ID: "main", Scale: 2, Bounds: desktopvision.ScreenBBox{0, 0, 1440, 900}},
	}
}

func sampleElement() desktopvision.Element {
	return desktopvision.Element{ID: "digit_7", Role: "button", Text: "7", BBoxNorm: desktopvision.NormalizedBBox{0.1, 0.5, 0.2, 0.6}, Confidence: 0.97, Risk: desktopvision.RiskLow}
}

func assertGateFailure(t *testing.T, result desktopvision.GateResult, want string) {
	t.Helper()
	if result.Allowed {
		t.Fatalf("expected gate to block, got allow")
	}
	for _, got := range result.Failures {
		if got == want {
			return
		}
	}
	t.Fatalf("expected failure %q, got %v", want, result.Failures)
}
