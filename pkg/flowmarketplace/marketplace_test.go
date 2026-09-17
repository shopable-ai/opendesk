package flowmarketplace

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowpackage"
)

type confirmerFunc func(context.Context, Release) (bool, error)

func (fn confirmerFunc) ConfirmMarketplaceInstall(ctx context.Context, release Release) (bool, error) {
	return fn(ctx, release)
}

type entitlementFunc func(context.Context, Release) error

func (fn entitlementFunc) AuthorizeMarketplaceInstall(ctx context.Context, release Release) error {
	return fn(ctx, release)
}

type urlInstallerFunc func(context.Context, string, flowinstall.InstallOptions) (flowinstall.InstallResult, error)

func (fn urlInstallerFunc) InstallURL(ctx context.Context, rawURL string, options flowinstall.InstallOptions) (flowinstall.InstallResult, error) {
	return fn(ctx, rawURL, options)
}

type marketplaceFixture struct {
	artifact       []byte
	release        Release
	attestation    ReleaseAttestation
	marketplaceKey ed25519.PublicKey
	deepLink       string
}

func TestMarketplaceInstallVerticalSlice(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	client := newTestClient(t, server.URL, fixture.marketplaceKey)
	service := newFlowService(t)
	installer := &Installer{
		Client: client, FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	result, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err != nil {
		t.Fatalf("InstallURL() error = %v", err)
	}
	if got := artifactHits.Load(); got != 1 {
		t.Fatalf("artifact requests = %d, want 1", got)
	}
	if result.Record.Origin != "marketplace" || result.Record.MarketplaceID != fixture.release.MarketplaceID || result.Record.ReleaseID != fixture.release.ReleaseID || result.Record.UpdateChannel != fixture.release.UpdateChannel {
		t.Fatalf("unexpected Marketplace provenance: %+v", result.Record)
	}
	loaded, err := service.Catalog.Load(result.Record.InstallID)
	if err != nil {
		t.Fatalf("Catalog.Load() error = %v", err)
	}
	if loaded.Origin != "marketplace" || loaded.ReleaseID != fixture.release.ReleaseID {
		t.Fatalf("catalog did not persist Marketplace provenance: %+v", loaded)
	}
	assertTrustSource(t, service, "user")
	// Installed content is intentionally sealed read-only. Exercise the
	// production uninstall path so TempDir cleanup does not bypass that
	// lifecycle contract on macOS.
	if err := service.Uninstall(context.Background(), result.Record.InstallID, false); err != nil {
		t.Fatalf("Uninstall() error = %v", err)
	}
}

func TestMarketplaceVerifiedPublisherDoesNotBypassLocalTrust(t *testing.T) {
	fixture := newMarketplaceFixtureWithVerifiedPublisher(t)
	server, _ := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{})
	if flowinstall.CodeOf(err) != flowinstall.CodeTrustRequired {
		t.Fatalf("InstallURL() code = %q error=%v, want %q", flowinstall.CodeOf(err), err, flowinstall.CodeTrustRequired)
	}
	records, listErr := service.Catalog.List()
	if listErr != nil {
		t.Fatalf("Catalog.List() error = %v", listErr)
	}
	if len(records) != 0 {
		t.Fatalf("untrusted Marketplace Flow was registered: %+v", records)
	}
	assertNoTrustRecords(t, service)
}

