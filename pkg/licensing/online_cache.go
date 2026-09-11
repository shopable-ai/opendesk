package licensing

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"opendesk/pkg/scriptpackage"
)

const (
	OnlineCacheFormat        = "opendesk-online-entitlement-cache"
	OnlineCacheFormatVersion = 1
	OnlineStateActive        = "active"
	OnlineStateRevoked       = "revoked"
	MaxOnlineCacheSize       = 128 * 1024
	MaxOfflineGrace          = 7 * 24 * time.Hour
)

var onlineCacheSignatureDomain = []byte("OpenDeskOnlineEntitlementCache/v1\x00")

// OnlineCacheClaims is the exact signed authorization state cached by a
// customer installation. License remains the P1 device-bound claim set, so a
// verified online cache can flow through the existing ContentKeyProvider.
type OnlineCacheClaims struct {
	Format                string        `json:"format"`
	FormatVersion         int           `json:"formatVersion"`
	ActivationID          string        `json:"activationId"`
	EntitlementID         string        `json:"entitlementId"`
	PackagePublisherKeyID string        `json:"packagePublisherKeyId"`
	RequestNonce          string        `json:"requestNonce"`
	Sequence              uint64        `json:"sequence"`
	State                 string        `json:"state"`
	IssuedAt              string        `json:"issuedAt"`
	RefreshAfter          string        `json:"refreshAfter"`
	OfflineUntil          string        `json:"offlineUntil"`
	License               LicenseClaims `json:"license"`
}

type onlineCacheJSON struct {
	Entitlement json.RawMessage `json:"entitlement"`
	Signature   string          `json:"signature"`
}

type OnlineCache struct {
	RawClaims []byte
	Claims    OnlineCacheClaims
	Signature []byte
}

func (claims OnlineCacheClaims) Validate() error {
	if claims.Format != OnlineCacheFormat || claims.FormatVersion != OnlineCacheFormatVersion {
		return NewError(CodeInvalidOnlineCache, "online entitlement cache format or version is not supported", nil)
	}
	for name, value := range map[string]string{
		"activationId":          claims.ActivationID,
		"entitlementId":         claims.EntitlementID,
		"packagePublisherKeyId": claims.PackagePublisherKeyID,
	} {
		if !licenseIdentifier.MatchString(value) {
			return NewError(CodeInvalidOnlineCache, name+" is invalid", nil)
		}
	}
	nonce, err := decodeCanonicalBase64(claims.RequestNonce)
	if err != nil || len(nonce) != 32 {
		return NewError(CodeInvalidOnlineCache, "requestNonce must be canonical base64 for 32 bytes", err)
	}
	if claims.Sequence == 0 {
		return NewError(CodeInvalidOnlineCache, "sequence must be positive", nil)
	}
	if claims.State != OnlineStateActive && claims.State != OnlineStateRevoked {
		return NewError(CodeInvalidOnlineCache, "state must be active or revoked", nil)
	}
	issuedAt, err := parseLicenseTime(claims.IssuedAt)
	if err != nil {
		return NewError(CodeInvalidOnlineCache, "issuedAt must be canonical UTC RFC3339", err)
	}
	refreshAfter, err := parseLicenseTime(claims.RefreshAfter)
	if err != nil {
		return NewError(CodeInvalidOnlineCache, "refreshAfter must be canonical UTC RFC3339", err)
	}
	offlineUntil, err := parseLicenseTime(claims.OfflineUntil)
	if err != nil {
		return NewError(CodeInvalidOnlineCache, "offlineUntil must be canonical UTC RFC3339", err)
	}
	if refreshAfter.Before(issuedAt) || refreshAfter.After(offlineUntil) {
		return NewError(CodeInvalidOnlineCache, "refreshAfter must be within the signed offline window", nil)
	}
	if !offlineUntil.After(issuedAt) || offlineUntil.Sub(issuedAt) > MaxOfflineGrace {
		return NewError(CodeInvalidOnlineCache, "offline grace exceeds the client maximum", nil)
	}
	if err := claims.License.Validate(); err != nil {
		return NewError(CodeInvalidOnlineCache, "embedded device license is invalid", err)
	}
	if claims.License.ExpiryTime().Before(offlineUntil) {
		return NewError(CodeInvalidOnlineCache, "embedded device license expires before offlineUntil", nil)
	}
	return nil
}

func (claims OnlineCacheClaims) IssuedTime() time.Time {
	value, _ := parseLicenseTime(claims.IssuedAt)
	return value
}

func (claims OnlineCacheClaims) RefreshTime() time.Time {
	value, _ := parseLicenseTime(claims.RefreshAfter)
	return value
}

func (claims OnlineCacheClaims) OfflineExpiryTime() time.Time {
	value, _ := parseLicenseTime(claims.OfflineUntil)
	return value
}

