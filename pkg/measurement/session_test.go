package measurement

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/customui"
)

type sessionCapture struct {
	mu    sync.Mutex
	count int
}

func (c *sessionCapture) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

func (c *sessionCapture) Capture(_ context.Context, target string) (CaptureFrame, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count++
	if target == "" {
		target = "target"
	}
	origin := Point{X: -100, Y: 20}
	logical := Size{Width: 100, Height: 50}
	pixels := PixelSize{Width: 200, Height: 100}
	bounds := Rect{X: -80, Y: 25, Width: 60, Height: 30}
	if target == "other" {
		origin = Point{X: 300, Y: -40}
		logical = Size{Width: 120, Height: 80}
		pixels = PixelSize{Width: 240, Height: 160}
		bounds = Rect{X: 320, Y: -20, Width: 70, Height: 40}
	}
	img := image.NewRGBA(image.Rect(0, 0, pixels.Width, pixels.Height))
	img.Set(pixels.Width/4, pixels.Height/4, color.RGBA{R: 1, G: 2, B: 3, A: 255})
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		return CaptureFrame{}, err
	}
	mapping, err := NewCaptureMapping(origin, logical, pixels, target+"-display", 1)
	if err != nil {
		return CaptureFrame{}, err
	}
	return CaptureFrame{
		PNG:       data.Bytes(),
		Snapshot:  Snapshot{SampledAt: time.Date(2026, 9, 14, 10, 0, c.count, 0, time.UTC), Mapping: mapping},
		Reference: Reference{Type: ReferenceWindowOuter, Bounds: bounds, Window: &WindowIdentity{ID: target, PID: 7, Title: "Fixture"}},
		Targets: []TargetWindow{
			{ID: "target", Title: "Fixture", PID: 7, Bounds: bounds},
			{ID: "other", Title: "Other", PID: 8, Bounds: Rect{X: origin.X + 10, Y: origin.Y + 5, Width: 50, Height: 20}},
		},
		SelectedTargetID: target, TargetConfirmed: true,
	}, nil
}

type sessionClipboard struct {
	mu     sync.Mutex
	writes []string
}

type captureFunc func(context.Context, string) (CaptureFrame, error)

func (fn captureFunc) Capture(ctx context.Context, target string) (CaptureFrame, error) {
	return fn(ctx, target)
}

func (c *sessionClipboard) Copy(value string) error {
	c.mu.Lock()
	c.writes = append(c.writes, value)
	c.mu.Unlock()
	return nil
}

// replacementFailureDriver follows the production lifecycle: render creates a
// replacement native surface, rather than mutating the prior preview control.
// Keeping this seam at Create protects that canonical behavior from stale tests.
type replacementFailureDriver struct {
	customui.Driver
	mu         sync.Mutex
	creates    int
	failCreate bool
}

func (d *replacementFailureDriver) Create(ctx context.Context, sessionID string, spec customui.WindowSpec, sink func(customui.Event)) (customui.DriverWindow, error) {
	d.mu.Lock()
	shouldFail := d.failCreate && d.creates > 0
	d.creates++
	d.mu.Unlock()
	if shouldFail {
		return nil, errors.New("injected replacement surface create failure")
	}
	window, err := d.Driver.Create(ctx, sessionID, spec, sink)
	if err != nil {
		return nil, err
	}
	return window, nil
}

