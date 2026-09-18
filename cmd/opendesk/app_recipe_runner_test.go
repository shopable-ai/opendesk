package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/automation"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/flowinstall"
)

func TestAppRecipeRunnerUsesASeparateInProcessExecutionAndArtifacts(t *testing.T) {
	workDir := t.TempDir()
	scriptPath := filepath.Join(workDir, "recipe.js")
	if err := os.WriteFile(scriptPath, []byte(`console.log("APP_RECIPE_EXECUTION_OK");`), 0o600); err != nil {
		t.Fatal(err)
	}
	logDir := filepath.Join(workDir, ".runtime", "run")
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, map[string]string{"APP_RECIPE_TEST": "1"}, nil)

	result, err := runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{
		ScriptPath: scriptPath,
		WorkDir:    workDir,
		LogDir:     logDir,
	})
	if err != nil {
		t.Fatalf("run App-owned Recipe: %v", err)
	}
	if result.Status != string(pkgExecution.ExecutionStatusSucceeded) || result.ExecutionID == "" {
		t.Fatalf("result=%+v", result)
	}
	if result.LogDir != logDir {
		t.Fatalf("logDir=%q, want %q", result.LogDir, logDir)
	}
	stdout, err := os.ReadFile(filepath.Join(logDir, "stdout.log"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(stdout), "APP_RECIPE_EXECUTION_OK") {
		t.Fatalf("stdout=%q", stdout)
	}
	for _, name := range []string{"script_snapshot.js", "events.ndjson", "summary.json", "agent_summary.json"} {
		if info, statErr := os.Stat(filepath.Join(logDir, name)); statErr != nil || !info.Mode().IsRegular() {
			t.Fatalf("artifact %s: info=%v err=%v", name, info, statErr)
		}
	}
	if runner.Running() {
		t.Fatal("runner remained active after completion")
	}
}

func TestAppRecipeRunnerCancellationPropagatesAsCanceled(t *testing.T) {
	workDir := t.TempDir()
	scriptPath := filepath.Join(workDir, "recipe.js")
	if err := os.WriteFile(scriptPath, []byte(`await new Promise(() => {});`), 0o600); err != nil {
		t.Fatal(err)
	}
	logDir := filepath.Join(workDir, ".runtime", "run")
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	started := make(chan struct{})
	runner.run = func(request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		close(started)
		<-request.Context.Done()
		return pkgExecution.ExecutionResult{
			ExecutionID: request.ExecutionID,
			Status:      pkgExecution.ExecutionStatusCanceled,
			Error:       request.Context.Err().Error(),
			Artifacts:   request.Artifacts,
		}, pkgExecution.AgentSummary{}, request.Context.Err()
	}

	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan error, 1)
	go func() {
		_, runErr := runner.Run(ctx, automation.AppOwnedScriptRunRequest{
			ScriptPath: scriptPath, WorkDir: workDir, LogDir: logDir,
		})
		finished <- runErr
	}()
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("App-owned Recipe did not start")
	}
	cancel()
	select {
	case runErr := <-finished:
		var typed *automation.AppOwnedScriptRunError
		if !errors.As(runErr, &typed) || typed.Code != appRecipeRunCanceledCode {
			t.Fatalf("cancellation error=%T %v", runErr, runErr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("App-owned Recipe did not stop after cancellation")
	}
}

func TestAppRecipeRunnerAllowsRunWhileRecorderTrayIsOpenButNotCapturing(t *testing.T) {
	workDir := t.TempDir()
	scriptPath := filepath.Join(workDir, "recipe.js")
	if err := os.WriteFile(scriptPath, []byte(`console.log("APP_RECIPE_TRAY_OK");`), 0o600); err != nil {
		t.Fatal(err)
	}

	recorder := &appRecorder{running: true, executionID: "recorder-tray"}
	if !recorder.Running() || recorder.CaptureActive() {
		t.Fatalf("Recorder tray state running=%t captureActive=%t", recorder.Running(), recorder.CaptureActive())
	}
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	runner.recorderCaptureActive = recorder.CaptureActive
	runCalled := false
	runner.run = func(request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
		runCalled = true
		return pkgExecution.ExecutionResult{
			ExecutionID: request.ExecutionID,
			Status:      pkgExecution.ExecutionStatusSucceeded,
			Artifacts:   request.Artifacts,
		}, pkgExecution.AgentSummary{}, nil
	}
	if _, err := runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{
		ScriptPath: scriptPath, WorkDir: workDir, LogDir: filepath.Join(workDir, ".runtime", "run"),
	}); err != nil {
		t.Fatalf("Recipe was blocked by an idle Recorder tray: %v", err)
	}
	if !runCalled {
		t.Fatal("Recipe runner did not invoke its execution")
	}
}

