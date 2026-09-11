package entitlementservice

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type memoryDeviceStore struct {
	value []byte
}

func (store *memoryDeviceStore) Load(context.Context, string) ([]byte, error) {
	if store.value == nil {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), store.value...), nil
}

func (store *memoryDeviceStore) Create(_ context.Context, _ string, value []byte) error {
	if store.value != nil {
		return securestore.ErrAlreadyExists
	}
	store.value = append([]byte(nil), value...)
	return nil
}

type fixedMaterialProvider struct {
	material IssuanceMaterial
}

func (provider fixedMaterialProvider) Resolve(context.Context, entitlement.PackageBinding) (IssuanceMaterial, error) {
	material := provider.material
	material.ContentKey = append([]byte(nil), provider.material.ContentKey...)
	material.LicenseSigningKey = append(ed25519.PrivateKey(nil), provider.material.LicenseSigningKey...)
	return material, nil
}

type serviceFixture struct {
	now          time.Time
	token        []byte
	binding      entitlement.PackageBinding
	registry     *MemoryRegistry
	issuerPublic ed25519.PublicKey
	client       entitlement.HTTPClient
	server       *httptest.Server
}

func newServiceFixture(t *testing.T, deviceLimit int) serviceFixture {
	t.Helper()
	now := time.Date(2026, 9, 11, 8, 0, 0, 0, time.UTC)
	token := []byte("entitlement-test-token-alice")
	binding := entitlement.PackageBinding{
		PublisherID:    "publisher-online",
		PublisherKeyID: "package-key-online",
		ProductID:      "product-online",
		PackageID:      "package-online",
		ContentKeyID:   "content-key-online",
	}
	authenticator, err := NewMemoryAuthenticator(
		Credential{SubjectID: "subject-alice", Token: token},
		Credential{SubjectID: "subject-bob", Token: []byte("entitlement-test-token-bob")},
	)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := NewMemoryRegistry(EntitlementRecord{
		EntitlementID: "entitlement-alice",
		SubjectID:     "subject-alice",
		Package:       binding,
		DeviceLimit:   deviceLimit,
		ExpiresAt:     now.Add(30 * 24 * time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	issuerPublic, issuerPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	issuer := SignedCacheIssuer{
		Materials: fixedMaterialProvider{material: IssuanceMaterial{
			Package:           binding,
			IssuerKeyID:       "issuer-key-online",
			ContentKey:        contentKey,
			LicenseSigningKey: issuerPrivate,
		}},
		OfflineGrace: 48 * time.Hour,
		RefreshAfter: 12 * time.Hour,
	}
	server := httptest.NewTLSServer(Handler{Authenticator: authenticator, Registry: registry, Issuer: issuer, Now: func() time.Time { return now }})
	t.Cleanup(server.Close)
	return serviceFixture{
		now: now, token: token, binding: binding, registry: registry,
		issuerPublic: issuerPublic,
		client:       entitlement.HTTPClient{Endpoint: server.URL, Client: server.Client()},
		server:       server,
	}
}

func newDevice(t *testing.T) deviceidentity.PublicIdentity {
	t.Helper()
	identity, err := deviceidentity.NewManager(&memoryDeviceStore{}).Ensure(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return identity
}

func newNonce(t *testing.T) string {
	t.Helper()
	nonce, err := entitlement.NewRequestNonce()
	if err != nil {
		t.Fatal(err)
	}
	return nonce
}

func parseVerifiedCache(t *testing.T, data []byte, publicKey ed25519.PublicKey, nonce string) *licensing.OnlineCache {
	t.Helper()
	cache, err := licensing.DecodeOnlineCacheJSON(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := licensing.VerifyOnlineCacheForRequest(cache, publicKey, nonce); err != nil {
		t.Fatal(err)
	}
	return cache
}

func TestHTTPSHandlerAuthenticationEntitlementDeviceLimitAndLifecycle(t *testing.T) {
	fixture := newServiceFixture(t, 1)
	ctx := context.Background()
	device := newDevice(t)

	badAuthRequest := entitlement.ActivateRequest{RequestNonce: newNonce(t), Device: device, Package: fixture.binding}
	if _, err := fixture.client.Activate(ctx, []byte("wrong-token"), badAuthRequest); licensing.CodeOf(err) != licensing.CodeAuthenticationRequired {
		t.Fatalf("bad auth code=%q err=%v", licensing.CodeOf(err), err)
	}
	unentitledRequest := entitlement.ActivateRequest{RequestNonce: newNonce(t), Device: device, Package: fixture.binding}
	if _, err := fixture.client.Activate(ctx, []byte("entitlement-test-token-bob"), unentitledRequest); licensing.CodeOf(err) != licensing.CodeLicenseDenied {
		t.Fatalf("unentitled code=%q err=%v", licensing.CodeOf(err), err)
	}

	activateNonce := newNonce(t)
	data, err := fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: activateNonce, Device: device, Package: fixture.binding})
	if err != nil {
		t.Fatal(err)
	}
	active := parseVerifiedCache(t, data, fixture.issuerPublic, activateNonce)
	if active.Claims.State != licensing.OnlineStateActive || active.Claims.Sequence != 1 || active.Claims.OfflineExpiryTime().Sub(fixture.now) != 48*time.Hour {
		t.Fatalf("first activation=%#v", active.Claims)
	}

	// Activating the same public device is idempotent for device count while
	// still advancing the signed response sequence.
	repeatNonce := newNonce(t)
	data, err = fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: repeatNonce, Device: device, Package: fixture.binding})
	if err != nil {
		t.Fatal(err)
	}
	repeated := parseVerifiedCache(t, data, fixture.issuerPublic, repeatNonce)
	if repeated.Claims.ActivationID != active.Claims.ActivationID || repeated.Claims.Sequence != 2 {
		t.Fatalf("repeated activation=%#v first=%#v", repeated.Claims, active.Claims)
	}

	otherDevice := newDevice(t)
	if _, err := fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: newNonce(t), Device: otherDevice, Package: fixture.binding}); licensing.CodeOf(err) != licensing.CodeDeviceLimitExceeded {
		t.Fatalf("device limit code=%q err=%v", licensing.CodeOf(err), err)
	}

	refreshNonce := newNonce(t)
	data, err = fixture.client.Refresh(ctx, fixture.token, entitlement.RefreshRequest{
		RequestNonce: refreshNonce,
		ActivationID: repeated.Claims.ActivationID,
		Sequence:     repeated.Claims.Sequence,
		DeviceID:     device.DeviceID,
	})
	if err != nil {
		t.Fatal(err)
	}
	refreshed := parseVerifiedCache(t, data, fixture.issuerPublic, refreshNonce)
	if refreshed.Claims.State != licensing.OnlineStateActive || refreshed.Claims.Sequence != 3 {
		t.Fatalf("refresh=%#v", refreshed.Claims)
	}

	deactivateNonce := newNonce(t)
	data, err = fixture.client.Deactivate(ctx, fixture.token, entitlement.DeactivateRequest{
		RequestNonce: deactivateNonce,
		ActivationID: refreshed.Claims.ActivationID,
		Sequence:     refreshed.Claims.Sequence,
		DeviceID:     device.DeviceID,
	})
	if err != nil {
		t.Fatal(err)
	}
	deactivated := parseVerifiedCache(t, data, fixture.issuerPublic, deactivateNonce)
	if deactivated.Claims.State != licensing.OnlineStateRevoked || deactivated.Claims.Sequence != 4 {
		t.Fatalf("deactivate=%#v", deactivated.Claims)
	}

	// Deactivation releases the slot for another device.
	if _, err := fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: newNonce(t), Device: otherDevice, Package: fixture.binding}); err != nil {
		t.Fatalf("activation after deactivation: %v", err)
	}
}

