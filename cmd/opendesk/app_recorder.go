package main

import (
	"context"
	"errors"
	"fmt"
	recorderbundle "opendesk/internal/recorderbundle"
	"opendesk/pkg/appshell"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeenv"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const (
	recorderConflictOtherScript = "请先停止其他运行中的脚本，再开始录制。"
	recorderConflictRecording   = "当前正在录制，请先停止录制再运行脚本。"
	recorderConflictScript      = "已有脚本正在运行，请先停止后再运行。"
)

type appRecorder struct {
	shell       *appshell.Shell
	packageID   string
	packageRoot string
	config      appRecorderConfig
	environment map[string]string
	driver      customui.Driver
	run         func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error)

	mu          sync.Mutex
	running     bool
	executionID string
	session     *customui.Session
	cancel      context.CancelFunc
	done        chan struct{}

	ordinaryRunning func() bool
}

type appRecorderConfig struct {
	LogDir                                string
	StackMode                             string
	AllowRecorderCapture                  bool
	ExperimentalUnsafeNativeExtensionCall bool
	CustomUIHostPath                      string
}

func newAppRecorder(shell *appshell.Shell, appPackage *appshell.Package, config appRecorderConfig, environment runtimeenv.Result, driver customui.Driver) *appRecorder {
	return &appRecorder{
		shell: shell, packageID: appPackage.Manifest.ID, packageRoot: appPackage.Root,
		config: config, environment: environment.Values, driver: driver, run: pkgExecution.Run,
	}
}

func (r *appRecorder) Open(parent context.Context, source string) error {
	if r == nil {
		return nil
	}
	if parent == nil {
		parent = context.Background()
	}
	if state := r.shell.State(); state != appshell.StateRunning {
		return appshell.ErrNotRunning
	}
	r.mu.Lock()
	if r.running {
		session := r.session
		r.mu.Unlock()
		return showRecorderSession(parent, session)
	}
	executionID := pkgExecution.NewExecutionID("recorder")
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	r.running, r.executionID, r.cancel, r.done = true, executionID, cancel, done
	r.mu.Unlock()

	request, err := r.request(ctx, executionID)
	if err != nil {
		cancel()
		r.clear(executionID)
		return err
	}
	go r.runRecorder(request, executionID, done)
	return nil
}

func (r *appRecorder) request(ctx context.Context, executionID string) (pkgExecution.Request, error) {
	workDir, err := appRecorderWorkDir(r.packageRoot, r.packageID, r.environment)
	if err != nil {
		return pkgExecution.Request{}, fmt.Errorf("resolve built-in Recorder workdir: %w", err)
	}
	logDir := r.config.LogDir
	if logDir != "" {
		logDir = filepath.Join(logDir, "recorder", executionID)
	}
	artifacts, err := pkgExecution.PrepareArtifacts(logDir, executionID, ".js")
	if err != nil {
		return pkgExecution.Request{}, err
	}
	uiRoot := filepath.Join(artifacts.RunDir, "ui")
	// App Mode changes the execution WorkDir to the app package root. Keep the
	// embedded Recorder entry absolute so Execution.scriptDir still points at
	// the artifact directory when the App Mode log directory was supplied as a
	// relative path from the repository or launcher directory.
	uiRoot, err = filepath.Abs(uiRoot)
	if err != nil {
		return pkgExecution.Request{}, fmt.Errorf("resolve built-in Recorder UI path: %w", err)
	}
	entryPath, err := recorderbundle.WriteToDir(uiRoot)
	if err != nil {
		return pkgExecution.Request{}, fmt.Errorf("prepare built-in Recorder UI: %w", err)
	}
	content, err := readFileBytes(entryPath)
	if err != nil {
		return pkgExecution.Request{}, err
	}
	if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, content); err != nil {
		return pkgExecution.Request{}, err
	}
	env := make(map[string]string, len(r.environment))
	for key, value := range r.environment {
		env[key] = value
	}
	return pkgExecution.Request{
		Context:                         ctx,
		ExpectedCancellation:            func() bool { return ctx.Err() != nil },
		ExecutionID:                     executionID,
		SourceLabel:                     "app-recorder:" + r.packageID,
		ScriptPath:                      entryPath,
		Ext:                             ".js",
		StackMode:                       r.config.StackMode,
		ScriptContent:                   content,
		WorkDir:                         workDir,
		Environment:                     env,
		TimeoutMinutes:                  0,
		EnableNativeExtensions:          true,
		EnableUnsafeNativeExtensionCall: r.config.ExperimentalUnsafeNativeExtensionCall,
		EnableCommand:                   true,
		EnableDownload:                  true,
		EnableAccessibility:             true,
		EnableSQLite:                    true,
		EnableRecorderCapture:           r.config.AllowRecorderCapture,
		RecorderStartGate:               r.canStartRecording,
		EnableCustomUI:                  true,
		CustomUIActivationSource:        customui.ActivationCLI,
		CustomUIHostPath:                r.config.CustomUIHostPath,
		CustomUIDriver:                  customui.NewSessionScopedDriverForSession(r.driver, executionID),
		OnCustomUISession:               func(session *customui.Session) { r.setSession(executionID, session) },
		Artifacts:                       artifacts,
		Selection: pkgExecution.TerminalSelection{
			Mode:       "quiet",
			Categories: map[string]bool{},
		},
	}, nil
}

