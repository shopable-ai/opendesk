package automation

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const appWindowQueryLimit = 32

type appWindowQueryJob struct {
	id     uint64
	target map[string]interface{} // copied Go data; no worker owns Goja values
}
type appWindowQueryPromise struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
}

// AppWindowQueryRuntime follows AppRuntime's owner-loop Promise projection and
// Close/Wait contract. A lazy, execution-owned serial worker keeps native reads
// off Goja and exits when idle. Each caller gets its own fresh native observation;
// there is no cross-target coalescing or observation cache.
type AppWindowQueryRuntime struct {
	vm          *goja.Runtime
	loop        *eventloop.EventLoop
	window      *WindowManager
	context     context.Context
	cancel      context.CancelFunc
	stopContext func() bool
	closing     atomic.Bool
	workers     atomic.Int64
	wg          sync.WaitGroup
	mu          sync.Mutex
	closed      bool // owner-loop teardown has rejected the pending Promises
	running     bool
	nextID      uint64
	queue       []appWindowQueryJob
	pending     map[uint64]appWindowQueryPromise
}

// Install before the window polyfill captures originalGetAppWindow. The
// existing public facade retains its full strict descriptor/symbol validation.
func registerAppWindowQuery(vm *goja.Runtime, opts InitJSOptions, window *WindowManager, methods map[string]interface{}) *AppWindowQueryRuntime {
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	m := &AppWindowQueryRuntime{vm: vm, loop: opts.EventLoop, window: window, context: ctx, cancel: cancel, pending: make(map[uint64]appWindowQueryPromise)}
	methods["getAppWindow"] = m.query
	m.stopContext = context.AfterFunc(ctx, func() {
		// Reject only on the owner loop; immediately fence all late worker results.
		m.closing.Store(true)
		if m.loop != nil {
			m.loop.RunOnLoop(func(*goja.Runtime) { m.Close() })
		}
	})
	return m
}

