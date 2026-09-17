package flowinstall

import (
	"context"
	"crypto/sha256"
	"encoding/hex"

	"opendesk/pkg/flowpackage"
)

// PackageAuthorizationRequest contains only verified package identity and a
// host-local verified path. It deliberately has no endpoint, token, credential
// or device-secret field: network destination and authentication remain owned
// by the host-configured PackageAuthorizer.
type PackageAuthorizationRequest struct {
	OperationID          string
	InstallID            string
	FlowID               string
	FlowVersion          string
	PublisherID          string
	PublisherKeyID       string
	PublisherFingerprint string
	ProductID            string
	PackageID            string
	ContentKeyID         string
	LicenseIssuerKeyID   string
	VerifiedPackagePath  string
}

// PackageAuthorizer is the upper product-entitlement coordination boundary.
// Implementations may reuse one authenticated product session to acquire many
// package-specific envelopes, but must remain idempotent for OperationID and
// must install each result through the existing exact package license owner.
type PackageAuthorizer interface {
	AuthorizePackage(ctx context.Context, request PackageAuthorizationRequest) error
}

func operationID(archiveDigest string, manifest flowpackage.Manifest) string {
	digest := sha256.Sum256([]byte("OpenDeskFlowAuthorizationOperation/v1\x00" + archiveDigest + "\x00" + manifest.PublisherFingerprint + "\x00" + manifest.FlowID + "\x00" + manifest.Version))
	return "flow-auth-" + hex.EncodeToString(digest[:16])
}
