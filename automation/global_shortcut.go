package automation

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

// GlobalShortcutErrorCode is the stable JavaScript error.code for the global
// shortcut API. It intentionally follows the existing structured-runtime
// error convention without creating another error transport.
type GlobalShortcutErrorCode string

const (
	GlobalShortcutInvalidAccelerator GlobalShortcutErrorCode = "INVALID_ACCELERATOR"
	GlobalShortcutAlreadyRegistered  GlobalShortcutErrorCode = "ALREADY_REGISTERED"
	GlobalShortcutRegistrationFailed GlobalShortcutErrorCode = "REGISTRATION_FAILED"
	GlobalShortcutNotSupported       GlobalShortcutErrorCode = "NOT_SUPPORTED"
	globalShortcutCallbackFailed     GlobalShortcutErrorCode = "CALLBACK_FAILED"
)

// GlobalShortcutError is exported to JavaScript as a normal Error with code,
// operation, and accelerator properties.
type GlobalShortcutError struct {
	Code        GlobalShortcutErrorCode
	Operation   string
	Accelerator string
	Message     string
	Cause       error
}

func (e *GlobalShortcutError) Error() string {
	if e == nil {
		return ""
	}
	message := e.Message
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "global shortcut error"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *GlobalShortcutError) Unwrap() error { return e.Cause }

// Accelerator is the OS-neutral, normalized form of a user accelerator. It
// is intentionally useful in tests and backend implementations, but users
// only interact with the JavaScript string form.
type Accelerator struct {
	Modifiers shortcutModifiers
	Key       string
	Canonical string
}

type shortcutModifiers uint8

const (
	shortcutModifierCommandOrControl shortcutModifiers = 1 << iota
	shortcutModifierCommand
	shortcutModifierControl
	shortcutModifierShift
	shortcutModifierAlt
	shortcutModifierMeta
)

var acceleratorModifierOrder = []struct {
	bit  shortcutModifiers
	name string
}{
	{shortcutModifierCommandOrControl, "CommandOrControl"},
	{shortcutModifierCommand, "Command"},
	{shortcutModifierControl, "Control"},
	{shortcutModifierShift, "Shift"},
	{shortcutModifierAlt, "Alt"},
	{shortcutModifierMeta, "Meta"},
}

// NormalizeAccelerator parses, validates, aliases, and produces a stable
// public representation. Platform-specific conversion happens only at the
// ShortcutBackend boundary.
func NormalizeAccelerator(input string) (Accelerator, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return Accelerator{}, invalidAccelerator(input, "accelerator must not be empty")
	}
	parts := strings.Split(raw, "+")
	accelerator := Accelerator{}
	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			return Accelerator{}, invalidAccelerator(input, "accelerator contains an empty token")
		}
		if modifier, ok := normalizeShortcutModifier(token); ok {
			if accelerator.Modifiers&modifier != 0 {
				return Accelerator{}, invalidAccelerator(input, "accelerator contains a duplicate modifier "+canonicalShortcutModifier(modifier))
			}
			accelerator.Modifiers |= modifier
			continue
		}
		key, ok := normalizeShortcutKey(token)
		if !ok {
			return Accelerator{}, invalidAccelerator(input, "unsupported accelerator token "+token)
		}
		if accelerator.Key != "" {
			return Accelerator{}, invalidAccelerator(input, "accelerator must contain exactly one primary key")
		}
		accelerator.Key = key
	}
	if accelerator.Key == "" {
		return Accelerator{}, invalidAccelerator(input, "accelerator must contain a primary key")
	}
	canonical := make([]string, 0, len(acceleratorModifierOrder)+1)
	for _, item := range acceleratorModifierOrder {
		if accelerator.Modifiers&item.bit != 0 {
			canonical = append(canonical, item.name)
		}
	}
	canonical = append(canonical, accelerator.Key)
	accelerator.Canonical = strings.Join(canonical, "+")
	return accelerator, nil
}

func invalidAccelerator(accelerator, message string) error {
	return &GlobalShortcutError{Code: GlobalShortcutInvalidAccelerator, Operation: "globalShortcut.register", Accelerator: accelerator, Message: message}
}

