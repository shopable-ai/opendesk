package automation

import (
	"context"
	"errors"
	"runtime"
	"strings"
	"time"

	"github.com/dop251/goja"
)

type SystemSessionErrorCode string

const (
	SystemSessionInvalidArgument      SystemSessionErrorCode = "INVALID_ARGUMENT"
	SystemSessionConfirmationRequired SystemSessionErrorCode = "CONFIRMATION_REQUIRED"
	SystemSessionNotSupported         SystemSessionErrorCode = "NOT_SUPPORTED"
	SystemSessionBackendFailed        SystemSessionErrorCode = "BACKEND_FAILED"
)

type SystemSessionError struct {
	Code      SystemSessionErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *SystemSessionError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" {
		message = "system session operation failed"
	}
	return string(e.Code) + ": " + message
}

func (e *SystemSessionError) Unwrap() error { return e.Cause }

type SystemSessionOperationCapability struct {
	Supported            bool   `json:"supported"`
	Verified             bool   `json:"verified"`
	Destructive          bool   `json:"destructive"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	Notes                string `json:"notes,omitempty"`
}

type SystemSessionCapabilities struct {
	SchemaVersion    int                              `json:"schemaVersion"`
	Platform         string                           `json:"platform"`
	Backend          string                           `json:"backend"`
	State            SystemSessionOperationCapability `json:"state"`
	Lock             SystemSessionOperationCapability `json:"lock"`
	Logout           SystemSessionOperationCapability `json:"logout"`
	StartScreenSaver SystemSessionOperationCapability `json:"startScreenSaver"`
	Wake             SystemSessionOperationCapability `json:"wake"`
	SwitchUser       SystemSessionOperationCapability `json:"switchUser"`
}

type SystemSessionState struct {
	SchemaVersion int         `json:"schemaVersion"`
	Platform      string      `json:"platform"`
	Backend       string      `json:"backend"`
	State         string      `json:"state"`
	UserID        interface{} `json:"userId,omitempty"`
	SessionID     interface{} `json:"sessionId,omitempty"`
	Active        interface{} `json:"active"`
	OnConsole     interface{} `json:"onConsole"`
	LoginDone     interface{} `json:"loginDone"`
	Remote        interface{} `json:"remote"`
	Locked        interface{} `json:"locked"`
	ObservedAt    string      `json:"observedAt"`
}

type SystemSessionBackend interface {
	Capabilities() SystemSessionCapabilities
	State(context.Context) (SystemSessionState, error)
	Lock(context.Context) error
	Logout(context.Context, bool) error
	StartScreenSaver(context.Context) error
}

type SystemSessionBackendFactory func() SystemSessionBackend

type systemSessionActionOptions struct {
	confirm bool
	force   bool
}

func registerSystemSession(runtimeValue *goja.Runtime, system *System, methods map[string]interface{}) {
	methods["getSessionCapabilities"] = func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) > 0 && !goja.IsUndefined(call.Argument(0)) {
			panic(systemSessionJSError(runtimeValue, systemSessionOperationError("System.getSessionCapabilities", SystemSessionInvalidArgument, "method does not accept arguments", nil)))
		}
		return runtimeValue.ToValue(projectSystemSessionCapabilities(system.session.Capabilities()))
	}
	methods["getSessionState"] = func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) > 0 && !goja.IsUndefined(call.Argument(0)) {
			panic(systemSessionJSError(runtimeValue, systemSessionOperationError("System.getSessionState", SystemSessionInvalidArgument, "method does not accept arguments", nil)))
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		state, err := system.session.State(ctx)
		if err != nil {
			panic(systemSessionJSError(runtimeValue, wrapSystemSessionError("System.getSessionState", err)))
		}
		return runtimeValue.ToValue(projectSystemSessionState(state))
	}
	methods["lock"] = func(call goja.FunctionCall) goja.Value {
		return runSystemSessionAction(runtimeValue, system, "System.lock", call.Argument(0), false, func(ctx context.Context, _ systemSessionActionOptions) error {
			return system.session.Lock(ctx)
		})
	}
	methods["logout"] = func(call goja.FunctionCall) goja.Value {
		return runSystemSessionAction(runtimeValue, system, "System.logout", call.Argument(0), true, func(ctx context.Context, options systemSessionActionOptions) error {
			return system.session.Logout(ctx, options.force)
		})
	}
	methods["startScreenSaver"] = func(call goja.FunctionCall) goja.Value {
		return runSystemSessionAction(runtimeValue, system, "System.startScreenSaver", call.Argument(0), false, func(ctx context.Context, _ systemSessionActionOptions) error {
			return system.session.StartScreenSaver(ctx)
		})
	}
}

func runSystemSessionAction(runtimeValue *goja.Runtime, system *System, operation string, value goja.Value, allowForce bool, action func(context.Context, systemSessionActionOptions) error) goja.Value {
	options, err := parseSystemSessionActionOptions(value, operation, allowForce)
	if err != nil {
		panic(systemSessionJSError(runtimeValue, err))
	}
	if !options.confirm {
		panic(systemSessionJSError(runtimeValue, systemSessionOperationError(operation, SystemSessionConfirmationRequired, "confirm: true is required for this session-changing operation", nil)))
	}
	capabilities := system.session.Capabilities()
	capability := capabilities.StartScreenSaver
	switch operation {
	case "System.lock":
		capability = capabilities.Lock
	case "System.logout":
		capability = capabilities.Logout
	}
	if !capability.Supported {
		panic(systemSessionJSError(runtimeValue, systemSessionOperationError(operation, SystemSessionNotSupported, capability.Notes, nil)))
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := action(ctx, options); err != nil {
		panic(systemSessionJSError(runtimeValue, wrapSystemSessionError(operation, err)))
	}
	return runtimeValue.ToValue(map[string]interface{}{
		"initiated": true, "verified": false, "operation": operation,
		"platform": capabilities.Platform, "backend": capabilities.Backend,
	})
}

func parseSystemSessionActionOptions(value goja.Value, operation string, allowForce bool) (systemSessionActionOptions, error) {
	result := systemSessionActionOptions{}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, systemSessionOperationError(operation, SystemSessionInvalidArgument, "options must be an object", nil)
	}
	for key, raw := range options {
		switch key {
		case "confirm":
			confirm, valid := raw.(bool)
			if !valid {
				return result, systemSessionOperationError(operation, SystemSessionInvalidArgument, "confirm must be a boolean", nil)
			}
			result.confirm = confirm
		case "force":
			if !allowForce {
				return result, systemSessionOperationError(operation, SystemSessionInvalidArgument, "force is not supported for this operation", nil)
			}
			force, valid := raw.(bool)
			if !valid {
				return result, systemSessionOperationError(operation, SystemSessionInvalidArgument, "force must be a boolean", nil)
			}
			result.force = force
		default:
			return result, systemSessionOperationError(operation, SystemSessionInvalidArgument, "options contains an unknown field", nil)
		}
	}
	return result, nil
}

func projectSystemSessionCapabilities(capabilities SystemSessionCapabilities) map[string]interface{} {
	operation := func(value SystemSessionOperationCapability) map[string]interface{} {
		return map[string]interface{}{
			"supported": value.Supported, "verified": value.Verified,
			"destructive": value.Destructive, "requiresConfirmation": value.RequiresConfirmation,
			"notes": value.Notes,
		}
	}
	return map[string]interface{}{
		"schemaVersion": capabilities.SchemaVersion,
		"platform":      capabilities.Platform, "backend": capabilities.Backend,
		"state": operation(capabilities.State), "lock": operation(capabilities.Lock),
		"logout": operation(capabilities.Logout), "startScreenSaver": operation(capabilities.StartScreenSaver),
		"wake": operation(capabilities.Wake), "switchUser": operation(capabilities.SwitchUser),
	}
}

func projectSystemSessionState(state SystemSessionState) map[string]interface{} {
	return map[string]interface{}{
		"schemaVersion": state.SchemaVersion,
		"platform":      state.Platform, "backend": state.Backend, "state": state.State,
		"userId": state.UserID, "sessionId": state.SessionID, "active": state.Active,
		"onConsole": state.OnConsole, "loginDone": state.LoginDone, "remote": state.Remote,
		"locked": state.Locked, "observedAt": state.ObservedAt,
	}
}

func systemSessionOperationError(operation string, code SystemSessionErrorCode, message string, cause error) error {
	return &SystemSessionError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapSystemSessionError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var typed *SystemSessionError
	if errors.As(err, &typed) {
		copy := *typed
		if copy.Operation == "" {
			copy.Operation = operation
		}
		return &copy
	}
	return systemSessionOperationError(operation, SystemSessionBackendFailed, "system session backend failed", err)
}

func systemSessionJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var typed *SystemSessionError
	if errors.As(err, &typed) {
		_ = object.Set("code", string(typed.Code))
		_ = object.Set("operation", typed.Operation)
	}
	return object
}

func unsupportedSystemSessionCapabilities(backend, notes string) SystemSessionCapabilities {
	unsupported := SystemSessionOperationCapability{Supported: false, Verified: false, Notes: notes}
	return SystemSessionCapabilities{
		SchemaVersion: 1, Platform: runtime.GOOS, Backend: backend,
		State:            unsupported,
		Lock:             SystemSessionOperationCapability{Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: notes},
		Logout:           SystemSessionOperationCapability{Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: notes},
		StartScreenSaver: SystemSessionOperationCapability{Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: notes},
		Wake:             SystemSessionOperationCapability{Supported: false, Verified: false, Notes: "wake is not exposed; OpenDesk does not bypass a locked or sleeping session"},
		SwitchUser:       SystemSessionOperationCapability{Supported: false, Verified: false, Notes: "user switching is outside the current System session surface"},
	}
}

func newSystemSessionState(platform, backend, state string) SystemSessionState {
	return SystemSessionState{
		SchemaVersion: 1, Platform: platform, Backend: backend, State: state,
		Active: nil, OnConsole: nil, LoginDone: nil, Remote: nil, Locked: nil,
		ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
}