func TestMemoryRegistryAtomicallyAdmitsOnlyOneLastDeviceSlot(t *testing.T) {
	fixture := newServiceFixture(t, 2)
	ctx := context.Background()
	firstDevice := newDevice(t)
	if _, err := fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: newNonce(t), Device: firstDevice, Package: fixture.binding}); err != nil {
		t.Fatal(err)
	}

	devices := []deviceidentity.PublicIdentity{newDevice(t), newDevice(t)}
	nonces := []string{newNonce(t), newNonce(t)}
	start := make(chan struct{})
	errorsByRequest := make([]error, len(devices))
	var wait sync.WaitGroup
	for index, device := range devices {
		wait.Add(1)
		go func(index int, device deviceidentity.PublicIdentity) {
			defer wait.Done()
			<-start
			_, errorsByRequest[index] = fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: nonces[index], Device: device, Package: fixture.binding})
		}(index, device)
	}
	close(start)
	wait.Wait()

	succeeded := 0
	limited := 0
	for _, err := range errorsByRequest {
		switch licensing.CodeOf(err) {
		case "":
			if err != nil {
				t.Fatalf("unexpected activation error: %v", err)
			}
			succeeded++
		case licensing.CodeDeviceLimitExceeded:
			limited++
		default:
			t.Fatalf("unexpected activation code=%q err=%v", licensing.CodeOf(err), err)
		}
	}
	if succeeded != 1 || limited != 1 {
		t.Fatalf("concurrent last slot succeeded=%d limited=%d", succeeded, limited)
	}
}