func normalizeShortcutModifier(token string) (shortcutModifiers, bool) {
	switch strings.ToLower(strings.TrimSpace(token)) {
	case "commandorcontrol", "commandorctrl", "cmdorctrl", "cmdorcontrol":
		return shortcutModifierCommandOrControl, true
	case "command", "cmd":
		return shortcutModifierCommand, true
	case "control", "ctrl":
		return shortcutModifierControl, true
	case "shift":
		return shortcutModifierShift, true
	case "alt", "option", "opt":
		return shortcutModifierAlt, true
	case "meta":
		return shortcutModifierMeta, true
	default:
		return 0, false
	}
}

func canonicalShortcutModifier(modifier shortcutModifiers) string {
	for _, item := range acceleratorModifierOrder {
		if item.bit == modifier {
			return item.name
		}
	}
	return "modifier"
}

func normalizeShortcutKey(token string) (string, bool) {
	upper := strings.ToUpper(strings.TrimSpace(token))
	if len(upper) == 1 && ((upper[0] >= 'A' && upper[0] <= 'Z') || (upper[0] >= '0' && upper[0] <= '9')) {
		return upper, true
	}
	if strings.HasPrefix(upper, "F") {
		var number int
		if _, err := fmt.Sscanf(upper, "F%d", &number); err == nil && number >= 1 && number <= 24 && upper == fmt.Sprintf("F%d", number) {
			return upper, true
		}
	}
	switch strings.ToLower(strings.TrimSpace(token)) {
	case "enter", "return":
		return "Enter", true
	case "escape", "esc":
		return "Escape", true
	case "space", "spacebar":
		return "Space", true
	case "tab":
		return "Tab", true
	case "backspace":
		return "Backspace", true
	case "delete", "del":
		return "Delete", true
	case "up", "arrowup":
		return "Up", true
	case "down", "arrowdown":
		return "Down", true
	case "left", "arrowleft":
		return "Left", true
	case "right", "arrowright":
		return "Right", true
	default:
		return "", false
	}
}

// GlobalShortcutPlatformAccelerator is the validated backend input. Internal
// numeric values are never exposed through JavaScript.
type GlobalShortcutPlatformAccelerator struct {
	Canonical string
	KeyCode   uint32
	Modifiers uint32
}

// GlobalShortcutBackend is deliberately small: it owns native registration,
// never a Goja value. Its callback can run on an OS thread and must only
// enqueue work back to the runtime.
type GlobalShortcutBackend interface {
	Register(GlobalShortcutPlatformAccelerator, func()) (GlobalShortcutBackendHandle, error)
	Close() error
}

type GlobalShortcutBackendHandle interface {
	Unregister() error
}

type GlobalShortcutBackendFactory func() GlobalShortcutBackend

var errShortcutBackendAlreadyRegistered = errors.New("shortcut already registered by this process")

type globalShortcutBinding struct {
	id          uint64
	accelerator Accelerator
	platform    GlobalShortcutPlatformAccelerator
	callback    goja.Callable // event-loop owner only
	handle      GlobalShortcutBackendHandle
	inFlight    bool // event-loop owner only
	active      atomic.Bool
	scheduled   atomic.Bool
}

// GlobalShortcutRuntime is one execution-owned global shortcut registry.
// Native callbacks never access its Goja fields; they only call enqueue.
type GlobalShortcutRuntime struct {
	runtime        *goja.Runtime
	loop           *eventloop.EventLoop
	onAsyncError   func(error)
	backendFactory GlobalShortcutBackendFactory
	backend        GlobalShortcutBackend

	bindings  map[string]*globalShortcutBinding // event-loop owner only
	byID      map[uint64]*globalShortcutBinding // event-loop owner only
	nextID    uint64                            // event-loop owner only
	closing   atomic.Bool
	pending   atomic.Int64
	queueMu   sync.Mutex // coordinates native enqueue with owner-loop teardown
	closeOnce sync.Once
}

func newGlobalShortcutRuntime(runtime *goja.Runtime, loop *eventloop.EventLoop, onAsyncError func(error), factory GlobalShortcutBackendFactory) *GlobalShortcutRuntime {
	if factory == nil {
		factory = newPlatformGlobalShortcutBackend
	}
	return &GlobalShortcutRuntime{
		runtime: runtime, loop: loop, onAsyncError: onAsyncError, backendFactory: factory,
		bindings: map[string]*globalShortcutBinding{}, byID: map[uint64]*globalShortcutBinding{},
	}
}