func newSessionService(t *testing.T) (*Service, *customui.MemoryDriver, *sessionCapture, *sessionClipboard) {
	t.Helper()
	driver := customui.NewMemoryDriver()
	capture := &sessionCapture{}
	clipboard := &sessionClipboard{}
	service, err := NewService(ServiceOptions{
		Driver: driver, Capture: capture, Clipboard: clipboard,
		BaseDir: t.TempDir(),
		Now:     func() time.Time { return time.Date(2026, 9, 14, 11, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	return service, driver, capture, clipboard
}

func dragMeasurement(t *testing.T, a *activeSession, ctx context.Context, startU, startV, endU, endV float64) {
	t.Helper()
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": startU, "v": startV}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": endU, "v": endV}}); err != nil {
		t.Fatal(err)
	}
}

func TestServiceReentryUsesSameSessionAndSnapshot(t *testing.T) {
	service, driver, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	first := service.active
	firstSnapshot := first.frame.Snapshot.SampledAt
	if err := service.Open(ctx, "recorder-toolbar"); err != nil {
		t.Fatal(err)
	}
	if service.active != first || capture.Count() != 1 || service.active.frame.Snapshot.SampledAt != firstSnapshot {
		t.Fatalf("reentry replaced session/snapshot: active=%p first=%p captures=%d", service.active, first, capture.Count())
	}
	if counts := service.Counts(); counts.Sessions != 1 || counts.Listeners != 1 {
		t.Fatalf("counts = %+v", counts)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 1 {
		t.Fatalf("driver counts = %+v", counts)
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if service.Counts() != (ServiceCounts{}) || driver.ResourceCounts().Sinks != 0 {
		t.Fatal("measurement resources leaked after close")
	}
}

func TestOrphanPointerReleaseCannotCreateMeasurement(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "tray-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.9, "v": 0.02}}); err != nil {
		t.Fatal(err)
	}
	if a.result != nil || a.dragStart != nil || a.twoPointFirst != nil || a.spacingFirst != nil {
		t.Fatalf("orphan pointer release created measurement state: result=%+v drag=%+v first=%+v spacing=%+v", a.result, a.dragStart, a.twoPointFirst, a.spacingFirst)
	}
	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	if a.result == nil || a.result.Point == nil {
		t.Fatalf("normal press/release no longer created a point: %+v", a.result)
	}
	_ = service.Close(ctx)
}

func TestWindowReferenceRequiresCandidateConfirmationButManualFallbackRemainsAvailable(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	a.targetConfirmed = false // Product capture intentionally starts this way.
	dragMeasurement(t, a, ctx, 0.251, 0.251, 0.251, 0.251)
	if a.result != nil || !strings.Contains(a.status, "确认") {
		t.Fatalf("unconfirmed candidate must not yield a window-relative result: result=%+v status=%q", a.result, a.status)
	}
	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "referenceType", Value: string(ReferenceManualRegion)}); err != nil {
		t.Fatal(err)
	}
	if !a.manualPending {
		t.Fatal("manual reference fallback was unavailable before candidate confirmation")
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.2, "v": 0.2}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.4, "v": 0.6}}); err != nil {
		t.Fatal(err)
	}
	if a.reference.Type != ReferenceManualRegion {
		t.Fatalf("manual fallback reference = %+v", a.reference)
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestCloseRestoresCapturedWindowAndReportsLimitedRecovery(t *testing.T) {
	for name, restoreErr := range map[string]error{"restored": nil, "limited": errors.New("window was closed")} {
		t.Run(name, func(t *testing.T) {
			capture := &sessionCapture{}
			var restores int
			service, err := NewService(ServiceOptions{
				Driver: customui.NewMemoryDriver(), Clipboard: &sessionClipboard{}, BaseDir: t.TempDir(),
				Now: func() time.Time { return time.Date(2026, 9, 14, 11, 0, 0, 0, time.UTC) },
				Capture: captureFunc(func(ctx context.Context, target string) (CaptureFrame, error) {
					frame, err := capture.Capture(ctx, target)
					frame.Restore = func(context.Context) error { restores++; return restoreErr }
					return frame, err
				}),
			})
			if err != nil {
				t.Fatal(err)
			}
			if err := service.Open(context.Background(), "product-menu"); err != nil {
				t.Fatal(err)
			}
			err = service.Close(context.Background())
			if restores != 1 || service.Counts() != (ServiceCounts{}) {
				t.Fatalf("restore calls=%d counts=%+v", restores, service.Counts())
			}
			if restoreErr == nil && err != nil {
				t.Fatalf("successful restore returned %v", err)
			}
			if restoreErr != nil && (err == nil || !strings.Contains(err.Error(), "recovery limited")) {
				t.Fatalf("limited recovery error = %v", err)
			}
		})
	}
}

func TestOpenAndWaitAndEscapeCleanup(t *testing.T) {
	service, _, capture, clipboard := newSessionService(t)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- service.OpenAndWait(ctx, "recorder-toolbar") }()
	deadline := time.Now().Add(time.Second)
	for service.Counts().Sessions == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if service.Counts().Sessions != 1 || capture.Count() != 1 {
		t.Fatalf("waiting session did not open: counts=%+v captures=%d", service.Counts(), capture.Count())
	}
	active := service.active
	if err := active.handle(context.Background(), customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "Escape"}}); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("OpenAndWait did not return after Escape")
	}
	if len(clipboard.writes) != 0 || service.Counts() != (ServiceCounts{}) {
		t.Fatal("escape changed clipboard or leaked resources")
	}
}

