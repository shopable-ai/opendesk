package execution

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"opendesk/pkg/customui"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunJavaScriptCustomUIDisabledByDefault(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-disabled"), "ui-disabled", ".js")
	if err != nil {
		t.Fatal(err)
	}
	script := `
		const capabilities = ui.getCapabilities();
		if (capabilities.enabled !== false || capabilities.available !== false) throw new Error("ui must be dormant by default");
		if (capabilities.activationSource !== "disabled" || Execution.activationSource !== "disabled") throw new Error("disabled activation source missing");
		if (typeof FloatingWindow !== "undefined") throw new Error("legacy UI must not bypass explicit capability enablement");
		let code = "";
		try { ui.createWindow({}); } catch (error) { code = error.code; }
		if (code !== "UI_DISABLED") throw new Error("unexpected disabled error code: " + code);
	`
	result, _, err := Run(Request{
		ExecutionID: "ui-disabled", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
		Timeout: 2 * time.Second, Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("disabled UI contract failed: status=%s err=%v", result.Status, err)
	}
}

func TestRunJavaScriptExposesStructuredExecutionInput(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "execution-input"), "execution-input", ".js")
	if err != nil {
		t.Fatal(err)
	}
	result, _, err := Run(Request{
		ExecutionID: "execution-input",
		SourceLabel: "test",
		Ext:         ".js",
		ScriptContent: []byte(`
			if (Execution.id !== "execution-input" || Execution.executionId !== "execution-input") throw new Error("execution id missing");
			if (Execution.input.message !== "hello" || !Execution.input.nested.ok) throw new Error("structured input missing");
			if (typeof Execution.workdir !== "string" || Execution.workdir.length === 0) throw new Error("workdir missing");
		`),
		Input:     map[string]any{"message": "hello", "nested": map[string]any{"ok": true}},
		Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("execution input contract failed: status=%s err=%v", result.Status, err)
	}
}

func TestRunJavaScriptCustomUIEventsAndWaitUntilClosed(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-events"), "ui-events", ".js")
	if err != nil {
		t.Fatal(err)
	}
	script := `
		const capabilities = ui.getCapabilities();
		if (!capabilities.enabled || !capabilities.available) throw new Error("enabled UI capabilities missing");
		if (capabilities.activationSource !== "cli" || Execution.activationSource !== "cli") throw new Error("CLI activation source missing");
		const panel = await ui.createWindow({
			id: "panel", kind: "floating", title: "Runtime UI Test",
			bounds: {x: 20, y: 30, width: 360, height: 160},
			alwaysOnTop: true, draggable: true,
			content: {html: '<button id="save">Save</button><span id="status">Idle</span>'}
		});
		const ids = panel.controls().map(control => control.id).join(",");
		if (ids !== "save,status") throw new Error("unstable control order: " + ids);
		const status = panel.control("status");
		panel.control("save").on("click", async event => {
			if (event.sequence < 1 || event.targetId !== "save") throw new Error("invalid native event");
			await status.update({text: "clicked"});
			await panel.close();
		});
		await panel.show();
		await status.update({text: "armed"});
		const closed = await panel.waitUntilClosed();
		if (closed.status !== "closed" || closed.visible !== false) throw new Error("window did not close cleanly");
	`
	done := make(chan error, 1)
	go func() {
		result, _, runErr := Run(Request{
			ExecutionID: "ui-events", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
			Timeout: 3 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
			Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		})
		if runErr == nil && result.Status != ExecutionStatusSucceeded {
			runErr = fmt.Errorf("unexpected status %s", result.Status)
		}
		done <- runErr
	}()

	deadline := time.Now().Add(2 * time.Second)
	for {
		state, ok := driver.ControlSnapshot("ui-events", "panel", "status")
		if ok && state.Text == "armed" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("JavaScript UI listener was not armed")
		}
		time.Sleep(time.Millisecond)
	}
	if err := driver.Emit("ui-events", "panel", "save", "click", nil); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatalf("custom UI Runtime execution failed: %v", err)
	}
	control, ok := driver.ControlSnapshot("ui-events", "panel", "status")
	if !ok || control.Text != "clicked" {
		t.Fatalf("event handler did not update control: %#v", control)
	}
	state, ok := driver.WindowState("ui-events", "panel")
	if !ok || state.Status != customui.StatusClosed || state.Visible {
		t.Fatalf("window resources were not closed: %#v", state)
	}
}

