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
	img := image.NewRGBA(image.Rect(0, 0, 200, 100))
	img.Set(50, 25, color.RGBA{R: 1, G: 2, B: 3, A: 255})
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		return CaptureFrame{}, err
	}
	mapping, err := NewCaptureMapping(Point{X: -100, Y: 20}, Size{Width: 100, Height: 50}, PixelSize{Width: 200, Height: 100}, "fixture", 1)
	if err != nil {
		return CaptureFrame{}, err
	}
	if target == "" {
		target = "target"
	}
	return CaptureFrame{
		PNG: data.Bytes(), Snapshot: Snapshot{SampledAt: time.Date(2026, 9, 14, 10, 0, c.count, 0, time.UTC), Mapping: mapping},
		Reference: Reference{Type: ReferenceWindowOuter, Bounds: Rect{X: -80, Y: 25, Width: 60, Height: 30}, Window: &WindowIdentity{ID: target, PID: 7, Title: "Fixture"}},
		Targets:   []TargetWindow{{ID: "target", Title: "Fixture", PID: 7}, {ID: "other", Title: "Other", PID: 8}}, SelectedTargetID: target,
	}, nil
}

type sessionClipboard struct {
	mu     sync.Mutex
	writes []string
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

func (c *sessionClipboard) Copy(value string) error {
	c.mu.Lock()
	c.writes = append(c.writes, value)
	c.mu.Unlock()
	return nil
}

func newSessionService(t *testing.T) (*Service, *customui.MemoryDriver, *sessionCapture, *sessionClipboard) {
	t.Helper()
	driver := customui.NewMemoryDriver()
	capture := &sessionCapture{}
	clipboard := &sessionClipboard{}
	service, err := NewService(ServiceOptions{Driver: driver, Capture: capture, Clipboard: clipboard, BaseDir: t.TempDir(), Now: func() time.Time { return time.Date(2026, 9, 14, 11, 0, 0, 0, time.UTC) }})
	if err != nil {
		t.Fatal(err)
	}
	return service, driver, capture, clipboard
}

func TestServiceAllowsOnlyOneSessionAndCleansListener(t *testing.T) {
	service, driver, capture, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	first := service.active
	if err := service.Open(ctx, "recorder"); err != nil {
		t.Fatal(err)
	}
	if service.active != first || capture.Count() != 1 {
		t.Fatalf("duplicate open created another session: active=%p first=%p captures=%d", service.active, first, capture.Count())
	}
	if counts := service.Counts(); counts.Sessions != 1 || counts.Listeners != 1 {
		t.Fatalf("active counts = %+v", counts)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 1 {
		t.Fatalf("driver counts while active = %+v", counts)
	}
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
	if counts := service.Counts(); counts != (ServiceCounts{}) {
		t.Fatalf("service resources leaked: %+v", counts)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 {
		t.Fatalf("driver listener leaked: %+v", counts)
	}
}

func TestEscapeCancelsWithoutChangingClipboardAndCanReopen(t *testing.T) {
	service, _, capture, clipboard := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	active := service.active
	if err := active.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "Escape"}}); err != nil {
		t.Fatal(err)
	}
	if len(clipboard.writes) != 0 {
		t.Fatalf("cancel changed clipboard: %#v", clipboard.writes)
	}
	if err := service.Open(ctx, "recorder"); err != nil {
		t.Fatal(err)
	}
	if capture.Count() != 2 || service.active == active {
		t.Fatalf("service did not reopen cleanly: captures=%d", capture.Count())
	}
	_ = service.Close(ctx)
}

func TestOpenAndWaitTracksExistingSessionUntilItCloses(t *testing.T) {
	service, _, capture, _ := newSessionService(t)
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
	select {
	case err := <-done:
		t.Fatalf("OpenAndWait returned before close: %v", err)
	default:
	}
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("OpenAndWait did not return after close")
	}
}

func TestPointerCopyEnterAndRefreshUseCanonicalResultAndNewSnapshot(t *testing.T) {
	service, _, capture, clipboard := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	active := service.active
	down := customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.25, "v": 0.25}}
	up := customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.25, "v": 0.25}}
	if err := active.handle(ctx, down); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, up); err != nil {
		t.Fatal(err)
	}
	if active.result == nil || active.result.Point.Color == nil || active.result.Point.Color.Hex != "#010203" {
		t.Fatalf("point result = %+v", active.result)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "c", "meta": true}}); err != nil {
		t.Fatal(err)
	}
	if len(clipboard.writes) != 1 || !bytes.Contains([]byte(clipboard.writes[0]), []byte(`"kind": "point"`)) {
		t.Fatalf("canonical copy = %#v", clipboard.writes)
	}
	before := active.frame.Snapshot.SampledAt
	if err := active.refresh(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	if !active.frame.Snapshot.SampledAt.After(before) || active.result != nil || capture.Count() != 2 {
		t.Fatalf("refresh state sampled=%s result=%+v captures=%d", active.frame.Snapshot.SampledAt, active.result, capture.Count())
	}
	if err := active.handle(ctx, down); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, up); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "Enter"}}); err != nil {
		t.Fatal(err)
	}
	if len(clipboard.writes) != 2 || service.Counts() != (ServiceCounts{}) {
		t.Fatalf("enter did not copy and exit: writes=%d counts=%+v", len(clipboard.writes), service.Counts())
	}
}

