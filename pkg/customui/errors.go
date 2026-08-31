package customui

import "fmt"

// Stable error codes exposed to the JavaScript Runtime.
const (
	CodeDisabled              = "UI_DISABLED"
	CodeUnsupportedPlatform   = "UNSUPPORTED_PLATFORM"
	CodeUnsupportedCapability = "UNSUPPORTED_CAPABILITY"
	CodeInvalidSpec           = "INVALID_SPEC"
	CodeDuplicateID           = "DUPLICATE_ID"
	CodeNotFound              = "NOT_FOUND"
	CodeInvalidState          = "INVALID_STATE"
	CodeQueueOverflow         = "UI_EVENT_QUEUE_OVERFLOW"
	CodeDriverFailure         = "UI_DRIVER_FAILURE"
	CodeHostNotFound          = "UI_HOST_NOT_FOUND"
	CodeBusy                  = "UI_BUSY"
	CodeCanceled              = "UI_CANCELED"
)

// Error is the structured failure shared by the core, drivers, and Runtime
// adapter. It deliberately contains no Goja values and is safe across threads.
type Error struct {
	Code       string
	Message    string
	Operation  string
	WindowID   string
	TargetID   string
	Capability string
	Cause      error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	message := e.Message
	if message == "" {
		message = e.Code
	} else if e.Code != "" {
		message = e.Code + ": " + message
	}
	if e.Operation != "" {
		message = e.Operation + ": " + message
	}
	if e.Cause != nil {
		message += ": " + e.Cause.Error()
	}
	return message
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func invalidSpec(message string) error {
	return &Error{Code: CodeInvalidSpec, Message: message, Operation: "createWindow"}
}

func wrapDriver(operation, windowID string, err error) error {
	if err == nil {
		return nil
	}
	if _, ok := err.(*Error); ok {
		return err
	}
	return &Error{
		Code:      CodeDriverFailure,
		Message:   fmt.Sprintf("native UI driver failed for window %q", windowID),
		Operation: operation,
		WindowID:  windowID,
		Cause:     err,
	}
}