func BuildOnlineCache(claims OnlineCacheClaims, privateKey ed25519.PrivateKey) ([]byte, error) {
	if err := claims.Validate(); err != nil {
		return nil, err
	}
	if len(privateKey) != ed25519.PrivateKeySize {
		return nil, NewError(CodeInvalidOnlineCache, "online cache signing key must be Ed25519", nil)
	}
	rawClaims, err := json.Marshal(claims)
	if err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "encode online entitlement claims", err)
	}
	signature := ed25519.Sign(privateKey, onlineCacheSignatureMessage(rawClaims))
	return json.Marshal(onlineCacheJSON{
		Entitlement: rawClaims,
		Signature:   base64.StdEncoding.EncodeToString(signature),
	})
}

func ParseOnlineCache(data []byte) (*OnlineCache, error) {
	if len(data) == 0 || len(data) > MaxOnlineCacheSize {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement cache size is invalid", nil)
	}
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, err.Error(), nil)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var outer onlineCacheJSON
	if err := decoder.Decode(&outer); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "decode online entitlement cache", err)
	}
	if err := requireEOF(decoder); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement cache must contain one JSON value", err)
	}
	if len(outer.Entitlement) == 0 || string(outer.Entitlement) == "null" {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement claims are missing", nil)
	}
	claimsDecoder := json.NewDecoder(bytes.NewReader(outer.Entitlement))
	claimsDecoder.DisallowUnknownFields()
	var claims OnlineCacheClaims
	if err := claimsDecoder.Decode(&claims); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "decode online entitlement claims", err)
	}
	if err := requireEOF(claimsDecoder); err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement claims must contain one JSON value", err)
	}
	if err := claims.Validate(); err != nil {
		return nil, err
	}
	signature, err := decodeCanonicalBase64(outer.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement signature is invalid", err)
	}
	return &OnlineCache{
		RawClaims: append([]byte(nil), outer.Entitlement...),
		Claims:    claims,
		Signature: append([]byte(nil), signature...),
	}, nil
}

func ReadOnlineCache(filePath string) (*OnlineCache, error) {
	info, err := os.Lstat(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, NewError(CodeLicenseRequired, "no online entitlement cache is installed", err)
		}
		return nil, NewError(CodeInvalidOnlineCache, "stat online entitlement cache", err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > MaxOnlineCacheSize {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement cache must be a bounded regular file", nil)
	}
	file, err := os.Open(filePath)
	if err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "open online entitlement cache", err)
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || openedInfo.Size() != info.Size() {
		return nil, NewError(CodeInvalidOnlineCache, "online entitlement cache changed during secure read", err)
	}
	data, err := io.ReadAll(io.LimitReader(file, MaxOnlineCacheSize+1))
	if err != nil {
		return nil, NewError(CodeInvalidOnlineCache, "read online entitlement cache", err)
	}
	return ParseOnlineCache(data)
}

func VerifyOnlineCache(cache *OnlineCache, publicKey ed25519.PublicKey) error {
	if cache == nil || len(cache.RawClaims) == 0 || len(cache.Signature) != ed25519.SignatureSize {
		return NewError(CodeInvalidOnlineCache, "online entitlement cache is incomplete", nil)
	}
	if len(publicKey) != ed25519.PublicKeySize || !ed25519.Verify(publicKey, onlineCacheSignatureMessage(cache.RawClaims), cache.Signature) {
		return NewError(CodeInvalidOnlineSignature, "online entitlement signature verification failed", nil)
	}
	return nil
}

func (cache *OnlineCache) Digest() string {
	if cache == nil {
		return ""
	}
	hash := sha256.New()
	_, _ = hash.Write([]byte("OpenDeskOnlineEntitlementCacheDigest/v1\x00"))
	_, _ = hash.Write(cache.RawClaims)
	_, _ = hash.Write(cache.Signature)
	return hex.EncodeToString(hash.Sum(nil))
}

func onlineCacheSignatureMessage(rawClaims []byte) []byte {
	digest := sha256.Sum256(rawClaims)
	message := make([]byte, 0, len(onlineCacheSignatureDomain)+len(digest))
	message = append(message, onlineCacheSignatureDomain...)
	message = append(message, digest[:]...)
	return message
}

type OnlineCacheRepository interface {
	LoadOnlineCache(ctx context.Context, manifest scriptpackage.Manifest) (*OnlineCache, error)
}

type OnlineReplayGuard interface {
	Check(ctx context.Context, manifest scriptpackage.Manifest, cache *OnlineCache) error
	Commit(ctx context.Context, manifest scriptpackage.Manifest, cache *OnlineCache) error
	RequiresOnline(ctx context.Context, manifest scriptpackage.Manifest) (bool, error)
}

type OnlineLicenseVerifier struct {
	Caches     OnlineCacheRepository
	IssuerKeys LicenseIssuerKeyProvider
	Device     DeviceIdentityProvider
	Replay     OnlineReplayGuard
	Now        func() time.Time
}