func TestPointTwoPointRegionAndSpacingStayOnCanonicalSnapshot(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active

	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	if a.result == nil || a.result.Point == nil || a.result.Point.Color == nil || a.result.Point.Color.Hex != "#010203" {
		t.Fatalf("point result = %+v", a.result)
	}

	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "twoPoint"}); err != nil {
		t.Fatal(err)
	}
	dragMeasurement(t, a, ctx, 0.2, 0.2, 0.2, 0.2)
	dragMeasurement(t, a, ctx, 0.5, 0.6, 0.5, 0.6)
	if a.result == nil || a.result.TwoPoint == nil || a.result.TwoPoint.Distance <= 0 {
		t.Fatalf("two-point result = %+v", a.result)
	}

	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "referenceType", Value: string(ReferenceManualRegion)}); err != nil {
		t.Fatal(err)
	}
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.2, "v": 0.2}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.4, "v": 0.6}})
	if a.reference.Type != ReferenceManualRegion {
		t.Fatalf("manual reference = %+v", a.reference)
	}

	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "region"}); err != nil {
		t.Fatal(err)
	}
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.1, "v": 0.1}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.5, "v": 0.5}})
	if a.result == nil || a.result.Region == nil {
		t.Fatalf("region result = %+v", a.result)
	}
	before := a.result.Region.Absolute
	if err := a.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "ArrowRight"}}); err != nil {
		t.Fatal(err)
	}
	if a.result.Region.Absolute.X != before.X+1 {
		t.Fatalf("region was not nudged: before=%+v after=%+v", before, a.result.Region.Absolute)
	}

	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "spacing"}); err != nil {
		t.Fatal(err)
	}
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.1, "v": 0.1}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.2, "v": 0.2}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.6, "v": 0.6}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.8, "v": 0.8}})
	if a.result == nil || a.result.Spacing == nil || a.result.Spacing.Spacing.Horizontal.Relation != "right" {
		t.Fatalf("spacing result = %+v", a.result)
	}
	_ = service.Close(ctx)
}

func TestCopyAndSaveUseExactlySelectedExportTier(t *testing.T) {
	service, _, _, clipboard := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	for _, format := range []string{"concise", "human", "json"} {
		if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "outputFormat", Value: format}); err != nil {
			t.Fatal(err)
		}
		if err := a.copy(ctx); err != nil {
			t.Fatal(err)
		}
		if err := a.save(ctx); err != nil {
			t.Fatal(err)
		}
	}
	if len(clipboard.writes) != 3 {
		t.Fatalf("clipboard writes = %#v", clipboard.writes)
	}
	if !strings.Contains(clipboard.writes[0], "ref=windowOuterBounds") || !strings.Contains(clipboard.writes[1], "坐标空间") || !strings.Contains(clipboard.writes[2], `"kind": "point"`) {
		t.Fatalf("tiers = %#v", clipboard.writes)
	}
	files, err := os.ReadDir(service.saveDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 {
		t.Fatalf("saved files = %d, want one per selected tier", len(files))
	}
	var jsonFound bool
	for _, file := range files {
		if filepath.Ext(file.Name()) == ".json" {
			data, err := os.ReadFile(filepath.Join(service.saveDir, file.Name()))
			if err != nil {
				t.Fatal(err)
			}
			jsonFound = bytes.Contains(data, []byte(`"coordinateSpace"`))
		}
	}
	if !jsonFound {
		t.Fatal("structured save did not preserve coordinate-space contract")
	}
	_ = service.Close(ctx)
}

