package automation

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

func TestDesktopPollingStateProducesNormalizedEventKinds(t *testing.T) {
	activeWindows := map[DesktopEventType]bool{
		DesktopEventWindowFocused: true, DesktopEventWindowCreated: true, DesktopEventWindowClosed: true,
		DesktopEventWindowMoved: true, DesktopEventWindowResized: true,
	}
	state := desktopPollingState{failures: map[string]bool{}}
	baseline := desktopWindowSnapshot{
		Focused: "a",
		Windows: map[string]desktopWindowState{
			"a": {Key: "a", PID: 10, Title: "A", X: 0, Y: 0, Width: 100, Height: 100},
			"c": {Key: "c", PID: 30, Title: "C", X: 2, Y: 2, Width: 50, Height: 50},
		},
	}
	if events := state.updateWindows(baseline, activeWindows); len(events) != 0 {
		t.Fatalf("baseline emitted events: %#v", events)
	}
	next := desktopWindowSnapshot{
		Focused: "b",
		Windows: map[string]desktopWindowState{
			"a": {Key: "a", PID: 10, Title: "A", X: -20, Y: 10, Width: 120, Height: 110},
			"b": {Key: "b", PID: 20, Title: "B", X: 200, Y: 100, Width: 80, Height: 60, HasFocus: true},
		},
	}
	events := state.updateWindows(next, activeWindows)
	counts := map[DesktopEventType]int{}
	for _, event := range events {
		counts[event.Type]++
	}
	for _, eventType := range []DesktopEventType{
		DesktopEventWindowFocused, DesktopEventWindowCreated, DesktopEventWindowClosed,
		DesktopEventWindowMoved, DesktopEventWindowResized,
	} {
		if counts[eventType] != 1 {
			t.Fatalf("event %s count=%d, all=%#v", eventType, counts[eventType], events)
		}
	}

	apps := desktopPollingState{failures: map[string]bool{}}
	activeApps := map[DesktopEventType]bool{DesktopEventAppLaunched: true, DesktopEventAppTerminated: true}
	apps.updateApplications([]desktopApplicationState{{PID: 1, Name: "First"}}, activeApps)
	appEvents := apps.updateApplications([]desktopApplicationState{{PID: 2, Name: "Second"}}, activeApps)
	if len(appEvents) != 2 || appEvents[0].Type != DesktopEventAppLaunched || appEvents[1].Type != DesktopEventAppTerminated {
		t.Fatalf("application diff events=%#v", appEvents)
	}

	clipboard := desktopPollingState{failures: map[string]bool{}}
	activeClipboard := map[DesktopEventType]bool{DesktopEventClipboardChanged: true}
	clipboard.updateClipboard(desktopClipboardRevision{Revision: "1", ChangeCount: 1}, activeClipboard)
	clipboardEvents := clipboard.updateClipboard(desktopClipboardRevision{Revision: "2", ChangeCount: 2}, activeClipboard)
	if len(clipboardEvents) != 1 || clipboardEvents[0].Data["contentIncluded"] != false || clipboardEvents[0].Data["changeCount"] != int64(2) {
		t.Fatalf("clipboard event=%#v", clipboardEvents)
	}

	displays := desktopPollingState{failures: map[string]bool{}}
	activeDisplays := map[DesktopEventType]bool{DesktopEventDisplayChanged: true}
	displays.updateDisplays(desktopDisplaySnapshot{Signature: "one"}, activeDisplays)
	displayEvents := displays.updateDisplays(desktopDisplaySnapshot{Signature: "two", Displays: []map[string]interface{}{{"id": "display-2"}}}, activeDisplays)
	if len(displayEvents) != 1 || displayEvents[0].Type != DesktopEventDisplayChanged {
		t.Fatalf("display events=%#v", displayEvents)
	}
}

