package automation

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestNormalizeAccelerator(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"CommandOrControl+Shift+1", "CommandOrControl+Shift+1"},
		{"CmdOrCtrl+Shift+1", "CommandOrControl+Shift+1"},
		{" ctrl + shift + a ", "Control+Shift+A"},
		{"CTRL+SHIFT+A", "Control+Shift+A"},
		{"Command+Option+S", "Command+Alt+S"},
		{"F12", "F12"},
		{"Esc", "Escape"},
	}
	for _, test := range tests {
		accelerator, err := NormalizeAccelerator(test.input)
		if err != nil || accelerator.Canonical != test.want {
			t.Fatalf("NormalizeAccelerator(%q) = %#v, %v; want %q", test.input, accelerator, err, test.want)
		}
	}
	for _, input := range []string{"", "Command+Shift", "Control+Ctrl+A", "Control++A", "Control+Unknown", "A+B"} {
		_, err := NormalizeAccelerator(input)
		var shortcutErr *GlobalShortcutError
		if !errors.As(err, &shortcutErr) || shortcutErr.Code != GlobalShortcutInvalidAccelerator {
			t.Fatalf("NormalizeAccelerator(%q) error = %#v, want INVALID_ACCELERATOR", input, err)
		}
	}
}

func TestGlobalShortcutJSBindingRequiresAnEventLoop(t *testing.T) {
	runtime := goja.New()
	if err := InitJS(runtime); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`
        let code = "";
        try { globalShortcut.register("CommandOrControl+Shift+9", () => {}); } catch (error) { code = error.code; }
        JSON.stringify({ code, isRegistered: globalShortcut.isRegistered("CommandOrControl+Shift+9") });
    `)
	if err != nil {
		t.Fatal(err)
	}
	if got := value.String(); !strings.Contains(got, `"code":"NOT_SUPPORTED"`) || !strings.Contains(got, `"isRegistered":false`) {
		t.Fatalf("unexpected no-loop globalShortcut result: %s", got)
	}
}

func TestGlobalShortcutRegistryDispatchSingleFlightAndCleanup(t *testing.T) {
	backend := newMemoryGlobalShortcutBackend()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	ready := make(chan *GlobalShortcutRuntime, 1)
	if !loop.RunOnLoop(func(runtime *goja.Runtime) {
		manager := newGlobalShortcutRuntime(runtime, loop, nil, func() GlobalShortcutBackend { return backend })
		object := runtime.NewObject()
		_ = object.Set("register", func(call goja.FunctionCall) goja.Value { return manager.register(call) })
		_ = object.Set("unregister", func(call goja.FunctionCall) goja.Value { return manager.unregister(call) })
		_ = object.Set("isRegistered", func(call goja.FunctionCall) goja.Value { return manager.isRegistered(call) })
		_ = object.Set("unregisterAll", func(goja.FunctionCall) goja.Value {
			manager.unregisterAll("globalShortcut.unregisterAll")
			return goja.Undefined()
		})
		_ = runtime.Set("globalShortcut", object)
		if _, err := runtime.RunString(`
            globalThis.shortcutCalls = 0;
            globalShortcut.register("CommandOrControl+Shift+9", async () => {
              shortcutCalls += 1;
              await Promise.resolve();
            });
            let duplicate = "";
            try { globalShortcut.register("CmdOrCtrl+Shift+9", () => {}); } catch (error) { duplicate = error.code; }
            if (duplicate !== "ALREADY_REGISTERED") throw new Error("duplicate code=" + duplicate);
        `); err != nil {
			t.Fatalf("register script: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop was terminated before setup")
	}
	manager := <-ready

	backend.TriggerAll()
	backend.TriggerAll()
	if calls := shortcutValue(t, loop); calls != 1 {
		t.Fatalf("rapid native triggers called callback %d times, want single-flight 1", calls)
	}
	backend.TriggerAll()
	if calls := shortcutValue(t, loop); calls != 2 {
		t.Fatalf("settled callback did not re-arm: calls=%d", calls)
	}

	closed := make(chan struct{}, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) {
		bindings, pending := manager.ResourceCounts()
		if bindings != 1 || pending != 0 {
			t.Errorf("before cleanup resources = bindings=%d pending=%d", bindings, pending)
		}
		manager.Close()
		bindings, pending = manager.ResourceCounts()
		if bindings != 0 || pending != 0 {
			t.Errorf("after cleanup resources = bindings=%d pending=%d", bindings, pending)
		}
		closed <- struct{}{}
	}) {
		t.Fatal("event loop was terminated before cleanup")
	}
	<-closed
	if backend.Active() != 0 || backend.UnregisterCount() != 1 {
		t.Fatalf("native shortcut handles after cleanup: active=%d unregister=%d", backend.Active(), backend.UnregisterCount())
	}
}

func TestGlobalShortcutReportsThrownAndRejectedCallbacks(t *testing.T) {
	for _, script := range []string{
		`globalShortcut.register("CommandOrControl+Shift+8", () => { throw new Error("shortcut throw"); });`,
		`globalShortcut.register("CommandOrControl+Shift+8", async () => { throw new Error("shortcut reject"); });`,
	} {
		t.Run(script, func(t *testing.T) {
			backend := newMemoryGlobalShortcutBackend()
			loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
			loop.Start()
			defer loop.Terminate()
			errorsSeen := make(chan error, 1)
			ready := make(chan *GlobalShortcutRuntime, 1)
			if !loop.RunOnLoop(func(runtime *goja.Runtime) {
				manager := newGlobalShortcutRuntime(runtime, loop, func(err error) { errorsSeen <- err }, func() GlobalShortcutBackend { return backend })
				object := runtime.NewObject()
				_ = object.Set("register", func(call goja.FunctionCall) goja.Value { return manager.register(call) })
				_ = runtime.Set("globalShortcut", object)
				if _, err := runtime.RunString(script); err != nil {
					t.Errorf("registration script: %v", err)
				}
				ready <- manager
			}) {
				t.Fatal("event loop was terminated before setup")
			}
			manager := <-ready
			backend.TriggerAll()
			select {
			case err := <-errorsSeen:
				var shortcutErr *GlobalShortcutError
				if !errors.As(err, &shortcutErr) || shortcutErr.Code != globalShortcutCallbackFailed {
					t.Fatalf("callback error = %#v, want CALLBACK_FAILED", err)
				}
			case <-time.After(time.Second):
				t.Fatal("callback failure was not reported through Runtime async error path")
			}
			done := make(chan struct{}, 1)
			loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); done <- struct{}{} })
			<-done
		})
	}
}

