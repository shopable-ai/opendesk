package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"opendesk/pkg/customui"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const customUIEventQueueCapacity = 256

type customUIRuntimeOptions struct {
	runtime          *goja.Runtime
	loop             *eventloop.EventLoop
	context          context.Context
	sessionID        string
	baseDir          string
	driver           customui.Driver
	activationSource customui.ActivationSource
	onAsyncError     func(error)
}

// customUIWindowDeclaration is deliberately separate from customui.WindowSpec.
// WindowSpec contains driver-only derived fields such as Controls and legacy
// storage such as Assets; exposing that struct directly would let a JavaScript
// declaration smuggle those fields through as explicit null values.
type customUIWindowDeclaration struct {
	ID          string                     `json:"id"`
	Kind        string                     `json:"kind,omitempty"`
	Title       string                     `json:"title,omitempty"`
	Bounds      customui.Bounds            `json:"bounds"`
	AlwaysOnTop bool                       `json:"alwaysOnTop,omitempty"`
	Draggable   bool                       `json:"draggable,omitempty"`
	Theme       string                     `json:"theme,omitempty"`
	Content     customUIContentDeclaration `json:"content"`
}

type customUIContentDeclaration struct {
	File     string `json:"file,omitempty"`
	HTML     string `json:"html,omitempty"`
	CSSFile  string `json:"cssFile,omitempty"`
	CSS      string `json:"css,omitempty"`
	BasePath string `json:"basePath,omitempty"`
}

func (declaration customUIWindowDeclaration) windowSpec() customui.WindowSpec {
	return customui.WindowSpec{
		ID: declaration.ID, Kind: declaration.Kind, Title: declaration.Title,
		Bounds: declaration.Bounds, AlwaysOnTop: declaration.AlwaysOnTop,
		Draggable: declaration.Draggable, Theme: declaration.Theme,
		Content: customui.ContentSpec{
			File: declaration.Content.File, HTML: declaration.Content.HTML,
			CSSFile: declaration.Content.CSSFile, CSS: declaration.Content.CSS,
			BasePath: declaration.Content.BasePath,
		},
	}
}

// CustomUIRuntime is the execution-scoped bridge between native UI Go values
// and the Goja owner goroutine. No driver callback retains or invokes a Goja
// value directly.
type CustomUIRuntime struct {
	runtime          *goja.Runtime // event-loop owner only
	loop             *eventloop.EventLoop
	context          context.Context
	driver           customui.Driver
	activationSource customui.ActivationSource
	session          *customui.Session
	queue            *customui.EventQueue
	onAsyncError     func(error)

	workers customUIWorkers
	pending map[uint64]pendingCustomUI // event-loop owner only
	nextID  uint64                     // event-loop owner only
	// Detached Dialog work is real native work, but an unobserved Dialog
	// Promise must not keep a completed JavaScript execution alive. These
	// counters remove only that unobserved work from the event-loop liveness
	// check; CancelAsync still cancels and closes it during normal teardown.
	detachedWorkers   atomic.Int64
	detachedCallbacks atomic.Int64

	listeners        map[uint64]customUIListener // event-loop owner only
	nextListenerID   uint64                      // event-loop owner only
	eventScheduled   atomic.Bool
	eventFailed      atomic.Bool
	closing          atomic.Bool
	closeOnce        sync.Once
	defaultToolbar   *floatingWindow
	floatingToolbars map[string]*floatingWindow // event-loop owner only
	nextToolbarID    uint64                     // event-loop owner only
}

type customUIWorkers struct {
	wg     sync.WaitGroup
	active atomic.Int64
}

type pendingCustomUI struct {
	cancel   context.CancelFunc
	resolve  func(any) error
	reject   func(any) error
	convert  func(any) goja.Value
	finally  func(error)
	liveness *customUIAsyncLiveness
}

