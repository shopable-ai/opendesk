package flowinstall

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/flowpackage"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptloader"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type testDeviceStore struct{ value []byte }

func (store *testDeviceStore) Load(context.Context, string) ([]byte, error) {
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *testDeviceStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

func TestProtectedFlowsUseExactExistingEntitlementsAndInstallDoesNotExecute(t *testing.T) {
	appDataRoot := t.TempDir()
	service, err := NewService(RootsFromAppData(appDataRoot))
	if err != nil {
		t.Fatal(err)
	}
	cleanupInstalledTestFlows(t, service)
	device := deviceidentity.NewManager(&testDeviceStore{})
	identity, err := device.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	licenseStore := licensing.FileInstallationStore{Root: t.TempDir()}
	issuerPublic, issuerPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	service.ProtectedLoad = scriptloader.ProtectedPackageLoader{
		PublisherKeys: licenseStore,
		LicenseVerifier: licensing.DeviceLicenseVerifier{
			Licenses: licenseStore, IssuerKeys: licenseStore, Device: device,
			Now: func() time.Time { return now },
		},
		ContentKeys: licensing.DeviceBoundContentKeyProvider{Device: device},
		Now:         func() time.Time { return now },
	}
	publisherA := newFlowFixture(t, "publisher-a", "package-signing-a")
	publisherB := newFlowFixture(t, "publisher-b", "package-signing-b")
	if err := service.Trust.Approve(trustManifest(publisherA, "flow-a"), TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	if err := service.Trust.Approve(trustManifest(publisherB, "flow-c"), TrustScopePublisher, TrustTest); err != nil {
		t.Fatal(err)
	}
	canary := "OPEN_DESK_PROTECTED_PLAINTEXT_CANARY_FLOW_INSTALL_7E4218"
	marker := filepath.Join(t.TempDir(), "business-marker")
	secretA := []byte("PACKAGE_A_CONTENT_KEY_1234567890")
	secretB := []byte("PACKAGE_B_CONTENT_KEY_1234567890")
	secretC := []byte("PACKAGE_C_CONTENT_KEY_1234567890")
	if len(secretA) != scriptpackage.ContentKeySize || len(secretB) != scriptpackage.ContentKeySize || len(secretC) != scriptpackage.ContentKeySize {
		t.Fatal("test content keys must be exactly 32 bytes")
	}
	packages := []struct {
		publisher    flowFixture
		flowID       string
		packageID    string
		contentKeyID string
		contentKey   []byte
	}{
		{publisher: publisherA, flowID: "flow-a", packageID: "package-a", contentKeyID: "content-a", contentKey: secretA},
		{publisher: publisherA, flowID: "flow-b", packageID: "package-b", contentKeyID: "content-b", contentKey: secretB},
		// Deliberately reuse product/package/content identifiers under a second
		// publisher. Exact publisher identity must keep the materials separate.
		{publisher: publisherB, flowID: "flow-c", packageID: "package-a", contentKeyID: "content-a", contentKey: secretC},
	}
	for _, item := range packages {
		packagePath := buildLicensedProtectedFlow(t, protectedFlowOptions{
			publisher: item.publisher, licenseStore: licenseStore, deviceIdentity: identity,
			issuerPublic: issuerPublic, issuerPrivate: issuerPrivate, now: now,
			flowID: item.flowID, packageID: item.packageID, productID: "product-suite",
			contentKeyID: item.contentKeyID, contentKey: item.contentKey, installLicense: true,
			source: []byte(fmt.Sprintf("const canary=%q; require('fs').writeFileSync(%s, canary);", canary, quoteJS(marker))),
		})
		result, err := service.Install(context.Background(), packagePath, InstallOptions{})
		if err != nil {
			t.Fatalf("install %s: %v", item.flowID, err)
		}
		if result.Record.State != StateReady {
			t.Fatalf("%s state = %s", item.flowID, result.Record.State)
		}
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("protected install executed JavaScript; marker stat error = %v", err)
	}
	assertTreeExcludes(t, appDataRoot, [][]byte{[]byte(canary), secretA, secretB, secretC, issuerPrivate, publisherA.privateKey, publisherB.privateKey})

	// Package C belongs to the already-authorized product but has no package
	// license or content-key envelope. Product identity alone must not grant it.
	missingPath := buildLicensedProtectedFlow(t, protectedFlowOptions{
		publisher: publisherA, licenseStore: licenseStore, deviceIdentity: identity,
		issuerPublic: issuerPublic, issuerPrivate: issuerPrivate, now: now,
		flowID: "flow-missing", packageID: "package-missing", productID: "product-suite",
		contentKeyID: "content-missing", contentKey: bytes.Repeat([]byte{0x6d}, scriptpackage.ContentKeySize),
		installLicense: false, source: []byte("throw new Error('must never execute')"),
	})
	if _, err := service.Install(context.Background(), missingPath, InstallOptions{}); CodeOf(err) != CodeActivationRequired {
		t.Fatalf("missing package entitlement code = %q, error = %v", CodeOf(err), err)
	}
	pending, err := service.Install(context.Background(), missingPath, InstallOptions{AllowNeedsActivation: true})
	if err != nil {
		t.Fatal(err)
	}
	if pending.Record.State != StateNeedsActivation || pending.Record.StateReason != string(licensing.CodeLicenseRequired) {
		t.Fatalf("pending record = %#v", pending.Record)
	}

	// The host-configured coordinator reuses one authenticated product session
	// while installing a distinct signed envelope for every package.
	autoKeys := map[string][]byte{
		"package-d": bytes.Repeat([]byte{0x44}, scriptpackage.ContentKeySize),
		"package-e": bytes.Repeat([]byte{0x45}, scriptpackage.ContentKeySize),
	}
	authorizer := &testProductAuthorizer{
		store: licenseStore, identity: identity, issuerPublic: issuerPublic, issuerPrivate: issuerPrivate,
		now: now, contentKeys: autoKeys, publisherKeys: map[string]ed25519.PublicKey{publisherA.publisher: publisherA.publicKey},
		operations: map[string]struct{}{},
	}
	service.Authorizer = authorizer
	for _, packageID := range []string{"package-d", "package-e"} {
		path := buildLicensedProtectedFlow(t, protectedFlowOptions{
			publisher: publisherA, licenseStore: licenseStore, deviceIdentity: identity,
			issuerPublic: issuerPublic, issuerPrivate: issuerPrivate, now: now,
			flowID: "flow-" + packageID, packageID: packageID, productID: "product-suite",
			contentKeyID: "content-" + packageID, contentKey: autoKeys[packageID],
			installLicense: false, source: []byte("globalThis.authorizedPackage = true"),
		})
		result, err := service.Install(context.Background(), path, InstallOptions{AuthorizePackage: true})
		if err != nil || result.Record.State != StateReady {
			t.Fatalf("automatic product authorization for %s = %#v, error = %v", packageID, result, err)
		}
	}
	if authorizer.loginCount != 1 || authorizer.authorizationCount != 2 {
		t.Fatalf("product authorization loginCount=%d authorizationCount=%d", authorizer.loginCount, authorizer.authorizationCount)
	}
}

type testProductAuthorizer struct {
	store              licensing.FileInstallationStore
	identity           deviceidentity.PublicIdentity
	issuerPublic       ed25519.PublicKey
	issuerPrivate      ed25519.PrivateKey
	now                time.Time
	contentKeys        map[string][]byte
	publisherKeys      map[string]ed25519.PublicKey
	operations         map[string]struct{}
	loginCount         int
	authorizationCount int
}

func (authorizer *testProductAuthorizer) AuthorizePackage(_ context.Context, request PackageAuthorizationRequest) error {
	if authorizer.loginCount == 0 {
		authorizer.loginCount++
	}
	if _, exists := authorizer.operations[request.OperationID]; exists {
		return nil
	}
	protected, err := scriptpackage.ReadFile(request.VerifiedPackagePath)
	if err != nil {
		return err
	}
	manifest := protected.Manifest
	if request.PublisherID != manifest.PublisherID || request.PublisherKeyID != manifest.PublisherKeyID ||
		request.ProductID != manifest.ProductID || request.PackageID != manifest.PackageID || request.ContentKeyID != manifest.Encryption.KeyID {
		return fmt.Errorf("authorization request identity does not match verified package")
	}
	contentKey := authorizer.contentKeys[request.PackageID]
	if len(contentKey) != scriptpackage.ContentKeySize {
		return licensing.NewError(licensing.CodeLicenseDenied, "product grant excludes package", nil)
	}
	devicePublic, err := authorizer.identity.ECDHPublicKey()
	if err != nil {
		return err
	}
	envelope, err := licensing.WrapContentKey(contentKey, devicePublic, licensing.EnvelopeBinding{
		FormatVersion: licensing.OfflineLicenseFormatVersion,
		ProductID:     manifest.ProductID, PackageID: manifest.PackageID, ContentKeyID: manifest.Encryption.KeyID,
		DeviceID: authorizer.identity.DeviceID, DeviceKeyAlgorithm: authorizer.identity.KeyAlgorithm,
	})
	if err != nil {
		return err
	}
	claims := licensing.LicenseClaims{
		Format: licensing.OfflineLicenseFormat, FormatVersion: licensing.OfflineLicenseFormatVersion,
		LicenseID:   "auto-license-" + manifest.PackageID,
		PublisherID: manifest.PublisherID, PublisherKeyID: "license-issuer-test", SubjectID: "subject-test",
		DeviceID: authorizer.identity.DeviceID, DeviceKeyAlgorithm: authorizer.identity.KeyAlgorithm,
		ProductID: manifest.ProductID, PackageID: manifest.PackageID, ContentKeyID: manifest.Encryption.KeyID,
		IssuedAt:  licensing.FormatLicenseTime(authorizer.now.Add(-time.Minute)),
		ExpiresAt: licensing.FormatLicenseTime(authorizer.now.Add(time.Hour)), KeyEnvelope: envelope,
	}
	licenseData, err := licensing.BuildOfflineLicense(claims, authorizer.issuerPrivate)
	if err != nil {
		return err
	}
	if err := authorizer.store.Install(manifest, licenseData, authorizer.publisherKeys[manifest.PublisherID], authorizer.issuerPublic); err != nil {
		return err
	}
	authorizer.operations[request.OperationID] = struct{}{}
	authorizer.authorizationCount++
	return nil
}

type fixedProtectedFailure struct{ err error }

func (loader fixedProtectedFailure) Load(context.Context, string) (*scriptloader.ScriptSource, error) {
	return nil, loader.err
}

func TestProtectedAuthorizationFailuresNeverCommitReady(t *testing.T) {
	fixture := newFlowFixture(t, "publisher-a", "key-a")
	packagePath := buildUnlicensedProtectedFlow(t, fixture, "rejected-flow", []byte("must-not-run"))
	for _, code := range []licensing.ErrorCode{
		licensing.CodeLicenseExpired,
		licensing.CodeLicenseNotYetValid,
		licensing.CodeLicenseRevoked,
		licensing.CodeWrongDevice,
		licensing.CodeLicenseDenied,
		licensing.CodeOnlineReplay,
	} {
		t.Run(string(code), func(t *testing.T) {
			service := newTestService(t)
			service.ProtectedLoad = fixedProtectedFailure{err: licensing.NewError(code, "test rejection", nil)}
			if err := service.Trust.Approve(trustManifest(fixture, "rejected-flow"), TrustScopePublisher, TrustTest); err != nil {
				t.Fatal(err)
			}
			if _, err := service.Install(context.Background(), packagePath, InstallOptions{AllowNeedsActivation: true}); CodeOf(err) != CodeAuthorizationDenied {
				t.Fatalf("Install() code = %q, error = %v", CodeOf(err), err)
			}
			records, err := service.Catalog.List()
			if err != nil || len(records) != 0 {
				t.Fatalf("rejected Flow records = %#v, error = %v", records, err)
			}
		})
	}
}

type protectedFlowOptions struct {
	publisher      flowFixture
	licenseStore   licensing.FileInstallationStore
	deviceIdentity deviceidentity.PublicIdentity
	issuerPublic   ed25519.PublicKey
	issuerPrivate  ed25519.PrivateKey
	now            time.Time
	flowID         string
	packageID      string
	productID      string
	contentKeyID   string
	contentKey     []byte
	installLicense bool
	source         []byte
}

func buildLicensedProtectedFlow(t *testing.T, options protectedFlowOptions) string {
	t.Helper()
	protected, err := scriptpackage.Build(options.source, scriptpackage.Manifest{
		PackageID: options.packageID, ProductID: options.productID,
		PublisherID: options.publisher.publisher, PublisherKeyID: options.publisher.keyID,
		MinimumRuntimeVersion: "0.0.0", Encryption: scriptpackage.EncryptionManifest{KeyID: options.contentKeyID},
		License: scriptpackage.LicenseManifest{Required: true, ProductID: options.productID},
	}, options.contentKey, options.publisher.privateKey)
	if err != nil {
		t.Fatal(err)
	}
	if options.installLicense {
		devicePublic, err := options.deviceIdentity.ECDHPublicKey()
		if err != nil {
			t.Fatal(err)
		}
		binding := licensing.EnvelopeBinding{
			FormatVersion: licensing.OfflineLicenseFormatVersion,
			ProductID:     options.productID, PackageID: options.packageID, ContentKeyID: options.contentKeyID,
			DeviceID: options.deviceIdentity.DeviceID, DeviceKeyAlgorithm: options.deviceIdentity.KeyAlgorithm,
		}
		envelope, err := licensing.WrapContentKey(options.contentKey, devicePublic, binding)
		if err != nil {
			t.Fatal(err)
		}
		claims := licensing.LicenseClaims{
			Format: licensing.OfflineLicenseFormat, FormatVersion: licensing.OfflineLicenseFormatVersion,
			LicenseID:   "license-" + options.publisher.publisher + "-" + options.packageID,
			PublisherID: options.publisher.publisher, PublisherKeyID: "license-issuer-test",
			SubjectID: "subject-test", DeviceID: options.deviceIdentity.DeviceID,
			DeviceKeyAlgorithm: options.deviceIdentity.KeyAlgorithm,
			ProductID:          options.productID, PackageID: options.packageID, ContentKeyID: options.contentKeyID,
			IssuedAt:  licensing.FormatLicenseTime(options.now.Add(-time.Minute)),
			ExpiresAt: licensing.FormatLicenseTime(options.now.Add(time.Hour)), KeyEnvelope: envelope,
		}
		licenseData, err := licensing.BuildOfflineLicense(claims, options.issuerPrivate)
		if err != nil {
			t.Fatal(err)
		}
		if err := options.licenseStore.Install(protected.Manifest, licenseData, options.publisher.publicKey, options.issuerPublic); err != nil {
			t.Fatal(err)
		}
	}
	sourceRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(sourceRoot, "payload"), 0o700); err != nil {
		t.Fatal(err)
	}
	entry := "payload/main.odpkg"
	if err := os.WriteFile(filepath.Join(sourceRoot, filepath.FromSlash(entry)), protected.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	flow, err := flowpackage.Build(flowpackage.BuildOptions{
		SourceRoot: sourceRoot, FlowID: options.flowID, Name: "Protected " + options.flowID, Version: "1.0.0",
		PublisherID: options.publisher.publisher, PublisherKeyID: options.publisher.keyID, Entry: entry,
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS},
		Files: []string{entry},
		PublisherPublicKey: options.publisher.publicKey, PublisherPrivateKey: options.publisher.privateKey,
		LicenseIssuerKeyID: "license-issuer-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(t.TempDir(), options.flowID+".odflow")
	if err := flowpackage.WriteFileExclusive(packagePath, flow); err != nil {
		t.Fatal(err)
	}
	return packagePath
}

func buildUnlicensedProtectedFlow(t *testing.T, publisher flowFixture, flowID string, source []byte) string {
	t.Helper()
	device := deviceidentity.NewManager(&testDeviceStore{})
	identity, err := device.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	return buildLicensedProtectedFlow(t, protectedFlowOptions{
		publisher: publisher, licenseStore: licensing.FileInstallationStore{Root: t.TempDir()}, deviceIdentity: identity,
		issuerPublic: issuerPublic, issuerPrivate: issuerPrivate, now: time.Now().UTC().Truncate(time.Second),
		flowID: flowID, packageID: "package-rejected", productID: "product-rejected",
		contentKeyID: "content-rejected", contentKey: bytes.Repeat([]byte{0x33}, scriptpackage.ContentKeySize),
		installLicense: false, source: source,
	})
}

func assertTreeExcludes(t *testing.T, root string, forbidden [][]byte) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, value := range forbidden {
			if len(value) > 0 && bytes.Contains(data, value) {
				return fmt.Errorf("forbidden secret %q found in %s", boundedSecretLabel(value), path)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func boundedSecretLabel(value []byte) string {
	text := string(value)
	if len(text) > 24 {
		text = text[:24]
	}
	return strings.Map(func(character rune) rune {
		if character < 0x20 || character > 0x7e {
			return '?'
		}
		return character
	}, text)
}