func TestGlobalShortcutConcurrentNativeTriggerAndCloseLeavesNoPendingEvent(t *testing.T) {
	backend := newMemoryGlobalShortcutBackend()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	ready := make(chan *GlobalShortcutRuntime, 1)
	if !loop.RunOnLoop(func(runtime *goja.Runtime) {
		manager := newGlobalShortcutRuntime(runtime, loop, nil, func() GlobalShortcutBackend { return backend })
		object := runtime.NewObject()
		_ = object.Set("register", func(call goja.FunctionCall) goja.Value { return manager.register(call) })
		_ = runtime.Set("globalShortcut", object)
		if _, err := runtime.RunString(`globalShortcut.register("CommandOrControl+Shift+9", () => {});`); err != nil {
			t.Errorf("registration script: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop was terminated before setup")
	}
	manager := <-ready

	triggerDone := make(chan struct{})
	go func() {
		defer close(triggerDone)
		for i := 0; i < 1000; i++ {
			backend.TriggerAll()
		}
	}()
	closed := make(chan struct{})
	if !loop.RunOnLoop(func(*goja.Runtime) {
		manager.Close()
		closed <- struct{}{}
	}) {
		t.Fatal("event loop was terminated before cleanup")
	}
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("concurrent close did not finish")
	}
	<-triggerDone
	countsReady := make(chan struct{})
	if !loop.RunOnLoop(func(*goja.Runtime) {
		bindings, pending := manager.ResourceCounts()
		if bindings != 0 || pending != 0 {
			t.Errorf("resources after concurrent close = bindings=%d pending=%d", bindings, pending)
		}
		countsReady <- struct{}{}
	}) {
		t.Fatal("event loop was terminated before resource check")
	}
	<-countsReady
}

func shortcutValue(t *testing.T, loop *eventloop.EventLoop) int64 {
	t.Helper()
	result := make(chan int64, 1)
	if !loop.RunOnLoop(func(runtime *goja.Runtime) { result <- runtime.Get("shortcutCalls").ToInteger() }) {
		t.Fatal("event loop was terminated before reading callback state")
	}
	select {
	case value := <-result:
		return value
	case <-time.After(time.Second):
		t.Fatal("timed out reading shortcut callback state")
		return 0
	}
}

type memoryGlobalShortcutBackend struct {
	mu          sync.Mutex
	callbacks   map[string]func()
	unregisters int
	closed      bool
}

func newMemoryGlobalShortcutBackend() *memoryGlobalShortcutBackend {
	return &memoryGlobalShortcutBackend{callbacks: map[string]func(){}}
}

func (b *memoryGlobalShortcutBackend) Register(accelerator GlobalShortcutPlatformAccelerator, callback func()) (GlobalShortcutBackendHandle, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, errGlobalShortcutPlatformUnsupported
	}
	if _, exists := b.callbacks[accelerator.Canonical]; exists {
		return nil, errShortcutBackendAlreadyRegistered
	}
	b.callbacks[accelerator.Canonical] = callback
	return &memoryGlobalShortcutHandle{backend: b, key: accelerator.Canonical}, nil
}

func (b *memoryGlobalShortcutBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	b.mu.Unlock()
	return nil
}

func (b *memoryGlobalShortcutBackend) TriggerAll() {
	b.mu.Lock()
	callbacks := make([]func(), 0, len(b.callbacks))
	for _, callback := range b.callbacks {
		callbacks = append(callbacks, callback)
	}
	b.mu.Unlock()
	for _, callback := range callbacks {
		callback()
	}
}

func (b *memoryGlobalShortcutBackend) Active() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.callbacks)
}

func (b *memoryGlobalShortcutBackend) UnregisterCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.unregisters
}

type memoryGlobalShortcutHandle struct {
	backend *memoryGlobalShortcutBackend
	key     string
	once    sync.Once
}

func (h *memoryGlobalShortcutHandle) Unregister() error {
	if h == nil || h.backend == nil {
		return nil
	}
	h.once.Do(func() {
		h.backend.mu.Lock()
		delete(h.backend.callbacks, h.key)
		h.backend.unregisters++
		h.backend.mu.Unlock()
	})
	return nil
}
