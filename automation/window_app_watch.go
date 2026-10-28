package automation

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

type appWindowWatchBackend interface {
	Take() (uint32, interface{}, map[string]interface{})
	Close()
}

// AppWindowWatchRuntime follows Events' execution-owned loop/Close/Wait
// contract, without subscribing to or changing the global Events backend.
// Register on the owner loop after installing window; Close before terminating
// that loop, then Wait off-loop. Context cancellation also closes native workers.
type AppWindowWatchRuntime struct {
	vm            *goja.Runtime
	loop          *eventloop.EventLoop
	onError       func(error)
	validate      goja.Callable
	resolve       goja.Callable
	promise       *goja.Object
	mu            sync.Mutex
	closed        bool
	subscriptions map[*appWindowWatchSubscription]struct{}
	workers       sync.WaitGroup
	liveWorkers   atomic.Int64
	queueMu       sync.Mutex
	ready         map[*appWindowWatchSubscription]struct{}
	pumpScheduled bool
	stopContext   func() bool
}

type appWindowWatchSubscription struct {
	manager   *AppWindowWatchRuntime
	backend   appWindowWatchBackend
	callback  goja.Callable // owner-loop only; never touched by native workers
	active    atomic.Bool
	stop      chan struct{}
	mu        sync.Mutex
	pending   map[string]interface{}
	scheduled bool // stays true through asynchronous callback settlement
	sequence  uint64
	start     time.Time
}

