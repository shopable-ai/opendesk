package customui

import (
	"context"
	"errors"
	"math"
	"strings"
	"sync"
	"testing"
	"time"
)

// This seam controls the otherwise inaccessible session-close/create lock
// handoff. Public FloatingWindow cancellation assertions live in Runtime JS.
type closingDuringCreateDriver struct {
	*MemoryDriver
	stateEntered, stateRelease, cleanupEntered chan struct{}
	mu                                         sync.Mutex
	closeAttempts                              int
}

func (d *closingDuringCreateDriver) Create(ctx context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	w, err := d.MemoryDriver.Create(ctx, sessionID, spec, sink)
	return &closingDuringCreateWindow{DriverWindow: w, owner: d}, err
}

type closingDuringCreateWindow struct {
	DriverWindow
	owner *closingDuringCreateDriver
}

func (w *closingDuringCreateWindow) State(ctx context.Context) (WindowState, error) {
	close(w.owner.stateEntered)
	<-w.owner.stateRelease
	return w.DriverWindow.State(ctx)
}

func (w *closingDuringCreateWindow) Close(ctx context.Context) (WindowState, error) {
	w.owner.mu.Lock()
	w.owner.closeAttempts++
	first := w.owner.closeAttempts == 1
	w.owner.mu.Unlock()
	if first {
		close(w.owner.cleanupEntered)
		<-ctx.Done()
		return WindowState{}, ctx.Err()
	}
	return w.DriverWindow.Close(ctx)
}

func TestSessionCloseDuringCreateBoundsCleanupAndRetainsOwner(t *testing.T) {
	driver := &closingDuringCreateDriver{MemoryDriver: NewMemoryDriver(), stateEntered: make(chan struct{}),
		stateRelease: make(chan struct{}), cleanupEntered: make(chan struct{})}
	session, err := NewSession("closing-create", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	type created struct {
		window *Window
		err    error
	}
	creation := make(chan created, 1)
	go func() {
		w, err := session.Create(context.Background(), testWindowSpec("panel"))
		creation <- created{w, err}
	}()
	<-driver.stateEntered
	closing := make(chan error, 1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() { closing <- session.Close(ctx) }()
	for {
		session.mu.RLock()
		closed := session.closed
		session.mu.RUnlock()
		if closed {
			break
		}
		select {
		case <-ctx.Done():
			t.Fatal("session Close did not begin")
		case <-time.After(time.Millisecond):
		}
	}
	close(driver.stateRelease)
	<-driver.cleanupEntered
	window, exists := session.Window("panel")
	if !exists || window.Status() == StatusClosed || session.WindowCount() != 1 || driver.ResourceCounts().Sinks != 1 {
		t.Fatal("in-flight cleanup lost live resource ownership")
	}
	select {
	case result := <-creation:
		if result.window != window || !errors.Is(result.err, context.DeadlineExceeded) ||
			!strings.Contains(result.err.Error(), "session closed during window creation") ||
			!strings.Contains(result.err.Error(), "creation cleanup failed") {
			t.Fatalf("Create result lost owner or errors: window=%p, err=%v", result.window, result.err)
		}
	case <-ctx.Done():
		t.Fatal("Create cleanup blocked session Close")
	}
	select {
	case err := <-closing:
		if err != nil {
			t.Fatal(err)
		}
	case <-ctx.Done():
		t.Fatal("session Close could not retry native cleanup")
	}
	if driver.ResourceCounts().Sinks != 0 || session.WindowCount() != 0 || window.Status() != StatusClosed {
		t.Fatal("session Close returned with a native resource")
	}
}

func testWindowSpec(id string) WindowSpec {
	return WindowSpec{
		ID: id, Bounds: Bounds{X: 10, Y: 20, Width: 320, Height: 180},
		Content: ContentSpec{HTML: `<button id="save">Save</button><span id="status">Idle</span>`},
	}
}

func TestWindowSetBoundsRejectsNonFiniteValuesBeforeDriver(t *testing.T) {
	driver := NewMemoryDriver()
	session, err := NewSession("finite-bounds", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = window.SetBounds(context.Background(), Bounds{X: math.NaN(), Y: 20, Width: 320, Height: 180})
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Operation != "setBounds" || uiErr.WindowID != "panel" {
		t.Fatalf("non-finite bounds error = %#v", err)
	}
}

func TestSessionWindowStateMachineAndControlUpdates(t *testing.T) {
	driver := NewMemoryDriver()
	events := make(chan Event, 4)
	session, err := NewSession("test-session", t.TempDir(), driver, func(event Event) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	if window.Status() != StatusHidden {
		t.Fatalf("initial status = %s", window.Status())
	}
	state, err := window.Show(context.Background())
	if err != nil || state.Status != StatusVisible || !state.Visible {
		t.Fatalf("show state = %#v, err = %v", state, err)
	}
	state, err = window.SetBounds(context.Background(), Bounds{X: 40, Y: 50, Width: 640, Height: 240})
	if err != nil || state.Bounds.X != 40 || state.Bounds.Width != 640 {
		t.Fatalf("setBounds state = %#v, err = %v", state, err)
	}
	text := "Saved"
	control, err := window.UpdateControl(context.Background(), "status", ControlPatch{Text: &text})
	if err != nil || control.Text != text {
		t.Fatalf("control state = %#v, err = %v", control, err)
	}
	if err := driver.Emit(session.ID(), window.ID(), "save", "click", nil); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-events:
		if event.TargetID != "save" || event.Sequence == 0 {
			t.Fatalf("event = %#v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("event was not delivered")
	}
	closed, err := window.Close(context.Background())
	if err != nil || closed.Status != StatusClosed {
		t.Fatalf("close state = %#v, err = %v", closed, err)
	}
	select {
	case <-window.WaitClosed():
	default:
		t.Fatal("wait-closed channel was not closed")
	}
	if _, err := window.Show(context.Background()); err == nil {
		t.Fatal("show after close unexpectedly succeeded")
	}
}

func TestSessionRejectsDuplicateWindowAndUnknownControl(t *testing.T) {
	session, err := NewSession("test-session", t.TempDir(), NewMemoryDriver(), nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = session.Create(context.Background(), testWindowSpec("panel"))
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDuplicateID {
		t.Fatalf("duplicate error = %#v", err)
	}
	_, err = window.ControlState(context.Background(), "missing")
	if !errors.As(err, &uiErr) || uiErr.Code != CodeNotFound {
		t.Fatalf("unknown control error = %#v", err)
	}
}

func TestSessionCloseIsIdempotentAndClosesEveryWindow(t *testing.T) {
	session, err := NewSession("test-session", t.TempDir(), NewMemoryDriver(), nil)
	if err != nil {
		t.Fatal(err)
	}
	first, err := session.Create(context.Background(), testWindowSpec("first"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := session.Create(context.Background(), testWindowSpec("second"))
	if err != nil {
		t.Fatal(err)
	}
	if err := session.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := session.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if first.Status() != StatusClosed || second.Status() != StatusClosed || session.WindowCount() != 0 {
		t.Fatalf("not all windows closed: first=%s second=%s count=%d", first.Status(), second.Status(), session.WindowCount())
	}
	_, err = session.Create(context.Background(), testWindowSpec("later"))
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidState {
		t.Fatalf("create after close error = %#v", err)
	}
}
