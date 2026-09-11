package licensing

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type onlineEntitlementFixture struct {
	now        time.Time
	manager    *deviceidentity.Manager
	identity   deviceidentity.PublicIdentity
	manifest   scriptpackage.Manifest
	publicKey  ed25519.PublicKey
	privateKey ed25519.PrivateKey
	claims     OnlineCacheClaims
	cache      *OnlineCache
}

func newOnlineEntitlementFixture(t *testing.T) onlineEntitlementFixture {
	t.Helper()
	now := time.Date(2026, 9, 11, 4, 0, 0, 0, time.UTC)
	manager, identity := testDevice(t)
	contentKey, err := scriptpackage.GenerateContentKey()
	if err != nil {
		t.Fatal(err)
	}
	licenseClaims := testClaims(t, manager, identity, contentKey, now.Add(-2*time.Minute), now.Add(2*time.Hour))
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	manifest := scriptpackage.Manifest{
		PublisherID:    licenseClaims.PublisherID,
		PublisherKeyID: "package-key-test",
		ProductID:      licenseClaims.ProductID,
		PackageID:      licenseClaims.PackageID,
		Encryption:     scriptpackage.EncryptionManifest{KeyID: licenseClaims.ContentKeyID},
	}
	claims := OnlineCacheClaims{
		Format:                OnlineCacheFormat,
		FormatVersion:         OnlineCacheFormatVersion,
		ActivationID:          "activation-test",
		EntitlementID:         "entitlement-test",
		PackagePublisherKeyID: manifest.PublisherKeyID,
		RequestNonce:          base64.StdEncoding.EncodeToString(make([]byte, 32)),
		Sequence:              1,
		State:                 OnlineStateActive,
		IssuedAt:              FormatLicenseTime(now.Add(-time.Minute)),
		RefreshAfter:          FormatLicenseTime(now.Add(15 * time.Minute)),
		OfflineUntil:          FormatLicenseTime(now.Add(time.Hour)),
		License:               licenseClaims,
	}
	cache := buildAndParseOnlineCache(t, claims, privateKey)
	return onlineEntitlementFixture{
		now:        now,
		manager:    manager,
		identity:   identity,
		manifest:   manifest,
		publicKey:  publicKey,
		privateKey: privateKey,
		claims:     claims,
		cache:      cache,
	}
}

func buildAndParseOnlineCache(t *testing.T, claims OnlineCacheClaims, privateKey ed25519.PrivateKey) *OnlineCache {
	t.Helper()
	data, err := BuildOnlineCache(claims, privateKey)
	if err != nil {
		t.Fatal(err)
	}
	cache, err := ParseOnlineCache(data)
	if err != nil {
		t.Fatal(err)
	}
	return cache
}

type memoryMutableStore struct {
	values     map[string][]byte
	loadErr    error
	saveErr    error
	saveCalls  int
	failOnSave int
}

func newMemoryMutableStore() *memoryMutableStore {
	return &memoryMutableStore{values: map[string][]byte{}}
}

func (store *memoryMutableStore) Load(_ context.Context, name string) ([]byte, error) {
	if store.loadErr != nil {
		return nil, store.loadErr
	}
	value, ok := store.values[name]
	if !ok {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), value...), nil
}

func (store *memoryMutableStore) Create(_ context.Context, name string, value []byte) error {
	if _, exists := store.values[name]; exists {
		return securestore.ErrAlreadyExists
	}
	store.values[name] = append([]byte(nil), value...)
	return nil
}

func (store *memoryMutableStore) Save(_ context.Context, name string, value []byte) error {
	store.saveCalls++
	if store.saveErr != nil && (store.failOnSave == 0 || store.saveCalls == store.failOnSave) {
		return store.saveErr
	}
	store.values[name] = append([]byte(nil), value...)
	return nil
}

type memoryOnlineCacheRepository struct {
	cache *OnlineCache
	err   error
}

