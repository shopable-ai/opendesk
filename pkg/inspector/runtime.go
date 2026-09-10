package inspector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"opendesk/automation"
	pkgExecution "opendesk/pkg/execution"
	"os"
	"strings"
	"sync"
	"time"
)

// Runner is the bounded native observation surface used by Accessibility
// Workbench. It deliberately has no arbitrary-script or perform operation.
type Runner interface {
	Capabilities(context.Context) (map[string]any, error)
	Windows(context.Context) ([]WindowCandidate, error)
	Snapshot(context.Context, map[string]any, Limits) (SnapshotResult, error)
	Validate(context.Context, map[string]any, Locator, Limits) (ValidationResult, error)
}

type Bounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type WindowCandidate struct {
	Title       string         `json:"title"`
	PID         int64          `json:"pid"`
	Application string         `json:"application,omitempty"`
	Bounds      Bounds         `json:"bounds"`
	Target      map[string]any `json:"-"`
}

type Limits struct {
	TimeoutMS int `json:"timeout"`
	MaxDepth  int `json:"maxDepth"`
	MaxNodes  int `json:"maxNodes"`
}

type Locator struct {
	Role       string  `json:"role,omitempty"`
	Name       *string `json:"name,omitempty"`
	Identifier *string `json:"identifier,omitempty"`
}

type SnapshotResult struct {
	ExecutionID string         `json:"executionId"`
	Window      map[string]any `json:"window"`
	Snapshot    map[string]any `json:"snapshot"`
}

type RuntimeError struct {
	Code        string `json:"code"`
	Operation   string `json:"operation,omitempty"`
	Backend     string `json:"backend,omitempty"`
	Phase       string `json:"phase,omitempty"`
	ActionState string `json:"actionState,omitempty"`
	Stage       string `json:"stage,omitempty"`
}

func (e *RuntimeError) Error() string {
	if e == nil || strings.TrimSpace(e.Code) == "" {
		return "inspector runtime failed"
	}
	return "inspector runtime failed: " + e.Code
}

type ValidationResult struct {
	ExecutionID string         `json:"executionId"`
	Status      string         `json:"status"`
	Window      map[string]any `json:"window,omitempty"`
	Element     map[string]any `json:"element,omitempty"`
	Error       *RuntimeError  `json:"error,omitempty"`
}

type runtimeEnvelope struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data,omitempty"`
	Error *RuntimeError   `json:"error,omitempty"`
}

// RuntimeRunner executes only the source-controlled programs below. Browser
// input is passed through Execution.input and never concatenated into source.
type RuntimeRunner struct{}

func NewRuntimeRunner() *RuntimeRunner { return &RuntimeRunner{} }

func (r *RuntimeRunner) Capabilities(ctx context.Context) (map[string]any, error) {
	var result map[string]any
	_, err := r.execute(ctx, capabilitiesProgram, map[string]any{}, 4*time.Second, &result)
	return result, err
}

func (r *RuntimeRunner) Windows(ctx context.Context) ([]WindowCandidate, error) {
	var raw []map[string]any
	_, err := r.execute(ctx, windowsProgram, map[string]any{}, 5*time.Second, &raw)
	if err != nil {
		return nil, err
	}
	result := make([]WindowCandidate, 0, len(raw))
	for _, item := range raw {
		id, _ := item["id"].(string)
		title, _ := item["title"].(string)
		pid, pidOK := jsonNumberToInt64(item["pid"])
		x, xOK := jsonNumber(item["x"])
		y, yOK := jsonNumber(item["y"])
		width, widthOK := jsonNumber(item["width"])
		height, heightOK := jsonNumber(item["height"])
		if id == "" || strings.HasSuffix(id, ":unresolved") || !pidOK || pid <= 0 ||
			!xOK || !yOK || !widthOK || !heightOK || width <= 0 || height <= 0 {
			continue
		}
		application, _ := item["exeName"].(string)
		result = append(result, WindowCandidate{
			Title: title, PID: pid, Application: application,
			Bounds: Bounds{X: x, Y: y, Width: width, Height: height},
			Target: map[string]any{"id": id},
		})
	}
	return result, nil
}

func (r *RuntimeRunner) Snapshot(ctx context.Context, target map[string]any, limits Limits) (SnapshotResult, error) {
	var result SnapshotResult
	executionID, err := r.execute(ctx, snapshotProgram, map[string]any{
		"windowTarget": target,
		"limits":       runtimeLimitsInput(limits),
	}, time.Duration(limits.TimeoutMS+1500)*time.Millisecond, &result)
	result.ExecutionID = executionID
	return result, err
}

