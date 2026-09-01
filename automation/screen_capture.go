package automation

import (
	"context"
	"errors"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

const (
	captureDefaultFPS      = 30
	captureMinRegionSize   = 24
	captureStopTimeout     = 10 * time.Second
	captureMaxOutputLength = 4096
)

type ScreenCaptureErrorCode string

const (
	ScreenCaptureInvalidArgument  ScreenCaptureErrorCode = "INVALID_ARGUMENT"
	ScreenCaptureNotSupported     ScreenCaptureErrorCode = "NOT_SUPPORTED"
	ScreenCapturePermissionDenied ScreenCaptureErrorCode = "PERMISSION_DENIED"
	ScreenCaptureCanceled         ScreenCaptureErrorCode = "CANCELED"
	ScreenCaptureBackendFailed    ScreenCaptureErrorCode = "BACKEND_FAILED"
	ScreenCaptureOutputFailed     ScreenCaptureErrorCode = "OUTPUT_FAILED"
	ScreenCaptureTargetMissing    ScreenCaptureErrorCode = "TARGET_UNAVAILABLE"
	ScreenCaptureTimeout          ScreenCaptureErrorCode = "TIMEOUT"
)

// ScreenCaptureError intentionally excludes captured pixels and helper output.
type ScreenCaptureError struct {
	Code      ScreenCaptureErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *ScreenCaptureError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "screen capture operation failed"
	}
	return string(e.Code) + ": " + message
}

func (e *ScreenCaptureError) Unwrap() error { return e.Cause }

type RegionSelectorOptions struct {
	DimOutside bool
	Movable    bool
	Resizable  bool
	MinWidth   int
	MinHeight  int
}

type SelectedRegion struct {
	X            int     `json:"x"`
	Y            int     `json:"y"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	DisplayID    string  `json:"displayId"`
	DisplayIndex int     `json:"displayIndex"`
	ScaleFactor  float64 `json:"scaleFactor"`
	PixelWidth   int     `json:"pixelWidth"`
	PixelHeight  int     `json:"pixelHeight"`
}

type ScreenRecordingTarget struct {
	Type         string `json:"type"`
	DisplayIndex int    `json:"displayIndex"`
	DisplayID    string `json:"displayId"`
	X            int    `json:"x"`
	Y            int    `json:"y"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	PixelWidth   int    `json:"pixelWidth"`
	PixelHeight  int    `json:"pixelHeight"`
}

type ScreenRecordingOptions struct {
	Target     ScreenRecordingTarget `json:"target"`
	FPS        int                   `json:"fps"`
	Output     string                `json:"output"`
	ShowCursor bool                  `json:"showCursor"`
}

type ScreenRecordingResult struct {
	ID          string                `json:"id"`
	Output      string                `json:"output"`
	Container   string                `json:"container"`
	Codec       string                `json:"codec"`
	FPS         int                   `json:"fps"`
	DurationMS  int64                 `json:"durationMs"`
	SizeBytes   int64                 `json:"sizeBytes"`
	PixelWidth  int                   `json:"pixelWidth"`
	PixelHeight int                   `json:"pixelHeight"`
	Target      ScreenRecordingTarget `json:"target"`
	Finalized   bool                  `json:"finalized"`
}

type ScreenRecordingBackendSession interface {
	ID() string
	Options() ScreenRecordingOptions
	StartedAt() time.Time
	Stop(context.Context) (ScreenRecordingResult, error)
}

type ScreenCaptureBackend interface {
	Name() string
	Capabilities() map[string]interface{}
	SelectRegion(context.Context, RegionSelectorOptions) (SelectedRegion, error)
	StartRecording(context.Context, ScreenRecordingOptions) (ScreenRecordingBackendSession, error)
}

type ScreenCaptureBackendFactory func() ScreenCaptureBackend

type pendingScreenCapture struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
	convert func(interface{}) goja.Value
}

// ScreenCaptureRuntime owns capture sessions for one JavaScript execution.
// Workers exchange Go values only; all Goja access remains on the EventLoop.
type ScreenCaptureRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context      context.Context
	cancel       context.CancelFunc
	backend      ScreenCaptureBackend
	displays     func() []DisplayInfo
	onAsyncError func(error)

	closing  atomic.Bool
	workers  atomic.Int64
	wg       sync.WaitGroup
	mu       sync.Mutex
	nextID   uint64
	pending  map[uint64]pendingScreenCapture
	sessions map[string]ScreenRecordingBackendSession
}

