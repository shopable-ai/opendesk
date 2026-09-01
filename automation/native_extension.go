package automation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/dop251/goja"
	"opendesk/pkg/nativeextension"
)

// nativeExtensionRuntime is deliberately a hand-written Goja adapter. The
// generic reflection bridge only propagates an error message and would discard
// the structured error code and privacy-minimized invocation evidence.
type nativeExtensionRuntime struct {
	runtime *goja.Runtime
	context context.Context
	sink    EventSink
	host    *nativeextension.Host
}

type nativeExtensionCallOptions struct {
	executable string
	method     string
	params     any
	timeout    time.Duration
}

type nativeExtensionOptionError struct {
	code    nativeextension.ErrorCode
	message string
}

func registerNativeExtension(runtime *goja.Runtime, ctx context.Context, sink EventSink) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	bridge := &nativeExtensionRuntime{
		runtime: runtime,
		context: ctx,
		sink:    sink,
		host:    nativeextension.NewHost(),
	}
	object := runtime.NewObject()
	if err := object.Set("call", bridge.call); err != nil {
		return fmt.Errorf("set NativeExtension.call: %w", err)
	}
	if err := runtime.Set("NativeExtension", object); err != nil {
		return fmt.Errorf("set NativeExtension: %w", err)
	}
	return nil
}

func (n *nativeExtensionRuntime) call(call goja.FunctionCall) goja.Value {
	options, evidence, optionErr := n.optionsFromCall(call)
	if optionErr != nil {
		evidence.ErrorCode = optionErr.code
		n.emitEvidence(evidence)
		n.throwError(optionErr.code, "", optionErr.message, evidence)
	}

	result, err := n.host.Call(n.context, nativeextension.CallOptions{
		Executable: options.executable,
		Method:     options.method,
		Params:     options.params,
		Timeout:    options.timeout,
	})
	if err == nil {
		n.emitEvidence(result.Evidence)
		return n.runtime.ToValue(result.Result)
	}

	var callErr *nativeextension.CallError
	if errors.As(err, &callErr) {
		extensionCode := callErr.Evidence.ExtensionErrorCode
		if callErr.ExtensionError != nil {
			extensionCode = callErr.ExtensionError.Code
		}
		n.emitEvidence(callErr.Evidence)
		// An unsafe V0 call may target an arbitrary local program. Its raw
		// failure text is not safe to propagate into a Runtime summary.
		n.throwError(callErr.Code, extensionCode, "native extension call failed", callErr.Evidence)
	}

	// Host.Call currently normalizes every failure to CallError. Keep this
	// fallback so a future internal host failure is still diagnosable in JS.
	evidence.Status = nativeextension.StatusFailed
	evidence.ErrorCode = nativeextension.CodeProcessFailed
	n.emitEvidence(evidence)
	n.throwError(nativeextension.CodeProcessFailed, "", "native extension call failed", evidence)
	return goja.Undefined()
}

