package appshell

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

type fakeNative struct {
	mu          sync.Mutex
	started     int
	handler     func(string, string)
	activate    int
	updates     []string
	teardown    int
	teardownErr error
}

type blockingStartNative struct {
	fakeNative
	entered chan struct{}
	release chan struct{}
}

func (f *blockingStartNative) Start(ctx context.Context, handler func(string, string)) error {
	close(f.entered)
	<-f.release
	return f.fakeNative.Start(ctx, handler)
}

func (f *fakeNative) Start(_ context.Context, handler func(string, string)) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.started++
	f.handler = handler
	return nil
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
	return f.teardownErr
}
func (f *fakeNative) Wait() {}

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
	if err := shell.Start(context.Background()); err != nil {
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
	if got := shell.State(); got != StateQuitting {
		t.Fatalf("state=%s", got)
	}
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if native.teardown != 0 || quitCount != 1 {
		t.Fatalf("teardown=%d quitHook=%d", native.teardown, quitCount)
	}
	shell.CancelAsync()
	if native.teardown != 1 || shell.State() != StateStopped {
		t.Fatalf("teardown=%d state=%s", native.teardown, shell.State())
	}
	if err := shell.Teardown(); err != nil {
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

func TestShellRecorderActionUsesFrameworkSinkOnly(t *testing.T) {
	shell, _ := shellFixture(t)
	var business []ActionEvent
	if err := shell.BindActionSink(func(event ActionEvent) error {
		business = append(business, event)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	var recorder []ActionEvent
	if err := shell.BindRecorderAction(func(event ActionEvent) error {
		recorder = append(recorder, event)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := shell.DispatchAction(ActionRecorder, "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if len(recorder) != 1 || recorder[0].ID != ActionRecorder || recorder[0].Source != "tray-menu" {
		t.Fatalf("recorder events=%+v", recorder)
	}
	if len(business) != 0 {
		t.Fatalf("recorder action reached business sink: %+v", business)
	}
	if err := shell.DispatchAction("sync.now", "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if len(business) != 1 || business[0].ID != "sync.now" {
		t.Fatalf("business events=%+v", business)
	}
}

func TestShellRecorderActionRejectedAfterShutdown(t *testing.T) {
	shell, _ := shellFixture(t)
	var called int
	if err := shell.BindRecorderAction(func(ActionEvent) error {
		called++
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if err := shell.DispatchAction(ActionRecorder, "tray-menu"); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("recorder during quitting error=%v", err)
	}
	if called != 0 {
		t.Fatalf("recorder callback called while quitting")
	}
	shell.CancelAsync()
	if err := shell.DispatchAction(ActionRecorder, "tray-menu"); !errors.Is(err, ErrTornDown) {
		t.Fatalf("recorder after stop error=%v", err)
	}
}

func TestShellOpenAndQuitBuiltinsStillWork(t *testing.T) {
	shell, native := shellFixture(t)
	var got []ActionEvent
	if err := shell.BindActionSink(func(event ActionEvent) error {
		got = append(got, event)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := shell.DispatchAction(ActionOpen, "tray-primary"); err != nil {
		t.Fatal(err)
	}
	native.mu.Lock()
	activate := native.activate
	native.mu.Unlock()
	if activate != 1 {
		t.Fatalf("native activate=%d", activate)
	}
	if len(got) != 1 || got[0].ID != ActionOpen || got[0].Source != "tray-primary" {
		t.Fatalf("open events=%+v", got)
	}
	var quit int
	shell.SetQuitHook(func() { quit++ })
	if err := shell.DispatchAction(ActionQuit, "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if quit != 1 || shell.State() != StateQuitting {
		t.Fatalf("quit=%d state=%s", quit, shell.State())
	}
}

func TestShellConcurrentStartInitializesNativeHostOnce(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	native := &fakeNative{}
	shell, err := New(manifest, native)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := shell.Start(context.Background()); err != nil {
				t.Errorf("start: %v", err)
			}
		}()
	}
	wg.Wait()
	native.mu.Lock()
	started := native.started
	native.mu.Unlock()
	if started != 1 {
		t.Fatalf("native start count=%d", started)
	}
}

func TestShellStartVersusShutdownTeardownNativeOnce(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	native := &blockingStartNative{entered: make(chan struct{}), release: make(chan struct{})}
	shell, err := New(manifest, native)
	if err != nil {
		t.Fatal(err)
	}
	quit := make(chan struct{})
	shell.SetQuitHook(func() { close(quit) })
	startResult := make(chan error, 1)
	go func() { startResult <- shell.Start(context.Background()) }()
	select {
	case <-native.entered:
	case <-time.After(time.Second):
		t.Fatal("native Start did not enter")
	}
	cancelDone := make(chan struct{})
	go func() {
		shell.CancelAsync()
		close(cancelDone)
	}()
	select {
	case <-quit:
	case <-time.After(time.Second):
		t.Fatal("shutdown did not transition while native Start was blocked")
	}
	close(native.release)
	select {
	case err := <-startResult:
		if !errors.Is(err, ErrNotRunning) {
			t.Fatalf("Start error=%v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("Start did not return after shutdown")
	}
	select {
	case <-cancelDone:
	case <-time.After(time.Second):
		t.Fatal("CancelAsync did not finish")
	}
	native.mu.Lock()
	started, teardown := native.started, native.teardown
	native.mu.Unlock()
	if started != 1 || teardown != 1 || shell.State() != StateStopped {
		t.Fatalf("started=%d teardown=%d state=%s", started, teardown, shell.State())
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

func TestShellPreBindActionQueueIsBounded(t *testing.T) {
	shell, _ := shellFixture(t)
	for index := 0; index < pendingEventCapacity; index++ {
		if err := shell.DispatchAction(fmt.Sprintf("queued.%03d", index), "tray-menu"); err != nil {
			t.Fatalf("enqueue %d: %v", index, err)
		}
	}
	if err := shell.DispatchAction("overflow", "tray-menu"); !errors.Is(err, ErrQueueFull) {
		t.Fatalf("overflow error=%v", err)
	}
}

func TestShellNativeQueueOverflowIsTerminalInsteadOfSilentlyDropped(t *testing.T) {
	shell, native := shellFixture(t)
	for index := 0; index <= pendingEventCapacity; index++ {
		native.handler("sync.now", "tray-menu")
	}
	if shell.State() != StateQuitting {
		t.Fatalf("state=%s", shell.State())
	}
	if !errors.Is(shell.TerminalError(), ErrQueueFull) {
		t.Fatalf("terminal error=%v", shell.TerminalError())
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
	if err := shell.UpdateMenuItem(context.Background(), "sync.now", MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}); err != nil {
		t.Fatal(err)
	}
	state, ok := shell.MenuItemState("sync.now")
	if !ok || state.Label == nil || *state.Label != label || state.Enabled == nil || *state.Enabled || state.Visible == nil || *state.Visible {
		t.Fatalf("bad state: %+v", state)
	}
	if len(native.updates) != 1 || native.updates[0] != "sync.now" {
		t.Fatalf("updates=%v", native.updates)
	}
	if err := shell.UpdateMenuItem(context.Background(), "missing", MenuItemPatch{Enabled: &enabled}); err == nil {
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

func TestShellTeardownPreservesNativeFailure(t *testing.T) {
	shell, native := shellFixture(t)
	native.teardownErr = errors.New("forced native teardown failure")
	err := shell.Teardown()
	if err == nil || !strings.Contains(err.Error(), "forced native teardown failure") {
		t.Fatalf("teardown error=%v", err)
	}
	if shell.State() != StateStopped || shell.TerminalError() == nil {
		t.Fatalf("state=%s terminal=%v", shell.State(), shell.TerminalError())
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
	if native.activate != 1 || got.ID != "opendesk.open" || got.Source != "single-instance" {
		t.Fatalf("activate=%d event=%+v", native.activate, got)
	}
}

func TestShellMapsNativeItemIDToReusableBusinessAction(t *testing.T) {
	shell, native := shellFixture(t)
	var got ActionEvent
	if err := shell.BindActionSink(func(event ActionEvent) error { got = event; return nil }); err != nil {
		t.Fatal(err)
	}
	native.handler("sync.now", "tray-menu")
	if got.ID != "sync.now" || got.Source != "tray-menu" {
		t.Fatalf("event=%+v", got)
	}
}

func TestShellActionVersusQuitHasNoCallbackAfterTransition(t *testing.T) {
	shell, _ := shellFixture(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	if err := shell.BindActionSink(func(ActionEvent) error {
		close(entered)
		<-release
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	dispatched := make(chan error, 1)
	go func() { dispatched <- shell.DispatchAction("sync.now", "tray-menu") }()
	<-entered
	quit := make(chan error, 1)
	go func() { quit <- shell.RequestQuit() }()
	select {
	case err := <-quit:
		t.Fatalf("quit passed an in-flight callback: %v", err)
	default:
	}
	close(release)
	if err := <-dispatched; err != nil {
		t.Fatal(err)
	}
	if err := <-quit; err != nil {
		t.Fatal(err)
	}
	if shell.State() != StateQuitting {
		t.Fatalf("state=%s", shell.State())
	}
	if err := shell.DispatchAction("sync.now", "tray-menu"); !errors.Is(err, ErrNotRunning) {
		t.Fatalf("late callback error=%v", err)
	}
}

type blockingActivationNative struct {
	*fakeNative
	entered chan struct{}
	release chan struct{}
}

func (native *blockingActivationNative) Activate(context.Context) error {
	close(native.entered)
	<-native.release
	return nil
}

func TestShellActivationVersusQuitRejectsLateOpen(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	native := &blockingActivationNative{
		fakeNative: &fakeNative{}, entered: make(chan struct{}), release: make(chan struct{}),
	}
	shell, err := New(manifest, native)
	if err != nil {
		t.Fatal(err)
	}
	if err := shell.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	var callbacks int
	if err := shell.BindActionSink(func(ActionEvent) error { callbacks++; return nil }); err != nil {
		t.Fatal(err)
	}
	activation := make(chan error, 1)
	go func() { activation <- shell.Activate("second-instance") }()
	<-native.entered
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	close(native.release)
	if err := <-activation; !errors.Is(err, ErrNotRunning) {
		t.Fatalf("activation error=%v", err)
	}
	if callbacks != 0 {
		t.Fatalf("activation reached callback after quit: %d", callbacks)
	}
}

func TestShellStatusOnlyItemCannotBeEnabled(t *testing.T) {
	manifestJSON := strings.Replace(validManifestJSON(),
		`{"id":"sync.pause","label":"Pause","action":"sync.pause","enabled":true,"visible":true}`,
		`{"id":"status","label":"Idle","enabled":false,"visible":true}`,
		1)
	manifest, err := ParseManifest([]byte(manifestJSON))
	if err != nil {
		t.Fatal(err)
	}
	shell, err := New(manifest, &fakeNative{})
	if err != nil {
		t.Fatal(err)
	}
	enabled := true
	if err := shell.UpdateMenuItem(context.Background(), "status", MenuItemPatch{Enabled: &enabled}); err == nil || !strings.Contains(err.Error(), "permanently disabled") {
		t.Fatalf("expected permanent disable rejection, got %v", err)
	}
}
