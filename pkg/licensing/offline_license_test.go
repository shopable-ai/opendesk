package licensing

import (
	"context"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type testSecureStore struct {
	value []byte
}

func (store *testSecureStore) Load(context.Context, string) ([]byte, error) {
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *testSecureStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

func testDevice(t *testing.T) (*deviceidentity.Manager, deviceidentity.PublicIdentity) {
	t.Helper()
	manager := deviceidentity.NewManager(&testSecureStore{})
	identity, err := manager.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return manager, identity
}

func testBinding(identity deviceidentity.PublicIdentity) EnvelopeBinding {
	return EnvelopeBinding{
		FormatVersion:      OfflineLicenseFormatVersion,
		ProductID:          "product-test",
		PackageID:          "package-test",
		ContentKeyID:       "content-test",
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
	}
}

func testClaims(t *testing.T, manager *deviceidentity.Manager, identity deviceidentity.PublicIdentity, contentKey []byte, issuedAt, expiresAt time.Time) LicenseClaims {
	t.Helper()
	publicKey, err := identity.ECDHPublicKey()
	if err != nil {
		t.Fatal(err)
	}
	envelope, err := WrapContentKey(contentKey, publicKey, testBinding(identity))
	if err != nil {
		t.Fatal(err)
	}
	_ = manager
	return LicenseClaims{
		Format:             OfflineLicenseFormat,
		FormatVersion:      OfflineLicenseFormatVersion,
		LicenseID:          "license-test",
		PublisherID:        "publisher-test",
		PublisherKeyID:     "issuer-key-test",
		SubjectID:          "subject-test",
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
		ProductID:          "product-test",
		PackageID:          "package-test",
		ContentKeyID:       "content-test",
		IssuedAt:           FormatLicenseTime(issuedAt),
		ExpiresAt:          FormatLicenseTime(expiresAt),
		KeyEnvelope:        envelope,
	}
}

func TestKeyEnvelopeRoundTripRejectsWrongKeyAndTamper(t *testing.T) {
	manager, identity := testDevice(t)
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	publicKey, _ := identity.ECDHPublicKey()
	binding := testBinding(identity)
	envelope, err := WrapContentKey(contentKey, publicKey, binding)
	if err != nil {
		t.Fatal(err)
	}
	privateKey, err := manager.PrivateKey(context.Background(), identity.DeviceID)
	if err != nil {
		t.Fatal(err)
	}
	unwrapped, err := UnwrapContentKey(envelope, privateKey, binding)
	if err != nil {
		t.Fatal(err)
	}
	if string(unwrapped) != string(contentKey) {
		t.Fatal("unwrapped content key mismatch")
	}

	wrongPrivate, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := UnwrapContentKey(envelope, wrongPrivate, binding); CodeOf(err) != CodeWrongDevice {
		t.Fatalf("wrong-key error = %v", err)
	}

	tampered := envelope
	ciphertext, _ := base64.StdEncoding.DecodeString(tampered.WrappedContentKey)
	ciphertext[0] ^= 0x80
	tampered.WrappedContentKey = base64.StdEncoding.EncodeToString(ciphertext)
	if _, err := UnwrapContentKey(tampered, privateKey, binding); CodeOf(err) != CodeWrongDevice {
		t.Fatalf("tamper error = %v", err)
	}

	metadataTamper := binding
	metadataTamper.ProductID = "product-other"
	if _, err := UnwrapContentKey(envelope, privateKey, metadataTamper); CodeOf(err) != CodeWrongDevice {
		t.Fatalf("metadata tamper error = %v", err)
	}
}

func TestOfflineLicenseSignatureStrictParsingAndTimeValidation(t *testing.T) {
	manager, identity := testDevice(t)
	contentKey, _ := scriptpackage.GenerateContentKey()
	now := time.Now().UTC().Truncate(time.Second)
	claims := testClaims(t, manager, identity, contentKey, now.Add(-time.Minute), now.Add(time.Hour))
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	data, err := BuildOfflineLicense(claims, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseOfflineLicense(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyOfflineLicense(parsed, publicKey); err != nil {
		t.Fatal(err)
	}
	wrongPublic, _, _ := ed25519.GenerateKey(rand.Reader)
	if err := VerifyOfflineLicense(parsed, wrongPublic); CodeOf(err) != CodeInvalidLicenseSign {
		t.Fatalf("wrong issuer error = %v", err)
	}
	for name, mutate := range map[string]func(*LicenseClaims){
		"device":  func(value *LicenseClaims) { value.DeviceID = "device_" + strings.Repeat("0", 64) },
		"product": func(value *LicenseClaims) { value.ProductID = "product-other" },
		"package": func(value *LicenseClaims) { value.PackageID = "package-other" },
		"wrapped DEK": func(value *LicenseClaims) {
			wrapped, _ := base64.StdEncoding.DecodeString(value.KeyEnvelope.WrappedContentKey)
			wrapped[0] ^= 1
			value.KeyEnvelope.WrappedContentKey = base64.StdEncoding.EncodeToString(wrapped)
		},
	} {
		t.Run("signed binding tamper "+name, func(t *testing.T) {
			tamperedClaims := claims
			mutate(&tamperedClaims)
			rawClaims, err := json.Marshal(tamperedClaims)
			if err != nil {
				t.Fatal(err)
			}
			tamperedData, err := json.Marshal(offlineLicenseJSON{
				License: rawClaims, Signature: base64.StdEncoding.EncodeToString(parsed.Signature),
			})
			if err != nil {
				t.Fatal(err)
			}
			tamperedLicense, err := ParseOfflineLicense(tamperedData)
			if err != nil {
				t.Fatal(err)
			}
			if err := VerifyOfflineLicense(tamperedLicense, publicKey); CodeOf(err) != CodeInvalidLicenseSign {
				t.Fatalf("tamper error = %v", err)
			}
		})
	}

	duplicate := strings.Replace(string(data), `"licenseId":"license-test"`, `"licenseId":"license-test","licenseId":"other"`, 1)
	if _, err := ParseOfflineLicense([]byte(duplicate)); CodeOf(err) != CodeInvalidLicense {
		t.Fatalf("duplicate error = %v", err)
	}
	unsupported := strings.Replace(string(data), `"formatVersion":1`, `"formatVersion":2`, 1)
	if _, err := ParseOfflineLicense([]byte(unsupported)); CodeOf(err) != CodeInvalidLicense {
		t.Fatalf("version error = %v", err)
	}
	malformed := strings.Replace(string(data), claims.KeyEnvelope.EphemeralPublicKey, "not-a-public-key", 1)
	if _, err := ParseOfflineLicense([]byte(malformed)); CodeOf(err) != CodeInvalidLicense {
		t.Fatalf("malformed key error = %v", err)
	}
	invalidPoint := claims
	invalidPoint.KeyEnvelope.EphemeralPublicKey = base64.StdEncoding.EncodeToString(make([]byte, 65))
	if err := invalidPoint.Validate(); CodeOf(err) != CodeInvalidLicense {
		t.Fatalf("invalid P-256 point error = %v", err)
	}
}

type memoryLicenseRepository struct {
	license *OfflineLicense
	err     error
}

func (repository memoryLicenseRepository) Load(context.Context, scriptpackage.Manifest) (*OfflineLicense, error) {
	return repository.license, repository.err
}

type memoryIssuerKeys struct {
	key ed25519.PublicKey
}

func (keys memoryIssuerKeys) ResolveLicenseIssuerKey(context.Context, LicenseClaims) (ed25519.PublicKey, error) {
	return keys.key, nil
}

func TestDeviceProvidersAuthorizeAndRejectBoundaries(t *testing.T) {
	manager, identity := testDevice(t)
	contentKey, _ := scriptpackage.GenerateContentKey()
	now := time.Now().UTC().Truncate(time.Second)
	claims := testClaims(t, manager, identity, contentKey, now.Add(-time.Minute), now.Add(time.Hour))
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	data, err := BuildOfflineLicense(claims, issuerPrivate)
	if err != nil {
		t.Fatal(err)
	}
	license, err := ParseOfflineLicense(data)
	if err != nil {
		t.Fatal(err)
	}
	manifest := scriptpackage.Manifest{
		PackageID:   claims.PackageID,
		ProductID:   claims.ProductID,
		PublisherID: claims.PublisherID,
		Encryption:  scriptpackage.EncryptionManifest{KeyID: claims.ContentKeyID},
	}
	verifier := DeviceLicenseVerifier{
		Licenses:   memoryLicenseRepository{license: license},
		IssuerKeys: memoryIssuerKeys{key: issuerPublic},
		Device:     manager,
		Now:        func() time.Time { return now },
	}
	entitlement, err := verifier.Verify(context.Background(), manifest)
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := (DeviceBoundContentKeyProvider{Device: manager}).Resolve(context.Background(), manifest, entitlement)
	if err != nil {
		t.Fatal(err)
	}
	if string(resolved) != string(contentKey) {
		t.Fatal("resolved content key mismatch")
	}
	forged := *entitlement
	forged.verifiedClaims = nil
	if _, err := (DeviceBoundContentKeyProvider{Device: manager}).Resolve(context.Background(), manifest, &forged); CodeOf(err) != CodeLicenseDenied {
		t.Fatalf("unverified entitlement error = %v", err)
	}

	wrongDevice, _ := testDevice(t)
	wrongVerifier := verifier
	wrongVerifier.Device = wrongDevice
	if _, err := wrongVerifier.Verify(context.Background(), manifest); CodeOf(err) != CodeWrongDevice {
		t.Fatalf("wrong device error = %v", err)
	}
	expiredClaims := claims
	expiredClaims.IssuedAt = FormatLicenseTime(now.Add(-2 * time.Hour))
	expiredClaims.ExpiresAt = FormatLicenseTime(now.Add(-time.Hour))
	expiredData, _ := BuildOfflineLicense(expiredClaims, issuerPrivate)
	expiredLicense, _ := ParseOfflineLicense(expiredData)
	expiredVerifier := verifier
	expiredVerifier.Licenses = memoryLicenseRepository{license: expiredLicense}
	if _, err := expiredVerifier.Verify(context.Background(), manifest); CodeOf(err) != CodeLicenseExpired {
		t.Fatalf("expired error = %v", err)
	}
	futureClaims := claims
	futureClaims.IssuedAt = FormatLicenseTime(now.Add(time.Hour))
	futureClaims.ExpiresAt = FormatLicenseTime(now.Add(2 * time.Hour))
	futureData, _ := BuildOfflineLicense(futureClaims, issuerPrivate)
	futureLicense, _ := ParseOfflineLicense(futureData)
	futureVerifier := verifier
	futureVerifier.Licenses = memoryLicenseRepository{license: futureLicense}
	if _, err := futureVerifier.Verify(context.Background(), manifest); CodeOf(err) != CodeLicenseNotYetValid {
		t.Fatalf("not-yet-valid error = %v", err)
	}
	noLicenseVerifier := verifier
	noLicenseVerifier.Licenses = memoryLicenseRepository{err: NewError(CodeLicenseRequired, "missing", nil)}
	if _, err := noLicenseVerifier.Verify(context.Background(), manifest); CodeOf(err) != CodeLicenseRequired {
		t.Fatalf("missing error = %v", err)
	}
}

func TestFileInstallationStorePinsKeysAndDiscoversLicense(t *testing.T) {
	manager, identity := testDevice(t)
	contentKey, _ := scriptpackage.GenerateContentKey()
	now := time.Now().UTC().Truncate(time.Second)
	claims := testClaims(t, manager, identity, contentKey, now.Add(-time.Minute), now.Add(time.Hour))
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	licenseData, _ := BuildOfflineLicense(claims, issuerPrivate)
	packagePublic, _, _ := ed25519.GenerateKey(rand.Reader)
	manifest := scriptpackage.Manifest{
		Format:                scriptpackage.FormatName,
		FormatVersion:         scriptpackage.FormatVersion,
		PackageID:             claims.PackageID,
		ProductID:             claims.ProductID,
		PublisherID:           claims.PublisherID,
		PublisherKeyID:        "package-key-test",
		Entrypoint:            scriptpackage.EntrypointMainJS,
		PayloadType:           scriptpackage.PayloadJavaScript,
		MinimumRuntimeVersion: "0.0.0",
		Encryption: scriptpackage.EncryptionManifest{
			Algorithm: scriptpackage.EncryptionAES256GCM,
			KeyID:     claims.ContentKeyID,
			Nonce:     base64.StdEncoding.EncodeToString(make([]byte, scriptpackage.NonceSize)),
		},
		License: scriptpackage.LicenseManifest{Required: true, ProductID: claims.ProductID},
	}
	store := FileInstallationStore{Root: t.TempDir()}
	if err := store.Install(manifest, licenseData, packagePublic, issuerPublic); err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load(context.Background(), manifest)
	if err != nil || loaded.Claims.LicenseID != claims.LicenseID {
		t.Fatalf("loaded=%#v err=%v", loaded, err)
	}
	if _, err := store.ResolvePublisherKey(context.Background(), manifest); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ResolveLicenseIssuerKey(context.Background(), claims); err != nil {
		t.Fatal(err)
	}
	wrongPackagePublic, _, _ := ed25519.GenerateKey(rand.Reader)
	if err := store.Install(manifest, licenseData, wrongPackagePublic, issuerPublic); CodeOf(err) != CodeLicenseDenied {
		t.Fatalf("conflicting pin error = %v", err)
	}
	info, err := os.Stat(store.licensePath(manifest))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("license mode = %o", info.Mode().Perm())
	}
}

func TestLicenseTamperFailsBeforeDeviceAccess(t *testing.T) {
	manager, identity := testDevice(t)
	contentKey, _ := scriptpackage.GenerateContentKey()
	now := time.Now().UTC().Truncate(time.Second)
	claims := testClaims(t, manager, identity, contentKey, now.Add(-time.Minute), now.Add(time.Hour))
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	data, _ := BuildOfflineLicense(claims, issuerPrivate)
	var outer map[string]json.RawMessage
	if err := json.Unmarshal(data, &outer); err != nil {
		t.Fatal(err)
	}
	var rawClaims map[string]any
	if err := json.Unmarshal(outer["license"], &rawClaims); err != nil {
		t.Fatal(err)
	}
	rawClaims["productId"] = "product-tampered"
	outer["license"], _ = json.Marshal(rawClaims)
	tampered, _ := json.Marshal(outer)
	parsed, err := ParseOfflineLicense(tampered)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyOfflineLicense(parsed, issuerPublic); CodeOf(err) != CodeInvalidLicenseSign {
		t.Fatalf("tamper error = %v", err)
	}
}

func TestReadOfflineLicenseMissingIsLicenseRequired(t *testing.T) {
	_, err := ReadOfflineLicense(filepath.Join(t.TempDir(), "missing.odlicense"))
	if !errors.Is(err, os.ErrNotExist) || CodeOf(err) != CodeLicenseRequired {
		t.Fatalf("error = %v", err)
	}
}

func TestDefaultInstallationRootRequiresAbsoluteOverride(t *testing.T) {
	t.Setenv(InstallationRootEnvironment, "relative/license-root")
	if _, err := DefaultInstallationRoot(); err == nil {
		t.Fatal("relative installation root override was accepted")
	}
	absolute := filepath.Join(t.TempDir(), "licenses")
	t.Setenv(InstallationRootEnvironment, absolute)
	root, err := DefaultInstallationRoot()
	if err != nil {
		t.Fatal(err)
	}
	if root != absolute {
		t.Fatalf("root = %q, want %q", root, absolute)
	}
}
