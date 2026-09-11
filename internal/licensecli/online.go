package licensecli

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"flag"
	"io"
	"strings"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type fixedOnlineCacheRepository struct {
	cache *licensing.OnlineCache
}

func (repository fixedOnlineCacheRepository) LoadOnlineCache(context.Context, scriptpackage.Manifest) (*licensing.OnlineCache, error) {
	return repository.cache, nil
}

type fixedOnlineIssuerKeyProvider struct {
	key ed25519.PublicKey
}

func (provider fixedOnlineIssuerKeyProvider) ResolveLicenseIssuerKey(context.Context, licensing.LicenseClaims) (ed25519.PublicKey, error) {
	return append(ed25519.PublicKey(nil), provider.key...), nil
}

// acceptedOnlineResponseReplay is used only while validating a fresh response
// before it has a durable replay watermark. The caller has already verified
// the response signature and request nonce; production Runtime verification
// always uses the platform-backed replay guard.
type acceptedOnlineResponseReplay struct{}

func (acceptedOnlineResponseReplay) Check(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return nil
}

func (acceptedOnlineResponseReplay) Commit(context.Context, scriptpackage.Manifest, *licensing.OnlineCache) error {
	return nil
}

func (acceptedOnlineResponseReplay) RequiresOnline(context.Context, scriptpackage.Manifest) (bool, error) {
	return true, nil
}

type installedOnlineState struct {
	protectedPackage *scriptpackage.Package
	store            licensing.FileInstallationStore
	device           licensing.DeviceIdentityProvider
	identity         deviceidentity.PublicIdentity
	replay           licensing.OnlineReplayGuard
	cache            *licensing.OnlineCache
	issuerKey        ed25519.PublicKey
}

func activate(args []string, stdout io.Writer, dependencies Dependencies) int {
	const command = "license.activate"
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "activate requires one recipe.odpkg path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	service := fs.String("service", "", "")
	tokenPath := fs.String("token-file", "", "")
	caPath := fs.String("ca-file", "", "")
	packageKeyPath := fs.String("package-publisher-key", "", "")
	issuerKeyPath := fs.String("issuer-key", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid license activate arguments", 2)
	}
	for name, value := range map[string]string{
		"--service":               *service,
		"--token-file":            *tokenPath,
		"--package-publisher-key": *packageKeyPath,
		"--issuer-key":            *issuerKeyPath,
	} {
		if strings.TrimSpace(value) == "" {
			return writeError(stdout, command, "invalid_argument", name+" is required", 2)
		}
	}

	ctx := context.Background()
	protectedPackage, err := readLicensedPackage(packagePath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	packageKey, err := readPublicKey(*packageKeyPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if err := scriptpackage.VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, packageKey); err != nil {
		return writeCommandError(stdout, command, err)
	}
	issuerKey, err := readPublicKey(*issuerKeyPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	device, err := newDevice(dependencies)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	identity, err := device.Ensure(ctx)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	token, err := readOnlineToken(*tokenPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	defer zero(token)
	client, err := newOnlineClient(dependencies, *service, *caPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	nonce, err := entitlement.NewRequestNonce()
	if err != nil {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeServiceUnavailable, "generate activation request nonce", err))
	}
	response, err := client.Activate(ctx, token, entitlement.ActivateRequest{
		RequestNonce: nonce,
		Device:       identity,
		Package:      onlinePackageBinding(protectedPackage),
	})
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	cache, err := verifyOnlineResponse(response, protectedPackage.Manifest, identity, issuerKey, nonce)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if cache.Claims.State != licensing.OnlineStateActive {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeLicenseRevoked, "activation returned a revoked entitlement", nil))
	}
	if err := validateActiveOnlineContentKey(ctx, protectedPackage, cache, issuerKey, device, now(dependencies)); err != nil {
		return writeCommandError(stdout, command, err)
	}
	root, err := installationRoot(dependencies)
	if err != nil {
		return writeError(stdout, command, "internal_error", err.Error(), 1)
	}
	store := licensing.FileInstallationStore{Root: root}
	if err := store.InstallOnlineCache(protectedPackage.Manifest, response, packageKey, issuerKey); err != nil {
		return writeCommandError(stdout, command, err)
	}
	replay, err := newReplayGuard(dependencies)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	// Installation precedes the activation marker. Any interruption or commit
	// failure leaves the cache unusable instead of falling back to P1.
	if err := replay.Commit(ctx, protectedPackage.Manifest, cache); err != nil {
		return writeCommandError(stdout, command, err)
	}
	result := licensing.OnlineCacheSafeResult(cache)
	result["authorized"] = true
	result["installed"] = true
	result["packageVerified"] = true
	result["signatureVerified"] = true
	return writeSuccess(stdout, command, result)
}

