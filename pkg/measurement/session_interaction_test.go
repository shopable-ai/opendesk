package measurement

import (
	"context"
	"strings"
	"testing"

	"opendesk/pkg/customui"
)

func TestEscapeClosesInspectorThenMeasurementSession(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	a.inspectorOpen = true
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil {
		t.Fatal(err)
	}
	if a.inspectorOpen {
		t.Fatal("first Escape must close Inspector")
	}
	if service.Counts().Sessions != 1 {
		t.Fatal("closing Inspector must keep the Measurement session active")
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil {
		t.Fatal(err)
	}
	if service.Counts().Sessions != 0 {
		t.Fatal("second Escape must exit Measurement")
	}
}

func TestInspectorShortcutAndAltSuspendRemainInSameSurface(t *testing.T) {
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
	a := service.active
	w := a.currentWindow()
	if err := a.handleKey(ctx, map[string]any{"key": "i"}); err != nil {
		t.Fatal(err)
	}
	if !a.inspectorOpen {
		t.Fatal("I did not open inspector")
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Alt", "phase": "down", "alt": true}); err != nil {
		t.Fatal(err)
	}
	if !a.snapSuspended {
		t.Fatal("Alt keydown did not suspend snap")
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Alt", "phase": "up"}); err != nil {
		t.Fatal(err)
	}
	if a.snapSuspended {
		t.Fatal("Alt keyup did not restore snap")
	}
	if driver.CreateCount() != 1 || a.currentWindow() != w || capture.Count() != 1 {
		t.Fatalf("shortcut recreated native surface creates=%d captures=%d", driver.CreateCount(), capture.Count())
	}
	_ = service.Close(ctx)
}

func TestMagnetToggleAndMarginToggleFollowOracleState(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	if !a.snapEnabled || a.marginView != "window" {
		t.Fatalf("initial oracle controls snap=%v margin=%q", a.snapEnabled, a.marginView)
	}
	beforeTarget, beforeCaptures := a.selectedTarget, capture.Count()
	if err := a.handleClick(ctx, "magnetToggle"); err != nil {
		t.Fatal(err)
	}
	if a.snapEnabled {
		t.Fatal("magnet toggle did not disable snapping")
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Tab"}); err != nil {
		t.Fatal(err)
	}
	if a.selectedTarget != beforeTarget || capture.Count() != beforeCaptures {
		t.Fatalf("Tab changed target while magnet was off target=%q captures=%d", a.selectedTarget, capture.Count())
	}
	if err := a.handleClick(ctx, "magnetToggle"); err != nil {
		t.Fatal(err)
	}
	if !a.snapEnabled {
		t.Fatal("magnet toggle did not re-enable snapping")
	}
	if err := a.handleClick(ctx, "marginToggle"); err != nil {
		t.Fatal(err)
	}
	if a.marginView != "window" {
		t.Fatalf("margin changed without reliable local reference: %q", a.marginView)
	}
	a.reference = Reference{Type: ReferenceManualRegion, Bounds: Rect{X: -90, Y: 24, Width: 70, Height: 38}}
	if err := a.handleClick(ctx, "marginToggle"); err != nil {
		t.Fatal(err)
	}
	if a.marginView != "local" || marginToggleText(a) != "边距：局部参照" {
		t.Fatalf("local margin toggle state view=%q label=%q", a.marginView, marginToggleText(a))
	}
	if err := a.handleClick(ctx, "marginToggle"); err != nil {
		t.Fatal(err)
	}
	if a.marginView != "window" || marginToggleText(a) != "边距：窗口" {
		t.Fatalf("window margin toggle state view=%q label=%q", a.marginView, marginToggleText(a))
	}
	_ = service.Close(ctx)
}

func TestRegionPointerStartsNewMeasurementInsteadOfEditingLockedRegion(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	_ = a.handleKey(ctx, map[string]any{"key": "2"})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": .2, "v": .2}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": .6, "v": .6}})
	original := a.result.Region.Absolute
	center := original.Center()
	m := a.frame.Snapshot.Mapping
	imagePoint := m.LogicalToImage(center)
	u := imagePoint.X / float64(m.ImageSize.Width)
	v := imagePoint.Y / float64(m.ImageSize.Height)
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": u, "v": v}})
	if a.result != nil || a.regionHandle != RegionEditNone {
		t.Fatalf("new Region gesture must clear the locked result instead of entering edit mode: result=%+v handle=%q", a.result, a.regionHandle)
	}
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": u + .08, "v": v + .08}})
	if a.result == nil || a.result.Region == nil {
		t.Fatal("new Region drag did not create a replacement result")
	}
	replacement := a.result.Region.Absolute
	if replacement == original || replacement.Width >= original.Width || replacement.Height >= original.Height {
		t.Fatalf("Region was edited instead of replaced: original=%+v replacement=%+v", original, replacement)
	}
	_ = service.Close(ctx)
}