func registerScreenCapture(runtimeValue *goja.Runtime, screenMethods map[string]interface{}, opts InitJSOptions) *ScreenCaptureRuntime {
	var backend ScreenCaptureBackend
	if opts.ScreenCaptureBackendFactory != nil {
		backend = opts.ScreenCaptureBackendFactory()
	} else {
		backend = newDefaultScreenCaptureBackend()
	}
	if backend == nil {
		backend = newUnsupportedScreenCaptureBackend("screen capture backend factory returned nil")
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	manager := &ScreenCaptureRuntime{
		runtime: runtimeValue, context: ctx, cancel: cancel, backend: backend,
		onAsyncError: opts.OnAsyncError, pending: map[uint64]pendingScreenCapture{},
		sessions: map[string]ScreenRecordingBackendSession{}, displays: opts.ScreenCaptureDisplayResolver,
	}
	if manager.displays == nil {
		manager.displays = resolveDisplays
	}
	if opts.EventLoop != nil {
		manager.loop = opts.EventLoop
	}
	screenMethods["selectRegion"] = func(call goja.FunctionCall) goja.Value {
		options, err := parseRegionSelectorOptions(call.Argument(0))
		if err != nil {
			return manager.rejected(err)
		}
		return manager.startAsync("Screen.selectRegion", func(ctx context.Context) (interface{}, error) {
			return manager.backend.SelectRegion(ctx, options)
		}, func(value interface{}) goja.Value {
			return manager.runtime.ToValue(captureRegionProjection(value.(SelectedRegion)))
		})
	}
	screenMethods["startRecording"] = func(call goja.FunctionCall) goja.Value {
		options, err := parseScreenRecordingOptions(call.Argument(0), manager.displays)
		if err != nil {
			return manager.rejected(err)
		}
		return manager.startAsync("Screen.startRecording", func(ctx context.Context) (interface{}, error) {
			session, err := manager.backend.StartRecording(ctx, options)
			if err == nil && session == nil {
				err = captureOperationError("", ScreenCaptureBackendFailed, "recording backend returned no session", nil)
			}
			return session, err
		}, func(value interface{}) goja.Value {
			session := value.(ScreenRecordingBackendSession)
			manager.mu.Lock()
			manager.sessions[session.ID()] = session
			manager.mu.Unlock()
			return manager.recordingObject(session)
		})
	}
	screenMethods["getCaptureCapabilities"] = func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(manager.capabilities())
	}
	return manager
}

func (s *ScreenCaptureRuntime) capabilities() map[string]interface{} {
	result := s.backend.Capabilities()
	if result == nil {
		result = map[string]interface{}{}
	}
	result["schemaVersion"] = 1
	result["platform"] = runtime.GOOS
	result["backend"] = s.backend.Name()
	result["audio"] = map[string]interface{}{
		"system": false, "microphone": false, "namespace": "Audio",
		"reason": "TASK-004 does not expose a capture session to compose",
	}
	if _, ok := result["frameStream"]; !ok {
		result["frameStream"] = map[string]interface{}{
			"supported": false, "status": "notImplemented",
			"reason": "bounded frame delivery is deferred until the recording backend is stable",
		}
	}
	return result
}

func (s *ScreenCaptureRuntime) recordingObject(session ScreenRecordingBackendSession) goja.Value {
	options := session.Options()
	object := s.runtime.NewObject()
	_ = object.Set("id", session.ID())
	_ = object.Set("state", "recording")
	_ = object.Set("output", options.Output)
	_ = object.Set("fps", options.FPS)
	_ = object.Set("target", captureTargetProjection(options.Target))
	_ = object.Set("startedAt", session.StartedAt().UTC().Format(time.RFC3339Nano))
	_ = object.Set("stop", func(goja.FunctionCall) goja.Value {
		return s.startAsync("Screen.Recording.stop", func(context.Context) (interface{}, error) {
			ctx, cancel := context.WithTimeout(context.Background(), captureStopTimeout)
			defer cancel()
			return session.Stop(ctx)
		}, func(value interface{}) goja.Value {
			s.mu.Lock()
			delete(s.sessions, session.ID())
			s.mu.Unlock()
			_ = object.Set("state", "stopped")
			return s.runtime.ToValue(captureRecordingResultProjection(value.(ScreenRecordingResult)))
		})
	})
	return object
}

func captureRegionProjection(region SelectedRegion) map[string]interface{} {
	return map[string]interface{}{
		"x": region.X, "y": region.Y, "width": region.Width, "height": region.Height,
		"displayId": region.DisplayID, "displayIndex": region.DisplayIndex, "scaleFactor": region.ScaleFactor,
		"pixelWidth": region.PixelWidth, "pixelHeight": region.PixelHeight,
	}
}

