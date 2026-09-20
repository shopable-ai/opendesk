package flowmarketplace

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/flowinstall"
)

func TestStaticMarketplaceInstallDownloadsSignedArtifactAndUsesSharedInstaller(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil { t.Fatal(err) }
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = "files/notify-demo.odflow"
	document := SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	var mu sync.Mutex
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		mu.Lock(); requests = append(requests, request.URL.Path); mu.Unlock()
		switch request.URL.Path {
		case "/distribution/flows/" + release.FlowID + "/" + release.ReleaseID + "/release.json":
			_ = json.NewEncoder(response).Encode(document)
		case "/distribution/files/notify-demo.odflow":
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{BaseURL: server.URL + "/distribution/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true})
	if err != nil { t.Fatal(err) }
	service := newFlowService(t)
	installer := &Installer{Client: client, FlowService: service, TempRoot: t.TempDir(), Confirmer: confirmerFunc(approveMarketplaceInstall)}
	result, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{})
	if err != nil { t.Fatalf("static InstallURL() error = %v", err) }
	if result.Record.ReleaseID != release.ReleaseID || result.Record.Origin != "marketplace" { t.Fatalf("unexpected Catalog provenance: %+v", result.Record) }
	assertInstallFixtureNotExecuted(t, service, result.Record.InstallID)
	mu.Lock(); got := append([]string(nil), requests...); mu.Unlock()
	if len(got) != 2 { t.Fatalf("static requests = %v, want release + artifact only", got) }
	if err := service.Uninstall(context.Background(), result.Record.InstallID, false); err != nil { t.Fatal(err) }
}

func TestStaticReleaseProtectsArtifactLocationAndAllowsResignedAddressRevision(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil { t.Fatal(err) }
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = "files/a.odflow"
	current := SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/base/flows/"+release.FlowID+"/"+release.ReleaseID+"/release.json" { _ = json.NewEncoder(response).Encode(current); return }
		if request.URL.Path == "/base/files/a.odflow" || request.URL.Path == "/base/files/b.odflow" {
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact))); _, _ = response.Write(fixture.artifact); return
		}
		http.NotFound(response, request)
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{BaseURL: server.URL + "/base/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true})
	if err != nil { t.Fatal(err) }
	ref, _ := ParseInstallURL(fixture.deepLink)
	resolved, err := client.ResolveInstallIntent(context.Background(), ref)
	if err != nil { t.Fatal(err) }
	if _, cleanup, err := client.DownloadArtifact(context.Background(), resolved.Release, t.TempDir()); err != nil { t.Fatal(err) } else { cleanup() }

	tampered := current
	tampered.Release.ArtifactLocation = "files/b.odflow"
	current = tampered
	if _, err := client.ResolveInstallIntent(context.Background(), ref); err == nil { t.Fatal("tampered signed artifactLocation was accepted") }

	release.MetadataRevision = 2
	release.ArtifactLocation = "files/b.odflow"
	current = SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	resolved, err = client.ResolveInstallIntent(context.Background(), ref)
	if err != nil { t.Fatalf("resigned location change rejected: %v", err) }
	if resolved.Release.ReleaseID != fixture.release.ReleaseID || resolved.Release.ArtifactDigest != fixture.release.ArtifactDigest || resolved.Release.MetadataRevision != 2 { t.Fatalf("identity changed unexpectedly: %+v", resolved.Release) }
	if _, cleanup, err := client.DownloadArtifact(context.Background(), resolved.Release, t.TempDir()); err != nil { t.Fatal(err) } else { cleanup() }
}

