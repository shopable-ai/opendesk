package customui

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestUIHostCandidatesUseBundledOpenDeskHostName(t *testing.T) {
	executable := filepath.Join(string(filepath.Separator), "Applications", "OpenDesk.app", "Contents", "MacOS", "opendesk")
	candidates := uiHostCandidates(executable)
	want := []string{
		filepath.Join(filepath.Dir(executable), "opendesk-ui-host"),
		filepath.Join(filepath.Dir(executable), "..", "Helpers", "opendesk-ui-host"),
	}
	if len(candidates) != len(want) {
		t.Fatalf("candidates = %#v, want %#v", candidates, want)
	}
	for index := range want {
		if filepath.Clean(candidates[index]) != filepath.Clean(want[index]) {
			t.Fatalf("candidate[%d] = %s, want %s", index, candidates[index], want[index])
		}
	}
}

func TestProcessDriverRoundTripAndEvents(t *testing.T) {
	driver := newHelperProcessDriver()
	defer driver.Close()
	events := make(chan Event, 4)
	session, err := NewSession("process-test", t.TempDir(), driver, func(event Event) { events <- event })
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}
	state, err := window.Show(context.Background())
	if err != nil || !state.Visible || state.HostPID == 0 || state.NativeWindowID == 0 {
		t.Fatalf("show state = %#v, err = %v", state, err)
	}
	text := "Ready"
	control, err := window.UpdateControl(context.Background(), "status", ControlPatch{Text: &text})
	if err != nil || control.Text != text {
		t.Fatalf("control state = %#v, err = %v", control, err)
	}
	select {
	case event := <-events:
		if event.Type != "click" || event.TargetID != "save" || event.Sequence != 1 {
			t.Fatalf("event = %#v", event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("native event was not delivered")
	}
	if err := session.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestProcessDriverGlobalNativeSessionLease(t *testing.T) {
	first := newHelperProcessDriver()
	defer first.Close()
	firstSession, _ := NewSession("first-session", t.TempDir(), first, nil)
	if _, err := firstSession.Create(context.Background(), testWindowSpec("first")); err != nil {
		t.Fatal(err)
	}

	second := newHelperProcessDriver()
	defer second.Close()
	secondSession, _ := NewSession("second-session", t.TempDir(), second, nil)
	_, err := secondSession.Create(context.Background(), testWindowSpec("second"))
	if uiErr, ok := err.(*Error); !ok || uiErr.Code != CodeBusy {
		t.Fatalf("second native session error = %#v", err)
	}
}

func TestProcessDriverFailsFastWhenHostExitsBeforeHello(t *testing.T) {
	driver := newFailureProcessDriver("exit-before-hello")
	defer driver.Close()
	session, _ := NewSession("host-exit", t.TempDir(), driver, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	started := time.Now()
	_, err := session.Create(ctx, testWindowSpec("panel"))
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDriverFailure || uiErr.WindowID != "panel" {
		t.Fatalf("host exit error = %#v", err)
	}
	if time.Since(started) >= time.Second {
		t.Fatalf("host exit waited for startup timeout: %v", time.Since(started))
	}
}

func TestProcessDriverTreatsStdoutPollutionAsFatal(t *testing.T) {
	driver := newFailureProcessDriver("invalid-json")
	defer driver.Close()
	session, _ := NewSession("stdout-pollution", t.TempDir(), driver, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err := session.Create(ctx, testWindowSpec("panel"))
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDriverFailure || uiErr.Operation != "readHost" {
		t.Fatalf("stdout pollution error = %#v", err)
	}
}

func TestResolveUIHostPathRejectsMissingAndNonExecutableOverride(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	nonExecutable := filepath.Join(t.TempDir(), "not-executable")
	if err := os.WriteFile(nonExecutable, []byte("host"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{missing, nonExecutable} {
		_, err := resolveUIHostPath(path)
		var uiErr *Error
		if !errors.As(err, &uiErr) || uiErr.Code != CodeHostNotFound {
			t.Fatalf("path %q error = %#v", path, err)
		}
	}
}

func TestProcessDriverHelper(t *testing.T) {
	if os.Getenv("GO_WANT_CUSTOM_UI_HELPER") != "1" {
		return
	}
	switch os.Getenv("CUSTOM_UI_HELPER_MODE") {
	case "exit-before-hello":
		return
	case "invalid-json":
		fmt.Fprintln(os.Stdout, "host diagnostic incorrectly written to stdout")
		return
	}
	helperUIHost()
	os.Exit(0)
}

func newFailureProcessDriver(mode string) *ProcessDriver {
	return NewProcessDriver(ProcessDriverOptions{
		StartupTimeout: 2 * time.Second,
		Command: func(string) *exec.Cmd {
			command := exec.Command(os.Args[0], "-test.run=TestProcessDriverHelper")
			command.Env = append(os.Environ(), "GO_WANT_CUSTOM_UI_HELPER=1", "CUSTOM_UI_HELPER_MODE="+mode)
			return command
		},
	})
}

func newHelperProcessDriver() *ProcessDriver {
	return NewProcessDriver(ProcessDriverOptions{
		StartupTimeout: 2 * time.Second,
		Command: func(string) *exec.Cmd {
			command := exec.Command(os.Args[0], "-test.run=TestProcessDriverHelper")
			command.Env = append(os.Environ(), "GO_WANT_CUSTOM_UI_HELPER=1")
			return command
		},
	})
}

func helperUIHost() {
	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(protocolFrame{Version: ProtocolVersion, Kind: protocolKindHello})
	states := map[string]WindowState{}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var request protocolFrame
		if json.Unmarshal(scanner.Bytes(), &request) != nil {
			return
		}
		response := protocolFrame{Version: ProtocolVersion, Kind: protocolKindResponse, RequestID: request.RequestID, OK: true}
		key := windowKey(request.SessionID, request.WindowID)
		state := states[key]
		switch request.Operation {
		case "create":
			var spec WindowSpec
			_ = json.Unmarshal(request.Payload, &spec)
			state = WindowState{ID: request.WindowID, SessionID: request.SessionID, Status: StatusHidden, Bounds: spec.Bounds, HostPID: os.Getpid(), NativeWindowID: 99, Revision: 1}
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "getState":
			response.Result, _ = json.Marshal(state)
		case "show":
			state.Status, state.Visible, state.Revision = StatusVisible, true, state.Revision+1
			states[key] = state
			response.Result, _ = json.Marshal(state)
			_ = encoder.Encode(response)
			_ = encoder.Encode(protocolFrame{Version: ProtocolVersion, Kind: protocolKindEvent, Event: &Event{
				SessionID: request.SessionID, WindowID: request.WindowID, TargetID: "save", Type: "click", Sequence: 1, Timestamp: time.Now().UTC(),
			}})
			continue
		case "hide":
			state.Status, state.Visible, state.Revision = StatusHidden, false, state.Revision+1
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "setBounds":
			_ = json.Unmarshal(request.Payload, &state.Bounds)
			state.Revision++
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "setAlwaysOnTop":
			var payload map[string]bool
			_ = json.Unmarshal(request.Payload, &payload)
			state.AlwaysOnTop, state.Revision = payload["enabled"], state.Revision+1
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "setDraggable":
			var payload map[string]bool
			_ = json.Unmarshal(request.Payload, &payload)
			state.Draggable, state.Revision = payload["enabled"], state.Revision+1
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "getControlState":
			response.Result, _ = json.Marshal(ControlState{ID: "status", Type: "text", Visible: true})
		case "updateControl":
			var payload struct {
				ID    string       `json:"id"`
				Patch ControlPatch `json:"patch"`
			}
			_ = json.Unmarshal(request.Payload, &payload)
			control := ControlState{ID: payload.ID, Type: "text", Visible: true}
			if payload.Patch.Text != nil {
				control.Text = *payload.Patch.Text
			}
			response.Result, _ = json.Marshal(control)
		case "close":
			state.Status, state.Visible, state.Revision = StatusClosed, false, state.Revision+1
			states[key] = state
			response.Result, _ = json.Marshal(state)
		case "closeSession":
			response.Result = []byte(`[]`)
		case "shutdown":
			_ = encoder.Encode(response)
			return
		default:
			response.OK = false
			response.Error = &protocolError{Code: CodeDriverFailure, Operation: request.Operation, Message: fmt.Sprintf("unsupported helper operation %q", request.Operation)}
		}
		_ = encoder.Encode(response)
	}
}