func onlineStatus(args []string, stdout io.Writer, dependencies Dependencies) int {
	const command = "license.status"
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", "status requires exactly one recipe.odpkg path", 2)
	}
	state, err := loadInstalledOnlineState(context.Background(), args[0], dependencies)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	current := now(dependencies)
	if current.Before(state.cache.Claims.IssuedTime()) || current.Before(state.cache.Claims.License.IssuedTime()) {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeLicenseNotYetValid, "online entitlement is not yet valid", nil))
	}
	authorized := state.cache.Claims.State == licensing.OnlineStateActive &&
		current.Before(state.cache.Claims.OfflineExpiryTime()) &&
		current.Before(state.cache.Claims.License.ExpiryTime())
	result := licensing.OnlineCacheSafeResult(state.cache)
	result["authorized"] = authorized
	result["refreshRequired"] = !current.Before(state.cache.Claims.RefreshTime())
	result["offlineGraceExpired"] = !current.Before(state.cache.Claims.OfflineExpiryTime())
	return writeSuccess(stdout, command, result)
}

func refresh(args []string, stdout io.Writer, dependencies Dependencies) int {
	return updateOnlineEntitlement(args, stdout, dependencies, false)
}

func deactivate(args []string, stdout io.Writer, dependencies Dependencies) int {
	return updateOnlineEntitlement(args, stdout, dependencies, true)
}

func updateOnlineEntitlement(args []string, stdout io.Writer, dependencies Dependencies, deactivating bool) int {
	command := "license.refresh"
	verb := "refresh"
	if deactivating {
		command = "license.deactivate"
		verb = "deactivate"
	}
	if len(args) == 0 || strings.HasPrefix(args[0], "-") {
		return writeError(stdout, command, "invalid_argument", verb+" requires one recipe.odpkg path", 2)
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	service := fs.String("service", "", "")
	tokenPath := fs.String("token-file", "", "")
	caPath := fs.String("ca-file", "", "")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return writeError(stdout, command, "invalid_argument", "invalid license "+verb+" arguments", 2)
	}
	if strings.TrimSpace(*service) == "" {
		return writeError(stdout, command, "invalid_argument", "--service is required", 2)
	}
	if strings.TrimSpace(*tokenPath) == "" {
		return writeError(stdout, command, "invalid_argument", "--token-file is required", 2)
	}

	ctx := context.Background()
	state, err := loadInstalledOnlineState(ctx, packagePath, dependencies)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if state.cache.Claims.State == licensing.OnlineStateRevoked {
		if !deactivating {
			return writeCommandError(stdout, command, licensing.NewError(licensing.CodeLicenseRevoked, "online entitlement has been revoked", nil))
		}
		result := licensing.OnlineCacheSafeResult(state.cache)
		result["authorized"] = false
		result["deactivated"] = true
		result["unchanged"] = true
		return writeSuccess(stdout, command, result)
	}
	token, err := readOnlineToken(*tokenPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	defer zero(token)
	client, err := newOnlineClient(dependencies, *service, *caPath)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	nonce, err := entitlement.NewRequestNonce()
	if err != nil {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeServiceUnavailable, "generate "+verb+" request nonce", err))
	}
	var response []byte
	if deactivating {
		response, err = client.Deactivate(ctx, token, entitlement.DeactivateRequest{
			RequestNonce: nonce,
			ActivationID: state.cache.Claims.ActivationID,
			Sequence:     state.cache.Claims.Sequence,
			DeviceID:     state.identity.DeviceID,
		})
	} else {
		response, err = client.Refresh(ctx, token, entitlement.RefreshRequest{
			RequestNonce: nonce,
			ActivationID: state.cache.Claims.ActivationID,
			Sequence:     state.cache.Claims.Sequence,
			DeviceID:     state.identity.DeviceID,
		})
	}
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	next, err := verifyOnlineResponse(response, state.protectedPackage.Manifest, state.identity, state.issuerKey, nonce)
	if err != nil {
		return writeCommandError(stdout, command, err)
	}
	if next.Claims.ActivationID != state.cache.Claims.ActivationID {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeOnlineReplay, "online entitlement response changed activationId", nil))
	}
	if next.Claims.Sequence <= state.cache.Claims.Sequence {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeOnlineReplay, "online entitlement response sequence did not advance", nil))
	}
	if next.Claims.License.PublisherKeyID != state.cache.Claims.License.PublisherKeyID {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeInvalidOnlineSignature, "online entitlement response changed issuer keyId", nil))
	}
	if now(dependencies).Before(next.Claims.IssuedTime()) {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeLicenseNotYetValid, "online entitlement response is not yet valid", nil))
	}
	if deactivating && next.Claims.State != licensing.OnlineStateRevoked {
		return writeCommandError(stdout, command, licensing.NewError(licensing.CodeInvalidOnlineCache, "deactivate response must contain a revoked entitlement", nil))
	}
	if next.Claims.State == licensing.OnlineStateActive {
		if err := validateActiveOnlineContentKey(ctx, state.protectedPackage, next, state.issuerKey, state.device, now(dependencies)); err != nil {
			return writeCommandError(stdout, command, err)
		}
	}
	// Advance the OS-protected watermark before replacing the file. If the
	// subsequent write fails, Runtime rejects the old file against the newer
	// watermark and therefore remains fail closed.
	if err := state.replay.Commit(ctx, state.protectedPackage.Manifest, next); err != nil {
		return writeCommandError(stdout, command, err)
	}
	if err := state.store.SaveOnlineCache(state.protectedPackage.Manifest, response, state.issuerKey); err != nil {
		return writeCommandError(stdout, command, err)
	}
	result := licensing.OnlineCacheSafeResult(next)
	result["authorized"] = next.Claims.State == licensing.OnlineStateActive
	result["updated"] = true
	if deactivating {
		result["deactivated"] = true
	}
	return writeSuccess(stdout, command, result)
}

