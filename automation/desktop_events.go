package automation

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

// DesktopEventType is the stable public event name used by Events.on/once.
type DesktopEventType string

const (
	DesktopEventWindowFocused    DesktopEventType = "window.focused"
	DesktopEventWindowCreated    DesktopEventType = "window.created"
	DesktopEventWindowClosed     DesktopEventType = "window.closed"
	DesktopEventWindowMoved      DesktopEventType = "window.moved"
	DesktopEventWindowResized    DesktopEventType = "window.resized"
	DesktopEventAppLaunched      DesktopEventType = "app.launched"
	DesktopEventAppTerminated    DesktopEventType = "app.terminated"
	DesktopEventClipboardChanged DesktopEventType = "clipboard.changed"
	DesktopEventDisplayChanged   DesktopEventType = "display.changed"
)

var supportedDesktopEventTypes = []DesktopEventType{
	DesktopEventWindowFocused,
	DesktopEventWindowCreated,
	DesktopEventWindowClosed,
	DesktopEventWindowMoved,
	DesktopEventWindowResized,
	DesktopEventAppLaunched,
	DesktopEventAppTerminated,
	DesktopEventClipboardChanged,
	DesktopEventDisplayChanged,
}

var supportedDesktopEventSet = func() map[DesktopEventType]struct{} {
	result := make(map[DesktopEventType]struct{}, len(supportedDesktopEventTypes))
	for _, eventType := range supportedDesktopEventTypes {
		result[eventType] = struct{}{}
	}
	return result
}()

// DesktopEvent is Go-only data. Native/polling workers must never retain or
// access Goja values; the Runtime projects this model on its owner loop.
type DesktopEvent struct {
	SchemaVersion int                    `json:"schemaVersion"`
	Type          DesktopEventType       `json:"type"`
	Backend       string                 `json:"backend"`
	Timestamp     time.Time              `json:"timestamp"`
	Sequence      uint64                 `json:"sequence"`
	Coalesced     int                    `json:"coalesced,omitempty"`
	Data          map[string]interface{} `json:"data"`
}

// DesktopEventCapability makes fallback routing explicit. In particular,
// Backend="polling" is never presented as a native notification source.
type DesktopEventCapability struct {
	Supported  bool   `json:"supported"`
	Backend    string `json:"backend"`
	Platform   string `json:"platform"`
	IntervalMs int64  `json:"intervalMs,omitempty"`
	Verified   bool   `json:"verified"`
	Notes      string `json:"notes,omitempty"`
}

// DesktopEventBackend is intentionally transport-only. It owns OS watchers or
// explicit polling and emits Go data; the execution-owned Events runtime owns
// subscriptions, Goja callbacks, backpressure, and teardown.
type DesktopEventBackend interface {
	Capabilities() map[DesktopEventType]DesktopEventCapability
	Subscribe(context.Context, DesktopEventType, func(DesktopEvent), func(error)) (DesktopEventBackendHandle, error)
	Close() error
	Wait()
}

type DesktopEventBackendHandle interface {
	Unsubscribe() error
}

type DesktopEventBackendFactory func() DesktopEventBackend

type DesktopEventsErrorCode string

const (
	DesktopEventsInvalidEvent    DesktopEventsErrorCode = "INVALID_EVENT"
	DesktopEventsInvalidArgument DesktopEventsErrorCode = "INVALID_ARGUMENT"
	DesktopEventsNotSupported    DesktopEventsErrorCode = "NOT_SUPPORTED"
	DesktopEventsBackendFailed   DesktopEventsErrorCode = "BACKEND_FAILED"
	DesktopEventsCallbackFailed  DesktopEventsErrorCode = "CALLBACK_FAILED"
	DesktopEventsTimeout         DesktopEventsErrorCode = "TIMEOUT"
)

type DesktopEventsError struct {
	Code      DesktopEventsErrorCode
	Operation string
	EventType DesktopEventType
	Message   string
	Cause     error
}