func (r *appRecorder) canStartRecording() error {
	if r.ordinaryRunning != nil && r.ordinaryRunning() {
		return errors.New(recorderConflictOtherScript)
	}
	return nil
}

func (r *appRecorder) runRecorder(request pkgExecution.Request, executionID string, done chan struct{}) {
	defer close(done)
	uiReady := make(chan struct{})
	go func() {
		defer close(uiReady)
		_ = waitAndShowRecorderWindow(request.Context, r, executionID)
	}()
	_, _, _ = r.run(request)
	r.mu.Lock()
	cancel := context.CancelFunc(nil)
	if r.executionID == executionID && r.running {
		cancel = r.cancel
	}
	r.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	<-uiReady
	r.clear(executionID)
}

func (r *appRecorder) setSession(executionID string, session *customui.Session) {
	r.mu.Lock()
	if r.executionID == executionID && r.running {
		r.session = session
	}
	r.mu.Unlock()
}

func (r *appRecorder) clear(executionID string) {
	r.mu.Lock()
	if r.executionID == executionID {
		r.running = false
		r.executionID = ""
		r.session = nil
		r.cancel = nil
		r.done = nil
	}
	r.mu.Unlock()
}

func (r *appRecorder) Cancel() {
	if r == nil {
		return
	}
	r.mu.Lock()
	cancel, done := r.cancel, r.done
	r.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

func showRecorderSession(ctx context.Context, session *customui.Session) error {
	if session == nil {
		return nil
	}
	window, ok := session.Window(recorderbundle.RecorderWindowID)
	if !ok {
		return nil
	}
	_, err := window.Show(ctx)
	if err != nil && errors.Is(ctx.Err(), context.Canceled) {
		return context.Canceled
	}
	return err
}

// waitAndShowRecorderWindow closes the race between the native Tray callback
// and the Recorder controller's asynchronous FloatingWindow.create/show path.
// The controller remains the single owner of the Recorder UI; this only makes
// the already-created window visible once the same execution has registered it.
func waitAndShowRecorderWindow(ctx context.Context, recorder *appRecorder, executionID string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		recorder.mu.Lock()
		if recorder.executionID != executionID || !recorder.running {
			recorder.mu.Unlock()
			return nil
		}
		session := recorder.session
		recorder.mu.Unlock()
		if session != nil {
			if window, ok := session.Window(recorderbundle.RecorderWindowID); ok {
				_, err := window.Show(ctx)
				return err
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func readFileBytes(path string) ([]byte, error) {
	return osReadFile(path)
}

var osReadFile = func(path string) ([]byte, error) {
	return os.ReadFile(path)
}
