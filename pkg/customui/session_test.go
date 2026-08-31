package customui

import (
	"context"
	"errors"
	"testing"
	"time"
)

func testWindowSpec(id string) WindowSpec {
	return WindowSpec{
		ID: id, Bounds: Bounds{X: 10, Y: 20, Width: 320, Height: 180},
		Content: ContentSpec{HTML: `<button id="save">Save</button><span id="status">Idle</span>`},
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