func TestRunJavaScriptCustomUIStrictDeclarationsAndProjectActivation(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-strict"), "ui-strict", ".js")
	if err != nil {
		t.Fatal(err)
	}
	script := `
		if (ui.getCapabilities().activationSource !== "projectConfig" || Execution.activationSource !== "projectConfig") throw new Error("project activation source missing");
		let code = "";
		try { ui.createWindow({id:"bad", bounds:{x:0,y:0,width:100,height:100}, content:{html:'<button id="save">Save</button>'}, unknown:true}); } catch (error) { code = error.code; }
		if (code !== "INVALID_SPEC") throw new Error("unknown declaration field was not rejected: " + code);
		code = "";
		try { ui.createWindow({id:"badControls", bounds:{x:0,y:0,width:100,height:100}, content:{html:'<button id="save">Save</button>'}, controls:null}); } catch (error) { code = error.code; }
		if (code !== "INVALID_SPEC") throw new Error("driver-only controls:null field was not rejected: " + code);
		code = "";
		try { ui.createWindow({id:"badAssets", bounds:{x:0,y:0,width:100,height:100}, content:{html:'<button id="save">Save</button>', assets:null}}); } catch (error) { code = error.code; }
		if (code !== "INVALID_SPEC") throw new Error("unsupported assets:null field was not rejected: " + code);
		const panel = await ui.createWindow({id:"panel", bounds:{x:0,y:0,width:200,height:120}, content:{html:'<button id="save">Save</button>'}});
		code = "";
		try { panel.control("save").update({soruce:"image.png"}); } catch (error) { code = error.code; }
		if (code !== "INVALID_SPEC") throw new Error("unknown patch field was not rejected: " + code);
		code = "";
		try { panel.on("clik", () => {}); } catch (error) { code = error.code; }
		if (code !== "INVALID_SPEC") throw new Error("unknown event was not rejected: " + code);
		let positionError;
		try { await panel.setPosition(undefined, 20); } catch (error) { positionError = error; }
		if (!positionError || positionError.code !== "INVALID_SPEC" || positionError.operation !== "setPosition" || positionError.windowId !== "panel") throw new Error("non-finite position was not rejected structurally");
		let sizeError;
		try { await panel.setSize(Infinity, 120); } catch (error) { sizeError = error; }
		if (!sizeError || sizeError.code !== "INVALID_SPEC" || sizeError.operation !== "setSize" || sizeError.windowId !== "panel") throw new Error("non-finite size was not rejected structurally");
		await panel.close();
	`
	result, _, err := Run(Request{
		ExecutionID: "ui-strict", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
		Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIActivationSource: customui.ActivationProjectConfig, CustomUIDriver: driver,
		Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("strict custom UI contract failed: status=%s err=%v", result.Status, err)
	}
}

func TestRunJavaScriptCustomUIConcurrentCloseAndTimeoutCleanup(t *testing.T) {
	t.Run("concurrent close", func(t *testing.T) {
		driver := customui.NewMemoryDriver()
		artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-concurrent-close"), "ui-concurrent-close", ".js")
		if err != nil {
			t.Fatal(err)
		}
		script := `
			const panel = await ui.createWindow({id:"panel", bounds:{x:0,y:0,width:200,height:120}, content:{html:'<button id="save">Save</button>'}});
			await panel.show();
			const states = await Promise.all([panel.close(), panel.close(), panel.close()]);
			if (states.some(state => state.status !== "closed")) throw new Error("concurrent close was not idempotent");
		`
		result, _, err := Run(Request{
			ExecutionID: "ui-concurrent-close", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
			Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
			Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		})
		if err != nil || result.Status != ExecutionStatusSucceeded {
			t.Fatalf("concurrent close failed: status=%s err=%v", result.Status, err)
		}
		if counts := driver.ResourceCounts(); counts.Sinks != 0 {
			t.Fatalf("driver resources remain: %#v", counts)
		}
	})

	t.Run("timeout cleanup", func(t *testing.T) {
		driver := customui.NewMemoryDriver()
		artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-timeout"), "ui-timeout", ".js")
		if err != nil {
			t.Fatal(err)
		}
		script := `
			const panel = await ui.createWindow({id:"panel", bounds:{x:0,y:0,width:200,height:120}, content:{html:'<button id="save">Save</button>'}});
			await panel.show();
			await new Promise(() => {});
		`
		result, _, err := Run(Request{
			ExecutionID: "ui-timeout", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
			Timeout: 100 * time.Millisecond, EnableCustomUI: true, CustomUIDriver: driver,
			Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		})
		if err == nil || result.Status != ExecutionStatusTimedOut {
			t.Fatalf("timeout status=%s err=%v", result.Status, err)
		}
		if counts := driver.ResourceCounts(); counts.Sinks != 0 {
			t.Fatalf("driver resources remain after timeout: %#v", counts)
		}
	})
}

func TestRunJavaScriptCustomUIEventOverflowFailsWithStableCode(t *testing.T) {
	driver := &burstEventDriver{MemoryDriver: customui.NewMemoryDriver(), count: 5000}
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-overflow"), "ui-overflow", ".js")
	if err != nil {
		t.Fatal(err)
	}
	script := `
		const panel = await ui.createWindow({id:"panel", bounds:{x:0,y:0,width:200,height:120}, content:{html:'<button id="save">Save</button>'}});
		panel.control("save").on("click", () => { const until = Date.now() + 2; while (Date.now() < until) {} });
		await panel.show();
		await panel.waitUntilClosed();
	`
	result, _, err := Run(Request{
		ExecutionID: "ui-overflow", SourceLabel: "test", Ext: ".js", ScriptContent: []byte(script),
		Timeout: 5 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
		Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err == nil || result.Status != ExecutionStatusFailed || !strings.Contains(err.Error(), customui.CodeQueueOverflow) {
		t.Fatalf("overflow status=%s err=%v", result.Status, err)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 {
		t.Fatalf("driver resources remain after overflow: %#v", counts)
	}
}

type burstEventDriver struct {
	*customui.MemoryDriver
	count int
}

func (d *burstEventDriver) Create(ctx context.Context, sessionID string, spec customui.WindowSpec, sink func(customui.Event)) (customui.DriverWindow, error) {
	window, err := d.MemoryDriver.Create(ctx, sessionID, spec, sink)
	if err != nil {
		return nil, err
	}
	return &burstEventWindow{DriverWindow: window, sink: sink, sessionID: sessionID, windowID: spec.ID, count: d.count}, nil
}

type burstEventWindow struct {
	customui.DriverWindow
	sink      func(customui.Event)
	sessionID string
	windowID  string
	count     int
}

func (w *burstEventWindow) Show(ctx context.Context) (customui.WindowState, error) {
	state, err := w.DriverWindow.Show(ctx)
	if err != nil {
		return state, err
	}
	for sequence := 1; sequence <= w.count; sequence++ {
		w.sink(customui.Event{SessionID: w.sessionID, WindowID: w.windowID, TargetID: "save", Type: "click", Sequence: uint64(sequence), Timestamp: time.Now().UTC()})
	}
	return state, nil
}

func TestRunJavaScriptCustomUICleansUpAfterScriptError(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-error"), "ui-error", ".js")
	if err != nil {
		t.Fatal(err)
	}
	_, _, runErr := Run(Request{
		ExecutionID: "ui-error", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`
			const panel = await ui.createWindow({id:"panel",bounds:{x:1,y:2,width:200,height:100},content:{html:'<button id="ok">OK</button>'}});
			await panel.show();
			throw new Error("intentional UI failure");
		`),
		Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
		Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr == nil || !strings.Contains(runErr.Error(), "intentional UI failure") {
		t.Fatalf("expected script failure, got %v", runErr)
	}
	state, ok := driver.WindowState("ui-error", "panel")
	if !ok || state.Status != customui.StatusClosed {
		t.Fatalf("window was not cleaned up after failure: %#v", state)
	}
}

func TestRunJavaScriptCustomUICleansUnawaitedWindowOnNormalScriptEnd(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "ui-unawaited"), "ui-unawaited", ".js")
	if err != nil {
		t.Fatal(err)
	}
	result, _, runErr := Run(Request{
		ExecutionID: "ui-unawaited", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`
			const panel = await ui.createWindow({id:"panel",bounds:{x:1,y:2,width:200,height:100},content:{html:'<button id="ok">OK</button>'}});
			panel.control("ok").on("click", () => {});
			await panel.show();
		`),
		Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
		Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("normal script end status=%s error=%v", result.Status, runErr)
	}
	state, ok := driver.WindowState("ui-unawaited", "panel")
	if !ok || state.Status != customui.StatusClosed || state.Visible {
		t.Fatalf("unawaited window was not cleaned up: %#v", state)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("unawaited UI resources remain: %#v", counts)
	}
}

func TestRunJavaScriptDialogUnobservedPromiseClosesOnNormalScriptEnd(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "dialog-unobserved"), "dialog-unobserved", ".js")
	if err != nil {
		t.Fatal(err)
	}
	result, _, runErr := Run(Request{
		ExecutionID: "dialog-unobserved", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`
			const pending = Dialog.alert({message: "This Promise is intentionally unobserved."});
			if (!(pending instanceof Promise)) throw new Error("Dialog.alert did not return a Promise");
			await sleep(30); // Let the real host operation create and show its window.
		`),
		Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
		Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("unobserved Dialog execution status=%s error=%v", result.Status, runErr)
	}
	state, ok := driver.WindowState("dialog-unobserved", "dialog-1")
	if !ok || state.Status != customui.StatusClosed || state.Visible {
		t.Fatalf("unobserved Dialog was not cleaned up: %#v ok=%v", state, ok)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("unobserved Dialog resources remain: %#v", counts)
	}
}

func TestRunJavaScriptDialogThenSettlesOnceOnOwnerEventLoop(t *testing.T) {
	driver := customui.NewMemoryDriver()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "dialog-then"), "dialog-then", ".js")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		result, _, runErr := Run(Request{
			ExecutionID: "dialog-then", SourceLabel: "test", Ext: ".js",
			ScriptContent: []byte(`
				const flow = [];
				const dialog = Dialog.confirm({message: "Confirm once", confirmText: "Continue", cancelText: "Cancel"});
				if (!(dialog instanceof Promise)) throw new Error("Dialog.confirm did not return a Promise");
				const outcome = dialog.then(value => {
					if (value !== true) throw new Error("confirm resolution changed");
					flow.push("then");
					return value;
				}).finally(() => flow.push("finally"));
				if (await outcome !== true || flow.join(",") !== "then,finally") {
					throw new Error("Dialog Promise continuation order changed: " + flow.join(","));
				}
			`),
			Timeout: 2 * time.Second, EnableCustomUI: true, CustomUIDriver: driver,
			Artifacts: artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		})
		if runErr == nil && result.Status != ExecutionStatusSucceeded {
			runErr = fmt.Errorf("unexpected status %s", result.Status)
		}
		done <- runErr
	}()

	deadline := time.Now().Add(2 * time.Second)
	for {
		state, ok := driver.WindowState("dialog-then", "dialog-1")
		if ok && state.Visible {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Dialog confirm did not become visible")
		}
		time.Sleep(time.Millisecond)
	}
	// Duplicate native click delivery must not produce a second settlement or
	// a second JavaScript continuation.
	if err := driver.Emit("dialog-then", "dialog-1", "dialogConfirm", "click", nil); err != nil {
		t.Fatal(err)
	}
	if err := driver.Emit("dialog-then", "dialog-1", "dialogConfirm", "click", nil); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatalf("Dialog then/finally execution failed: %v", err)
	}
	state, ok := driver.WindowState("dialog-then", "dialog-1")
	if !ok || state.Status != customui.StatusClosed || state.Visible {
		t.Fatalf("settled Dialog was not closed: %#v ok=%v", state, ok)
	}
}

