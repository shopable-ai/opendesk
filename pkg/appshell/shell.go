package appshell

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
)

const pendingEventCapacity = 256

type State string

const (
	StateRunning  State = "RUNNING"
	StateQuitting State = "QUITTING"
	StateStopped  State = "STOPPED"
)

var (
	ErrNotRunning = errors.New("app shell is not running")
	ErrTornDown   = errors.New("app shell is torn down")
	ErrQueueFull  = errors.New("app shell event queue is full")
	ErrNotStarted = errors.New("app shell native host is not started")
	// ErrMainLoopReturned prevents a native main-thread event loop from
	// silently ending a live App Mode process. Normal teardown transitions the
	// Shell out of StateRunning and/or cancels its owning context first.
	ErrMainLoopReturned = errors.New("app shell main event loop returned while the shell is still running")
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

// NativeHost is owned by the opendesk process. Implementations exchange only
// plain Go data with Shell and never retain Goja values.
type NativeHost interface {
	Start(context.Context, func(itemID, source string)) error
	Activate(context.Context) error
	UpdateMenuItem(context.Context, string, MenuItemPatch) error
	Teardown(context.Context) error
	Wait()
}

// OpenDocumentHost is an optional native capability. It carries a single
// user-selected document path into the App Mode owner without encoding it in
// a shell command or changing the public Runtime API. The product binds this
// to the same FlowInstallService used by its other installation entry points.
type OpenDocumentHost interface {
	SetOpenDocumentHandler(func(path string))
}

type FlowTrustDecision string

const (
	FlowTrustCancel    FlowTrustDecision = "cancel"
	FlowTrustFlow      FlowTrustDecision = "flow"
	FlowTrustPublisher FlowTrustDecision = "publisher"
)

type FlowTrustPrompt struct {
	FlowID               string
	Name                 string
	PublisherID          string
	PublisherKeyID       string
	PublisherFingerprint string
}

// FlowInstallHost contains the native, user-driven install affordances used
// by the first-party OpenDesk product. It is intentionally optional: ordinary
// Script Apps do not receive a file picker or trust prompt.
type FlowInstallHost interface {
	OpenFlowFiles(context.Context) ([]string, error)
	ConfirmFlowTrust(context.Context, FlowTrustPrompt) (FlowTrustDecision, error)
}

// MainThreadHost is implemented by backends such as AppKit whose OS event loop
// must occupy the primordial process thread while the Execution runs elsewhere.
type MainThreadHost interface {
	RunMain(context.Context) error
}

type ActionSink func(ActionEvent) error

type Shell struct {
	mu          sync.Mutex
	startMu     sync.Mutex
	dispatchMu  sync.Mutex
	menuMu      sync.Mutex
	state       State
	manifest    Manifest
	native      NativeHost
	sink        ActionSink
	recorder    ActionSink
	measurement ActionSink
	flowInstall ActionSink
	pending     []ActionEvent
	menuState   map[string]MenuItemPatch
	started     bool
	teardown    bool
	quitOnce    sync.Once
	closeOnce   sync.Once
	onQuit      func()
	terminalErr error
}

func New(manifest Manifest, native NativeHost) (*Shell, error) {
	if err := manifest.Validate(); err != nil {
		return nil, err
	}
	menuState := make(map[string]MenuItemPatch)
	visitNativeMenu(nativeMenuForManifest(manifest), func(item nativeMenuItem) {
		if item.Type == "separator" || item.ID == "" {
			return
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
	})
	return &Shell{state: StateRunning, manifest: manifest, native: native, menuState: menuState}, nil
}

func (s *Shell) Start(ctx context.Context) error {
	s.startMu.Lock()
	defer s.startMu.Unlock()
	s.mu.Lock()
	if s.teardown || s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	if s.started {
		s.mu.Unlock()
		return nil
	}
	native := s.native
	s.mu.Unlock()
	if native == nil || !s.manifest.Tray.Enabled {
		return s.completeStartLocked()
	}
	if err := native.Start(ctx, s.DispatchMenuItem); err != nil {
		return err
	}
	return s.completeStartLocked()
}

// completeStartLocked runs while startMu is held. If shutdown won the race
// after the native host started, this path owns the one native teardown rather
// than allowing Start and CancelAsync to tear the same host down concurrently.
func (s *Shell) completeStartLocked() error {
	s.mu.Lock()
	if s.teardown || s.state != StateRunning {
		s.mu.Unlock()
		s.cancelAsyncLocked()
		return ErrNotRunning
	}
	s.started = true
	s.mu.Unlock()
	return nil
}

func (s *Shell) RunMain(ctx context.Context) error {
	s.mu.Lock()
	native := s.native
	started := s.started
	s.mu.Unlock()
	if !started {
		return ErrNotStarted
	}
	if host, ok := native.(MainThreadHost); ok {
		if err := host.RunMain(ctx); err != nil {
			return err
		}
		// A native main-thread host returning nil is valid only after an
		// intentional shutdown. Treat a live, uncancelled shell as a lifecycle
		// failure instead of allowing App Mode to report a false success.
		if ctx != nil && ctx.Err() == nil && s.State() == StateRunning {
			s.recordTerminalError(ErrMainLoopReturned)
			return ErrMainLoopReturned
		}
	}
	return nil
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
			s.mu.Lock()
			s.sink = nil
			s.pending = nil
			s.mu.Unlock()
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

func (s *Shell) BindRecorderAction(sink ActionSink) error {
	if sink == nil {
		return errors.New("recorder action sink is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown {
		return ErrTornDown
	}
	if s.state != StateRunning {
		return ErrNotRunning
	}
	if s.recorder != nil {
		return errors.New("recorder action sink already bound")
	}
	s.recorder = sink
	return nil
}

func (s *Shell) UnbindRecorderAction() {
	s.mu.Lock()
	s.recorder = nil
	s.mu.Unlock()
}

func (s *Shell) BindMeasurementAction(sink ActionSink) error {
	if sink == nil {
		return errors.New("measurement action sink is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown {
		return ErrTornDown
	}
	if s.state != StateRunning {
		return ErrNotRunning
	}
	if s.measurement != nil {
		return errors.New("measurement action sink already bound")
	}
	s.measurement = sink
	return nil
}

func (s *Shell) UnbindMeasurementAction() {
	s.mu.Lock()
	s.measurement = nil
	s.mu.Unlock()
}

func (s *Shell) BindFlowInstallAction(sink ActionSink) error {
	if sink == nil {
		return errors.New("Flow install action sink is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown {
		return ErrTornDown
	}
	if s.state != StateRunning {
		return ErrNotRunning
	}
	if s.flowInstall != nil {
		return errors.New("Flow install action sink already bound")
	}
	s.flowInstall = sink
	return nil
}

func (s *Shell) UnbindFlowInstallAction() {
	s.mu.Lock()
	s.flowInstall = nil
	s.mu.Unlock()
}

func (s *Shell) SetQuitHook(hook func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.teardown {
		s.onQuit = hook
	}
}

// DispatchMenuItem maps the native menu item identity to its business action.
// Native backends never decide the JavaScript event identity themselves.
func (s *Shell) DispatchMenuItem(itemID, source string) {
	var err error
	if isBuiltinAction(itemID) || isProductSystemAction(itemID) {
		err = s.DispatchAction(itemID, source)
	} else if action, ok := s.manifest.MenuAction(itemID); ok {
		err = s.DispatchAction(action, source)
	}
	if err == nil || errors.Is(err, ErrNotRunning) || errors.Is(err, ErrTornDown) {
		return
	}
	// Native callbacks have no synchronous JavaScript caller to receive an
	// overflow/scheduling error. Record it and enter the one shutdown path so
	// an event is never silently dropped while the app continues as healthy.
	s.recordTerminalError(fmt.Errorf("native App Shell action dispatch failed: %w", err))
	_ = s.RequestQuit()
}

func (s *Shell) recordTerminalError(err error) {
	if s == nil || err == nil {
		return
	}
	s.mu.Lock()
	if s.terminalErr == nil {
		s.terminalErr = err
	}
	s.mu.Unlock()
}

func (s *Shell) TerminalError() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.terminalErr
}

func (s *Shell) DispatchAction(id, source string) error {
	id = strings.TrimSpace(id)
	source = strings.TrimSpace(source)
	if id == "" {
		return errors.New("action id is required")
	}
	if source == "" {
		return errors.New("action source is required")
	}
	if id == ActionQuit {
		return s.RequestQuit()
	}
	if id == ActionOpen {
		return s.Activate(source)
	}
	if id == ActionRecorder {
		return s.dispatchRecorder(ActionEvent{ID: id, Source: source})
	}
	if id == ActionProductMeasurement {
		return s.dispatchMeasurement(ActionEvent{ID: id, Source: source})
	}
	if id == ActionProductInstallFlow {
		return s.dispatchFlowInstall(ActionEvent{ID: id, Source: source})
	}
	return s.enqueue(ActionEvent{ID: id, Source: source})
}

func (s *Shell) dispatchMeasurement(event ActionEvent) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	sink := s.measurement
	s.mu.Unlock()
	if sink == nil {
		return nil
	}
	return sink(event)
}

func (s *Shell) dispatchFlowInstall(event ActionEvent) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	sink := s.flowInstall
	s.mu.Unlock()
	if sink == nil {
		return nil
	}
	return sink(event)
}

func (s *Shell) dispatchRecorder(event ActionEvent) error {
	s.mu.Lock()
	if s.teardown {
		s.mu.Unlock()
		return ErrTornDown
	}
	if s.state != StateRunning {
		s.mu.Unlock()
		return ErrNotRunning
	}
	sink := s.recorder
	s.mu.Unlock()
	if sink == nil {
		return nil
	}
	return sink(event)
}

func (s *Shell) enqueue(event ActionEvent) error {
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
	if s.sink == nil {
		if len(s.pending) >= pendingEventCapacity {
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
	started := s.started
	s.mu.Unlock()
	if native != nil && started {
		if err := native.Activate(context.Background()); err != nil {
			return err
		}
	}
	return s.enqueue(ActionEvent{ID: ActionOpen, Source: normalizedOpenSource(source)})
}

func normalizedOpenSource(source string) string {
	source = strings.TrimSpace(source)
	if source == "" {
		return "app-activation"
	}
	return source
}

func (s *Shell) UpdateMenuItem(ctx context.Context, id string, patch MenuItemPatch) error {
	s.menuMu.Lock()
	defer s.menuMu.Unlock()
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
	if s.manifest.StatusOnlyMenuItem(id) && patch.Enabled != nil && *patch.Enabled {
		s.mu.Unlock()
		return fmt.Errorf("status-only menu item %q is permanently disabled", id)
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
	started := s.started
	s.mu.Unlock()
	if native != nil && started {
		if err := native.UpdateMenuItem(ctx, id, patch); err != nil {
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
	s.dispatchMu.Lock()
	defer s.dispatchMu.Unlock()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.teardown || s.state != StateRunning {
		return false
	}
	s.state = StateQuitting
	s.sink = nil
	s.recorder = nil
	s.measurement = nil
	s.pending = nil
	return true
}

// RequestQuit only transitions state and cancels the owning App Mode context.
// RuntimeLifecycle.CancelAsync owns native teardown so there is one shutdown
// path and callbacks cannot outlive the current Execution.
func (s *Shell) RequestQuit() error {
	if !s.BeginShutdown() {
		state := s.State()
		if state == StateQuitting || state == StateStopped {
			return nil
		}
		return ErrNotRunning
	}
	s.quitOnce.Do(func() {
		s.mu.Lock()
		hook := s.onQuit
		s.mu.Unlock()
		if hook != nil {
			hook()
		}
	})
	return nil
}

// CancelAsync is called by RuntimeLifecycle on the Goja owner after the App
// Mode context is canceled. It is safe to repeat and never invokes JavaScript.
func (s *Shell) CancelAsync() {
	if s == nil {
		return
	}
	if s.State() == StateRunning {
		_ = s.RequestQuit()
	}
	// Native Start and Teardown must never overlap. Start uses the same gate
	// and performs cleanup itself if shutdown wins its completion check.
	s.startMu.Lock()
	defer s.startMu.Unlock()
	s.cancelAsyncLocked()
}

func (s *Shell) cancelAsyncLocked() {
	s.closeOnce.Do(func() {
		if s.State() == StateRunning {
			_ = s.RequestQuit()
		}
		s.dispatchMu.Lock()
		s.mu.Lock()
		s.sink = nil
		s.recorder = nil
		s.measurement = nil
		s.pending = nil
		native := s.native
		s.mu.Unlock()
		s.dispatchMu.Unlock()
		if native != nil {
			ctx, cancel := context.WithCancel(context.Background())
			if err := native.Teardown(ctx); err != nil {
				s.recordTerminalError(fmt.Errorf("teardown native App Shell host: %w", err))
			}
			cancel()
		}
		s.mu.Lock()
		s.teardown = true
		s.onQuit = nil
		s.state = StateStopped
		s.mu.Unlock()
	})
}

func (s *Shell) Wait() {
	if s == nil {
		return
	}
	s.mu.Lock()
	native := s.native
	s.mu.Unlock()
	if native != nil {
		native.Wait()
	}
}

func (s *Shell) ResourceCounts() (running int, queued int) {
	if s == nil {
		return 0, 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.teardown && s.state == StateRunning {
		running = 1
	}
	return running, len(s.pending)
}

func (s *Shell) Teardown() error {
	if s == nil {
		return nil
	}
	_ = s.RequestQuit()
	s.CancelAsync()
	s.Wait()
	return s.TerminalError()
}
