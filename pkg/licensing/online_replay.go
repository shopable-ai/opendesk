package licensing

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"opendesk/pkg/scriptpackage"
	"opendesk/pkg/securestore"
)

const (
	onlineReplayFormat        = "opendesk-online-entitlement-replay-state"
	onlineReplayFormatVersion = 1
	onlineReplayNamespace     = "ai.shopable.opendesk.online-entitlement"
)

type onlineReplayRecord struct {
	Format        string `json:"format"`
	FormatVersion int    `json:"formatVersion"`
	ActivationID  string `json:"activationId"`
	Sequence      uint64 `json:"sequence"`
	State         string `json:"state"`
	CacheDigest   string `json:"cacheDigest"`
}

type onlineActivationMarker struct {
	Format        string `json:"format"`
	FormatVersion int    `json:"formatVersion"`
	ActivationID  string `json:"activationId"`
}

// SecureOnlineReplayGuard keeps the highest accepted signed revision in the
// platform secure store. It prevents replacing the installed cache with an
// older still-valid signed response. P4 remains responsible for stronger
// clock rollback and platform recovery governance.
type SecureOnlineReplayGuard struct {
	Store securestore.MutableStore
}

func NewPlatformOnlineReplayGuard() (OnlineReplayGuard, error) {
	store, err := securestore.NewPlatformMutableStore(onlineReplayNamespace)
	if err != nil {
		return nil, NewError(CodeOnlineReplay, "OS-protected replay state is unavailable", err)
	}
	return SecureOnlineReplayGuard{Store: store}, nil
}

func (guard SecureOnlineReplayGuard) Check(ctx context.Context, manifest scriptpackage.Manifest, cache *OnlineCache) error {
	if guard.Store == nil {
		return NewError(CodeOnlineReplay, "online entitlement replay store is not configured", nil)
	}
	if cache == nil || cache.Claims.ActivationID == "" || cache.Digest() == "" {
		return NewError(CodeInvalidOnlineCache, "online entitlement cache is incomplete", nil)
	}
	marker, err := guard.loadMarker(ctx, manifest)
	if err != nil {
		return err
	}
	if marker.ActivationID != cache.Claims.ActivationID {
		return NewError(CodeOnlineReplay, "online entitlement cache does not match the authoritative activation", nil)
	}
	current, err := guard.load(ctx, cache.Claims.ActivationID)
	if errors.Is(err, securestore.ErrNotFound) {
		return NewError(CodeOnlineReplay, "online entitlement cache has no committed replay state", err)
	}
	if err != nil {
		return err
	}
	if current.Sequence != cache.Claims.Sequence || current.State != cache.Claims.State || current.CacheDigest != cache.Digest() {
		return NewError(CodeOnlineReplay, "online entitlement cache revision does not match the committed state", nil)
	}
	return nil
}

func (guard SecureOnlineReplayGuard) Commit(ctx context.Context, manifest scriptpackage.Manifest, cache *OnlineCache) error {
	if guard.Store == nil {
		return NewError(CodeOnlineReplay, "online entitlement replay store is not configured", nil)
	}
	if cache == nil || cache.Claims.ActivationID == "" || cache.Digest() == "" {
		return NewError(CodeInvalidOnlineCache, "online entitlement cache is incomplete", nil)
	}
	next := onlineReplayRecord{
		Format:        onlineReplayFormat,
		FormatVersion: onlineReplayFormatVersion,
		ActivationID:  cache.Claims.ActivationID,
		Sequence:      cache.Claims.Sequence,
		State:         cache.Claims.State,
		CacheDigest:   cache.Digest(),
	}
	current, err := guard.load(ctx, next.ActivationID)
	if err == nil {
		if next.Sequence < current.Sequence {
			return NewError(CodeOnlineReplay, "online entitlement sequence moved backwards", nil)
		}
		if current.State == OnlineStateRevoked && next.State != OnlineStateRevoked {
			return NewError(CodeOnlineReplay, "a revoked activation cannot return to active state", nil)
		}
		if next.Sequence == current.Sequence {
			if next.State == current.State && next.CacheDigest == current.CacheDigest {
				return nil
			}
			return NewError(CodeOnlineReplay, "online entitlement sequence was reused with different state", nil)
		}
	} else if !errors.Is(err, securestore.ErrNotFound) {
		return err
	}
	markerData, err := json.Marshal(onlineActivationMarker{
		Format:        onlineReplayFormat,
		FormatVersion: onlineReplayFormatVersion,
		ActivationID:  next.ActivationID,
	})
	if err != nil {
		return NewError(CodeOnlineReplay, "encode online activation marker", err)
	}
	// The marker is written first. If the process stops before the revision is
	// saved, subsequent loads fail closed instead of falling back to P1.
	if err := guard.Store.Save(ctx, onlineManifestItem(manifest), markerData); err != nil {
		return NewError(CodeOnlineReplay, "save OS-protected online activation marker", err)
	}
	data, err := json.Marshal(next)
	if err != nil {
		return NewError(CodeOnlineReplay, "encode online entitlement replay state", err)
	}
	if err := guard.Store.Save(ctx, onlineReplayItem(next.ActivationID), data); err != nil {
		return NewError(CodeOnlineReplay, "save OS-protected online entitlement replay state", err)
	}
	return nil
}