func TestRunJavaScriptAcceptsRequestedStackMode(t *testing.T) {
	tests := []struct {
		name      string
		stackMode string
	}{
		{name: "legacy", stackMode: "legacy"},
		{name: "upgraded", stackMode: "upgraded"},
		{name: "playwright", stackMode: "playwright"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run"), "exec-"+tt.name, ".js")
			if err != nil {
				t.Fatalf("PrepareArtifacts returned error: %v", err)
			}

			script := "" +
				"if (typeof page !== 'object') throw new Error('missing current page surface');" +
				"if (typeof browser !== 'object') throw new Error('missing current browser surface');" +
				"if (typeof context !== 'object') throw new Error('missing current context surface');" +
				"if (Execution.stack !== '" + tt.stackMode + "') throw new Error('unexpected stack metadata: ' + Execution.stack);"

			req := Request{
				ExecutionID:    "exec-" + tt.name,
				SourceLabel:    "inline",
				Ext:            ".js",
				StackMode:      tt.stackMode,
				ScriptContent:  []byte(script),
				TimeoutMinutes: 0,
				Artifacts:      artifacts,
				Selection: TerminalSelection{
					Mode:       "quiet",
					Categories: map[string]bool{},
				},
			}
			result, _, err := Run(req)
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			if result.Status != ExecutionStatusSucceeded {
				t.Fatalf("expected succeeded status, got %s", result.Status)
			}
		})
	}
}