func TestRevokedEntitlementRefreshReturnsSignedRevokedState(t *testing.T) {
	fixture := newServiceFixture(t, 1)
	ctx := context.Background()
	device := newDevice(t)
	activateNonce := newNonce(t)
	data, err := fixture.client.Activate(ctx, fixture.token, entitlement.ActivateRequest{RequestNonce: activateNonce, Device: device, Package: fixture.binding})
	if err != nil {
		t.Fatal(err)
	}
	active := parseVerifiedCache(t, data, fixture.issuerPublic, activateNonce)
	if err := fixture.registry.RevokeEntitlement(active.Claims.EntitlementID); err != nil {
		t.Fatal(err)
	}

	refreshNonce := newNonce(t)
	data, err = fixture.client.Refresh(ctx, fixture.token, entitlement.RefreshRequest{
		RequestNonce: refreshNonce,
		ActivationID: active.Claims.ActivationID,
		Sequence:     active.Claims.Sequence,
		DeviceID:     device.DeviceID,
	})
	if err != nil {
		t.Fatal(err)
	}
	revoked := parseVerifiedCache(t, data, fixture.issuerPublic, refreshNonce)
	if revoked.Claims.State != licensing.OnlineStateRevoked || revoked.Claims.Sequence != active.Claims.Sequence+1 {
		t.Fatalf("revoked refresh=%#v", revoked.Claims)
	}

	// A stale sequence cannot advance the authoritative registry again.
	_, err = fixture.registry.Refresh(ctx, "subject-alice", entitlement.RefreshRequest{
		RequestNonce: newNonce(t),
		ActivationID: active.Claims.ActivationID,
		Sequence:     active.Claims.Sequence,
		DeviceID:     device.DeviceID,
	}, fixture.now)
	if licensing.CodeOf(err) != licensing.CodeOnlineReplay {
		t.Fatalf("stale refresh registry code=%q err=%v", licensing.CodeOf(err), err)
	}
}

func TestHandlerRejectsPlainHTTP(t *testing.T) {
	request := httptest.NewRequest("POST", "http://example.test/v1/activations", nil)
	response := httptest.NewRecorder()
	Handler{}.ServeHTTP(response, request)
	if response.Code != 426 {
		t.Fatalf("plain HTTP status=%d body=%s", response.Code, response.Body.String())
	}
}