func TestStaticResolverRejectsRedirectAndV1Fallback(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = "files/redirect.odflow"
	document := SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/base/flows/" + release.FlowID + "/" + release.ReleaseID + "/release.json": _ = json.NewEncoder(response).Encode(document)
		case "/base/files/redirect.odflow": http.Redirect(response, request, "https://example.invalid/other.odflow", http.StatusFound)
		default: http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{BaseURL: server.URL + "/base/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true})
	if err != nil { t.Fatal(err) }
	ref, _ := ParseInstallURL(fixture.deepLink)
	resolved, err := client.ResolveInstallIntent(context.Background(), ref)
	if err != nil { t.Fatal(err) }
	if _, _, err := client.DownloadArtifact(context.Background(), resolved.Release, t.TempDir()); err == nil { t.Fatal("artifact redirect was followed or accepted") }
	if _, _, err := client.DownloadArtifact(context.Background(), fixture.release, t.TempDir()); err == nil { t.Fatal("static resolver silently fell back to the dynamic v1 artifact endpoint") }
}

func signStaticRelease(t *testing.T, release Release, rootKeyID string, private ed25519.PrivateKey, expires time.Time) ReleaseAttestation {
	t.Helper()
	attestation := ReleaseAttestation{SchemaVersion: 2, RootKeyID: rootKeyID, Usage: releaseAttestationUsage, ExpiresAt: expires.UTC().Truncate(time.Second).Format(time.RFC3339)}
	message, err := ReleaseAttestationMessage(release, attestation)
	if err != nil { t.Fatal(err) }
	attestation.Signature = hex.EncodeToString(ed25519.Sign(private, message))
	return attestation
}

func TestReleaseV2AttestationMessageGolden(t *testing.T) {
	release := Release{
		SchemaVersion: 2, MarketplaceID: "market", FlowID: "flow.demo", FlowName: "Demo", ReleaseID: "release-1",
		MetadataRevision: 3, Version: "1.2.3", PublisherID: "publisher", PublisherSigningKeyID: "publisher-key",
		PublisherSigningKeyFingerprint: strings.Repeat("a", 64), ArtifactDigest: strings.Repeat("b", 64), ArtifactSize: 42,
		ArtifactLocation: "flows/flow.demo/release-1/demo.odflow", MinimumOpenDeskVersion: "2.0.1",
		PublishedAt: "2026-09-20T00:00:00Z", ReleaseStatus: ReleasePublished, EntitlementPolicy: EntitlementFree, UpdateChannel: "stable",
	}
	attestation := ReleaseAttestation{SchemaVersion: 2, RootKeyID: "root", Usage: releaseAttestationUsage, ExpiresAt: "2026-09-21T00:00:00Z"}
	message, err := ReleaseAttestationMessage(release, attestation)
	if err != nil { t.Fatal(err) }
	want := "OpenDeskMarketplaceReleaseAttestation/v2\x00" +
		"{\"schemaVersion\":2,\"rootKeyId\":\"root\",\"usage\":\"flow-marketplace-release\",\"marketplaceId\":\"market\",\"flowId\":\"flow.demo\",\"flowName\":\"Demo\",\"releaseId\":\"release-1\",\"metadataRevision\":3,\"version\":\"1.2.3\",\"publisherId\":\"publisher\",\"publisherSigningKeyId\":\"publisher-key\",\"publisherSigningKeyFingerprint\":\"" + strings.Repeat("a", 64) + "\",\"artifactDigest\":\"" + strings.Repeat("b", 64) + "\",\"artifactSize\":42,\"artifactLocation\":\"flows/flow.demo/release-1/demo.odflow\",\"minimumOpenDeskVersion\":\"2.0.1\",\"publishedAt\":\"2026-09-20T00:00:00Z\",\"releaseStatus\":\"published\",\"entitlementPolicy\":\"free\",\"updateChannel\":\"stable\",\"expiresAt\":\"2026-09-21T00:00:00Z\"}"
	if string(message) != want { t.Fatalf("v2 attestation message drifted:\n got: %q\nwant: %q", string(message), want) }
}

func TestStaticReleaseUsesExplicitArtifactBaseForRelativeLocation(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = "files/demo.odflow"
	document := SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/metadata/flows/" + release.FlowID + "/" + release.ReleaseID + "/release.json":
			_ = json.NewEncoder(response).Encode(document)
		case "/artifacts/files/demo.odflow":
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{
		BaseURL: server.URL + "/metadata/", ArtifactBaseURL: server.URL + "/artifacts/", Resolver: ResolverStatic,
		MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true,
	})
	if err != nil { t.Fatal(err) }
	ref, _ := ParseInstallURL(fixture.deepLink)
	resolved, err := client.ResolveInstallIntent(context.Background(), ref)
	if err != nil { t.Fatal(err) }
	if _, cleanup, err := client.DownloadArtifact(context.Background(), resolved.Release, t.TempDir()); err != nil { t.Fatal(err) } else { cleanup() }
}

func TestStaticReleaseAcceptsSignedAbsoluteLoopbackLocationOnlyInExplicitDevelopmentMode(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	var document SignedReleaseDocument
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/metadata/flows/" + fixture.release.FlowID + "/" + fixture.release.ReleaseID + "/release.json":
			_ = json.NewEncoder(response).Encode(document)
		case "/absolute.odflow":
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = server.URL + "/absolute.odflow"
	document = SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}

	development, err := NewClient(ClientOptions{BaseURL: server.URL + "/metadata/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true})
	if err != nil { t.Fatal(err) }
	ref, _ := ParseInstallURL(fixture.deepLink)
	resolved, err := development.ResolveInstallIntent(context.Background(), ref)
	if err != nil { t.Fatal(err) }
	if _, cleanup, err := development.DownloadArtifact(context.Background(), resolved.Release, t.TempDir()); err != nil { t.Fatal(err) } else { cleanup() }

	if _, err := NewClient(ClientOptions{BaseURL: server.URL + "/metadata/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}}); err == nil {
		t.Fatal("production client accepted an insecure HTTP metadata prefix")
	}
}
