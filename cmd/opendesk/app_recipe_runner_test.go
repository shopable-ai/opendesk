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

func TestAppRecipeRunnerRejectsWhileRecorderIsRunning(t *testing.T) {
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	runner.recorderRunning = func() bool { return true }
	_, err := runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{})
	var typed *automation.AppOwnedScriptRunError
	if !errors.As(err, &typed) || typed.Code != appRecipeRunBusyCode || typed.Error() != recorderConflictRecording {
		t.Fatalf("conflict error=%T %v", err, err)
	}
}
