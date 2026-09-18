package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"opendesk/automation"
	"opendesk/pkg/appshell"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowpackage"
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
	t.Cleanup(func() {
		if err := service.Uninstall(context.Background(), installed.Record.InstallID, true); err != nil {
			t.Errorf("cleanup installed Flow %s: %v", installed.Record.InstallID, err)
		}
	})
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

func TestConfigureOfficialAppOwnedExecutionRejectsThirdPartyAppModePackages(t *testing.T) {
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)

	var thirdParty pkgExecution.Request
	configureOfficialAppOwnedExecution("com.example.third-party", &thirdParty, runner)
	if thirdParty.AppOwnedScriptInspect != nil ||
		thirdParty.AppOwnedScriptRead != nil ||
		thirdParty.AppOwnedScriptRun != nil ||
		thirdParty.AppOwnedExecutionID != nil ||
		thirdParty.AppOwnedFlowInspect != nil ||
		thirdParty.AppOwnedFlowRun != nil {
		t.Fatal("third-party App Mode package received private App-owned product bridges")
	}

	var official pkgExecution.Request
	configureOfficialAppOwnedExecution(officialOpenDeskAppID, &official, runner)
	if official.AppOwnedScriptInspect == nil ||
		official.AppOwnedScriptRead == nil ||
		official.AppOwnedScriptRun == nil ||
		official.AppOwnedExecutionID == nil ||
		official.AppOwnedFlowInspect == nil ||
		official.AppOwnedFlowRun == nil {
		t.Fatal("official OpenDesk package did not receive required private App-owned bridges")
	}
}

