package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
	"opendesk/pkg/appshell"
)

const appShellRuntimeQueueCapacity = 256

type appShellPending struct {
	operation string
	cancel    context.CancelFunc
	cleanup   func()
	resolve   func(any) error
	reject    func(any) error
	counted   *atomic.Bool
}

// AppOwnedScriptRunRequest contains plain, host-validated inputs for the
// bundled product Script Runner. The callback never receives Goja values.
type AppOwnedScriptInspectRequest struct {
	ScriptPath string
	ScopeRoot  string
}

type AppOwnedScriptInspection struct {
	ScriptHash string `json:"scriptHash"`
	Ext        string `json:"ext"`
}

type AppOwnedScriptSource struct {
	ScriptHash string `json:"scriptHash"`
	Ext        string `json:"ext"`
	Content    string `json:"content"`
}

type AppOwnedScriptRunRequest struct {
	ExecutionID       string
	ScriptPath        string
	ScopeRoot         string
	ExpectedScriptHash string
	InputJSON         string
	WorkDir           string
	LogDir            string
}

// AppOwnedScriptRunResult is the terminal result returned to the product
// adapter. Public execution artifacts remain the source of detailed logs.
type AppOwnedScriptRunResult struct {
	ExecutionID string `json:"executionId"`
	Status      string `json:"status"`
	Error       string `json:"error,omitempty"`
	LogDir      string `json:"logDir"`
}

type AppOwnedScriptInspector func(context.Context, AppOwnedScriptInspectRequest) (AppOwnedScriptInspection, error)
type AppOwnedScriptReader func(context.Context, AppOwnedScriptInspectRequest) (AppOwnedScriptSource, error)
type AppOwnedScriptRunner func(context.Context, AppOwnedScriptRunRequest) (AppOwnedScriptRunResult, error)
type AppOwnedExecutionIDAllocator func(kind string) string

type AppOwnedFlowParameter struct {
	Type        string `json:"type"`
	Required    bool   `json:"required,omitempty"`
	Description string `json:"description,omitempty"`
}

type AppOwnedFlowInvocation struct {
	SchemaVersion int                              `json:"schemaVersion"`
	EffectSummary string                           `json:"effectSummary"`
	Parameters    map[string]AppOwnedFlowParameter `json:"parameters,omitempty"`
	FixedInputs   map[string]any                   `json:"fixedInputs,omitempty"`
}

type AppOwnedFlowInspection struct {
	InstallID string `json:"installId"`
	FlowID string `json:"flowId"`
	Name string `json:"name"`
	Version string `json:"version"`
	PublisherID string `json:"publisherId"`
	PublisherFingerprint string `json:"publisherFingerprint"`
	State string `json:"state"`
	StateReason string `json:"stateReason,omitempty"`
	Origin string `json:"origin"`
	ArchiveDigest string `json:"archiveDigest"`
	ManifestDigest string `json:"manifestDigest"`
	Runnable bool `json:"runnable"`
	Protected bool `json:"protected"`
	Invocation *AppOwnedFlowInvocation `json:"invocation,omitempty"`
}
type AppOwnedFlowInspectRequest struct { InstallID string }
type AppOwnedFlowRunRequest struct {
	ExecutionID string
	InstallID string
	WorkDir string
	LogDir string
	InputJSON string
	ExpectedArchiveDigest string
	ExpectedManifestDigest string
}
type AppOwnedFlowRunResult struct {
	ExecutionID string `json:"executionId"`
	Status string `json:"status"`
	Error string `json:"error,omitempty"`
	LogDir string `json:"logDir"`
}
type AppOwnedFlowInspector func(context.Context, AppOwnedFlowInspectRequest) (AppOwnedFlowInspection, error)
type AppOwnedFlowRunner func(context.Context, AppOwnedFlowRunRequest) (AppOwnedFlowRunResult, error)
type AppOwnedFlowRunError struct { Code string; Result AppOwnedFlowRunResult; Cause error }
func (e *AppOwnedFlowRunError) Error() string {
	if e == nil { return "App-owned Flow execution failed" }
	if e.Cause != nil { return e.Cause.Error() }
	if e.Result.Error != "" { return e.Result.Error }
	return "App-owned Flow execution failed"
}
func (e *AppOwnedFlowRunError) Unwrap() error { if e == nil { return nil }; return e.Cause }

// AppOwnedScriptRunError preserves a stable product-facing failure category
// without turning the internal host bridge into a public Runtime API.
type AppOwnedScriptRunError struct {
	Code   string
	Result AppOwnedScriptRunResult
	Cause  error
}

