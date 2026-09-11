package licensecli

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

type fakeOnlineClient struct {
	activate   func(context.Context, []byte, entitlement.ActivateRequest) ([]byte, error)
	refresh    func(context.Context, []byte, entitlement.RefreshRequest) ([]byte, error)
	deactivate func(context.Context, []byte, entitlement.DeactivateRequest) ([]byte, error)
}

func (client *fakeOnlineClient) Activate(ctx context.Context, token []byte, request entitlement.ActivateRequest) ([]byte, error) {
	if client.activate == nil {
		return nil, errors.New("unexpected activate")
	}
	return client.activate(ctx, token, request)
}

func (client *fakeOnlineClient) Refresh(ctx context.Context, token []byte, request entitlement.RefreshRequest) ([]byte, error) {
	if client.refresh == nil {
		return nil, errors.New("unexpected refresh")
	}
	return client.refresh(ctx, token, request)
}

func (client *fakeOnlineClient) Deactivate(ctx context.Context, token []byte, request entitlement.DeactivateRequest) ([]byte, error) {
	if client.deactivate == nil {
		return nil, errors.New("unexpected deactivate")
	}
	return client.deactivate(ctx, token, request)
}

type onlineMutableStore struct {
	values map[string][]byte
}

func newOnlineMutableStore() *onlineMutableStore {
	return &onlineMutableStore{values: map[string][]byte{}}
}

func (store *onlineMutableStore) Load(_ context.Context, name string) ([]byte, error) {
	value, ok := store.values[name]
	if !ok {
		return nil, securestore.ErrNotFound
	}
	return append([]byte(nil), value...), nil
}

func (store *onlineMutableStore) Create(_ context.Context, name string, value []byte) error {
	if _, ok := store.values[name]; ok {
		return securestore.ErrAlreadyExists
	}
	store.values[name] = append([]byte(nil), value...)
	return nil
}

func (store *onlineMutableStore) Save(_ context.Context, name string, value []byte) error {
	store.values[name] = append([]byte(nil), value...)
	return nil
}

type onlineResponseOptions struct {
	nonce      string
	sequence   uint64
	state      string
	identity   deviceidentity.PublicIdentity
	contentKey []byte
	mutate     func(*licensing.OnlineCacheClaims)
}

