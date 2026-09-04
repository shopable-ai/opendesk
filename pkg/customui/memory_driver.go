package customui

import (
	"context"
	"fmt"
	"opendesk/pkg/customui/toolbar"
	"runtime"
	"sort"
	"sync"
	"time"
)

// MemoryDriver is a deterministic non-GUI driver for core and Runtime tests.
// It is injected directly by tests and is never selected by a public CLI flag.
type MemoryDriver struct {
	mu      sync.RWMutex
	windows map[string]*memoryWindow
	pid     int
}

func NewMemoryDriver() *MemoryDriver {
	return &MemoryDriver{windows: map[string]*memoryWindow{}, pid: 4242}
}

func (d *MemoryDriver) Capabilities(context.Context) Capabilities {
	return Capabilities{
		ProtocolVersion: ProtocolVersion, Enabled: true, Available: true,
		Platform: runtime.GOOS, Driver: "memory", MaxSessions: 64,
		Window:   map[string]bool{"position": true, "placement": true, "size": true, "alwaysOnTop": true, "draggable": true},
		Controls: []string{"button", "text", "img", "switch", "input", "select", "container"},
	}
}

func (d *MemoryDriver) ResourceCounts() DriverResourceCounts {
	d.mu.RLock()
	windows := make([]*memoryWindow, 0, len(d.windows))
	for _, window := range d.windows {
		windows = append(windows, window)
	}
	d.mu.RUnlock()
	open := 0
	for _, window := range windows {
		window.mu.RLock()
		if window.state.Status != StatusClosed {
			open++
		}
		window.mu.RUnlock()
	}
	return DriverResourceCounts{Sinks: open}
}

func (d *MemoryDriver) Create(_ context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	key := sessionID + "/" + spec.ID
	if _, exists := d.windows[key]; exists {
		return nil, fmt.Errorf("window already exists")
	}
	window := &memoryWindow{
		driver: d, sessionID: sessionID, spec: spec, sink: sink,
		state:    WindowState{ID: spec.ID, SessionID: sessionID, Status: StatusHidden, Bounds: spec.Bounds, AlwaysOnTop: spec.AlwaysOnTop, Draggable: spec.Draggable, HostPID: d.pid, NativeWindowID: int64(len(d.windows) + 1), Layer: 0, Alpha: 1, Revision: 1},
		controls: map[string]ControlState{}, toolbarButtons: map[string]toolbar.ButtonResult{},
	}
	if spec.Placement != nil {
		placed, err := ResolveWindowPlacement(window.state.Bounds, *spec.Placement, Bounds{Width: 1440, Height: 900})
		if err != nil {
			return nil, err
		}
		window.state.Bounds = placed
	}
	for _, control := range spec.Controls {
		window.controls[control.ID] = ControlState{ID: control.ID, Type: control.Type, Visible: true}
	}
	if spec.Toolbar != nil {
		for _, item := range spec.Toolbar.Items {
			if !item.IsButton() {
				continue
			}
			button := *item.Button
			presentation, _ := toolbar.IconPresentationForButton(button)
			window.toolbarButtons[button.ID] = toolbar.ButtonResult{
				ButtonSpec: button, IconPresentation: presentation,
				Tooltip: button.Label, AccessibilityName: button.Label,
			}
		}
	}
	d.windows[key] = window
	return window, nil
}