func TestDesktopEventsJSBindingCoalescesAndCleansUp(t *testing.T) {
	backend := newMemoryDesktopEventBackend()
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()

	ready := make(chan *DesktopEventsRuntime, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		manager := registerDesktopEvents(runtimeValue, InitJSOptions{
			EventLoop:                  loop,
			DesktopEventBackendFactory: func() DesktopEventBackend { return backend },
		})
		if _, err := runtimeValue.RunString(`
			globalThis.desktopEventCalls = 0;
			globalThis.desktopEventReleases = [];
			globalThis.desktopEventSubscription = Events.on("clipboard.changed", async event => {
				if (event.backend !== "memory") throw new Error("unexpected backend " + event.backend);
				desktopEventCalls += 1;
				await new Promise(resolve => desktopEventReleases.push(resolve));
			});
		`); err != nil {
			t.Errorf("register event callback: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop stopped before setup")
	}
	manager := <-ready

	backend.Trigger(DesktopEvent{Type: DesktopEventClipboardChanged, Backend: "memory", Data: map[string]interface{}{"changeCount": 0}})
	waitForDesktopEventValue(t, loop, "desktopEventCalls", 1)
	for index := 1; index <= 100; index++ {
		backend.Trigger(DesktopEvent{Type: DesktopEventClipboardChanged, Backend: "memory", Data: map[string]interface{}{"changeCount": index}})
	}
	if calls := desktopEventValue(t, loop, "desktopEventCalls"); calls != 1 {
		t.Fatalf("event storm ran callback concurrently: count=%d, want 1", calls)
	}
	desktopEventEval(t, loop, `desktopEventReleases.shift()();`)
	waitForDesktopEventValue(t, loop, "desktopEventCalls", 2)
	desktopEventEval(t, loop, `desktopEventReleases.shift()();`)
	backend.Trigger(DesktopEvent{Type: DesktopEventClipboardChanged, Backend: "memory", Data: map[string]interface{}{"changeCount": 101}})
	waitForDesktopEventValue(t, loop, "desktopEventCalls", 3)
	desktopEventEval(t, loop, `desktopEventReleases.shift()();`)

	done := make(chan struct{}, 1)
	loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		if _, err := runtimeValue.RunString(`desktopEventSubscription.unsubscribe(); desktopEventSubscription.unsubscribe();`); err != nil {
			t.Errorf("unsubscribe: %v", err)
		}
		subscriptions, pending := manager.ResourceCounts()
		if subscriptions != 0 || pending != 0 {
			t.Errorf("resources after unsubscribe=%d/%d", subscriptions, pending)
		}
		manager.Close()
		done <- struct{}{}
	})
	<-done
	manager.Wait()
	if backend.Active() != 0 {
		t.Fatalf("memory backend active listeners=%d", backend.Active())
	}
}

func TestDesktopEventsOnceTimeoutAndCallbackFailure(t *testing.T) {
	t.Run("once timeout", func(t *testing.T) {
		backend := newMemoryDesktopEventBackend()
		loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
		loop.Start()
		defer loop.Terminate()
		ready := make(chan *DesktopEventsRuntime, 1)
		loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
			manager := registerDesktopEvents(runtimeValue, InitJSOptions{EventLoop: loop, DesktopEventBackendFactory: func() DesktopEventBackend { return backend }})
			if _, err := runtimeValue.RunString(`
				globalThis.onceCode = "pending";
				Events.once("display.changed", { timeout: 25 }).then(
					() => { onceCode = "resolved"; },
					error => { onceCode = error.code; }
				);
			`); err != nil {
				t.Errorf("once script: %v", err)
			}
			ready <- manager
		})
		manager := <-ready
		deadline := time.Now().Add(time.Second)
		for desktopEventStringValue(t, loop, "onceCode") == "pending" && time.Now().Before(deadline) {
			time.Sleep(time.Millisecond)
		}
		if code := desktopEventStringValue(t, loop, "onceCode"); code != string(DesktopEventsTimeout) {
			t.Fatalf("once rejection code=%q", code)
		}
		closed := make(chan struct{}, 1)
		loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); closed <- struct{}{} })
		<-closed
		manager.Wait()
	})

	t.Run("callback rejection", func(t *testing.T) {
		backend := newMemoryDesktopEventBackend()
		loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
		loop.Start()
		defer loop.Terminate()
		errorsSeen := make(chan error, 1)
		ready := make(chan *DesktopEventsRuntime, 1)
		loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
			manager := registerDesktopEvents(runtimeValue, InitJSOptions{
				EventLoop: loop, OnAsyncError: func(err error) { errorsSeen <- err },
				DesktopEventBackendFactory: func() DesktopEventBackend { return backend },
			})
			if _, err := runtimeValue.RunString(`Events.on("app.launched", async () => { throw new Error("event callback rejection"); });`); err != nil {
				t.Errorf("callback script: %v", err)
			}
			ready <- manager
		})
		manager := <-ready
		backend.Trigger(DesktopEvent{Type: DesktopEventAppLaunched, Backend: "memory", Data: map[string]interface{}{}})
		select {
		case err := <-errorsSeen:
			var eventErr *DesktopEventsError
			if !errors.As(err, &eventErr) || eventErr.Code != DesktopEventsCallbackFailed {
				t.Fatalf("callback error=%#v", err)
			}
		case <-time.After(time.Second):
			t.Fatal("callback rejection was not reported")
		}
		closed := make(chan struct{}, 1)
		loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); closed <- struct{}{} })
		<-closed
		manager.Wait()
	})
}

