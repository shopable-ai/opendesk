package measurement

import (
	"context"
	"errors"
	"strings"
	"testing"

	"opendesk/pkg/customui"
)

func TestAdjustingHidesSurfaceAndUnifiedEntryRefreezesSameSession(t *testing.T) {
	base := customui.NewMemoryDriver()
	driver := &createCountingDriver{Driver: base}
	capture := &sessionCapture{}
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	active := service.active
	window := active.currentWindow()
	initial := service.State()
	if initial.Phase != PhaseMeasuring || initial.Token.Validate() != nil {
		t.Fatalf("initial state=%+v", initial)
	}
	if err := active.handleClick(ctx, "adjustInterface"); err != nil {
		t.Fatal(err)
	}
	adjusting := service.State()
	if adjusting.Phase != PhaseAdjusting || adjusting.Token.Generation <= initial.Token.Generation || adjusting.Token.SnapshotID != "" {
		t.Fatalf("adjusting state=%+v initial=%+v", adjusting, initial)
	}
	if active.acceptsSnapshot(initial.Token) {
		t.Fatal("old frozen snapshot remained acceptable after entering ADJUSTING")
	}
	state, err := window.State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if state.Visible {
		t.Fatal("measurement surface remained visible during ADJUSTING")
	}

	// The same canonical entry (menu, Recorder or global shortcut) means
	// “continue measurement” while the unique owner is adjusting.
	if err := service.Open(ctx, "recorder-toolbar"); err != nil {
		t.Fatal(err)
	}
	continued := service.State()
	if continued.Phase != PhaseMeasuring || continued.Token.Validate() != nil {
		t.Fatalf("continued state=%+v", continued)
	}
	if continued.Token.SessionID != initial.Token.SessionID || continued.Token.SnapshotID == initial.Token.SnapshotID {
		t.Fatalf("continue did not preserve session and replace snapshot: initial=%+v continued=%+v", initial, continued)
	}
	if service.active != active || service.active.currentWindow() != window || driver.CreateCount() != 1 || capture.Count() != 2 {
		t.Fatalf("continue recreated owner/surface: active=%p initial=%p creates=%d captures=%d", service.active, active, driver.CreateCount(), capture.Count())
	}
	if active.acceptsSnapshot(initial.Token) {
		t.Fatal("stale pre-adjustment token was accepted after refreeze")
	}
	_ = service.Close(ctx)
}

func TestUpdateSnapshotAdvancesGenerationWithoutReplacingSession(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	before := service.State()
	active := service.active
	if err := active.handleClick(ctx, "refreshSnapshot"); err != nil {
		t.Fatal(err)
	}
	after := service.State()
	if after.Phase != PhaseMeasuring || after.Token.SessionID != before.Token.SessionID || after.Token.Generation != before.Token.Generation+1 || after.Token.SnapshotID == before.Token.SnapshotID {
		t.Fatalf("update snapshot identity before=%+v after=%+v", before, after)
	}
	if capture.Count() != 2 || active.acceptsSnapshot(before.Token) {
		t.Fatalf("update did not invalidate previous generation: captures=%d", capture.Count())
	}
	_ = service.Close(ctx)
}

func TestAdjustingCaptureFailureStaysOnRealDesktopAndCanRetry(t *testing.T) {
	baseCapture := &sessionCapture{}
	failNext := false
	capture := captureFunc(func(ctx context.Context, target string) (CaptureFrame, error) {
		if failNext {
			failNext = false
			return CaptureFrame{}, errors.New("synthetic capture failure")
		}
		return baseCapture.Capture(ctx, target)
	})
	driver := customui.NewMemoryDriver()
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Clipboard: &sessionClipboard{}, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	active := service.active
	if err := active.handleClick(ctx, "adjustInterface"); err != nil {
		t.Fatal(err)
	}
	failNext = true
	if err := service.Open(ctx, "global-shortcut"); err == nil {
		t.Fatal("expected synthetic refreeze failure")
	}
	if service.State().Phase != PhaseAdjusting || service.State().Token.SnapshotID != "" {
		t.Fatalf("failed refreeze must remain adjusting: %+v", service.State())
	}
	state, err := active.currentWindow().State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if state.Visible {
		t.Fatal("failed refreeze exposed stale frozen surface")
	}
	if err := service.Open(ctx, "global-shortcut"); err != nil {
		t.Fatal(err)
	}
	if service.State().Phase != PhaseMeasuring || service.State().Token.Validate() != nil {
		t.Fatalf("retry did not create a fresh measuring snapshot: %+v", service.State())
	}
	_ = service.Close(ctx)
}

func TestCursorHUDUsesThreeCoordinateSpacesAndFrozenRawPixel(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	// Fixture raw pixel (50,25) maps to logical (-75,32.5).
	point := Point{X: -75, Y: 32.5}
	a.pointer = &point
	text := microText(a)
	for _, expected := range []string{"屏幕", "窗口", "区域   —", "#010203"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("cursor HUD missing %q: %q", expected, text)
		}
	}
	_ = service.Close(ctx)
}

func TestRegionHUDShowsAtMostWindowAndOneLocalMarginSet(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	a.reference = Reference{Type: ReferenceManualRegion, Bounds: Rect{X: -90, Y: 24, Width: 70, Height: 38}}
	result, err := BuildRegionResult(a.frame.Snapshot, a.reference, Rect{X: -80, Y: 28, Width: 30, Height: 12})
	if err != nil {
		t.Fatal(err)
	}
	a.result = &result
	text := measurementReferenceSummary(a)
	if strings.Count(text, "\n") != 2 || !strings.Contains(text, "整个窗口") || !strings.Contains(text, "局部参照") {
		t.Fatalf("expected exactly two margin rows, got %q", text)
	}
	_ = service.Close(ctx)
}
