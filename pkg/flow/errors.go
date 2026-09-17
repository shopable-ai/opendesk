package flow

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	CodeUnsupportedFormat       ErrorCode = "unsupported_format"
	CodeInvalidPackage          ErrorCode = "invalid_package"
	CodePackageTooLarge         ErrorCode = "package_too_large"
	CodeInvalidManifest         ErrorCode = "invalid_manifest"
	CodeInvalidPath             ErrorCode = "invalid_path"
	CodeFileMismatch            ErrorCode = "file_mismatch"
	CodeInvalidSignature        ErrorCode = "invalid_signature"
	CodeProtectedPackageInvalid ErrorCode = "protected_package_invalid"
	CodeOutputExists            ErrorCode = "output_exists"

	CodeInvalidInstallRoot     ErrorCode = "invalid_install_root"
	CodePublisherTrustRequired ErrorCode = "publisher_trust_required"
	CodePublisherRejected      ErrorCode = "publisher_rejected"
	CodeTrustStoreCorrupt      ErrorCode = "trust_store_corrupt"
	CodeCatalogCorrupt         ErrorCode = "catalog_corrupt"
	CodeInstallConflict        ErrorCode = "install_conflict"
	CodeTransactionFailed      ErrorCode = "transaction_failed"
	CodeNotInstalled           ErrorCode = "not_installed"
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
	var flowErr *Error
	if errors.As(err, &flowErr) {
		return flowErr.Code
	}
	return ""
}