func desktopEventValue(t *testing.T, loop *eventloop.EventLoop, name string) int64 {
	t.Helper()
	result := make(chan int64, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).ToInteger() }) {
		t.Fatal("event loop stopped before value read")
	}
	return <-result
}

func desktopEventStringValue(t *testing.T, loop *eventloop.EventLoop, name string) string {
	t.Helper()
	result := make(chan string, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).String() }) {
		t.Fatal("event loop stopped before string read")
	}
	return <-result
}

func desktopEventEval(t *testing.T, loop *eventloop.EventLoop, source string) {
	t.Helper()
	done := make(chan error, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		_, err := runtimeValue.RunString(source)
		done <- err
	}) {
		t.Fatal("event loop stopped before evaluation")
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func waitForDesktopEventValue(t *testing.T, loop *eventloop.EventLoop, name string, want int64) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if desktopEventValue(t, loop, name) == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s did not reach %d (got %d)", name, want, desktopEventValue(t, loop, name))
}

type memoryDesktopEventBackend struct {
	mu        sync.Mutex
	nextID    uint64
	listeners map[uint64]memoryDesktopEventListener
	closed    bool
}

type memoryDesktopEventListener struct {
	eventType DesktopEventType
	emit      func(DesktopEvent)
	fail      func(error)
}

type memoryDesktopEventHandle struct {
	backend *memoryDesktopEventBackend
	id      uint64
	once    sync.Once
}

func newMemoryDesktopEventBackend() *memoryDesktopEventBackend {
	return &memoryDesktopEventBackend{listeners: map[uint64]memoryDesktopEventListener{}}
}

func (b *memoryDesktopEventBackend) Capabilities() map[DesktopEventType]DesktopEventCapability {
	result := map[DesktopEventType]DesktopEventCapability{}
	for _, eventType := range supportedDesktopEventTypes {
		result[eventType] = DesktopEventCapability{Supported: true, Backend: "memory", Platform: "test", Verified: true}
	}
	return result
}

func (b *memoryDesktopEventBackend) Subscribe(_ context.Context, eventType DesktopEventType, emit func(DesktopEvent), fail func(error)) (DesktopEventBackendHandle, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, errors.New("memory backend closed")
	}
	b.nextID++
	b.listeners[b.nextID] = memoryDesktopEventListener{eventType: eventType, emit: emit, fail: fail}
	return &memoryDesktopEventHandle{backend: b, id: b.nextID}, nil
}

func (b *memoryDesktopEventBackend) Trigger(event DesktopEvent) {
	b.mu.Lock()
	callbacks := make([]func(DesktopEvent), 0, len(b.listeners))
	for _, listener := range b.listeners {
		if listener.eventType == event.Type {
			callbacks = append(callbacks, listener.emit)
		}
	}
	b.mu.Unlock()
	for _, callback := range callbacks {
		callback(event)
	}
}

func (b *memoryDesktopEventBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	b.listeners = map[uint64]memoryDesktopEventListener{}
	b.mu.Unlock()
	return nil
}

func (b *memoryDesktopEventBackend) Wait() {}

func (b *memoryDesktopEventBackend) Active() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.listeners)
}

func (h *memoryDesktopEventHandle) Unsubscribe() error {
	if h == nil || h.backend == nil {
		return nil
	}
	h.once.Do(func() {
		h.backend.mu.Lock()
		delete(h.backend.listeners, h.id)
		h.backend.mu.Unlock()
	})
	return nil
}