func (e *AppOwnedScriptRunError) Error() string {
	if e == nil {
		return "App-owned script execution failed"
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	if e.Result.Error != "" {
		return e.Result.Error
	}
	return "App-owned script execution failed"
}

func (e *AppOwnedScriptRunError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func appOwnedBridgeJSONValue(value any) (any, error) {
	// The private App bridge is a JavaScript contract, not a Go struct API.
	// Normalize successful results through their json tags so Goja sees stable
	// camelCase keys (installId, executionId, scriptHash, ...), including nested
	// Flow invocation parameter metadata. This also preserves ordinary JSON
	// number semantics for JavaScript consumers.
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("encode App-owned bridge result: %w", err)
	}
	var normalized any
	if err := json.Unmarshal(payload, &normalized); err != nil {
		return nil, fmt.Errorf("decode App-owned bridge result: %w", err)
	}
	return normalized, nil
}

// AppShellRuntime is the execution-scoped bridge for automation.app. Native
// callbacks retain no Goja state: they push plain ActionEvent values into this
// bounded queue and schedule exactly one drain on the current EventLoop.
type AppShellRuntime struct {
	runtime      *goja.Runtime
	loop         *eventloop.EventLoop
	context      context.Context
	shell        *appshell.Shell
	ui           *CustomUIRuntime
	eventSink    EventSink
	onAsyncError func(error)

	queueMu         sync.Mutex
	queue           []appshell.ActionEvent
	eventScheduled  atomic.Bool
	closing         atomic.Bool
	workers         customUIWorkers
	asyncPending    atomic.Int64
	pending         map[uint64]appShellPending // EventLoop owner only
	nextPendingID   uint64
	listeners       map[uint64]goja.Callable // EventLoop owner only
	nextListenerID  uint64
	openPending     bool // EventLoop owner only
	mainReady       bool // EventLoop owner only
	beginCloseOnce  sync.Once
	finishCloseOnce sync.Once
}

func registerAppShell(runtime *goja.Runtime, opts InitJSOptions, ui *CustomUIRuntime) (*AppShellRuntime, error) {
	if opts.AppShell == nil {
		if err := attachAutomationApp(runtime, disabledAutomationApp(runtime)); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if opts.EventLoop == nil {
		return nil, fmt.Errorf("App Mode requires an event-loop-owned JavaScript Runtime")
	}
	bridge := &AppShellRuntime{
		runtime: runtime, loop: opts.EventLoop, context: opts.Context, shell: opts.AppShell,
		ui: ui, eventSink: opts.EventSink, onAsyncError: opts.OnAsyncError, pending: map[uint64]appShellPending{}, listeners: map[uint64]goja.Callable{},
	}
	if err := opts.AppShell.BindActionSink(bridge.enqueue); err != nil {
		return nil, fmt.Errorf("bind App Shell action dispatcher: %w", err)
	}
	if ui != nil {
		ui.appShell = bridge
	}
	if err := attachAutomationApp(runtime, bridge.jsObject()); err != nil {
		opts.AppShell.UnbindActionSink()
		return nil, err
	}
	if opts.AppOwnedScriptRun != nil {
		if err := bridge.attachAppOwnedScriptRunner(opts.AppOwnedScriptInspect, opts.AppOwnedScriptRead, opts.AppOwnedExecutionID, opts.AppOwnedScriptRun); err != nil {
			opts.AppShell.UnbindActionSink()
			return nil, err
		}
	}
	if (opts.AppOwnedFlowInspect == nil) != (opts.AppOwnedFlowRun == nil) {
		opts.AppShell.UnbindActionSink()
		return nil, errors.New("App-owned Flow bridge requires inspect and run together")
	}
	if opts.AppOwnedFlowInspect != nil {
		if err := bridge.attachAppOwnedFlowRunner(opts.AppOwnedFlowInspect, opts.AppOwnedExecutionID, opts.AppOwnedFlowRun); err != nil {
			opts.AppShell.UnbindActionSink()
			return nil, err
		}
	}
	return bridge, nil
}

func (a *AppShellRuntime) attachAppOwnedScriptRunner(inspect AppOwnedScriptInspector, read AppOwnedScriptReader, reserve AppOwnedExecutionIDAllocator, run AppOwnedScriptRunner) error {
	object := a.runtime.NewObject()
	if err := object.Set("inspect", func(call goja.FunctionCall) goja.Value {
		request, signal, err := decodeAppOwnedScriptInspectRequest(call.Argument(0))
		if err != nil {
			promise, _, reject := a.runtime.NewPromise()
			_ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", "inspectScript", err.Error()))
			return a.runtime.ToValue(promise)
		}
		return a.startAsyncWithSignal("inspectScript", signal, func(ctx context.Context) (any, error) {
			result, err := inspect(ctx, request)
			if err != nil { return nil, err }
			return appOwnedBridgeJSONValue(result)
		})
	}); err != nil {
		return fmt.Errorf("register internal App-owned Script inspector: %w", err)
	}
	if read != nil {
		if err := object.Set("read", func(call goja.FunctionCall) goja.Value {
			request, signal, err := decodeAppOwnedScriptInspectRequest(call.Argument(0))
			if err != nil {
				promise, _, reject := a.runtime.NewPromise()
				_ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", "readScript", err.Error()))
				return a.runtime.ToValue(promise)
			}
			return a.startAsyncWithSignal("readScript", signal, func(ctx context.Context) (any, error) {
				result, err := read(ctx, request)
				if err != nil { return nil, err }
				return appOwnedBridgeJSONValue(result)
			})
		}); err != nil {
			return fmt.Errorf("register internal App-owned Script reader: %w", err)
		}
	}
	if reserve != nil {
		if err := object.Set("reserve", func(goja.FunctionCall) goja.Value {
			return a.runtime.ToValue(reserve("recipe"))
		}); err != nil { return fmt.Errorf("register internal App-owned Script execution allocator: %w", err) }
	}
	if err := object.Set("run", func(call goja.FunctionCall) goja.Value {
		request, signal, err := decodeAppOwnedScriptRunRequest(call.Argument(0))
		if err != nil {
			promise, _, reject := a.runtime.NewPromise()
			_ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", "runScript", err.Error()))
			return a.runtime.ToValue(promise)
		}
		return a.startAsyncWithSignal("runScript", signal, func(ctx context.Context) (any, error) {
			result, err := run(ctx, request)
			if err != nil { return nil, err }
			return appOwnedBridgeJSONValue(result)
		})
	}); err != nil {
		return fmt.Errorf("register internal App-owned Script Runner: %w", err)
	}
	return a.runtime.GlobalObject().DefineDataProperty("__opendeskRecipeExecution", object, goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_FALSE)
}

func (a *AppShellRuntime) attachAppOwnedFlowRunner(inspect AppOwnedFlowInspector, reserve AppOwnedExecutionIDAllocator, run AppOwnedFlowRunner) error {
	object := a.runtime.NewObject()
	if err := object.Set("inspect", func(call goja.FunctionCall) goja.Value {
		request, signal, err := decodeAppOwnedFlowInspectRequest(call.Argument(0))
		if err != nil { promise, _, reject := a.runtime.NewPromise(); _ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", "inspectFlow", err.Error())); return a.runtime.ToValue(promise) }
		return a.startAsyncWithSignal("inspectFlow", signal, func(ctx context.Context) (any, error) {
			result, err := inspect(ctx, request)
			if err != nil { return nil, err }
			return appOwnedBridgeJSONValue(result)
		})
	}); err != nil { return fmt.Errorf("register internal App-owned Flow inspector: %w", err) }
	if reserve != nil {
		if err := object.Set("reserve", func(goja.FunctionCall) goja.Value {
			return a.runtime.ToValue(reserve("flow"))
		}); err != nil { return fmt.Errorf("register internal App-owned Flow execution allocator: %w", err) }
	}
	if err := object.Set("run", func(call goja.FunctionCall) goja.Value {
		request, signal, err := decodeAppOwnedFlowRunRequest(call.Argument(0))
		if err != nil { promise, _, reject := a.runtime.NewPromise(); _ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", "runFlow", err.Error())); return a.runtime.ToValue(promise) }
		return a.startAsyncWithSignal("runFlow", signal, func(ctx context.Context) (any, error) {
			result, err := run(ctx, request)
			if err != nil { return nil, err }
			return appOwnedBridgeJSONValue(result)
		})
	}); err != nil { return fmt.Errorf("register internal App-owned Flow runner: %w", err) }
	return a.runtime.GlobalObject().DefineDataProperty("__opendeskFlowExecution", object, goja.FLAG_FALSE, goja.FLAG_FALSE, goja.FLAG_FALSE)
}

func appOwnedOptionalString(object *goja.Object, name string) (string, error) {
	field := object.Get(name)
	if field == nil || goja.IsUndefined(field) || goja.IsNull(field) { return "", nil }
	exported, ok := field.Export().(string)
	if !ok { return "", fmt.Errorf("options.%s must be a string", name) }
	return strings.TrimSpace(exported), nil
}

func appOwnedRequiredString(object *goja.Object, name string) (string, error) {
	field := object.Get(name)
	if field == nil || goja.IsUndefined(field) || goja.IsNull(field) { return "", fmt.Errorf("options.%s is required", name) }
	exported, ok := field.Export().(string)
	if !ok || strings.TrimSpace(exported) == "" { return "", fmt.Errorf("options.%s must be a non-empty string", name) }
	return strings.TrimSpace(exported), nil
}
func decodeAppOwnedFlowInspectRequest(value goja.Value) (AppOwnedFlowInspectRequest, goja.Value, error) {
	object, ok := value.(*goja.Object); if !ok { return AppOwnedFlowInspectRequest{}, nil, errors.New("inspect options must be an object") }
	installID, err := appOwnedRequiredString(object, "installId"); if err != nil { return AppOwnedFlowInspectRequest{}, nil, err }
	return AppOwnedFlowInspectRequest{InstallID: installID}, object.Get("signal"), nil
}
func decodeAppOwnedFlowRunRequest(value goja.Value) (AppOwnedFlowRunRequest, goja.Value, error) {
	object, ok := value.(*goja.Object); if !ok { return AppOwnedFlowRunRequest{}, nil, errors.New("run options must be an object") }
	executionID, err := appOwnedOptionalString(object, "executionId"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	installID, err := appOwnedRequiredString(object, "installId"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	workDir, err := appOwnedRequiredString(object, "workdir"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	logDir, err := appOwnedRequiredString(object, "logDir"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	archiveDigest, err := appOwnedRequiredString(object, "expectedArchiveDigest"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	manifestDigest, err := appOwnedRequiredString(object, "expectedManifestDigest"); if err != nil { return AppOwnedFlowRunRequest{}, nil, err }
	inputJSON := "{}"
	if field := object.Get("inputJSON"); field != nil && !goja.IsUndefined(field) && !goja.IsNull(field) { exported, ok := field.Export().(string); if !ok { return AppOwnedFlowRunRequest{}, nil, errors.New("options.inputJSON must be a string") }; inputJSON = exported }
	if len(inputJSON) > 256<<10 { return AppOwnedFlowRunRequest{}, nil, errors.New("options.inputJSON is too large") }
	return AppOwnedFlowRunRequest{ExecutionID: executionID, InstallID: installID, WorkDir: workDir, LogDir: logDir, InputJSON: inputJSON, ExpectedArchiveDigest: archiveDigest, ExpectedManifestDigest: manifestDigest}, object.Get("signal"), nil
}

func decodeAppOwnedScriptInspectRequest(value goja.Value) (AppOwnedScriptInspectRequest, goja.Value, error) {
	object, ok := value.(*goja.Object)
	if !ok { return AppOwnedScriptInspectRequest{}, nil, errors.New("inspect options must be an object") }
	scriptPath, err := appOwnedRequiredString(object, "scriptPath")
	if err != nil { return AppOwnedScriptInspectRequest{}, nil, err }
	scopeRoot, err := appOwnedOptionalString(object, "scopeRoot")
	if err != nil { return AppOwnedScriptInspectRequest{}, nil, err }
	return AppOwnedScriptInspectRequest{ScriptPath: scriptPath, ScopeRoot: scopeRoot}, object.Get("signal"), nil
}

func decodeAppOwnedScriptRunRequest(value goja.Value) (AppOwnedScriptRunRequest, goja.Value, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) { return AppOwnedScriptRunRequest{}, nil, errors.New("run options are required") }
	object, ok := value.(*goja.Object)
	if !ok { return AppOwnedScriptRunRequest{}, nil, errors.New("run options must be an object") }
	scriptPath, err := appOwnedRequiredString(object, "scriptPath"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	workDir, err := appOwnedRequiredString(object, "workdir"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	logDir, err := appOwnedRequiredString(object, "logDir"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	executionID, err := appOwnedOptionalString(object, "executionId"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	scopeRoot, err := appOwnedOptionalString(object, "scopeRoot"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	expectedScriptHash, err := appOwnedOptionalString(object, "expectedScriptHash"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	inputJSON, err := appOwnedOptionalString(object, "inputJSON"); if err != nil { return AppOwnedScriptRunRequest{}, nil, err }
	if inputJSON == "" { inputJSON = "{}" }
	if len(inputJSON) > 256<<10 { return AppOwnedScriptRunRequest{}, nil, errors.New("options.inputJSON is too large") }
	return AppOwnedScriptRunRequest{
		ExecutionID: executionID, ScriptPath: scriptPath, ScopeRoot: scopeRoot,
		ExpectedScriptHash: expectedScriptHash, InputJSON: inputJSON, WorkDir: workDir, LogDir: logDir,
	}, object.Get("signal"), nil
}

func attachAutomationApp(runtime *goja.Runtime, app any) error {
	var automationObject *goja.Object
	value := runtime.Get("automation")
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		automationObject = runtime.NewObject()
		if err := runtime.Set("automation", automationObject); err != nil {
			return fmt.Errorf("register automation namespace: %w", err)
		}
	} else {
		automationObject = value.ToObject(runtime)
	}
	if err := automationObject.Set("app", app); err != nil {
		return fmt.Errorf("register automation.app: %w", err)
	}
	return nil
}

func disabledAutomationApp(runtime *goja.Runtime) map[string]any {
	disabled := func(operation string) func(goja.FunctionCall) goja.Value {
		return func(goja.FunctionCall) goja.Value {
			panic(appShellJSError(runtime, "APP_MODE_DISABLED", operation, "automation.app is available only for -app executions"))
		}
	}
	return map[string]any{
		"getCapabilities": func() any {
			return map[string]any{"enabled": false, "available": false, "reason": "not an App Mode execution"}
		},
		"onAction":               disabled("onAction"),
		"updateMenuItem":         disabled("updateMenuItem"),
		"getPermission":          disabled("getPermission"),
		"getPermissions":         disabled("getPermissions"),
		"requestPermission":      disabled("requestPermission"),
		"openPermissionSettings": disabled("openPermissionSettings"),
		"quit":                   disabled("quit"),
	}
}

func (a *AppShellRuntime) jsObject() map[string]any {
	return map[string]any{
		"getCapabilities": func() any {
			manifest := a.shell.Manifest()
			return map[string]any{
				"enabled": true, "available": true, "packageId": manifest.ID,
				"mainWindowId": manifest.Window.MainID, "closeBehavior": manifest.Window.CloseBehavior,
			}
		},
		"getPermission": func(call goja.FunctionCall) goja.Value {
			id := strings.TrimSpace(call.Argument(0).String())
			if id == "" || id == "undefined" {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "getPermission", "permission id is required"))
			}
			permission, err := CheckPermission(id)
			if err != nil {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "getPermission", err.Error()))
			}
			return a.runtime.ToValue(permission)
		},
		// getPermissions is retained for the existing aggregate product view.
		"getPermissions": func(call goja.FunctionCall) goja.Value {
			feature := "desktop-automation"
			if len(call.Arguments) > 0 && !goja.IsUndefined(call.Argument(0)) && !goja.IsNull(call.Argument(0)) {
				if value := strings.TrimSpace(call.Argument(0).String()); value != "" {
					feature = value
				}
			}
			return a.runtime.ToValue(GetPermissionReport(feature))
		},
		"requestPermission": func(call goja.FunctionCall) goja.Value {
			id := strings.TrimSpace(call.Argument(0).String())
			if id == "" || id == "undefined" {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "requestPermission", "permission id is required"))
			}
			options, err := decodePermissionRequestOptions(call.Argument(1))
			if err != nil {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "requestPermission", err.Error()))
			}
			return a.startAsync("requestPermission", func(ctx context.Context) (any, error) {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
				}
				return RequestPermissionWithOptions(id, options)
			})
		},
		"openPermissionSettings": func(call goja.FunctionCall) goja.Value {
			id := strings.TrimSpace(call.Argument(0).String())
			if id == "" || id == "undefined" {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "openPermissionSettings", "permission id is required"))
			}
			return a.startAsync("openPermissionSettings", func(ctx context.Context) (any, error) {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				default:
				}
				return OpenPermissionSettingsDetailed(id)
			})
		},
		"onAction": func(call goja.FunctionCall) goja.Value {
			callback, ok := goja.AssertFunction(call.Argument(0))
			if !ok {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "onAction", "action handler must be a function"))
			}
			if a.closing.Load() {
				panic(appShellJSError(a.runtime, "APP_QUITTING", "onAction", "App Shell is quitting"))
			}
			a.nextListenerID++
			id := a.nextListenerID
			a.listeners[id] = callback
			return a.runtime.ToValue(func(goja.FunctionCall) goja.Value {
				delete(a.listeners, id)
				return goja.Undefined()
			})
		},
		"updateMenuItem": func(call goja.FunctionCall) goja.Value {
			id := strings.TrimSpace(call.Argument(0).String())
			patch, err := decodeMenuItemPatch(call.Argument(1))
			if err != nil {
				panic(appShellJSError(a.runtime, "INVALID_ARGUMENT", "updateMenuItem", err.Error()))
			}
			return a.startAsync("updateMenuItem", func(ctx context.Context) (any, error) {
				return nil, a.shell.UpdateMenuItem(ctx, id, patch)
			})
		},
		"quit": func(goja.FunctionCall) goja.Value {
			promise, resolve, reject := a.runtime.NewPromise()
			a.loop.SetTimeout(func(runtime *goja.Runtime) {
				if err := a.shell.RequestQuit(); err != nil {
					_ = reject(appShellJSError(runtime, "APP_SHELL_ERROR", "quit", err.Error()))
					return
				}
				_ = resolve(goja.Undefined())
			}, 0)
			return a.runtime.ToValue(promise)
		},
	}
}

