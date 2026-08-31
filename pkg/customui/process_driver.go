package customui

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

const defaultHostStartupTimeout = 5 * time.Second

var nativeSessionLease = make(chan struct{}, 1)

type ProcessDriverOptions struct {
	HostPath       string
	Stderr         io.Writer
	StartupTimeout time.Duration
	// Command is an internal test seam. Production callers leave it nil.
	Command func(path string) *exec.Cmd
}

// ProcessDriver speaks versioned NDJSON to a native UI child process. Its
// reader goroutine only exchanges plain Go values; it never owns Goja state.
type ProcessDriver struct {
	opts ProcessDriverOptions

	mu            sync.RWMutex
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	pending       map[string]chan protocolFrame
	sinks         map[string]func(Event)
	controls      map[string]map[string]struct{}
	ready         chan struct{}
	readyOnce     sync.Once
	exited        chan struct{}
	startErr      error
	fatalErr      error
	helloReceived bool
	started       bool
	closed        bool
	leased        bool

	writeMu sync.Mutex
	nextID  atomic.Uint64
}

func NewProcessDriver(opts ProcessDriverOptions) *ProcessDriver {
	if opts.StartupTimeout <= 0 {
		opts.StartupTimeout = defaultHostStartupTimeout
	}
	if opts.Stderr == nil {
		opts.Stderr = os.Stderr
	}
	return &ProcessDriver{
		opts: opts, pending: map[string]chan protocolFrame{}, sinks: map[string]func(Event){},
		controls: map[string]map[string]struct{}{},
	}
}

func (d *ProcessDriver) Capabilities(context.Context) Capabilities {
	available := runtime.GOOS == "darwin"
	reason := ""
	if !available {
		reason = "custom UI v1 requires the macOS AppKit/WebKit host"
	}
	return Capabilities{
		ProtocolVersion: ProtocolVersion, Enabled: true, Available: available,
		Platform: runtime.GOOS, Driver: "native-process", MaxSessions: 1,
		Window: map[string]bool{
			"position": available, "size": available, "alwaysOnTop": available,
			"draggable": available, "nativeIdentity": available,
		},
		Controls: []string{"button", "text", "img", "switch", "input", "select", "container"},
		Reason:   reason,
	}
}

func (d *ProcessDriver) ResourceCounts() DriverResourceCounts {
	d.mu.RLock()
	counts := DriverResourceCounts{Sinks: len(d.sinks)}
	started := d.cmd != nil && d.cmd.Process != nil
	exited := d.exited
	d.mu.RUnlock()
	if started {
		if exited == nil {
			counts.HostProcesses = 1
		} else {
			select {
			case <-exited:
			default:
				counts.HostProcesses = 1
			}
		}
	}
	return counts
}

func (d *ProcessDriver) Create(ctx context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	if runtime.GOOS != "darwin" && d.opts.Command == nil {
		return nil, &Error{Code: CodeUnsupportedPlatform, Operation: "createWindow", WindowID: spec.ID, Message: "custom UI v1 is not available on " + runtime.GOOS}
	}
	if err := d.ensureStarted(ctx); err != nil {
		return nil, err
	}
	key := windowKey(sessionID, spec.ID)
	d.mu.Lock()
	if _, exists := d.sinks[key]; exists {
		d.mu.Unlock()
		return nil, &Error{Code: CodeDuplicateID, Operation: "createWindow", WindowID: spec.ID, Message: "window id already exists in native host"}
	}
	d.sinks[key] = sink
	controlIDs := make(map[string]struct{}, len(spec.Controls))
	for _, control := range spec.Controls {
		controlIDs[control.ID] = struct{}{}
	}
	d.controls[key] = controlIDs
	d.mu.Unlock()

	var state WindowState
	if err := d.call(ctx, sessionID, spec.ID, "create", spec, &state); err != nil {
		d.mu.Lock()
		delete(d.sinks, key)
		delete(d.controls, key)
		d.mu.Unlock()
		return nil, err
	}
	return &processWindow{driver: d, sessionID: sessionID, id: spec.ID}, nil
}

func (d *ProcessDriver) CloseSession(ctx context.Context, sessionID string) error {
	d.mu.RLock()
	started := d.started
	d.mu.RUnlock()
	if !started {
		return nil
	}
	var states []WindowState
	if err := d.call(ctx, sessionID, "", "closeSession", nil, &states); err != nil {
		return err
	}
	d.mu.Lock()
	for key := range d.sinks {
		if len(key) > len(sessionID) && key[:len(sessionID)+1] == sessionID+"/" {
			delete(d.sinks, key)
			delete(d.controls, key)
		}
	}
	d.mu.Unlock()
	return nil
}

