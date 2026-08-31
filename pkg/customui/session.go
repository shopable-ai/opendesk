package customui

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

type Session struct {
	id      string
	driver  Driver
	baseDir string
	onEvent func(Event)

	mu      sync.RWMutex
	windows map[string]*Window
	closed  bool
}

func NewSession(id, baseDir string, driver Driver, onEvent func(Event)) (*Session, error) {
	if id == "" {
		return nil, fmt.Errorf("custom UI session id is required")
	}
	if driver == nil {
		return nil, fmt.Errorf("custom UI driver is required")
	}
	return &Session{id: id, driver: driver, baseDir: baseDir, onEvent: onEvent, windows: map[string]*Window{}}, nil
}

func (s *Session) ID() string { return s.id }

func (s *Session) Create(ctx context.Context, declaration WindowSpec) (*Window, error) {
	spec, err := Normalize(declaration, s.baseDir)
	if err != nil {
		return nil, withUIErrorContext(err, "createWindow", strings.TrimSpace(declaration.ID), "")
	}
	window := &Window{session: s, spec: spec, status: StatusCreating, closed: make(chan struct{})}
	window.operation.Lock()
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		window.operation.Unlock()
		return nil, &Error{Code: CodeInvalidState, Operation: "createWindow", WindowID: spec.ID, Message: "custom UI session is closed"}
	}
	if _, exists := s.windows[spec.ID]; exists {
		s.mu.Unlock()
		window.operation.Unlock()
		return nil, &Error{Code: CodeDuplicateID, Operation: "createWindow", WindowID: spec.ID, Message: "window id already exists"}
	}
	s.windows[spec.ID] = window
	s.mu.Unlock()

	driverWindow, err := s.driver.Create(ctx, s.id, spec, window.handleEvent)
	if err != nil {
		window.markFailed()
		s.removeFailedWindow(spec.ID, window)
		window.operation.Unlock()
		return nil, withUIErrorContext(wrapDriver("createWindow", spec.ID, err), "createWindow", spec.ID, "")
	}
	window.driver = driverWindow
	state, err := driverWindow.State(ctx)
	if err != nil {
		_, _ = driverWindow.Close(context.Background())
		window.markFailed()
		s.removeFailedWindow(spec.ID, window)
		window.operation.Unlock()
		return nil, withUIErrorContext(wrapDriver("getState", spec.ID, err), "getState", spec.ID, "")
	}
	window.setState(state)
	window.operation.Unlock()

	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		_, _ = window.Close(context.Background())
		return nil, &Error{Code: CodeCanceled, Operation: "createWindow", WindowID: spec.ID, Message: "custom UI session closed during window creation"}
	}
	s.mu.RUnlock()
	return window, nil
}

func (s *Session) removeFailedWindow(id string, window *Window) {
	s.mu.Lock()
	if s.windows[id] == window {
		delete(s.windows, id)
	}
	s.mu.Unlock()
}

func (s *Session) Window(id string) (*Window, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	window, ok := s.windows[id]
	return window, ok
}

func (s *Session) Close(ctx context.Context) error {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil
	}
	s.closed = true
	windows := make([]*Window, 0, len(s.windows))
	for _, window := range s.windows {
		windows = append(windows, window)
	}
	s.mu.Unlock()

	first := closeWindows(ctx, windows)
	if err := s.driver.CloseSession(ctx, s.id); err != nil && first == nil {
		first = wrapDriver("closeSession", "", err)
	}
	return first
}

// CloseWindows closes the current native resources without ending the session.
// A closed window ID remains reserved for the lifetime of the session.
func (s *Session) CloseWindows(ctx context.Context) error {
	s.mu.RLock()
	if s.closed {
		s.mu.RUnlock()
		return nil
	}
	windows := make([]*Window, 0, len(s.windows))
	for _, window := range s.windows {
		windows = append(windows, window)
	}
	s.mu.RUnlock()
	return closeWindows(ctx, windows)
}