func loadInstalledOnlineState(ctx context.Context, packagePath string, dependencies Dependencies) (*installedOnlineState, error) {
	protectedPackage, err := readLicensedPackage(packagePath)
	if err != nil {
		return nil, err
	}
	root, err := installationRoot(dependencies)
	if err != nil {
		return nil, err
	}
	store := licensing.FileInstallationStore{Root: root}
	packageKey, err := store.ResolvePublisherKey(ctx, protectedPackage.Manifest)
	if err != nil {
		return nil, err
	}
	if err := scriptpackage.VerifySignature(protectedPackage.RawManifest, protectedPackage.Payload, protectedPackage.Signature, packageKey); err != nil {
		return nil, err
	}
	replay, err := newReplayGuard(dependencies)
	if err != nil {
		return nil, err
	}
	cache, err := store.LoadOnlineCache(ctx, protectedPackage.Manifest)
	if err != nil {
		if licensing.CodeOf(err) == licensing.CodeLicenseRequired {
			required, replayErr := replay.RequiresOnline(ctx, protectedPackage.Manifest)
			if replayErr != nil {
				return nil, replayErr
			}
			if required {
				return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "activated online entitlement cache is missing", err)
			}
		}
		return nil, err
	}
	issuerKey, err := store.ResolveLicenseIssuerKey(ctx, cache.Claims.License)
	if err != nil {
		return nil, err
	}
	if err := licensing.VerifyOnlineCache(cache, issuerKey); err != nil {
		return nil, err
	}
	device, err := newDevice(dependencies)
	if err != nil {
		return nil, err
	}
	identity, err := device.Ensure(ctx)
	if err != nil {
		return nil, err
	}
	if err := validateOnlineBinding(protectedPackage.Manifest, cache, identity); err != nil {
		return nil, err
	}
	if err := replay.Check(ctx, protectedPackage.Manifest, cache); err != nil {
		return nil, err
	}
	return &installedOnlineState{
		protectedPackage: protectedPackage,
		store:            store,
		device:           device,
		identity:         identity,
		replay:           replay,
		cache:            cache,
		issuerKey:        issuerKey,
	}, nil
}

func verifyOnlineResponse(data []byte, manifest scriptpackage.Manifest, identity deviceidentity.PublicIdentity, issuerKey ed25519.PublicKey, nonce string) (*licensing.OnlineCache, error) {
	cache, err := licensing.DecodeOnlineCacheJSON(data)
	if err != nil {
		return nil, err
	}
	if err := licensing.VerifyOnlineCacheForRequest(cache, issuerKey, nonce); err != nil {
		return nil, err
	}
	if err := validateOnlineBinding(manifest, cache, identity); err != nil {
		return nil, err
	}
	return cache, nil
}