func (repository memoryOnlineCacheRepository) LoadOnlineCache(context.Context, scriptpackage.Manifest) (*OnlineCache, error) {
	return repository.cache, repository.err
}

type countingLicenseVerifier struct {
	calls       int
	entitlement *Entitlement
	err         error
}

func (verifier *countingLicenseVerifier) Verify(context.Context, scriptpackage.Manifest) (*Entitlement, error) {
	verifier.calls++
	return verifier.entitlement, verifier.err
}

func onlineVerifier(fixture onlineEntitlementFixture, cache *OnlineCache, replay OnlineReplayGuard, current time.Time) OnlineLicenseVerifier {
	return OnlineLicenseVerifier{
		Caches:     memoryOnlineCacheRepository{cache: cache},
		IssuerKeys: memoryIssuerKeys{key: fixture.publicKey},
		Device:     fixture.manager,
		Replay:     replay,
		Now:        func() time.Time { return current },
	}
}

func TestOnlineCacheStrictSignatureTamperAndRequestBinding(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	data, err := BuildOnlineCache(fixture.claims, fixture.privateKey)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseOnlineCache(data)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyOnlineCache(parsed, fixture.publicKey); err != nil {
		t.Fatal(err)
	}
	if err := VerifyOnlineCacheForRequest(parsed, fixture.publicKey, fixture.claims.RequestNonce); err != nil {
		t.Fatal(err)
	}
	otherNonce := base64.StdEncoding.EncodeToString(bytesOf(0x7f, 32))
	if err := VerifyOnlineCacheForRequest(parsed, fixture.publicKey, otherNonce); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("nonce replay error = %v", err)
	}

	wrongPublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyOnlineCache(parsed, wrongPublic); CodeOf(err) != CodeInvalidOnlineSignature {
		t.Fatalf("wrong-key error = %v", err)
	}

	tampered := strings.Replace(string(data), `"activationId":"activation-test"`, `"activationId":"activation-other"`, 1)
	tamperedCache, err := ParseOnlineCache([]byte(tampered))
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyOnlineCache(tamperedCache, fixture.publicKey); CodeOf(err) != CodeInvalidOnlineSignature {
		t.Fatalf("tamper error = %v", err)
	}

	duplicate := strings.Replace(string(data), `"activationId":"activation-test"`, `"activationId":"activation-test","activationId":"activation-other"`, 1)
	if _, err := ParseOnlineCache([]byte(duplicate)); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("duplicate-key error = %v", err)
	}
	unknown := strings.Replace(string(data), `"activationId":"activation-test"`, `"activationId":"activation-test","unexpected":true`, 1)
	if _, err := ParseOnlineCache([]byte(unknown)); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("unknown-field error = %v", err)
	}
	if _, err := ParseOnlineCache(append(append([]byte(nil), data...), []byte(`{}`)...)); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("trailing-value error = %v", err)
	}
}