func buildOnlineResponse(t *testing.T, fixture cliFixture, options onlineResponseOptions) []byte {
	t.Helper()
	identity := options.identity
	if identity.DeviceID == "" {
		var err error
		identity, err = fixture.manager.Ensure(context.Background())
		if err != nil {
			t.Fatal(err)
		}
	}
	contentKey := options.contentKey
	if len(contentKey) == 0 {
		contentKey = bytes.Repeat([]byte{0x42}, scriptpackage.ContentKeySize)
	}
	publicKey, err := identity.ECDHPublicKey()
	if err != nil {
		t.Fatal(err)
	}
	keyEnvelope, err := licensing.WrapContentKey(contentKey, publicKey, licensing.EnvelopeBinding{
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		ProductID:          fixture.packageManifest.ProductID,
		PackageID:          fixture.packageManifest.PackageID,
		ContentKeyID:       fixture.packageManifest.Encryption.KeyID,
		DeviceID:           identity.DeviceID,
		DeviceKeyAlgorithm: identity.KeyAlgorithm,
	})
	if err != nil {
		t.Fatal(err)
	}
	claims := licensing.OnlineCacheClaims{
		Format:                licensing.OnlineCacheFormat,
		FormatVersion:         licensing.OnlineCacheFormatVersion,
		ActivationID:          "activation-cli-test",
		EntitlementID:         "entitlement-cli-test",
		PackagePublisherKeyID: fixture.packageManifest.PublisherKeyID,
		RequestNonce:          options.nonce,
		Sequence:              options.sequence,
		State:                 options.state,
		IssuedAt:              licensing.FormatLicenseTime(fixture.now.Add(-time.Minute)),
		RefreshAfter:          licensing.FormatLicenseTime(fixture.now.Add(30 * time.Minute)),
		OfflineUntil:          licensing.FormatLicenseTime(fixture.now.Add(time.Hour)),
		License: licensing.LicenseClaims{
			Format:             licensing.OfflineLicenseFormat,
			FormatVersion:      licensing.OfflineLicenseFormatVersion,
			LicenseID:          "online-license-cli-test",
			PublisherID:        fixture.packageManifest.PublisherID,
			PublisherKeyID:     "issuer-key-cli-test",
			SubjectID:          "customer-cli-test",
			DeviceID:           identity.DeviceID,
			DeviceKeyAlgorithm: identity.KeyAlgorithm,
			ProductID:          fixture.packageManifest.ProductID,
			PackageID:          fixture.packageManifest.PackageID,
			ContentKeyID:       fixture.packageManifest.Encryption.KeyID,
			IssuedAt:           licensing.FormatLicenseTime(fixture.now.Add(-time.Minute)),
			ExpiresAt:          licensing.FormatLicenseTime(fixture.now.Add(2 * time.Hour)),
			KeyEnvelope:        keyEnvelope,
		},
	}
	if options.mutate != nil {
		options.mutate(&claims)
	}
	data, err := licensing.BuildOnlineCache(claims, ed25519.PrivateKey(mustReadFile(t, fixture.issuerPrivate)))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func onlineDependencies(fixture cliFixture, client entitlement.Client, replay licensing.OnlineReplayGuard) Dependencies {
	dependencies := fixture.dependencies()
	dependencies.NewOnlineClient = func(string, []byte) (entitlement.Client, error) { return client, nil }
	dependencies.NewReplayGuard = func() (licensing.OnlineReplayGuard, error) { return replay, nil }
	return dependencies
}

func executeOnlineForTest(t *testing.T, dependencies Dependencies, args ...string) (int, string) {
	t.Helper()
	var stdout bytes.Buffer
	code := ExecuteWithDependencies(args, &stdout, &bytes.Buffer{}, dependencies)
	return code, stdout.String()
}

func requireSafeOnlineOutput(t *testing.T, output, token string) {
	t.Helper()
	for _, forbidden := range []string{token, "wrappedContentKey", "keyEnvelope", strings.Repeat("42", scriptpackage.ContentKeySize)} {
		if forbidden != "" && strings.Contains(output, forbidden) {
			t.Fatalf("online command disclosed protected material %q: %s", forbidden, output)
		}
	}
	var value any
	if err := json.Unmarshal([]byte(output), &value); err != nil {
		t.Fatalf("online command did not emit one JSON value: %v: %s", err, output)
	}
}

func onlineTokenFile(t *testing.T, token string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "activation.token")
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func activateArgs(fixture cliFixture, tokenPath string) []string {
	return []string{
		"license", "activate", fixture.packagePath,
		"--service", "https://license.test",
		"--token-file", tokenPath,
		"--package-publisher-key", fixture.packagePublic,
		"--issuer-key", fixture.issuerPublic,
	}
}

func TestActivateForwardsOptionalCAFileToOnlineClient(t *testing.T) {
	fixture := newCLIFixture(t)
	tokenPath := onlineTokenFile(t, "online-ca-test-token")
	caData := []byte("-----BEGIN CERTIFICATE-----\nTEST-PRIVATE-CA\n-----END CERTIFICATE-----\n")
	caPath := filepath.Join(t.TempDir(), "private-ca.pem")
	if err := os.WriteFile(caPath, caData, 0o600); err != nil {
		t.Fatal(err)
	}
	replay := licensing.SecureOnlineReplayGuard{Store: newOnlineMutableStore()}
	client := &fakeOnlineClient{activate: func(_ context.Context, _ []byte, request entitlement.ActivateRequest) ([]byte, error) {
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
		}), nil
	}}
	dependencies := onlineDependencies(fixture, client, replay)
	var receivedService string
	var receivedRoots []byte
	dependencies.NewOnlineClient = func(service string, additionalRoots []byte) (entitlement.Client, error) {
		receivedService = service
		receivedRoots = append([]byte(nil), additionalRoots...)
		return client, nil
	}
	args := append(activateArgs(fixture, tokenPath), "--ca-file", caPath)
	code, output := executeOnlineForTest(t, dependencies, args...)
	if code != 0 {
		t.Fatalf("activate code=%d output=%s", code, output)
	}
	if receivedService != "https://license.test" || !bytes.Equal(receivedRoots, caData) {
		t.Fatalf("client service=%q roots=%q", receivedService, receivedRoots)
	}
}