func TestRefreshMovesSurfaceWithNewDisplayAndClearsOldResult(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	before := a.frame.Snapshot.SampledAt
	if err := a.refresh(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	state, err := a.window.State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := customui.Bounds{X: 300, Y: -40, Width: 120, Height: 80}
	if state.Bounds != want {
		t.Fatalf("surface bounds = %+v, want %+v", state.Bounds, want)
	}
	if !a.frame.Snapshot.SampledAt.After(before) || a.result != nil || capture.Count() != 2 {
		t.Fatalf("refresh state sampled=%s result=%+v captures=%d", a.frame.Snapshot.SampledAt, a.result, capture.Count())
	}
	_ = service.Close(ctx)
}

func TestRefreshPatchesTheExistingSurfaceInsteadOfReplacingIt(t *testing.T) {
	service, driver, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	before, err := a.window.State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	beforeAsset := a.assetPath
	if err := a.refresh(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	after, err := a.window.State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if before.ID != after.ID || before.NativeWindowID != after.NativeWindowID {
		t.Fatalf("refresh replaced surface: before=%+v after=%+v", before, after)
	}
	if capture.Count() != 2 || driver.ResourceCounts().Sinks != 1 {
		t.Fatalf("refresh lifecycle capture=%d resources=%+v", capture.Count(), driver.ResourceCounts())
	}
	if _, err := os.Stat(beforeAsset); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("refresh retained obsolete snapshot %q: %v", beforeAsset, err)
	}
	preview, ok := driver.ControlSnapshot(a.session.ID(), a.window.ID(), previewID)
	if !ok || preview.Source != filepath.Base(a.assetPath) {
		t.Fatalf("refresh did not patch preview source: %#v exists=%v", preview, ok)
	}
	_ = service.Close(ctx)
}

func TestCandidateSelectionAndSnapReuseTheFrozenFrame(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "developer-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	if err := a.setTool(ctx, "region"); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "targetWindow", Value: "other"}); err != nil {
		t.Fatal(err)
	}
	if a.selectedTarget != "other" || capture.Count() != 1 {
		t.Fatalf("candidate selection recaptured or selected wrong target: target=%q captures=%d", a.selectedTarget, capture.Count())
	}
	if err := a.confirmSelectedTarget(); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.25, "v": 0.25}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.251, "v": 0.251}}); err != nil {
		t.Fatal(err)
	}
	if a.result == nil || a.result.Region == nil || a.result.Region.Absolute != a.reference.Bounds {
		t.Fatalf("short region selection did not snap to selected evidenced window: result=%+v reference=%+v", a.result, a.reference)
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Alt", "phase": "down"}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.25, "v": 0.25}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.251, "v": 0.251}}); err != nil {
		t.Fatal(err)
	}
	if a.result == nil || a.result.Region == nil || a.result.Region.Absolute == a.reference.Bounds {
		t.Fatalf("Option did not suspend candidate snap: result=%+v reference=%+v", a.result, a.reference)
	}
	if capture.Count() != 1 {
		t.Fatalf("candidate snap captured again: %d", capture.Count())
	}
	_ = service.Close(ctx)
}