func registerGlobalShortcut(runtime *goja.Runtime, opts InitJSOptions) *GlobalShortcutRuntime {
	manager := newGlobalShortcutRuntime(runtime, opts.EventLoop, opts.OnAsyncError, opts.GlobalShortcutBackendFactory)
	object := runtime.NewObject()
	_ = object.Set("register", func(call goja.FunctionCall) goja.Value { return manager.register(call) })
	_ = object.Set("unregister", func(call goja.FunctionCall) goja.Value { return manager.unregister(call) })
	_ = object.Set("isRegistered", func(call goja.FunctionCall) goja.Value { return manager.isRegistered(call) })
	_ = object.Set("unregisterAll", func(goja.FunctionCall) goja.Value {
		manager.unregisterAll("globalShortcut.unregisterAll")
		return goja.Undefined()
	})
	_ = runtime.Set("globalShortcut", object)
	return manager
}

func (g *GlobalShortcutRuntime) register(call goja.FunctionCall) goja.Value {
	acceleratorText := g.acceleratorArgument(call, 0, "globalShortcut.register")
	accelerator, err := NormalizeAccelerator(acceleratorText)
	if err != nil {
		panic(globalShortcutJSError(g.runtime, err))
	}
	callback, ok := goja.AssertFunction(call.Argument(1))
	if !ok {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutInvalidAccelerator, Operation: "globalShortcut.register", Accelerator: accelerator.Canonical, Message: "callback must be a function"}))
	}
	platform, err := platformGlobalShortcutAccelerator(accelerator)
	if err != nil {
		panic(globalShortcutJSError(g.runtime, globalShortcutRegistrationError("globalShortcut.register", accelerator.Canonical, err)))
	}
	if g.loop == nil {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutNotSupported, Operation: "globalShortcut.register", Accelerator: accelerator.Canonical, Message: "globalShortcut requires an event-loop-owned runtime"}))
	}
	if g.closing.Load() {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutNotSupported, Operation: "globalShortcut.register", Accelerator: accelerator.Canonical, Message: "runtime is closing"}))
	}
	if _, exists := g.bindings[platform.Canonical]; exists {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutAlreadyRegistered, Operation: "globalShortcut.register", Accelerator: accelerator.Canonical, Message: "accelerator is already registered by this runtime"}))
	}
	if g.backend == nil {
		g.backend = g.backendFactory()
	}
	if g.backend == nil {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutNotSupported, Operation: "globalShortcut.register", Accelerator: accelerator.Canonical, Message: "global shortcut backend is unavailable"}))
	}
	g.nextID++
	binding := &globalShortcutBinding{id: g.nextID, accelerator: accelerator, platform: platform, callback: callback}
	handle, err := g.backend.Register(platform, g.enqueue(binding))
	if err != nil {
		panic(globalShortcutJSError(g.runtime, globalShortcutRegistrationError("globalShortcut.register", accelerator.Canonical, err)))
	}
	binding.handle = handle
	binding.active.Store(true)
	g.bindings[platform.Canonical] = binding
	g.byID[binding.id] = binding
	return goja.Undefined()
}

func (g *GlobalShortcutRuntime) unregister(call goja.FunctionCall) goja.Value {
	acceleratorText := g.acceleratorArgument(call, 0, "globalShortcut.unregister")
	accelerator, err := NormalizeAccelerator(acceleratorText)
	if err != nil {
		panic(globalShortcutJSError(g.runtime, err))
	}
	platform, err := platformGlobalShortcutAccelerator(accelerator)
	if err != nil {
		panic(globalShortcutJSError(g.runtime, globalShortcutRegistrationError("globalShortcut.unregister", accelerator.Canonical, err)))
	}
	if binding := g.bindings[platform.Canonical]; binding != nil {
		g.removeBinding(binding, "globalShortcut.unregister", false)
	}
	return goja.Undefined()
}