func TestOnlineLicenseLifecycleUsesSignedCacheAndSafeJSON(t *testing.T) {
	fixture := newCLIFixture(t)
	token := "online-cli-secret-token"
	tokenPath := onlineTokenFile(t, token)
	secureState := newOnlineMutableStore()
	replay := licensing.SecureOnlineReplayGuard{Store: secureState}
	refreshSequence := uint64(2)
	refreshNonceMismatch := false
	client := &fakeOnlineClient{}
	client.activate = func(_ context.Context, received []byte, request entitlement.ActivateRequest) ([]byte, error) {
		if string(received) != token || request.Package.PackageID != fixture.packageManifest.PackageID || request.Device.DeviceID == "" {
			t.Fatalf("activation request = %#v token=%q", request, received)
		}
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
		}), nil
	}
	client.refresh = func(_ context.Context, received []byte, request entitlement.RefreshRequest) ([]byte, error) {
		if string(received) != token || request.ActivationID != "activation-cli-test" || request.DeviceID == "" {
			t.Fatalf("refresh request = %#v token=%q", request, received)
		}
		nonce := request.RequestNonce
		if refreshNonceMismatch {
			nonce = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x91}, 32))
		}
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: nonce, sequence: refreshSequence, state: licensing.OnlineStateActive,
		}), nil
	}
	client.deactivate = func(_ context.Context, received []byte, request entitlement.DeactivateRequest) ([]byte, error) {
		if string(received) != token || request.Sequence != 2 || request.ActivationID != "activation-cli-test" {
			t.Fatalf("deactivate request = %#v token=%q", request, received)
		}
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: request.RequestNonce, sequence: 3, state: licensing.OnlineStateRevoked,
		}), nil
	}
	dependencies := onlineDependencies(fixture, client, replay)

	code, output := executeOnlineForTest(t, dependencies, activateArgs(fixture, tokenPath)...)
	if code != 0 || !strings.Contains(output, `"command":"license.activate"`) || !strings.Contains(output, `"authorized":true`) {
		t.Fatalf("activate code=%d output=%s", code, output)
	}
	requireSafeOnlineOutput(t, output, token)

	code, output = executeOnlineForTest(t, dependencies, "license", "status", fixture.packagePath)
	if code != 0 || !strings.Contains(output, `"authorized":true`) || !strings.Contains(output, `"sequence":1`) {
		t.Fatalf("status code=%d output=%s", code, output)
	}
	requireSafeOnlineOutput(t, output, token)

	code, output = executeOnlineForTest(t, dependencies,
		"license", "refresh", fixture.packagePath, "--service", "https://license.test", "--token-file", tokenPath)
	if code != 0 || !strings.Contains(output, `"sequence":2`) || !strings.Contains(output, `"updated":true`) {
		t.Fatalf("refresh code=%d output=%s", code, output)
	}
	requireSafeOnlineOutput(t, output, token)

	refreshNonceMismatch = true
	refreshSequence = 3
	code, output = executeOnlineForTest(t, dependencies,
		"license", "refresh", fixture.packagePath, "--service", "https://license.test", "--token-file", tokenPath)
	if code == 0 || !strings.Contains(output, `"code":"entitlement_replay_detected"`) {
		t.Fatalf("nonce replay code=%d output=%s", code, output)
	}
	refreshNonceMismatch = false
	refreshSequence = 2
	code, output = executeOnlineForTest(t, dependencies,
		"license", "refresh", fixture.packagePath, "--service", "https://license.test", "--token-file", tokenPath)
	if code == 0 || !strings.Contains(output, `"code":"entitlement_replay_detected"`) {
		t.Fatalf("sequence replay code=%d output=%s", code, output)
	}
	installed, err := (licensing.FileInstallationStore{Root: fixture.root}).LoadOnlineCache(context.Background(), fixture.packageManifest)
	if err != nil || installed.Claims.Sequence != 2 {
		t.Fatalf("installed cache after rejected responses = %#v err=%v", installed, err)
	}

	code, output = executeOnlineForTest(t, dependencies,
		"license", "deactivate", fixture.packagePath, "--service", "https://license.test", "--token-file", tokenPath)
	if code != 0 || !strings.Contains(output, `"state":"revoked"`) || !strings.Contains(output, `"authorized":false`) {
		t.Fatalf("deactivate code=%d output=%s", code, output)
	}
	requireSafeOnlineOutput(t, output, token)
	code, output = executeOnlineForTest(t, dependencies, "license", "status", fixture.packagePath)
	if code != 0 || !strings.Contains(output, `"state":"revoked"`) || !strings.Contains(output, `"authorized":false`) {
		t.Fatalf("revoked status code=%d output=%s", code, output)
	}
}