func (e *DesktopEventsError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "desktop event error"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *DesktopEventsError) Unwrap() error { return e.Cause }

type desktopEventSubscription struct {
	id        uint64
	eventType DesktopEventType
	callback  goja.Callable
	resolve   func(interface{}) error
	reject    func(interface{}) error
	once      bool
	active    bool
	inFlight  bool
	deferred  *DesktopEvent
	timer     *time.Timer
}

type desktopEventGroup struct {
	handle        DesktopEventBackendHandle
	subscriptions map[uint64]*desktopEventSubscription
}

// DesktopEventsRuntime is one execution-owned registry. All fields except the
// atomic closing flag and queueMu-protected pending queue belong to the Goja
// EventLoop owner.
type DesktopEventsRuntime struct {
	runtime      *goja.Runtime
	loop         *eventloop.EventLoop
	context      context.Context
	onAsyncError func(error)
	backend      DesktopEventBackend

	groups        map[DesktopEventType]*desktopEventGroup
	subscriptions map[uint64]*desktopEventSubscription
	nextID        uint64
	sequence      uint64

	closing   atomic.Bool
	queueMu   sync.Mutex
	pending   map[DesktopEventType]DesktopEvent
	scheduled map[DesktopEventType]bool
	closeOnce sync.Once
}

func newDesktopEventsRuntime(runtimeValue *goja.Runtime, opts InitJSOptions) *DesktopEventsRuntime {
	factory := opts.DesktopEventBackendFactory
	if factory == nil {
		factory = func() DesktopEventBackend { return newPollingDesktopEventBackend(defaultDesktopEventPollInterval) }
	}
	var backend DesktopEventBackend
	if factory != nil {
		backend = factory()
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	return &DesktopEventsRuntime{
		runtime: runtimeValue, loop: opts.EventLoop, context: ctx, onAsyncError: opts.OnAsyncError,
		backend: backend, groups: map[DesktopEventType]*desktopEventGroup{},
		subscriptions: map[uint64]*desktopEventSubscription{},
		pending:       map[DesktopEventType]DesktopEvent{}, scheduled: map[DesktopEventType]bool{},
	}
}

func registerDesktopEvents(runtimeValue *goja.Runtime, opts InitJSOptions) *DesktopEventsRuntime {
	manager := newDesktopEventsRuntime(runtimeValue, opts)
	object := runtimeValue.NewObject()
	_ = object.Set("on", func(call goja.FunctionCall) goja.Value { return manager.on(call) })
	_ = object.Set("once", func(call goja.FunctionCall) goja.Value { return manager.once(call) })
	_ = object.Set("getCapabilities", func(goja.FunctionCall) goja.Value { return manager.getCapabilities() })
	_ = runtimeValue.Set("Events", object)
	return manager
}

func (d *DesktopEventsRuntime) on(call goja.FunctionCall) goja.Value {
	eventType := d.eventTypeArgument(call, 0, "Events.on")
	callback, ok := goja.AssertFunction(call.Argument(1))
	if !ok {
		panic(desktopEventsJSError(d.runtime, &DesktopEventsError{
			Code: DesktopEventsInvalidArgument, Operation: "Events.on", EventType: eventType,
			Message: "callback must be a function",
		}))
	}
	subscription := &desktopEventSubscription{eventType: eventType, callback: callback, active: true}
	if err := d.addSubscription(subscription, "Events.on"); err != nil {
		panic(desktopEventsJSError(d.runtime, err))
	}
	object := d.runtime.NewObject()
	_ = object.Set("id", subscription.id)
	_ = object.Set("event", string(eventType))
	_ = object.Set("backend", d.capability(eventType).Backend)
	_ = object.Set("unsubscribe", func(goja.FunctionCall) goja.Value {
		d.removeSubscription(subscription, "Events.unsubscribe", true)
		return goja.Undefined()
	})
	return object
}

func (d *DesktopEventsRuntime) once(call goja.FunctionCall) goja.Value {
	eventType := d.eventTypeArgument(call, 0, "Events.once")
	timeout, err := desktopEventTimeout(call.Argument(1))
	if err != nil {
		panic(desktopEventsJSError(d.runtime, &DesktopEventsError{
			Code: DesktopEventsInvalidArgument, Operation: "Events.once", EventType: eventType, Cause: err,
		}))
	}
	promise, resolve, reject := d.runtime.NewPromise()
	subscription := &desktopEventSubscription{
		eventType: eventType, resolve: resolve, reject: reject, once: true, active: true,
	}
	if err := d.addSubscription(subscription, "Events.once"); err != nil {
		panic(desktopEventsJSError(d.runtime, err))
	}
	if timeout > 0 {
		subscription.timer = time.AfterFunc(timeout, func() { d.enqueueTimeout(subscription, timeout) })
	}
	return d.runtime.ToValue(promise)
}

func desktopEventTimeout(value goja.Value) (time.Duration, error) {
	const defaultTimeout = 30 * time.Second
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return defaultTimeout, nil
	}
	exported := value.Export()
	options, ok := exported.(map[string]interface{})
	if !ok {
		return 0, fmt.Errorf("options must be an object")
	}
	raw, exists := options["timeout"]
	if !exists {
		return defaultTimeout, nil
	}
	var milliseconds float64
	switch typed := raw.(type) {
	case int:
		milliseconds = float64(typed)
	case int64:
		milliseconds = float64(typed)
	case float64:
		milliseconds = typed
	default:
		return 0, fmt.Errorf("timeout must be a finite number of milliseconds")
	}
	if milliseconds <= 0 || milliseconds > 600000 || milliseconds != milliseconds {
		return 0, fmt.Errorf("timeout must be greater than 0 and at most 600000 milliseconds")
	}
	return time.Duration(milliseconds * float64(time.Millisecond)), nil
}

