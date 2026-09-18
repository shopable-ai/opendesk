package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode/utf8"

	"opendesk/automation"
	"opendesk/pkg/customui"
	"opendesk/pkg/flowinstall"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/productanalytics"
	"opendesk/pkg/runtimeconfig"
	"opendesk/pkg/scriptloader"
)

const (
	appRecipeRunBusyCode     = "BUSY"
	appRecipeRunCanceledCode = "CANCELED"
	appRecipeRunFailedCode   = "EXECUTION_FAILED"
	appRecipeChangedCode     = "SCRIPT_CHANGED"
)

var errAppRecipeChanged = errors.New("Recipe changed after confirmation")

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
	analytics   *productanalytics.Service
	flowService *flowinstall.Service
	run         func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error)

	mu                    sync.Mutex
	running               bool
	executionID           string
	cancel                context.CancelFunc
	done                  chan struct{}
	recorderCaptureActive func() bool
}

func newAppRecipeRunner(config appRecipeRunnerConfig, environment map[string]string, driver customui.Driver) *appRecipeRunner {
	return &appRecipeRunner{
		config:      config,
		environment: productanalytics.StripPrivateEnvironment(environment),
		driver:      driver,
		analytics:   appProductAnalyticsServiceFromEnvironment(environment),
		run:         pkgExecution.Run,
	}
}

func (r *appRecipeRunner) ReserveExecutionID(kind string) string {
	if strings.EqualFold(strings.TrimSpace(kind), "flow") {
		return pkgExecution.NewExecutionID("app-flow")
	}
	return pkgExecution.NewExecutionID("app-recipe")
}

func appOwnedExecutionID(requested, prefix string) (string, error) {
	id := strings.TrimSpace(requested)
	if id == "" {
		return pkgExecution.NewExecutionID(prefix), nil
	}
	if !strings.HasPrefix(id, prefix+"-") || len(id) > 160 || strings.ContainsAny(id, "/\\\x00\r\n\t ") {
		return "", fmt.Errorf("invalid reserved Execution identity")
	}
	return id, nil
}

type appAssistantScriptSource struct {
	Path    string
	Ext     string
	Content []byte
}

func readAssistantScriptSource(input automation.AppOwnedScriptInspectRequest, maxBytes int64) (appAssistantScriptSource, error) {
	scriptPath, err := validatedAssistantScriptPath(input.ScriptPath, input.ScopeRoot)
	if err != nil {
		return appAssistantScriptSource{}, err
	}

	rootPath := filepath.Dir(scriptPath)
	if strings.TrimSpace(input.ScopeRoot) != "" {
		scopeRoot, err := filepath.Abs(strings.TrimSpace(input.ScopeRoot))
		if err != nil {
			return appAssistantScriptSource{}, fmt.Errorf("resolve Recipe scope: %w", err)
		}
		rootPath, err = filepath.EvalSymlinks(scopeRoot)
		if err != nil {
			return appAssistantScriptSource{}, fmt.Errorf("resolve Recipe scope target: %w", err)
		}
		rootPath, err = filepath.Abs(rootPath)
		if err != nil {
			return appAssistantScriptSource{}, err
		}
	}
	relative, err := filepath.Rel(rootPath, scriptPath)
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("resolve Recipe entry relative to authorized root: %w", err)
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return appAssistantScriptSource{}, errors.New("Recipe entry resolves outside the authorized root")
	}

	root, err := os.OpenRoot(rootPath)
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("open authorized Recipe root: %w", err)
	}
	defer root.Close()

	before, err := root.Lstat(relative)
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("inspect authorized Recipe entry: %w", err)
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
		return appAssistantScriptSource{}, errors.New("assistant Recipe entry must remain a real regular file")
	}

	file, err := root.Open(relative)
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("open authorized Recipe entry: %w", err)
	}
	defer file.Close()

	opened, err := file.Stat()
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("inspect opened Recipe entry: %w", err)
	}
	if !os.SameFile(before, opened) {
		return appAssistantScriptSource{}, errors.New("assistant Recipe entry changed during authorization")
	}

	var reader io.Reader = file
	if maxBytes > 0 {
		reader = io.LimitReader(file, maxBytes+1)
	}
	content, err := io.ReadAll(reader)
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("read authorized Recipe entry: %w", err)
	}
	if maxBytes > 0 && int64(len(content)) > maxBytes {
		return appAssistantScriptSource{}, errors.New("assistant source read exceeds 1 MiB")
	}

	after, err := file.Stat()
	if err != nil {
		return appAssistantScriptSource{}, fmt.Errorf("reinspect opened Recipe entry: %w", err)
	}
	if !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return appAssistantScriptSource{}, errors.New("assistant Recipe entry changed while being read")
	}

	return appAssistantScriptSource{
		Path:    scriptPath,
		Ext:     strings.ToLower(filepath.Ext(scriptPath)),
		Content: content,
	}, nil
}

