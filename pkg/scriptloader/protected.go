package scriptloader

import (
	"context"
	"time"
	"unicode/utf8"

	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type ProtectedPackageLoader struct {
	PublisherKeys   licensing.PublisherKeyProvider
	LicenseVerifier licensing.LicenseVerifier
	ContentKeys     licensing.ContentKeyProvider
	Now             func() time.Time
}

func NewProductionProtectedPackageLoader() ProtectedPackageLoader {
	publisherKeys, licenseVerifier, contentKeys := licensing.NewProductionProviders()
	return ProtectedPackageLoader{
		PublisherKeys:   publisherKeys,
		LicenseVerifier: licenseVerifier,
		ContentKeys:     contentKeys,
		Now:             time.Now,
	}
}

func (loader ProtectedPackageLoader) Load(ctx context.Context, filePath string) (*ScriptSource, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	protectedPackage, err := scriptpackage.ReadFile(filePath)
	if err != nil {
		return nil, err
	}
	if loader.PublisherKeys == nil {
		return nil, licensing.NewError(licensing.CodeUnknownPublisher, "publisher key provider is not configured", nil)
	}
	publisherKey, err := loader.PublisherKeys.ResolvePublisherKey(ctx, protectedPackage.Manifest)
	if err != nil {
		return nil, err
	}
	if err := scriptpackage.VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, publisherKey); err != nil {
		return nil, err
	}

	licenseDecision := "not_required"
	var entitlement *licensing.Entitlement
	if protectedPackage.Manifest.License.Required {
		if loader.LicenseVerifier == nil {
			return nil, licensing.NewError(licensing.CodeLicenseRequired, "license verifier is not configured", nil)
		}
		entitlement, err = loader.LicenseVerifier.Verify(ctx, protectedPackage.Manifest)
		if err != nil {
			return nil, err
		}
		if entitlement == nil || entitlement.ProductID != protectedPackage.Manifest.ProductID {
			return nil, licensing.NewError(licensing.CodeLicenseDenied, "license does not authorize this product", nil)
		}
		now := time.Now
		if loader.Now != nil {
			now = loader.Now
		}
		if !entitlement.ExpiresAt.IsZero() && !entitlement.ExpiresAt.After(now()) {
			return nil, licensing.NewError(licensing.CodeLicenseExpired, "license entitlement has expired", nil)
		}
		licenseDecision = "authorized"
	}

	if loader.ContentKeys == nil {
		return nil, licensing.NewError(licensing.CodeContentKeyUnavailable, "content key provider is not configured", nil)
	}
	contentKey, err := loader.ContentKeys.Resolve(ctx, protectedPackage.Manifest, entitlement)
	if err != nil {
		zeroBytes(contentKey)
		return nil, err
	}
	if len(contentKey) != scriptpackage.ContentKeySize {
		zeroBytes(contentKey)
		return nil, licensing.NewError(licensing.CodeContentKeyUnavailable, "content key provider did not return a 32-byte key", nil)
	}
	defer zeroBytes(contentKey)

	nonce, err := protectedPackage.Manifest.DecodeNonce()
	if err != nil {
		return nil, err
	}
	plaintext, err := scriptpackage.Decrypt(protectedPackage.Payload, contentKey, nonce, protectedPackage.RawManifest)
	if err != nil {
		return nil, err
	}
	if len(plaintext) == 0 {
		zeroBytes(plaintext)
		return nil, newError("payload_invalid", "decrypted JavaScript payload is empty", nil)
	}
	if !utf8.Valid(plaintext) {
		zeroBytes(plaintext)
		return nil, newError("payload_invalid", "decrypted JavaScript payload is not valid UTF-8", nil)
	}

	return &ScriptSource{
		Content: plaintext,
		Source:  "package:" + filePath,
		Ext:     ".js",
		Protection: ProtectionInfo{
			Mode:              ProtectionProtected,
			PackageID:         protectedPackage.Manifest.PackageID,
			ProductID:         protectedPackage.Manifest.ProductID,
			PublisherID:       protectedPackage.Manifest.PublisherID,
			PublisherKeyID:    protectedPackage.Manifest.PublisherKeyID,
			ContentKeyID:      protectedPackage.Manifest.Encryption.KeyID,
			PackageDigest:     protectedPackage.PackageDigest,
			SignatureVerified: true,
			LicenseDecision:   licenseDecision,
		},
	}, nil
}

func zeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
