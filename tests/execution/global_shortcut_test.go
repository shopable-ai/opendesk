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

func TestRunJavaScriptGlobalShortcutLifecycle(t *testing.T) {
	t.Run("normal unregister", func(t *testing.T) {
		backend := newExecutionShortcutBackend()
		err := runExecutionShortcutScript(t, backend, `
            globalShortcut.register("CommandOrControl+Shift+9", () => {});
            if (!globalShortcut.isRegistered("CmdOrCtrl+Shift+9")) throw new Error("shortcut was not registered");
            globalShortcut.unregisterAll();
            if (globalShortcut.isRegistered("CommandOrControl+Shift+9")) throw new Error("shortcut was not removed");
        `, nil)
		if err != nil {
			t.Fatal(err)
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("native registrations after normal completion = %d", active)
		}
	})

	t.Run("timeout cleanup", func(t *testing.T) {
		backend := newExecutionShortcutBackend()
		err := runExecutionShortcutScript(t, backend, `
            globalShortcut.register("CommandOrControl+Shift+9", () => {});
        `, func(request *execution.Request) { request.Timeout = 80 * time.Millisecond })
		if err == nil {
			t.Fatal("registered shortcut execution unexpectedly completed without timeout")
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("native registrations after timeout = %d", active)
		}
	})

	t.Run("context cancellation cleanup", func(t *testing.T) {
		backend := newExecutionShortcutBackend()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		done := make(chan error, 1)
		go func() {
			done <- runExecutionShortcutScript(t, backend, `
                globalShortcut.register("CommandOrControl+Shift+9", () => {});
            `, func(request *execution.Request) { request.Context = ctx })
		}()
		select {
		case <-backend.Registered():
			cancel()
		case <-time.After(time.Second):
			t.Fatal("shortcut did not reach native registration before cancellation")
		}
		if err := <-done; err == nil {
			t.Fatal("canceled shortcut execution unexpectedly succeeded")
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("native registrations after cancellation = %d", active)
		}
	})

	t.Run("script error cleanup", func(t *testing.T) {
		backend := newExecutionShortcutBackend()
		err := runExecutionShortcutScript(t, backend, `
            globalShortcut.register("CommandOrControl+Shift+9", () => {});
            throw new Error("shortcut lifecycle failure");
        `, nil)
		if err == nil {
			t.Fatal("throw after registration unexpectedly succeeded")
		}
		if active := backend.Active(); active != 0 {
			t.Fatalf("native registrations after script error = %d", active)
		}
	})
}

func TestRunJavaScriptGlobalShortcutCallbackFailureCleansUp(t *testing.T) {
	backend := newExecutionShortcutBackend()
	done := make(chan error, 1)
	go func() {
		done <- runExecutionShortcutScript(t, backend, `
            globalShortcut.register("CommandOrControl+Shift+9", async () => {
                throw new Error("shortcut callback rejection");
            });
        `, func(request *execution.Request) { request.Timeout = time.Second })
	}()
	select {
	case <-backend.Registered():
		backend.TriggerAll()
	case <-time.After(time.Second):
		t.Fatal("shortcut did not reach native registration")
	}
	if err := <-done; err == nil {
		t.Fatal("rejected shortcut callback unexpectedly succeeded")
	}
	if active := backend.Active(); active != 0 {
		t.Fatalf("native registrations after callback failure = %d", active)
	}
}

func runExecutionShortcutScript(t *testing.T, backend *executionShortcutBackend, script string, configure func(*execution.Request)) error {
	t.Helper()
	artifacts, err := execution.PrepareArtifacts(t.TempDir(), execution.NewExecutionID("global-shortcut"), ".js")
	if err != nil {
		return err
	}
	request := execution.Request{
		ExecutionID:                  artifacts.ExecutionID,
		SourceLabel:                  "global shortcut lifecycle test",
		Ext:                          ".js",
		ScriptContent:                []byte(script),
		Timeout:                      time.Second,
		Artifacts:                    artifacts,
		Selection:                    execution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		GlobalShortcutBackendFactory: func() automation.GlobalShortcutBackend { return backend },
	}
	if configure != nil {
		configure(&request)
	}
	_, _, err = execution.Run(request)
	return err
}

type executionShortcutBackend struct {
	mu           sync.Mutex
	callbacks    map[string]func()
	registered   chan struct{}
	registerOnce sync.Once
	closed       bool
}

func newExecutionShortcutBackend() *executionShortcutBackend {
	return &executionShortcutBackend{callbacks: map[string]func(){}, registered: make(chan struct{})}
}

func (b *executionShortcutBackend) Register(accelerator automation.GlobalShortcutPlatformAccelerator, callback func()) (automation.GlobalShortcutBackendHandle, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return nil, errors.New("backend is closed")
	}
	if _, exists := b.callbacks[accelerator.Canonical]; exists {
		return nil, errors.New("shortcut already registered")
	}
	b.callbacks[accelerator.Canonical] = callback
	b.registerOnce.Do(func() { close(b.registered) })
	return &executionShortcutHandle{backend: b, key: accelerator.Canonical}, nil
}

func (b *executionShortcutBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	b.mu.Unlock()
	return nil
}

func (b *executionShortcutBackend) Registered() <-chan struct{} { return b.registered }

func (b *executionShortcutBackend) TriggerAll() {
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

func (b *executionShortcutBackend) Active() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.callbacks)
}

type executionShortcutHandle struct {
	backend *executionShortcutBackend
	key     string
	once    sync.Once
}

func (h *executionShortcutHandle) Unregister() error {
	if h == nil || h.backend == nil {
		return nil
	}
	h.once.Do(func() {
		h.backend.mu.Lock()
		delete(h.backend.callbacks, h.key)
		h.backend.mu.Unlock()
	})
	return nil
}
