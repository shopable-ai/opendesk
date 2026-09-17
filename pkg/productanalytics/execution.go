package productanalytics

import (
	"time"

	pkgExecution "opendesk/pkg/execution"
)

// ExecutionLifecycle contains trusted host callbacks for one product-owned
// execution. Started runs only after pkg/execution has normalized the request
// and emitted its canonical "script execution started" event. Finished runs
// only after that start was accepted and pkg/execution returned a terminal
// status. Callback failures never affect the business execution.
type ExecutionLifecycle struct {
	Started  func() bool
	Finished func(pkgExecution.ExecutionStatus)
}

// RunObserved preserves pkg/execution.Run semantics while observing the
// existing Emitter lifecycle instead of guessing start from a Run button,
// command launch, queue admission, or preflight request.
func RunObserved(req pkgExecution.Request, lifecycle ExecutionLifecycle) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
	startedAt := time.Now()
	emitter, err := pkgExecution.NewEmitter(req.ExecutionID, req.Selection, req.Artifacts, startedAt)
	if err != nil {
		return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, err
	}
	defer emitter.Close()

	subscriptionID, events := emitter.Subscribe(32)
	observerDone := make(chan bool, 1)
	go func() {
		accepted := false
		seenStart := false
		for event := range events {
			if seenStart {
				continue
			}
			if event.Kind == "status" && event.Message == "script execution started" {
				seenStart = true
				accepted = safeStarted(lifecycle.Started)
			}
		}
		observerDone <- accepted
	}()

	result, summary, runErr := pkgExecution.RunWithEmitter(req, emitter)
	emitter.Unsubscribe(subscriptionID)
	accepted := <-observerDone
	if accepted && lifecycle.Finished != nil {
		status := result.Status
		if !terminalExecutionStatus(status) {
			status = emitter.Result().Status
		}
		if terminalExecutionStatus(status) {
			safeFinished(lifecycle.Finished, status)
		}
	}
	return result, summary, runErr
}

func terminalExecutionStatus(status pkgExecution.ExecutionStatus) bool {
	switch status {
	case pkgExecution.ExecutionStatusSucceeded,
		pkgExecution.ExecutionStatusFailed,
		pkgExecution.ExecutionStatusTimedOut,
		pkgExecution.ExecutionStatusCanceled:
		return true
	default:
		return false
	}
}

func safeStarted(callback func() bool) (accepted bool) {
	if callback == nil {
		return false
	}
	defer func() {
		if recover() != nil {
			accepted = false
		}
	}()
	return callback()
}

func safeFinished(callback func(pkgExecution.ExecutionStatus), status pkgExecution.ExecutionStatus) {
	if callback == nil {
		return
	}
	defer func() { _ = recover() }()
	callback(status)
}
