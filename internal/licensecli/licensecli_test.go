package licensecli

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type commandTestStore struct {
	value []byte
}

func (store *commandTestStore) Load(context.Context, string) ([]byte, error) {
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *commandTestStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

type cliFixture struct {
	root            string
	packagePath     string
	devicePath      string
	contentKeyPath  string
	packagePublic   string
	issuerPrivate   string
	issuerPublic    string
	licensePath     string
	manager         *deviceidentity.Manager
	now             time.Time
	packageManifest scriptpackage.Manifest
}

func newCLIFixture(t *testing.T) cliFixture {
	t.Helper()
	directory := t.TempDir()
	manager := deviceidentity.NewManager(&commandTestStore{})
	identity, err := manager.Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	deviceData, _ := json.Marshal(identity)
	devicePath := filepath.Join(directory, "device.json")
	if err := os.WriteFile(devicePath, deviceData, 0o600); err != nil {
		t.Fatal(err)
	}
	packagePublic, packagePrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	contentKey := bytes.Repeat([]byte{0x42}, scriptpackage.ContentKeySize)
	manifest := scriptpackage.Manifest{
		PackageID:             "package-cli-test",
		ProductID:             "product-cli-test",
		PublisherID:           "publisher-cli-test",
		PublisherKeyID:        "package-key-cli-test",
		MinimumRuntimeVersion: "0.0.0",
		Encryption:            scriptpackage.EncryptionManifest{KeyID: "content-key-cli-test"},
		License:               scriptpackage.LicenseManifest{Required: true, ProductID: "product-cli-test"},
	}
	result, err := scriptpackage.Build([]byte("globalThis.__licenseCli = true;"), manifest, contentKey, packagePrivate)
	if err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(directory, "recipe.odpkg")
	if err := os.WriteFile(packagePath, result.Bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	write := func(name string, data []byte) string {
		path := filepath.Join(directory, name)
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	return cliFixture{
		root:            filepath.Join(directory, "installed"),
		packagePath:     packagePath,
		devicePath:      devicePath,
		contentKeyPath:  write("content.key", contentKey),
		packagePublic:   write("package.pub", packagePublic),
		issuerPrivate:   write("issuer.private", issuerPrivate),
		issuerPublic:    write("issuer.pub", issuerPublic),
		licensePath:     filepath.Join(directory, "recipe.odlicense"),
		manager:         manager,
		now:             time.Date(2026, 9, 11, 8, 0, 0, 0, time.UTC),
		packageManifest: result.Manifest,
	}
}

func (fixture cliFixture) dependencies() Dependencies {
	return Dependencies{
		NewDevice:        func() (licensing.DeviceIdentityProvider, error) { return fixture.manager, nil },
		InstallationRoot: func() (string, error) { return fixture.root, nil },
		Now:              func() time.Time { return fixture.now },
	}
}

func executeForTest(t *testing.T, fixture cliFixture, args ...string) (int, string) {
	t.Helper()
	var stdout bytes.Buffer
	code := ExecuteWithDependencies(args, &stdout, &bytes.Buffer{}, fixture.dependencies())
	return code, stdout.String()
}

func issueFixtureLicense(t *testing.T, fixture cliFixture) {
	t.Helper()
	code, output := executeForTest(t, fixture,
		"license", "issue", fixture.packagePath,
		"--device", fixture.devicePath,
		"--content-key", fixture.contentKeyPath,
		"--signing-key", fixture.issuerPrivate,
		"--license-id", "license-cli-test",
		"--subject-id", "customer-cli-test",
		"--issuer-key-id", "issuer-key-cli-test",
		"--issued-at", licensing.FormatLicenseTime(fixture.now.Add(-time.Minute)),
		"--expires-at", licensing.FormatLicenseTime(fixture.now.Add(time.Hour)),
		"-o", fixture.licensePath,
	)
	if code != 0 {
		t.Fatalf("issue code=%d output=%s", code, output)
	}
	if strings.Contains(output, strings.Repeat("42", scriptpackage.ContentKeySize)) || strings.Contains(output, "wrappedContentKey") {
		t.Fatalf("issue output disclosed key material: %s", output)
	}
}

func TestLicenseDeviceExportsOnlyPublicIdentity(t *testing.T) {
	fixture := newCLIFixture(t)
	outputPath := filepath.Join(t.TempDir(), "device-public.json")
	code, output := executeForTest(t, fixture, "license", "device", "-o", outputPath)
	if code != 0 {
		t.Fatalf("code=%d output=%s", code, output)
	}
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("private")) || bytes.Contains([]byte(output), []byte("private")) {
		t.Fatalf("private material label appeared: file=%s output=%s", data, output)
	}
	if _, err := deviceidentity.ParsePublicIdentity(data); err != nil {
		t.Fatal(err)
	}
}

func TestLicenseIssueInspectVerifyInstallAndRuntimeProviders(t *testing.T) {
	fixture := newCLIFixture(t)
	issueFixtureLicense(t, fixture)

	code, output := executeForTest(t, fixture, "license", "inspect", fixture.licensePath)
	if code != 0 || strings.Contains(output, "wrappedContentKey") {
		t.Fatalf("inspect code=%d output=%s", code, output)
	}
	code, output = executeForTest(t, fixture, "license", "verify", fixture.licensePath, "--issuer-key", fixture.issuerPublic)
	if code != 0 || !strings.Contains(output, `"contentKeyAccessible":true`) {
		t.Fatalf("verify code=%d output=%s", code, output)
	}
	code, output = executeForTest(t, fixture,
		"license", "install", fixture.licensePath,
		"--package", fixture.packagePath,
		"--package-publisher-key", fixture.packagePublic,
		"--issuer-key", fixture.issuerPublic,
	)
	if code != 0 || !strings.Contains(output, `"installed":true`) {
		t.Fatalf("install code=%d output=%s", code, output)
	}

	store := licensing.FileInstallationStore{Root: fixture.root}
	packageKey, err := store.ResolvePublisherKey(context.Background(), fixture.packageManifest)
	if err != nil || len(packageKey) != ed25519.PublicKeySize {
		t.Fatalf("package key err=%v", err)
	}
	verifier := licensing.DeviceLicenseVerifier{
		Licenses: store, IssuerKeys: store, Device: fixture.manager,
		Now: func() time.Time { return fixture.now },
	}
	entitlement, err := verifier.Verify(context.Background(), fixture.packageManifest)
	if err != nil {
		t.Fatal(err)
	}
	contentKey, err := (licensing.DeviceBoundContentKeyProvider{Device: fixture.manager}).Resolve(context.Background(), fixture.packageManifest, entitlement)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(contentKey, bytes.Repeat([]byte{0x42}, scriptpackage.ContentKeySize)) {
		t.Fatal("runtime provider resolved the wrong key")
	}
}

func TestLicenseVerifyWrongDeviceAndTamperFailClosed(t *testing.T) {
	fixture := newCLIFixture(t)
	issueFixtureLicense(t, fixture)
	otherManager := deviceidentity.NewManager(&commandTestStore{})
	wrong := fixture
	wrong.manager = otherManager
	code, output := executeForTest(t, wrong, "license", "verify", fixture.licensePath, "--issuer-key", fixture.issuerPublic)
	if code == 0 || !strings.Contains(output, `"code":"wrong_device"`) {
		t.Fatalf("wrong-device code=%d output=%s", code, output)
	}

	data, err := os.ReadFile(fixture.licensePath)
	if err != nil {
		t.Fatal(err)
	}
	data[len(data)/2] ^= 1
	tamperedPath := filepath.Join(t.TempDir(), "tampered.odlicense")
	if err := os.WriteFile(tamperedPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	code, output = executeForTest(t, fixture, "license", "verify", tamperedPath, "--issuer-key", fixture.issuerPublic)
	if code == 0 || (!strings.Contains(output, `"code":"invalid_license"`) && !strings.Contains(output, `"code":"invalid_license_signature"`)) {
		t.Fatalf("tamper code=%d output=%s", code, output)
	}
}

func TestLicenseIssueRejectsWrongContentKey(t *testing.T) {
	fixture := newCLIFixture(t)
	wrongKeyPath := filepath.Join(t.TempDir(), "wrong.key")
	if err := os.WriteFile(wrongKeyPath, bytes.Repeat([]byte{0x11}, scriptpackage.ContentKeySize), 0o600); err != nil {
		t.Fatal(err)
	}
	code, output := executeForTest(t, fixture,
		"license", "issue", fixture.packagePath,
		"--device", fixture.devicePath,
		"--content-key", wrongKeyPath,
		"--signing-key", fixture.issuerPrivate,
		"--license-id", "license-cli-test",
		"--subject-id", "customer-cli-test",
		"--issuer-key-id", "issuer-key-cli-test",
		"--expires-at", licensing.FormatLicenseTime(fixture.now.Add(time.Hour)),
		"-o", fixture.licensePath,
	)
	if code == 0 || !strings.Contains(output, `"code":"content_key_unavailable"`) {
		t.Fatalf("code=%d output=%s", code, output)
	}
}
