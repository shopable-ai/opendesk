package protectedcli

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptloader"
	"opendesk/pkg/scriptpackage"
)

type protectedOnlineRepository struct {
	cache *licensing.OnlineCache
}

func (repository protectedOnlineRepository) LoadOnlineCache(context.Context, scriptpackage.Manifest) (*licensing.OnlineCache, error) {
	return repository.cache, nil
}

type protectedOnlineReplay struct {
	err error
}

func (replay protectedOnlineReplay) Check(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return replay.err
}

func (protectedOnlineReplay) Commit(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return nil
}

func (protectedOnlineReplay) RequiresOnline(context.Context, scriptpackage.Manifest) (bool, error) {
	return true, nil
}

func buildProtectedOnlineCache(t *testing.T, fixture deviceLicenseFixture, state string, sequence uint64, issuedAt, offlineUntil time.Time) *licensing.OnlineCache {
	t.Helper()
	refreshAfter := issuedAt.Add(offlineUntil.Sub(issuedAt) / 2)
	data, err := licensing.BuildOnlineCache(licensing.OnlineCacheClaims{
		Format:                licensing.OnlineCacheFormat,
		FormatVersion:         licensing.OnlineCacheFormatVersion,
		ActivationID:          "activation-device-runtime",
		EntitlementID:         "entitlement-device-runtime",
		PackagePublisherKeyID: fixture.manifest.PublisherKeyID,
		RequestNonce:          base64.StdEncoding.EncodeToString(make([]byte, 32)),
		Sequence:              sequence,
		State:                 state,
		IssuedAt:              licensing.FormatLicenseTime(issuedAt),
		RefreshAfter:          licensing.FormatLicenseTime(refreshAfter),
		OfflineUntil:          licensing.FormatLicenseTime(offlineUntil),
		License:               fixture.validLicense.Claims,
	}, fixture.issuerPrivate)
	if err != nil {
		t.Fatal(err)
	}
	cache, err := licensing.ParseOnlineCache(data)
	if err != nil {
		t.Fatal(err)
	}
	return cache
}

func onlineProtectedLoader(fixture deviceLicenseFixture, cache *licensing.OnlineCache, device licensing.DeviceIdentityProvider, replay licensing.OnlineReplayGuard) scriptloader.ProtectedPackageLoader {
	return scriptloader.ProtectedPackageLoader{
		PublisherKeys: testPublisherProvider{key: fixture.packagePublic},
		LicenseVerifier: licensing.OnlineLicenseVerifier{
			Caches:     protectedOnlineRepository{cache: cache},
			IssuerKeys: protectedIssuerProvider{key: fixture.issuerPublic},
			Device:     device,
			Replay:     replay,
			Now:        func() time.Time { return fixture.now },
		},
		ContentKeys: licensing.DeviceBoundContentKeyProvider{Device: device},
		Now:         func() time.Time { return fixture.now },
	}
}

func TestOnlineEntitlementRunsThroughExistingProtectedRuntime(t *testing.T) {
	fixture := newDeviceLicenseFixture(t)
	cache := buildProtectedOnlineCache(t, fixture, licensing.OnlineStateActive, 1, fixture.now.Add(-time.Minute), fixture.now.Add(30*time.Minute))
	result, _, protection, err := RunProtectedFile(context.Background(), onlineProtectedLoader(fixture, cache, fixture.device, protectedOnlineReplay{}), fixture.packagePath, RunOptions{
		LogDir: t.TempDir(),
		Input:  map[string]any{"authorized": true},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != pkgExecution.ExecutionStatusSucceeded || protection.LicenseDecision != "authorized" {
		t.Fatalf("result=%#v protection=%#v", result, protection)
	}
}

func TestOnlineEntitlementFailuresCauseZeroExecution(t *testing.T) {
	fixture := newDeviceLicenseFixture(t)
	active := buildProtectedOnlineCache(t, fixture, licensing.OnlineStateActive, 1, fixture.now.Add(-time.Minute), fixture.now.Add(30*time.Minute))
	revoked := buildProtectedOnlineCache(t, fixture, licensing.OnlineStateRevoked, 2, fixture.now.Add(-time.Minute), fixture.now.Add(time.Second))
	expired := buildProtectedOnlineCache(t, fixture, licensing.OnlineStateActive, 3, fixture.now.Add(-2*time.Hour), fixture.now.Add(-time.Hour))
	tampered := *active
	tampered.Signature = append([]byte(nil), active.Signature...)
	tampered.Signature[0] ^= 0x80
	wrongDevice := newDeviceLicenseFixture(t).device

	tests := []struct {
		name     string
		loader   scriptloader.Loader
		wantCode string
	}{
		{name: "revoked", loader: onlineProtectedLoader(fixture, revoked, fixture.device, protectedOnlineReplay{}), wantCode: string(licensing.CodeLicenseRevoked)},
		{name: "offline grace expired", loader: onlineProtectedLoader(fixture, expired, fixture.device, protectedOnlineReplay{}), wantCode: string(licensing.CodeOfflineGraceExpired)},
		{name: "cache signature tamper", loader: onlineProtectedLoader(fixture, &tampered, fixture.device, protectedOnlineReplay{}), wantCode: string(licensing.CodeInvalidOnlineSignature)},
		{name: "replay rejected", loader: onlineProtectedLoader(fixture, active, fixture.device, protectedOnlineReplay{err: licensing.NewError(licensing.CodeOnlineReplay, "stale", nil)}), wantCode: string(licensing.CodeOnlineReplay)},
		{name: "wrong device", loader: onlineProtectedLoader(fixture, active, wrongDevice, protectedOnlineReplay{}), wantCode: string(licensing.CodeWrongDevice)},
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