func TestStateChangesPatchOneStableMeasurementSurface(t *testing.T) {
	service, driver, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "developer-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	initial, err := a.window.State(ctx)
	if err != nil {
		t.Fatal(err)
	}
	assertStable := func(step string) {
		t.Helper()
		state, err := a.window.State(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if state.ID != initial.ID || state.NativeWindowID != initial.NativeWindowID || driver.ResourceCounts().Sinks != 1 || capture.Count() != 1 {
			t.Fatalf("%s changed stable lifecycle: initial=%+v now=%+v counts=%+v capture=%d", step, initial, state, driver.ResourceCounts(), capture.Count())
		}
	}
	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	assertStable("point result")
	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "region"}); err != nil {
		t.Fatal(err)
	}
	assertStable("tool change")
	if err := a.handle(ctx, customui.Event{Type: "click", TargetID: "details"}); err != nil {
		t.Fatal(err)
	}
	assertStable("open inspector")
	if err := a.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "Escape"}}); err != nil {
		t.Fatal(err)
	}
	assertStable("close inspector")
	if err := a.handle(ctx, customui.Event{Type: "click", TargetID: "selectReference"}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.2, "v": 0.2}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.5, "v": 0.6}}); err != nil {
		t.Fatal(err)
	}
	assertStable("manual reference")
	overlay, ok := driver.ControlSnapshot(a.session.ID(), a.window.ID(), "measurementOverlay")
	if !ok || overlay.Source == "" {
		t.Fatalf("overlay source was not retained by the MemoryDriver: %#v exists=%v", overlay, ok)
	}
	_ = service.Close(ctx)
}

func TestRegionBodyAndAllEightHandlesEditCanonicalGeometry(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "developer-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	if err := a.setTool(ctx, "region"); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.2, "v": 0.2}}); err != nil {
		t.Fatal(err)
	}
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.6, "v": 0.7}}); err != nil {
		t.Fatal(err)
	}
	if a.result == nil || a.result.Region == nil {
		t.Fatalf("initial region = %#v", a.result)
	}
	base := *a.result
	region := base.Region.Absolute
	edges := map[string]Point{
		"n": {X: region.X + region.Width/2, Y: region.Y}, "ne": {X: region.Right(), Y: region.Y},
		"e": {X: region.Right(), Y: region.Y + region.Height/2}, "se": {X: region.Right(), Y: region.Bottom()},
		"s": {X: region.X + region.Width/2, Y: region.Bottom()}, "sw": {X: region.X, Y: region.Bottom()},
		"w": {X: region.X, Y: region.Y + region.Height/2}, "nw": {X: region.X, Y: region.Y},
	}
	for handle, start := range edges {
		a.result = &base
		if err := a.beginSelection(ctx, start); err != nil || a.regionEdit == nil || a.regionEdit.handle != handle {
			t.Fatalf("begin %s err=%v edit=%+v", handle, err, a.regionEdit)
		}
		end := start
		if strings.Contains(handle, "w") {
			end.X -= 5
		}
		if strings.Contains(handle, "e") {
			end.X += 5
		}
		if strings.Contains(handle, "n") {
			end.Y -= 5
		}
		if strings.Contains(handle, "s") {
			end.Y += 5
		}
		if err := a.finishSelection(ctx, end); err != nil {
			t.Fatalf("finish %s: %v", handle, err)
		}
		got := a.result.Region.Absolute
		if got.Width < 1 || got.Height < 1 {
			t.Fatalf("%s produced non-positive region: %+v", handle, got)
		}
		if strings.Contains(handle, "w") && got.Right() != region.Right() {
			t.Fatalf("%s moved its opposite horizontal edge: base=%+v got=%+v", handle, region, got)
		}
		if strings.Contains(handle, "n") && got.Bottom() != region.Bottom() {
			t.Fatalf("%s moved its opposite vertical edge: base=%+v got=%+v", handle, region, got)
		}
	}
	a.result = &base
	body := Point{X: region.X + region.Width/2, Y: region.Y + region.Height/2}
	if err := a.beginSelection(ctx, body); err != nil || a.regionEdit == nil || a.regionEdit.kind != "move" {
		t.Fatalf("begin body move err=%v edit=%+v", err, a.regionEdit)
	}
	if err := a.finishSelection(ctx, Point{X: body.X + 7, Y: body.Y - 3}); err != nil {
		t.Fatal(err)
	}
	moved := a.result.Region.Absolute
	if moved.Width != region.Width || moved.Height != region.Height || moved.X != region.X+7 || moved.Y != region.Y-3 {
		t.Fatalf("body drag altered dimensions: base=%+v moved=%+v", region, moved)
	}
	a.result = &base
	if err := a.beginSelection(ctx, edges["w"]); err != nil {
		t.Fatal(err)
	}
	if err := a.finishSelection(ctx, Point{X: region.Right() + 30, Y: edges["w"].Y}); err != nil {
		t.Fatal(err)
	}
	crossed := a.result.Region.Absolute
	if crossed.Width < 1 || crossed.Right() != region.Right() {
		t.Fatalf("crossing handle did not preserve normalized minimum geometry: %+v", crossed)
	}
	before := crossed
	if err := a.nudge(ctx, "ArrowRight", true); err != nil {
		t.Fatal(err)
	}
	if a.result.Region.Absolute.X != before.X+10 || a.result.Region.Absolute.Width != before.Width {
		t.Fatalf("Shift+Arrow did not move region by ten logical units: before=%+v after=%+v", before, a.result.Region.Absolute)
	}
	_ = service.Close(ctx)
}

