package customui

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestProcessDriverNormalShutdownAndRepeatedClose(t *testing.T) {
	driver := newHelperProcessDriver()
	session, err := NewSession("lifecycle-normal", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := session.Create(context.Background(), testWindowSpec("panel")); err != nil {
		t.Fatal(err)
	}
	if err := driver.Close(); err != nil {
		t.Fatalf("first Close() = %v", err)
	}
	if err := driver.Close(); err != nil {
		t.Fatalf("second Close() = %v", err)
	}
	if counts := driver.ResourceCounts(); counts.HostProcesses != 0 || counts.Sinks != 0 {
		t.Fatalf("resources after repeated Close = %#v", counts)
	}
}

func TestProcessDriverHostCrashFailsRequestWithoutRespawn(t *testing.T) {
	driver := NewProcessDriver(ProcessDriverOptions{
		StartupTimeout: 2 * time.Second,
		Command: func(string) *exec.Cmd {
			command := exec.Command(os.Args[0], "-test.run=^TestProcessDriverCrashAfterHelloHelper$")
			command.Env = append(os.Environ(), "GO_WANT_CUSTOM_UI_CRASH_HELPER=1")
			return command
		},
	})
	defer driver.Close()
	session, err := NewSession("lifecycle-crash", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), testWindowSpec("panel"))
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, err = window.Show(ctx)
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDriverFailure {
		t.Fatalf("Show() after helper crash = %#v", err)
	}

	started := time.Now()
	_, err = window.State(context.Background())
	if !errors.As(err, &uiErr) || uiErr.Code != CodeDriverFailure {
		t.Fatalf("State() after fatal host exit = %#v", err)
	}
	if time.Since(started) > 250*time.Millisecond {
		t.Fatalf("fatal host state was not reused immediately; elapsed=%v", time.Since(started))
	}

	deadline := time.Now().Add(2 * time.Second)
	for driver.ResourceCounts().HostProcesses != 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if counts := driver.ResourceCounts(); counts.HostProcesses != 0 {
		t.Fatalf("crashed helper remained counted or respawned: %#v", counts)
	}
	if err := driver.Close(); err != nil {
		t.Fatalf("Close() after helper crash = %v", err)
	}
	if err := driver.Close(); err != nil {
		t.Fatalf("repeated Close() after helper crash = %v", err)
	}
}

func TestProcessDriverCrashAfterHelloHelper(t *testing.T) {
	if os.Getenv("GO_WANT_CUSTOM_UI_CRASH_HELPER") != "1" {
		return
	}
	encoder := json.NewEncoder(os.Stdout)
	_ = encoder.Encode(protocolFrame{Version: ProtocolVersion, Kind: protocolKindHello})
	scanner := bufio.NewScanner(os.Stdin)

	if !scanner.Scan() {
		os.Exit(20)
	}
	var create protocolFrame
	if err := json.Unmarshal(scanner.Bytes(), &create); err != nil || create.Operation != "create" {
		os.Exit(21)
	}
	state := WindowState{ID: create.WindowID, SessionID: create.SessionID, Status: StatusHidden, HostPID: os.Getpid(), NativeWindowID: 77, Revision: 1}
	result, _ := json.Marshal(state)
	_ = encoder.Encode(protocolFrame{Version: ProtocolVersion, Kind: protocolKindResponse, RequestID: create.RequestID, OK: true, Result: result})

	// Session.Create() verifies the newly created native window by issuing an
	// immediate getState call. Complete that handshake before simulating the
	// unexpected host crash so this test exercises the next caller request.
	if !scanner.Scan() {
		os.Exit(22)
	}
	var getState protocolFrame
	if err := json.Unmarshal(scanner.Bytes(), &getState); err != nil || getState.Operation != "getState" {
		os.Exit(24)
	}
	_ = encoder.Encode(protocolFrame{Version: ProtocolVersion, Kind: protocolKindResponse, RequestID: getState.RequestID, OK: true, Result: result})

	if !scanner.Scan() {
		os.Exit(25)
	}
	var show protocolFrame
	if err := json.Unmarshal(scanner.Bytes(), &show); err != nil || show.Operation != "show" {
		os.Exit(26)
	}
	os.Exit(23)
}