func (n *nativeExtensionRuntime) optionsFromCall(call goja.FunctionCall) (nativeExtensionCallOptions, nativeextension.Evidence, *nativeExtensionOptionError) {
	evidence := nativeextension.Evidence{
		Protocol:        nativeextension.ProtocolName,
		ProtocolVersion: nativeextension.ProtocolVersion,
		Status:          nativeextension.StatusFailed,
	}
	invalidRequest := func(message string) (nativeExtensionCallOptions, nativeextension.Evidence, *nativeExtensionOptionError) {
		return nativeExtensionCallOptions{}, evidence, &nativeExtensionOptionError{code: nativeextension.CodeInvalidRequest, message: message}
	}
	invalidParams := func(message string) (nativeExtensionCallOptions, nativeextension.Evidence, *nativeExtensionOptionError) {
		return nativeExtensionCallOptions{}, evidence, &nativeExtensionOptionError{code: nativeextension.CodeInvalidParams, message: message}
	}

	argument := call.Argument(0)
	if goja.IsUndefined(argument) || goja.IsNull(argument) {
		return invalidRequest("NativeExtension.call options are required")
	}
	exported, ok := argument.Export().(map[string]any)
	if !ok {
		return invalidRequest("NativeExtension.call options must be an object")
	}

	method, ok := exported["method"].(string)
	if !ok || strings.TrimSpace(method) == "" {
		return invalidParams("method must be a non-empty string")
	}
	method = strings.TrimSpace(method)
	evidence.Method = method

	extensionValue, hasExtension := exported["extension"]
	executableValue, hasExecutable := exported["executable"]
	if hasExtension && hasExecutable {
		return invalidParams("extension and executable are mutually exclusive")
	}
	if !hasExtension && !hasExecutable {
		return invalidParams("extension or executable must be provided")
	}

	var executable string
	if hasExtension {
		extension, ok := extensionValue.(string)
		if !ok || strings.TrimSpace(extension) == "" {
			return invalidParams("extension must be a non-empty string")
		}
		var err error
		executable, err = nativeextension.ResolveDefaultExecutable(extension)
		if err != nil {
			return invalidParams("extension must be a safe filename")
		}
	} else {
		var ok bool
		executable, ok = executableValue.(string)
		if !ok || strings.TrimSpace(executable) == "" {
			return invalidParams("executable must be a non-empty string")
		}
		executable = strings.TrimSpace(executable)
	}
	evidence.Executable = executable

	params := any(map[string]any{})
	if value, exists := exported["params"]; exists {
		if _, ok := value.(map[string]any); !ok {
			return invalidParams("params must be an object")
		}
		params = value
	}

	var timeout time.Duration
	if value, exists := exported["timeoutMs"]; exists {
		milliseconds, ok := nativeExtensionMilliseconds(value)
		if !ok || math.IsNaN(milliseconds) || math.IsInf(milliseconds, 0) || milliseconds <= 0 || math.Trunc(milliseconds) != milliseconds {
			return invalidParams("timeoutMs must be a positive finite integer")
		}
		if milliseconds > float64(math.MaxInt64/int64(time.Millisecond)) {
			return invalidParams("timeoutMs is too large")
		}
		timeout = time.Duration(milliseconds) * time.Millisecond
	}

	return nativeExtensionCallOptions{
		executable: executable,
		method:     method,
		params:     params,
		timeout:    timeout,
	}, evidence, nil
}

func nativeExtensionMilliseconds(value any) (float64, bool) {
	switch number := value.(type) {
	case int:
		return float64(number), true
	case int8:
		return float64(number), true
	case int16:
		return float64(number), true
	case int32:
		return float64(number), true
	case int64:
		return float64(number), true
	case uint:
		return float64(number), true
	case uint8:
		return float64(number), true
	case uint16:
		return float64(number), true
	case uint32:
		return float64(number), true
	case uint64:
		return float64(number), true
	case float32:
		return float64(number), true
	case float64:
		return number, true
	default:
		return 0, false
	}
}

func (n *nativeExtensionRuntime) emitEvidence(evidence nativeextension.Evidence) {
	if n == nil || n.sink == nil {
		return
	}
	level := "info"
	message := "native extension call succeeded"
	if evidence.Status != nativeextension.StatusSucceeded {
		level = "error"
		message = "native extension call failed"
	}
	n.sink.Emit("meta", level, "runtime", "native_extension_call", message, nativeExtensionEvidenceMap(evidence))
}

func (n *nativeExtensionRuntime) throwError(code nativeextension.ErrorCode, extensionCode, message string, evidence nativeextension.Evidence) {
	if strings.TrimSpace(message) == "" {
		message = string(code)
	}
	value := n.runtime.NewGoError(errors.New(message))
	must(value.Set("name", "NativeExtensionError"))
	must(value.Set("code", string(code)))
	must(value.Set("extensionCode", extensionCode))
	must(value.Set("evidence", nativeExtensionEvidenceMap(evidence)))
	panic(value)
}

func nativeExtensionEvidenceMap(evidence nativeextension.Evidence) map[string]any {
	var exitCode any
	if evidence.ExitCode != nil {
		exitCode = *evidence.ExitCode
	}
	return map[string]any{
		"protocol":          evidence.Protocol,
		"protocolVersion":   evidence.ProtocolVersion,
		"startupDurationMs": evidence.StartupDurationMS,
		"durationMs":        evidence.DurationMS,
		"exitCode":          exitCode,
		"status":            evidence.Status,
		"errorCode":         string(evidence.ErrorCode),
		"stderrTruncated":   evidence.StderrTruncated,
	}
}