func (g *GlobalShortcutRuntime) isRegistered(call goja.FunctionCall) goja.Value {
	acceleratorText := g.acceleratorArgument(call, 0, "globalShortcut.isRegistered")
	accelerator, err := NormalizeAccelerator(acceleratorText)
	if err != nil {
		panic(globalShortcutJSError(g.runtime, err))
	}
	platform, err := platformGlobalShortcutAccelerator(accelerator)
	if err != nil {
		if errors.Is(err, errGlobalShortcutPlatformUnsupported) {
			return g.runtime.ToValue(false)
		}
		panic(globalShortcutJSError(g.runtime, globalShortcutRegistrationError("globalShortcut.isRegistered", accelerator.Canonical, err)))
	}
	return g.runtime.ToValue(g.bindings[platform.Canonical] != nil)
}

func (g *GlobalShortcutRuntime) acceleratorArgument(call goja.FunctionCall, index int, operation string) string {
	value := call.Argument(index)
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutInvalidAccelerator, Operation: operation, Message: "accelerator must be a string"}))
	}
	text, ok := value.Export().(string)
	if !ok {
		panic(globalShortcutJSError(g.runtime, &GlobalShortcutError{Code: GlobalShortcutInvalidAccelerator, Operation: operation, Message: "accelerator must be a string"}))
	}
	return text
}

func (g *GlobalShortcutRuntime) removeBinding(binding *globalShortcutBinding, operation string, report bool) {
	if binding == nil {
		return
	}
	// A native listener can be in the small gap between checking active and
	// queuing RunOnLoop. Serialize that transition with teardown so an event
	// cannot survive into a terminated loop as a leaked pending callback.
	g.queueMu.Lock()
	binding.active.Store(false)
	if binding.scheduled.Swap(false) {
		g.pending.Add(-1)
	}
	g.queueMu.Unlock()
	binding.inFlight = false
	binding.callback = nil
	delete(g.bindings, binding.platform.Canonical)
	delete(g.byID, binding.id)
	if binding.handle != nil {
		if err := binding.handle.Unregister(); err != nil && report {
			g.reportAsyncError(globalShortcutRegistrationError(operation, binding.accelerator.Canonical, err))
		}
		binding.handle = nil
	}
}

func (g *GlobalShortcutRuntime) unregisterAll(operation string) {
	bindings := make([]*globalShortcutBinding, 0, len(g.bindings))
	for _, binding := range g.bindings {
		bindings = append(bindings, binding)
	}
	sort.Slice(bindings, func(i, j int) bool { return bindings[i].id < bindings[j].id })
	for _, binding := range bindings {
		g.removeBinding(binding, operation, true)
	}
}

// Close is called by RuntimeLifecycle on the Goja owner before EventLoop
// termination. It makes all later native events harmless, unregisters every
// OS handle, and releases callback references.
func (g *GlobalShortcutRuntime) Close() {
	if g == nil {
		return
	}
	g.closeOnce.Do(func() {
		g.closing.Store(true)
		g.unregisterAll("globalShortcut.cleanup")
		if g.backend != nil {
			if err := g.backend.Close(); err != nil {
				g.reportAsyncError(globalShortcutRegistrationError("globalShortcut.cleanup", "", err))
			}
			g.backend = nil
		}
	})
}

func (g *GlobalShortcutRuntime) enqueue(binding *globalShortcutBinding) func() {
	return func() {
		if binding == nil || g == nil {
			return
		}
		g.queueMu.Lock()
		if g.closing.Load() || !binding.active.Load() {
			g.queueMu.Unlock()
			return
		}
		if !binding.scheduled.CompareAndSwap(false, true) {
			g.queueMu.Unlock()
			return
		}
		g.pending.Add(1)
		g.queueMu.Unlock()
		if g.loop == nil || !g.loop.RunOnLoop(func(runtime *goja.Runtime) { g.dispatch(runtime, binding) }) {
			g.clearScheduled(binding)
		}
	}
}