func TestRunJavaScriptInjectsExecutionContext(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run-context"), "exec-context", ".js")
	if err != nil {
		t.Fatalf("PrepareArtifacts returned error: %v", err)
	}

	script := "" +
		"if (!Execution) throw new Error('missing Execution context');" +
		"if (Execution.executionId !== 'exec-context') throw new Error('unexpected executionId: ' + Execution.executionId);" +
		"if (Execution.stack !== 'playwright') throw new Error('unexpected stack: ' + Execution.stack);" +
		"if (Execution.artifactDir !== '" + artifacts.RunDir + "') throw new Error('unexpected artifactDir: ' + Execution.artifactDir);"

	req := Request{
		ExecutionID:    "exec-context",
		SourceLabel:    "inline",
		Ext:            ".js",
		StackMode:      "playwright",
		ScriptContent:  []byte(script),
		TimeoutMinutes: 0,
		Artifacts:      artifacts,
		Selection:      TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	}

	result, _, err := Run(req)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if result.Status != ExecutionStatusSucceeded {
		t.Fatalf("expected succeeded status, got %s", result.Status)
	}
}

func TestRunJavaScriptNativeExtensionsRequiresExplicitOptIn(t *testing.T) {
	t.Setenv("SKIP_FYNE_INIT", "1")
	tests := []struct {
		name    string
		enabled bool
		script  string
	}{
		{
			name:    "disabled by default",
			enabled: false,
			script:  `if (typeof NativeExtensions !== "undefined" || typeof NativeExtension !== "undefined") throw new Error("Native Extension globals must be absent by default");`,
		},
		{
			name:    "available after explicit opt-in",
			enabled: true,
			script:  `if (!NativeExtensions || typeof NativeExtensions.list !== "function") throw new Error("NativeExtensions registry is missing"); if (typeof NativeExtension !== "undefined") throw new Error("registry gate exposed unsafe NativeExtension.call");`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run"), "native-extension-gate", ".js")
			if err != nil {
				t.Fatalf("PrepareArtifacts returned error: %v", err)
			}
			result, _, err := Run(Request{
				ExecutionID:            "native-extension-gate",
				SourceLabel:            "test",
				Ext:                    ".js",
				ScriptContent:          []byte(test.script),
				Timeout:                2 * time.Second,
				EnableNativeExtensions: test.enabled,
				Artifacts:              artifacts,
				Selection:              TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
			})
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			if result.Status != ExecutionStatusSucceeded {
				t.Fatalf("expected succeeded status, got %s", result.Status)
			}
		})
	}
}