// RegisterAppWindowWatch is the narrow parent integration seam. No allowlist or
// polyfill is needed: it attaches the public method directly to the window object.
func RegisterAppWindowWatch(vm *goja.Runtime, opts InitJSOptions) (*AppWindowWatchRuntime, error) {
	validator, err := vm.RunString(`(function() {
 const names=Object.getOwnPropertyNames, symbols=Object.getOwnPropertySymbols,
 descriptor=Object.getOwnPropertyDescriptor, prototype=Object.getPrototypeOf, base=Object.prototype;
 return function(target) {
 if (!target || typeof target !== 'object' || (prototype(target)!==base && prototype(target)!==null)) return null;
 const keys=names(target);
 if(keys.length!==2 || symbols(target).length || !keys.includes('pid') || !keys.includes('exePath')) return null;
 const p=descriptor(target,'pid'), e=descriptor(target,'exePath');
 if(!p || !e || !('value' in p) || !('value' in e)) return null;
 return [p.value,e.value];
 }; })()`)
	if err != nil {
		return nil, err
	}
	validate, _ := goja.AssertFunction(validator)
	promise := vm.Get("Promise").ToObject(vm)
	resolve, ok := goja.AssertFunction(promise.Get("resolve"))
	if !ok {
		return nil, fmt.Errorf("window.watchAppWindow requires Promise.resolve")
	}
	m := &AppWindowWatchRuntime{vm: vm, loop: opts.EventLoop, onError: opts.OnAsyncError, validate: validate,
		resolve: resolve, promise: promise, subscriptions: make(map[*appWindowWatchSubscription]struct{}), ready: make(map[*appWindowWatchSubscription]struct{})}
	window := vm.Get("window")
	if window == nil || goja.IsUndefined(window) || goja.IsNull(window) {
		return nil, fmt.Errorf("window must be registered first")
	}
	if err := window.ToObject(vm).Set("watchAppWindow", m.subscribe); err != nil {
		return nil, err
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	m.stopContext = context.AfterFunc(ctx, m.Close)
	return m, nil
}

func (m *AppWindowWatchRuntime) failure(code WindowErrorCode, message string) *goja.Object {
	err := windowOperationError("window.watchAppWindow", code, message, nil)
	object := m.vm.NewGoError(err)
	for key, value := range err.(*WindowError).JSProperties() {
		_ = object.Set(key, value)
	}
	_ = object.Set("capability", "window.appWatch")
	return object
}

func (m *AppWindowWatchRuntime) subscribe(call goja.FunctionCall) goja.Value {
	if len(call.Arguments) != 2 {
		panic(m.failure(WindowInvalidArgument, "expected target and callback"))
	}
	value, err := m.validate(goja.Undefined(), call.Argument(0))
	if err != nil || goja.IsNull(value) {
		panic(m.failure(WindowInvalidArgument, "target must contain exactly own data fields pid and exePath"))
	}
	data := value.ToObject(m.vm)
	if _, object := data.Get("0").(*goja.Object); object {
		panic(m.failure(WindowInvalidArgument, "pid must be a number"))
	}
	if _, object := data.Get("1").(*goja.Object); object {
		panic(m.failure(WindowInvalidArgument, "exePath must be a string"))
	}
	pid, valid := exactWindowInteger(data.Get("0").Export(), 1, math.MaxInt32)
	path, pathOK := data.Get("1").Export().(string)
	callback, callbackOK := goja.AssertFunction(call.Argument(1))
	if !valid || !pathOK || len(path) > 4095 || !strings.HasPrefix(path, "/") || strings.ContainsRune(path, 0) || !callbackOK {
		panic(m.failure(WindowInvalidArgument, "positive int32 pid, absolute executable path without NUL, and callback required"))
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed || m.loop == nil {
		panic(m.failure(WindowNotSupported, "requires a live event-loop-owned execution"))
	}
	if len(m.subscriptions) >= 32 || m.liveWorkers.Load() >= 32 {
		panic(m.failure(WindowBackendFailed, "execution subscription limit (32) reached"))
	}
	// Keep native startup off the JS owner. Even a stalled platform startup
	// cannot hold that loop beyond this one-second synchronous registration budget.
	type registration struct {
		backend appWindowWatchBackend
		failure error
	}
	result := make(chan registration)
	abandoned := make(chan struct{})
	defer close(abandoned)
	m.workers.Add(1)
	m.liveWorkers.Add(1)
	go func() {
		defer m.workers.Done()
		defer m.liveWorkers.Add(-1)
		backend, failure := newAppWindowWatchBackend(int(pid), path)
		select {
		case result <- registration{backend, failure}:
		case <-abandoned:
			if backend != nil {
				backend.Close()
			}
		}
	}()
	deadline := time.NewTimer(time.Second)
	defer deadline.Stop()
	var backend appWindowWatchBackend
	var failure error
	select {
	case registered := <-result:
		backend, failure = registered.backend, registered.failure
	case <-deadline.C:
		panic(m.failure(WindowTimeout, "native watch startup exceeded 1000ms; cleanup is execution-owned"))
	}
	if failure != nil {
		code := WindowBackendFailed
		if e, ok := failure.(*WindowError); ok {
			code = e.Code
		}
		panic(m.failure(code, failure.Error()))
	}
	s := &appWindowWatchSubscription{manager: m, backend: backend, callback: callback, stop: make(chan struct{}), start: time.Now()}
	s.active.Store(true)
	m.subscriptions[s] = struct{}{}
	initial, initialActive, caps := backend.Take()
	subscription := m.vm.NewObject()
	_ = subscription.Set("unsubscribe", func(goja.FunctionCall) goja.Value { m.remove(s); return goja.Undefined() })
	// A fresh capability snapshot is also included with every delivered hint.
	_ = subscription.DefineDataProperty("capabilities", m.vm.ToValue(caps), goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_TRUE)
	m.workers.Add(1)
	m.liveWorkers.Add(1)
	go func() {
		defer m.workers.Done()
		defer m.liveWorkers.Add(-1)
		defer backend.Close()
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		s.enqueue(initial|1, initialActive, caps)
		for {
			select {
			case <-s.stop:
				return
			case <-ticker.C:
				reasons, active, capabilities := backend.Take()
				if reasons != 0 {
					s.enqueue(reasons, active, capabilities)
				}
				if reasons&128 != 0 {
					return
				}
			}
		}
	}()
	return subscription
}

// Keep every safety-relevant transition through both native and JS coalescing.
// Order is stable by bit, not a claim about exact native notification ordering.
func appWindowHintReasons(bits uint32) []string {
	names := []string{"subscribed", "app-active-changed", "app-terminated-changed", "focused-window-changed",
		"window-moved", "window-resized", "window-destroyed", "target-invalidated", "capabilities-changed",
		"app-activated", "app-deactivated", "focused-ui-element-changed", "layout-changed", "window-created", "main-window-changed"}
	reasons := make([]string, 0, len(names))
	for bit, name := range names {
		if bits&(1<<bit) != 0 {
			reasons = append(reasons, name)
		}
	}
	return reasons
}

func (s *appWindowWatchSubscription) enqueue(bits uint32, active interface{}, caps map[string]interface{}) {
	s.mu.Lock()
	if !s.active.Load() {
		s.mu.Unlock()
		return
	}
	s.sequence++
	reasons := appWindowHintReasons(bits)
	if s.pending != nil {
		for _, previous := range s.pending["reasons"].([]string) {
			exists := false
			for _, reason := range reasons {
				if previous == reason {
					exists = true
					break
				}
			}
			if !exists {
				reasons = append(reasons, previous)
			}
		}
	}
	reason := "coalesced"
	if len(reasons) == 1 {
		reason = reasons[0]
	}
	s.pending = map[string]interface{}{"reason": reason, "reasons": reasons, "active": active, "sequence": s.sequence, "monotonicMs": float64(time.Since(s.start).Microseconds()) / 1000, "capabilities": caps}
	if s.scheduled {
		s.mu.Unlock()
		return
	}
	s.scheduled = true
	s.mu.Unlock()
	if !s.manager.schedule(s) {
		s.manager.remove(s)
	}
}

// One execution-level pump prevents subscribe/unsubscribe churn from filling
// EventLoop with stale closures. At most 32 ready subscriptions and one queued
// pump exist; each subscription still has just one union-of-reasons mailbox.
func (m *AppWindowWatchRuntime) schedule(s *appWindowWatchSubscription) bool {
	m.queueMu.Lock()
	if !s.active.Load() {
		m.queueMu.Unlock()
		return true
	}
	m.ready[s] = struct{}{}
	if m.pumpScheduled {
		m.queueMu.Unlock()
		return true
	}
	m.pumpScheduled = true
	m.queueMu.Unlock()
	if m.loop.RunOnLoop(func(*goja.Runtime) {
		m.queueMu.Lock()
		ready := make([]*appWindowWatchSubscription, 0, len(m.ready))
		for subscription := range m.ready {
			ready = append(ready, subscription)
		}
		m.ready = make(map[*appWindowWatchSubscription]struct{})
		m.pumpScheduled = false
		m.queueMu.Unlock()
		for _, subscription := range ready {
			subscription.dispatch()
		}
	}) {
		return true
	}
	m.Close()
	return false
}

func (s *appWindowWatchSubscription) dispatch() {
	s.mu.Lock()
	hint := s.pending
	s.pending = nil
	if !s.active.Load() || hint == nil {
		s.scheduled = false
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	m := s.manager
	terminal := false
	for _, reason := range hint["reasons"].([]string) {
		if reason == "target-invalidated" {
			terminal = true
		}
	}
	value, err := s.callback(goja.Undefined(), m.vm.ToValue(hint))
	if err != nil {
		s.finish(err)
		return
	}
	resolved, err := m.resolve(m.promise, value)
	if err != nil {
		s.finish(err)
		return
	}
	object := resolved.ToObject(m.vm)
	then, ok := goja.AssertFunction(object.Get("then"))
	if !ok {
		s.finish(fmt.Errorf("callback result not awaitable"))
		return
	}
	_, err = then(object, m.vm.ToValue(func(goja.FunctionCall) goja.Value { s.finish(nil); return goja.Undefined() }),
		m.vm.ToValue(func(call goja.FunctionCall) goja.Value {
			s.finish(fmt.Errorf("%s", call.Argument(0).String()))
			return goja.Undefined()
		}))
	if err != nil {
		s.finish(err)
	}
	if terminal {
		m.remove(s)
	}
}

func (s *appWindowWatchSubscription) finish(err error) {
	if !s.active.Load() {
		return
	}
	if err != nil {
		s.manager.remove(s)
		if s.manager.onError != nil {
			s.manager.onError(fmt.Errorf("window.watchAppWindow callback: %w", err))
		}
		return
	}
	s.mu.Lock()
	s.scheduled = false
	pending := s.pending != nil && s.active.Load()
	if pending {
		s.scheduled = true
	}
	s.mu.Unlock()
	if pending && !s.manager.schedule(s) {
		s.manager.remove(s)
	}
}

func (m *AppWindowWatchRuntime) remove(s *appWindowWatchSubscription) {
	if !s.active.Swap(false) {
		return
	}
	close(s.stop)
	m.queueMu.Lock()
	delete(m.ready, s)
	m.queueMu.Unlock()
	s.mu.Lock()
	s.pending = nil
	s.mu.Unlock()
	m.mu.Lock()
	delete(m.subscriptions, s)
	m.mu.Unlock()
}

func (m *AppWindowWatchRuntime) Close() {
	if m == nil {
		return
	}
	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return
	}
	m.closed = true
	m.queueMu.Lock()
	m.ready = make(map[*appWindowWatchSubscription]struct{})
	m.pumpScheduled = false
	m.queueMu.Unlock()
	subs := make([]*appWindowWatchSubscription, 0, len(m.subscriptions))
	for s := range m.subscriptions {
		subs = append(subs, s)
	}
	m.mu.Unlock()
	for _, s := range subs {
		m.remove(s)
	}
}
func (m *AppWindowWatchRuntime) Wait() {
	if m != nil {
		m.workers.Wait()
		if m.stopContext != nil {
			m.stopContext()
		}
	}
}
func (m *AppWindowWatchRuntime) ResourceCounts() (subscriptions, pending int) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	subscriptions = len(m.subscriptions)
	for s := range m.subscriptions {
		s.mu.Lock()
		if s.scheduled {
			pending++
		}
		if s.pending != nil {
			pending++
		}
		s.mu.Unlock()
	}
	return
}

// NativeWorkers remains nonzero through shutdown/join, including timed-out starts.
func (m *AppWindowWatchRuntime) NativeWorkers() int64 {
	if m == nil {
		return 0
	}
	return m.liveWorkers.Load()
}
