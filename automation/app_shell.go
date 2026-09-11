package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
	"opendesk/pkg/appshell"
)

const appShellRuntimeQueueCapacity = 256

type appShellPending struct {
	cancel  context.CancelFunc
	resolve func(any) error
	reject  func(any) error
	counted *atomic.Bool
}

// AppShellRuntime is the execution-scoped bridge for automation.app. Native
// callbacks retain no Goja state: they push plain ActionEvent values into this
// bounded queue and schedule exactly one drain on the current EventLoop.
type AppShellRuntime struct {
	runtime      *goja.Runtime
	loop         *eventloop.EventLoop
	context      context.Context
	shell        *appshell.Shell
	ui           *CustomUIRuntime
	eventSink    EventSink
	onAsyncError func(error)

	queueMu         sync.Mutex
	queue           []appshell.ActionEvent
	eventScheduled  atomic.Bool
	closing         atomic.Bool
	workers         customUIWorkers
	asyncPending    atomic.Int64
	pending         map[uint64]appShellPending // EventLoop owner only
	nextPendingID   uint64
	listeners       map[uint64]goja.Callable // EventLoop owner only
	nextListenerID  uint64
	openPending     bool // EventLoop owner only
	mainReady       bool // EventLoop owner only
	beginCloseOnce  sync.Once
	finishCloseOnce sync.Once
}

func registerAppShell(runtime *goja.Runtime, opts InitJSOptions, ui *CustomUIRuntime) (*AppShellRuntime, error) {
	if opts.AppShell == nil {
		if err := attachAutomationApp(runtime, disabledAutomationApp(runtime)); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if opts.EventLoop == nil {
		return nil, fmt.Errorf("App Mode requires an event-loop-owned JavaScript Runtime")
	}
	bridge := &AppShellRuntime{
		runtime: runtime, loop: opts.EventLoop, context: opts.Context, shell: opts.AppShell,
		ui: ui, eventSink: opts.EventSink, onAsyncError: opts.OnAsyncError, pending: map[uint64]appShellPending{}, listeners: map[uint64]goja.Callable{},
	}
	if err := opts.AppShell.BindActionSink(bridge.enqueue); err != nil {
		return nil, fmt.Errorf("bind App Shell action dispatcher: %w", err)
	}
	if ui != nil {
		ui.appShell = bridge
	}
	if err := attachAutomationApp(runtime, bridge.jsObject()); err != nil {
		opts.AppShell.UnbindActionSink()
		return nil, err
	}
	return bridge, nil
}

func attachAutomationApp(runtime *goja.Runtime, app any) error {
	var automationObject *goja.Object
	value := runtime.Get("automation")
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		automationObject = runtime.NewObject()
		if err := runtime.Set("automation", automationObject); err != nil {
			return fmt.Errorf("register automation namespace: %w", err)
		}
	} else {
		automationObject = value.ToObject(runtime)
	}
	if err := automationObject.Set("app", app); err != nil {
		return fmt.Errorf("register automation.app: %w", err)
	}
	return nil
}

func disabledAutomationApp(runtime *goja.Runtime) map[string]any {
	disabled := func(operation string) func(goja.FunctionCall) goja.Value {
		return func(goja.FunctionCall) goja.Value {
			panic(appShellJSError(runtime, "APP_MODE_DISABLED", operation, "automation.app is available only for -app executions"))
		}
	}
	return map[string]any{
		"getCapabilities": func() any {
			return map[string]any{"enabled": false, "available": false, "reason": "not an App Mode execution"}
		},
		"onAction": disabled("onAction"), "updateMenuItem": disabled("updateMenuItem"), "quit": disabled("quit"),
	}
}

func (a *AppShellRuntime) jsObject() map[string]any {
	return map[string]any{
		"getCapabilities": func() any {
			manifest := a.shell.Manifest()
			return map[string]any{
				"enabled": true, "available": true, "packageId": manifest.ID,
				"mainWindowId": manifest.Window.MainID, "closeBehavior": manifest.Window.CloseBehavior,
			}
		},
		"onAction": func(call goja.FunctionCall) goja.Value {
			callback, ok := goja.AssertFunction(call.Argument(0))
			if !ok {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "onAction", "action handler must be a function"))
			}
			if a.closing.Load() {
				panic(appShellJSError(a.runtime, "APP_QUITTING", "onAction", "App Shell is quitting"))
			}
			a.nextListenerID++
			id := a.nextListenerID
			a.listeners[id] = callback
			return a.runtime.ToValue(func(goja.FunctionCall) goja.Value {
				delete(a.listeners, id)
				return goja.Undefined()
			})
		},
		"updateMenuItem": func(call goja.FunctionCall) goja.Value {
			id := strings.TrimSpace(call.Argument(0).String())
			patch, err := decodeMenuItemPatch(call.Argument(1))
			if err != nil {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "updateMenuItem", err.Error()))
			}
			return a.startAsync("updateMenuItem", func(ctx context.Context) (any, error) {
				return nil, a.shell.UpdateMenuItem(ctx, id, patch)
			})
		},
		"quit": func(goja.FunctionCall) goja.Value {
			promise, resolve, reject := a.runtime.NewPromise()
			a.loop.SetTimeout(func(runtime *goja.Runtime) {
				if err := a.shell.RequestQuit(); err != nil {
					_ = reject(appShellJSError(runtime, "APP_SHELL_ERROR", "quit", err.Error()))
					return
				}
				_ = resolve(goja.Undefined())
			}, 0)
			return a.runtime.ToValue(promise)
		},
	}
}