func (d *DesktopEventsRuntime) eventTypeArgument(call goja.FunctionCall, index int, operation string) DesktopEventType {
	value := call.Argument(index)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		panic(desktopEventsJSError(d.runtime, &DesktopEventsError{Code: DesktopEventsInvalidEvent, Operation: operation, Message: "event type must be a string"}))
	}
	text, ok := value.Export().(string)
	if !ok {
		panic(desktopEventsJSError(d.runtime, &DesktopEventsError{Code: DesktopEventsInvalidEvent, Operation: operation, Message: "event type must be a string"}))
	}
	eventType := DesktopEventType(strings.TrimSpace(text))
	if _, ok := supportedDesktopEventSet[eventType]; !ok {
		panic(desktopEventsJSError(d.runtime, &DesktopEventsError{Code: DesktopEventsInvalidEvent, Operation: operation, EventType: eventType, Message: "unsupported desktop event type"}))
	}
	return eventType
}

func (d *DesktopEventsRuntime) addSubscription(subscription *desktopEventSubscription, operation string) error {
	if d == nil || d.loop == nil {
		return &DesktopEventsError{Code: DesktopEventsNotSupported, Operation: operation, EventType: subscription.eventType, Message: "Events requires an event-loop-owned runtime"}
	}
	if d.closing.Load() {
		return &DesktopEventsError{Code: DesktopEventsNotSupported, Operation: operation, EventType: subscription.eventType, Message: "runtime is closing"}
	}
	capability := d.capability(subscription.eventType)
	if d.backend == nil || !capability.Supported {
		return &DesktopEventsError{Code: DesktopEventsNotSupported, Operation: operation, EventType: subscription.eventType, Message: "desktop event is not supported on this platform"}
	}
	d.nextID++
	subscription.id = d.nextID
	group := d.groups[subscription.eventType]
	createdGroup := group == nil
	if createdGroup {
		group = &desktopEventGroup{subscriptions: map[uint64]*desktopEventSubscription{}}
		d.groups[subscription.eventType] = group
	}
	group.subscriptions[subscription.id] = subscription
	d.subscriptions[subscription.id] = subscription
	if createdGroup {
		handle, err := d.backend.Subscribe(d.context, subscription.eventType, d.enqueue, d.reportBackendError(subscription.eventType))
		if err != nil {
			delete(group.subscriptions, subscription.id)
			delete(d.subscriptions, subscription.id)
			delete(d.groups, subscription.eventType)
			subscription.active = false
			return &DesktopEventsError{Code: DesktopEventsBackendFailed, Operation: operation, EventType: subscription.eventType, Message: "desktop event backend subscription failed", Cause: err}
		}
		group.handle = handle
	}
	return nil
}

