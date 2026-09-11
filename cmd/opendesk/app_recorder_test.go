package main

import (
	"context"
	"errors"
	recorderbundle "opendesk/internal/recorderbundle"
	"opendesk/pkg/appshell"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeenv"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func testAppRecorderShell(t *testing.T) (*appshell.Shell, *appshell.Package) {
	t.Helper()
	manifest := appshell.Manifest{
		ID: "com.opendesk.recorder.test", Entry: "main.js",
		Window: appshell.WindowManifest{MainID: "main"},
		Tray:   appshell.TrayManifest{Enabled: false},
	}
	shell, err := appshell.New(manifest, nil)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	return shell, &appshell.Package{Root: root, Manifest: manifest}
}

func TestAppRecorderOpenLaunchesOnceAndShowsExistingWindow(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	driver := customui.NewMemoryDriver()
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{AllowRecorderCapture: true}, runtimeenv.Result{Values: map[string]string{}}, driver)
	var launches atomic.Int32
	ready := make(chan pkgExecution.Request, 1)
	recorder.run = func(req pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		launches.Add(1)
		session, err := customui.NewSession(req.ExecutionID, filepath.Dir(req.ScriptPath), req.CustomUIDriver, nil)
		if err != nil {
			t.Errorf("session: %v", err)
			return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, err
		}
		if _, err := session.Create(context.Background(), customui.WindowSpec{
			ID:      recorderbundle.RecorderWindowID,
			Bounds:  customui.Bounds{X: 10, Y: 20, Width: 320, Height: 180},
			Content: customui.ContentSpec{HTML: `<button id="capture">Start</button>`},
		}); err != nil {
			t.Errorf("window: %v", err)
			return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, err
		}
		req.OnCustomUISession(session)
		ready <- req
		<-req.Context.Done()
		_ = session.Close(context.Background())
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, req.Context.Err()
	}

	ctx := context.Background()
	if err := recorder.Open(ctx, "tray-menu"); err != nil {
		t.Fatal(err)
	}
	var req pkgExecution.Request
	select {
	case req = <-ready:
	case <-time.After(time.Second):
		t.Fatal("recorder did not launch")
	}
	if err := recorder.Open(ctx, "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if launches.Load() != 1 {
		t.Fatalf("launches=%d", launches.Load())
	}
	state, ok := driver.WindowState(req.ExecutionID, recorderbundle.RecorderWindowID)
	if !ok || !state.Visible {
		t.Fatalf("expected existing recorder window to be shown, state=%+v ok=%v", state, ok)
	}
	recorder.Cancel()
}

func TestAppRecorderEarlyRepeatedOpenWaitsForTheSameWindow(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	driver := customui.NewMemoryDriver()
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{}, runtimeenv.Result{Values: map[string]string{}}, driver)
	started := make(chan struct{})
	release := make(chan struct{})
	var launches atomic.Int32
	recorder.run = func(req pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		launches.Add(1)
		close(started)
		<-release
		session, err := customui.NewSession(req.ExecutionID, filepath.Dir(req.ScriptPath), req.CustomUIDriver, nil)
		if err != nil {
			return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, err
		}
		if _, err := session.Create(context.Background(), customui.WindowSpec{
			ID:      recorderbundle.RecorderWindowID,
			Bounds:  customui.Bounds{X: 10, Y: 20, Width: 320, Height: 180},
			Content: customui.ContentSpec{HTML: `<button id="capture">Start</button>`},
		}); err != nil {
			return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, err
		}
		req.OnCustomUISession(session)
		<-req.Context.Done()
		_ = session.Close(context.Background())
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, req.Context.Err()
	}

	if err := recorder.Open(context.Background(), "tray-menu"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("recorder did not launch")
	}
	if err := recorder.Open(context.Background(), "tray-menu"); err != nil {
		t.Fatal(err)
	}
	if launches.Load() != 1 {
		t.Fatalf("early repeated open launched %d executions", launches.Load())
	}
	close(release)
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		recorder.mu.Lock()
		session := recorder.session
		recorder.mu.Unlock()
		if session != nil {
			if window, ok := session.Window(recorderbundle.RecorderWindowID); ok {
				if state, err := window.State(context.Background()); err == nil && state.Visible {
					recorder.Cancel()
					return
				}
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	recorder.Cancel()
	t.Fatal("early repeated open did not show the recorder window")
}

func TestAppRecorderExitResetsStateAndAllowsReopen(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	driver := customui.NewMemoryDriver()
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{}, runtimeenv.Result{Values: map[string]string{}}, driver)
	done := make(chan struct{}, 2)
	var launches atomic.Int32
	recorder.run = func(req pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		launches.Add(1)
		done <- struct{}{}
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, nil
	}
	if err := recorder.Open(context.Background(), "tray-menu"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("first recorder run did not finish")
	}
	for deadline := time.Now().Add(time.Second); time.Now().Before(deadline); {
		recorder.mu.Lock()
		running := recorder.running
		recorder.mu.Unlock()
		if !running {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if err := recorder.Open(context.Background(), "tray-menu"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("second recorder run did not finish")
	}
	if launches.Load() != 2 {
		t.Fatalf("launches=%d", launches.Load())
	}
}

func TestAppRecorderRejectsWhenShellIsExiting(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{}, runtimeenv.Result{Values: map[string]string{}}, customui.NewMemoryDriver())
	if err := shell.RequestQuit(); err != nil {
		t.Fatal(err)
	}
	if err := recorder.Open(context.Background(), "tray-menu"); !errors.Is(err, appshell.ErrNotRunning) {
		t.Fatalf("Open while exiting error=%v", err)
	}
	shell.CancelAsync()
	if err := recorder.Open(context.Background(), "tray-menu"); !errors.Is(err, appshell.ErrNotRunning) {
		t.Fatalf("Open while stopped error=%v", err)
	}
}

func TestAppRecorderCancelStopsRunningExecution(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{}, runtimeenv.Result{Values: map[string]string{}}, customui.NewMemoryDriver())
	canceled := make(chan struct{})
	recorder.run = func(req pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		<-req.Context.Done()
		close(canceled)
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, req.Context.Err()
	}
	if err := recorder.Open(context.Background(), "tray-menu"); err != nil {
		t.Fatal(err)
	}
	recorder.Cancel()
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("recorder context was not canceled")
	}
}

func TestAppRecorderStartGateWarnsWhenOrdinaryScriptRuns(t *testing.T) {
	shell, appPackage := testAppRecorderShell(t)
	recorder := newAppRecorder(shell, appPackage, appRecorderConfig{}, runtimeenv.Result{Values: map[string]string{}}, customui.NewMemoryDriver())
	recorder.ordinaryRunning = func() bool { return true }
	if err := recorder.canStartRecording(); err == nil || err.Error() != recorderConflictOtherScript {
		t.Fatalf("start gate error=%v", err)
	}
}