func decodeMenuItemPatch(value goja.Value) (appshell.MenuItemPatch, error) {
	data, err := json.Marshal(value.Export())
	if err != nil {
		return appshell.MenuItemPatch{}, err
	}
	var patch appshell.MenuItemPatch
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&patch); err != nil {
		return patch, fmt.Errorf("invalid menu item patch: %w", err)
	}
	if patch.Label == nil && patch.Enabled == nil && patch.Visible == nil {
		return patch, errors.New("menu item patch is empty")
	}
	return patch, nil
}

func decodePermissionRequestOptions(value goja.Value) (PermissionRequestOptions, error) {
	var options PermissionRequestOptions
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return options, nil
	}
	data, err := json.Marshal(value.Export())
	if err != nil {
		return options, fmt.Errorf("invalid request options: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&options); err != nil {
		return options, fmt.Errorf("invalid request options: %w", err)
	}
	return options, nil
}

func (a *AppShellRuntime) enqueue(event appshell.ActionEvent) error {
	if a.closing.Load() {
		return appshell.ErrTornDown
	}
	a.queueMu.Lock()
	if len(a.queue) >= appShellRuntimeQueueCapacity {
		a.queueMu.Unlock()
		return appshell.ErrQueueFull
	}
	a.queue = append(a.queue, event)
	a.queueMu.Unlock()
	if a.eventScheduled.CompareAndSwap(false, true) {
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.drain(runtime) }) {
			a.queueMu.Lock()
			a.queue = nil
			a.queueMu.Unlock()
			a.eventScheduled.Store(false)
			return appshell.ErrTornDown
		}
	}
	return nil
}