func TestActivateRejectsUntrustedResponsesBeforeInstallation(t *testing.T) {
	tests := []struct {
		name   string
		change func(*testing.T, cliFixture, entitlement.ActivateRequest) []byte
		code   string
	}{
		{
			name: "nonce mismatch",
			change: func(t *testing.T, fixture cliFixture, request entitlement.ActivateRequest) []byte {
				return buildOnlineResponse(t, fixture, onlineResponseOptions{
					nonce: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x63}, 32)), sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
				})
			},
			code: "entitlement_replay_detected",
		},
		{
			name: "invalid issuer signature",
			change: func(t *testing.T, fixture cliFixture, request entitlement.ActivateRequest) []byte {
				data := buildOnlineResponse(t, fixture, onlineResponseOptions{
					nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
				})
				var outer map[string]any
				if err := json.Unmarshal(data, &outer); err != nil {
					t.Fatal(err)
				}
				outer["signature"] = base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x7a}, ed25519.SignatureSize))
				data, _ = json.Marshal(outer)
				return data
			},
			code: "invalid_entitlement_signature",
		},
		{
			name: "wrong device",
			change: func(t *testing.T, fixture cliFixture, request entitlement.ActivateRequest) []byte {
				other := deviceidentity.NewManager(&commandTestStore{})
				identity, err := other.Ensure(context.Background())
				if err != nil {
					t.Fatal(err)
				}
				return buildOnlineResponse(t, fixture, onlineResponseOptions{
					nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: identity,
				})
			},
			code: "wrong_device",
		},
		{
			name: "wrong package",
			change: func(t *testing.T, fixture cliFixture, request entitlement.ActivateRequest) []byte {
				return buildOnlineResponse(t, fixture, onlineResponseOptions{
					nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
					mutate: func(claims *licensing.OnlineCacheClaims) { claims.License.PackageID = "different-package" },
				})
			},
			code: "license_denied",
		},
		{
			name: "wrong content key",
			change: func(t *testing.T, fixture cliFixture, request entitlement.ActivateRequest) []byte {
				return buildOnlineResponse(t, fixture, onlineResponseOptions{
					nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
					contentKey: bytes.Repeat([]byte{0x19}, scriptpackage.ContentKeySize),
				})
			},
			code: "content_key_unavailable",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			fixture := newCLIFixture(t)
			tokenPath := onlineTokenFile(t, "failure-secret")
			replay := licensing.SecureOnlineReplayGuard{Store: newOnlineMutableStore()}
			client := &fakeOnlineClient{activate: func(_ context.Context, _ []byte, request entitlement.ActivateRequest) ([]byte, error) {
				return test.change(t, fixture, request), nil
			}}
			dependencies := onlineDependencies(fixture, client, replay)
			code, output := executeOnlineForTest(t, dependencies, activateArgs(fixture, tokenPath)...)
			if code == 0 || !strings.Contains(output, `"code":"`+test.code+`"`) {
				t.Fatalf("activate code=%d output=%s", code, output)
			}
			if _, err := (licensing.FileInstallationStore{Root: fixture.root}).LoadOnlineCache(context.Background(), fixture.packageManifest); licensing.CodeOf(err) != licensing.CodeLicenseRequired {
				t.Fatalf("rejected response installed cache: %v", err)
			}
		})
	}
}