func TestRunJavaScriptPreservesRequestedStackInSummaryWithoutLegacyFallbackBlob(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "run-http-smoke"), "exec-http-smoke", ".js")
	if err != nil {
		t.Fatalf("PrepareArtifacts returned error: %v", err)
	}

	script := "" +
		"console.log('http e2e smoke start');" +
		"console.log('http e2e smoke stack=' + 'playwright');" +
		"console.log('http e2e smoke end');"

	req := Request{
		ExecutionID:    "exec-http-smoke",
		SourceLabel:    "inline",
		Ext:            ".js",
		StackMode:      "playwright",
		ScriptContent:  []byte(script),
		TimeoutMinutes: 0,
		Artifacts:      artifacts,
		Selection:      TerminalSelection{Mode: "agent", Categories: map[string]bool{"script": true, "summary": true, "error": true}},
	}

	_, summary, err := Run(req)
	if err != nil {
		t.Fatalf("Run returned error: %v", err)
	}
	if len(summary.ScriptLogs) == 0 {
		t.Fatal("expected script logs in summary")
	}
	found := false
	for _, item := range summary.ScriptLogs {
		if strings.Contains(item.Message, "http e2e smoke stack=playwright") {
			found = true
		}
		if strings.Contains(item.Message, `\"stack\":\"legacy\"`) {
			t.Fatalf("unexpected legacy fallback blob in script logs: %s", item.Message)
		}
	}
	if !found {
		t.Fatalf("expected stack-specific script log, got %#v", summary.ScriptLogs)
	}
}