func (verifier OnlineLicenseVerifier) Verify(ctx context.Context, manifest scriptpackage.Manifest) (*Entitlement, error) {
	if verifier.Caches == nil {
		return nil, NewError(CodeLicenseRequired, "online entitlement cache repository is not configured", nil)
	}
	cache, err := verifier.Caches.LoadOnlineCache(ctx, manifest)
	if err != nil {
		if CodeOf(err) == CodeLicenseRequired && verifier.Replay != nil {
			required, replayErr := verifier.Replay.RequiresOnline(ctx, manifest)
			if replayErr != nil {
				return nil, replayErr
			}
			if required {
				return nil, NewError(CodeInvalidOnlineCache, "activated online entitlement cache is missing", err)
			}
		}
		return nil, err
	}
	if verifier.IssuerKeys == nil {
		return nil, NewError(CodeInvalidOnlineSignature, "online entitlement issuer key provider is not configured", nil)
	}
	issuerKey, err := verifier.IssuerKeys.ResolveLicenseIssuerKey(ctx, cache.Claims.License)
	if err != nil {
		return nil, err
	}
	if err := VerifyOnlineCache(cache, issuerKey); err != nil {
		return nil, err
	}
	claims := cache.Claims
	licenseClaims := claims.License
	if licenseClaims.PublisherID != manifest.PublisherID ||
		claims.PackagePublisherKeyID != manifest.PublisherKeyID ||
		licenseClaims.ProductID != manifest.ProductID ||
		licenseClaims.PackageID != manifest.PackageID ||
		licenseClaims.ContentKeyID != manifest.Encryption.KeyID {
		return nil, NewError(CodeLicenseDenied, "online entitlement does not match the protected package", nil)
	}
	if verifier.Replay == nil {
		return nil, NewError(CodeOnlineReplay, "online entitlement replay guard is not configured", nil)
	}
	if err := verifier.Replay.Check(ctx, manifest, cache); err != nil {
		return nil, err
	}
	now := time.Now
	if verifier.Now != nil {
		now = verifier.Now
	}
	current := now().UTC()
	if current.Before(claims.IssuedTime()) {
		return nil, NewError(CodeLicenseNotYetValid, "online entitlement is not yet valid", nil)
	}
	if claims.State == OnlineStateRevoked {
		return nil, NewError(CodeLicenseRevoked, "online entitlement has been revoked", nil)
	}
	if !current.Before(claims.OfflineExpiryTime()) {
		return nil, NewError(CodeOfflineGraceExpired, "online entitlement offline grace has expired", nil)
	}
	entitlement, err := verifyDeviceClaims(ctx, manifest, licenseClaims, verifier.Device, current)
	if err != nil {
		return nil, err
	}
	entitlement.ExpiresAt = claims.OfflineExpiryTime()
	return entitlement, nil
}

type PreferOnlineLicenseVerifier struct {
	Online  LicenseVerifier
	Offline LicenseVerifier
}

func (verifier PreferOnlineLicenseVerifier) Verify(ctx context.Context, manifest scriptpackage.Manifest) (*Entitlement, error) {
	if verifier.Online != nil {
		entitlement, err := verifier.Online.Verify(ctx, manifest)
		if err == nil {
			return entitlement, nil
		}
		if CodeOf(err) != CodeLicenseRequired {
			return nil, err
		}
	}
	if verifier.Offline == nil {
		return nil, NewError(CodeLicenseRequired, "no device license or online entitlement is installed", nil)
	}
	return verifier.Offline.Verify(ctx, manifest)
}

func VerifyOnlineCacheForRequest(cache *OnlineCache, publicKey ed25519.PublicKey, requestNonce string) error {
	if err := VerifyOnlineCache(cache, publicKey); err != nil {
		return err
	}
	if cache.Claims.RequestNonce != requestNonce {
		return NewError(CodeOnlineReplay, "online entitlement response does not match the request nonce", nil)
	}
	return nil
}

func OnlineCacheSafeResult(cache *OnlineCache) map[string]any {
	if cache == nil {
		return nil
	}
	claims := cache.Claims
	licenseClaims := claims.License
	return map[string]any{
		"format":                claims.Format,
		"formatVersion":         claims.FormatVersion,
		"activationId":          claims.ActivationID,
		"entitlementId":         claims.EntitlementID,
		"sequence":              claims.Sequence,
		"state":                 claims.State,
		"issuedAt":              claims.IssuedAt,
		"refreshAfter":          claims.RefreshAfter,
		"offlineUntil":          claims.OfflineUntil,
		"licenseId":             licenseClaims.LicenseID,
		"subjectId":             licenseClaims.SubjectID,
		"deviceId":              licenseClaims.DeviceID,
		"productId":             licenseClaims.ProductID,
		"packageId":             licenseClaims.PackageID,
		"contentKeyId":          licenseClaims.ContentKeyID,
		"publisherId":           licenseClaims.PublisherID,
		"publisherKeyId":        licenseClaims.PublisherKeyID,
		"packagePublisherKeyId": claims.PackagePublisherKeyID,
	}
}

func DecodeOnlineCacheJSON(data []byte) (*OnlineCache, error) {
	cache, err := ParseOnlineCache(bytes.TrimSpace(data))
	if err != nil {
		return nil, fmt.Errorf("online entitlement response: %w", err)
	}
	return cache, nil
}