func (a *AppShellRuntime) drain(runtime *goja.Runtime) {
	for {
		a.queueMu.Lock()
		if len(a.queue) == 0 {
			a.queueMu.Unlock()
			break
		}
		events := append([]appshell.ActionEvent(nil), a.queue...)
		a.queue = nil
		a.queueMu.Unlock()
		for _, event := range events {
			if event.ID == "opendesk.open" {
				a.requestOpenMainWindow()
			}
			argument := runtime.ToValue(map[string]any{"id": event.ID, "source": event.Source})
			ids := make([]int, 0, len(a.listeners))
			for id := range a.listeners {
				ids = append(ids, int(id))
			}
			sort.Ints(ids)
			for _, rawID := range ids {
				listener := a.listeners[uint64(rawID)]
				if listener == nil {
					continue
				}
				result, err := listener(goja.Undefined(), argument)
				if err != nil {
					a.reportAsyncError(err)
					continue
				}
				a.observeListenerResult(result)
			}
		}
	}
	a.eventScheduled.Store(false)
	a.queueMu.Lock()
	more := len(a.queue) > 0
	a.queueMu.Unlock()
	if more && a.eventScheduled.CompareAndSwap(false, true) {
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.drain(runtime) }) {
			a.queueMu.Lock()
			a.queue = nil
			a.queueMu.Unlock()
			a.eventScheduled.Store(false)
		}
	}
}

