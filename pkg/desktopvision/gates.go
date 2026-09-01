package desktopvision

import "time"

const (
	DefaultConfidenceThreshold = 0.85

	GateFailureAppMismatch          = "app_mismatch"
	GateFailureWindowMismatch       = "window_mismatch"
	GateFailureScreenshotStale      = "screenshot_stale"
	GateFailureTargetNotUnique      = "target_not_unique"
	GateFailureConfidenceTooLow     = "confidence_too_low"
	GateFailureCenterOutsideTarget  = "center_outside_target"
	GateFailureCenterOutsideDisplay = "center_outside_display"
	GateFailureRiskTooHigh          = "risk_too_high"
)

type GateExpectations struct {
	App              string
	WindowTitle      string
	MaxScreenshotAge time.Duration
	MinConfidence    float64
	MaxRisk          RiskLevel
	Now              time.Time
}

type GateResult struct {
	Allowed  bool
	Failures []string
	Target   *Element
}

func EvaluateActionGate(snapshot Perception, candidates []Element, expectations GateExpectations) GateResult {
	failures := make([]string, 0, 6)

	if expectations.App != "" && snapshot.App != expectations.App {
		failures = append(failures, GateFailureAppMismatch)
	}
	if expectations.WindowTitle != "" && snapshot.Window.Title != expectations.WindowTitle {
		failures = append(failures, GateFailureWindowMismatch)
	}
	if !screenshotFresh(snapshot.Image, expectations) {
		failures = append(failures, GateFailureScreenshotStale)
	}
	if len(candidates) != 1 {
		failures = append(failures, GateFailureTargetNotUnique)
		return GateResult{Allowed: false, Failures: failures}
	}

	target, err := ResolveElementCoordinates(candidates[0], TransformContext{
		Image:   snapshot.Image,
		Window:  snapshot.Window,
		Display: snapshot.Display,
	})
	if err != nil {
		failures = append(failures, GateFailureCenterOutsideTarget)
		return GateResult{Allowed: false, Failures: failures}
	}

	minConfidence := expectations.MinConfidence
	if minConfidence == 0 {
		minConfidence = DefaultConfidenceThreshold
	}
	if target.Confidence < minConfidence {
		failures = append(failures, GateFailureConfidenceTooLow)
	}

	centerToCheck := target.CenterScreen
	if hasScreenPoint(candidates[0].CenterScreen) {
		centerToCheck = candidates[0].CenterScreen
		target.CenterScreen = centerToCheck
	}

	if !target.BBoxWindow.Contains(centerToCheck, snapshot.Window) {
		failures = append(failures, GateFailureCenterOutsideTarget)
	}
	if snapshot.Display.Bounds.Width() <= 0 || snapshot.Display.Bounds.Height() <= 0 ||
		!snapshot.Display.Bounds.Contains(centerToCheck) {
		failures = append(failures, GateFailureCenterOutsideDisplay)
	}

	maxRisk := expectations.MaxRisk
	if maxRisk == "" {
		maxRisk = RiskLow
	}
	if !target.Risk.AllowedBy(maxRisk) {
		failures = append(failures, GateFailureRiskTooHigh)
	}

	if len(failures) > 0 {
		return GateResult{Allowed: false, Failures: failures}
	}

	return GateResult{
		Allowed: true,
		Target:  &target,
	}
}

func screenshotFresh(image Image, expectations GateExpectations) bool {
	if expectations.MaxScreenshotAge <= 0 {
		return !image.CapturedAt.IsZero()
	}
	if image.CapturedAt.IsZero() {
		return false
	}
	now := expectations.Now
	if now.IsZero() {
		now = time.Now()
	}
	return now.Sub(image.CapturedAt) <= expectations.MaxScreenshotAge
}

func hasScreenPoint(point ScreenPoint) bool {
	return point != (ScreenPoint{})
}