func (r *appRecipeRunner) InspectScript(ctx context.Context, input automation.AppOwnedScriptInspectRequest) (automation.AppOwnedScriptInspection, error) {
	if r == nil {
		return automation.AppOwnedScriptInspection{}, errors.New("App Recipe Runner is unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return automation.AppOwnedScriptInspection{}, ctx.Err()
	default:
	}
	source, err := readAssistantScriptSource(input, 0)
	if err != nil {
		return automation.AppOwnedScriptInspection{}, err
	}
	return automation.AppOwnedScriptInspection{
		ScriptHash: pkgExecution.ComputeScriptHash(source.Content),
		Ext:        source.Ext,
	}, nil
}

func (r *appRecipeRunner) ReadScript(ctx context.Context, input automation.AppOwnedScriptInspectRequest) (automation.AppOwnedScriptSource, error) {
	if r == nil {
		return automation.AppOwnedScriptSource{}, errors.New("App Recipe Runner is unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-ctx.Done():
		return automation.AppOwnedScriptSource{}, ctx.Err()
	default:
	}
	source, err := readAssistantScriptSource(input, 1024*1024)
	if err != nil {
		return automation.AppOwnedScriptSource{}, err
	}
	if !utf8.Valid(source.Content) {
		return automation.AppOwnedScriptSource{}, errors.New("assistant source read requires UTF-8 JavaScript")
	}
	return automation.AppOwnedScriptSource{
		ScriptHash: pkgExecution.ComputeScriptHash(source.Content),
		Ext:        source.Ext,
		Content:    string(source.Content),
	}, nil
}

func (r *appRecipeRunner) Run(parent context.Context, input automation.AppOwnedScriptRunRequest) (automation.AppOwnedScriptRunResult, error) {
	if r == nil {
		return automation.AppOwnedScriptRunResult{}, errors.New("App Recipe Runner is unavailable")
	}
	if parent == nil {
		parent = context.Background()
	}
	if r.recorderCaptureActive != nil && r.recorderCaptureActive() {
		return automation.AppOwnedScriptRunResult{}, &automation.AppOwnedScriptRunError{
			Code: appRecipeRunBusyCode, Cause: errors.New(recorderConflictRecording),
		}
	}

	executionID, identityErr := appOwnedExecutionID(input.ExecutionID, "app-recipe")
	if identityErr != nil {
		return automation.AppOwnedScriptRunResult{}, identityErr
	}
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
		if errors.Is(err, errAppRecipeChanged) {
			return result, &automation.AppOwnedScriptRunError{Code: appRecipeChangedCode, Result: result, Cause: err}
		}
		return result, appRecipeRunError(result, err)
	}
	var runResult pkgExecution.ExecutionResult
	var runErr error
	if r.analytics != nil && r.analytics.Status().CaptureEnabled {
		runResult, _, runErr = runAppRecipeWithProductAnalytics(r.analytics, request)
	} else {
		runResult, _, runErr = r.run(request)
	}
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
	if strings.TrimSpace(input.ScopeRoot) != "" || strings.TrimSpace(input.ExpectedScriptHash) != "" {
		scriptPath, err = validatedAssistantScriptPath(scriptPath, input.ScopeRoot)
	} else {
		info, statErr := os.Lstat(scriptPath)
		if statErr != nil {
			err = fmt.Errorf("inspect Recipe: %w", statErr)
		} else if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			err = errors.New("Recipe path must be a real regular file")
		}
		if err == nil {
			ext := strings.ToLower(filepath.Ext(scriptPath))
			if ext != ".js" && ext != ".mjs" {
				err = errors.New("App Recipe Runner accepts JavaScript .js/.mjs files only")
			}
		}
	}
	if err != nil {
		return pkgExecution.Request{}, result, err
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

	inputValue, err := decodeAppExecutionInput(input.InputJSON)
	if err != nil {
		return pkgExecution.Request{}, result, err
	}
	var sourceContent []byte
	var sourceExt string
	var sourceLabel string
	if strings.TrimSpace(input.ScopeRoot) != "" || strings.TrimSpace(input.ExpectedScriptHash) != "" {
		assistantSource, sourceErr := readAssistantScriptSource(automation.AppOwnedScriptInspectRequest{
			ScriptPath: scriptPath,
			ScopeRoot:  input.ScopeRoot,
		}, 0)
		if sourceErr != nil {
			return pkgExecution.Request{}, result, sourceErr
		}
		scriptPath = assistantSource.Path
		sourceContent = assistantSource.Content
		sourceExt = assistantSource.Ext
		sourceLabel = "assistant-script:" + scriptPath
	} else {
		source, sourceErr := scriptloader.NewProductionFileLoader().Load(ctx, scriptPath)
		if sourceErr != nil {
			return pkgExecution.Request{}, result, sourceErr
		}
		sourceContent = source.Content
		sourceExt = source.Ext
		sourceLabel = source.Source
	}
	scriptHash := pkgExecution.ComputeScriptHash(sourceContent)
	if expected := strings.TrimSpace(input.ExpectedScriptHash); expected != "" && !strings.EqualFold(scriptHash, expected) {
		return pkgExecution.Request{}, result, errAppRecipeChanged
	}
	artifacts, err := pkgExecution.PrepareArtifacts(logDir, executionID, sourceExt)
	if err != nil {
		return pkgExecution.Request{}, result, err
	}
	if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, sourceContent); err != nil {
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
		SourceLabel:                     sourceLabel,
		ScriptPath:                      scriptPath,
		Ext:                             sourceExt,
		ScriptHash:                      scriptHash,
		StackMode:                       r.config.StackMode,
		ScriptContent:                   sourceContent,
		WorkDir:                         workDir,
		Environment:                     cloneStringMap(r.environment),
		Input:                           inputValue,
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

func validatedAssistantScriptPath(scriptValue, scopeValue string) (string, error) {
	scriptPath, err := filepath.Abs(strings.TrimSpace(scriptValue))
	if err != nil {
		return "", fmt.Errorf("resolve Recipe path: %w", err)
	}
	info, err := os.Lstat(scriptPath)
	if err != nil {
		return "", fmt.Errorf("inspect Recipe: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return "", errors.New("assistant Recipe entry must be a real regular file")
	}
	ext := strings.ToLower(filepath.Ext(scriptPath))
	if ext != ".js" && ext != ".mjs" {
		return "", errors.New("App Recipe Runner accepts JavaScript .js/.mjs files only")
	}
	resolvedScript, err := filepath.EvalSymlinks(scriptPath)
	if err != nil {
		return "", fmt.Errorf("resolve Recipe target: %w", err)
	}
	resolvedScript, err = filepath.Abs(resolvedScript)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(scopeValue) == "" {
		return filepath.Clean(resolvedScript), nil
	}
	scopeRoot, err := filepath.Abs(strings.TrimSpace(scopeValue))
	if err != nil {
		return "", fmt.Errorf("resolve Recipe scope: %w", err)
	}
	rootInfo, err := os.Lstat(scopeRoot)
	if err != nil {
		return "", fmt.Errorf("inspect Recipe scope: %w", err)
	}
	if rootInfo.Mode()&os.ModeSymlink != 0 || !rootInfo.IsDir() {
		return "", errors.New("Recipe scope must be a real directory")
	}
	resolvedRoot, err := filepath.EvalSymlinks(scopeRoot)
	if err != nil {
		return "", fmt.Errorf("resolve Recipe scope target: %w", err)
	}
	// The scope entry itself must be a real directory (checked with Lstat above),
	// but macOS commonly exposes otherwise-real temp paths through system-level
	// ancestor aliases such as /var -> /private/var. Compare the canonical
	// targets instead of rejecting that platform alias. A script still cannot
	// escape the authorized canonical scope.
	relative, err := filepath.Rel(resolvedRoot, resolvedScript)
	if err != nil {
		return "", fmt.Errorf("compare Recipe scope: %w", err)
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", errors.New("Recipe entry resolves outside the authorized automation directory")
	}
	return filepath.Clean(resolvedScript), nil
}

func (r *appRecipeRunner) InspectFlow(ctx context.Context, input automation.AppOwnedFlowInspectRequest) (automation.AppOwnedFlowInspection, error) {
	if r == nil || r.flowService == nil { return automation.AppOwnedFlowInspection{}, errors.New("App Flow service is unavailable") }
	if ctx == nil { ctx = context.Background() }
	record, err := r.flowService.Catalog.Load(strings.TrimSpace(input.InstallID)); if err != nil { return automation.AppOwnedFlowInspection{}, err }
	inspection := appFlowInspection(record)
	if record.State != flowinstall.StateReady { return inspection, nil }
	lease, err := r.flowService.AcquireRun(ctx, record.InstallID)
	if err != nil { inspection.StateReason = "Flow failed current host availability checks"; return inspection, nil }
	defer lease.Close()
	// AcquireRun is the canonical run-readiness authority: it first performs
	// transaction recovery and then reloads/verifies the catalog record. Build
	// the preview from that post-recovery record so preview and final recheck
	// compare the same authoritative state rather than a pre-recovery snapshot.
	inspection = appFlowInspection(lease.Record)
	source, err := scriptloader.NewProductionFileLoader().Load(ctx, lease.Entry)
	if err != nil { inspection.StateReason = "Flow content is not currently loadable"; return inspection, nil }
	inspection.Protected = source.Protection.Mode == scriptloader.ProtectionProtected
	if inspection.Protected { wipeAppFlowBytes(source.Content) }
	invocation, invocationErr := loadAppFlowInvocation(lease)
	if invocationErr != nil {
		inspection.StateReason = "Flow assistant invocation contract is invalid"
		inspection.Runnable = false
		return inspection, nil
	}
	inspection.Invocation = invocation
	inspection.Runnable = true
	return inspection, nil
}

func (r *appRecipeRunner) RunFlow(parent context.Context, input automation.AppOwnedFlowRunRequest) (automation.AppOwnedFlowRunResult, error) {
	if r == nil || r.flowService == nil { return automation.AppOwnedFlowRunResult{}, errors.New("App Flow service is unavailable") }
	if parent == nil { parent = context.Background() }
	if r.recorderCaptureActive != nil && r.recorderCaptureActive() { return automation.AppOwnedFlowRunResult{}, &automation.AppOwnedFlowRunError{Code: appRecipeRunBusyCode, Cause: errors.New(recorderConflictRecording)} }
	executionID, identityErr := appOwnedExecutionID(input.ExecutionID, "app-flow")
	if identityErr != nil { return automation.AppOwnedFlowRunResult{}, identityErr }
	ctx, cancel := context.WithCancel(parent); done := make(chan struct{})
	r.mu.Lock()
	if r.running { r.mu.Unlock(); cancel(); return automation.AppOwnedFlowRunResult{}, &automation.AppOwnedFlowRunError{Code: appRecipeRunBusyCode, Cause: errors.New(recorderConflictScript)} }
	r.running, r.executionID, r.cancel, r.done = true, executionID, cancel, done
	r.mu.Unlock()
	defer func() { cancel(); close(done); r.clear(executionID) }()
	result := automation.AppOwnedFlowRunResult{ExecutionID: executionID, Status: "failed"}
	lease, err := r.flowService.AcquireRun(ctx, strings.TrimSpace(input.InstallID)); if err != nil { return result, appFlowRunError(result, err) }
	defer lease.Close()
	if lease.Record.ArchiveDigest != strings.TrimSpace(input.ExpectedArchiveDigest) || lease.Record.ManifestDigest != strings.TrimSpace(input.ExpectedManifestDigest) {
		return result, &automation.AppOwnedFlowRunError{Code: "FLOW_CHANGED", Result: result, Cause: errors.New("installed Flow changed after confirmation")}
	}
	request, result, err := r.flowRequest(ctx, executionID, lease, input); if err != nil { return result, appFlowRunError(result, err) }
	runResult, _, runErr := r.run(request)
	result.ExecutionID = runResult.ExecutionID; result.Status = string(runResult.Status); result.Error = runResult.Error; result.LogDir = runResult.Artifacts.RunDir
	if runErr != nil || runResult.Status != pkgExecution.ExecutionStatusSucceeded {
		if runErr == nil { if runResult.Error != "" { runErr = errors.New(runResult.Error) } else { runErr = fmt.Errorf("Flow execution ended with status %s", runResult.Status) } }
		return result, appFlowRunError(result, runErr)
	}
	return result, nil
}

func (r *appRecipeRunner) flowRequest(ctx context.Context, executionID string, lease *flowinstall.RunLease, input automation.AppOwnedFlowRunRequest) (pkgExecution.Request, automation.AppOwnedFlowRunResult, error) {
	result := automation.AppOwnedFlowRunResult{ExecutionID: executionID, Status: "failed"}
	workDir, err := filepath.Abs(strings.TrimSpace(input.WorkDir)); if err != nil { return pkgExecution.Request{}, result, fmt.Errorf("resolve Flow workdir: %w", err) }
	workInfo, err := os.Stat(workDir); if err != nil { return pkgExecution.Request{}, result, fmt.Errorf("inspect Flow workdir: %w", err) }
	if !workInfo.IsDir() { return pkgExecution.Request{}, result, errors.New("Flow workdir must be a directory") }
	logDir := strings.TrimSpace(input.LogDir); if !filepath.IsAbs(logDir) { logDir = filepath.Join(workDir, logDir) }
	logDir, err = filepath.Abs(logDir); if err != nil { return pkgExecution.Request{}, result, fmt.Errorf("resolve Flow log directory: %w", err) }
	result.LogDir = logDir
	inputValue, err := decodeAppExecutionInput(input.InputJSON); if err != nil { return pkgExecution.Request{}, result, err }
	source, err := scriptloader.NewProductionFileLoader().Load(ctx, lease.Entry); if err != nil { return pkgExecution.Request{}, result, err }
	protected := source.Protection.Mode == scriptloader.ProtectionProtected; if protected { defer wipeAppFlowBytes(source.Content) }
	artifacts, err := pkgExecution.PrepareArtifacts(logDir, executionID, source.Ext); if err != nil { return pkgExecution.Request{}, result, err }
	scriptHash := pkgExecution.ComputeScriptHash(source.Content); meta := map[string]any{"flow": lease.Record}
	if protected { artifacts.ScriptSnapshotPath = ""; scriptHash = source.Protection.PackageDigest; meta["protection"] = source.Protection
	} else if err := persistExecutionSnapshots("", artifacts.ScriptSnapshotPath, source.Content); err != nil { return pkgExecution.Request{}, result, err }
	activation, err := runtimeconfig.ResolveUI(runtimeconfig.UIResolveOptions{ScriptPath: lease.Entry}); if err != nil { return pkgExecution.Request{}, result, err }
	request := pkgExecution.Request{
		Context: ctx, ExpectedCancellation: func() bool { return ctx.Err() != nil }, ExecutionID: executionID,
		SourceLabel: "installed-flow:" + lease.Record.InstallID, ScriptPath: lease.Entry, Ext: source.Ext, ScriptHash: scriptHash,
		ScriptContent: source.Content, WorkDir: workDir, Environment: cloneStringMap(r.environment), Input: inputValue,
		Flow: &pkgExecution.FlowContext{Root: lease.Root, DataDir: lease.DataDir}, TimeoutMinutes: 0,
		EnableNativeExtensions: true, EnableUnsafeNativeExtensionCall: r.config.ExperimentalUnsafeNativeExtensionCall,
		EnableCommand: true, EnableDownload: true, EnableWebhook: true, EnableAccessibility: true, EnableSQLite: true,
		EnableRecorderCapture: false, SQLiteProtectedPaths: append([]string(nil), r.config.SQLiteProtectedPaths...),
		EnableCustomUI: activation.Enabled, CustomUIActivationSource: activation.Source, CustomUIHostPath: r.config.CustomUIHostPath,
		CustomUIBaseDir: lease.Root, Meta: meta, Artifacts: artifacts, Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	}
	if activation.Enabled { request.CustomUIDriver = customui.NewSessionScopedDriverForSession(r.driver, executionID) }
	return request, result, nil
}
func appFlowInspection(record flowinstall.Record) automation.AppOwnedFlowInspection {
	return automation.AppOwnedFlowInspection{InstallID: record.InstallID, FlowID: record.FlowID, Name: record.Name, Version: record.Version,
		PublisherID: record.PublisherID, PublisherFingerprint: record.PublisherFingerprint, State: string(record.State), StateReason: record.StateReason,
		Origin: record.Origin, ArchiveDigest: record.ArchiveDigest, ManifestDigest: record.ManifestDigest}
}
func decodeAppExecutionInput(raw string) (any, error) {
	if strings.TrimSpace(raw) == "" { raw = "{}" }
	if len(raw) > 256<<10 { return nil, errors.New("Execution input exceeds 256 KiB") }
	decoder := json.NewDecoder(strings.NewReader(raw)); var value any
	if err := decoder.Decode(&value); err != nil { return nil, fmt.Errorf("decode Flow input: %w", err) }
	if _, ok := value.(map[string]any); !ok { return nil, errors.New("Flow input must be a JSON object") }
	var trailing any; if err := decoder.Decode(&trailing); err != io.EOF { return nil, errors.New("Flow input contains trailing JSON data") }
	return value, nil
}
func wipeAppFlowBytes(value []byte) { for index := range value { value[index] = 0 } }
func appFlowRunError(result automation.AppOwnedFlowRunResult, cause error) error {
	code := appRecipeRunFailedCode
	if result.Status == string(pkgExecution.ExecutionStatusCanceled) || errors.Is(cause, context.Canceled) || errors.Is(cause, context.DeadlineExceeded) { code = appRecipeRunCanceledCode; result.Status = string(pkgExecution.ExecutionStatusCanceled)
	} else if flowCode := flowinstall.CodeOf(cause); flowCode != "" { code = string(flowCode) }
	return &automation.AppOwnedFlowRunError{Code: code, Result: result, Cause: cause}
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
