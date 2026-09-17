package productanalytics

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

func observedRequest(t *testing.T, ctx context.Context, source string) pkgExecution.Request {
	t.Helper()
	root := t.TempDir()
	executionID := pkgExecution.NewExecutionID("analytics-observed")
	artifacts, err := pkgExecution.PrepareArtifacts(filepath.Join(root, "run"), executionID, ".js")
	if err != nil {
		t.Fatal(err)
	}
	return pkgExecution.Request{
		Context: ctx, ExecutionID: executionID, SourceLabel: source,
		Ext: ".js", ScriptContent: []byte(`console.log("observed");`), WorkDir: root,
		Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}, ColorMode: "never"},
	}
}

func TestRunObservedUsesTrustedExecutionLifecycle(t *testing.T) {
	request := observedRequest(t, context.Background(), "analytics-success")
	started := 0
	var finished pkgExecution.ExecutionStatus
	result, _, err := RunObserved(request, ExecutionLifecycle{
		Started: func() bool { started++; return true },
		Finished: func(status pkgExecution.ExecutionStatus) { finished = status },
	})
	if err != nil {
		t.Fatalf("RunObserved success: %v", err)
	}
	if started != 1 || result.Status != pkgExecution.ExecutionStatusSucceeded || finished != pkgExecution.ExecutionStatusSucceeded {
		t.Fatalf("started=%d result=%s finished=%s", started, result.Status, finished)
	}
}

func TestRunObservedStartupRejectDoesNotEmitAnalyticsStart(t *testing.T) {
	request := observedRequest(t, context.Background(), "analytics-startup-reject")
	request.WorkDir = filepath.Join(t.TempDir(), "missing")
	started := 0
	finished := 0
	_, _, err := RunObserved(request, ExecutionLifecycle{
		Started: func() bool { started++; return true },
		Finished: func(pkgExecution.ExecutionStatus) { finished++ },
	})
	if err == nil {
		t.Fatal("invalid workdir unexpectedly started")
	}
	if started != 0 || finished != 0 {
		t.Fatalf("startup rejection leaked lifecycle callbacks: started=%d finished=%d", started, finished)
	}
}

func TestRunObservedFailureAndCancellationUseRealTerminalStatus(t *testing.T) {
	t.Run("failure", func(t *testing.T) {
		request := observedRequest(t, context.Background(), "analytics-failure")
		request.ScriptContent = []byte(`throw new Error("synthetic failure");`)
		var finished pkgExecution.ExecutionStatus
		result, _, err := RunObserved(request, ExecutionLifecycle{
			Started:  func() bool { return true },
			Finished: func(status pkgExecution.ExecutionStatus) { finished = status },
		})
		if err == nil || result.Status != pkgExecution.ExecutionStatusFailed || finished != pkgExecution.ExecutionStatusFailed {
			t.Fatalf("err=%v result=%s finished=%s", err, result.Status, finished)
		}
	})

	t.Run("cancel", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		request := observedRequest(t, ctx, "analytics-cancel")
		request.ScriptContent = []byte(`await new Promise(() => {});`)
		started := make(chan struct{})
		var finished pkgExecution.ExecutionStatus
		done := make(chan struct{})
		var result pkgExecution.ExecutionResult
		var runErr error
		go func() {
			result, _, runErr = RunObserved(request, ExecutionLifecycle{
				Started: func() bool { close(started); return true },
				Finished: func(status pkgExecution.ExecutionStatus) { finished = status },
			})
			close(done)
		}()
		select {
		case <-started:
		case <-time.After(2 * time.Second):
			t.Fatal("execution did not reach trusted started state")
		}
		cancel()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			t.Fatal("execution did not cancel")
		}
		if runErr == nil || result.Status != pkgExecution.ExecutionStatusCanceled || finished != pkgExecution.ExecutionStatusCanceled {
			t.Fatalf("err=%v result=%s finished=%s", runErr, result.Status, finished)
		}
	})
}

func TestRunObservedAnalyticsCallbackFailureNeverBreaksBusinessExecution(t *testing.T) {
	request := observedRequest(t, context.Background(), "analytics-fail-open")
	result, _, err := RunObserved(request, ExecutionLifecycle{
		Started: func() bool { panic("analytics callback failure") },
		Finished: func(pkgExecution.ExecutionStatus) { panic("must not run when start was rejected") },
	})
	if err != nil || result.Status != pkgExecution.ExecutionStatusSucceeded {
		t.Fatalf("analytics callback affected execution: result=%s err=%v", result.Status, err)
	}
	if _, statErr := os.Stat(request.Artifacts.AgentSummaryPath); statErr != nil {
		t.Fatalf("business execution artifacts missing after analytics callback failure: %v", statErr)
	}
}
