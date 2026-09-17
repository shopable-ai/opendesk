package flowcli

import (
	"context"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/productanalytics"
)

func runInstalledFlowExecution(parentEnvironment map[string]string, request pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
	request.Environment = productanalytics.StripPrivateEnvironment(request.Environment)
	bridge := productanalytics.NewLocalBridge(parentEnvironment)
	if bridge == nil {
		return pkgExecution.Run(request)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		bridge.Close(ctx)
	}()
	runID := productanalytics.NewRunID()
	return productanalytics.RunObserved(request, productanalytics.ExecutionLifecycle{
		Started: func() bool {
			return bridge.RunStarted("installed", runID)
		},
		Finished: func(status pkgExecution.ExecutionStatus) {
			switch status {
			case pkgExecution.ExecutionStatusSucceeded:
				bridge.RunFinished(runID, "success", "")
			case pkgExecution.ExecutionStatusFailed:
				bridge.RunFinished(runID, "failure", "execution_failed")
			case pkgExecution.ExecutionStatusTimedOut:
				bridge.RunFinished(runID, "failure", "timeout")
			case pkgExecution.ExecutionStatusCanceled:
				bridge.RunFinished(runID, "cancelled", "")
			}
		},
	})
}
