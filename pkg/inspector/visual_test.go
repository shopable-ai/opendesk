package inspector

import "testing"

func TestVisualWindowIdentityRequiresExactNativeIdentityAndBounds(t *testing.T) {
	base := WindowCandidate{
		Title: "Fixture", PID: 42, Application: "Fixture.app",
		Bounds:       Bounds{X: -20, Y: 10, Width: 800, Height: 600},
		Target:       map[string]any{"id": "darwin:42:native:99"},
		NativeHandle: 99, Foreground: true,
	}
	if err := validateVisualWindow(base); err != nil {
		t.Fatal(err)
	}
	if !sameVisualWindow(base, base) {
		t.Fatal("exact visual identity did not match itself")
	}
	changes := []WindowCandidate{
		func() WindowCandidate {
			value := base
			value.Target = map[string]any{"id": "darwin:42:native:100"}
			return value
		}(),
		func() WindowCandidate { value := base; value.PID++; return value }(),
		func() WindowCandidate { value := base; value.Title = "Changed"; return value }(),
		func() WindowCandidate { value := base; value.Application = "Other.app"; return value }(),
		func() WindowCandidate { value := base; value.Bounds.X++; return value }(),
		func() WindowCandidate { value := base; value.Bounds.Height--; return value }(),
		func() WindowCandidate { value := base; value.NativeHandle++; return value }(),
	}
	for index, changed := range changes {
		if sameVisualWindow(base, changed) {
			t.Errorf("changed visual identity %d was accepted: %#v", index, changed)
		}
	}
	invalid := base
	invalid.Bounds.Width = visualMaximumLogicalDimension + 1
	if err := validateVisualWindow(invalid); err == nil {
		t.Fatal("oversize visual bounds were accepted")
	}
}

func TestVisualCaptureErrorsExposeCodesWithoutNativeDetails(t *testing.T) {
	err := visualCaptureError("PERMISSION_DENIED", "macos-coregraphics-window", nil)
	runtimeErr, ok := err.(*RuntimeError)
	if !ok || runtimeErr.Code != "PERMISSION_DENIED" || runtimeErr.Stage != "capture" ||
		runtimeErr.Backend != "macos-coregraphics-window" || runtimeErr.ActionState != "not_started" {
		t.Fatalf("visual capture error = %#v", err)
	}
	if got := staleVisualWindowError().Error(); got != "inspector runtime failed: STALE_TARGET" {
		t.Fatalf("stale visual error = %q", got)
	}
}