func TestMarketplaceDigestMismatchDoesNotInstall(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	fixture.release.ArtifactDigest = hex.EncodeToString(make([]byte, 32))
	fixture = resignFixture(t, fixture)
	server, _ := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded with a mismatched artifact digest")
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestMarketplaceAttestationTamperStopsBeforeDownload(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	fixture.attestation.Signature = hex.EncodeToString(make([]byte, ed25519.SignatureSize))
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded with a tampered Marketplace attestation")
	}
	if got := artifactHits.Load(); got != 0 {
		t.Fatalf("artifact requests = %d, want 0 before attestation verification succeeds", got)
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestMarketplaceInvalidPublisherSignatureDoesNotInstall(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	fixture.artifact = corruptPublisherSignature(t, fixture.artifact)
	digest := sha256.Sum256(fixture.artifact)
	fixture.release.ArtifactDigest = hex.EncodeToString(digest[:])
	fixture.release.ArtifactSize = int64(len(fixture.artifact))
	fixture = resignFixture(t, fixture)
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded with an invalid .odflow Publisher Signature")
	}
	if got := artifactHits.Load(); got != 1 {
		t.Fatalf("artifact requests = %d, want 1 before Publisher Signature rejection", got)
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestMarketplacePaidEntitlementDenialStopsBeforeDownload(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementPurchase)
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer:   confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
		Entitlement: entitlementFunc(func(context.Context, Release) error { return errors.New("not entitled") }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded without Marketplace entitlement")
	}
	if got := artifactHits.Load(); got != 0 {
		t.Fatalf("artifact requests = %d, want 0 before entitlement succeeds", got)
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestMarketplaceReleasePublisherMismatchDoesNotInstall(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	fixture.release.PublisherID = "publisher-other"
	fixture = resignFixture(t, fixture)
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded when canonical publisher identity differs from verified .odflow")
	}
	if got := artifactHits.Load(); got != 1 {
		t.Fatalf("artifact requests = %d, want 1 before package/release matching", got)
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestMarketplaceIntentIdentityMismatchStopsBeforeDownload(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	fixture.release.FlowID = "other-flow"
	fixture = resignFixture(t, fixture)
	server, artifactHits := newMarketplaceServer(t, fixture)
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{
		Approver: func(context.Context, flowinstall.TrustCandidate) (flowinstall.TrustDecision, error) {
			return flowinstall.DecisionFlow, nil
		},
	})
	if err == nil {
		t.Fatal("InstallURL() succeeded with a flowId that differs from the Deep Link")
	}
	if got := artifactHits.Load(); got != 0 {
		t.Fatalf("artifact requests = %d, want 0 before canonical intent identity succeeds", got)
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestResolveInstallIntentRejectsMalformedMetadata(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/install-intents/intent-1" {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(writer, `{"schemaVersion":1,"installIntentId":"intent-1","flowId":"invoice-export","releaseId":"release-1","release":{},"attestation":{},"unexpected":true}`)
	}))
	defer server.Close()
	client := newTestClient(t, server.URL, fixture.marketplaceKey)
	_, err := client.ResolveInstallIntent(context.Background(), InstallIntentRef{FlowID: "invoice-export", ReleaseID: "release-1", InstallIntentID: "intent-1"})
	if err == nil {
		t.Fatal("ResolveInstallIntent() accepted malformed/unknown release metadata")
	}
}

func TestMarketplaceUnknownReleaseDoesNotInstall(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	service := newFlowService(t)
	installer := &Installer{
		Client: newTestClient(t, server.URL, fixture.marketplaceKey), FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(context.Context, Release) (bool, error) { return true, nil }),
	}
	_, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{})
	if err == nil {
		t.Fatal("InstallURL() succeeded for an unknown Marketplace release")
	}
	assertCatalogEmpty(t, service)
	assertNoTrustRecords(t, service)
}

func TestDeepLinkHandlerRejectsBeforeDelegating(t *testing.T) {
	called := 0
	handler := DeepLinkHandler{Installer: urlInstallerFunc(func(context.Context, string, flowinstall.InstallOptions) (flowinstall.InstallResult, error) {
		called++
		return flowinstall.InstallResult{}, nil
	})}
	_, err := handler.Handle(context.Background(), "opendesk://install/flow/invoice-export?release=rel-1&intent=intent-1&url=https%3A%2F%2Fevil.example")
	if err == nil {
		t.Fatal("DeepLinkHandler accepted an arbitrary URL parameter")
	}
	if called != 0 {
		t.Fatalf("installer calls = %d, want 0 for an invalid Deep Link", called)
	}
}

func TestDeepLinkHandlerPassesValidatedIntentAndLocalOptions(t *testing.T) {
	ref := InstallIntentRef{FlowID: "invoice-export", ReleaseID: "rel-1", InstallIntentID: "intent-1"}
	rawURL, err := BuildInstallURL(ref)
	if err != nil {
		t.Fatal(err)
	}
	called := 0
	handler := DeepLinkHandler{
		Installer: urlInstallerFunc(func(_ context.Context, gotURL string, options flowinstall.InstallOptions) (flowinstall.InstallResult, error) {
			called++
			if gotURL != rawURL || options.AllowDowngrade {
				t.Fatalf("unexpected delegated URL/options: %q %+v", gotURL, options)
			}
			return flowinstall.InstallResult{}, nil
		}),
		InstallOptions: func(context.Context) flowinstall.InstallOptions {
			return flowinstall.InstallOptions{AllowDowngrade: false}
		},
	}
	if _, err := handler.Handle(context.Background(), rawURL); err != nil {
		t.Fatalf("DeepLinkHandler.Handle() error = %v", err)
	}
	if called != 1 {
		t.Fatalf("installer calls = %d, want 1", called)
	}
}

func TestParseInstallURLRejectsExecutableInputs(t *testing.T) {
	valid := InstallIntentRef{FlowID: "invoice-export", ReleaseID: "rel-1", InstallIntentID: "intent-1"}
	deepLink, err := BuildInstallURL(valid)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseInstallURL(deepLink)
	if err != nil || parsed != valid {
		t.Fatalf("ParseInstallURL(%q) = %+v, %v", deepLink, parsed, err)
	}
	for _, raw := range []string{
		deepLink + "&artifactUrl=https%3A%2F%2Fevil.example%2Fp.odflow",
		deepLink + "&path=%2Ftmp%2Fevil.odflow",
		deepLink + "&command=rm",
		deepLink + "&licenseKey=secret",
		"opendesk://install/flow/invoice-export?release=rel-1&release=rel-2&intent=intent-1",
		"opendesk://install/flow/invoice-export/../../x?release=rel-1&intent=intent-1",
		"https://install/flow/invoice-export?release=rel-1&intent=intent-1",
	} {
		if _, err := ParseInstallURL(raw); err == nil {
			t.Fatalf("ParseInstallURL(%q) unexpectedly succeeded", raw)
		}
	}
}

func newMarketplaceFixture(t *testing.T, entitlement EntitlementPolicy) marketplaceFixture {
	t.Helper()
	return buildMarketplaceFixture(t, entitlement, false)
}

func newMarketplaceFixtureWithVerifiedPublisher(t *testing.T) marketplaceFixture {
	t.Helper()
	return buildMarketplaceFixture(t, EntitlementFree, true)
}

func buildMarketplaceFixture(t *testing.T, entitlement EntitlementPolicy, verified bool) marketplaceFixture {
	t.Helper()
	source := t.TempDir()
	if err := os.WriteFile(filepath.Join(source, "main.js"), []byte(`throw new Error("install must never execute Flow code");`), 0o600); err != nil {
		t.Fatal(err)
	}
	publisherPublic, publisherPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	built, err := flowpackage.Build(flowpackage.BuildOptions{
		SourceRoot: source, FlowID: "invoice-export", Name: "Invoice Export", Version: "1.2.3",
		PublisherID: "publisher-acme", PublisherKeyID: "publisher-key-1", Entry: "main.js",
		MinimumRuntimeVersion: "0.0.0", Platforms: []string{runtime.GOOS}, Files: []string{"main.js"},
		PublisherPublicKey: publisherPublic, PublisherPrivateKey: publisherPrivate,
	})
	if err != nil {
		t.Fatalf("flowpackage.Build() error = %v", err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	release := Release{
		SchemaVersion: 1, MarketplaceID: "opendesk-main", FlowID: built.Manifest.FlowID, FlowName: built.Manifest.Name,
		ReleaseID: "release-1", Version: built.Manifest.Version, PublisherID: built.Manifest.PublisherID,
		PublisherSigningKeyID: built.Manifest.PublisherKeyID, PublisherSigningKeyFingerprint: built.Manifest.PublisherFingerprint,
		ArtifactDigest: built.ArchiveDigest, ArtifactSize: int64(len(built.Bytes)), MinimumOpenDeskVersion: built.Manifest.MinimumRuntimeVersion,
		PublishedAt: now.Format(time.RFC3339), ReleaseStatus: ReleasePublished, EntitlementPolicy: entitlement,
		UpdateChannel: "stable", VerifiedPublisher: verified,
	}
	marketPublic, marketPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	attestation := signReleaseAttestation(t, release, marketPublic, marketPrivate)
	deepLink, err := BuildInstallURL(InstallIntentRef{FlowID: release.FlowID, ReleaseID: release.ReleaseID, InstallIntentID: "intent-1"})
	if err != nil {
		t.Fatal(err)
	}
	return marketplaceFixture{artifact: built.Bytes, release: release, attestation: attestation, marketplaceKey: marketPublic, deepLink: deepLink}
}

func resignFixture(t *testing.T, fixture marketplaceFixture) marketplaceFixture {
	t.Helper()
	marketPublic, marketPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	fixture.marketplaceKey = marketPublic
	fixture.attestation = signReleaseAttestation(t, fixture.release, marketPublic, marketPrivate)
	return fixture
}

func signReleaseAttestation(t *testing.T, release Release, public ed25519.PublicKey, private ed25519.PrivateKey) ReleaseAttestation {
	t.Helper()
	if len(public) != ed25519.PublicKeySize || len(private) != ed25519.PrivateKeySize {
		t.Fatal("invalid Marketplace attestation test key")
	}
	attestation := ReleaseAttestation{
		SchemaVersion: 1, RootKeyID: "market-root-1", Usage: releaseAttestationUsage,
		ExpiresAt: time.Now().UTC().Add(time.Hour).Truncate(time.Second).Format(time.RFC3339),
	}
	message, err := ReleaseAttestationMessage(release, attestation)
	if err != nil {
		t.Fatal(err)
	}
	attestation.Signature = hex.EncodeToString(ed25519.Sign(private, message))
	return attestation
}

func corruptPublisherSignature(t *testing.T, artifact []byte) []byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(artifact), int64(len(artifact)))
	if err != nil {
		t.Fatalf("zip.NewReader() error = %v", err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	foundSignature := false
	for _, file := range reader.File {
		entry, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(entry)
		_ = entry.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == flowpackage.SignatureName {
			if len(content) == 0 {
				t.Fatal("Flow package signature is empty")
			}
			content[0] ^= 0xff
			foundSignature = true
		}
		header := &zip.FileHeader{Name: file.Name, Method: zip.Store}
		header.SetMode(0o600)
		header.Modified = time.Unix(0, 0).UTC()
		destination, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := destination.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if !foundSignature {
		t.Fatal("Flow package signature entry was not found")
	}
	return output.Bytes()
}

func newMarketplaceServer(t *testing.T, fixture marketplaceFixture) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	artifactHits := &atomic.Int32{}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/install-intents/intent-1", func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writer.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(writer).Encode(ResolvedInstallIntent{
			SchemaVersion: 1, InstallIntentID: "intent-1", FlowID: fixture.release.FlowID,
			ReleaseID: fixture.release.ReleaseID, Release: fixture.release, Attestation: fixture.attestation,
		})
	})
	mux.HandleFunc("/v1/releases/release-1/artifact", func(writer http.ResponseWriter, request *http.Request) {
		artifactHits.Add(1)
		writer.Header().Set("Content-Type", "application/vnd.opendesk.flow")
		_, _ = writer.Write(fixture.artifact)
	})
	return httptest.NewServer(mux), artifactHits
}

