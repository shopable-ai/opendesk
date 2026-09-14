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
		PNG: data.Bytes(),
		Snapshot: Snapshot{SampledAt: time.Date(2026, 9, 14, 10, 0, c.count, 0, time.UTC), Mapping: mapping},
		Reference: Reference{Type: ReferenceWindowOuter, Bounds: bounds, Window: &WindowIdentity{ID: target, PID: 7, Title: "Fixture"}},
		Targets: []TargetWindow{{ID: "target", Title: "Fixture", PID: 7}, {ID: "other", Title: "Other", PID: 8}},
		SelectedTargetID: target,
	}, nil
}

type sessionClipboard struct {
	mu     sync.Mutex
	writes []string
}

func (c *sessionClipboard) Copy(value string) error {
	c.mu.Lock()
	c.writes = append(c.writes, value)
	c.mu.Unlock()
	return nil
}

type updateFailureDriver struct {
	customui.Driver
	failTarget string
	fail       bool
}

func (d *updateFailureDriver) Create(ctx context.Context, sessionID string, spec customui.WindowSpec, sink func(customui.Event)) (customui.DriverWindow, error) {
	window, err := d.Driver.Create(ctx, sessionID, spec, sink)
	if err != nil {
		return nil, err
	}
	return &updateFailureWindow{DriverWindow: window, owner: d}, nil
}

type updateFailureWindow struct {
	customui.DriverWindow
	owner *updateFailureDriver
}

func (w *updateFailureWindow) UpdateControl(ctx context.Context, id string, patch customui.ControlPatch) (customui.ControlState, error) {
	if w.owner.fail && id == w.owner.failTarget {
		return customui.ControlState{}, errors.New("injected control update failure")
	}
	return w.DriverWindow.UpdateControl(ctx, id, patch)
}

func newSessionService(t *testing.T) (*Service, *customui.MemoryDriver, *sessionCapture, *sessionClipboard) {
	t.Helper()
	driver := customui.NewMemoryDriver()
	capture := &sessionCapture{}
	clipboard := &sessionClipboard{}
	service, err := NewService(ServiceOptions{
		Driver: driver, Capture: capture, Clipboard: clipboard,
		BaseDir: t.TempDir(),
		Now: func() time.Time { return time.Date(2026, 9, 14, 11, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	return service, driver, capture, clipboard
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

	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.25, "v": 0.25}}); err != nil {
		t.Fatal(err)
	}
	if a.result == nil || a.result.Point == nil || a.result.Point.Color == nil || a.result.Point.Color.Hex != "#010203" {
		t.Fatalf("point result = %+v", a.result)
	}

	if err := a.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "twoPoint"}); err != nil {
		t.Fatal(err)
	}
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.2, "v": 0.2}})
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.5, "v": 0.6}})
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
	if err := a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.25, "v": 0.25}}); err != nil {
		t.Fatal(err)
	}
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
	_ = a.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.25, "v": 0.25}})
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

func TestRefreshDoesNotSwitchCanonicalFrameWhenPreviewUpdateFails(t *testing.T) {
	baseDriver := customui.NewMemoryDriver()
	driver := &updateFailureDriver{Driver: baseDriver, failTarget: previewID}
	capture := &sessionCapture{}
	clipboard := &sessionClipboard{}
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Clipboard: clipboard, BaseDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	a := service.active
	beforeSample, beforeAsset := a.frame.Snapshot.SampledAt, a.assetPath
	driver.fail = true
	if err := a.refresh(ctx, "other"); err == nil {
		t.Fatal("refresh succeeded after host rejected preview")
	}
	if a.frame.Snapshot.SampledAt != beforeSample || a.assetPath != beforeAsset || a.selectedTarget != "target" {
		t.Fatalf("failed refresh switched canonical frame: sampled=%s asset=%q target=%q", a.frame.Snapshot.SampledAt, a.assetPath, a.selectedTarget)
	}
	assets, err := filepath.Glob(filepath.Join(service.baseDir, "snapshot-*.png"))
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 1 || assets[0] != beforeAsset {
		t.Fatalf("failed refresh assets = %#v, want only %q", assets, beforeAsset)
	}
	driver.fail = false
	_ = service.Close(ctx)
}