// customUIAsyncLiveness lets a host-owned Promise opt out of retaining a
// completed script until the script explicitly observes it. It contains no
// Goja values and can therefore be touched by a worker only to release its
// accounting before scheduling the normal owner-loop completion.
type customUIAsyncLiveness struct {
	runtime      *CustomUIRuntime
	workerOnce   sync.Once
	callbackOnce sync.Once
}

func newCustomUIAsyncLiveness(runtime *CustomUIRuntime) *customUIAsyncLiveness {
	runtime.detachedWorkers.Add(1)
	runtime.detachedCallbacks.Add(1)
	return &customUIAsyncLiveness{runtime: runtime}
}

func (l *customUIAsyncLiveness) observe() {
	if l == nil {
		return
	}
	l.releaseWorker()
	l.releaseCallback()
}

func (l *customUIAsyncLiveness) releaseWorker() {
	if l != nil && l.runtime != nil {
		l.workerOnce.Do(func() { l.runtime.detachedWorkers.Add(-1) })
	}
}

func (l *customUIAsyncLiveness) releaseCallback() {
	if l != nil && l.runtime != nil {
		l.callbackOnce.Do(func() { l.runtime.detachedCallbacks.Add(-1) })
	}
}

type customUIListener struct {
	windowID string
	targetID string
	event    string
	callback goja.Callable
}

func newCustomUIRuntime(opts customUIRuntimeOptions) (*CustomUIRuntime, error) {
	if opts.runtime == nil || opts.loop == nil {
		return nil, fmt.Errorf("custom UI requires an event-loop-owned JavaScript Runtime")
	}
	if opts.context == nil {
		opts.context = context.Background()
	}
	if opts.sessionID == "" {
		return nil, fmt.Errorf("custom UI requires an execution session id")
	}
	if opts.driver == nil {
		return nil, fmt.Errorf("custom UI requires a platform driver")
	}
	bridge := &CustomUIRuntime{
		runtime: opts.runtime, loop: opts.loop, context: opts.context, driver: opts.driver,
		activationSource: normalizeCustomUIActivationSource(opts.activationSource, true),
		queue:            customui.NewEventQueue(customUIEventQueueCapacity), onAsyncError: opts.onAsyncError,
		pending: map[uint64]pendingCustomUI{}, listeners: map[uint64]customUIListener{},
		floatingToolbars: map[string]*floatingWindow{},
	}
	session, err := customui.NewSession(opts.sessionID, opts.baseDir, opts.driver, bridge.enqueueEvent)
	if err != nil {
		return nil, err
	}
	bridge.session = session
	return bridge, nil
}

func registerCustomUI(runtime *goja.Runtime, opts InitJSOptions) (*CustomUIRuntime, error) {
	if !opts.EnableCustomUI {
		registerDisabledCustomUI(runtime, opts.CustomUIActivationSource)
		return nil, nil
	}
	driver := opts.CustomUIDriver
	if driver == nil {
		driver = customui.NewProcessDriver(customui.ProcessDriverOptions{HostPath: opts.CustomUIHostPath})
	}
	bridge, err := newCustomUIRuntime(customUIRuntimeOptions{
		runtime: runtime, loop: opts.EventLoop, context: opts.Context,
		sessionID: opts.CustomUISessionID, baseDir: opts.CustomUIBaseDir,
		driver: driver, activationSource: opts.CustomUIActivationSource, onAsyncError: opts.OnAsyncError,
	})
	if err != nil {
		return nil, err
	}
	if err := runtime.Set("ui", bridge.jsUIObject()); err != nil {
		_ = driver.Close()
		return nil, err
	}
	bridge.defaultToolbar = newDefaultFloatingWindow(bridge)
	bridge.floatingToolbars[bridge.defaultToolbar.windowID] = bridge.defaultToolbar
	if err := runtime.Set("FloatingWindow", bridge.jsFloatingWindowConstructor()); err != nil {
		_ = driver.Close()
		return nil, err
	}
	return bridge, nil
}