func newTestClient(t *testing.T, baseURL string, marketKey ed25519.PublicKey) *Client {
	t.Helper()
	client, err := NewClient(ClientOptions{
		BaseURL: baseURL, AllowInsecureLoopbackForTests: true,
		MarketplaceRoots: map[string]ed25519.PublicKey{"market-root-1": marketKey},
	})
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	return client
}

func newFlowService(t *testing.T) *flowinstall.Service {
	t.Helper()
	service, err := flowinstall.NewService(flowinstall.RootsFromAppData(filepath.Join(t.TempDir(), "app-data")))
	if err != nil {
		t.Fatalf("flowinstall.NewService() error = %v", err)
	}
	service.RuntimeVersion = "9.9.9"
	t.Cleanup(func() {
		records, err := service.Catalog.List()
		if err != nil {
			t.Errorf("Catalog.List() during cleanup error = %v", err)
			return
		}
		for _, record := range records {
			if err := service.Uninstall(context.Background(), record.InstallID, false); err != nil {
				t.Errorf("Uninstall(%s) during cleanup error = %v", record.InstallID, err)
			}
		}
	})
	return service
}

func assertCatalogEmpty(t *testing.T, service *flowinstall.Service) {
	t.Helper()
	records, err := service.Catalog.List()
	if err != nil {
		t.Fatalf("Catalog.List() error = %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("unexpected catalog records: %+v", records)
	}
}

func assertNoTrustRecords(t *testing.T, service *flowinstall.Service) {
	t.Helper()
	recordsRoot := filepath.Join(service.Roots.TrustRoot, "records")
	entries, err := os.ReadDir(recordsRoot)
	if os.IsNotExist(err) {
		return
	}
	if err != nil {
		t.Fatalf("ReadDir(%s) error = %v", recordsRoot, err)
	}
	if len(entries) != 0 {
		t.Fatalf("unexpected trust records: %v", entries)
	}
}

func assertTrustSource(t *testing.T, service *flowinstall.Service, expected string) {
	t.Helper()
	recordsRoot := filepath.Join(service.Roots.TrustRoot, "records")
	entries, err := os.ReadDir(recordsRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 {
		t.Fatalf("trust record count = %d, want 1", len(entries))
	}
	data, err := os.ReadFile(filepath.Join(recordsRoot, entries[0].Name()))
	if err != nil {
		t.Fatal(err)
	}
	var record struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal(data, &record); err != nil {
		t.Fatal(err)
	}
	if record.Source != expected {
		t.Fatalf("trust source = %q, want %q", record.Source, expected)
	}
}
