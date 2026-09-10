package protectedcli

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptloader"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type protectedDeviceStore struct{ value []byte }

func (store *protectedDeviceStore) Load(context.Context, string) ([]byte, error) {
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *protectedDeviceStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

type protectedLicenseRepository struct {
	license *licensing.OfflineLicense
	err     error
}

func (repository protectedLicenseRepository) Load(context.Context, scriptpackage.Manifest) (*licensing.OfflineLicense, error) {
	return repository.license, repository.err
}

type protectedIssuerProvider struct{ key ed25519.PublicKey }

func (provider protectedIssuerProvider) ResolveLicenseIssuerKey(context.Context, licensing.LicenseClaims) (ed25519.PublicKey, error) {
	return provider.key, nil
}

type deviceLicenseFixture struct {
	packagePath   string
	packagePublic ed25519.PublicKey
	contentKey    []byte
	issuerPublic  ed25519.PublicKey
	issuerPrivate ed25519.PrivateKey
	device        *deviceidentity.Manager
	identity      deviceidentity.PublicIdentity
	manifest      scriptpackage.Manifest
	now           time.Time
	validLicense  *licensing.OfflineLicense
}

func newDeviceLicenseFixture(t *testing.T) deviceLicenseFixture {
	t.Helper()
	device := deviceidentity.NewManager(&protectedDeviceStore{})
	identity, err := device.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	contentKey, _ := scriptpackage.GenerateContentKey()
	packagePublic, packagePrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	manifest := scriptpackage.Manifest{
		PackageID:             "package-device-runtime",
		ProductID:             "product-device-runtime",
		PublisherID:           "publisher-device-runtime",
		PublisherKeyID:        "package-key-device-runtime",
		MinimumRuntimeVersion: "0.0.0",
		Encryption:            scriptpackage.EncryptionManifest{KeyID: "content-key-device-runtime"},
		License:               scriptpackage.LicenseManifest{Required: true, ProductID: "product-device-runtime"},
	}
	source := []byte("const OPENDESK_P1_PROTECTED_SOURCE_SENTINEL_7843 = 'memory-only'; if (!Execution.input || Execution.input.authorized !== true) { throw new Error('authorization input missing'); }")
	result, err := scriptpackage.Build(source, manifest, contentKey, packagePrivate)
	if err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(t.TempDir(), "runtime.odpkg")
	if err := os.WriteFile(packagePath, result.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	manifest = result.Manifest
	now := time.Now().UTC().Truncate(time.Second)
	license := buildDeviceLicense(t, manifest, identity, contentKey, issuerPrivate, now.Add(-time.Minute), now.Add(time.Hour))
	return deviceLicenseFixture{
		packagePath: packagePath, packagePublic: packagePublic, contentKey: contentKey,
		issuerPublic: issuerPublic, issuerPrivate: issuerPrivate, device: device,
		identity: identity, manifest: manifest, now: now, validLicense: license,
	}
}

func buildDeviceLicense(t *testing.T, manifest scriptpackage.Manifest, identity deviceidentity.PublicIdentity, contentKey []byte, issuerPrivate ed25519.PrivateKey, issuedAt, expiresAt time.Time) *licensing.OfflineLicense {
	t.Helper()
	publicKey, err := identity.ECDHPublicKey()
	if err != nil {
		t.Fatal(err)
	}
	binding := licensing.EnvelopeBinding{
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		ProductID:          manifest.ProductID,
		PackageID:          manifest.PackageID,
		ContentKeyID:       manifest.Encryption.KeyID,
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
	}
	envelope, err := licensing.WrapContentKey(contentKey, publicKey, binding)
	if err != nil {
		t.Fatal(err)
	}
	claims := licensing.LicenseClaims{
		Format: licensing.OfflineLicenseFormat, FormatVersion: licensing.OfflineLicenseFormatVersion,
		LicenseID: "license-device-runtime", PublisherID: manifest.PublisherID, PublisherKeyID: "issuer-key-device-runtime",
		SubjectID: "subject-device-runtime", DeviceID: identity.DeviceID, DeviceKeyAlgorithm: identity.KeyAlgorithm,
		ProductID: manifest.ProductID, PackageID: manifest.PackageID, ContentKeyID: manifest.Encryption.KeyID,
		IssuedAt: licensing.FormatLicenseTime(issuedAt), ExpiresAt: licensing.FormatLicenseTime(expiresAt), KeyEnvelope: envelope,
	}
	data, err := licensing.BuildOfflineLicense(claims, issuerPrivate)
	if err != nil {
		t.Fatal(err)
	}
	license, err := licensing.ParseOfflineLicense(data)
	if err != nil {
		t.Fatal(err)
	}
	return license
}

func (fixture deviceLicenseFixture) loader(license *licensing.OfflineLicense, repositoryError error, device licensing.DeviceIdentityProvider) scriptloader.ProtectedPackageLoader {
	verifier := licensing.DeviceLicenseVerifier{
		Licenses:   protectedLicenseRepository{license: license, err: repositoryError},
		IssuerKeys: protectedIssuerProvider{key: fixture.issuerPublic},
		Device:     device,
		Now:        func() time.Time { return fixture.now },
	}
	return scriptloader.ProtectedPackageLoader{
		PublisherKeys:   testPublisherProvider{key: fixture.packagePublic},
		LicenseVerifier: verifier,
		ContentKeys:     licensing.DeviceBoundContentKeyProvider{Device: device},
		Now:             func() time.Time { return fixture.now },
	}
}

func TestDeviceBoundLicenseRunsExistingRuntimeWithoutDisclosure(t *testing.T) {
	fixture := newDeviceLicenseFixture(t)
	artifactRoot := t.TempDir()
	result, _, protection, err := RunProtectedFile(context.Background(), fixture.loader(fixture.validLicense, nil, fixture.device), fixture.packagePath, RunOptions{
		LogDir:  artifactRoot,
		WorkDir: filepath.Dir(fixture.packagePath),
		Input:   map[string]any{"authorized": true},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded || protection.LicenseDecision != "authorized" || result.ScriptHash != protection.PackageDigest {
		t.Fatalf("result=%#v protection=%#v", result, protection)
	}
	if result.Artifacts.ScriptSnapshotPath != "" {
		t.Fatalf("protected snapshot path = %q", result.Artifacts.ScriptSnapshotPath)
	}
	marker := "OPENDESK_P1_PROTECTED_SOURCE_SENTINEL_7843"
	if err := filepath.WalkDir(artifactRoot, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return walkErr
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if strings.Contains(string(data), marker) {
			t.Fatalf("protected plaintext marker leaked to %s", path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func TestDeviceBoundLicenseFailuresCauseZeroExecution(t *testing.T) {
	fixture := newDeviceLicenseFixture(t)
	wrongDevice := deviceidentity.NewManager(&protectedDeviceStore{})
	if _, err := wrongDevice.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	expired := buildDeviceLicense(t, fixture.manifest, fixture.identity, fixture.contentKey, fixture.issuerPrivate, fixture.now.Add(-2*time.Hour), fixture.now.Add(-time.Hour))
	tampered := *fixture.validLicense
	tampered.Signature = append([]byte(nil), fixture.validLicense.Signature...)
	tampered.Signature[0] ^= 0x80
	tests := []struct {
		name     string
		loader   scriptloader.Loader
		wantCode string
	}{
		{name: "no license", loader: fixture.loader(nil, licensing.NewError(licensing.CodeLicenseRequired, "missing", nil), fixture.device), wantCode: string(licensing.CodeLicenseRequired)},
		{name: "wrong device", loader: fixture.loader(fixture.validLicense, nil, wrongDevice), wantCode: string(licensing.CodeWrongDevice)},
		{name: "expired", loader: fixture.loader(expired, nil, fixture.device), wantCode: string(licensing.CodeLicenseExpired)},
		{name: "tampered", loader: fixture.loader(&tampered, nil, fixture.device), wantCode: string(licensing.CodeInvalidLicenseSign)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			executions := 0
			_, _, _, err := RunProtectedFile(context.Background(), test.loader, fixture.packagePath, RunOptions{}, func(pkgExecution.Request) (pkgExecution.ExecutionResult, pkgExecution.AgentSummary, error) {
				executions++
				return pkgExecution.ExecutionResult{}, pkgExecution.AgentSummary{}, nil
			})
			if ErrorCodeOf(err) != test.wantCode {
				t.Fatalf("code=%q want=%q err=%v", ErrorCodeOf(err), test.wantCode, err)
			}
			if executions != 0 {
				t.Fatalf("JavaScript execution started %d times", executions)
			}
		})
	}
}