func registerDisabledCustomUI(runtime *goja.Runtime, source customui.ActivationSource) {
	capabilities := customui.Capabilities{
		ProtocolVersion: customui.ProtocolVersion, Enabled: false, Available: false,
		ActivationSource: normalizeCustomUIActivationSource(source, false),
		Platform:         "disabled", Driver: "none", MaxSessions: 0,
		Window:   map[string]bool{"position": false, "size": false, "alwaysOnTop": false, "draggable": false, "nativeIdentity": false},
		Controls: []string{"button", "text", "img", "switch", "input", "select", "container"},
		Reason:   "custom UI was not explicitly enabled for this execution",
	}
	disabled := func(operation string) func(goja.FunctionCall) goja.Value {
		return func(goja.FunctionCall) goja.Value {
			panic(customUIJSError(runtime, &customui.Error{Code: customui.CodeDisabled, Operation: operation, Capability: "ui", Message: capabilities.Reason}))
		}
	}
	_ = runtime.Set("ui", map[string]any{
		"getCapabilities": func() any { return jsonCompatible(capabilities) },
		"createWindow":    disabled("createWindow"),
		"closeAll":        disabled("closeAll"),
		"on":              disabled("on"),
	})
}

func (u *CustomUIRuntime) jsUIObject() map[string]any {
	return map[string]any{
		"getCapabilities": func() any {
			capabilities := u.driver.Capabilities(u.context)
			capabilities.Enabled = true
			capabilities.ActivationSource = u.activationSource
			return jsonCompatible(capabilities)
		},
		"createWindow": func(call goja.FunctionCall) goja.Value {
			var declaration customUIWindowDeclaration
			if err := exportCustomUIValue(call.Argument(0), &declaration); err != nil {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "createWindow", Message: "window declaration is invalid", Cause: err}))
			}
			spec := declaration.windowSpec()
			return u.startAsync("createWindow", func(ctx context.Context) (any, error) {
				return u.session.Create(ctx, spec)
			}, func(value any) goja.Value {
				return u.runtime.ToValue(u.jsWindowObject(value.(*customui.Window)))
			})
		},
		"closeAll": func(goja.FunctionCall) goja.Value {
			return u.startAsync("closeAll", func(ctx context.Context) (any, error) {
				return nil, u.session.CloseWindows(ctx)
			}, nil)
		},
		"on": func(call goja.FunctionCall) goja.Value {
			return u.addListener("", "", call.Argument(0).String(), call.Argument(1))
		},
	}
}

func normalizeCustomUIActivationSource(source customui.ActivationSource, enabled bool) customui.ActivationSource {
	if !enabled {
		return customui.ActivationDisabled
	}
	switch source {
	case customui.ActivationCLI, customui.ActivationProjectConfig, customui.ActivationHTTPRequest:
		return source
	default:
		return customui.ActivationCLI
	}
}