func (d *DesktopEventsRuntime) capability(eventType DesktopEventType) DesktopEventCapability {
	if d != nil && d.backend != nil {
		if capability, ok := d.backend.Capabilities()[eventType]; ok {
			return capability
		}
	}
	return DesktopEventCapability{Supported: false, Backend: "unavailable", Platform: runtime.GOOS, Verified: false}
}

func (d *DesktopEventsRuntime) getCapabilities() goja.Value {
	events := make(map[string]interface{}, len(supportedDesktopEventTypes))
	for _, eventType := range supportedDesktopEventTypes {
		events[string(eventType)] = desktopEventCapabilityPayload(d.capability(eventType))
	}
	return d.runtime.ToValue(map[string]interface{}{
		"schemaVersion": 1,
		"platform":      runtime.GOOS,
		"events":        events,
	})
}

// desktopEventCapabilityPayload is the public JavaScript projection. Do not
// expose the Go struct directly: Goja's default field mapper would make the
// documented lower-camel-case capability properties unavailable to scripts.
func desktopEventCapabilityPayload(capability DesktopEventCapability) map[string]interface{} {
	return map[string]interface{}{
		"supported":  capability.Supported,
		"backend":    capability.Backend,
		"platform":   capability.Platform,
		"intervalMs": capability.IntervalMs,
		"verified":   capability.Verified,
		"notes":      capability.Notes,
	}
}

func (d *DesktopEventsRuntime) enqueue(event DesktopEvent) {
	if d == nil {
		return
	}
	if event.SchemaVersion == 0 {
		event.SchemaVersion = 1
	}
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now().UTC()
	}
	if event.Data == nil {
		event.Data = map[string]interface{}{}
	}
	d.queueMu.Lock()
	if d.closing.Load() {
		d.queueMu.Unlock()
		return
	}
	if previous, exists := d.pending[event.Type]; exists {
		event.Coalesced += previous.Coalesced + 1
	}
	d.pending[event.Type] = event
	if d.scheduled[event.Type] {
		d.queueMu.Unlock()
		return
	}
	d.scheduled[event.Type] = true
	d.queueMu.Unlock()
	if d.loop == nil || !d.loop.RunOnLoop(func(*goja.Runtime) { d.dispatch(event.Type) }) {
		d.queueMu.Lock()
		delete(d.pending, event.Type)
		delete(d.scheduled, event.Type)
		d.queueMu.Unlock()
	}
}

