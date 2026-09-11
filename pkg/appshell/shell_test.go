package appshell

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sync"
	"testing"
)

type fakeNative struct {
	mu       sync.Mutex
	activate int
	updates  []string
	teardown int
}

func (f *fakeNative) Activate(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.activate++
	return nil
}
func (f *fakeNative) UpdateMenuItem(_ context.Context, id string, _ MenuItemPatch) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.updates = append(f.updates, id)
	return nil
}
func (f *fakeNative) Teardown(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.teardown++
	return nil
}

func shellFixture(t *testing.T) (*Shell, *fakeNative) {
	t.Helper()
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	native := &fakeNative{}
	shell, err := New(manifest, native)
	if err != nil {
		t.Fatal(err)
	}
	return shell, native
}

func TestShellQuitConvergesThroughLifecycleTeardown(t *testing.T) {
	shell, native := shellFixture(t)
	var quitCount int
	shell.SetQuitHook(func() { quitCount++ })
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if got := shell.State(); got != StateQuitting {
		t.Fatalf("state=%s", got)
	}
	if native.teardown != 0 || quitCount != 1 {
		t.Fatalf("before lifecycle teardown: native=%d quitHook=%d", native.teardown, quitCount)
	}
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if err := shell.Teardown(); err != nil {
		t.Fatal(err)
	}
	if err := shell.Teardown(); err != nil {
		t.Fatal(err)
	}
	if got := shell.State(); got != StateStopped {
		t.Fatalf("state=%s", got)
	}
	if native.teardown != 1 || quitCount != 1 {
		t.Fatalf("teardown=%d quitHook=%d", native.teardown, quitCount)
	}
}

func TestShellActionsAreOrderedIncludingPreBindQueue(t *testing.T) {
	shell, _ := shellFixture(t)
	for _, id := range []string{"a", "b"} {
		if err := shell.DispatchAction(id, "tray-menu"); err != nil {
			t.Fatal(err)
		}
	}
	var got []string
	if err := shell.BindActionSink(func(event ActionEvent) error {
		got = append(got, event.ID)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := shell.DispatchAction("c", "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if want := []string{"a", "b", "c"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}

func TestShellConcurrentDispatchIsSerialized(t *testing.T) {
	shell, _ := shellFixture(t)
	var mu sync.Mutex
	got := make([]string, 0, 64)
	if err := shell.BindActionSink(func(event ActionEvent) error {
		mu.Lock()
		got = append(got, event.ID)
		mu.Unlock()
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		i := i
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := shell.DispatchAction(fmt.Sprintf("item.%02d", i), "tray-menu"); err != nil {
				t.Errorf("dispatch: %v", err)
			}
		}()
	}
	wg.Wait()
	if len(got) != 64 {
		t.Fatalf("got %d actions", len(got))
	}
	seen := map[string]bool{}
	for _, id := range got {
		if seen[id] {
			t.Fatalf("duplicate action %q", id)
		}
		seen[id] = true
	}
}

func TestShellPreHandlerQueueIsBounded(t *testing.T) {
	shell, _ := shellFixture(t)
	for i := 0; i < defaultPendingActionCapacity; i++ {
		if err := shell.DispatchAction(fmt.Sprintf("queued.%03d", i), "tray-menu"); err != nil {
			t.Fatal(err)
		}
	}
	if err := shell.DispatchAction("overflow", "tray-menu"); !errors.Is(err, ErrQueueFull) {
		t.Fatalf("expected ErrQueueFull, got %v", err)
	}
}

func TestShellRejectsActionAfterShutdown(t *testing.T) {
	shell, _ := shellFixture(t)
	if !shell.BeginShutdown() {
		t.Fatal("expected shutdown transition")
	}
	if err := shell.DispatchAction("sync.now", "tray-menu"); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("expected ErrNotRunning, got %v", err)
	}
}

func TestShellMenuUpdates(t *testing.T) {
	shell, native := shellFixture(t)
	label := "Sync immediately"
	enabled := false
	visible := false
	if err := shell.UpdateMenuItem("sync.now", MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}); err != nil {
		t.Fatal(err)
	}
	state, ok := shell.MenuItemState("sync.now")
	if !ok || state.Label == nil || *state.Label != label || state.Enabled == nil || *state.Enabled || state.Visible == nil || *state.Visible {
		t.Fatalf("bad state: %+v", state)
	}
	if len(native.updates) != 1 || native.updates[0] != "sync.now" {
		t.Fatalf("updates=%v", native.updates)
	}
	if err := shell.UpdateMenuItem("missing", MenuItemPatch{Enabled: &enabled}); err == nil {
		t.Fatal("expected unknown menu error")
	}
}

func TestShellCallbackAfterTeardownRejected(t *testing.T) {
	shell, _ := shellFixture(t)
	if err := shell.Teardown(); err != nil {
		t.Fatal(err)
	}
	if err := shell.DispatchAction("late", "tray-menu"); !errors.Is(err, ErrTornDown) {
		t.Fatalf("expected ErrTornDown, got %v", err)
	}
	if err := shell.BindActionSink(func(ActionEvent) error { return nil }); !errors.Is(err, ErrTornDown) {
		t.Fatalf("expected ErrTornDown, got %v", err)
	}
}

func TestShellActivateUsesSameHostAndDispatchesOpen(t *testing.T) {
	shell, native := shellFixture(t)
	var got ActionEvent
	if err := shell.BindActionSink(func(event ActionEvent) error { got = event; return nil }); err != nil {
		t.Fatal(err)
	}
	if err := shell.Activate("single-instance"); err != nil {
		t.Fatal(err)
	}
	if native.activate != 1 || got.ID != "app.open" || got.Source != "single-instance" {
		t.Fatalf("activate=%d event=%+v", native.activate, got)
	}
}