func (a *AppShellRuntime) requestOpenMainWindow() {
	if a.ui == nil || !a.ui.appMainWindowReady(a.shell.Manifest().Window.MainID) {
		a.openPending = true
		return
	}
	a.openPending = false
	a.startDetached("open", func(ctx context.Context) error {
		return a.ui.showAppMainWindow(ctx, a.shell.Manifest().Window.MainID)
	})
}

func (a *AppShellRuntime) mainWindowReady() {
	if a == nil {
		return
	}
	a.mainReady = true
	if a.openPending && !a.closing.Load() {
		a.requestOpenMainWindow()
	}
}

func (a *AppShellRuntime) MainWindowReady() bool { return a != nil && a.mainReady }

func (a *AppShellRuntime) mainWindowEvent(event customUIAppWindowEvent) {
	if a == nil || a.closing.Load() {
		return
	}
	manifest := a.shell.Manifest()
	if event.WindowID == manifest.Window.MainID && event.Type == "close" && event.Reason == "user" && manifest.Window.CloseBehavior == "quit" {
		a.loop.SetTimeout(func(*goja.Runtime) {
			if err := a.shell.RequestQuit(); err != nil {
				a.reportAsyncError(err)
			}
		}, 0)
	}
}

func (a *AppShellRuntime) startDetached(operation string, worker func(context.Context) error) {
	if a.closing.Load() {
		return
	}
	a.workers.active.Add(1)
	a.workers.wg.Add(1)
	go func() {
		defer a.workers.active.Add(-1)
		defer a.workers.wg.Done()
		err := worker(a.context)
		if err != nil && !a.closing.Load() {
			if operation == "open" {
				emitRuntimeLog(a.eventSink, "warn", "App Shell could not reopen the Custom UI main window; tray ownership remains active", map[string]any{"error": err.Error()})
				return
			}
			a.loop.RunOnLoop(func(*goja.Runtime) { a.reportAsyncError(fmt.Errorf("automation.app.%s: %w", operation, err)) })
		}
	}()
}