func (d *DesktopEventsRuntime) dispatch(eventType DesktopEventType) {
	d.queueMu.Lock()
	event, ok := d.pending[eventType]
	delete(d.pending, eventType)
	delete(d.scheduled, eventType)
	d.queueMu.Unlock()
	if !ok || d.closing.Load() {
		return
	}
	d.sequence++
	event.Sequence = d.sequence
	group := d.groups[eventType]
	if group == nil {
		return
	}
	ids := make([]uint64, 0, len(group.subscriptions))
	for id := range group.subscriptions {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, id := range ids {
		if subscription := group.subscriptions[id]; subscription != nil {
			d.dispatchSubscription(subscription, event)
		}
	}
}

func (d *DesktopEventsRuntime) dispatchSubscription(subscription *desktopEventSubscription, event DesktopEvent) {
	if subscription == nil || !subscription.active || d.closing.Load() {
		return
	}
	if subscription.once {
		resolve := subscription.resolve
		d.removeSubscription(subscription, "Events.once", false)
		if resolve != nil {
			if err := resolve(desktopEventPayload(event)); err != nil {
				d.reportAsync(&DesktopEventsError{Code: DesktopEventsBackendFailed, Operation: "Events.once", EventType: event.Type, Message: "failed to resolve event Promise", Cause: err})
			}
		}
		return
	}
	if subscription.inFlight {
		copy := event
		subscription.deferred = &copy
		return
	}
	if subscription.callback == nil {
		return
	}
	subscription.inFlight = true
	result, err := subscription.callback(goja.Undefined(), d.runtime.ToValue(desktopEventPayload(event)))
	if err != nil {
		d.finishCallback(subscription, err)
		return
	}
	d.awaitCallback(subscription, result)
}

func desktopEventPayload(event DesktopEvent) map[string]interface{} {
	return map[string]interface{}{
		"schemaVersion": event.SchemaVersion,
		"type":          string(event.Type),
		"backend":       event.Backend,
		"timestamp":     event.Timestamp.UTC().Format(time.RFC3339Nano),
		"sequence":      event.Sequence,
		"coalesced":     event.Coalesced,
		"data":          event.Data,
	}
}

func (d *DesktopEventsRuntime) awaitCallback(subscription *desktopEventSubscription, value goja.Value) {
	promiseConstructor := d.runtime.Get("Promise").ToObject(d.runtime)
	resolve, ok := goja.AssertFunction(promiseConstructor.Get("resolve"))
	if !ok {
		d.finishCallback(subscription, fmt.Errorf("Promise.resolve is unavailable"))
		return
	}
	promiseValue, err := resolve(promiseConstructor, value)
	if err != nil {
		d.finishCallback(subscription, err)
		return
	}
	promiseObject := promiseValue.ToObject(d.runtime)
	then, ok := goja.AssertFunction(promiseObject.Get("then"))
	if !ok {
		d.finishCallback(subscription, fmt.Errorf("callback result is not awaitable"))
		return
	}
	onFulfilled := d.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		d.finishCallback(subscription, nil)
		return goja.Undefined()
	})
	onRejected := d.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		d.finishCallback(subscription, fmt.Errorf("%s", call.Argument(0).String()))
		return goja.Undefined()
	})
	if _, err := then(promiseObject, onFulfilled, onRejected); err != nil {
		d.finishCallback(subscription, err)
	}
}

func (d *DesktopEventsRuntime) finishCallback(subscription *desktopEventSubscription, callbackErr error) {
	if subscription == nil || !subscription.inFlight {
		return
	}
	subscription.inFlight = false
	if callbackErr != nil {
		d.reportAsync(&DesktopEventsError{Code: DesktopEventsCallbackFailed, Operation: "Events.callback", EventType: subscription.eventType, Message: "desktop event callback failed", Cause: callbackErr})
	}
	deferred := subscription.deferred
	subscription.deferred = nil
	if callbackErr == nil && deferred != nil && subscription.active {
		d.dispatchSubscription(subscription, *deferred)
	}
}

func (d *DesktopEventsRuntime) enqueueTimeout(subscription *desktopEventSubscription, timeout time.Duration) {
	if d == nil || subscription == nil || d.closing.Load() || d.loop == nil {
		return
	}
	d.loop.RunOnLoop(func(*goja.Runtime) {
		if !subscription.active || !subscription.once {
			return
		}
		reject := subscription.reject
		eventType := subscription.eventType
		d.removeSubscription(subscription, "Events.once", false)
		if reject != nil {
			_ = reject(desktopEventsJSError(d.runtime, &DesktopEventsError{
				Code: DesktopEventsTimeout, Operation: "Events.once", EventType: eventType,
				Message: fmt.Sprintf("timed out after %s", timeout),
			}))
		}
	})
}