func (d *ProcessDriver) Close() error {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return nil
	}
	d.closed = true
	processStarted := d.cmd != nil && d.cmd.Process != nil
	d.mu.Unlock()
	if !processStarted {
		d.releaseLease()
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = d.call(ctx, "", "", "shutdown", nil, nil)

	d.mu.RLock()
	cmd := d.cmd
	exited := d.exited
	d.mu.RUnlock()
	if exited != nil {
		select {
		case <-exited:
		case <-ctx.Done():
			if cmd != nil && cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			<-exited
		}
	}
	d.releaseLease()
	return nil
}

func (d *ProcessDriver) ensureStarted(ctx context.Context) error {
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return &Error{Code: CodeCanceled, Operation: "startHost", Message: "custom UI driver is closed"}
	}
	if d.started {
		d.mu.Unlock()
		return d.waitReady(ctx)
	}
	d.started = true
	d.ready = make(chan struct{})
	d.exited = make(chan struct{})
	d.mu.Unlock()

	select {
	case nativeSessionLease <- struct{}{}:
		d.mu.Lock()
		d.leased = true
		d.mu.Unlock()
	default:
		d.failStart(&Error{Code: CodeBusy, Operation: "startHost", Message: "custom UI v1 allows one active native session"})
		return d.waitReady(ctx)
	}

	path, err := resolveUIHostPath(d.opts.HostPath)
	if err != nil && d.opts.Command == nil {
		d.failStart(err)
		d.releaseLease()
		return d.waitReady(ctx)
	}
	command := exec.Command(path)
	if d.opts.Command != nil {
		command = d.opts.Command(path)
	}
	stdin, err := command.StdinPipe()
	if err != nil {
		d.failStart(wrapDriver("startHost", "", err))
		d.releaseLease()
		return d.waitReady(ctx)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		d.failStart(wrapDriver("startHost", "", err))
		d.releaseLease()
		return d.waitReady(ctx)
	}
	command.Stderr = d.opts.Stderr
	if err := command.Start(); err != nil {
		_ = stdin.Close()
		d.failStart(wrapDriver("startHost", "", err))
		d.releaseLease()
		return d.waitReady(ctx)
	}
	d.mu.Lock()
	d.cmd = command
	d.stdin = stdin
	d.mu.Unlock()
	go d.readFrames(stdout)
	go func() {
		err := command.Wait()
		d.handleExit(err)
	}()

	startupCtx, cancel := context.WithTimeout(ctx, d.opts.StartupTimeout)
	defer cancel()
	if err := d.waitReady(startupCtx); err != nil {
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		return err
	}
	return nil
}

func (d *ProcessDriver) waitReady(ctx context.Context) error {
	d.mu.RLock()
	ready := d.ready
	d.mu.RUnlock()
	select {
	case <-ready:
		d.mu.RLock()
		err := d.startErr
		d.mu.RUnlock()
		return err
	case <-ctx.Done():
		return &Error{Code: CodeCanceled, Operation: "startHost", Message: "waiting for custom UI host", Cause: ctx.Err()}
	}
}

func (d *ProcessDriver) failStart(err error) {
	d.mu.Lock()
	d.startErr = err
	ready := d.ready
	d.mu.Unlock()
	d.readyOnce.Do(func() { close(ready) })
}

func (d *ProcessDriver) readFrames(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
	for scanner.Scan() {
		var frame protocolFrame
		if err := json.Unmarshal(scanner.Bytes(), &frame); err != nil {
			d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI host emitted invalid JSON", Cause: err})
			return
		}
		if frame.Version != ProtocolVersion {
			d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI protocol mismatch: " + frame.Version})
			return
		}
		switch frame.Kind {
		case protocolKindHello:
			d.mu.Lock()
			if d.helloReceived {
				d.mu.Unlock()
				d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI host emitted more than one hello frame"})
				return
			}
			d.helloReceived = true
			ready := d.ready
			d.mu.Unlock()
			d.readyOnce.Do(func() { close(ready) })
		case protocolKindResponse:
			d.mu.Lock()
			pending := d.pending[frame.RequestID]
			delete(d.pending, frame.RequestID)
			d.mu.Unlock()
			if pending != nil {
				pending <- frame
			}
		case protocolKindEvent:
			if frame.Event == nil {
				d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI host emitted an empty event frame"})
				return
			}
			d.mu.RLock()
			key := windowKey(frame.Event.SessionID, frame.Event.WindowID)
			sink := d.sinks[key]
			controls := d.controls[key]
			d.mu.RUnlock()
			if sink == nil {
				d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHostEvent", WindowID: frame.Event.WindowID, TargetID: frame.Event.TargetID, Message: "native UI host emitted an event for an unknown window"})
				return
			}
			if err := validateHostEvent(*frame.Event, controls); err != nil {
				d.failTransport(err)
				return
			}
			sink(*frame.Event)
		default:
			d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI host emitted an unknown frame kind"})
			return
		}
	}
	if err := scanner.Err(); err != nil {
		d.failTransport(&Error{Code: CodeDriverFailure, Operation: "readHost", Message: "native UI protocol stream failed", Cause: err})
	}
}