func (a *AppShellRuntime) startAsync(operation string, worker func(context.Context) (any, error)) goja.Value {
	return a.startAsyncWithSignal(operation, nil, worker)
}

func (a *AppShellRuntime) startAsyncWithSignal(operation string, signal goja.Value, worker func(context.Context) (any, error)) goja.Value {
	promise, resolve, reject := a.runtime.NewPromise()
	if a.closing.Load() {
		_ = reject(appShellJSError(a.runtime, "APP_QUITTING", operation, "App Shell is quitting"))
		return a.runtime.ToValue(promise)
	}
	ctx, cancel := context.WithCancel(a.context)
	cleanup, preCanceled, err := a.bindAbortSignal(signal, cancel)
	if err != nil {
		cancel()
		_ = reject(appShellJSError(a.runtime, "INVALID_ARGUMENT", operation, err.Error()))
		return a.runtime.ToValue(promise)
	}
	if preCanceled {
		cleanup()
		cancel()
		_ = reject(appShellJSError(a.runtime, "CANCELED", operation, "operation was canceled before start"))
		return a.runtime.ToValue(promise)
	}
	a.nextPendingID++
	id := a.nextPendingID
	counted := &atomic.Bool{}
	counted.Store(true)
	a.pending[id] = appShellPending{operation: operation, cancel: cancel, cleanup: cleanup, resolve: resolve, reject: reject, counted: counted}
	a.asyncPending.Add(1)
	a.workers.active.Add(1)
	a.workers.wg.Add(1)
	go func() {
		defer a.workers.active.Add(-1)
		defer a.workers.wg.Done()
		result, err := worker(ctx)
		if !a.loop.RunOnLoop(func(runtime *goja.Runtime) { a.finishAsync(runtime, id, result, err) }) {
			if counted.CompareAndSwap(true, false) {
				a.asyncPending.Add(-1)
			}
		}
	}()
	return a.runtime.ToValue(promise)
}

