package automation

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestScreenCaptureOptionValidationUsesDeterministicDisplays(t *testing.T) {
	runtimeValue := goja.New()
	displays := func() []DisplayInfo { return testCaptureDisplays() }
	output := filepath.Join(t.TempDir(), "capture.mov")
	options, err := parseScreenRecordingOptions(runtimeValue.ToValue(map[string]interface{}{
		"target": map[string]interface{}{
			"type": "region", "displayIndex": 1, "displayId": "display-1",
			"x": -100, "y": 50, "width": 320, "height": 240,
		},
		"fps": 30, "output": output, "showCursor": true,
	}), displays)
	if err != nil {
		t.Fatal(err)
	}
	if options.Target.X != -100 || options.Target.Y != 50 || options.Target.PixelWidth != 640 || options.Target.PixelHeight != 480 {
		t.Fatalf("normalized target=%#v", options.Target)
	}
	if !options.ShowCursor || options.Output != output {
		t.Fatalf("normalized options=%#v", options)
	}

	invalid := []map[string]interface{}{
		{"target": map[string]interface{}{"type": "window"}, "output": output},
		{"target": map[string]interface{}{"type": "display", "displayIndex": 2}, "output": output},
		{"target": map[string]interface{}{"type": "display", "displayId": 1}, "output": output},
		{"target": map[string]interface{}{"type": "display", "x": 0}, "output": output},
		{"target": map[string]interface{}{"type": "region", "displayIndex": 1, "x": -101, "y": 50, "width": 320, "height": 240}, "output": output},
		{"target": map[string]interface{}{"type": "display"}, "output": "relative.mov"},
		{"target": map[string]interface{}{"type": "display"}, "output": output, "fps": 29},
	}
	for index, value := range invalid {
		if _, err := parseScreenRecordingOptions(runtimeValue.ToValue(value), displays); screenCaptureErrorCode(err) != ScreenCaptureInvalidArgument && screenCaptureErrorCode(err) != ScreenCaptureTargetMissing {
			t.Fatalf("invalid case %d error=%v code=%q", index, err, screenCaptureErrorCode(err))
		}
	}

	selector, err := parseRegionSelectorOptions(runtimeValue.ToValue(map[string]interface{}{
		"dimOutside": false, "movable": false, "resizable": true, "minWidth": 40, "minHeight": 50,
	}))
	if err != nil || selector.DimOutside || selector.Movable || !selector.Resizable || selector.MinWidth != 40 || selector.MinHeight != 50 {
		t.Fatalf("selector=%#v err=%v", selector, err)
	}
	if _, err := parseRegionSelectorOptions(runtimeValue.ToValue(map[string]interface{}{"unknown": true})); screenCaptureErrorCode(err) != ScreenCaptureInvalidArgument {
		t.Fatalf("unknown selector field error=%v", err)
	}
}