func (u *CustomUIRuntime) jsWindowObject(window *customui.Window) map[string]any {
	asyncState := func(operation string, worker func(context.Context) (customui.WindowState, error)) func(goja.FunctionCall) goja.Value {
		return func(goja.FunctionCall) goja.Value {
			return u.startAsync(operation, func(ctx context.Context) (any, error) { return worker(ctx) }, nil)
		}
	}
	return map[string]any{
		"id": window.ID(),
		"controls": func() any {
			return jsonCompatible(window.Controls())
		},
		"show":     asyncState("show", window.Show),
		"hide":     asyncState("hide", window.Hide),
		"close":    asyncState("close", window.Close),
		"getState": asyncState("getState", window.State),
		"setBounds": func(call goja.FunctionCall) goja.Value {
			var bounds customui.Bounds
			if err := exportCustomUIValue(call.Argument(0), &bounds); err != nil {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "setBounds", WindowID: window.ID(), Message: "bounds are invalid", Cause: err}))
			}
			return u.startAsync("setBounds", func(ctx context.Context) (any, error) { return window.SetBounds(ctx, bounds) }, nil)
		},
		"setPosition": func(call goja.FunctionCall) goja.Value {
			x, y := call.Argument(0).ToFloat(), call.Argument(1).ToFloat()
			return u.startAsync("setPosition", func(ctx context.Context) (any, error) {
				if !finiteCustomUINumber(x) || !finiteCustomUINumber(y) {
					return nil, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "setPosition", WindowID: window.ID(), Message: "x and y must be finite numbers"}
				}
				state, err := window.State(ctx)
				if err != nil {
					return nil, customUIOperationError(err, "setPosition", window.ID())
				}
				state.Bounds.X, state.Bounds.Y = x, y
				result, err := window.SetBounds(ctx, state.Bounds)
				return result, customUIOperationError(err, "setPosition", window.ID())
			}, nil)
		},
		"setSize": func(call goja.FunctionCall) goja.Value {
			width, height := call.Argument(0).ToFloat(), call.Argument(1).ToFloat()
			return u.startAsync("setSize", func(ctx context.Context) (any, error) {
				if !finiteCustomUINumber(width) || !finiteCustomUINumber(height) || width <= 0 || height <= 0 {
					return nil, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "setSize", WindowID: window.ID(), Message: "width and height must be positive finite numbers"}
				}
				state, err := window.State(ctx)
				if err != nil {
					return nil, customUIOperationError(err, "setSize", window.ID())
				}
				state.Bounds.Width, state.Bounds.Height = width, height
				result, err := window.SetBounds(ctx, state.Bounds)
				return result, customUIOperationError(err, "setSize", window.ID())
			}, nil)
		},
		"setAlwaysOnTop": func(call goja.FunctionCall) goja.Value {
			enabled := call.Argument(0).ToBoolean()
			return u.startAsync("setAlwaysOnTop", func(ctx context.Context) (any, error) { return window.SetAlwaysOnTop(ctx, enabled) }, nil)
		},
		"setDraggable": func(call goja.FunctionCall) goja.Value {
			enabled := call.Argument(0).ToBoolean()
			return u.startAsync("setDraggable", func(ctx context.Context) (any, error) { return window.SetDraggable(ctx, enabled) }, nil)
		},
		"waitUntilClosed": func(goja.FunctionCall) goja.Value {
			return u.startAsync("waitUntilClosed", func(ctx context.Context) (any, error) {
				select {
				case <-window.WaitClosed():
					return window.State(context.Background())
				case <-ctx.Done():
					return nil, &customui.Error{Code: customui.CodeCanceled, Operation: "waitUntilClosed", WindowID: window.ID(), Message: "waiting for window close", Cause: ctx.Err()}
				}
			}, nil)
		},
		"control": func(call goja.FunctionCall) goja.Value {
			id := call.Argument(0).String()
			known := false
			for _, control := range window.Controls() {
				if control.ID == id {
					known = true
					break
				}
			}
			if !known {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeNotFound, Operation: "control", WindowID: window.ID(), TargetID: id, Message: "control not found"}))
			}
			return u.runtime.ToValue(u.jsControlObject(window, id))
		},
		"on": func(call goja.FunctionCall) goja.Value {
			return u.addListener(window.ID(), "", call.Argument(0).String(), call.Argument(1))
		},
	}
}

func (u *CustomUIRuntime) jsControlObject(window *customui.Window, id string) map[string]any {
	return map[string]any{
		"id": id,
		"getState": func(goja.FunctionCall) goja.Value {
			return u.startAsync("getControlState", func(ctx context.Context) (any, error) { return window.ControlState(ctx, id) }, nil)
		},
		"update": func(call goja.FunctionCall) goja.Value {
			var patch customui.ControlPatch
			if err := exportCustomUIValue(call.Argument(0), &patch); err != nil {
				panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "updateControl", WindowID: window.ID(), TargetID: id, Message: "control patch is invalid", Cause: err}))
			}
			return u.startAsync("updateControl", func(ctx context.Context) (any, error) { return window.UpdateControl(ctx, id, patch) }, nil)
		},
		"on": func(call goja.FunctionCall) goja.Value {
			return u.addListener(window.ID(), id, call.Argument(0).String(), call.Argument(1))
		},
	}
}