func TestOnlineCacheGraceBoundaryOverlongAndWrongDevice(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	replay := SecureOnlineReplayGuard{Store: newMemoryMutableStore()}
	if err := replay.Commit(context.Background(), fixture.manifest, fixture.cache); err != nil {
		t.Fatal(err)
	}
	offlineUntil := fixture.claims.OfflineExpiryTime()
	if _, err := onlineVerifier(fixture, fixture.cache, replay, offlineUntil.Add(-time.Nanosecond)).Verify(context.Background(), fixture.manifest); err != nil {
		t.Fatalf("last instant inside grace was rejected: %v", err)
	}
	if _, err := onlineVerifier(fixture, fixture.cache, replay, offlineUntil).Verify(context.Background(), fixture.manifest); CodeOf(err) != CodeOfflineGraceExpired {
		t.Fatalf("deadline error = %v", err)
	}
	revokedClaims := fixture.claims
	revokedClaims.Sequence = 2
	revokedClaims.State = OnlineStateRevoked
	revokedClaims.RequestNonce = base64.StdEncoding.EncodeToString(bytesOf(0x22, 32))
	revoked := buildAndParseOnlineCache(t, revokedClaims, fixture.privateKey)
	revokedReplay := SecureOnlineReplayGuard{Store: newMemoryMutableStore()}
	if err := revokedReplay.Commit(context.Background(), fixture.manifest, revoked); err != nil {
		t.Fatal(err)
	}
	if _, err := onlineVerifier(fixture, revoked, revokedReplay, fixture.now).Verify(context.Background(), fixture.manifest); CodeOf(err) != CodeLicenseRevoked {
		t.Fatalf("revoked cache error = %v", err)
	}

	wrongDevice, _ := testDevice(t)
	wrongVerifier := onlineVerifier(fixture, fixture.cache, replay, fixture.now)
	wrongVerifier.Device = wrongDevice
	if _, err := wrongVerifier.Verify(context.Background(), fixture.manifest); CodeOf(err) != CodeWrongDevice {
		t.Fatalf("wrong-device error = %v", err)
	}

	exact := fixture.claims
	exact.IssuedAt = FormatLicenseTime(fixture.now)
	exact.RefreshAfter = exact.IssuedAt
	exact.OfflineUntil = FormatLicenseTime(fixture.now.Add(MaxOfflineGrace))
	exact.License.IssuedAt = FormatLicenseTime(fixture.now.Add(-time.Minute))
	exact.License.ExpiresAt = exact.OfflineUntil
	if _, err := BuildOnlineCache(exact, fixture.privateKey); err != nil {
		t.Fatalf("exact maximum offline grace was rejected: %v", err)
	}
	overlong := exact
	overlong.OfflineUntil = FormatLicenseTime(fixture.now.Add(MaxOfflineGrace + time.Second))
	overlong.License.ExpiresAt = overlong.OfflineUntil
	if _, err := BuildOnlineCache(overlong, fixture.privateKey); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("overlong grace error = %v", err)
	}
}

func TestOnlineReplayWatermarkRejectsRollbackReuseAndRevokedResurrection(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	store := newMemoryMutableStore()
	guard := SecureOnlineReplayGuard{Store: store}
	ctx := context.Background()
	if err := guard.Commit(ctx, fixture.manifest, fixture.cache); err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(ctx, fixture.manifest, fixture.cache); err != nil {
		t.Fatal(err)
	}
	required, err := guard.RequiresOnline(ctx, fixture.manifest)
	if err != nil || !required {
		t.Fatalf("requiresOnline=%v err=%v", required, err)
	}

	secondClaims := fixture.claims
	secondClaims.Sequence = 2
	secondClaims.RequestNonce = base64.StdEncoding.EncodeToString(bytesOf(0x02, 32))
	second := buildAndParseOnlineCache(t, secondClaims, fixture.privateKey)
	if err := guard.Commit(ctx, fixture.manifest, second); err != nil {
		t.Fatal(err)
	}
	if err := guard.Check(ctx, fixture.manifest, fixture.cache); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("rollback check error = %v", err)
	}
	if err := guard.Commit(ctx, fixture.manifest, fixture.cache); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("rollback commit error = %v", err)
	}

	reusedClaims := secondClaims
	reusedClaims.RequestNonce = base64.StdEncoding.EncodeToString(bytesOf(0x03, 32))
	reused := buildAndParseOnlineCache(t, reusedClaims, fixture.privateKey)
	if err := guard.Commit(ctx, fixture.manifest, reused); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("sequence reuse error = %v", err)
	}

	revokedClaims := secondClaims
	revokedClaims.Sequence = 3
	revokedClaims.State = OnlineStateRevoked
	revokedClaims.RequestNonce = base64.StdEncoding.EncodeToString(bytesOf(0x04, 32))
	revoked := buildAndParseOnlineCache(t, revokedClaims, fixture.privateKey)
	if err := guard.Commit(ctx, fixture.manifest, revoked); err != nil {
		t.Fatal(err)
	}
	resurrectedClaims := revokedClaims
	resurrectedClaims.Sequence = 4
	resurrectedClaims.State = OnlineStateActive
	resurrectedClaims.RequestNonce = base64.StdEncoding.EncodeToString(bytesOf(0x05, 32))
	resurrected := buildAndParseOnlineCache(t, resurrectedClaims, fixture.privateKey)
	if err := guard.Commit(ctx, fixture.manifest, resurrected); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("revoked resurrection error = %v", err)
	}
}