func (d *ProcessDriver) handleExit(err error) {
	d.mu.Lock()
	exited := d.exited
	closed := d.closed
	d.mu.Unlock()
	if !closed {
		if err == nil {
			err = errors.New("native UI host exited unexpectedly")
		}
		d.failTransport(&Error{Code: CodeDriverFailure, Operation: "hostExit", Message: "native UI host exited", Cause: err})
	}
	if exited != nil {
		close(exited)
	}
	d.releaseLease()
}

func (d *ProcessDriver) failTransport(err error) {
	d.mu.Lock()
	if d.fatalErr == nil {
		d.fatalErr = err
	}
	if d.startErr == nil {
		d.startErr = d.fatalErr
	}
	ready := d.ready
	stdin := d.stdin
	cmd := d.cmd
	d.sinks = map[string]func(Event){}
	d.controls = map[string]map[string]struct{}{}
	d.mu.Unlock()
	if ready != nil {
		d.readyOnce.Do(func() { close(ready) })
	}
	d.failAll(err)
	if stdin != nil {
		_ = stdin.Close()
	}
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

func validateHostEvent(event Event, controls map[string]struct{}) error {
	if event.Sequence == 0 {
		return &Error{Code: CodeDriverFailure, Operation: "readHostEvent", WindowID: event.WindowID, TargetID: event.TargetID, Message: "native UI event sequence must be positive"}
	}
	switch event.Type {
	case "click", "change", "input":
		if _, exists := controls[event.TargetID]; !exists || event.TargetID == "" {
			return &Error{Code: CodeDriverFailure, Operation: "readHostEvent", WindowID: event.WindowID, TargetID: event.TargetID, Message: "native UI event target is not a declared control"}
		}
	case "move", "resize", "close":
		if event.TargetID != "" {
			return &Error{Code: CodeDriverFailure, Operation: "readHostEvent", WindowID: event.WindowID, TargetID: event.TargetID, Message: "window event must not identify a control target"}
		}
	default:
		return &Error{Code: CodeDriverFailure, Operation: "readHostEvent", WindowID: event.WindowID, TargetID: event.TargetID, Message: "native UI host emitted an unsupported event type"}
	}
	return nil
}

func (d *ProcessDriver) failAll(err error) {
	d.mu.Lock()
	pending := d.pending
	d.pending = map[string]chan protocolFrame{}
	d.mu.Unlock()
	frame := protocolFrame{Version: ProtocolVersion, Kind: protocolKindResponse, Error: protocolFailure(err)}
	for _, response := range pending {
		response <- frame
	}
}

func (d *ProcessDriver) call(ctx context.Context, sessionID, windowID, operation string, payload any, result any) error {
	payloadJSON, err := marshalPayload(payload)
	if err != nil {
		return err
	}
	requestID := strconv.FormatUint(d.nextID.Add(1), 10)
	response := make(chan protocolFrame, 1)
	d.mu.Lock()
	if d.closed && operation != "shutdown" {
		d.mu.Unlock()
		return &Error{Code: CodeCanceled, Operation: operation, WindowID: windowID, Message: "custom UI driver is closed"}
	}
	if d.fatalErr != nil {
		fatalErr := d.fatalErr
		d.mu.Unlock()
		return withUIErrorContext(fatalErr, operation, windowID, "")
	}
	d.pending[requestID] = response
	d.mu.Unlock()
	frame := protocolFrame{
		Version: ProtocolVersion, Kind: protocolKindRequest, RequestID: requestID,
		SessionID: sessionID, WindowID: windowID, Operation: operation, Payload: payloadJSON,
	}
	data, err := json.Marshal(frame)
	if err != nil {
		d.mu.Lock()
		delete(d.pending, requestID)
		d.mu.Unlock()
		return err
	}
	d.writeMu.Lock()
	d.mu.RLock()
	stdin := d.stdin
	d.mu.RUnlock()
	if stdin == nil {
		err = &Error{Code: CodeDriverFailure, Operation: operation, WindowID: windowID, Message: "native UI host input is unavailable"}
	} else {
		_, err = stdin.Write(append(data, '\n'))
	}
	d.writeMu.Unlock()
	if err != nil {
		d.mu.Lock()
		delete(d.pending, requestID)
		d.mu.Unlock()
		return wrapDriver(operation, windowID, err)
	}
	select {
	case reply := <-response:
		if reply.Error != nil {
			return withUIErrorContext(reply.Error.asError(), operation, windowID, "")
		}
		if !reply.OK {
			return &Error{Code: CodeDriverFailure, Operation: operation, WindowID: windowID, Message: "native UI host returned an unsuccessful response"}
		}
		if result != nil && len(reply.Result) != 0 && string(reply.Result) != "null" {
			if err := json.Unmarshal(reply.Result, result); err != nil {
				return &Error{Code: CodeDriverFailure, Operation: operation, WindowID: windowID, Message: "decode native UI response", Cause: err}
			}
		}
		return nil
	case <-ctx.Done():
		d.mu.Lock()
		delete(d.pending, requestID)
		d.mu.Unlock()
		return &Error{Code: CodeCanceled, Operation: operation, WindowID: windowID, Message: "custom UI operation canceled", Cause: ctx.Err()}
	}
}

func (d *ProcessDriver) releaseLease() {
	d.mu.Lock()
	if !d.leased {
		d.mu.Unlock()
		return
	}
	d.leased = false
	d.mu.Unlock()
	select {
	case <-nativeSessionLease:
	default:
	}
}

func resolveUIHostPath(configured string) (string, error) {
	if configured != "" {
		path, err := filepath.Abs(configured)
		if err == nil {
			if info, statErr := os.Stat(path); statErr == nil && info.Mode().IsRegular() && info.Mode()&0o111 != 0 {
				return path, nil
			}
		}
		return "", &Error{Code: CodeHostNotFound, Operation: "startHost", Message: "configured custom UI host was not found: " + configured}
	}
	executable, err := os.Executable()
	if err != nil {
		return "", &Error{Code: CodeHostNotFound, Operation: "startHost", Message: "locate OpenDesk executable", Cause: err}
	}
	candidates := uiHostCandidates(executable)
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() && info.Mode()&0o111 != 0 {
			return filepath.Clean(candidate), nil
		}
	}
	return "", &Error{Code: CodeHostNotFound, Operation: "startHost", Message: "opendesk-ui-host was not found beside the runtime executable or in Contents/Helpers"}
}

