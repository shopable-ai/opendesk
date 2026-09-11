package licensing

import (
	"context"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/scriptpackage"
)

type OfflineLicenseRepository interface {
	Load(ctx context.Context, manifest scriptpackage.Manifest) (*OfflineLicense, error)
}

type LicenseIssuerKeyProvider interface {
	ResolveLicenseIssuerKey(ctx context.Context, claims LicenseClaims) (ed25519.PublicKey, error)
}

type DeviceIdentityProvider interface {
	Ensure(ctx context.Context) (deviceidentity.PublicIdentity, error)
	PrivateKey(ctx context.Context, expectedDeviceID string) (*ecdh.PrivateKey, error)
}

type DeviceLicenseVerifier struct {
	Licenses   OfflineLicenseRepository
	IssuerKeys LicenseIssuerKeyProvider
	Device     DeviceIdentityProvider
	Now        func() time.Time
}

func (verifier DeviceLicenseVerifier) Verify(ctx context.Context, manifest scriptpackage.Manifest) (*Entitlement, error) {
	if verifier.Licenses == nil {
		return nil, NewError(CodeLicenseRequired, "offline license repository is not configured", nil)
	}
	license, err := verifier.Licenses.Load(ctx, manifest)
	if err != nil {
		return nil, err
	}
	if verifier.IssuerKeys == nil {
		return nil, NewError(CodeInvalidLicenseSign, "license issuer key provider is not configured", nil)
	}
	issuerKey, err := verifier.IssuerKeys.ResolveLicenseIssuerKey(ctx, license.Claims)
	if err != nil {
		return nil, err
	}
	now := time.Now
	if verifier.Now != nil {
		now = verifier.Now
	}
	return verifyDeviceLicense(ctx, manifest, license, issuerKey, verifier.Device, now().UTC())
}

func verifyDeviceLicense(ctx context.Context, manifest scriptpackage.Manifest, license *OfflineLicense, issuerKey ed25519.PublicKey, device DeviceIdentityProvider, current time.Time) (*Entitlement, error) {
	if err := VerifyOfflineLicense(license, issuerKey); err != nil {
		return nil, err
	}
	return verifyDeviceClaims(ctx, manifest, license.Claims, device, current)
}

func verifyDeviceClaims(ctx context.Context, manifest scriptpackage.Manifest, claims LicenseClaims, device DeviceIdentityProvider, current time.Time) (*Entitlement, error) {
	if claims.PublisherID != manifest.PublisherID ||
		claims.ProductID != manifest.ProductID ||
		claims.PackageID != manifest.PackageID ||
		claims.ContentKeyID != manifest.Encryption.KeyID {
		return nil, NewError(CodeLicenseDenied, "license does not match package publisher, product, package, or content key", nil)
	}
	if device == nil {
		return nil, NewError(CodeDeviceKeyUnavailable, "device identity provider is not configured", nil)
	}
	identity, err := device.Ensure(ctx)
	if err != nil {
		return nil, mapDeviceIdentityError(err)
	}
	if identity.DeviceID != claims.DeviceID || identity.KeyAlgorithm != claims.DeviceKeyAlgorithm {
		return nil, NewError(CodeWrongDevice, "license is bound to another device", nil)
	}
	current = current.UTC()
	if current.Before(claims.IssuedTime()) {
		return nil, NewError(CodeLicenseNotYetValid, "license is not yet valid", nil)
	}
	if !current.Before(claims.ExpiryTime()) {
		return nil, NewError(CodeLicenseExpired, "license has expired", nil)
	}
	verifiedClaims := claims
	return &Entitlement{
		LicenseID:          claims.LicenseID,
		ProductID:          claims.ProductID,
		PackageID:          claims.PackageID,
		ContentKeyID:       claims.ContentKeyID,
		SubjectID:          claims.SubjectID,
		DeviceID:           claims.DeviceID,
		DeviceKeyAlgorithm: claims.DeviceKeyAlgorithm,
		ExpiresAt:          claims.ExpiryTime(),
		KeyEnvelope:        claims.KeyEnvelope,
		verifiedClaims:     &verifiedClaims,
	}, nil
}

type DeviceBoundContentKeyProvider struct {
	Device DeviceIdentityProvider
}