func (r *RuntimeRunner) Validate(ctx context.Context, target map[string]any, locator Locator, limits Limits) (ValidationResult, error) {
	var result ValidationResult
	executionID, err := r.execute(ctx, validateProgram, map[string]any{
		"windowTarget": target,
		"locator":      runtimeLocatorInput(locator),
		"limits":       runtimeLimitsInput(limits),
	}, time.Duration(limits.TimeoutMS+1500)*time.Millisecond, &result)
	result.ExecutionID = executionID
	if err != nil {
		return result, err
	}
	if result.Status == "" {
		result.Status = validationStatus(result.Error)
	}
	return result, nil
}

func runtimeLimitsInput(limits Limits) map[string]any {
	return map[string]any{
		"timeout": limits.TimeoutMS, "maxDepth": limits.MaxDepth, "maxNodes": limits.MaxNodes,
	}
}

func runtimeLocatorInput(locator Locator) map[string]any {
	result := map[string]any{}
	if locator.Role != "" {
		result["role"] = locator.Role
	}
	if locator.Name != nil {
		result["name"] = *locator.Name
	}
	if locator.Identifier != nil {
		result["identifier"] = *locator.Identifier
	}
	return result
}

func (r *RuntimeRunner) execute(ctx context.Context, program string, input any, timeout time.Duration, destination any) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	executionID := pkgExecution.NewExecutionID("inspector")
	emitter, err := pkgExecution.NewEmitter(executionID, pkgExecution.TerminalSelection{
		Mode: "quiet", Categories: map[string]bool{},
	}, pkgExecution.ExecutionArtifacts{}, time.Now())
	if err != nil {
		return executionID, err
	}
	defer emitter.Close()

	var (
		mu       sync.Mutex
		captured []byte
	)
	sink := func(payload []byte) error {
		mu.Lock()
		defer mu.Unlock()
		if captured != nil {
			return errors.New("internal inspector program returned more than once")
		}
		captured = append([]byte(nil), payload...)
		return nil
	}
	workDir, _ := os.Getwd()
	result, _, runErr := pkgExecution.RunWithEmitter(pkgExecution.Request{
		Context:             ctx,
		ExecutionID:         executionID,
		SourceLabel:         "internal:accessibility-workbench",
		Ext:                 ".js",
		ScriptHash:          pkgExecution.ComputeScriptHash([]byte(program)),
		ScriptContent:       []byte(program),
		Input:               input,
		WorkDir:             workDir,
		Environment:         map[string]string{},
		Timeout:             timeout,
		EnableAccessibility: true,
		AccessibilityPolicy: automation.AccessibilityExecutionPolicy{
			ReadOnly: true, DenyValue: true,
			AllowedWindowID: inspectorWindowID(input),
		},
		InternalResultSink: sink,
	}, emitter)
	if runErr != nil {
		return executionID, runErr
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded {
		return executionID, fmt.Errorf("inspector execution ended with status %s", result.Status)
	}
	mu.Lock()
	payload := append([]byte(nil), captured...)
	mu.Unlock()
	if len(payload) == 0 {
		return executionID, errors.New("internal inspector program returned no result")
	}
	var envelope runtimeEnvelope
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return executionID, fmt.Errorf("decode inspector result: %w", err)
	}
	if !envelope.OK {
		if envelope.Error == nil {
			return executionID, errors.New("inspector runtime failed without a structured error")
		}
		return executionID, envelope.Error
	}
	if destination == nil {
		return executionID, nil
	}
	if len(envelope.Data) == 0 {
		return executionID, errors.New("inspector runtime returned no data")
	}
	if err := json.Unmarshal(envelope.Data, destination); err != nil {
		return executionID, fmt.Errorf("decode inspector data: %w", err)
	}
	return executionID, nil
}

func inspectorWindowID(input any) string {
	root, _ := input.(map[string]any)
	target, _ := root["windowTarget"].(map[string]any)
	id, _ := target["id"].(string)
	return strings.TrimSpace(id)
}

func validationStatus(runtimeErr *RuntimeError) string {
	if runtimeErr == nil {
		return "BACKEND_UNAVAILABLE"
	}
	if runtimeErr.Stage == "window" {
		switch runtimeErr.Code {
		case "NOT_FOUND", "TARGET_NOT_FOUND", "STALE_TARGET", "AMBIGUOUS_TARGET":
			return "STALE_TARGET"
		}
	}
	switch runtimeErr.Code {
	case "AMBIGUOUS_TARGET":
		return "AMBIGUOUS"
	case "SEARCH_INCOMPLETE":
		return "SEARCH_INCOMPLETE"
	case "TIMEOUT", "CANCELED":
		return "TIMEOUT"
	case "PERMISSION_DENIED":
		return "PERMISSION_DENIED"
	case "NOT_FOUND", "TARGET_NOT_FOUND":
		return "NOT_FOUND"
	case "STALE_TARGET":
		return "STALE_TARGET"
	default:
		return "BACKEND_UNAVAILABLE"
	}
}

func jsonNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case json.Number:
		parsed, err := typed.Float64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func jsonNumberToInt64(value any) (int64, bool) {
	number, ok := jsonNumber(value)
	if !ok || number != float64(int64(number)) {
		return 0, false
	}
	return int64(number), true
}

const programPrelude = `
const __inspectorEmit = value => globalThis.__opendeskInspectorResult(JSON.stringify(value));
const __inspectorError = (error, stage) => ({
  code: String(error && error.code || "BACKEND_FAILED"),
  operation: String(error && error.operation || ""),
  backend: String(error && error.backend || ""),
  phase: String(error && error.phase || ""),
  actionState: String(error && error.actionState || "not_started"),
  stage
});
`

const capabilitiesProgram = programPrelude + `
try {
  __inspectorEmit({ok:true,data:{
    accessibility: Accessibility.getCapabilities(),
    window: window.getCapabilities()
  }});
} catch (error) {
  __inspectorEmit({ok:false,error:__inspectorError(error,"capabilities")});
}
`

const windowsProgram = programPrelude + `
try {
  __inspectorEmit({ok:true,data:window.list()});
} catch (error) {
  __inspectorEmit({ok:false,error:__inspectorError(error,"windows")});
}
`

const snapshotProgram = programPrelude + `
let __window;
try {
  __window = await window.get(Execution.input.windowTarget);
} catch (error) {
  __inspectorEmit({ok:false,error:__inspectorError(error,"window")});
  return;
}
try {
  const limits = Execution.input.limits;
  const snapshot = await Accessibility.snapshot({
    within: __window,
    timeout: limits.timeout,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
    properties: ["role","nativeRole","nativeSubrole","name","identifier","enabled","focused","selected","checked","expanded","actions","nativeBounds","bounds"]
  });
  __inspectorEmit({ok:true,data:{window:__window,snapshot}});
} catch (error) {
  __inspectorEmit({ok:false,error:__inspectorError(error,"snapshot")});
}
`

const validateProgram = programPrelude + `
let __window;
try {
  __window = await window.get(Execution.input.windowTarget);
} catch (error) {
  const runtimeError = __inspectorError(error,"window");
  __inspectorEmit({ok:true,data:{status:"STALE_TARGET",error:runtimeError}});
  return;
}
let __ref = null;
let __result;
try {
  const limits = Execution.input.limits;
  __ref = await Accessibility.find(Execution.input.locator, {
    within: __window,
    timeout: limits.timeout,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes
  });
  if (!__ref) {
    __result = {status:"NOT_FOUND",window:__window};
  } else {
    const read = await Accessibility.read(__ref, {
      timeout: limits.timeout,
      properties: ["role","nativeRole","nativeSubrole","name","identifier","enabled","focused","selected","checked","expanded","actions","nativeBounds","bounds"]
    });
    __result = {status:"UNIQUE",window:__window,element:read.properties};
  }
} catch (error) {
  const runtimeError = __inspectorError(error,"locator");
  const statuses = {
    AMBIGUOUS_TARGET:"AMBIGUOUS", SEARCH_INCOMPLETE:"SEARCH_INCOMPLETE",
    TIMEOUT:"TIMEOUT", CANCELED:"TIMEOUT", PERMISSION_DENIED:"PERMISSION_DENIED",
    TARGET_NOT_FOUND:"NOT_FOUND", STALE_TARGET:"STALE_TARGET",
    NOT_SUPPORTED:"BACKEND_UNAVAILABLE", CAPABILITY_DISABLED:"BACKEND_UNAVAILABLE",
    BACKEND_FAILED:"BACKEND_UNAVAILABLE"
  };
  __result = {status:statuses[runtimeError.code] || "BACKEND_UNAVAILABLE",window:__window,error:runtimeError};
} finally {
  if (__ref) {
    try {
      await Accessibility.release(__ref);
    } catch (error) {
      __result = {status:"BACKEND_UNAVAILABLE",window:__window,error:__inspectorError(error,"release")};
    }
  }
}
__inspectorEmit({ok:true,data:__result});
`
