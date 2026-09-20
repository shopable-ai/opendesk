package flowmarketplace

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
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
	if result.Record.ReleaseID != release.ReleaseID || result.Record.Origin != "marketplace" || result.Record.MarketplaceMetadataRevision != 1 || result.Record.MarketplaceArtifactLocation != release.ArtifactLocation { t.Fatalf("unexpected Catalog provenance: %+v", result.Record) }
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

func TestStaticInstallRejectsKnownMetadataRevisionRollbackBeforeDownloadOrConfirmation(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 2
	release.ArtifactLocation = "files/demo.odflow"
	current := SignedReleaseDocument{SchemaVersion: 1, Release: release, Attestation: signStaticRelease(t, release, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	artifactHits := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/base/flows/" + release.FlowID + "/" + release.ReleaseID + "/release.json":
			_ = json.NewEncoder(response).Encode(current)
		case "/base/files/demo.odflow", "/base/files/moved.odflow":
			artifactHits++
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact)
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client, err := NewClient(ClientOptions{BaseURL: server.URL + "/base/", Resolver: ResolverStatic, MarketplaceRoots: map[string]ed25519.PublicKey{"static-root": rootPublic}, AllowInsecureLoopbackForTests: true})
	if err != nil { t.Fatal(err) }
	service := newFlowService(t)
	confirmations := 0
	installer := &Installer{
		Client: client, FlowService: service, TempRoot: t.TempDir(),
		Confirmer: confirmerFunc(func(_ context.Context, _ Release, candidate flowinstall.VerifiedInstallCandidate) (flowinstall.VerifiedInstallApproval, error) {
			confirmations++
			decision := flowinstall.DecisionFlow
			if !candidate.TrustRequired { decision = "" }
			return flowinstall.VerifiedInstallApproval{Confirmed: true, TrustDecision: decision}, nil
		}),
	}
	result, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{})
	if err != nil { t.Fatalf("initial revision install error = %v", err) }
	if result.Record.MarketplaceMetadataRevision != 2 || artifactHits != 1 || confirmations != 1 {
		t.Fatalf("initial revision evidence record=%+v artifactHits=%d confirmations=%d", result.Record, artifactHits, confirmations)
	}

	stale := release
	stale.MetadataRevision = 1
	current = SignedReleaseDocument{SchemaVersion: 1, Release: stale, Attestation: signStaticRelease(t, stale, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	if _, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{}); err == nil {
		t.Fatal("known lower metadata revision was accepted")
	}
	if artifactHits != 1 || confirmations != 1 {
		t.Fatalf("rollback reached download or confirmation: artifactHits=%d confirmations=%d", artifactHits, confirmations)
	}

	sameRevisionMove := release
	sameRevisionMove.ArtifactLocation = "files/moved.odflow"
	current = SignedReleaseDocument{SchemaVersion: 1, Release: sameRevisionMove, Attestation: signStaticRelease(t, sameRevisionMove, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	if _, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{}); err == nil {
		t.Fatal("same metadata revision silently changed artifactLocation")
	}
	if artifactHits != 1 || confirmations != 1 {
		t.Fatalf("same-revision location change reached download or confirmation: artifactHits=%d confirmations=%d", artifactHits, confirmations)
	}

	moved := sameRevisionMove
	moved.MetadataRevision = 3
	current = SignedReleaseDocument{SchemaVersion: 1, Release: moved, Attestation: signStaticRelease(t, moved, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	movedResult, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{})
	if err != nil {
		t.Fatalf("higher-revision signed location move rejected: %v", err)
	}
	if movedResult.Record.MarketplaceMetadataRevision != 3 || movedResult.Record.MarketplaceArtifactLocation != moved.ArtifactLocation || artifactHits != 2 || confirmations != 2 {
		t.Fatalf("higher-revision location move evidence record=%+v artifactHits=%d confirmations=%d", movedResult.Record, artifactHits, confirmations)
	}

	rebound := moved
	rebound.MetadataRevision = 4
	rebound.ArtifactDigest = strings.Repeat("0", 64)
	current = SignedReleaseDocument{SchemaVersion: 1, Release: rebound, Attestation: signStaticRelease(t, rebound, "static-root", rootPrivate, time.Now().Add(time.Hour))}
	if _, err := installer.InstallURL(context.Background(), fixture.deepLink, flowinstall.InstallOptions{}); err == nil {
		t.Fatal("same Release identity was rebound to a different artifact digest")
	}
	if artifactHits != 2 || confirmations != 2 {
		t.Fatalf("digest rebinding reached download or confirmation: artifactHits=%d confirmations=%d", artifactHits, confirmations)
	}

	persisted, err := service.Catalog.Load(result.Record.InstallID)
	if err != nil || persisted.MarketplaceMetadataRevision != 3 || persisted.MarketplaceArtifactLocation != moved.ArtifactLocation {
		t.Fatalf("persisted revision after rollback = %+v err=%v", persisted, err)
	}
	if err := service.Uninstall(context.Background(), result.Record.InstallID, false); err != nil { t.Fatal(err) }
}


func TestStaticArtifactLocationRejectsTraversalAndMutableRelativeURLParts(t *testing.T) {
	client, err := NewClient(ClientOptions{
		BaseURL: "https://downloads.example.test/base/",
		Resolver: ResolverStatic,
	})
	if err != nil { t.Fatal(err) }
	release := Release{SchemaVersion: 2, MetadataRevision: 1}
	for _, location := range []string{
		"../escape.odflow",
		"flows/../escape.odflow",
		"/absolute/path.odflow",
		"flows/demo.odflow?token=mutable",
		"flows/demo.odflow#fragment",
		"flows\\demo.odflow",
		"https://downloads.example.test/base/../escape.odflow",
		"https://downloads.example.test/base/%2e%2e/escape.odflow",
		".",
	} {
		release.ArtifactLocation = location
		if _, err := client.artifactURL(release); err == nil {
			t.Fatalf("unsafe artifact location %q was accepted", location)
		}
	}
}

func TestMarketplaceArtifactDownloadCancellationTimeoutAndInterruptionLeaveNoTempFile(t *testing.T) {
	fixture := newMarketplaceFixture(t, EntitlementFree)
	release := fixture.release
	release.SchemaVersion = 2
	release.MetadataRevision = 1
	release.ArtifactLocation = "artifact.odflow"

	t.Run("canceled context", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact)
		}))
		defer server.Close()
		client, err := NewClient(ClientOptions{BaseURL: server.URL + "/", Resolver: ResolverStatic, AllowInsecureLoopbackForTests: true})
		if err != nil { t.Fatal(err) }
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		root := t.TempDir()
		if _, _, err := client.DownloadArtifact(ctx, release, root); err == nil {
			t.Fatal("canceled artifact download unexpectedly succeeded")
		}
		if entries, err := os.ReadDir(root); err != nil || len(entries) != 0 {
			t.Fatalf("canceled artifact download left temp files: entries=%v err=%v", entries, err)
		}
	})

	t.Run("http timeout", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			select {
			case <-request.Context().Done():
			case <-time.After(250 * time.Millisecond):
				response.WriteHeader(http.StatusGatewayTimeout)
			}
		}))
		defer server.Close()
		client, err := NewClient(ClientOptions{
			BaseURL: server.URL + "/", Resolver: ResolverStatic, AllowInsecureLoopbackForTests: true,
			HTTPClient: &http.Client{Timeout: 20 * time.Millisecond},
		})
		if err != nil { t.Fatal(err) }
		root := t.TempDir()
		if _, _, err := client.DownloadArtifact(context.Background(), release, root); err == nil {
			t.Fatal("timed-out artifact download unexpectedly succeeded")
		}
		if entries, err := os.ReadDir(root); err != nil || len(entries) != 0 {
			t.Fatalf("timed-out artifact download left temp files: entries=%v err=%v", entries, err)
		}
	})

	t.Run("truncated response", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			response.Header().Set("Content-Length", fmt.Sprintf("%d", len(fixture.artifact)))
			_, _ = response.Write(fixture.artifact[:len(fixture.artifact)/2])
		}))
		defer server.Close()
		client, err := NewClient(ClientOptions{BaseURL: server.URL + "/", Resolver: ResolverStatic, AllowInsecureLoopbackForTests: true})
		if err != nil { t.Fatal(err) }
		root := t.TempDir()
		if _, _, err := client.DownloadArtifact(context.Background(), release, root); err == nil {
			t.Fatal("truncated artifact download unexpectedly succeeded")
		}
		if entries, err := os.ReadDir(root); err != nil || len(entries) != 0 {
			t.Fatalf("truncated artifact download left temp files: entries=%v err=%v", entries, err)
		}
	})
}