func TestRefreshDoesNotSwitchFrameBeforePreviewAcceptsNewSnapshot(t *testing.T) {
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
	active := service.active
	beforeSample := active.frame.Snapshot.SampledAt
	beforeAsset := active.assetPath
	driver.fail = true
	if err := active.refresh(ctx, "other"); err == nil {
		t.Fatal("refresh succeeded after the host rejected the new preview")
	}
	if active.frame.Snapshot.SampledAt != beforeSample || active.assetPath != beforeAsset || active.selectedTarget != "target" {
		t.Fatalf("failed refresh switched canonical frame: sampled=%s asset=%q target=%q", active.frame.Snapshot.SampledAt, active.assetPath, active.selectedTarget)
	}
	assets, err := filepath.Glob(filepath.Join(service.baseDir, "snapshot-*.png"))
	if err != nil {
		t.Fatal(err)
	}
	if len(assets) != 1 || assets[0] != beforeAsset {
		t.Fatalf("failed refresh assets = %#v, want only %q", assets, beforeAsset)
	}
	driver.fail = false
	if err := service.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestManualReferenceRegionSpacingNudgeAndSaveStayCanonical(t *testing.T) {
	service, _, _, _ := newSessionService(t)
	ctx := context.Background()
	if err := service.Open(ctx, "product-menu"); err != nil {
		t.Fatal(err)
	}
	active := service.active

	point := customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.25, "v": 0.25}}
	if err := active.handle(ctx, point); err != nil {
		t.Fatal(err)
	}
	if active.result == nil {
		t.Fatal("initial point result was not created")
	}
	if err := active.handle(ctx, customui.Event{Type: "change", TargetID: "referenceType", Value: string(ReferenceManualRegion)}); err != nil {
		t.Fatal(err)
	}
	resultControl, err := active.window.ControlState(ctx, "measurementResult")
	if err != nil {
		t.Fatal(err)
	}
	copyControl, err := active.window.ControlState(ctx, "copyResult")
	if err != nil {
		t.Fatal(err)
	}
	if active.result != nil || resultControl.Text != "尚无结果" || !copyControl.Disabled {
		t.Fatalf("reference change retained stale result: result=%+v control=%+v copy=%+v", active.result, resultControl, copyControl)
	}

	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.2, "v": 0.2}}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.4, "v": 0.6}}); err != nil {
		t.Fatal(err)
	}
	if active.reference.Type != ReferenceManualRegion || active.reference.Bounds != (Rect{X: -80, Y: 30, Width: 20, Height: 20}) {
		t.Fatalf("manual reference = %+v", active.reference)
	}

	if err := active.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "region"}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.1, "v": 0.1}}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.5, "v": 0.5}}); err != nil {
		t.Fatal(err)
	}
	if active.result == nil || active.result.Region == nil || active.result.Region.EdgeDistances != (EdgeDistances{Left: -10, Top: -5, Right: -10, Bottom: 5}) {
		t.Fatalf("region result = %+v", active.result)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "ArrowLeft", "shift": true}}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.key", Fields: map[string]any{"key": "ArrowDown"}}); err != nil {
		t.Fatal(err)
	}
	if got := active.result.Region.Absolute; got != (Rect{X: -91, Y: 26, Width: 41, Height: 20}) {
		t.Fatalf("nudged region = %+v", got)
	}

	if err := active.handle(ctx, customui.Event{Type: "change", TargetID: "measurementTool", Value: "spacing"}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.1, "v": 0.1}}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerdown", Fields: map[string]any{"u": 0.6, "v": 0.6}}); err != nil {
		t.Fatal(err)
	}
	if err := active.handle(ctx, customui.Event{Type: "measurement.pointerup", Fields: map[string]any{"u": 0.8, "v": 0.8}}); err != nil {
		t.Fatal(err)
	}
	if active.result == nil || active.result.Spacing == nil || active.result.Spacing.Spacing.Horizontal.Relation != "right" {
		t.Fatalf("spacing result = %+v", active.result)
	}
	if err := active.save(ctx); err != nil {
		t.Fatal(err)
	}
	jsonFiles, err := filepath.Glob(filepath.Join(service.saveDir, "measurement-*.json"))
	if err != nil || len(jsonFiles) != 1 {
		t.Fatalf("saved JSON files = %#v, err=%v", jsonFiles, err)
	}
	textFiles, err := filepath.Glob(filepath.Join(service.saveDir, "measurement-*.txt"))
	if err != nil || len(textFiles) != 1 {
		t.Fatalf("saved text files = %#v, err=%v", textFiles, err)
	}
	jsonData, err := os.ReadFile(jsonFiles[0])
	if err != nil {
		t.Fatal(err)
	}
	humanData, err := os.ReadFile(textFiles[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(jsonData), `"kind": "spacing"`) || !strings.Contains(string(humanData), "间距：horizontal=") {
		t.Fatalf("saved canonical outputs disagree: json=%s human=%s", jsonData, humanData)
	}
	_ = service.Close(ctx)
}

func TestMeasurementWindowNeverExceedsPositiveAvailableDimension(t *testing.T) {
	for _, test := range []struct {
		available, minimum, maximum, want float64
	}{
		{available: 400, minimum: 640, maximum: 1120, want: 400},
		{available: 800, minimum: 640, maximum: 1120, want: 800},
		{available: 1400, minimum: 640, maximum: 1120, want: 1120},
		{available: 0, minimum: 640, maximum: 1120, want: 640},
	} {
		if got := boundedWindowDimension(test.available, test.minimum, test.maximum); got != test.want {
			t.Fatalf("boundedWindowDimension(%v, %v, %v) = %v, want %v", test.available, test.minimum, test.maximum, got, test.want)
		}
	}
}
