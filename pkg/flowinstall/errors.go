package flowinstall

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	CodeInvalidRoot          ErrorCode = "invalid_flow_root"
	CodeTrustRequired        ErrorCode = "flow_trust_required"
	CodeTrustCanceled        ErrorCode = "flow_trust_canceled"
	CodePublisherRevoked     ErrorCode = "flow_publisher_revoked"
	CodeTrustConflict        ErrorCode = "flow_trust_conflict"
	CodeActivationRequired   ErrorCode = "flow_activation_required"
	CodeAuthorizationDenied  ErrorCode = "flow_authorization_denied"
	CodeVersionConflict      ErrorCode = "flow_version_conflict"
	CodeDowngradeDenied      ErrorCode = "flow_downgrade_denied"
	CodeIncompatibleRuntime  ErrorCode = "flow_runtime_incompatible"
	CodeIncompatiblePlatform ErrorCode = "flow_platform_incompatible"
	CodeTransactionFailed    ErrorCode = "flow_transaction_failed"
	CodeNotFound             ErrorCode = "flow_not_found"
	CodeNotReady             ErrorCode = "flow_not_ready"
)

type Error struct {
	Code    ErrorCode
	Message string
	Err     error
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return string(e.Code)
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newError(code ErrorCode, message string, err error) error {
	return &Error{Code: code, Message: message, Err: err}
}

func CodeOf(err error) ErrorCode {
	var installErr *Error
	if errors.As(err, &installErr) {
		return installErr.Code
	}
	return ""
}