func uiHostCandidates(executable string) []string {
	dir := filepath.Dir(executable)
	return []string{
		filepath.Join(dir, "opendesk-ui-host"),
		filepath.Join(dir, "..", "Helpers", "opendesk-ui-host"),
	}
}

func windowKey(sessionID, windowID string) string { return sessionID + "/" + windowID }

type processWindow struct {
	driver    *ProcessDriver
	sessionID string
	id        string
}

func (w *processWindow) stateCall(ctx context.Context, operation string, payload any) (WindowState, error) {
	var state WindowState
	err := w.driver.call(ctx, w.sessionID, w.id, operation, payload, &state)
	return state, err
}

func (w *processWindow) Show(ctx context.Context) (WindowState, error) {
	return w.stateCall(ctx, "show", nil)
}

func (w *processWindow) Hide(ctx context.Context) (WindowState, error) {
	return w.stateCall(ctx, "hide", nil)
}

func (w *processWindow) Close(ctx context.Context) (WindowState, error) {
	state, err := w.stateCall(ctx, "close", nil)
	if err == nil {
		w.driver.mu.Lock()
		delete(w.driver.sinks, windowKey(w.sessionID, w.id))
		delete(w.driver.controls, windowKey(w.sessionID, w.id))
		w.driver.mu.Unlock()
	}
	return state, err
}

func (w *processWindow) SetBounds(ctx context.Context, bounds Bounds) (WindowState, error) {
	return w.stateCall(ctx, "setBounds", bounds)
}

func (w *processWindow) SetAlwaysOnTop(ctx context.Context, enabled bool) (WindowState, error) {
	return w.stateCall(ctx, "setAlwaysOnTop", map[string]bool{"enabled": enabled})
}

func (w *processWindow) SetDraggable(ctx context.Context, enabled bool) (WindowState, error) {
	return w.stateCall(ctx, "setDraggable", map[string]bool{"enabled": enabled})
}

func (w *processWindow) State(ctx context.Context) (WindowState, error) {
	return w.stateCall(ctx, "getState", nil)
}

func (w *processWindow) ControlState(ctx context.Context, id string) (ControlState, error) {
	var state ControlState
	err := w.driver.call(ctx, w.sessionID, w.id, "getControlState", map[string]string{"id": id}, &state)
	return state, err
}

func (w *processWindow) UpdateControl(ctx context.Context, id string, patch ControlPatch) (ControlState, error) {
	var state ControlState
	err := w.driver.call(ctx, w.sessionID, w.id, "updateControl", struct {
		ID    string       `json:"id"`
		Patch ControlPatch `json:"patch"`
	}{ID: id, Patch: patch}, &state)
	return state, err
}

var _ Driver = (*ProcessDriver)(nil)

func (d *ProcessDriver) String() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	if d.cmd == nil || d.cmd.Process == nil {
		return "native-process:not-started"
	}
	return fmt.Sprintf("native-process:pid=%d", d.cmd.Process.Pid)
}