func (provider DeviceBoundContentKeyProvider) Resolve(ctx context.Context, manifest scriptpackage.Manifest, entitlement *Entitlement) ([]byte, error) {
	if entitlement == nil {
		return nil, NewError(CodeLicenseRequired, "verified device entitlement is required", nil)
	}
	if entitlement.verifiedClaims == nil {
		return nil, NewError(CodeLicenseDenied, "content key resolution requires a verified device license", nil)
	}
	claims := *entitlement.verifiedClaims
	if entitlement.ProductID != claims.ProductID ||
		entitlement.PackageID != claims.PackageID ||
		entitlement.ContentKeyID != claims.ContentKeyID ||
		entitlement.DeviceID != claims.DeviceID ||
		entitlement.DeviceKeyAlgorithm != claims.DeviceKeyAlgorithm ||
		claims.PublisherID != manifest.PublisherID ||
		claims.ProductID != manifest.ProductID ||
		claims.PackageID != manifest.PackageID ||
		claims.ContentKeyID != manifest.Encryption.KeyID {
		return nil, NewError(CodeLicenseDenied, "entitlement does not match the protected package", nil)
	}
	if provider.Device == nil {
		return nil, NewError(CodeDeviceKeyUnavailable, "device identity provider is not configured", nil)
	}
	privateKey, err := provider.Device.PrivateKey(ctx, claims.DeviceID)
	if err != nil {
		return nil, mapDeviceIdentityError(err)
	}
	return UnwrapContentKey(claims.KeyEnvelope, privateKey, EnvelopeBinding{
		FormatVersion:      OfflineLicenseFormatVersion,
		ProductID:          claims.ProductID,
		PackageID:          claims.PackageID,
		ContentKeyID:       claims.ContentKeyID,
		DeviceID:           claims.DeviceID,
		DeviceKeyAlgorithm: claims.DeviceKeyAlgorithm,
	})
}

type FileInstallationStore struct {
	Root string
}

const InstallationRootEnvironment = "OPENDESK_PROTECTED_RECIPE_ROOT"

func DefaultInstallationRoot() (string, error) {
	if configured := os.Getenv(InstallationRootEnvironment); configured != "" {
		store := FileInstallationStore{Root: configured}
		if err := store.validateRoot(); err != nil {
			return "", fmt.Errorf("invalid %s: %w", InstallationRootEnvironment, err)
		}
		return filepath.Clean(configured), nil
	}
	root, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("locate user config directory: %w", err)
	}
	return filepath.Join(root, "OpenDesk", "protected-recipe"), nil
}

func (store FileInstallationStore) Load(ctx context.Context, manifest scriptpackage.Manifest) (*OfflineLicense, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := manifest.Validate(); err != nil {
		return nil, NewError(CodeInvalidLicense, "protected package manifest is invalid", err)
	}
	if err := store.validateRoot(); err != nil {
		return nil, err
	}
	return ReadOfflineLicense(store.licensePath(manifest))
}

func (store FileInstallationStore) LoadOnlineCache(ctx context.Context, manifest scriptpackage.Manifest) (*OnlineCache, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := manifest.Validate(); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "protected package manifest is invalid", err)
	}
	if err := store.validateRoot(); err != nil {
		return nil, err
	}
	return ReadOnlineCache(store.onlineCachePath(manifest))
}

func (store FileInstallationStore) ResolvePublisherKey(ctx context.Context, manifest scriptpackage.Manifest) (ed25519.PublicKey, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := store.validateRoot(); err != nil {
		return nil, NewError(CodeUnknownPublisher, "license installation root is invalid", err)
	}
	data, err := readInstalledFile(store.packageKeyPath(manifest.PublisherID, manifest.PublisherKeyID), 16*1024)
	if errors.Is(err, os.ErrNotExist) {
		return nil, NewError(CodeUnknownPublisher, "package publisher key is not installed", err)
	}
	if err != nil {
		return nil, NewError(CodeUnknownPublisher, "read installed package publisher key", err)
	}
	key, err := scriptpackage.ParseEd25519PublicKey(data)
	if err != nil {
		return nil, NewError(CodeUnknownPublisher, "installed package publisher key is invalid", err)
	}
	return key, nil
}