func (u *CustomUIRuntime) addListener(windowID, targetID, event string, value goja.Value) goja.Value {
	if !customui.IsPublicEventType(event) {
		panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "on", WindowID: windowID, TargetID: targetID, Message: "unsupported custom UI event type " + event}))
	}
	callback, ok := goja.AssertFunction(value)
	if !ok {
		panic(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeInvalidSpec, Operation: "on", WindowID: windowID, TargetID: targetID, Message: "event listener must be a function"}))
	}
	u.nextListenerID++
	id := u.nextListenerID
	u.listeners[id] = customUIListener{windowID: windowID, targetID: targetID, event: event, callback: callback}
	return u.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		delete(u.listeners, id)
		return goja.Undefined()
	})
}

func (u *CustomUIRuntime) startAsync(operation string, worker func(context.Context) (any, error), convert func(any) goja.Value) goja.Value {
	return u.startAsyncFinally(operation, worker, convert, nil)
}

func (u *CustomUIRuntime) startAsyncFinally(operation string, worker func(context.Context) (any, error), convert func(any) goja.Value, finally func(error)) goja.Value {
	return u.startAsyncFinallyWithLiveness(operation, worker, convert, finally, nil)
}

// startAsyncUntilObserved returns a real native Promise. Calling then, catch,
// or finally marks it as observed; until then it is eligible for normal script
// teardown instead of making a forgotten native Dialog keep the EventLoop
// alive forever. Awaiting it still holds the outer async script Promise open.
func (u *CustomUIRuntime) startAsyncUntilObserved(operation string, worker func(context.Context) (any, error), convert func(any) goja.Value, finally func(error)) goja.Value {
	liveness := newCustomUIAsyncLiveness(u)
	promise := u.startAsyncFinallyWithLiveness(operation, worker, convert, finally, liveness)
	return u.observePromise(promise, liveness)
}

func (u *CustomUIRuntime) startAsyncFinallyWithLiveness(operation string, worker func(context.Context) (any, error), convert func(any) goja.Value, finally func(error), liveness *customUIAsyncLiveness) goja.Value {
	promise, resolve, reject := u.runtime.NewPromise()
	if u.closing.Load() {
		liveness.observe()
		_ = reject(customUIJSError(u.runtime, &customui.Error{Code: customui.CodeCanceled, Operation: operation, Message: "custom UI runtime is closing"}))
		return u.runtime.ToValue(promise)
	}
	u.nextID++
	id := u.nextID
	ctx, cancel := context.WithCancel(u.context)
	u.pending[id] = pendingCustomUI{cancel: cancel, resolve: resolve, reject: reject, convert: convert, finally: finally, liveness: liveness}
	u.workers.active.Add(1)
	u.workers.wg.Add(1)
	go func() {
		defer u.workers.active.Add(-1)
		defer u.workers.wg.Done()
		result, err := worker(ctx)
		err = customUIOperationError(err, operation, "")
		liveness.releaseWorker()
		u.loop.RunOnLoop(func(runtime *goja.Runtime) { u.finishAsync(runtime, id, result, err) })
	}()
	return u.runtime.ToValue(promise)
}

func (u *CustomUIRuntime) observePromise(value goja.Value, liveness *customUIAsyncLiveness) goja.Value {
	object := value.ToObject(u.runtime)
	if object == nil {
		return value
	}
	for _, name := range []string{"then", "catch", "finally"} {
		original, ok := goja.AssertFunction(object.Get(name))
		if !ok {
			continue
		}
		method := original
		if err := object.Set(name, func(call goja.FunctionCall) goja.Value {
			liveness.observe()
			result, err := method(call.This, call.Arguments...)
			if err != nil {
				panic(err)
			}
			return result
		}); err != nil {
			// Promise ownership and settlement are still correct if an engine ever
			// disallows an own method override; awaiting the outer script continues
			// to retain the execution through its normal async wrapper.
			return value
		}
	}
	return value
}

