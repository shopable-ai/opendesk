package appshell

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

type State string

const (
	StateRunning  State = "RUNNING"
	StateQuitting State = "QUITTING"
	StateStopped  State = "STOPPED"

	defaultPendingActionCapacity = 256
)

var (
	ErrNotRunning = errors.New("app shell is not running")
	ErrTornDown   = errors.New("app shell is torn down")
	ErrQueueFull  = errors.New("app shell action queue is full")
)

type ActionEvent struct {
	ID     string `json:"id"`
	Source string `json:"source"`
}

type MenuItemPatch struct {
	Label   *string `json:"label,omitempty"`
	Enabled *bool   `json:"enabled,omitempty"`
	Visible *bool   `json:"visible,omitempty"`
}

type NativeHost interface {
	Activate(context.Context) error
	UpdateMenuItem(context.Context, string, MenuItemPatch) error
	Teardown(context.Context) error
}

type ActionSink func(ActionEvent) error

type Shell struct {
	mu         sync.Mutex
	dispatchMu sync.Mutex
	state      State
	manifest   Manifest
	native     NativeHost
	sink       ActionSink
	pending    []ActionEvent
	menuState  map[string]MenuItemPatch
	teardown   bool
	teardownMu sync.Once
	quitOnce   sync.Once
	onQuit     func()
}

func New(manifest Manifest, native NativeHost) (*Shell, error) {
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	menuState := make(map[string]MenuItemPatch)
	for _, item := range manifest.Tray.Menu {
		if item.Type == "separator" {
			continue
		}
		label := item.Label
		enabled := true
		visible := true
		if item.Enabled != nil {
			enabled = *item.Enabled
		}
		if item.Visible != nil {
			visible = *item.Visible
		}
		menuState[item.ID] = MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}
	}
	return &Shell{
		state: StateRunning, manifest: manifest, native: native,
		pending: make([]ActionEvent, 0, 8), menuState: menuState,
	}, nil
}

func (s *Shell) State() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *Shell) Manifest() Manifest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.manifest
}

func (s *Shell) IsActive() bool {
	state := s.State()
	return state == StateRunning || state == StateQuitting
}

func (s *Shell) PendingActionCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.pending)
}

func (s *Shell) BindActionSink(sink ActionSink) error {
	if sink == nil {
		return errors.New("action sink is required")
	}
	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()

	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	if s.sink != nil {
		s.mu.Unlock()
		return errors.New("action sink already bound")
	}
	s.sink = sink
	pending := append([]ActionEvent(nil), s.pending...)
	s.pending = nil
	s.mu.Unlock()

	for _, event := range pending {
		if err := sink(event); err != nil {
			return err
		}
	}
	return nil
}

func (s *Shell) UnbindActionSink() {
	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()
	s.mu.Lock()
	s.sink = nil
	s.pending = nil
	s.mu.Unlock()
}

func (s *Shell) SetQuitHook(hook func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.teardown {
		s.onQuit = hook
	}
}

// DispatchAction serializes every native source before it can enter the
// execution-owned Runtime queue. Built-in Open/Quit actions converge here too.
func (s *Shell) DispatchAction(id, source string) error {
	id = strings.TrimSpace(id)
	source = strings.TrimSpace(source)
	if id == "" {
		return errors.New("action id is required")
	}
	if source == "" {
		return errors.New("action source is required")
	}

	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()

	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	s.mu.Unlock()

	switch id {
	case "opendesk.open":
		return s.activateLocked(source)
	case "opendesk.quit":
		return s.requestQuitLocked()
	default:
		return s.dispatchLocked(ActionEvent{ID: id, Source: source})
	}
}

func (s *Shell) dispatchLocked(event ActionEvent) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	if s.sink == nil {
		if len(s.pending) >= defaultPendingActionCapacity {
			s.mu.Unlock()
			return ErrQueueFull
		}
		s.pending = append(s.pending, event)
		s.mu.Unlock()
		return nil
	}
	sink := s.sink
	s.mu.Unlock()
	return sink(event)
}

func (s *Shell) Activate(source string) error {
	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()
	return s.activateLocked(normalizedOpenSource(source))
}

func (s *Shell) activateLocked(source string) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	native := s.native
	s.mu.Unlock()
	if native != nil {
		if err := native.Activate(context.Background()); err != nil {
			return err
		}
	}
	return s.dispatchLocked(ActionEvent{ID: "app.open", Source: normalizedOpenSource(source)})
}

func normalizedOpenSource(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return "app-activation"
	}
	return source
}

func (s *Shell) UpdateMenuItem(id string, patch MenuItemPatch) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("menu item id is required")
	}
	if patch.Label == nil && patch.Enabled == nil && patch.Visible == nil {
		return errors.New("menu item patch is empty")
	}

	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	current, ok := s.menuState[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("unknown menu item %q", id)
	}
	if patch.Label != nil {
		label := strings.TrimSpace(*patch.Label)
		if label == "" {
			s.mu.Unlock()
			return errors.New("menu item label cannot be empty")
		}
		current.Label = &label
		patch.Label = &label
	}
	if patch.Enabled != nil {
		value := *patch.Enabled
		current.Enabled = &value
	}
	if patch.Visible != nil {
		value := *patch.Visible
		current.Visible = &value
	}
	native := s.native
	s.mu.Unlock()

	if native != nil {
		if err := native.UpdateMenuItem(context.Background(), id, patch); err != nil {
			return err
		}
	}
	s.mu.Lock()
	if !s.teardown && s.state == StateRunning {
		s.menuState[id] = current
	}
	s.mu.Unlock()
	return nil
}

func (s *Shell) MenuItemState(id string) (MenuItemPatch, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	state, ok := s.menuState[id]
	return state, ok
}

func (s *Shell) BeginShutdown() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown || s.state != StateRunning {
		return false
	}
	s.state = StateQuitting
	return true
}

// RequestQuit only requests cancellation of the current execution. Native
// teardown is owned by Teardown, so every quit source converges through the
// same Runtime lifecycle instead of racing five independent shutdown paths.
func (s *Shell) RequestQuit() error {
	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()
	return s.requestQuitLocked()
}

func (s *Shell) requestQuitLocked() error {
	s.mu.Lock()
	if s.teardown || s.state == StateStopped {
		s.mu.Unlock()
		return nil
	}
	if s.state == StateRunning {
		s.state = StateQuitting
	}
	hook := s.onQuit
	s.mu.Unlock()
	s.quitOnce.Do(func() {
		if hook != nil {
			hook()
		}
	})
	return nil
}

// Teardown is idempotent and should be called by the current execution's
// lifecycle cleanup after cancellation.
func (s *Shell) Teardown() error {
	var teardownErr error
	s.teardownMu.Do(func() {
		s.mu.Lock()
		if s.state == StateRunning {
			s.state = StateQuitting
		}
		native := s.native
		s.mu.Unlock()
		if native != nil {
			teardownErr = native.Teardown(context.Background())
		}
		s.mu.Lock()
		s.sink = nil
		s.pending = nil
		s.native = nil
		s.onQuit = nil
		s.teardown = true
		s.state = StateStopped
		s.mu.Unlock()
	})
	return teardownErr
}
