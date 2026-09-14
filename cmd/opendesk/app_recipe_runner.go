package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"opendesk/automation"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/runtimeconfig"
	"opendesk/pkg/scriptloader"
)

const (
	appRecipeRunBusyCode     = "BUSY"
	appRecipeRunCanceledCode = "CANCELED"
	appRecipeRunFailedCode   = "EXECUTION_FAILED"
)

type appRecipeRunnerConfig struct {
	StackMode                             string
	ExperimentalUnsafeNativeExtensionCall bool
	CustomUIHostPath                      string
	SQLiteProtectedPaths                  []string
}

// appRecipeRunner owns the bundled product's ordinary Recipe execution. Each
// Recipe still receives a fresh pkg/execution Runtime and lifecycle, but it
// stays in the App host process so macOS TCC evaluates the installed App
// identity rather than an independently launched command-line child.
type appRecipeRunner struct {
	config      appRecipeRunnerConfig
	environment map[string]string
	driver      customui.Driver
	run         func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error)

	mu              sync.Mutex
	running         bool
	executionID     string
	cancel          context.CancelFunc
	done            chan struct{}
	recorderRunning func() bool
}

func newAppRecipeRunner(config appRecipeRunnerConfig, environment map[string]string, driver customui.Driver) *appRecipeRunner {
	return &appRecipeRunner{
		config: config, environment: cloneStringMap(environment), driver: driver, run: pkgExecution.Run,
	}
}

func (r *appRecipeRunner) Run(parent context.Context, input automation.AppOwnedScriptRunRequest) (automation.AppOwnedScriptRunResult, error) {
	if r == nil {
		return automation.AppOwnedScriptRunResult{}, errors.New("App Recipe Runner is unavailable")
	}
	if parent == nil {
		parent = context.Background()
	}
	if r.recorderRunning != nil && r.recorderRunning() {
		return automation.AppOwnedScriptRunResult{}, &automation.AppOwnedScriptRunError{
			Code: appRecipeRunBusyCode, Cause: errors.New(recorderConflictRecording),
		}
	}

	executionID := pkgExecution.NewExecutionID("app-recipe")
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	r.mu.Lock()
	if r.running {
		r.mu.Unlock()
		cancel()
		return automation.AppOwnedScriptRunResult{}, &automation.AppOwnedScriptRunError{
			Code: appRecipeRunBusyCode, Cause: errors.New(recorderConflictScript),
		}
	}
	r.running, r.executionID, r.cancel, r.done = true, executionID, cancel, done
	r.mu.Unlock()
	defer func() {
		cancel()
		close(done)
		r.clear(executionID)
	}()

	request, result, err := r.request(ctx, executionID, input)
	if err != nil {
		return result, appRecipeRunError(result, err)
	}
	runResult, _, runErr := r.run(request)
	result.ExecutionID = runResult.ExecutionID
	result.Status = string(runResult.Status)
	result.Error = runResult.Error
	result.LogDir = runResult.Artifacts.RunDir
	if runErr != nil || runResult.Status != pkgExecution.ExecutionStatusSucceeded {
		if runErr == nil {
			if runResult.Error != "" {
				runErr = errors.New(runResult.Error)
			} else {
				runErr = fmt.Errorf("Recipe execution ended with status %s", runResult.Status)
			}
		}
		return result, appRecipeRunError(result, runErr)
	}
	return result, nil
}

