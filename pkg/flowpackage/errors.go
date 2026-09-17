package flowpackage

import (
	"errors"
	"fmt"
)

// ErrorCode is a stable, non-secret failure category for .odflow operations.
type ErrorCode string

const (
	CodeUnsupportedFormat ErrorCode = "unsupported_flow_format"
	CodeInvalidContainer  ErrorCode = "invalid_flow_container"
	CodeFlowTooLarge      ErrorCode = "flow_too_large"
	CodeInvalidManifest   ErrorCode = "invalid_flow_manifest"
	CodeInvalidSignature  ErrorCode = "invalid_flow_signature"
	CodePayloadMismatch   ErrorCode = "flow_payload_mismatch"
	CodeIdentityMismatch  ErrorCode = "flow_identity_mismatch"
	CodeOutputExists      ErrorCode = "output_exists"
)

// Error deliberately exposes only a bounded public message. Wrapped causes
// are for local diagnostics and must never contain key material or plaintext.
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
	var flowErr *Error
	if errors.As(err, &flowErr) {
		return flowErr.Code
	}
	return ""
}