func TestKeyboardAndEscapeHierarchyAreSessionScoped(t *testing.T) {
	service, _, capture, clipboard := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "global-shortcut"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	dragMeasurement(t, a, ctx, 0.25, 0.25, 0.25, 0.25)
	for key, want := range map[string]string{"1": "point", "2": "region", "3": "twoPoint", "4": "spacing"} {
		if err := a.handleKey(ctx, map[string]any{"key": key}); err != nil || a.tool != want {
			t.Fatalf("key %s tool=%q err=%v", key, a.tool, err)
		}
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Alt", "phase": "down"}); err != nil || !a.altDown {
		t.Fatalf("Alt keydown state=%v err=%v", a.altDown, err)
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Alt", "phase": "up"}); err != nil || a.altDown {
		t.Fatalf("Alt keyup state=%v err=%v", a.altDown, err)
	}
	selected := a.selectedTarget
	if err := a.handleKey(ctx, map[string]any{"key": "Tab"}); err != nil || a.selectedTarget == selected || capture.Count() != 1 {
		t.Fatalf("Tab did not cycle an existing candidate without capture: selected=%q err=%v captures=%d", a.selectedTarget, err, capture.Count())
	}
	for _, modifiers := range []map[string]any{{"key": "c", "meta": true}, {"key": "c", "meta": true, "shift": true}, {"key": "c", "meta": true, "alt": true}} {
		if err := a.handleKey(ctx, modifiers); err != nil {
			t.Fatal(err)
		}
	}
	if len(clipboard.writes) != 3 {
		t.Fatalf("three keyboard copy levels wrote %d values", len(clipboard.writes))
	}
	if err := a.handle(ctx, customui.Event{Type: "click", TargetID: "copyMenu"}); err != nil || !a.copyMenuOpen {
		t.Fatalf("open copy menu err=%v open=%v", err, a.copyMenuOpen)
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil || a.copyMenuOpen || service.Counts().Sessions != 1 {
		t.Fatalf("Esc did not close copy menu locally: err=%v state=%+v", err, service.Counts())
	}
	if err := a.handle(ctx, customui.Event{Type: "click", TargetID: "details"}); err != nil || !a.inspectorOpen {
		t.Fatal(err)
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil || a.inspectorOpen || service.Counts().Sessions != 1 {
		t.Fatalf("Esc did not close Inspector locally: err=%v state=%+v", err, service.Counts())
	}
	if err := a.confirmSelectedTarget(); err != nil {
		t.Fatal(err)
	}
	if err := a.setTool(ctx, "twoPoint"); err != nil {
		t.Fatal(err)
	}
	dragMeasurement(t, a, ctx, 0.1, 0.2, 0.1, 0.2)
	if a.twoPointFirst == nil {
		t.Fatalf("start two-point first=%+v", a.twoPointFirst)
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil || a.twoPointFirst != nil || service.Counts().Sessions != 1 {
		t.Fatalf("Esc did not cancel local two-point edit: err=%v first=%+v counts=%+v", err, a.twoPointFirst, service.Counts())
	}
	if err := a.handleKey(ctx, map[string]any{"key": "Escape"}); err != nil {
		t.Fatal(err)
	}
	if service.Counts() != (ServiceCounts{}) {
		t.Fatalf("final Esc did not exit session: %+v", service.Counts())
	}
}