func validateOnlineBinding(manifest scriptpackage.Manifest, cache *licensing.OnlineCache, identity deviceidentity.PublicIdentity) error {
	if cache == nil {
		return licensing.NewError(licensing.CodeInvalidOnlineCache, "online entitlement response is empty", nil)
	}
	claims := cache.Claims
	licenseClaims := claims.License
	if licenseClaims.PublisherID != manifest.PublisherID ||
		claims.PackagePublisherKeyID != manifest.PublisherKeyID ||
		licenseClaims.ProductID != manifest.ProductID ||
		licenseClaims.PackageID != manifest.PackageID ||
		licenseClaims.ContentKeyID != manifest.Encryption.KeyID {
		return licensing.NewError(licensing.CodeLicenseDenied, "online entitlement does not match the protected package", nil)
	}
	if identity.DeviceID != licenseClaims.DeviceID || identity.KeyAlgorithm != licenseClaims.DeviceKeyAlgorithm {
		return licensing.NewError(licensing.CodeWrongDevice, "online entitlement is bound to another device", nil)
	}
	return nil
}

func validateActiveOnlineContentKey(ctx context.Context, protectedPackage *scriptpackage.Package, cache *licensing.OnlineCache, issuerKey ed25519.PublicKey, device licensing.DeviceIdentityProvider, current time.Time) error {
	verifier := licensing.OnlineLicenseVerifier{
		Caches:     fixedOnlineCacheRepository{cache: cache},
		IssuerKeys: fixedOnlineIssuerKeyProvider{key: issuerKey},
		Device:     device,
		Replay:     acceptedOnlineResponseReplay{},
		Now:        func() time.Time { return current },
	}
	entitlementResult, err := verifier.Verify(ctx, protectedPackage.Manifest)
	if err != nil {
		return err
	}
	contentKey, err := (licensing.DeviceBoundContentKeyProvider{Device: device}).Resolve(ctx, protectedPackage.Manifest, entitlementResult)
	if err != nil {
		zero(contentKey)
		return err
	}
	defer zero(contentKey)
	return validatePackageContentKey(protectedPackage, contentKey)
}

func readLicensedPackage(path string) (*scriptpackage.Package, error) {
	protectedPackage, err := scriptpackage.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if !protectedPackage.Manifest.License.Required {
		return nil, licensing.NewError(licensing.CodeLicenseDenied, "protected package does not require a license", nil)
	}
	return protectedPackage, nil
}

func onlinePackageBinding(protectedPackage *scriptpackage.Package) entitlement.PackageBinding {
	manifest := protectedPackage.Manifest
	return entitlement.PackageBinding{
		PublisherID:    manifest.PublisherID,
		PublisherKeyID: manifest.PublisherKeyID,
		ProductID:      manifest.ProductID,
		PackageID:      manifest.PackageID,
		ContentKeyID:   manifest.Encryption.KeyID,
	}
}

func readOnlineToken(path string) ([]byte, error) {
	data, err := readBoundedRegularFile(path, entitlement.MaxTokenSize)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "cannot read entitlement credential file", err)
	}
	defer zero(data)
	token := bytes.TrimSpace(data)
	if len(token) == 0 || len(token) > entitlement.MaxTokenSize {
		return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential is missing or too large", nil)
	}
	for _, character := range token {
		if character < 0x21 || character == 0x7f {
			return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential contains invalid characters", nil)
		}
	}
	return append([]byte(nil), token...), nil
}

func newOnlineClient(dependencies Dependencies, service, caPath string) (entitlement.Client, error) {
	if dependencies.NewOnlineClient == nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "online entitlement client is not configured", nil)
	}
	var additionalRoots []byte
	if strings.TrimSpace(caPath) != "" {
		var err error
		additionalRoots, err = readBoundedRegularFile(caPath, 1024*1024)
		if err != nil {
			return nil, licensing.NewError(licensing.CodeServiceUnavailable, "cannot read entitlement service CA file", err)
		}
	}
	client, err := dependencies.NewOnlineClient(service, additionalRoots)
	if err != nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "initialize online entitlement client", err)
	}
	if client == nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "online entitlement client is unavailable", nil)
	}
	return client, nil
}

func newReplayGuard(dependencies Dependencies) (licensing.OnlineReplayGuard, error) {
	if dependencies.NewReplayGuard == nil {
		return nil, licensing.NewError(licensing.CodeOnlineReplay, "online entitlement replay guard is not configured", nil)
	}
	replay, err := dependencies.NewReplayGuard()
	if err != nil {
		return nil, licensing.NewError(licensing.CodeOnlineReplay, "initialize online entitlement replay guard", err)
	}
	if replay == nil {
		return nil, licensing.NewError(licensing.CodeOnlineReplay, "online entitlement replay guard is unavailable", nil)
	}
	return replay, nil
}