func captureTargetProjection(target ScreenRecordingTarget) map[string]interface{} {
	return map[string]interface{}{
		"type": target.Type, "displayId": target.DisplayID, "displayIndex": target.DisplayIndex,
		"x": target.X, "y": target.Y, "width": target.Width, "height": target.Height,
		"pixelWidth": target.PixelWidth, "pixelHeight": target.PixelHeight,
	}
}

func captureRecordingResultProjection(result ScreenRecordingResult) map[string]interface{} {
	return map[string]interface{}{
		"id": result.ID, "output": result.Output, "container": result.Container, "codec": result.Codec,
		"fps": result.FPS, "durationMs": result.DurationMS, "sizeBytes": result.SizeBytes,
		"pixelWidth": result.PixelWidth, "pixelHeight": result.PixelHeight,
		"target": captureTargetProjection(result.Target), "finalized": result.Finalized,
	}
}

func (s *ScreenCaptureRuntime) startAsync(operation string, worker func(context.Context) (interface{}, error), convert func(interface{}) goja.Value) goja.Value {
	if s.loop == nil {
		return s.rejected(captureOperationError(operation, ScreenCaptureNotSupported, "capture methods require the execution EventLoop", nil))
	}
	if s.closing.Load() {
		return s.rejected(captureOperationError(operation, ScreenCaptureCanceled, "capture runtime is closing", nil))
	}
	promise, resolve, reject := s.runtime.NewPromise()
	s.mu.Lock()
	s.nextID++
	id := s.nextID
	s.pending[id] = pendingScreenCapture{resolve: resolve, reject: reject, convert: convert}
	s.mu.Unlock()
	s.workers.Add(1)
	s.wg.Add(1)
	go func() {
		defer s.workers.Add(-1)
		defer s.wg.Done()
		value, err := worker(s.context)
		err = wrapScreenCaptureError(operation, err)
		if s.closing.Load() {
			if session, ok := value.(ScreenRecordingBackendSession); ok {
				ctx, cancel := context.WithTimeout(context.Background(), captureStopTimeout)
				_, _ = session.Stop(ctx)
				cancel()
			}
			return
		}
		if !s.loop.RunOnLoop(func(*goja.Runtime) { s.finishAsync(id, value, err) }) && err != nil {
			s.reportAsync(err)
		}
	}()
	return s.runtime.ToValue(promise)
}

func (s *ScreenCaptureRuntime) finishAsync(id uint64, value interface{}, err error) {
	s.mu.Lock()
	pending, ok := s.pending[id]
	if ok {
		delete(s.pending, id)
	}
	s.mu.Unlock()
	if !ok {
		return
	}
	if err != nil {
		_ = pending.reject(screenCaptureJSError(s.runtime, err))
		return
	}
	if pending.convert != nil {
		_ = pending.resolve(pending.convert(value))
		return
	}
	_ = pending.resolve(value)
}

func (s *ScreenCaptureRuntime) rejected(err error) goja.Value {
	promise, _, reject := s.runtime.NewPromise()
	_ = reject(screenCaptureJSError(s.runtime, err))
	return s.runtime.ToValue(promise)
}

func (s *ScreenCaptureRuntime) Close() {
	if s == nil || !s.closing.CompareAndSwap(false, true) {
		return
	}
	s.cancel()
	s.mu.Lock()
	pending := s.pending
	s.pending = map[uint64]pendingScreenCapture{}
	sessions := make([]ScreenRecordingBackendSession, 0, len(s.sessions))
	for _, session := range s.sessions {
		sessions = append(sessions, session)
	}
	s.sessions = map[string]ScreenRecordingBackendSession{}
	s.mu.Unlock()
	for _, item := range pending {
		_ = item.reject(screenCaptureJSError(s.runtime, captureOperationError("Screen.cleanup", ScreenCaptureCanceled, "capture operation canceled during execution teardown", nil)))
	}
	for _, session := range sessions {
		s.workers.Add(1)
		s.wg.Add(1)
		go func(session ScreenRecordingBackendSession) {
			defer s.workers.Add(-1)
			defer s.wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), captureStopTimeout)
			defer cancel()
			if _, err := session.Stop(ctx); err != nil {
				s.reportAsync(wrapScreenCaptureError("Screen.cleanup", err))
			}
		}(session)
	}
}

func (s *ScreenCaptureRuntime) Wait() {
	if s != nil {
		s.wg.Wait()
	}
}