func (d *MemoryDriver) CloseSession(ctx context.Context, sessionID string) error {
	d.mu.RLock()
	windows := make([]*memoryWindow, 0)
	for _, window := range d.windows {
		if window.sessionID == sessionID {
			windows = append(windows, window)
		}
	}
	d.mu.RUnlock()
	for _, window := range windows {
		if _, err := window.Close(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (d *MemoryDriver) Close() error { return nil }

// WindowState and ControlSnapshot are deterministic test diagnostics. They are
// not reachable from the JavaScript API.
func (d *MemoryDriver) WindowState(sessionID, windowID string) (WindowState, bool) {
	d.mu.RLock()
	window := d.windows[sessionID+"/"+windowID]
	d.mu.RUnlock()
	if window == nil {
		return WindowState{}, false
	}
	state, err := window.State(context.Background())
	return state, err == nil
}

func (d *MemoryDriver) ControlSnapshot(sessionID, windowID, controlID string) (ControlState, bool) {
	d.mu.RLock()
	window := d.windows[sessionID+"/"+windowID]
	d.mu.RUnlock()
	if window == nil {
		return ControlState{}, false
	}
	state, err := window.ControlState(context.Background(), controlID)
	return state, err == nil
}

func (d *MemoryDriver) ControlOrder(sessionID, windowID string) ([]Control, bool) {
	d.mu.RLock()
	window := d.windows[sessionID+"/"+windowID]
	d.mu.RUnlock()
	if window == nil {
		return nil, false
	}
	window.mu.RLock()
	controls := append([]Control(nil), window.spec.Controls...)
	window.mu.RUnlock()
	return controls, true
}

func (d *MemoryDriver) Emit(sessionID, windowID, targetID, eventType string, value any) error {
	d.mu.RLock()
	window := d.windows[sessionID+"/"+windowID]
	d.mu.RUnlock()
	if window == nil {
		return fmt.Errorf("window not found")
	}
	window.mu.Lock()
	window.sequence++
	sequence := window.sequence
	window.mu.Unlock()
	window.sink(Event{SessionID: sessionID, WindowID: windowID, TargetID: targetID, Type: eventType, Value: value, Sequence: sequence, Timestamp: time.Now().UTC()})
	return nil
}

type memoryWindow struct {
	driver    *MemoryDriver
	sessionID string
	spec      WindowSpec
	sink      func(Event)

	mu             sync.RWMutex
	state          WindowState
	controls       map[string]ControlState
	toolbarButtons map[string]toolbar.ButtonResult
	sequence       uint64
}

func (w *memoryWindow) mutate(fn func(*WindowState)) WindowState {
	w.mu.Lock()
	fn(&w.state)
	w.state.Revision++
	state := w.state
	w.mu.Unlock()
	return state
}

func (w *memoryWindow) Show(context.Context) (WindowState, error) {
	return w.mutate(func(state *WindowState) { state.Visible = true; state.OnScreen = true; state.Status = StatusVisible }), nil
}

func (w *memoryWindow) Hide(context.Context) (WindowState, error) {
	return w.mutate(func(state *WindowState) { state.Visible = false; state.OnScreen = false; state.Status = StatusHidden }), nil
}

func (w *memoryWindow) Close(context.Context) (WindowState, error) {
	w.mu.Lock()
	already := w.state.Status == StatusClosed
	w.state.Visible = false
	w.state.OnScreen = false
	w.state.Status = StatusClosed
	w.state.Revision++
	state := w.state
	w.sequence++
	sequence := w.sequence
	w.mu.Unlock()
	if !already && w.sink != nil {
		w.sink(Event{SessionID: w.sessionID, WindowID: w.spec.ID, Type: "close", Reason: "script", Sequence: sequence, Timestamp: time.Now().UTC()})
	}
	return state, nil
}

func (w *memoryWindow) SetBounds(_ context.Context, bounds Bounds) (WindowState, error) {
	return w.mutate(func(state *WindowState) { state.Bounds = bounds }), nil
}

func (w *memoryWindow) SetPlacement(_ context.Context, placement WindowPlacement) (WindowState, error) {
	// The memory driver uses a stable 1440x900 work area so core and Runtime
	// tests can exercise placement without pretending to be native UI proof.
	placed, err := ResolveWindowPlacement(w.state.Bounds, placement, Bounds{Width: 1440, Height: 900})
	if err != nil {
		return WindowState{}, err
	}
	return w.mutate(func(state *WindowState) { state.Bounds = placed }), nil
}

func (w *memoryWindow) SetAlwaysOnTop(_ context.Context, enabled bool) (WindowState, error) {
	return w.mutate(func(state *WindowState) { state.AlwaysOnTop = enabled }), nil
}

func (w *memoryWindow) SetDraggable(_ context.Context, enabled bool) (WindowState, error) {
	return w.mutate(func(state *WindowState) { state.Draggable = enabled }), nil
}

func (w *memoryWindow) State(context.Context) (WindowState, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.state, nil
}

func (w *memoryWindow) ControlState(_ context.Context, id string) (ControlState, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	state, ok := w.controls[id]
	if !ok {
		return ControlState{}, fmt.Errorf("control not found")
	}
	return state, nil
}

func (w *memoryWindow) UpdateControl(_ context.Context, id string, patch ControlPatch) (ControlState, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	state, ok := w.controls[id]
	if !ok {
		return ControlState{}, fmt.Errorf("control not found")
	}
	if patch.Text != nil {
		state.Text = *patch.Text
	}
	if patch.Icon != nil {
		state.Icon = *patch.Icon
	}
	if patch.IconPresentation != nil {
		presentation := *patch.IconPresentation
		state.IconPresentation = &presentation
	}
	if patch.Value != nil {
		state.Value = patch.Value
	}
	if patch.Checked != nil {
		state.Checked = patch.Checked
	}
	if patch.Active != nil {
		state.Active = *patch.Active
	}
	if patch.Disabled != nil {
		state.Disabled = *patch.Disabled
	}
	if patch.Busy != nil {
		state.Busy = *patch.Busy
	}
	if patch.Error != nil {
		state.Error = *patch.Error
	}
	if patch.Visible != nil {
		state.Visible = *patch.Visible
	}
	if patch.Classes != nil {
		state.Classes = append([]string(nil), patch.Classes...)
		sort.Strings(state.Classes)
	}
	w.controls[id] = state
	return state, nil
}

func (w *memoryWindow) ToolbarButtonState(_ context.Context, id string) (toolbar.ButtonResult, error) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	state, ok := w.toolbarButtons[id]
	if !ok {
		return toolbar.ButtonResult{}, fmt.Errorf("toolbar button not found")
	}
	return state, nil
}

func (w *memoryWindow) ApplyToolbarButton(_ context.Context, button toolbar.ButtonSpec) (toolbar.ButtonResult, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	state, ok := w.toolbarButtons[button.ID]
	if !ok {
		return toolbar.ButtonResult{}, fmt.Errorf("toolbar button not found")
	}
	if button.State.Revision > state.State.Revision {
		presentation, ok := toolbar.IconPresentationForButton(button)
		if !ok {
			return toolbar.ButtonResult{}, fmt.Errorf("toolbar icon is invalid")
		}
		state.ButtonSpec = button
		state.IconPresentation = presentation
		state.Tooltip = button.Label
		state.AccessibilityName = button.Label
		state.RenderedText = ""
		w.toolbarButtons[button.ID] = state
	}
	return state, nil
}