func TestAppRecipeRunnerRejectsWhileRecorderCaptureIsActive(t *testing.T) {
	recorder := &appRecorder{running: true, captureActive: true, executionID: "recorder-capture"}
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	runner.recorderCaptureActive = recorder.CaptureActive
	_, err := runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{})
	var typed *automation.AppOwnedScriptRunError
	if !errors.As(err, &typed) || typed.Code != appRecipeRunBusyCode || typed.Error() != recorderConflictRecording {
		t.Fatalf("conflict error=%T %v", err, err)
	}
}

func TestAppRecipeRunnerInstalledFlowUsesCanonicalCatalogAndExecutionInput(t *testing.T) {
	root := t.TempDir()
	service, err := flowinstall.NewService(flowinstall.Roots{FlowRoot: filepath.Join(root, "flows"), DataRoot: filepath.Join(root, "flow-data"), StateRoot: filepath.Join(root, "flow-state"), TrustRoot: filepath.Join(root, "flow-state", "trust")})
	if err != nil { t.Fatal(err) }
	sourceDir := t.TempDir()
	sourcePath := filepath.Join(sourceDir, "business-sample.js")
	if err := os.WriteFile(sourcePath, []byte(`console.log("FLOW_INPUT=" + JSON.stringify(Execution.input));`), 0o600); err != nil { t.Fatal(err) }
	installed, err := service.InstallScript(context.Background(), sourcePath); if err != nil { t.Fatal(err) }
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, map[string]string{"APP_FLOW_TEST":"1"}, nil); runner.flowService = service
	inspection, err := runner.InspectFlow(context.Background(), automation.AppOwnedFlowInspectRequest{InstallID: installed.Record.InstallID})
	if err != nil { t.Fatalf("inspect installed Flow: %v", err) }
	if !inspection.Runnable || inspection.InstallID != installed.Record.InstallID || inspection.ManifestDigest != installed.Record.ManifestDigest { t.Fatalf("inspection=%+v", inspection) }
	workDir := t.TempDir(); logDir := filepath.Join(workDir, ".runtime", "flow")
	result, err := runner.RunFlow(context.Background(), automation.AppOwnedFlowRunRequest{InstallID: installed.Record.InstallID, WorkDir: workDir, LogDir: logDir, InputJSON: `{"amount":17,"nested":{"ok":true}}`, ExpectedArchiveDigest: installed.Record.ArchiveDigest, ExpectedManifestDigest: installed.Record.ManifestDigest})
	if err != nil { t.Fatalf("run installed Flow: %v", err) }
	if result.Status != string(pkgExecution.ExecutionStatusSucceeded) || result.ExecutionID == "" { t.Fatalf("result=%+v", result) }
	stdout, err := os.ReadFile(filepath.Join(logDir, "stdout.log")); if err != nil { t.Fatal(err) }
	if !strings.Contains(string(stdout), `FLOW_INPUT={"amount":17,"nested":{"ok":true}}`) { t.Fatalf("stdout=%q", stdout) }
	_, err = runner.RunFlow(context.Background(), automation.AppOwnedFlowRunRequest{InstallID: installed.Record.InstallID, WorkDir: workDir, LogDir: filepath.Join(workDir, ".runtime", "changed"), InputJSON: `{"amount":18}`, ExpectedArchiveDigest: "stale", ExpectedManifestDigest: installed.Record.ManifestDigest})
	var flowErr *automation.AppOwnedFlowRunError
	if !errors.As(err, &flowErr) || flowErr.Code != "FLOW_CHANGED" { t.Fatalf("changed Flow error=%T %v", err, err) }
}