func (store FileInstallationStore) ResolveLicenseIssuerKey(ctx context.Context, claims LicenseClaims) (ed25519.PublicKey, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := store.validateRoot(); err != nil {
		return nil, NewError(CodeInvalidLicenseSign, "license installation root is invalid", err)
	}
	data, err := readInstalledFile(store.licenseKeyPath(claims.PublisherID, claims.PublisherKeyID), 16*1024)
	if errors.Is(err, os.ErrNotExist) {
		return nil, NewError(CodeInvalidLicenseSign, "license issuer key is not installed", err)
	}
	if err != nil {
		return nil, NewError(CodeInvalidLicenseSign, "read installed license issuer key", err)
	}
	key, err := scriptpackage.ParseEd25519PublicKey(data)
	if err != nil {
		return nil, NewError(CodeInvalidLicenseSign, "installed license issuer key is invalid", err)
	}
	return key, nil
}

func (store FileInstallationStore) Install(manifest scriptpackage.Manifest, licenseData []byte, packageKey, issuerKey ed25519.PublicKey) error {
	if err := store.validateRoot(); err != nil {
		return err
	}
	if len(licenseData) == 0 || len(licenseData) > MaxOfflineLicenseSize {
		return NewError(CodeInvalidLicense, "offline license file size is invalid", nil)
	}
	if err := manifest.Validate(); err != nil {
		return err
	}
	license, err := ParseOfflineLicense(licenseData)
	if err != nil {
		return err
	}
	if err := VerifyOfflineLicense(license, issuerKey); err != nil {
		return err
	}
	claims := license.Claims
	if claims.PublisherID != manifest.PublisherID || claims.PackageID != manifest.PackageID || claims.ProductID != manifest.ProductID || claims.ContentKeyID != manifest.Encryption.KeyID {
		return NewError(CodeLicenseDenied, "license cannot be installed for a different package", nil)
	}
	if len(packageKey) != ed25519.PublicKeySize || len(issuerKey) != ed25519.PublicKeySize {
		return NewError(CodeInvalidLicense, "installation trust pins must be Ed25519 public keys", nil)
	}
	if err := store.writePin(store.packageKeyPath(manifest.PublisherID, manifest.PublisherKeyID), packageKey); err != nil {
		return err
	}
	if err := store.writePin(store.licenseKeyPath(claims.PublisherID, claims.PublisherKeyID), issuerKey); err != nil {
		return err
	}
	return writeAtomic(store.licensePath(manifest), licenseData, true)
}

// InstallOnlineCache pins the same package/issuer public keys used by P1 and
// installs a signed online cache. Device binding, DEK accessibility and replay
// state are validated by the activation CLI before this storage step.
func (store FileInstallationStore) InstallOnlineCache(manifest scriptpackage.Manifest, cacheData []byte, packageKey, issuerKey ed25519.PublicKey) error {
	if len(packageKey) != ed25519.PublicKeySize || len(issuerKey) != ed25519.PublicKeySize {
		return NewError(CodeInvalidOnlineCache, "online entitlement trust pins must be Ed25519 public keys", nil)
	}
	if err := store.validateOnlineCache(manifest, cacheData, issuerKey); err != nil {
		return err
	}
	cache, _ := ParseOnlineCache(cacheData)
	if err := store.writePin(store.packageKeyPath(manifest.PublisherID, manifest.PublisherKeyID), packageKey); err != nil {
		return err
	}
	if err := store.writePin(store.licenseKeyPath(cache.Claims.License.PublisherID, cache.Claims.License.PublisherKeyID), issuerKey); err != nil {
		return err
	}
	return writeAtomic(store.onlineCachePath(manifest), cacheData, true)
}

func (store FileInstallationStore) SaveOnlineCache(manifest scriptpackage.Manifest, cacheData []byte, issuerKey ed25519.PublicKey) error {
	if len(issuerKey) != ed25519.PublicKeySize {
		return NewError(CodeInvalidOnlineCache, "online entitlement issuer key must be Ed25519", nil)
	}
	if err := store.validateOnlineCache(manifest, cacheData, issuerKey); err != nil {
		return err
	}
	return writeAtomic(store.onlineCachePath(manifest), cacheData, true)
}

