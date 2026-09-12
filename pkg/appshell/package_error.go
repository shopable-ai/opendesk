package appshell

import (
	"errors"
	"fmt"
	"strings"
)

const (
	ErrPackageRootInvalid        = "APP_PACKAGE_ROOT_INVALID"
	ErrManifestNotFound          = "APP_PACKAGE_MANIFEST_NOT_FOUND"
	ErrManifestInvalid           = "APP_PACKAGE_MANIFEST_INVALID"
	ErrManifestSchemaUnsupported = "APP_PACKAGE_SCHEMA_UNSUPPORTED"
	ErrPackageIDInvalid          = "APP_PACKAGE_ID_INVALID"
	ErrPackageVersionInvalid     = "APP_PACKAGE_VERSION_INVALID"
	ErrPackageEntryMissing       = "APP_PACKAGE_ENTRY_MISSING"
	ErrPackageResourceMissing    = "APP_PACKAGE_RESOURCE_MISSING"
	ErrPackageResourceEscape     = "APP_PACKAGE_RESOURCE_ESCAPE"
	ErrPackageResourceInvalid    = "APP_PACKAGE_RESOURCE_INVALID"
	ErrPackageCapabilityInvalid  = "APP_PACKAGE_CAPABILITY_INVALID"
	ErrRuntimeTooOld             = "APP_RUNTIME_TOO_OLD"
	ErrRuntimeVersionInvalid     = "APP_RUNTIME_VERSION_INVALID"
)

type PackageError struct {
	Code     string
	Field    string
	Expected string
	Actual   string
	Fix      string
	Err      error
}

func (e *PackageError) Error() string {
	if e == nil {
		return ""
	}
	parts := []string{e.Code}
	if e.Field != "" {
		parts = append(parts, "field="+e.Field)
	}
	if e.Expected != "" {
		parts = append(parts, "expected="+e.Expected)
	}
	if e.Actual != "" {
		parts = append(parts, "actual="+e.Actual)
	}
	if e.Fix != "" {
		parts = append(parts, "fix="+e.Fix)
	}
	message := strings.Join(parts, " ")
	if e.Err != nil {
		message += ": " + e.Err.Error()
	}
	return message
}

func (e *PackageError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func IsPackageErrorCode(err error, code string) bool {
	var packageErr *PackageError
	return errors.As(err, &packageErr) && packageErr.Code == code
}

func newPackageError(code, field, expected, actual, fix string, cause error) error {
	if cause == nil {
		cause = fmt.Errorf("package validation failed")
	}
	return &PackageError{Code: code, Field: field, Expected: expected, Actual: actual, Fix: fix, Err: cause}
}