func decodeMenuItemPatch(value goja.Value) (appshell.MenuItemPatch, error) {
	data, err := json.Marshal(value.Export())
	if err != nil {
		return appshell.MenuItemPatch{}, err
	}
	var patch appshell.MenuItemPatch
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&patch); err != nil {
		return patch, fmt.Errorf("invalid menu item patch: %w", err)
	}
	if patch.Label == nil && patch.Enabled == nil && patch.Visible == nil {
		return patch, errors.New("menu item patch is empty")
	}
	return patch, nil
}

func (a *AppShellRuntime) enqueue(event appshell.ActionEvent) error {
	if a.closing.Load() {
		return appshell.ErrTornDown
	}
	a.queueMu.Lock()
	if len(a.queue) >= appShellRuntimeQueueCapacity {
		a.queueMu.Unlock()
		return appshell.ErrQueueFull
	}
	a.queue = append(a.queue, event)
	a.queueMu.Unlock()
	if a.eventScheduled.CompareAndSwap(false, true) {
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.drain(runtime) }) {
			a.queueMu.Lock()
			a.queue = nil
			a.queueMu.Unlock()
			a.eventScheduled.Store(false)
			return appshell.ErrTornDown
		}
	}
	return nil
}

func (a *AppShellRuntime) drain(runtime *goja.Runtime) {
	for {
		a.queueMu.Lock()
		if len(a.queue) == 0 {
			a.queueMu.Unlock()
			break
		}
		events := append([]appshell.ActionEvent(nil), a.queue...)
		a.queue = nil
		a.queueMu.Unlock()
		for _, event := range events {
			if event.ID == "opendesk.open" {
				a.requestOpenMainWindow()
			}
			argument := runtime.ToValue(map[string]any{"id": event.ID, "source": event.Source})
			ids := make([]int, 0, len(a.listeners))
			for id := range a.listeners {
				ids = append(ids, int(id))
			}
			sort.Ints(ids)
			for _, rawID := range ids {
				listener := a.listeners[uint64(rawID)]
				if listener == nil {
					continue
				}
				result, err := listener(goja.Undefined(), argument)
				if err != nil {
					a.reportAsyncError(err)
					continue
				}
				a.observeListenerResult(result)
			}
		}
	}
	a.eventScheduled.Store(false)
	a.queueMu.Lock()
	more := len(a.queue) > 0
	a.queueMu.Unlock()
	if more && a.eventScheduled.CompareAndSwap(false, true) {
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.drain(runtime) }) {
			a.queueMu.Lock()
			a.queue = nil
			a.queueMu.Unlock()
			a.eventScheduled.Store(false)
		}
	}
}

func (a *AppShellRuntime) requestOpenMainWindow() {
	if a.ui == nil || !a.ui.appMainWindowReady(a.shell.Manifest().Window.MainID) {
		a.openPending = true
		return
	}
	a.openPending = false
	a.startDetached("open", func(ctx context.Context) error {
		return a.ui.showAppMainWindow(ctx, a.shell.Manifest().Window.MainID)
	})
}

func (a *AppShellRuntime) mainWindowReady() {
	if a == nil {
		return
	}
	a.mainReady = true
	if a.openPending && !a.closing.Load() {
		a.requestOpenMainWindow()
	}
}

func (a *AppShellRuntime) MainWindowReady() bool {
	return a != nil && a.mainReady
}

func (a *AppShellRuntime) mainWindowEvent(event customUIAppWindowEvent) {
	if a == nil || a.closing.Load() {
		return
	}
	manifest := a.shell.Manifest()
	if event.WindowID == manifest.Window.MainID && event.Type == "close" && event.Reason == "user" && manifest.Window.CloseBehavior == "quit" {
		a.loop.SetTimeout(func(*goja.Runtime) {
			if err := a.shell.RequestQuit(); err != nil {
				a.reportAsyncError(err)
			}
		}, 0)
	}
}

func (a *AppShellRuntime) startDetached(operation string, worker func(context.Context) error) {
	if a.closing.Load() {
		return
	}
	a.workers.active.Add(1)
	a.workers.wg.Add(1)
	go func() {
		defer a.workers.active.Add(-1)
		defer a.workers.wg.Done()
		err := worker(a.context)
		if err != nil && !a.closing.Load() {
			if operation == "open" {
				emitRuntimeLog(a.eventSink, "warn", "App Shell could not reopen the Custom UI main window; tray ownership remains active", map[string]any{"error": err.Error()})
				return
			}
			a.loop.RunOnLoop(func(*goja.Runtime) { a.reportAsyncError(fmt.Errorf("automation.app.%s: %w", operation, err)) })
		}
	}()
}

