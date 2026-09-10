package scriptloader

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"os"
	"path/filepath"
	"testing"
	"time"

	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type fakePublisherKeys struct {
	key   ed25519.PublicKey
	calls int
	err   error
}

func (provider *fakePublisherKeys) ResolvePublisherKey(context.Context, scriptpackage.Manifest) (ed25519.PublicKey, error) {
	provider.calls++
	if provider.err != nil {
		return nil, provider.err
	}
	return provider.key, nil
}

type fakeLicenseVerifier struct {
	entitlement *licensing.Entitlement
	calls       int
	err         error
}

func (verifier *fakeLicenseVerifier) Verify(context.Context, scriptpackage.Manifest) (*licensing.Entitlement, error) {
	verifier.calls++
	if verifier.err != nil {
		return nil, verifier.err
	}
	return verifier.entitlement, nil
}

type fakeContentKeys struct {
	key   []byte
	calls int
	err   error
}

func (provider *fakeContentKeys) Resolve(context.Context, scriptpackage.Manifest, *licensing.Entitlement) ([]byte, error) {
	provider.calls++
	if provider.err != nil {
		return nil, provider.err
	}
	return provider.key, nil
}

func writeProtectedFixture(t *testing.T, source []byte) (string, []byte, ed25519.PublicKey) {
	t.Helper()
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	manifest := scriptpackage.Manifest{
		PackageID: "pkg-loader",
		ProductID: "product-loader",
		PublisherID: "publisher-loader",
		PublisherKeyID: "publisher-key-loader",
		MinimumRuntimeVersion: "0.0.0",
		Encryption: scriptpackage.EncryptionManifest{KeyID: "content-key-loader"},
		License: scriptpackage.LicenseManifest{Required: true, ProductID: "product-loader"},
	}
	result, err := scriptpackage.Build(source, manifest, contentKey, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	filePath := filepath.Join(t.TempDir(), "recipe.odpkg")
	if err := os.WriteFile(filePath, result.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return filePath, contentKey, publicKey
}

func TestPlainScriptLoaderStillReadsJavaScript(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "recipe.js")
	want := []byte("globalThis.__plainLoader = true;")
	if err := os.WriteFile(filePath, want, 0o600); err != nil {
		t.Fatal(err)
	}
	source, err := (PlainScriptLoader{}).Load(context.Background(), filePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(source.Content) != string(want) || source.Ext != ".js" || source.Protection.Mode != ProtectionPlain {
		t.Fatalf("unexpected plain source: %#v", source)
	}
}

func TestProtectedPackageLoaderVerifiesAuthorizesAndDecrypts(t *testing.T) {
	want := []byte("globalThis.__protectedLoader = true;")
	filePath, contentKey, publicKey := writeProtectedFixture(t, want)
	publisherKeys := &fakePublisherKeys{key: publicKey}
	licenseVerifier := &fakeLicenseVerifier{entitlement: &licensing.Entitlement{LicenseID: "license-a", ProductID: "product-loader", SubjectID: "subject-a", ExpiresAt: time.Now().Add(time.Hour)}}
	contentKeys := &fakeContentKeys{key: contentKey}
	loader := ProtectedPackageLoader{PublisherKeys: publisherKeys, LicenseVerifier: licenseVerifier, ContentKeys: contentKeys, Now: time.Now}
	source, err := loader.Load(context.Background(), filePath)
	if err != nil {
		t.Fatal(err)
	}
	if string(source.Content) != string(want) {
		t.Fatalf("decrypted content mismatch: %q", source.Content)
	}
	if source.Protection.Mode != ProtectionProtected || !source.Protection.SignatureVerified || source.Protection.LicenseDecision != "authorized" || source.Protection.PackageDigest == "" {
		t.Fatalf("unexpected protection metadata: %#v", source.Protection)
	}
	if publisherKeys.calls != 1 || licenseVerifier.calls != 1 || contentKeys.calls != 1 {
		t.Fatalf("provider calls publisher=%d license=%d key=%d", publisherKeys.calls, licenseVerifier.calls, contentKeys.calls)
	}
}

func TestProtectedPackageLoaderLicenseDeniedStopsBeforeKey(t *testing.T) {
	filePath, contentKey, publicKey := writeProtectedFixture(t, []byte("globalThis.__mustNotRun = true;"))
	licenseVerifier := &fakeLicenseVerifier{err: licensing.NewError(licensing.CodeLicenseDenied, "denied by test verifier", nil)}
	contentKeys := &fakeContentKeys{key: contentKey}
	loader := ProtectedPackageLoader{PublisherKeys: &fakePublisherKeys{key: publicKey}, LicenseVerifier: licenseVerifier, ContentKeys: contentKeys}
	if _, err := loader.Load(context.Background(), filePath); ErrorCodeOf(err) != string(licensing.CodeLicenseDenied) {
		t.Fatalf("license error code = %q, err=%v", ErrorCodeOf(err), err)
	}
	if contentKeys.calls != 0 {
		t.Fatalf("content key provider called after license denial: %d", contentKeys.calls)
	}
}

func TestProtectedPackageLoaderContentKeyUnavailable(t *testing.T) {
	filePath, _, publicKey := writeProtectedFixture(t, []byte("void 1;"))
	loader := ProtectedPackageLoader{
		PublisherKeys: &fakePublisherKeys{key: publicKey},
		LicenseVerifier: &fakeLicenseVerifier{entitlement: &licensing.Entitlement{ProductID: "product-loader"}},
		ContentKeys: &fakeContentKeys{err: licensing.NewError(licensing.CodeContentKeyUnavailable, "test key unavailable", nil)},
	}
	if _, err := loader.Load(context.Background(), filePath); ErrorCodeOf(err) != string(licensing.CodeContentKeyUnavailable) {
		t.Fatalf("content key error code = %q, err=%v", ErrorCodeOf(err), err)
	}
}

func TestProtectedPackageLoaderInvalidSignatureStopsBeforeLicense(t *testing.T) {
	filePath, contentKey, _ := writeProtectedFixture(t, []byte("void 2;"))
	wrongPublicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	licenseVerifier := &fakeLicenseVerifier{entitlement: &licensing.Entitlement{ProductID: "product-loader"}}
	contentKeys := &fakeContentKeys{key: contentKey}
	loader := ProtectedPackageLoader{PublisherKeys: &fakePublisherKeys{key: wrongPublicKey}, LicenseVerifier: licenseVerifier, ContentKeys: contentKeys}
	if _, err := loader.Load(context.Background(), filePath); ErrorCodeOf(err) != string(scriptpackage.CodeInvalidSignature) {
		t.Fatalf("signature error code = %q, err=%v", ErrorCodeOf(err), err)
	}
	if licenseVerifier.calls != 0 || contentKeys.calls != 0 {
		t.Fatalf("authorization continued after invalid signature: license=%d key=%d", licenseVerifier.calls, contentKeys.calls)
	}
}

func TestProductionProtectedLoaderFailsClosed(t *testing.T) {
	filePath, _, _ := writeProtectedFixture(t, []byte("void 3;"))
	loader := NewProductionProtectedPackageLoader()
	if _, err := loader.Load(context.Background(), filePath); ErrorCodeOf(err) != string(licensing.CodeUnknownPublisher) {
		t.Fatalf("production error code = %q, err=%v", ErrorCodeOf(err), err)
	}
}