func (a *AppShellRuntime) finishAsync(runtime *goja.Runtime, id uint64, value any, operationErr error) {
	pending, ok := a.pending[id]
	if !ok {
		return
	}
	delete(a.pending, id)
	if pending.counted.CompareAndSwap(true, false) {
		a.asyncPending.Add(-1)
	}
	pending.cleanup()
	pending.cancel()
	if operationErr != nil {
		_ = pending.reject(appShellAsyncJSError(runtime, pending.operation, operationErr))
		return
	}
	_ = pending.resolve(value)
}

func (a *AppShellRuntime) bindAbortSignal(value goja.Value, cancel context.CancelFunc) (func(), bool, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return func() {}, false, nil
	}
	signal, ok := value.(*goja.Object)
	if !ok {
		return nil, false, errors.New("options.signal must be an AbortSignal")
	}
	aborted, ok := signal.Get("aborted").Export().(bool)
	if !ok {
		return nil, false, errors.New("options.signal must be an AbortSignal")
	}
	add, addOK := goja.AssertFunction(signal.Get("addEventListener"))
	remove, removeOK := goja.AssertFunction(signal.Get("removeEventListener"))
	if !addOK || !removeOK {
		return nil, false, errors.New("options.signal must be an AbortSignal")
	}
	if aborted {
		return func() {}, true, nil
	}
	listener := a.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		cancel()
		return goja.Undefined()
	})
	if _, err := add(signal, a.runtime.ToValue("abort"), listener); err != nil {
		return nil, false, fmt.Errorf("options.signal must be an AbortSignal: %w", err)
	}
	return func() {
		defer func() { _ = recover() }()
		_, _ = remove(signal, a.runtime.ToValue("abort"), listener)
	}, false, nil
}