func TestAppRecipeRunnerAssistantInspectBindsScopeHashInputAndReservedIdentity(t *testing.T) {
	root := t.TempDir()
	scriptPath := filepath.Join(root, "assistant.js")
	if err := os.WriteFile(scriptPath, []byte(`console.log("ASSISTANT_INPUT=" + JSON.stringify(Execution.input));`), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	inspection, err := runner.InspectScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: scriptPath,
		ScopeRoot:  root,
	})
	if err != nil {
		t.Fatalf("inspect App-owned Recipe: %v", err)
	}
	if inspection.ScriptHash == "" || inspection.Ext != ".js" {
		t.Fatalf("inspection=%+v", inspection)
	}

	reserved := runner.ReserveExecutionID("recipe")
	logDir := filepath.Join(root, ".runtime", "assistant")
	result, err := runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{
		ExecutionID:        reserved,
		ScriptPath:         scriptPath,
		ScopeRoot:          root,
		ExpectedScriptHash: inspection.ScriptHash,
		InputJSON:          `{"amount":17,"nested":{"target":"A"}}`,
		WorkDir:            root,
		LogDir:             logDir,
	})
	if err != nil {
		t.Fatalf("run inspected Recipe: %v", err)
	}
	if result.ExecutionID != reserved || result.Status != string(pkgExecution.ExecutionStatusSucceeded) {
		t.Fatalf("result=%+v reserved=%q", result, reserved)
	}
	stdout, err := os.ReadFile(filepath.Join(logDir, "stdout.log"))
	if err != nil {
		t.Fatal(err)
	}
	stdoutText := string(stdout)
	marker := "ASSISTANT_INPUT="
	start := strings.Index(stdoutText, marker)
	if start < 0 {
		t.Fatalf("stdout=%q", stdout)
	}
	payload := stdoutText[start+len(marker):]
	if end := strings.Index(payload, ` {"consoleMethod":`); end >= 0 {
		payload = payload[:end]
	} else if end := strings.IndexByte(payload, '\n'); end >= 0 {
		payload = payload[:end]
	}
	var actualInput map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(payload)), &actualInput); err != nil {
		t.Fatalf("decode assistant input from stdout: %v; stdout=%q", err, stdout)
	}
	if actualInput["amount"] != float64(17) {
		t.Fatalf("assistant input amount=%v", actualInput["amount"])
	}
	nested, ok := actualInput["nested"].(map[string]any)
	if !ok || nested["target"] != "A" {
		t.Fatalf("assistant nested input=%v", actualInput["nested"])
	}

	if err := os.WriteFile(scriptPath, []byte(`console.log("changed");`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = runner.Run(context.Background(), automation.AppOwnedScriptRunRequest{
		ScriptPath:         scriptPath,
		ScopeRoot:          root,
		ExpectedScriptHash: inspection.ScriptHash,
		InputJSON:          `{}`,
		WorkDir:            root,
		LogDir:             filepath.Join(root, ".runtime", "stale"),
	})
	var typed *automation.AppOwnedScriptRunError
	if !errors.As(err, &typed) || typed.Code != appRecipeChangedCode {
		t.Fatalf("stale script error=%T %v", err, err)
	}

	outsideRoot := t.TempDir()
	outside := filepath.Join(outsideRoot, "outside.js")
	if err := os.WriteFile(outside, []byte(`console.log("outside");`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.InspectScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: outside,
		ScopeRoot:  root,
	}); err == nil {
		t.Fatal("outside directory entry was accepted")
	}
	link := filepath.Join(root, "link.js")
	if err := os.Symlink(outside, link); err == nil {
		if _, err := runner.InspectScript(context.Background(), automation.AppOwnedScriptInspectRequest{
			ScriptPath: link,
			ScopeRoot:  root,
		}); err == nil {
			t.Fatal("symlinked assistant entry was accepted")
		}
	}
}

func TestAppRecipeRunnerReadScriptUsesExactHostBoundaryAndDigest(t *testing.T) {
	root := t.TempDir()
	scriptPath := filepath.Join(root, "source.js")
	content := []byte(`// source is untrusted data
console.log("read-only");
`)
	if err := os.WriteFile(scriptPath, content, 0o600); err != nil {
		t.Fatal(err)
	}
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)

	source, err := runner.ReadScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: scriptPath,
		ScopeRoot:  root,
	})
	if err != nil {
		t.Fatalf("read bounded source: %v", err)
	}
	if source.Content != string(content) || source.Ext != ".js" {
		t.Fatalf("source=%+v", source)
	}
	if source.ScriptHash != pkgExecution.ComputeScriptHash(content) {
		t.Fatalf("source hash=%q want=%q", source.ScriptHash, pkgExecution.ComputeScriptHash(content))
	}

	outsideRoot := t.TempDir()
	outside := filepath.Join(outsideRoot, "outside.js")
	if err := os.WriteFile(outside, []byte(`console.log("outside");`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.ReadScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: outside,
		ScopeRoot:  root,
	}); err == nil {
		t.Fatal("bounded source reader accepted a sibling/outside file")
	}

	link := filepath.Join(root, "alias.js")
	if err := os.Symlink(outside, link); err == nil {
		if _, err := runner.ReadScript(context.Background(), automation.AppOwnedScriptInspectRequest{
			ScriptPath: link,
			ScopeRoot:  root,
		}); err == nil {
			t.Fatal("bounded source reader followed a symbolic-link entry")
		}
	}

	tooLarge := filepath.Join(root, "too-large.js")
	if err := os.WriteFile(tooLarge, []byte(strings.Repeat("a", 1024*1024+1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.ReadScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: tooLarge,
		ScopeRoot:  root,
	}); err == nil || !strings.Contains(err.Error(), "1 MiB") {
		t.Fatalf("oversized source error=%v", err)
	}

	invalidUTF8 := filepath.Join(root, "invalid.js")
	if err := os.WriteFile(invalidUTF8, []byte{0xff, 0xfe, 0xfd}, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.ReadScript(context.Background(), automation.AppOwnedScriptInspectRequest{
		ScriptPath: invalidUTF8,
		ScopeRoot:  root,
	}); err == nil || !strings.Contains(err.Error(), "UTF-8") {
		t.Fatalf("invalid UTF-8 source error=%v", err)
	}
}

func TestAppRecipeRunnerFlowUsesReservedExecutionIdentity(t *testing.T) {
	root := t.TempDir()
	service, err := flowinstall.NewService(flowinstall.Roots{
		FlowRoot: filepath.Join(root, "flows"), DataRoot: filepath.Join(root, "flow-data"),
		StateRoot: filepath.Join(root, "flow-state"), TrustRoot: filepath.Join(root, "flow-state", "trust"),
	})
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "flow.js")
	if err := os.WriteFile(source, []byte(`console.log("FLOW_RESERVED_ID=" + Execution.id);`), 0o600); err != nil {
		t.Fatal(err)
	}
	installed, err := service.InstallScript(context.Background(), source)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := service.Uninstall(context.Background(), installed.Record.InstallID, true); err != nil {
			t.Errorf("cleanup installed Flow %s: %v", installed.Record.InstallID, err)
		}
	})
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	runner.flowService = service
	reserved := runner.ReserveExecutionID("flow")
	result, err := runner.RunFlow(context.Background(), automation.AppOwnedFlowRunRequest{
		ExecutionID: reserved,
		InstallID: installed.Record.InstallID,
		WorkDir: root,
		LogDir: filepath.Join(root, ".runtime", "flow-reserved"),
		InputJSON: `{}`,
		ExpectedArchiveDigest: installed.Record.ArchiveDigest,
		ExpectedManifestDigest: installed.Record.ManifestDigest,
	})
	if err != nil {
		t.Fatalf("run reserved Flow: %v", err)
	}
	if result.ExecutionID != reserved {
		t.Fatalf("executionId=%q want %q", result.ExecutionID, reserved)
	}
}