func (store FileInstallationStore) validateOnlineCache(manifest scriptpackage.Manifest, cacheData []byte, issuerKey ed25519.PublicKey) error {
	if err := store.validateRoot(); err != nil {
		return err
	}
	cache, err := ParseOnlineCache(cacheData)
	if err != nil {
		return err
	}
	if err := VerifyOnlineCache(cache, issuerKey); err != nil {
		return err
	}
	claims := cache.Claims
	licenseClaims := claims.License
	if licenseClaims.PublisherID != manifest.PublisherID ||
		claims.PackagePublisherKeyID != manifest.PublisherKeyID ||
		licenseClaims.ProductID != manifest.ProductID ||
		licenseClaims.PackageID != manifest.PackageID ||
		licenseClaims.ContentKeyID != manifest.Encryption.KeyID {
		return NewError(CodeLicenseDenied, "online entitlement cannot be installed for a different package", nil)
	}
	return nil
}

func (store FileInstallationStore) writePin(path string, key []byte) error {
	existing, err := readInstalledFile(path, 16*1024)
	if err == nil {
		parsed, parseErr := scriptpackage.ParseEd25519PublicKey(existing)
		if parseErr != nil || !ed25519.PublicKey(parsed).Equal(ed25519.PublicKey(key)) {
			return NewError(CodeLicenseDenied, "installed trust pin conflicts with the supplied public key", parseErr)
		}
		return nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return NewError(CodeLicenseDenied, "read installed trust pin", err)
	}
	return writeAtomic(path, key, false)
}

func (store FileInstallationStore) validateRoot() error {
	cleaned := filepath.Clean(store.Root)
	volume := filepath.VolumeName(cleaned)
	rootOnly := volume + string(filepath.Separator)
	if !filepath.IsAbs(cleaned) || cleaned == rootOnly {
		return NewError(CodeInvalidLicense, "license installation root must be an absolute non-root path", nil)
	}
	return nil
}

func (store FileInstallationStore) licensePath(manifest scriptpackage.Manifest) string {
	return filepath.Join(store.Root, "licenses", installationPathToken("license", manifest.PublisherID, manifest.ProductID, manifest.PackageID, manifest.Encryption.KeyID)+OfflineLicenseExtension)
}

func (store FileInstallationStore) onlineCachePath(manifest scriptpackage.Manifest) string {
	return filepath.Join(store.Root, "online-entitlements", installationPathToken("online-cache", manifest.PublisherID, manifest.ProductID, manifest.PackageID, manifest.Encryption.KeyID)+".json")
}

func (store FileInstallationStore) packageKeyPath(publisherID, keyID string) string {
	return filepath.Join(store.Root, "package-keys", installationPathToken("package-key", publisherID, keyID)+".pub")
}

func (store FileInstallationStore) licenseKeyPath(publisherID, keyID string) string {
	return filepath.Join(store.Root, "license-keys", installationPathToken("license-key", publisherID, keyID)+".pub")
}

func installationPathToken(kind string, values ...string) string {
	hash := sha256.New()
	_, _ = hash.Write([]byte("OpenDeskProtectedRecipeInstallation/v1\x00"))
	_, _ = hash.Write([]byte(kind))
	for _, value := range values {
		_, _ = hash.Write([]byte{0})
		_, _ = hash.Write([]byte(value))
	}
	return fmt.Sprintf("%x", hash.Sum(nil))
}