func (u *CustomUIRuntime) finishAsync(runtime *goja.Runtime, id uint64, result any, operationErr error) {
	pending, exists := u.pending[id]
	if !exists {
		return
	}
	delete(u.pending, id)
	pending.cancel()
	pending.liveness.releaseCallback()
	if pending.finally != nil {
		pending.finally(operationErr)
	}
	if operationErr != nil {
		jsErr := customUIJSError(runtime, operationErr)
		var dialogErr *DialogError
		if errors.As(operationErr, &dialogErr) {
			jsErr = dialogJSError(runtime, dialogErr)
		}
		if err := pending.reject(jsErr); err != nil {
			u.reportAsyncError(err)
		}
		return
	}
	value := result
	if pending.convert != nil {
		value = pending.convert(result)
	} else {
		value = jsonCompatible(result)
	}
	if err := pending.resolve(value); err != nil {
		u.reportAsyncError(err)
	}
}

func (u *CustomUIRuntime) enqueueEvent(event customui.Event) {
	if u.closing.Load() {
		return
	}
	if err := u.queue.Push(event); err != nil {
		if u.eventFailed.CompareAndSwap(false, true) {
			u.loop.RunOnLoop(func(*goja.Runtime) { u.reportAsyncError(err) })
		}
		return
	}
	if u.eventScheduled.CompareAndSwap(false, true) {
		u.loop.RunOnLoop(func(runtime *goja.Runtime) { u.drainEvents(runtime) })
	}
}

func (u *CustomUIRuntime) drainEvents(runtime *goja.Runtime) {
	for _, event := range u.queue.Drain() {
		argument := runtime.ToValue(jsonCompatible(event))
		listenerIDs := make([]int, 0, len(u.listeners))
		for id := range u.listeners {
			listenerIDs = append(listenerIDs, int(id))
		}
		sort.Ints(listenerIDs)
		for _, rawID := range listenerIDs {
			listener, exists := u.listeners[uint64(rawID)]
			if !exists {
				continue
			}
			if listener.event != "*" && listener.event != event.Type {
				continue
			}
			if listener.windowID != "" && listener.windowID != event.WindowID {
				continue
			}
			if listener.targetID != "" && listener.targetID != event.TargetID {
				continue
			}
			if _, err := listener.callback(goja.Undefined(), argument); err != nil {
				u.reportAsyncError(err)
			}
		}
		if toolbar := u.floatingToolbars[event.WindowID]; toolbar != nil {
			toolbar.dispatch(event, argument)
		}
	}
	u.eventScheduled.Store(false)
	if u.queue.Len() > 0 && u.eventScheduled.CompareAndSwap(false, true) {
		u.loop.RunOnLoop(func(runtime *goja.Runtime) { u.drainEvents(runtime) })
	}
}

func (u *CustomUIRuntime) reportAsyncError(err error) {
	if err != nil && u.onAsyncError != nil {
		u.onAsyncError(err)
	}
}

// CancelAsync runs on the Goja owner during execution teardown.
func (u *CustomUIRuntime) CancelAsync() {
	if u == nil {
		return
	}
	u.closeOnce.Do(func() {
		u.closing.Store(true)
		for id, pending := range u.pending {
			delete(u.pending, id)
			pending.cancel()
			pending.liveness.releaseCallback()
		}
		u.listeners = map[uint64]customUIListener{}
		for _, toolbar := range u.floatingToolbars {
			toolbar.release()
		}
		u.floatingToolbars = map[string]*floatingWindow{}
		u.queue.Close()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		// Teardown is terminal and its caller has already received the operation
		// result (for example Dialog maps a host crash to DIALOG_HOST_FAILURE).
		// Do not turn a best-effort close against that same dead host into a
		// second asynchronous execution error after user JavaScript has handled
		// the rejection. Session.Close still force-closes local records below.
		_ = u.session.Close(ctx)
		if err := u.driver.Close(); err != nil {
			u.reportAsyncError(err)
		}
	})
}