func TestAssistantInstalledFlowVerticalRuntimeUsesCanonicalCatalogAndRealExecution(t *testing.T) {
	repoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	seamPath := filepath.Join(repoRoot, "tests", "runtime-api", "seams", "assistant-installed-flow-use.js")
	seamSource, err := os.ReadFile(seamPath)
	if err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	businessDir := filepath.Join(root, "business")
	taskRoot := filepath.Join(root, "assistant-state")
	if err := os.MkdirAll(businessDir, 0o755); err != nil {
		t.Fatal(err)
	}
	businessDir, err = filepath.EvalSymlinks(businessDir)
	if err != nil {
		t.Fatal(err)
	}

	service, err := flowinstall.NewService(flowinstall.Roots{
		FlowRoot: filepath.Join(root, "flows"),
		DataRoot: filepath.Join(root, "flow-data"),
		StateRoot: filepath.Join(root, "flow-state"),
		TrustRoot: filepath.Join(root, "flow-state", "trust"),
	})
	if err != nil {
		t.Fatal(err)
	}

	flowSourceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(flowSourceRoot, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	flowSource := filepath.Join(flowSourceRoot, "payload", "main.js")
	if err := os.WriteFile(flowSource, []byte(
		`const resultPath = File.join(Execution.workdir, "assistant-flow-result.json");
File.writeNew(resultPath, JSON.stringify({executionId: Execution.id, input: Execution.input}) + "\n");
console.log("ASSISTANT_FLOW_BUSINESS_OUTPUT=" + resultPath);`,
	), 0o600); err != nil {
		t.Fatal(err)
	}
	invocationPath := filepath.Join(flowSourceRoot, appFlowInvocationFile)
	if err := os.WriteFile(invocationPath, []byte(`{
  "schemaVersion": 1,
  "effectSummary": "Write one isolated JSON result file in the selected business working directory.",
  "parameters": {
    "amount": {"type": "number", "required": true, "description": "Sample amount."},
    "nested": {"type": "object", "required": true, "description": "Sample nested input."}
  }
}`), 0o600); err != nil {
		t.Fatal(err)
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	built, err := flowpackage.Build(flowpackage.BuildOptions{
		SourceRoot: flowSourceRoot,
		FlowID: "assistant-vertical-flow",
		Name: "Assistant Vertical Flow",
		Version: "1.0.0",
		PublisherID: "assistant-test-publisher",
		PublisherKeyID: "assistant-test-key",
		Entry: "payload/main.js",
		MinimumRuntimeVersion: "0.0.0",
		Platforms: []string{runtime.GOOS},
		Files: []string{"payload/main.js", appFlowInvocationFile},
		PublisherPublicKey: publicKey,
		PublisherPrivateKey: privateKey,
	})
	if err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(root, "assistant-vertical.odflow")
	if err := os.WriteFile(packagePath, built.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := service.Trust.Approve(built.Manifest, flowinstall.TrustScopeFlow, flowinstall.TrustTest); err != nil {
		t.Fatal(err)
	}
	installed, err := service.Install(context.Background(), packagePath, flowinstall.InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := service.Uninstall(context.Background(), installed.Record.InstallID, true); err != nil {
			t.Errorf("cleanup installed Flow %s: %v", installed.Record.InstallID, err)
		}
	})

	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, nil, nil)
	runner.flowService = service

	manifest, err := appshell.ParseManifest([]byte(`{
		"id":"com.opendesk.assistant-installed-flow-vertical",
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

	var evidence struct {
		Prepared struct {
			TaskID        string         `json:"taskId"`
			Revision      int            `json:"revision"`
			EffectSummary string         `json:"effectSummary"`
			PreviewInput  map[string]any `json:"previewInput"`
		} `json:"prepared"`
		Run struct {
			ExecutionID     string `json:"executionId"`
			Status          string `json:"status"`
			BusinessVerified bool   `json:"businessVerified"`
		} `json:"run"`
		FinalTask struct {
			TaskID   string           `json:"taskId"`
			Revision int              `json:"revision"`
			Status   string           `json:"status"`
			Evidence []map[string]any `json:"evidence"`
		} `json:"finalTask"`
	}

	outerResult, _, runErr := pkgExecution.Run(pkgExecution.Request{
		Context: ctx,
		ExecutionID: pkgExecution.NewExecutionID("assistant-flow-vertical"),
		SourceLabel: "assistant installed Flow vertical seam",
		ScriptPath: seamPath,
		Ext: ".js",
		ScriptContent: seamSource,
		WorkDir: repoRoot,
		Environment: map[string]string{
			"ASSISTANT_TASK_ROOT": taskRoot,
			"ASSISTANT_BUSINESS_CWD": businessDir,
			"ASSISTANT_FLOW_INSTALL_ID": installed.Record.InstallID,
		},
		AppShell: shell,
		AppOwnedExecutionID: runner.ReserveExecutionID,
		AppOwnedFlowInspect: runner.InspectFlow,
		AppOwnedFlowRun: runner.RunFlow,
		GracefulCancellation: func() bool {
			state := shell.State()
			return shell.TerminalError() == nil && (state == appshell.StateQuitting || state == appshell.StateStopped)
		},
		InternalResultSink: func(value []byte) error {
			return json.Unmarshal(value, &evidence)
		},
		Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil || outerResult.Status != pkgExecution.ExecutionStatusSucceeded {
		t.Fatalf("assistant vertical Runtime status=%s error=%v", outerResult.Status, runErr)
	}

	if evidence.Prepared.TaskID != "vertical-installed-flow" || evidence.Run.ExecutionID == "" {
		t.Fatalf("vertical evidence=%+v", evidence)
	}
	if evidence.Prepared.EffectSummary != "Write one isolated JSON result file in the selected business working directory." {
		t.Fatalf("signed effect summary=%q", evidence.Prepared.EffectSummary)
	}
	if evidence.Run.Status != string(pkgExecution.ExecutionStatusSucceeded) {
		t.Fatalf("run=%+v", evidence.Run)
	}
	if evidence.Run.BusinessVerified {
		t.Fatal("Runtime success must not be promoted to business verification without a separate observer")
	}
	if evidence.FinalTask.Status != "execution-finished-unverified" {
		t.Fatalf("final task status=%q", evidence.FinalTask.Status)
	}

	outputPath := filepath.Join(businessDir, "assistant-flow-result.json")
	outputData, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read business output: %v", err)
	}
	var output struct {
		ExecutionID string         `json:"executionId"`
		Input       map[string]any `json:"input"`
	}
	if err := json.Unmarshal(outputData, &output); err != nil {
		t.Fatalf("decode business output: %v", err)
	}
	if output.ExecutionID != evidence.Run.ExecutionID {
		t.Fatalf("business executionId=%q evidence=%q", output.ExecutionID, evidence.Run.ExecutionID)
	}
	if got := output.Input["amount"]; got != float64(17) {
		t.Fatalf("business input amount=%v", got)
	}
	nested, ok := output.Input["nested"].(map[string]any)
	if !ok || nested["target"] != "A" {
		t.Fatalf("business nested input=%v", output.Input["nested"])
	}
	if preparedNested, ok := evidence.Prepared.PreviewInput["nested"].(map[string]any); !ok || preparedNested["target"] != "A" {
		t.Fatalf("preview input was not frozen: %+v", evidence.Prepared.PreviewInput)
	}

	foundReserved := false
	foundTerminal := false
	for _, item := range evidence.FinalTask.Evidence {
		switch item["type"] {
		case "execution-reserved":
			foundReserved = item["executionId"] == evidence.Run.ExecutionID
		case "execution-terminal":
			foundTerminal = item["executionId"] == evidence.Run.ExecutionID
		}
	}
	if !foundReserved || !foundTerminal {
		t.Fatalf("execution identity evidence incomplete: %+v", evidence.FinalTask.Evidence)
	}
}
