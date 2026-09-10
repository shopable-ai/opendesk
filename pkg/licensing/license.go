package licensing

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"time"

	"opendesk/pkg/scriptpackage"
)

type ErrorCode string

const (
	CodeUnknownPublisher      ErrorCode = "unknown_publisher"
	CodeLicenseRequired       ErrorCode = "license_required"
	CodeLicenseDenied         ErrorCode = "license_denied"
	CodeLicenseExpired        ErrorCode = "license_expired"
	CodeLicenseNotYetValid    ErrorCode = "license_not_yet_valid"
	CodeInvalidLicense        ErrorCode = "invalid_license"
	CodeInvalidLicenseSign    ErrorCode = "invalid_license_signature"
	CodeWrongDevice           ErrorCode = "wrong_device"
	CodeContentKeyUnavailable ErrorCode = "content_key_unavailable"
	CodeDeviceKeyUnavailable  ErrorCode = "device_key_unavailable"
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

func NewError(code ErrorCode, message string, err error) error {
	return &Error{Code: code, Message: message, Err: err}
}

func CodeOf(err error) ErrorCode {
	var licensingErr *Error
	if errors.As(err, &licensingErr) {
		return licensingErr.Code
	}
	return ""
}

type Entitlement struct {
	LicenseID          string
	ProductID          string
	PackageID          string
	ContentKeyID       string
	SubjectID          string
	DeviceID           string
	DeviceKeyAlgorithm string
	ExpiresAt          time.Time
	KeyEnvelope        KeyEnvelope
	verifiedClaims     *LicenseClaims
}

type LicenseVerifier interface {
	Verify(ctx context.Context, manifest scriptpackage.Manifest) (*Entitlement, error)
}

type ContentKeyProvider interface {
	// Resolve returns a fresh caller-owned key buffer. The protected loader
	// clears that buffer after decryption; providers must not return shared or
	// cached backing storage.
	Resolve(ctx context.Context, manifest scriptpackage.Manifest, entitlement *Entitlement) ([]byte, error)
}

type PublisherKeyProvider interface {
	ResolvePublisherKey(ctx context.Context, manifest scriptpackage.Manifest) (ed25519.PublicKey, error)
}

// UnavailableLicenseVerifier is the production-safe P0 default. It never
// fabricates entitlement merely to make a package execute.
type UnavailableLicenseVerifier struct{}

func (UnavailableLicenseVerifier) Verify(context.Context, scriptpackage.Manifest) (*Entitlement, error) {
	return nil, NewError(CodeLicenseRequired, "no production LicenseVerifier is configured", nil)
}

// UnavailableContentKeyProvider is the production-safe P0 default. No master
// key, DEK, or universal fallback key is embedded in OpenDesk.
type UnavailableContentKeyProvider struct{}

func (UnavailableContentKeyProvider) Resolve(context.Context, scriptpackage.Manifest, *Entitlement) ([]byte, error) {
	return nil, NewError(CodeContentKeyUnavailable, "no production ContentKeyProvider is configured", nil)
}

// UnavailablePublisherKeyProvider fails closed until a trusted public-key
// registry is wired by the host. Publisher private material is never accepted.
type UnavailablePublisherKeyProvider struct{}

func (UnavailablePublisherKeyProvider) ResolvePublisherKey(context.Context, scriptpackage.Manifest) (ed25519.PublicKey, error) {
	return nil, NewError(CodeUnknownPublisher, "publisher key is not trusted by this runtime", nil)
}