func TestArrowKeysDoNotMutateLockedMeasurement(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	_ = a.handleKey(ctx, map[string]any{"key": "1"})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": .25, "v": .25}})
	if a.result == nil || a.result.Point == nil {
		t.Fatal("point result missing")
	}
	before := a.result.Point.Absolute
	if err := a.handleKey(ctx, map[string]any{"key": "ArrowRight", "shift": true}); err != nil {
		t.Fatal(err)
	}
	if a.result == nil || a.result.Point == nil || a.result.Point.Absolute != before {
		t.Fatalf("Arrow shortcut invented post-lock editing: before=%+v after=%+v", before, a.result)
	}
	_ = service.Close(ctx)
}

func TestSelectedToolPersistsAcrossExitAndNewSession(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	if err := service.active.handleKey(ctx, map[string]any{"key": "3"}); err != nil {
		t.Fatal(err)
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if err := service.Open(ctx, "global-shortcut"); err != nil {
		t.Fatal(err)
	}
	if service.active.tool != "twoPoint" {
		t.Fatalf("tool did not persist across sessions: %q", service.active.tool)
	}
	_ = service.Close(ctx)
}

func TestUpdatePreservesPointerInspectorAndToolWhileClearingResult(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	_ = a.handleKey(ctx, map[string]any{"key": "1"})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": .25, "v": .25}})
	a.inspectorOpen = true
	beforePointer := *a.pointer
	beforeTool := a.tool
	if err := a.handleClick(ctx, "refreshSnapshot"); err != nil {
		t.Fatal(err)
	}
	if a.result != nil {
		t.Fatal("Update must clear snapshot-bound result")
	}
	if a.pointer == nil || *a.pointer != beforePointer {
		t.Fatalf("Update changed pointer: before=%+v after=%+v", beforePointer, a.pointer)
	}
	if !a.inspectorOpen {
		t.Fatal("Update unexpectedly closed Inspector")
	}
	if a.tool != beforeTool {
		t.Fatalf("Update changed tool: before=%q after=%q", beforeTool, a.tool)
	}
	_ = service.Close(ctx)
}

func TestTabDoesNotTreatTargetWindowsAsSnapshotCandidates(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	beforeTarget := a.selectedTarget
	beforeToken := service.State().Token
	if err := a.handleKey(ctx, map[string]any{"key": "Tab"}); err != nil {
		t.Fatal(err)
	}
	if a.selectedTarget != beforeTarget || capture.Count() != 1 || service.State().Token != beforeToken {
		t.Fatalf("Tab changed target/snapshot target=%q captures=%d before=%+v after=%+v", a.selectedTarget, capture.Count(), beforeToken, service.State().Token)
	}
	if !strings.Contains(a.status, "同一 Snapshot") || !strings.Contains(a.status, "不会切换目标窗口") {
		t.Fatalf("Tab status does not explain snapshot-candidate contract: %q", a.status)
	}
	_ = service.Close(ctx)
}

func TestInspectorTargetWindowSwitchRemainsExplicit(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	a.snapEnabled = false
	if err := a.handleClick(ctx, "nextTarget"); err != nil {
		t.Fatal(err)
	}
	if a.selectedTarget != "other" || capture.Count() != 2 {
		t.Fatalf("explicit Inspector target switch failed target=%q captures=%d", a.selectedTarget, capture.Count())
	}
	_ = service.Close(ctx)
}

func TestDeprecatedRAndCopyChordsDoNotMutateMeasurementSession(t *testing.T) {
	service, _, _, clipboard := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": .25, "v": .25}})
	if err := a.handleKey(ctx, map[string]any{"key": "r"}); err != nil {
		t.Fatal(err)
	}
	if a.manualPending {
		t.Fatal("deprecated R shortcut entered reference editing")
	}
	if err := a.handleKey(ctx, map[string]any{"key": "c", "meta": true}); err != nil {
		t.Fatal(err)
	}
	if len(clipboard.writes) != 0 {
		t.Fatalf("system copy chord was hijacked by Measurement: %#v", clipboard.writes)
	}
	_ = service.Close(ctx)
}
