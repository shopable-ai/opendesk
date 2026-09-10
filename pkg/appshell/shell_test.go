package appshell

import (
	"context"
	"errors"
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

func TestShellStateAndRepeatedQuit(t *testing.T) {
	shell, native := shellFixture(t)
	if got := shell.State(); got != StateRunning {
		t.Fatalf("state=%s", got)
	}
	var quitCount int
	shell.SetQuitHook(func() { quitCount++ })
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if got := shell.State(); got != StateStopped {
		t.Fatalf("state=%s", got)
	}
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
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