func (s *ScreenCaptureRuntime) ResourceCounts() (workers int64, pending int, sessions int) {
	if s == nil {
		return 0, 0, 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.workers.Load(), len(s.pending), len(s.sessions)
}

func (s *ScreenCaptureRuntime) reportAsync(err error) {
	if err != nil && s.onAsyncError != nil {
		s.onAsyncError(err)
	}
}

func parseRegionSelectorOptions(value goja.Value) (RegionSelectorOptions, error) {
	result := RegionSelectorOptions{DimOutside: true, Movable: true, Resizable: true, MinWidth: captureMinRegionSize, MinHeight: captureMinRegionSize}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	object, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, captureOperationError("Screen.selectRegion", ScreenCaptureInvalidArgument, "options must be an object", nil)
	}
	allowed := map[string]bool{"dimOutside": true, "movable": true, "resizable": true, "minWidth": true, "minHeight": true}
	for key := range object {
		if !allowed[key] {
			return result, captureOperationError("Screen.selectRegion", ScreenCaptureInvalidArgument, "options contains an unknown field", nil)
		}
	}
	for key, target := range map[string]*bool{"dimOutside": &result.DimOutside, "movable": &result.Movable, "resizable": &result.Resizable} {
		if raw, exists := object[key]; exists {
			value, valid := raw.(bool)
			if !valid {
				return result, captureOperationError("Screen.selectRegion", ScreenCaptureInvalidArgument, key+" must be a boolean", nil)
			}
			*target = value
		}
	}
	for key, target := range map[string]*int{"minWidth": &result.MinWidth, "minHeight": &result.MinHeight} {
		if raw, exists := object[key]; exists {
			value, valid := captureFiniteInteger(raw)
			if !valid || value < captureMinRegionSize || value > 4096 {
				return result, captureOperationError("Screen.selectRegion", ScreenCaptureInvalidArgument, key+" must be an integer between 24 and 4096", nil)
			}
			*target = value
		}
	}
	return result, nil
}

func parseScreenRecordingOptions(value goja.Value, displayResolver func() []DisplayInfo) (ScreenRecordingOptions, error) {
	operation := "Screen.startRecording"
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return ScreenRecordingOptions{}, captureOperationError(operation, ScreenCaptureInvalidArgument, "options must be an object", nil)
	}
	object, ok := value.Export().(map[string]interface{})
	if !ok {
		return ScreenRecordingOptions{}, captureOperationError(operation, ScreenCaptureInvalidArgument, "options must be an object", nil)
	}
	allowed := map[string]bool{"target": true, "fps": true, "output": true, "showCursor": true}
	for key := range object {
		if !allowed[key] {
			return ScreenRecordingOptions{}, captureOperationError(operation, ScreenCaptureInvalidArgument, "options contains an unknown field", nil)
		}
	}
	result := ScreenRecordingOptions{FPS: captureDefaultFPS}
	output, ok := object["output"].(string)
	if !ok || output == "" || len(output) > captureMaxOutputLength || !filepath.IsAbs(output) || filepath.Clean(output) != output {
		return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "output must be a clean absolute .mov path", nil)
	}
	if strings.ToLower(filepath.Ext(output)) != ".mov" {
		return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "output must use the .mov extension", nil)
	}
	result.Output = output
	if raw, exists := object["fps"]; exists {
		fps, valid := captureFiniteInteger(raw)
		if !valid || fps != captureDefaultFPS {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "the current backend supports fps=30", nil)
		}
		result.FPS = fps
	}
	if raw, exists := object["showCursor"]; exists {
		show, valid := raw.(bool)
		if !valid {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "showCursor must be a boolean", nil)
		}
		result.ShowCursor = show
	}
	target, ok := object["target"].(map[string]interface{})
	if !ok {
		return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "target must be an object", nil)
	}
	targetAllowed := map[string]bool{"type": true, "displayIndex": true, "displayId": true, "x": true, "y": true, "width": true, "height": true}
	for key := range target {
		if !targetAllowed[key] {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "target contains an unknown field", nil)
		}
	}
	targetType, _ := target["type"].(string)
	if targetType != "display" && targetType != "region" {
		return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "target.type must be display or region", nil)
	}
	displayIndex := 1
	if raw, exists := target["displayIndex"]; exists {
		parsed, valid := captureFiniteInteger(raw)
		if !valid || parsed < 1 {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "target.displayIndex must be a positive integer", nil)
		}
		displayIndex = parsed
	}
	display, ok := captureDisplayByIndexFrom(displayIndex, displayResolver())
	if !ok {
		return result, captureOperationError(operation, ScreenCaptureTargetMissing, "target display is unavailable", nil)
	}
	result.Target = ScreenRecordingTarget{
		Type: targetType, DisplayIndex: display.Index, DisplayID: display.ID,
		X: display.X, Y: display.Y, Width: display.Width, Height: display.Height,
		PixelWidth: display.PixelWidth, PixelHeight: display.PixelHeight,
	}
	if raw, exists := target["displayId"]; exists {
		supplied, valid := raw.(string)
		if !valid || supplied == "" {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "target.displayId must be a non-empty string when provided", nil)
		}
		if supplied != display.ID {
			return result, captureOperationError(operation, ScreenCaptureTargetMissing, "target display identity no longer matches displayIndex", nil)
		}
	}
	if targetType == "region" {
		for _, key := range []string{"x", "y", "width", "height"} {
			if _, exists := target[key]; !exists {
				return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "region target requires x, y, width, and height", nil)
			}
		}
		x, xOK := captureFiniteInteger(target["x"])
		y, yOK := captureFiniteInteger(target["y"])
		width, widthOK := captureFiniteInteger(target["width"])
		height, heightOK := captureFiniteInteger(target["height"])
		if !xOK || !yOK || !widthOK || !heightOK || width < captureMinRegionSize || height < captureMinRegionSize {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "region bounds must be finite integers with width and height at least 24", nil)
		}
		if x < display.X || y < display.Y || x+width > display.X+display.Width || y+height > display.Y+display.Height {
			return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "region must fit entirely within target display logical bounds", nil)
		}
		result.Target.X, result.Target.Y = x, y
		result.Target.Width, result.Target.Height = width, height
		result.Target.PixelWidth = int(math.Round(float64(width) * display.Scale))
		result.Target.PixelHeight = int(math.Round(float64(height) * display.Scale))
	} else {
		for _, key := range []string{"x", "y", "width", "height"} {
			if _, exists := target[key]; exists {
				return result, captureOperationError(operation, ScreenCaptureInvalidArgument, "display target must not include region bounds", nil)
			}
		}
	}
	if _, err := os.Stat(result.Output); err == nil {
		return result, captureOperationError(operation, ScreenCaptureOutputFailed, "output already exists", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		return result, captureOperationError(operation, ScreenCaptureOutputFailed, "output path cannot be inspected", err)
	}
	parent := filepath.Dir(result.Output)
	info, err := os.Stat(parent)
	if err != nil || !info.IsDir() {
		return result, captureOperationError(operation, ScreenCaptureOutputFailed, "output parent directory must already exist", err)
	}
	return result, nil
}

