package execution_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"opendesk/automation"
	"opendesk/pkg/execution"
)

func TestRunJavaScriptDesktopEventsLifecycle(t *testing.T) {
	t.Run("once resolves and drains", func(t *testing.T) {
		backend := newExecutionDesktopEventBackend()
		done := make(chan error, 1)
		go func() {
			done <- runExecutionDesktopEventScript(t, backend, `
				const event = await Events.once("clipboard.changed", { timeout: 500 });
				if (event.type !== "clipboard.changed" || event.backend !== "execution-test") throw new Error("unexpected event");
			`, nil)
		}()
		select {
		case <-backend.Registered():
			backend.Trigger(automation.DesktopEvent{Type: automation.DesktopEventClipboardChanged, Backend: "execution-test", Data: map[string]interface{}{"changeCount": 2}})
		case <-time.After(time.Second):
			t.Fatal("desktop event subscription was not registered")
		}
		if err := <-done; err != nil {
			t.Fatal(err)
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("listeners after once completion=%d", active)
		}
	})

	t.Run("explicit unsubscribe", func(t *testing.T) {
		backend := newExecutionDesktopEventBackend()
		err := runExecutionDesktopEventScript(t, backend, `
			const sub = Events.on("display.changed", () => {});
			sub.unsubscribe();
			sub.unsubscribe();
		`, nil)
		if err != nil {
			t.Fatal(err)
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("listeners after unsubscribe=%d", active)
		}
	})

	t.Run("timeout cleanup", func(t *testing.T) {
		backend := newExecutionDesktopEventBackend()
		err := runExecutionDesktopEventScript(t, backend, `Events.on("window.focused", () => {});`, func(request *execution.Request) {
			request.Timeout = 60 * time.Millisecond
		})
		if err == nil {
			t.Fatal("execution with active subscription unexpectedly completed")
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("listeners after execution timeout=%d", active)
		}
	})

	t.Run("callback rejection", func(t *testing.T) {
		backend := newExecutionDesktopEventBackend()
		done := make(chan error, 1)
		go func() {
			done <- runExecutionDesktopEventScript(t, backend, `
				Events.on("app.launched", async () => { throw new Error("event callback failed"); });
			`, nil)
		}()
		select {
		case <-backend.Registered():
			backend.Trigger(automation.DesktopEvent{Type: automation.DesktopEventAppLaunched, Backend: "execution-test", Data: map[string]interface{}{}})
		case <-time.After(time.Second):
			t.Fatal("desktop event callback was not registered")
		}
		if err := <-done; err == nil {
			t.Fatal("rejected event callback unexpectedly succeeded")
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("listeners after callback rejection=%d", active)
		}
	})
}

func runExecutionDesktopEventScript(t *testing.T, backend *executionDesktopEventBackend, script string, configure func(*execution.Request)) error {
	t.Helper()
	artifacts, err := execution.PrepareArtifacts(t.TempDir(), execution.NewExecutionID("desktop-events"), ".js")
	if err != nil {
		return err
	}
	request := execution.Request{
		Context: context.Background(), ExecutionID: artifacts.ExecutionID,
		SourceLabel: "desktop events lifecycle test", Ext: ".js", ScriptContent: []byte(script),
		Timeout: time.Second, Artifacts: artifacts,
		Selection:                  execution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		DesktopEventBackendFactory: func() automation.DesktopEventBackend { return backend },
	}
	if configure != nil {
		configure(&request)
	}
	_, _, err = execution.Run(request)
	return err
}

type executionDesktopEventBackend struct {
	mu           sync.Mutex
	nextID       uint64
	listeners    map[uint64]executionDesktopEventListener
	registered   chan struct{}
	registerOnce sync.Once
	closed       bool
}

type executionDesktopEventListener struct {
	eventType automation.DesktopEventType
	emit      func(automation.DesktopEvent)
}

type executionDesktopEventHandle struct {
	backend *executionDesktopEventBackend
	id      uint64
	once    sync.Once
}

func newExecutionDesktopEventBackend() *executionDesktopEventBackend {
	return &executionDesktopEventBackend{listeners: map[uint64]executionDesktopEventListener{}, registered: make(chan struct{})}
}

func (b *executionDesktopEventBackend) Capabilities() map[automation.DesktopEventType]automation.DesktopEventCapability {
	result := map[automation.DesktopEventType]automation.DesktopEventCapability{}
	for _, eventType := range []automation.DesktopEventType{
		automation.DesktopEventWindowFocused, automation.DesktopEventWindowCreated, automation.DesktopEventWindowClosed,
		automation.DesktopEventWindowMoved, automation.DesktopEventWindowResized, automation.DesktopEventAppLaunched,
		automation.DesktopEventAppTerminated, automation.DesktopEventClipboardChanged, automation.DesktopEventDisplayChanged,
	} {
		result[eventType] = automation.DesktopEventCapability{Supported: true, Backend: "execution-test", Platform: "test", Verified: true}
	}
	return result
}

func (b *executionDesktopEventBackend) Subscribe(_ context.Context, eventType automation.DesktopEventType, emit func(automation.DesktopEvent), _ func(error)) (automation.DesktopEventBackendHandle, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, errors.New("execution event backend is closed")
	}
	b.nextID++
	b.listeners[b.nextID] = executionDesktopEventListener{eventType: eventType, emit: emit}
	b.registerOnce.Do(func() { close(b.registered) })
	return &executionDesktopEventHandle{backend: b, id: b.nextID}, nil
}

func (b *executionDesktopEventBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	b.listeners = map[uint64]executionDesktopEventListener{}
	b.mu.Unlock()
	return nil
}

func (b *executionDesktopEventBackend) Wait() {}

func (b *executionDesktopEventBackend) Registered() <-chan struct{} { return b.registered }

func (b *executionDesktopEventBackend) Trigger(event automation.DesktopEvent) {
	b.mu.Lock()
	callbacks := make([]func(automation.DesktopEvent), 0, len(b.listeners))
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

func (b *executionDesktopEventBackend) Active() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.listeners)
}

func (h *executionDesktopEventHandle) Unsubscribe() error {
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