func TestOnlineCacheDeletionRemainsAuthoritativeAndDoesNotFallback(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	store := newMemoryMutableStore()
	guard := SecureOnlineReplayGuard{Store: store}
	if err := guard.Commit(context.Background(), fixture.manifest, fixture.cache); err != nil {
		t.Fatal(err)
	}
	missing := NewError(CodeLicenseRequired, "online cache missing", os.ErrNotExist)
	online := OnlineLicenseVerifier{
		Caches:     memoryOnlineCacheRepository{err: missing},
		IssuerKeys: memoryIssuerKeys{key: fixture.publicKey},
		Device:     fixture.manager,
		Replay:     guard,
		Now:        func() time.Time { return fixture.now },
	}
	offline := &countingLicenseVerifier{entitlement: &Entitlement{LicenseID: "offline-would-authorize"}}
	combined := PreferOnlineLicenseVerifier{Online: online, Offline: offline}
	if _, err := combined.Verify(context.Background(), fixture.manifest); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("deleted authoritative cache error = %v", err)
	}
	if offline.calls != 0 {
		t.Fatalf("offline verifier called %d times after online cache deletion", offline.calls)
	}

	freshGuard := SecureOnlineReplayGuard{Store: newMemoryMutableStore()}
	freshOnline := online
	freshOnline.Replay = freshGuard
	freshOffline := &countingLicenseVerifier{entitlement: &Entitlement{LicenseID: "offline-authorized"}}
	freshCombined := PreferOnlineLicenseVerifier{Online: freshOnline, Offline: freshOffline}
	entitlement, err := freshCombined.Verify(context.Background(), fixture.manifest)
	if err != nil || entitlement == nil || entitlement.LicenseID != "offline-authorized" {
		t.Fatalf("fresh P1 fallback entitlement=%#v err=%v", entitlement, err)
	}
	if freshOffline.calls != 1 {
		t.Fatalf("fresh offline verifier calls = %d", freshOffline.calls)
	}
}

func TestOnlineReplayCommitFailureLeavesAuthoritativeMarkerFailClosed(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	store := newMemoryMutableStore()
	guard := SecureOnlineReplayGuard{Store: store}
	store.saveErr = errors.New("secure state unavailable")
	store.failOnSave = 2
	if err := guard.Commit(context.Background(), fixture.manifest, fixture.cache); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("commit failure error = %v", err)
	}
	required, err := guard.RequiresOnline(context.Background(), fixture.manifest)
	if err != nil || !required {
		t.Fatalf("marker lost after partial commit: required=%v err=%v", required, err)
	}
	if err := guard.Check(context.Background(), fixture.manifest, fixture.cache); CodeOf(err) != CodeOnlineReplay {
		t.Fatalf("partially committed cache check error = %v", err)
	}
}

func bytesOf(value byte, size int) []byte {
	result := make([]byte, size)
	for index := range result {
		result[index] = value
	}
	return result
}

func TestOnlineCacheRejectsMalformedRawEnvelope(t *testing.T) {
	fixture := newOnlineEntitlementFixture(t)
	data, err := BuildOnlineCache(fixture.claims, fixture.privateKey)
	if err != nil {
		t.Fatal(err)
	}
	var outer map[string]json.RawMessage
	if err := json.Unmarshal(data, &outer); err != nil {
		t.Fatal(err)
	}
	outer["signature"] = json.RawMessage(`"not-base64"`)
	malformed, err := json.Marshal(outer)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseOnlineCache(malformed); CodeOf(err) != CodeInvalidOnlineCache {
		t.Fatalf("malformed signature error = %v", err)
	}
}