func (r *appRecipeRunner) request(ctx context.Context, executionID string, input automation.AppOwnedScriptRunRequest) (pkgExecution.Request, automation.AppOwnedScriptRunResult, error) {
	result := automation.AppOwnedScriptRunResult{ExecutionID: executionID, Status: "failed"}
	scriptPath, err := filepath.Abs(strings.TrimSpace(input.ScriptPath))
	if err != nil {
		return pkgExecution.Request{}, result, fmt.Errorf("resolve Recipe path: %w", err)
	}
	if !strings.EqualFold(filepath.Ext(scriptPath), ".js") {
		return pkgExecution.Request{}, result, errors.New("App Recipe Runner accepts JavaScript .js files only")
	}
	info, err := os.Stat(scriptPath)
	if err != nil {
		return pkgExecution.Request{}, result, fmt.Errorf("inspect Recipe: %w", err)
	}
	if !info.Mode().IsRegular() {
		return pkgExecution.Request{}, result, errors.New("Recipe path must be a regular file")
	}

	workDir, err := filepath.Abs(strings.TrimSpace(input.WorkDir))
	if err != nil {
		return pkgExecution.Request{}, result, fmt.Errorf("resolve Recipe workdir: %w", err)
	}
	workInfo, err := os.Stat(workDir)
	if err != nil {
		return pkgExecution.Request{}, result, fmt.Errorf("inspect Recipe workdir: %w", err)
	}
	if !workInfo.IsDir() {
		return pkgExecution.Request{}, result, errors.New("Recipe workdir must be a directory")
	}
	logDir := strings.TrimSpace(input.LogDir)
	if !filepath.IsAbs(logDir) {
		logDir = filepath.Join(workDir, logDir)
	}
	logDir, err = filepath.Abs(logDir)
	if err != nil {
		return pkgExecution.Request{}, result, fmt.Errorf("resolve Recipe log directory: %w", err)
	}
	result.LogDir = logDir

	source, err := scriptloader.NewProductionFileLoader().Load(ctx, scriptPath)
	if err != nil {
		return pkgExecution.Request{}, result, err
	}
	artifacts, err := pkgExecution.PrepareArtifacts(logDir, executionID, source.Ext)
	if err != nil {
		return pkgExecution.Request{}, result, err
	}
	if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, source.Content); err != nil {
		return pkgExecution.Request{}, result, err
	}
	activation, err := runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{ScriptPath: scriptPath})
	if err != nil {
		return pkgExecution.Request{}, result, err
	}

	request := pkgExecution.Request{
		Context:                         ctx,
		ExpectedCancellation:            func() bool { return ctx.Err() != nil },
		ExecutionID:                     executionID,
		SourceLabel:                     source.Source,
		ScriptPath:                      scriptPath,
		Ext:                             source.Ext,
		StackMode:                       r.config.StackMode,
		ScriptContent:                   source.Content,
		WorkDir:                         workDir,
		Environment:                     cloneStringMap(r.environment),
		TimeoutMinutes:                  0,
		EnableNativeExtensions:          true,
		EnableUnsafeNativeExtensionCall: r.config.ExperimentalUnsafeNativeExtensionCall,
		EnableCommand:                   true,
		EnableDownload:                  true,
		EnableWebhook:                   true,
		EnableAccessibility:             true,
		EnableSQLite:                    true,
		EnableRecorderCapture:           false,
		SQLiteProtectedPaths:            append([]string(nil), r.config.SQLiteProtectedPaths...),
		EnableCustomUI:                  activation.Enabled,
		CustomUIActivationSource:        activation.Source,
		CustomUIHostPath:                r.config.CustomUIHostPath,
		CustomUIBaseDir:                 filepath.Dir(scriptPath),
		Artifacts:                       artifacts,
		Selection: pkgExecution.TerminalSelection{
			Mode: "quiet", Categories: map[string]bool{},
		},
	}
	if activation.Enabled {
		request.CustomUIDriver = customui.NewSessionScopedDriverForSession(r.driver, executionID)
	}
	return request, result, nil
}

func appRecipeRunError(result automation.AppOwnedScriptRunResult, cause error) error {
	code := appRecipeRunFailedCode
	if result.Status == string(pkgExecution.ExecutionStatusCanceled) || errors.Is(cause, context.Canceled) {
		code = appRecipeRunCanceledCode
		result.Status = string(pkgExecution.ExecutionStatusCanceled)
	}
	return &automation.AppOwnedScriptRunError{Code: code, Result: result, Cause: cause}
}

func (r *appRecipeRunner) Running() bool {
	if r == nil {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.running
}

func (r *appRecipeRunner) clear(executionID string) {
	r.mu.Lock()
	if r.executionID == executionID {
		r.running = false
		r.executionID = ""
		r.cancel = nil
		r.done = nil
	}
	r.mu.Unlock()
}

func (r *appRecipeRunner) Close() {
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

func cloneStringMap(values map[string]string) map[string]string {
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