func (d *DesktopEventsRuntime) removeSubscription(subscription *desktopEventSubscription, operation string, report bool) {
	if d == nil || subscription == nil || !subscription.active {
		return
	}
	subscription.active = false
	if subscription.timer != nil {
		subscription.timer.Stop()
		subscription.timer = nil
	}
	subscription.callback = nil
	subscription.resolve = nil
	subscription.reject = nil
	subscription.deferred = nil
	delete(d.subscriptions, subscription.id)
	group := d.groups[subscription.eventType]
	if group == nil {
		return
	}
	delete(group.subscriptions, subscription.id)
	if len(group.subscriptions) == 0 {
		delete(d.groups, subscription.eventType)
		if group.handle != nil {
			if err := group.handle.Unsubscribe(); err != nil && report {
				d.reportAsync(&DesktopEventsError{Code: DesktopEventsBackendFailed, Operation: operation, EventType: subscription.eventType, Message: "desktop event backend unsubscribe failed", Cause: err})
			}
			group.handle = nil
		}
	}
}

func (d *DesktopEventsRuntime) reportBackendError(eventType DesktopEventType) func(error) {
	return func(err error) {
		if err == nil || d == nil || d.closing.Load() || d.loop == nil {
			return
		}
		// Polling/native workers return only Go data. Report failure on the owner
		// loop so the execution async-error state is never mutated concurrently.
		d.loop.RunOnLoop(func(*goja.Runtime) {
			if d.closing.Load() {
				return
			}
			d.reportAsync(&DesktopEventsError{Code: DesktopEventsBackendFailed, Operation: "Events.watch", EventType: eventType, Message: "desktop event backend failed", Cause: err})
		})
	}
}

func (d *DesktopEventsRuntime) reportAsync(err error) {
	if err != nil && d != nil && d.onAsyncError != nil {
		d.onAsyncError(err)
	}
}

func (d *DesktopEventsRuntime) Close() {
	if d == nil {
		return
	}
	d.closeOnce.Do(func() {
		d.queueMu.Lock()
		d.closing.Store(true)
		d.pending = map[DesktopEventType]DesktopEvent{}
		d.scheduled = map[DesktopEventType]bool{}
		d.queueMu.Unlock()
		subscriptions := make([]*desktopEventSubscription, 0, len(d.subscriptions))
		for _, subscription := range d.subscriptions {
			subscriptions = append(subscriptions, subscription)
		}
		for _, subscription := range subscriptions {
			d.removeSubscription(subscription, "Events.cleanup", true)
		}
		if d.backend != nil {
			if err := d.backend.Close(); err != nil {
				d.reportAsync(&DesktopEventsError{Code: DesktopEventsBackendFailed, Operation: "Events.cleanup", Message: "desktop event backend close failed", Cause: err})
			}
		}
	})
}

func (d *DesktopEventsRuntime) Wait() {
	if d != nil && d.backend != nil {
		d.backend.Wait()
	}
}

func (d *DesktopEventsRuntime) ResourceCounts() (subscriptions int, pending int) {
	if d == nil {
		return 0, 0
	}
	subscriptions = len(d.subscriptions)
	d.queueMu.Lock()
	pending = len(d.pending)
	d.queueMu.Unlock()
	for _, subscription := range d.subscriptions {
		if subscription.inFlight {
			pending++
		}
		if subscription.deferred != nil {
			pending++
		}
	}
	return subscriptions, pending
}

func desktopEventsJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var eventErr *DesktopEventsError
	if errors.As(err, &eventErr) {
		_ = object.Set("code", string(eventErr.Code))
		_ = object.Set("operation", eventErr.Operation)
		_ = object.Set("event", string(eventErr.EventType))
	}
	return object
}