type failingCommitReplay struct{}

func (failingCommitReplay) Check(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return licensing.NewError(licensing.CodeOnlineReplay, "cache has no committed watermark", nil)
}

func (failingCommitReplay) Commit(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return licensing.NewError(licensing.CodeOnlineReplay, "cannot commit watermark", nil)
}

func (failingCommitReplay) RequiresOnline(context.Context, scriptpackage.Manifest) (bool, error) {
	return true, nil
}

func TestActivateCommitFailureLeavesInstalledCacheFailClosed(t *testing.T) {
	fixture := newCLIFixture(t)
	tokenPath := onlineTokenFile(t, "commit-failure-secret")
	client := &fakeOnlineClient{activate: func(_ context.Context, _ []byte, request entitlement.ActivateRequest) ([]byte, error) {
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
		}), nil
	}}
	dependencies := onlineDependencies(fixture, client, failingCommitReplay{})
	code, output := executeOnlineForTest(t, dependencies, activateArgs(fixture, tokenPath)...)
	if code == 0 || !strings.Contains(output, `"code":"entitlement_replay_detected"`) {
		t.Fatalf("activate code=%d output=%s", code, output)
	}
	if _, err := (licensing.FileInstallationStore{Root: fixture.root}).LoadOnlineCache(context.Background(), fixture.packageManifest); err != nil {
		t.Fatalf("validated cache was not installed before commit: %v", err)
	}
	code, output = executeOnlineForTest(t, dependencies, "license", "status", fixture.packagePath)
	if code == 0 || !strings.Contains(output, `"code":"entitlement_replay_detected"`) {
		t.Fatalf("uncommitted cache did not fail closed: code=%d output=%s", code, output)
	}
}

func TestStatusRejectsDeletedActivatedCacheInsteadOfFallingBack(t *testing.T) {
	fixture := newCLIFixture(t)
	tokenPath := onlineTokenFile(t, "deleted-cache-secret")
	replay := licensing.SecureOnlineReplayGuard{Store: newOnlineMutableStore()}
	client := &fakeOnlineClient{activate: func(_ context.Context, _ []byte, request entitlement.ActivateRequest) ([]byte, error) {
		return buildOnlineResponse(t, fixture, onlineResponseOptions{
			nonce: request.RequestNonce, sequence: 1, state: licensing.OnlineStateActive, identity: request.Device,
		}), nil
	}}
	dependencies := onlineDependencies(fixture, client, replay)
	code, output := executeOnlineForTest(t, dependencies, activateArgs(fixture, tokenPath)...)
	if code != 0 {
		t.Fatalf("activate code=%d output=%s", code, output)
	}
	directory := filepath.Join(fixture.root, "online-entitlements")
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 1 {
		t.Fatalf("online cache directory entries=%d err=%v", len(entries), err)
	}
	if err := os.Remove(filepath.Join(directory, entries[0].Name())); err != nil {
		t.Fatal(err)
	}
	code, output = executeOnlineForTest(t, dependencies, "license", "status", fixture.packagePath)
	if code == 0 || !strings.Contains(output, `"code":"invalid_entitlement_cache"`) {
		t.Fatalf("deleted activated cache did not fail closed: code=%d output=%s", code, output)
	}
}