func (u *CustomUIRuntime) Wait() {
	if u != nil {
		u.workers.wg.Wait()
	}
}

func (u *CustomUIRuntime) AsyncCounts() (workers int64, callbacks int) {
	if u == nil {
		return 0, 0
	}
	workers = u.workers.active.Load() - u.detachedWorkers.Load()
	if workers < 0 {
		workers = 0
	}
	callbacks = len(u.pending) + u.queue.Len() - int(u.detachedCallbacks.Load())
	if callbacks < 0 {
		callbacks = 0
	}
	return workers, callbacks
}

type CustomUIResourceCounts struct {
	Workers       int64
	Pending       int
	Queued        int
	Windows       int
	Listeners     int
	DriverSinks   int
	HostProcesses int
}

func (u *CustomUIRuntime) ResourceCounts() CustomUIResourceCounts {
	if u == nil {
		return CustomUIResourceCounts{}
	}
	counts := CustomUIResourceCounts{
		Workers: u.workers.active.Load(), Pending: len(u.pending), Queued: u.queue.Len(),
		Windows: u.session.WindowCount(), Listeners: len(u.listeners),
	}
	for _, toolbar := range u.floatingToolbars {
		counts.Listeners += toolbar.listenerCount()
	}
	if reporter, ok := u.driver.(customui.DriverResourceReporter); ok {
		driverCounts := reporter.ResourceCounts()
		counts.DriverSinks = driverCounts.Sinks
		counts.HostProcesses = driverCounts.HostProcesses
	}
	return counts
}

func customUIJSError(runtime *goja.Runtime, err error) *goja.Object {
	object := runtime.NewGoError(err)
	var uiErr *customui.Error
	if errors.As(err, &uiErr) {
		_ = object.Set("code", uiErr.Code)
		_ = object.Set("operation", uiErr.Operation)
		_ = object.Set("windowId", uiErr.WindowID)
		_ = object.Set("targetId", uiErr.TargetID)
		_ = object.Set("capability", uiErr.Capability)
	}
	return object
}

func finiteCustomUINumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func customUIOperationError(err error, operation, windowID string) error {
	if err == nil {
		return nil
	}
	var uiErr *customui.Error
	if !errors.As(err, &uiErr) {
		return err
	}
	copy := *uiErr
	copy.Operation = operation
	if copy.WindowID == "" {
		copy.WindowID = windowID
	}
	return &copy
}

func jsonCompatible(value any) any {
	if value == nil {
		return nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var converted any
	if err := json.Unmarshal(data, &converted); err != nil {
		return value
	}
	return converted
}

func exportCustomUIValue(value goja.Value, destination any) error {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return fmt.Errorf("value is required")
	}
	data, err := json.Marshal(value.Export())
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("unexpected trailing JSON value")
		}
		return err
	}
	return nil
}

func (u *CustomUIRuntime) startBackground(worker func(context.Context) error, done func(error)) {
	if u.closing.Load() {
		if done != nil {
			done(&customui.Error{Code: customui.CodeCanceled, Operation: "FloatingWindow.updateButton", Capability: "ui", Message: "custom UI runtime is closing"})
		}
		return
	}
	ctx, cancel := context.WithCancel(u.context)
	u.workers.active.Add(1)
	u.workers.wg.Add(1)
	go func() {
		defer cancel()
		defer u.workers.active.Add(-1)
		defer u.workers.wg.Done()
		err := worker(ctx)
		u.loop.RunOnLoop(func(*goja.Runtime) {
			if done != nil {
				done(err)
			}
		})
	}()
}