func (a *AppShellRuntime) startAsync(operation string, worker func(context.Context) (any, error)) goja.Value {
	promise, resolve, reject := a.runtime.NewPromise()
	if a.closing.Load() {
		_ = reject(appShellJSError(a.runtime, "APP_QUITTING", operation, "App Shell is quitting"))
		return a.runtime.ToValue(promise)
	}
	a.nextPendingID++
	id := a.nextPendingID
	ctx, cancel := context.WithCancel(a.context)
	counted := &atomic.Bool{}
	counted.Store(true)
	a.pending[id] = appShellPending{cancel: cancel, resolve: resolve, reject: reject, counted: counted}
	a.asyncPending.Add(1)
	a.workers.active.Add(1)
	a.workers.wg.Add(1)
	go func() {
		defer a.workers.active.Add(-1)
		defer a.workers.wg.Done()
		result, err := worker(ctx)
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.finishAsync(runtime, id, result, err) }) {
			if counted.CompareAndSwap(true, false) {
				a.asyncPending.Add(-1)
			}
		}
	}()
	return a.runtime.ToValue(promise)
}

func (a *AppShellRuntime) finishAsync(runtime *goja.Runtime, id uint64, value any, operationErr error) {
	pending, ok := a.pending[id]
	if !ok {
		return
	}
	delete(a.pending, id)
	if pending.counted.CompareAndSwap(true, false) {
		a.asyncPending.Add(-1)
	}
	pending.cancel()
	if operationErr != nil {
		_ = pending.reject(appShellJSError(runtime, "APP_SHELL_ERROR", "updateMenuItem", operationErr.Error()))
		return
	}
	_ = pending.resolve(value)
}

func (a *AppShellRuntime) observeListenerResult(value goja.Value) {
	constructor := a.runtime.Get("Promise").ToObject(a.runtime)
	resolve, ok := goja.AssertFunction(constructor.Get("resolve"))
	if !ok {
		a.reportAsyncError(errors.New("Promise.resolve is unavailable"))
		return
	}
	resolved, err := resolve(constructor, value)
	if err != nil {
		a.reportAsyncError(err)
		return
	}
	then, ok := goja.AssertFunction(resolved.ToObject(a.runtime).Get("then"))
	if !ok {
		return
	}
	rejected := a.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		a.reportAsyncError(fmt.Errorf("%s", call.Argument(0).String()))
		return goja.Undefined()
	})
	_, _ = then(resolved, goja.Undefined(), rejected)
}

func (a *AppShellRuntime) reportAsyncError(err error) {
	if err != nil && a.onAsyncError != nil {
		a.onAsyncError(err)
	}
}

func (a *AppShellRuntime) CancelAsync() {
	a.BeginCancel()
	a.FinishCancel()
}

func (a *AppShellRuntime) BeginCancel() {
	if a == nil {
		return
	}
	a.beginCloseOnce.Do(func() {
		a.closing.Store(true)
		a.shell.UnbindActionSink()
		for id, pending := range a.pending {
			delete(a.pending, id)
			pending.cancel()
			if pending.counted.CompareAndSwap(true, false) {
				a.asyncPending.Add(-1)
			}
		}
		a.listeners = map[uint64]goja.Callable{}
		a.queueMu.Lock()
		a.queue = nil
		a.queueMu.Unlock()
	})
}

func (a *AppShellRuntime) FinishCancel() {
	if a == nil {
		return
	}
	a.finishCloseOnce.Do(func() { a.shell.CancelAsync() })
}

func (a *AppShellRuntime) Wait() {
	if a == nil {
		return
	}
	a.workers.wg.Wait()
	a.shell.Wait()
}

func (a *AppShellRuntime) AsyncCounts() (workers int64, callbacks int) {
	if a == nil {
		return 0, 0
	}
	workers = a.workers.active.Load()
	a.queueMu.Lock()
	queued := len(a.queue)
	a.queueMu.Unlock()
	running, shellQueued := a.shell.ResourceCounts()
	callbacks = int(a.asyncPending.Load()) + queued + shellQueued + len(a.listeners) + running
	return workers, callbacks
}

func (a *AppShellRuntime) ResourceCounts() (running int, workers int64, pending, queued, listeners int) {
	if a == nil {
		return
	}
	running, shellQueued := a.shell.ResourceCounts()
	workers = a.workers.active.Load()
	pending = int(a.asyncPending.Load())
	a.queueMu.Lock()
	queued = len(a.queue) + shellQueued
	a.queueMu.Unlock()
	listeners = len(a.listeners)
	return
}

func (a *AppShellRuntime) KeepsAlive() bool {
	if a == nil || a.closing.Load() {
		return false
	}
	running, _ := a.shell.ResourceCounts()
	return running > 0
}

func appShellJSError(runtime *goja.Runtime, code, operation, message string) *goja.Object {
	object := runtime.NewObject()
	_ = object.Set("name", "OpenDeskAppError")
	_ = object.Set("code", code)
	_ = object.Set("operation", operation)
	_ = object.Set("message", message)
	return object
}

type customUIAppWindowEvent struct {
	WindowID string
	Type     string
	Reason   string
}