func (guard SecureOnlineReplayGuard) RequiresOnline(ctx context.Context, manifest scriptpackage.Manifest) (bool, error) {
	if guard.Store == nil {
		return false, NewError(CodeOnlineReplay, "online entitlement replay store is not configured", nil)
	}
	_, err := guard.loadMarker(ctx, manifest)
	if errors.Is(err, securestore.ErrNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (guard SecureOnlineReplayGuard) loadMarker(ctx context.Context, manifest scriptpackage.Manifest) (onlineActivationMarker, error) {
	data, err := guard.Store.Load(ctx, onlineManifestItem(manifest))
	if err != nil {
		return onlineActivationMarker{}, err
	}
	defer zeroBytes(data)
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return onlineActivationMarker{}, NewError(CodeOnlineReplay, "online activation marker is invalid", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var marker onlineActivationMarker
	if err := decoder.Decode(&marker); err != nil {
		return onlineActivationMarker{}, NewError(CodeOnlineReplay, "decode online activation marker", err)
	}
	if err := requireEOF(decoder); err != nil || marker.Format != onlineReplayFormat || marker.FormatVersion != onlineReplayFormatVersion || !licenseIdentifier.MatchString(marker.ActivationID) {
		return onlineActivationMarker{}, NewError(CodeOnlineReplay, "online activation marker metadata is invalid", err)
	}
	return marker, nil
}

func (guard SecureOnlineReplayGuard) load(ctx context.Context, activationID string) (onlineReplayRecord, error) {
	data, err := guard.Store.Load(ctx, onlineReplayItem(activationID))
	if err != nil {
		return onlineReplayRecord{}, err
	}
	defer zeroBytes(data)
	if len(data) == 0 || len(data) > securestore.MaxValueSize {
		return onlineReplayRecord{}, NewError(CodeOnlineReplay, "online entitlement replay state size is invalid", nil)
	}
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return onlineReplayRecord{}, NewError(CodeOnlineReplay, "online entitlement replay state is invalid", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var record onlineReplayRecord
	if err := decoder.Decode(&record); err != nil {
		return onlineReplayRecord{}, NewError(CodeOnlineReplay, "decode online entitlement replay state", err)
	}
	if err := requireEOF(decoder); err != nil {
		return onlineReplayRecord{}, NewError(CodeOnlineReplay, "online entitlement replay state must contain one JSON value", err)
	}
	if err := record.validate(activationID); err != nil {
		return onlineReplayRecord{}, err
	}
	return record, nil
}

func (record onlineReplayRecord) validate(expectedActivationID string) error {
	if record.Format != onlineReplayFormat || record.FormatVersion != onlineReplayFormatVersion ||
		record.ActivationID != expectedActivationID || !licenseIdentifier.MatchString(record.ActivationID) ||
		record.Sequence == 0 || (record.State != OnlineStateActive && record.State != OnlineStateRevoked) {
		return NewError(CodeOnlineReplay, "online entitlement replay state metadata is invalid", nil)
	}
	digest, err := hex.DecodeString(record.CacheDigest)
	if err != nil || len(digest) != sha256.Size || hex.EncodeToString(digest) != record.CacheDigest {
		return NewError(CodeOnlineReplay, "online entitlement replay digest is invalid", err)
	}
	return nil
}

func onlineReplayItem(activationID string) string {
	digest := sha256.Sum256([]byte("OpenDeskOnlineEntitlementReplayItem/v1\x00" + activationID))
	return fmt.Sprintf("activation-%x", digest[:])
}

func onlineManifestItem(manifest scriptpackage.Manifest) string {
	hash := sha256.New()
	_, _ = hash.Write([]byte("OpenDeskOnlineEntitlementManifestItem/v1\x00"))
	for _, value := range []string{manifest.PublisherID, manifest.ProductID, manifest.PackageID, manifest.Encryption.KeyID} {
		_, _ = hash.Write([]byte(value))
		_, _ = hash.Write([]byte{0})
	}
	return "manifest-" + hex.EncodeToString(hash.Sum(nil))
}
