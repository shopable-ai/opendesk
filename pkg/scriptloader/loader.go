package scriptloader

import (
	"context"
	"errors"
	"fmt"

	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type ProtectionMode string

const (
	ProtectionPlain     ProtectionMode = "plain"
	ProtectionProtected ProtectionMode = "protected"
)

type ProtectionInfo struct {
	Mode              ProtectionMode `json:"mode"`
	PackageID         string         `json:"packageId,omitempty"`
	ProductID         string         `json:"productId,omitempty"`
	PublisherID       string         `json:"publisherId,omitempty"`
	PublisherKeyID    string         `json:"publisherKeyId,omitempty"`
	ContentKeyID      string         `json:"contentKeyId,omitempty"`
	PackageDigest     string         `json:"packageDigest,omitempty"`
	SignatureVerified bool           `json:"signatureVerified,omitempty"`
	LicenseDecision   string         `json:"licenseDecision,omitempty"`
}

type ScriptSource struct {
	Content    []byte
	Source     string
	Ext        string
	Protection ProtectionInfo
}

type Loader interface {
	Load(ctx context.Context, path string) (*ScriptSource, error)
}

type Error struct {
	Code    string
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
	return e.Code
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newError(code, message string, err error) error {
	return &Error{Code: code, Message: message, Err: err}
}

// ErrorCodeOf returns a stable package/licensing/loader code when the error
// belongs to the source-loading boundary. Unknown execution/runtime errors are
// deliberately left unclassified so callers can map them to execution_failed.
func ErrorCodeOf(err error) string {
	var loaderErr *Error
	if errors.As(err, &loaderErr) {
		return loaderErr.Code
	}
	if code := scriptpackage.CodeOf(err); code != "" {
		return string(code)
	}
	if code := licensing.CodeOf(err); code != "" {
		return string(code)
	}
	return ""
}