func readInstalledFile(path string, limit int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > limit {
		return nil, fmt.Errorf("installed file is not a bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !openedInfo.Mode().IsRegular() || openedInfo.Size() != info.Size() {
		return nil, fmt.Errorf("installed file changed during secure read")
	}
	return io.ReadAll(io.LimitReader(file, limit+1))
}

func writeAtomic(path string, data []byte, replace bool) error {
	if len(data) == 0 {
		return NewError(CodeInvalidLicense, "refusing to install an empty file", nil)
	}
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return NewError(CodeInvalidLicense, "create license installation directory", err)
	}
	if !replace {
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if errors.Is(err, os.ErrExist) {
			return NewError(CodeLicenseDenied, "trust pin already exists", err)
		}
		if err != nil {
			return NewError(CodeInvalidLicense, "create installed trust pin", err)
		}
		if _, err := file.Write(data); err != nil {
			_ = file.Close()
			_ = os.Remove(path)
			return NewError(CodeInvalidLicense, "write installed trust pin", err)
		}
		if err := file.Sync(); err != nil {
			_ = file.Close()
			_ = os.Remove(path)
			return NewError(CodeInvalidLicense, "sync installed trust pin", err)
		}
		return file.Close()
	}
	temporary, err := os.CreateTemp(directory, ".install-*")
	if err != nil {
		return NewError(CodeInvalidLicense, "create temporary license file", err)
	}
	temporaryPath := temporary.Name()
	cleanup := true
	defer func() {
		_ = temporary.Close()
		if cleanup {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return NewError(CodeInvalidLicense, "protect temporary license file", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return NewError(CodeInvalidLicense, "write temporary license file", err)
	}
	if err := temporary.Sync(); err != nil {
		return NewError(CodeInvalidLicense, "sync temporary license file", err)
	}
	if err := temporary.Close(); err != nil {
		return NewError(CodeInvalidLicense, "close temporary license file", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return NewError(CodeInvalidLicense, "install license file", err)
	}
	cleanup = false
	return nil
}

func mapDeviceIdentityError(err error) error {
	switch deviceidentity.CodeOf(err) {
	case deviceidentity.CodeInvalidIdentity:
		return NewError(CodeWrongDevice, "device identity is invalid", err)
	case deviceidentity.CodeDeviceKeyUnavailable, deviceidentity.CodeDeviceIdentityMissing:
		return NewError(CodeDeviceKeyUnavailable, "device key is unavailable", err)
	default:
		return NewError(CodeDeviceKeyUnavailable, "device identity operation failed", err)
	}
}

type staticFailureProviders struct {
	err error
}

type unavailableOnlineReplayGuard struct{ err error }

func (guard unavailableOnlineReplayGuard) Check(context.Context, scriptpackage.Manifest, *OnlineCache) error {
	return NewError(CodeOnlineReplay, "OS-protected replay state is unavailable", guard.err)
}

func (guard unavailableOnlineReplayGuard) Commit(context.Context, scriptpackage.Manifest, *OnlineCache) error {
	return NewError(CodeOnlineReplay, "OS-protected replay state is unavailable", guard.err)
}

func (unavailableOnlineReplayGuard) RequiresOnline(context.Context, scriptpackage.Manifest) (bool, error) {
	return false, nil
}

func (provider staticFailureProviders) ResolvePublisherKey(context.Context, scriptpackage.Manifest) (ed25519.PublicKey, error) {
	return nil, provider.err
}

func (provider staticFailureProviders) Verify(context.Context, scriptpackage.Manifest) (*Entitlement, error) {
	return nil, provider.err
}

func (provider staticFailureProviders) Resolve(context.Context, scriptpackage.Manifest, *Entitlement) ([]byte, error) {
	return nil, provider.err
}

// NewProductionProviders composes deterministic local license discovery with
// OS-protected device identity. It embeds no publisher key, issuer key, DEK,
// private key, or fallback entitlement.
func NewProductionProviders() (PublisherKeyProvider, LicenseVerifier, ContentKeyProvider) {
	root, err := DefaultInstallationRoot()
	if err != nil {
		failure := staticFailureProviders{err: NewError(CodeLicenseRequired, "license installation root is unavailable", err)}
		return failure, failure, failure
	}
	device, err := deviceidentity.NewPlatformManager()
	if err != nil {
		failure := staticFailureProviders{err: NewError(CodeDeviceKeyUnavailable, "OS device key storage is unavailable", err)}
		return failure, failure, failure
	}
	store := FileInstallationStore{Root: root}
	offline := DeviceLicenseVerifier{
		Licenses:   store,
		IssuerKeys: store,
		Device:     device,
		Now:        time.Now,
	}
	replay, replayErr := NewPlatformOnlineReplayGuard()
	if replayErr != nil {
		replay = unavailableOnlineReplayGuard{err: replayErr}
	}
	online := OnlineLicenseVerifier{Caches: store, IssuerKeys: store, Device: device, Replay: replay, Now: time.Now}
	return store, PreferOnlineLicenseVerifier{Online: online, Offline: offline}, DeviceBoundContentKeyProvider{Device: device}
}