func TestRunJavaScriptAsyncLifecycleAcrossStacks(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	for _, stack := range []string{"legacy", "upgraded", "playwright"} {
		t.Run(stack, func(t *testing.T) {
			artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), stack), "async-"+stack, ".js")
			if err != nil {
				t.Fatal(err)
			}
			script := `
                const ticks = [];
                const interval = setInterval(() => ticks.push("tick"), 2);
                const response = await axios.get("` + server.URL + `");
                await new Promise((resolve, reject) => {
                    const observer = setInterval(() => {
                        if (ticks.length > 0) {
                            clearInterval(observer);
                            clearTimeout(deadline);
                            resolve();
                        }
                    }, 1);
                    const deadline = setTimeout(() => {
                        clearInterval(observer);
                        reject(new Error("timer did not tick before lifecycle deadline"));
                    }, 250);
                });
                clearInterval(interval);
                if (!response.data.ok || ticks.length === 0) {
                    throw new Error("async timer/axios lifecycle failed");
                }
            `
			result, _, err := Run(Request{
				ExecutionID: "async-" + stack, SourceLabel: "test", Ext: ".js", StackMode: stack,
				ScriptContent: []byte(script), Timeout: 2 * time.Second, Artifacts: artifacts,
				Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
			})
			if err != nil {
				t.Fatalf("Run returned error: %v", err)
			}
			if result.Status != ExecutionStatusSucceeded {
				t.Fatalf("expected succeeded status, got %s", result.Status)
			}
		})
	}
}

func TestRunJavaScriptReportsTimerCallbackFailure(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "timer-error"), "timer-error", ".js")
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = Run(Request{
		ExecutionID: "timer-error", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`setTimeout(() => { throw new Error("timer exploded"); }, 2);`),
		Timeout:       2 * time.Second, Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err == nil || !strings.Contains(err.Error(), "timer exploded") {
		t.Fatalf("expected timer callback failure, got %v", err)
	}
}

func TestRunJavaScriptInterruptsBusyLoopAtDeadline(t *testing.T) {
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "interrupt"), "interrupt", ".js")
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	_, _, err = Run(Request{
		ExecutionID: "interrupt", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`for (;;) {}`), Timeout: 50 * time.Millisecond, Artifacts: artifacts,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("expected deadline failure, got %v", err)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("interrupt took too long: %s", elapsed)
	}
}
