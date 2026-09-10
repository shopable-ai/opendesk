package scriptpackage

import (
	"errors"
	"fmt"
)

// ErrorCode is a stable, non-secret classification for protected-package failures.
type ErrorCode string

const (
	CodeUnsupportedFormat ErrorCode = "unsupported_format"
	CodeInvalidPackage    ErrorCode = "invalid_package"
	CodePackageTooLarge   ErrorCode = "package_too_large"
	CodeInvalidManifest   ErrorCode = "invalid_manifest"
	CodeInvalidSignature  ErrorCode = "invalid_signature"
	CodeDecryptionFailed  ErrorCode = "decryption_failed"
	CodePayloadInvalid    ErrorCode = "payload_invalid"
	CodeUnsupportedPayload ErrorCode = "unsupported_payload"
)

// Error intentionally carries only a safe public message plus an optional wrapped cause.
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

// CodeOf returns a stable error code without exposing wrapped key or plaintext material.
func CodeOf(err error) ErrorCode {
	var packageErr *Error
	if errors.As(err, &packageErr) {
		return packageErr.Code
	}
	return ""
}