func TestScreenCaptureJSBindingProjectsLowerCamelFieldsAndStops(t *testing.T) {
	backend := newMemoryScreenCaptureBackend()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	output := filepath.Join(t.TempDir(), "capture.mov")
	ready := make(chan *ScreenCaptureRuntime, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		methods := map[string]interface{}{}
		manager := registerScreenCapture(runtimeValue, methods, InitJSOptions{
			EventLoop:                    loop,
			ScreenCaptureBackendFactory:  func() ScreenCaptureBackend { return backend },
			ScreenCaptureDisplayResolver: func() []DisplayInfo { return testCaptureDisplays() },
		})
		runtimeValue.Set("Screen", methods)
		runtimeValue.Set("captureOutput", output)
		_, err := runtimeValue.RunString(`
			globalThis.captureDone = false;
			globalThis.captureFailure = "";
			Promise.all([
				Screen.selectRegion().then(region => {
					if (region.x !== 120 || region.X !== undefined || region.displayId !== "display-1") throw new Error("invalid region projection");
				}),
				Screen.startRecording({
					target: { type: "region", displayIndex: 1, displayId: "display-1", x: 120, y: 120, width: 320, height: 240 },
					fps: 30, output: captureOutput, showCursor: true
				}).then(async recording => {
					if (recording.target.type !== "region" || recording.target.Type !== undefined || recording.state !== "recording") throw new Error("invalid session projection");
					const result = await recording.stop();
					if (!result.finalized || result.Finalized !== undefined || result.target.displayId !== "display-1") throw new Error("invalid result projection");
					if (recording.state !== "stopped") throw new Error("session state did not update");
				})
			]).then(() => { captureDone = true; }, error => { captureFailure = String(error); captureDone = true; });
		`)
		if err != nil {
			t.Errorf("capture script: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop stopped before setup")
	}
	manager := <-ready
	waitForScreenCaptureBool(t, loop, "captureDone", true)
	if failure := screenCaptureStringValue(t, loop, "captureFailure"); failure != "" {
		t.Fatal(failure)
	}
	if backend.StopCalls() != 1 {
		t.Fatalf("stop calls=%d", backend.StopCalls())
	}
	workers, pending, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || sessions != 0 {
		t.Fatalf("resources=%d/%d/%d", workers, pending, sessions)
	}
	closeScreenCaptureRuntime(t, loop, manager)
}

func TestScreenCaptureValidationPrecedesBackendAndTeardownFinalizesSession(t *testing.T) {
	backend := newMemoryScreenCaptureBackend()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	output := filepath.Join(t.TempDir(), "capture.mov")
	ready := make(chan *ScreenCaptureRuntime, 1)
	loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		methods := map[string]interface{}{}
		manager := registerScreenCapture(runtimeValue, methods, InitJSOptions{
			EventLoop:                    loop,
			ScreenCaptureBackendFactory:  func() ScreenCaptureBackend { return backend },
			ScreenCaptureDisplayResolver: func() []DisplayInfo { return testCaptureDisplays() },
		})
		runtimeValue.Set("Screen", methods)
		runtimeValue.Set("captureOutput", output)
		_, err := runtimeValue.RunString(`
			globalThis.captureStarted = false;
			globalThis.invalidCode = "pending";
			Screen.startRecording({ target: { type: "display" }, output: "relative.mov" }).catch(error => { invalidCode = error.code; });
			Screen.startRecording({ target: { type: "display", displayIndex: 1 }, output: captureOutput }).then(() => { captureStarted = true; });
		`)
		if err != nil {
			t.Errorf("capture script: %v", err)
		}
		ready <- manager
	})
	manager := <-ready
	waitForScreenCaptureBool(t, loop, "captureStarted", true)
	if code := screenCaptureStringValue(t, loop, "invalidCode"); code != string(ScreenCaptureInvalidArgument) {
		t.Fatalf("invalid code=%q", code)
	}
	if backend.StartCalls() != 1 {
		t.Fatalf("backend start calls=%d, want only the valid request", backend.StartCalls())
	}
	_, _, sessions := manager.ResourceCounts()
	if sessions != 1 {
		t.Fatalf("active sessions=%d", sessions)
	}
	closeScreenCaptureRuntime(t, loop, manager)
	if backend.StopCalls() != 1 {
		t.Fatalf("teardown stop calls=%d", backend.StopCalls())
	}
	workers, pending, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || sessions != 0 {
		t.Fatalf("resources after teardown=%d/%d/%d", workers, pending, sessions)
	}
}

func TestScreenCaptureCapabilitiesKeepAudioAndFramesExplicit(t *testing.T) {
	backend := newMemoryScreenCaptureBackend()
	runtimeValue := goja.New()
	manager := registerScreenCapture(runtimeValue, map[string]interface{}{}, InitJSOptions{ScreenCaptureBackendFactory: func() ScreenCaptureBackend { return backend }})
	capabilities := manager.capabilities()
	if capabilities["backend"] != "memory-screen-capture" || capabilities["schemaVersion"] != 1 {
		t.Fatalf("capabilities=%#v", capabilities)
	}
	audio := capabilities["audio"].(map[string]interface{})
	if audio["system"] != false || audio["microphone"] != false || audio["namespace"] != "Audio" {
		t.Fatalf("audio capability=%#v", audio)
	}
	frames := capabilities["frameStream"].(map[string]interface{})
	if frames["supported"] != false || frames["status"] != "notImplemented" {
		t.Fatalf("frame capability=%#v", frames)
	}
	manager.Close()
}