func captureDisplayByIndex(index int) (DisplayInfo, bool) {
	return captureDisplayByIndexFrom(index, resolveDisplays())
}

func captureDisplayByIndexFrom(index int, displays []DisplayInfo) (DisplayInfo, bool) {
	for _, display := range displays {
		if display.Index == index {
			return display, true
		}
	}
	return DisplayInfo{}, false
}

func captureFiniteInteger(value interface{}) (int, bool) {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || number != math.Trunc(number) || number > math.MaxInt || number < math.MinInt {
		return 0, false
	}
	return int(number), true
}

func captureOperationError(operation string, code ScreenCaptureErrorCode, message string, cause error) error {
	return &ScreenCaptureError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapScreenCaptureError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var captureErr *ScreenCaptureError
	if errors.As(err, &captureErr) {
		copy := *captureErr
		copy.Operation = operation
		return &copy
	}
	return captureOperationError(operation, ScreenCaptureBackendFailed, "screen capture backend failed", err)
}

func screenCaptureJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var captureErr *ScreenCaptureError
	if errors.As(err, &captureErr) {
		_ = object.Set("code", string(captureErr.Code))
		_ = object.Set("operation", captureErr.Operation)
	}
	return object
}

type unsupportedScreenCaptureBackend struct{ reason string }

func newUnsupportedScreenCaptureBackend(reason string) ScreenCaptureBackend {
	return &unsupportedScreenCaptureBackend{reason: reason}
}

func (b *unsupportedScreenCaptureBackend) Name() string { return "unavailable" }
func (b *unsupportedScreenCaptureBackend) Capabilities() map[string]interface{} {
	return map[string]interface{}{
		"selector":  map[string]interface{}{"supported": false},
		"recording": map[string]interface{}{"supported": false, "targets": map[string]bool{"display": false, "region": false, "window": false}},
	}
}
func (b *unsupportedScreenCaptureBackend) SelectRegion(context.Context, RegionSelectorOptions) (SelectedRegion, error) {
	return SelectedRegion{}, captureOperationError("", ScreenCaptureNotSupported, b.reason, nil)
}
func (b *unsupportedScreenCaptureBackend) StartRecording(context.Context, ScreenRecordingOptions) (ScreenRecordingBackendSession, error) {
	return nil, captureOperationError("", ScreenCaptureNotSupported, b.reason, nil)
}
