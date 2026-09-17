package flow

import (
	"bytes"
	"crypto/ed25519"

	"opendesk/pkg/scriptpackage"
)

func validateProtectedEntry(manifest Manifest, data []byte, publisherKey ed25519.PublicKey) error {
	inner, err := scriptpackage.Read(data)
	if err != nil {
		return newError(CodeProtectedPackageInvalid, "main.odpkg is not a valid protected package", nil)
	}
	if err := scriptpackage.VerifySignature(inner.RawManifest, inner.Payload, inner.Signature, publisherKey); err != nil {
		return newError(CodeProtectedPackageInvalid, "main.odpkg publisher signature verification failed", nil)
	}
	if inner.Manifest.PublisherID != manifest.PublisherID || inner.Manifest.PublisherKeyID != manifest.PublisherKeyID {
		return newError(CodeProtectedPackageInvalid, "main.odpkg publisher identity does not match flow.json", nil)
	}
	if manifest.Commercial == nil || inner.Manifest.ProductID != manifest.Commercial.ProductID {
		return newError(CodeProtectedPackageInvalid, "main.odpkg productId does not match flow.json", nil)
	}
	if inner.Manifest.MinimumRuntimeVersion != manifest.MinimumRuntimeVersion {
		return newError(CodeProtectedPackageInvalid, "main.odpkg minimumRuntimeVersion does not match flow.json", nil)
	}
	return nil
}

func Verify(pkg *Package, publicKey ed25519.PublicKey) error {
	if pkg == nil {
		return newError(CodeInvalidPackage, "flow package is nil", nil)
	}
	embedded, err := scriptpackage.ParseEd25519PublicKey(pkg.Files[PublisherPublicKeyEntryName])
	if err != nil {
		return newError(CodeInvalidManifest, "trust/publisher.pub is not a valid Ed25519 public key", nil)
	}
	if !bytes.Equal(embedded, publicKey) {
		return newError(CodeInvalidSignature, "verification key does not match trust/publisher.pub", nil)
	}
	return VerifySignature(pkg.RawManifest, pkg.Signature, publicKey)
}
