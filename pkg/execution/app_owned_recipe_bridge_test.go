package execution

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opendesk/automation"
	"opendesk/pkg/appshell"
)

func TestAppOwnedRecipeBridgeTransfersPlainInputsAndCancellation(t *testing.T) {
	manifest, err := appshell.ParseManifest([]byte(`{
		"id":"com.opendesk.app-owned-recipe-test",
		"entry":"main.js",
		"singleInstance":false,
		"window":{"mainId":"main","closeBehavior":"quit"},
		"tray":{"enabled":false}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	shell, err := appshell.New(manifest, nil)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	shell.SetQuitHook(cancel)
	if err := shell.Start(ctx); err != nil {
		t.Fatal(err)
	}

	scriptPath := filepath.Join("..", "..", "tests", "runtime-api", "seams", "app-owned-recipe-execution.js")
	source, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	type observed struct {
		First    automation.AppOwnedScriptRunResult `json:"first"`
		Canceled struct {
			Code        string `json:"code"`
			Status      string `json:"status"`
			ExecutionID string `json:"executionId"`
			LogDir      string `json:"logDir"`
		} `json:"canceled"`
	}
	var evidence observed
	requests := make(chan automation.AppOwnedScriptRunRequest, 2)
	result, _, runErr := Run(Request{
		Context: ctx, ExecutionID: NewExecutionID("app-owned-recipe-bridge"),
		SourceLabel: "App-owned Recipe bridge seam", ScriptPath: scriptPath,
		ScriptContent: source, Ext: ".js", WorkDir: t.TempDir(), AppShell: shell,
		AppOwnedScriptRun: func(runContext context.Context, request automation.AppOwnedScriptRunRequest) (automation.AppOwnedScriptRunResult, error) {
			requests <- request
			if request.ScriptPath == "/recipes/first.js" {
				return automation.AppOwnedScriptRunResult{
					ExecutionID: "app-recipe-first", Status: "succeeded", LogDir: request.LogDir,
				}, nil
			}
			<-runContext.Done()
			terminal := automation.AppOwnedScriptRunResult{
				ExecutionID: "app-recipe-canceled", Status: "canceled", LogDir: request.LogDir,
			}
			return terminal, &automation.AppOwnedScriptRunError{Code: "CANCELED", Result: terminal, Cause: runContext.Err()}
		},
		GracefulCancellation: func() bool {
			state := shell.State()
			return shell.TerminalError() == nil && (state == appshell.StateQuitting || state == appshell.StateStopped)
		},
		InternalResultSink: func(value []byte) error { return json.Unmarshal(value, &evidence) },
		Selection:          TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("bridge execution status=%s error=%v", result.Status, runErr)
	}
	firstRequest := <-requests
	canceledRequest := <-requests
	if firstRequest.WorkDir != "/app-data" || firstRequest.LogDir != "/logs/first" {
		t.Fatalf("first request=%+v", firstRequest)
	}
	if canceledRequest.ScriptPath != "/recipes/canceled.js" || canceledRequest.LogDir != "/logs/canceled" {
		t.Fatalf("canceled request=%+v", canceledRequest)
	}
	if evidence.First.ExecutionID != "app-recipe-first" || evidence.First.Status != "succeeded" {
		t.Fatalf("first result=%+v", evidence.First)
	}
	if evidence.Canceled.Code != "CANCELED" || evidence.Canceled.Status != "canceled" || evidence.Canceled.ExecutionID != "app-recipe-canceled" {
		t.Fatalf("canceled result=%+v", evidence.Canceled)
	}
}

func TestAppOwnedRecipeBridgeIsAbsentFromOrdinaryExecutions(t *testing.T) {
	result, _, runErr := Run(Request{
		Context: context.Background(), ExecutionID: NewExecutionID("ordinary-no-app-recipe-bridge"),
		SourceLabel: "ordinary bridge absence", Ext: ".js", WorkDir: t.TempDir(),
		ScriptContent: []byte(`if (typeof __opendeskRecipeExecution !== "undefined") throw new Error("private App bridge leaked");`),
		Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("ordinary execution status=%s error=%v", result.Status, runErr)
	}
}