func (g *GlobalShortcutRuntime) dispatch(runtime *goja.Runtime, binding *globalShortcutBinding) {
	if binding == nil {
		return
	}
	g.clearScheduled(binding)
	if g.closing.Load() || !binding.active.Load() || g.byID[binding.id] != binding || binding.inFlight || binding.callback == nil {
		return
	}
	binding.inFlight = true
	result, err := binding.callback(goja.Undefined())
	if err != nil {
		g.finishCallback(binding, err)
		return
	}
	g.awaitCallback(runtime, binding, result)
}

func (g *GlobalShortcutRuntime) clearScheduled(binding *globalShortcutBinding) {
	if binding == nil {
		return
	}
	g.queueMu.Lock()
	if binding.scheduled.Swap(false) {
		g.pending.Add(-1)
	}
	g.queueMu.Unlock()
}

func (g *GlobalShortcutRuntime) awaitCallback(runtime *goja.Runtime, binding *globalShortcutBinding, value goja.Value) {
	promiseConstructor := runtime.Get("Promise").ToObject(runtime)
	resolve, ok := goja.AssertFunction(promiseConstructor.Get("resolve"))
	if !ok {
		g.finishCallback(binding, fmt.Errorf("Promise.resolve is unavailable"))
		return
	}
	promiseValue, err := resolve(promiseConstructor, value)
	if err != nil {
		g.finishCallback(binding, err)
		return
	}
	promiseObject := promiseValue.ToObject(runtime)
	then, ok := goja.AssertFunction(promiseObject.Get("then"))
	if !ok {
		g.finishCallback(binding, fmt.Errorf("callback result is not awaitable"))
		return
	}
	onFulfilled := runtime.ToValue(func(goja.FunctionCall) goja.Value {
		g.finishCallback(binding, nil)
		return goja.Undefined()
	})
	onRejected := runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		g.finishCallback(binding, fmt.Errorf("%s", call.Argument(0).String()))
		return goja.Undefined()
	})
	if _, err := then(promiseObject, onFulfilled, onRejected); err != nil {
		g.finishCallback(binding, err)
	}
}

func (g *GlobalShortcutRuntime) finishCallback(binding *globalShortcutBinding, callbackErr error) {
	if binding == nil || !binding.inFlight {
		return
	}
	binding.inFlight = false
	if callbackErr != nil {
		g.reportAsyncError(&GlobalShortcutError{Code: globalShortcutCallbackFailed, Operation: "globalShortcut.callback", Accelerator: binding.accelerator.Canonical, Message: "shortcut callback failed", Cause: callbackErr})
	}
}

func (g *GlobalShortcutRuntime) reportAsyncError(err error) {
	if err != nil && g.onAsyncError != nil {
		g.onAsyncError(err)
	}
}

func (g *GlobalShortcutRuntime) ResourceCounts() (bindings int, pendingEvents int) {
	if g == nil {
		return 0, 0
	}
	return len(g.bindings), int(g.pending.Load())
}

func globalShortcutJSError(runtime *goja.Runtime, err error) *goja.Object {
	object := runtime.NewGoError(err)
	var shortcutErr *GlobalShortcutError
	if errors.As(err, &shortcutErr) {
		_ = object.Set("code", string(shortcutErr.Code))
		_ = object.Set("operation", shortcutErr.Operation)
		_ = object.Set("accelerator", shortcutErr.Accelerator)
	}
	return object
}

func globalShortcutRegistrationError(operation, accelerator string, err error) error {
	var shortcutErr *GlobalShortcutError
	if errors.As(err, &shortcutErr) {
		copy := *shortcutErr
		copy.Operation = operation
		if copy.Accelerator == "" {
			copy.Accelerator = accelerator
		}
		return &copy
	}
	if errors.Is(err, errGlobalShortcutPlatformUnsupported) {
		return &GlobalShortcutError{Code: GlobalShortcutNotSupported, Operation: operation, Accelerator: accelerator, Message: "global shortcuts are not supported on this platform", Cause: err}
	}
	if errors.Is(err, errShortcutBackendAlreadyRegistered) {
		return &GlobalShortcutError{Code: GlobalShortcutAlreadyRegistered, Operation: operation, Accelerator: accelerator, Message: "accelerator is already registered", Cause: err}
	}
	return &GlobalShortcutError{Code: GlobalShortcutRegistrationFailed, Operation: operation, Accelerator: accelerator, Message: "operating system registration failed", Cause: err}
}