func TestProductionMarketplaceRejectsPrivateAndLocalNetworkTargets(t *testing.T) {
	for _, raw := range []string{
		"https://127.0.0.1/releases/",
		"https://10.0.0.8/releases/",
		"https://192.168.1.8/releases/",
		"https://[::1]/releases/",
		"https://localhost/releases/",
		"https://printer.local/releases/",
		"https://intranet/releases/",
	} {
		if _, err := NewClient(ClientOptions{BaseURL: raw, Resolver: ResolverStatic}); err == nil {
			t.Fatalf("production Marketplace accepted private/local base URL %q", raw)
		}
	}
	if _, err := NewClient(ClientOptions{
		BaseURL: "http://127.0.0.1:51807/", Resolver: ResolverStatic, AllowInsecureLoopbackForTests: true,
	}); err != nil {
		t.Fatalf("explicit loopback development URL rejected: %v", err)
	}
}

func TestResolvedMarketplaceDNSAddressesRejectAnyPrivateTarget(t *testing.T) {
	if ips, err := validateResolvedMarketplaceIPs([]net.IPAddr{{IP: net.ParseIP("8.8.8.8")}}); err != nil || len(ips) != 1 {
		t.Fatalf("public resolved target rejected: ips=%v err=%v", ips, err)
	}
	if _, err := validateResolvedMarketplaceIPs([]net.IPAddr{{IP: net.ParseIP("8.8.8.8")}, {IP: net.ParseIP("10.0.0.8")}}); err == nil {
		t.Fatal("post-DNS Marketplace validation accepted a result set containing a private address")
	}
}

func TestSignedAbsoluteArtifactCannotTargetPrivateProductionAddress(t *testing.T) {
	client, err := NewClient(ClientOptions{BaseURL: "https://downloads.example.test/", Resolver: ResolverStatic})
	if err != nil { t.Fatal(err) }
	release := Release{SchemaVersion: 2, MetadataRevision: 1, ArtifactLocation: "https://127.0.0.1/private.odflow"}
	if _, err := client.artifactURL(release); err == nil {
		t.Fatal("signed absolute artifact URL bypassed production private-network policy")
	}
}