func (m *AppWindowQueryRuntime) jsError(err error) *goja.Object {
	e := &WindowError{Code: WindowBackendFailed, Operation: "window.getAppWindow", Message: "app-scoped window observation failed", Cause: err}
	var native *WindowError
	if errors.As(err, &native) {
		copy := *native
		e = &copy
		e.Operation = "window.getAppWindow"
	}
	e.Capability = "window.appScoped"
	object := m.vm.NewGoError(e)
	_ = object.Set("name", "WindowError")
	for key, value := range e.JSProperties() {
		_ = object.Set(key, value)
	}
	return object
}
func (m *AppWindowQueryRuntime) reject(code WindowErrorCode, message string) goja.Value {
	promise, _, reject := m.vm.NewPromise()
	_ = reject(m.jsError(windowOperationError("window.getAppWindow", code, message, nil)))
	return m.vm.ToValue(promise)
}
func (m *AppWindowQueryRuntime) query(call goja.FunctionCall) goja.Value {
	if len(call.Arguments) != 1 {
		return m.reject(WindowInvalidArgument, "expected exactly one {pid, exePath} target")
	}
	raw, ok := call.Argument(0).Export().(map[string]interface{})
	if !ok || len(raw) != 2 {
		return m.reject(WindowInvalidArgument, "target must contain exactly pid and exePath")
	}
	// The public facade already snapshots validated primitive data. Copy again
	// across the native boundary so queued jobs cannot share caller-owned state.
	target := map[string]interface{}{"pid": raw["pid"], "exePath": raw["exePath"]}
	if m.loop == nil {
		return m.reject(WindowNotSupported, "app-scoped queries require an execution EventLoop")
	}
	if m.closing.Load() || m.context.Err() != nil {
		return m.reject(WindowErrorCode("CANCELED"), "execution canceled")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closing.Load() || m.context.Err() != nil {
		return m.reject(WindowErrorCode("CANCELED"), "execution canceled")
	}
	if len(m.pending) >= appWindowQueryLimit {
		return m.reject(WindowBackendFailed, "app-scoped query queue limit (32) reached")
	}
	promise, resolve, reject := m.vm.NewPromise()
	m.nextID++
	id := m.nextID
	m.pending[id] = appWindowQueryPromise{resolve: resolve, reject: reject}
	m.queue = append(m.queue, appWindowQueryJob{id: id, target: target})
	if !m.running {
		m.running = true
		m.workers.Add(1)
		m.wg.Add(1)
		go m.run()
	}
	return m.vm.ToValue(promise)
}

func (m *AppWindowQueryRuntime) run() {
	defer m.wg.Done()
	defer m.workers.Add(-1)
	for {
		m.mu.Lock()
		if m.closing.Load() || m.context.Err() != nil || len(m.queue) == 0 {
			m.running = false
			m.mu.Unlock()
			return
		}
		job := m.queue[0]
		m.queue[0] = appWindowQueryJob{}
		m.queue = m.queue[1:]
		m.mu.Unlock()
		// Keep the existing native owner's parameter, fresh foreground/executable,
		// exact AX/CG identity and before/after checks unchanged. No cached reads.
		result, err := m.window.GetAppWindow(job.target)
		if m.closing.Load() || m.context.Err() != nil {
			continue
		}
		delivered := make(chan struct{})
		if !m.loop.RunOnLoop(func(*goja.Runtime) { defer close(delivered); m.finish(job.id, result, err) }) {
			m.closing.Store(true)
			m.cancel()
			return
		}
		// At most one completion is queued to Goja. Backpressure never drops either
		// of two independently scoped callers, and prevents stale-result queue growth.
		select {
		case <-delivered:
		case <-m.context.Done():
		}
	}
}

func (m *AppWindowQueryRuntime) finish(id uint64, result *WindowInfo, err error) {
	if m.closing.Load() || m.context.Err() != nil {
		m.Close()
		return
	}
	m.mu.Lock()
	pending, ok := m.pending[id]
	delete(m.pending, id)
	m.mu.Unlock()
	if !ok {
		return
	}
	if m.closing.Load() || m.context.Err() != nil {
		_ = pending.reject(m.jsError(windowOperationError("window.getAppWindow", WindowErrorCode("CANCELED"), "execution canceled", nil)))
		m.Close()
		return
	}
	if err != nil {
		_ = pending.reject(m.jsError(err))
		return
	}
	if result == nil {
		_ = pending.resolve(goja.Null())
		return
	}
	// Explicit public schema, independent of Goja's default struct field mapper.
	_ = pending.resolve(map[string]interface{}{
		"id": result.ID, "pid": result.ProcessID, "handle": result.Handle, "title": result.Title,
		"x": result.X, "y": result.Y, "width": result.Width, "height": result.Height,
		"exeName": result.ExeName, "exePath": result.ExePath, "isForeground": result.IsForeground,
		"hasFocus": result.HasFocus, "isPopup": result.IsPopup, "index": result.Index,
	})
}

// Close must run on the JS owner, like AppRuntime.Close. Native work already in
// progress cannot be force-interrupted; Wait joins it and its result is discarded.
func (m *AppWindowQueryRuntime) Close() {
	if m == nil {
		return
	}
	m.closing.Store(true)
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	m.closed = true
	pending := m.pending
	m.pending = make(map[uint64]appWindowQueryPromise)
	m.queue = nil
	m.mu.Unlock()
	if m.stopContext != nil {
		m.stopContext()
	}
	m.cancel()
	for _, operation := range pending {
		_ = operation.reject(m.jsError(windowOperationError("window.getAppWindow", WindowErrorCode("CANCELED"), "execution canceled", nil)))
	}
}
func (m *AppWindowQueryRuntime) Wait() {
	if m != nil {
		m.wg.Wait()
	}
}
func (m *AppWindowQueryRuntime) ResourceCounts() (workers int64, pending int) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.workers.Load(), len(m.pending)
}
