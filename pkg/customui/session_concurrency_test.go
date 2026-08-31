package customui

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type blockingCreateDriver struct {
	base    *MemoryDriver
	started chan struct{}
	release chan struct{}
	once    sync.Once
}

func (d *blockingCreateDriver) Capabilities(ctx context.Context) Capabilities {
	return d.base.Capabilities(ctx)
}

func (d *blockingCreateDriver) Create(ctx context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	d.once.Do(func() { close(d.started) })
	select {
	case <-d.release:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return d.base.Create(ctx, sessionID, spec, sink)
}

func (d *blockingCreateDriver) CloseSession(ctx context.Context, sessionID string) error {
	return d.base.CloseSession(ctx, sessionID)
}

func (d *blockingCreateDriver) Close() error { return d.base.Close() }

func TestSessionReservesWindowIDDuringConcurrentCreate(t *testing.T) {
	driver := &blockingCreateDriver{base: NewMemoryDriver(), started: make(chan struct{}), release: make(chan struct{})}
	session, err := NewSession("concurrent-create", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	firstDone := make(chan error, 1)
	go func() {
		_, createErr := session.Create(context.Background(), testWindowSpec("panel"))
		firstDone <- createErr
	}()
	select {
	case <-driver.started:
	case <-time.After(time.Second):
		t.Fatal("first create did not reach driver")
	}
	_, err = session.Create(context.Background(), testWindowSpec("panel"))
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDuplicateID {
		t.Fatalf("concurrent duplicate error = %#v", err)
	}
	close(driver.release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first create failed: %v", err)
	}
}

type lifecycleDriver struct {
	base        *MemoryDriver
	showStarted chan struct{}
	releaseShow chan struct{}
	showOnce    sync.Once
	failClose   atomic.Bool
}

func (d *lifecycleDriver) Capabilities(ctx context.Context) Capabilities {
	return d.base.Capabilities(ctx)
}

func (d *lifecycleDriver) Create(ctx context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	window, err := d.base.Create(ctx, sessionID, spec, sink)
	if err != nil {
		return nil, err
	}
	return &lifecycleWindow{DriverWindow: window, owner: d}, nil
}

func (d *lifecycleDriver) CloseSession(ctx context.Context, sessionID string) error {
	return d.base.CloseSession(ctx, sessionID)
}

func (d *lifecycleDriver) Close() error { return d.base.Close() }

type lifecycleWindow struct {
	DriverWindow
	owner *lifecycleDriver
}

func (w *lifecycleWindow) Show(ctx context.Context) (WindowState, error) {
	if w.owner.showStarted != nil {
		w.owner.showOnce.Do(func() { close(w.owner.showStarted) })
		select {
		case <-w.owner.releaseShow:
		case <-ctx.Done():
			return WindowState{}, ctx.Err()
		}
	}
	return w.DriverWindow.Show(ctx)
}

func (w *lifecycleWindow) Close(ctx context.Context) (WindowState, error) {
	if w.owner.failClose.Swap(false) {
		return WindowState{}, errors.New("injected close failure")
	}
	return w.DriverWindow.Close(ctx)
}

func TestWindowCannotReviveAfterConcurrentClose(t *testing.T) {
	driver := &lifecycleDriver{
		base: NewMemoryDriver(), showStarted: make(chan struct{}), releaseShow: make(chan struct{}),
	}
	session, err := NewSession("concurrent-close", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	showDone := make(chan error, 1)
	go func() { _, showErr := window.Show(context.Background()); showDone <- showErr }()
	select {
	case <-driver.showStarted:
	case <-time.After(time.Second):
		t.Fatal("show did not reach driver")
	}
	closeDone := make(chan error, 1)
	go func() { _, closeErr := window.Close(context.Background()); closeDone <- closeErr }()
	close(driver.releaseShow)
	if err := <-showDone; err != nil {
		t.Fatalf("show failed: %v", err)
	}
	if err := <-closeDone; err != nil {
		t.Fatalf("close failed: %v", err)
	}
	state, err := window.State(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != StatusClosed || state.Visible || state.OnScreen || state.Alpha != 0 || session.WindowCount() != 0 {
		t.Fatalf("closed window revived: %#v count=%d", state, session.WindowCount())
	}
}

func TestWindowCloseFailureIsStructuredAndRetryable(t *testing.T) {
	driver := &lifecycleDriver{base: NewMemoryDriver()}
	driver.failClose.Store(true)
	session, err := NewSession("close-retry", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = window.Close(context.Background())
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDriverFailure || uiErr.Operation != "close" || uiErr.WindowID != "panel" {
		t.Fatalf("first close error = %#v", err)
	}
	if window.Status() != StatusHidden {
		t.Fatalf("failed close left status %s", window.Status())
	}
	state, err := window.Close(context.Background())
	if err != nil || state.Status != StatusClosed {
		t.Fatalf("retry close state=%#v err=%v", state, err)
	}
}