func closeWindows(ctx context.Context, windows []*Window) error {
	var first error
	for _, window := range windows {
		if _, err := window.Close(ctx); err != nil && first == nil {
			first = err
		}
	}
	return first
}

func (s *Session) WindowCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, window := range s.windows {
		if window.Status() != StatusClosed {
			count++
		}
	}
	return count
}

type Window struct {
	session   *Session
	spec      WindowSpec
	driver    DriverWindow
	operation sync.Mutex

	mu        sync.RWMutex
	status    WindowStatus
	state     WindowState
	closed    chan struct{}
	closeOnce sync.Once
}

func (w *Window) ID() string { return w.spec.ID }

func (w *Window) Controls() []Control { return append([]Control(nil), w.spec.Controls...) }

func (w *Window) Status() WindowStatus {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.status
}

func (w *Window) Show(ctx context.Context) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if err := w.requireOpen("show"); err != nil {
		return WindowState{}, err
	}
	state, err := w.driver.Show(ctx)
	if err != nil {
		return WindowState{}, wrapDriver("show", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) Hide(ctx context.Context) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if err := w.requireOpen("hide"); err != nil {
		return WindowState{}, err
	}
	state, err := w.driver.Hide(ctx)
	if err != nil {
		return WindowState{}, wrapDriver("hide", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) Close(ctx context.Context) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	w.mu.Lock()
	if w.status == StatusClosed {
		state := w.state
		w.mu.Unlock()
		return state, nil
	}
	if w.status == StatusFailed || w.driver == nil {
		w.mu.Unlock()
		w.markClosed()
		return w.cachedState(), nil
	}
	previousStatus := w.status
	w.status = StatusClosing
	w.mu.Unlock()
	state, err := w.driver.Close(ctx)
	if err != nil {
		w.mu.Lock()
		if w.status != StatusClosed {
			w.status = previousStatus
			w.state.Status = previousStatus
		}
		w.mu.Unlock()
		return WindowState{}, wrapDriver("close", w.ID(), err)
	}
	w.setState(state)
	w.markClosed()
	return w.cachedState(), nil
}

func (w *Window) SetBounds(ctx context.Context, bounds Bounds) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if bounds.Width <= 0 || bounds.Height <= 0 {
		return WindowState{}, &Error{Code: CodeInvalidSpec, Operation: "setBounds", WindowID: w.ID(), Message: "width and height must be positive"}
	}
	if err := w.requireOpen("setBounds"); err != nil {
		return WindowState{}, err
	}
	state, err := w.driver.SetBounds(ctx, bounds)
	if err != nil {
		return WindowState{}, wrapDriver("setBounds", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) SetAlwaysOnTop(ctx context.Context, enabled bool) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if err := w.requireOpen("setAlwaysOnTop"); err != nil {
		return WindowState{}, err
	}
	state, err := w.driver.SetAlwaysOnTop(ctx, enabled)
	if err != nil {
		return WindowState{}, wrapDriver("setAlwaysOnTop", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) SetDraggable(ctx context.Context, enabled bool) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if err := w.requireOpen("setDraggable"); err != nil {
		return WindowState{}, err
	}
	state, err := w.driver.SetDraggable(ctx, enabled)
	if err != nil {
		return WindowState{}, wrapDriver("setDraggable", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) State(ctx context.Context) (WindowState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	w.mu.RLock()
	if w.status == StatusClosed {
		state := w.state
		w.mu.RUnlock()
		return state, nil
	}
	w.mu.RUnlock()
	state, err := w.driver.State(ctx)
	if err != nil {
		return WindowState{}, wrapDriver("getState", w.ID(), err)
	}
	w.setState(state)
	return w.cachedState(), nil
}

func (w *Window) ControlState(ctx context.Context, id string) (ControlState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if !w.hasControl(id) {
		return ControlState{}, &Error{Code: CodeNotFound, Operation: "getControlState", WindowID: w.ID(), TargetID: id, Message: "control not found"}
	}
	state, err := w.driver.ControlState(ctx, id)
	return state, wrapDriver("getControlState", w.ID(), err)
}

func (w *Window) UpdateControl(ctx context.Context, id string, patch ControlPatch) (ControlState, error) {
	w.operation.Lock()
	defer w.operation.Unlock()
	if err := w.requireOpen("updateControl"); err != nil {
		return ControlState{}, err
	}
	control, ok := w.control(id)
	if !ok {
		return ControlState{}, &Error{Code: CodeNotFound, Operation: "updateControl", WindowID: w.ID(), TargetID: id, Message: "control not found"}
	}
	if err := validateControlPatch(control, patch, w.spec.Content.BasePath); err != nil {
		return ControlState{}, withUIErrorContext(err, "updateControl", w.ID(), id)
	}
	state, err := w.driver.UpdateControl(ctx, id, patch)
	return state, wrapDriver("updateControl", w.ID(), err)
}

func (w *Window) WaitClosed() <-chan struct{} { return w.closed }

func (w *Window) requireOpen(operation string) error {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if w.status == StatusClosing || w.status == StatusClosed || w.status == StatusFailed {
		return &Error{Code: CodeInvalidState, Operation: operation, WindowID: w.ID(), Message: "window is " + string(w.status)}
	}
	return nil
}

func (w *Window) hasControl(id string) bool {
	_, ok := w.control(id)
	return ok
}

func (w *Window) control(id string) (Control, bool) {
	for _, control := range w.spec.Controls {
		if control.ID == id {
			return control, true
		}
	}
	return Control{}, false
}

func (w *Window) setState(state WindowState) {
	w.mu.Lock()
	state.ID = w.ID()
	state.SessionID = w.session.id
	if state.Status == "" {
		state.Status = w.status
	}
	if w.status == StatusClosed {
		state.Status = StatusClosed
		state.Visible = false
		state.OnScreen = false
		state.Alpha = 0
	} else if w.status == StatusClosing && state.Status != StatusClosed {
		state.Status = StatusClosing
	}
	w.state = state
	w.status = state.Status
	w.mu.Unlock()
	if state.Status == StatusClosed {
		w.markClosed()
	}
}

func (w *Window) markClosed() {
	w.closeOnce.Do(func() {
		w.mu.Lock()
		w.status = StatusClosed
		w.state.Status = StatusClosed
		w.state.Visible = false
		w.state.OnScreen = false
		w.state.Alpha = 0
		w.mu.Unlock()
		close(w.closed)
	})
}

func (w *Window) markFailed() {
	w.mu.Lock()
	w.status = StatusFailed
	w.state.Status = StatusFailed
	w.mu.Unlock()
}

func (w *Window) cachedState() WindowState {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.state
}

func withUIErrorContext(err error, operation, windowID, targetID string) error {
	var uiErr *Error
	if !errors.As(err, &uiErr) {
		return err
	}
	copy := *uiErr
	if copy.Operation == "" || copy.Operation == "createWindow" && operation != "createWindow" {
		copy.Operation = operation
	}
	if copy.WindowID == "" {
		copy.WindowID = windowID
	}
	if copy.TargetID == "" {
		copy.TargetID = targetID
	}
	return &copy
}

func (w *Window) handleEvent(event Event) {
	if event.SessionID == "" {
		event.SessionID = w.session.id
	}
	if event.WindowID == "" {
		event.WindowID = w.ID()
	}
	w.mu.Lock()
	if event.Sequence > w.state.LastSequence {
		w.state.LastSequence = event.Sequence
	}
	if event.Bounds != nil {
		w.state.Bounds = *event.Bounds
	}
	w.mu.Unlock()
	if event.Type == "close" {
		w.markClosed()
	}
	if w.session.onEvent != nil {
		w.session.onEvent(event)
	}
}