func (a *AppShellRuntime) observeListenerResult(value goja.Value) {
	constructor := a.runtime.Get("Promise").ToObject(a.runtime)
	resolve, ok := goja.AssertFunction(constructor.Get("resolve"))
	if !ok {
		a.reportAsyncError(errors.New("Promise.resolve is unavailable"))
		return
	}
	resolved, err := resolve(constructor, value)
	if err != nil {
		a.reportAsyncError(err)
		return
	}
	then, ok := goja.AssertFunction(resolved.ToObject(a.runtime).Get("then"))
	if !ok {
		return
	}
	rejected := a.runtime.ToValue(func(call goja.FunctionCall) goja.Value {
		a.reportAsyncError(fmt.Errorf("%s", call.Argument(0).String()))
		return goja.Undefined()
	})
	_, _ = then(resolved, goja.Undefined(), rejected)
}

func (a *AppShellRuntime) reportAsyncError(err error) {
	if err != nil && a.onAsyncError != nil {
		a.onAsyncError(err)
	}
}

func (a *AppShellRuntime) CancelAsync() { a.BeginCancel(); a.FinishCancel() }

func (a *AppShellRuntime) BeginCancel() {
	if a == nil {
		return
	}
	a.beginCloseOnce.Do(func() {
		a.closing.Store(true)
		a.shell.UnbindActionSink()
		for id, pending := range a.pending {
			delete(a.pending, id)
			pending.cleanup()
			pending.cancel()
			if pending.counted.CompareAndSwap(true, false) {
				a.asyncPending.Add(-1)
			}
		}
		a.listeners = map[uint64]goja.Callable{}
		a.queueMu.Lock()
		a.queue = nil
		a.queueMu.Unlock()
	})
}

func (a *AppShellRuntime) FinishCancel() {
	if a == nil {
		return
	}
	a.finishCloseOnce.Do(func() { a.shell.CancelAsync() })
}

func (a *AppShellRuntime) Wait() {
	if a == nil {
		return
	}
	a.workers.wg.Wait()
	a.shell.Wait()
}

func (a *AppShellRuntime) AsyncCounts() (workers int64, callbacks int) {
	if a == nil {
		return 0, 0
	}
	workers = a.workers.active.Load()
	a.queueMu.Lock()
	queued := len(a.queue)
	a.queueMu.Unlock()
	running, shellQueued := a.shell.ResourceCounts()
	callbacks = int(a.asyncPending.Load()) + queued + shellQueued + len(a.listeners) + running
	return workers, callbacks
}

func (a *AppShellRuntime) ResourceCounts() (running int, workers int64, pending, queued, listeners int) {
	if a == nil {
		return
	}
	running, shellQueued := a.shell.ResourceCounts()
	workers = a.workers.active.Load()
	pending = int(a.asyncPending.Load())
	a.queueMu.Lock()
	queued = len(a.queue) + shellQueued
	a.queueMu.Unlock()
	listeners = len(a.listeners)
	return
}

func (a *AppShellRuntime) KeepsAlive() bool {
	if a == nil || a.closing.Load() {
		return false
	}
	running, _ := a.shell.ResourceCounts()
	return running > 0
}

func appShellJSError(runtime *goja.Runtime, code, operation, message string) *goja.Object {
	object := runtime.NewObject()
	_ = object.Set("name", "OpenDeskAppError")
	_ = object.Set("code", code)
	_ = object.Set("operation", operation)
	_ = object.Set("message", message)
	return object
}

func appShellAsyncJSError(runtime *goja.Runtime, operation string, operationErr error) *goja.Object {
	var scriptErr *AppOwnedScriptRunError
	if errors.As(operationErr, &scriptErr) {
		code := strings.TrimSpace(scriptErr.Code); if code == "" { code = "EXECUTION_FAILED" }
		object := appShellJSError(runtime, code, operation, scriptErr.Error())
		_ = object.Set("executionId", scriptErr.Result.ExecutionID); _ = object.Set("status", scriptErr.Result.Status); _ = object.Set("logDir", scriptErr.Result.LogDir)
		return object
	}
	var flowErr *AppOwnedFlowRunError
	if errors.As(operationErr, &flowErr) {
		code := strings.TrimSpace(flowErr.Code); if code == "" { code = "EXECUTION_FAILED" }
		object := appShellJSError(runtime, code, operation, flowErr.Error())
		_ = object.Set("executionId", flowErr.Result.ExecutionID); _ = object.Set("status", flowErr.Result.Status); _ = object.Set("logDir", flowErr.Result.LogDir)
		return object
	}
	return appShellJSError(runtime, "APP_SHELL_ERROR", operation, operationErr.Error())
}

type customUIAppWindowEvent struct {
	WindowID string
	Type     string
	Reason   string
}