func testCaptureDisplays() []DisplayInfo {
	return []DisplayInfo{{
		Index: 1, ID: "display-1", IsPrimary: true, X: -100, Y: 50,
		Width: 1000, Height: 700, PixelWidth: 2000, PixelHeight: 1400, Scale: 2,
	}}
}

func screenCaptureErrorCode(err error) ScreenCaptureErrorCode {
	if typed, ok := err.(*ScreenCaptureError); ok {
		return typed.Code
	}
	return ""
}

func closeScreenCaptureRuntime(t *testing.T, loop *eventloop.EventLoop, manager *ScreenCaptureRuntime) {
	t.Helper()
	done := make(chan struct{}, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); done <- struct{}{} }) {
		t.Fatal("event loop stopped before capture close")
	}
	<-done
	manager.Wait()
}

func waitForScreenCaptureBool(t *testing.T, loop *eventloop.EventLoop, name string, want bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		result := make(chan bool, 1)
		if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).ToBoolean() }) {
			t.Fatal("event loop stopped before capture value read")
		}
		if <-result == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s did not reach %v", name, want)
}

func screenCaptureStringValue(t *testing.T, loop *eventloop.EventLoop, name string) string {
	t.Helper()
	result := make(chan string, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).String() }) {
		t.Fatal("event loop stopped before capture value read")
	}
	return <-result
}

type memoryScreenCaptureBackend struct {
	mu          sync.Mutex
	startCalls  int
	stopCalls   int
	lastOptions ScreenRecordingOptions
}

func newMemoryScreenCaptureBackend() *memoryScreenCaptureBackend {
	return &memoryScreenCaptureBackend{}
}
func (b *memoryScreenCaptureBackend) Name() string { return "memory-screen-capture" }
func (b *memoryScreenCaptureBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"selector":  map[string]interface{}{"supported": true},
		"recording": map[string]interface{}{"supported": true, "targets": map[string]bool{"display": true, "region": true, "window": false}},
	}
}
func (b *memoryScreenCaptureBackend) SelectRegion(context.Context, RegionSelectorOptions) (SelectedRegion, error) {
	return SelectedRegion{X: 120, Y: 120, Width: 320, Height: 240, DisplayID: "display-1", DisplayIndex: 1, ScaleFactor: 2, PixelWidth: 640, PixelHeight: 480}, nil
}
func (b *memoryScreenCaptureBackend) StartRecording(_ context.Context, options ScreenRecordingOptions) (ScreenRecordingBackendSession, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.startCalls++
	b.lastOptions = options
	return &memoryScreenRecordingSession{id: "memory-recording-1", options: options, startedAt: time.Now(), backend: b}, nil
}
func (b *memoryScreenCaptureBackend) StartCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.startCalls
}
func (b *memoryScreenCaptureBackend) StopCalls() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.stopCalls
}

type memoryScreenRecordingSession struct {
	id        string
	options   ScreenRecordingOptions
	startedAt time.Time
	backend   *memoryScreenCaptureBackend
	once      sync.Once
}

func (s *memoryScreenRecordingSession) ID() string                      { return s.id }
func (s *memoryScreenRecordingSession) Options() ScreenRecordingOptions { return s.options }
func (s *memoryScreenRecordingSession) StartedAt() time.Time            { return s.startedAt }
func (s *memoryScreenRecordingSession) Stop(context.Context) (ScreenRecordingResult, error) {
	s.once.Do(func() {
		s.backend.mu.Lock()
		s.backend.stopCalls++
		s.backend.mu.Unlock()
	})
	return ScreenRecordingResult{
		ID: s.id, Output: s.options.Output, Container: "video/quicktime", Codec: "H.264", FPS: s.options.FPS,
		DurationMS: 1000, SizeBytes: 4096, PixelWidth: s.options.Target.PixelWidth, PixelHeight: s.options.Target.PixelHeight,
		Target: s.options.Target, Finalized: true,
	}, nil
}
