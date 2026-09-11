// Package entitlementservice implements the server-side online entitlement
// boundary. Customer-side binaries use pkg/entitlement and do not need to
// import this package.
package entitlementservice

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"sync"
	"time"

	"opendesk/pkg/deviceidentity"
	"opendesk/pkg/entitlement"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

const defaultOfflineGrace = 24 * time.Hour

// Authenticator maps an opaque bearer credential to the server-owned subject.
// Implementations must not return or persist the original credential.
type Authenticator interface {
	Authenticate(ctx context.Context, credential []byte) (string, error)
}

type Credential struct {
	SubjectID string
	Token     []byte
}

// MemoryAuthenticator stores only SHA-256 token digests. It is intended for a
// small deployment or tests; a hosted service can supply its own Authenticator.
type MemoryAuthenticator struct {
	subjects map[[sha256.Size]byte]string
}

func NewMemoryAuthenticator(credentials ...Credential) (*MemoryAuthenticator, error) {
	authenticator := &MemoryAuthenticator{subjects: make(map[[sha256.Size]byte]string, len(credentials))}
	for _, credential := range credentials {
		if !identifier.MatchString(credential.SubjectID) || len(credential.Token) == 0 || len(credential.Token) > entitlement.MaxTokenSize {
			return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential configuration is invalid", nil)
		}
		digest := sha256.Sum256(credential.Token)
		if _, exists := authenticator.subjects[digest]; exists {
			return nil, licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement credential is duplicated", nil)
		}
		authenticator.subjects[digest] = credential.SubjectID
	}
	return authenticator, nil
}

func (authenticator *MemoryAuthenticator) Authenticate(ctx context.Context, credential []byte) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if authenticator == nil || len(credential) == 0 || len(credential) > entitlement.MaxTokenSize {
		return "", licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement service authentication failed", nil)
	}
	digest := sha256.Sum256(credential)
	subjectID, ok := authenticator.subjects[digest]
	if !ok {
		return "", licensing.NewError(licensing.CodeAuthenticationRequired, "entitlement service authentication failed", nil)
	}
	return subjectID, nil
}

type EntitlementRecord struct {
	EntitlementID string
	SubjectID     string
	Package       entitlement.PackageBinding
	DeviceLimit   int
	ExpiresAt     time.Time
}

type ActivationDecision struct {
	ActivationID         string
	EntitlementID        string
	SubjectID            string
	Package              entitlement.PackageBinding
	Device               deviceidentity.PublicIdentity
	Sequence             uint64
	State                string
	EntitlementExpiresAt time.Time
}

type Registry interface {
	Activate(ctx context.Context, subjectID string, request entitlement.ActivateRequest, current time.Time) (ActivationDecision, error)
	Refresh(ctx context.Context, subjectID string, request entitlement.RefreshRequest, current time.Time) (ActivationDecision, error)
	Deactivate(ctx context.Context, subjectID string, request entitlement.DeactivateRequest, current time.Time) (ActivationDecision, error)
}

type activationRecord struct {
	decision ActivationDecision
}

type entitlementState struct {
	record  EntitlementRecord
	revoked bool
}

// MemoryRegistry makes device admission and sequence advancement under one
// mutex. In particular, the device-limit check and activation insertion cannot
// race when multiple callers compete for the last slot.
type MemoryRegistry struct {
	mu              sync.Mutex
	entitlements    map[string]*entitlementState
	lookup          map[string]string
	activations     map[string]*activationRecord
	activeByDevice  map[string]map[string]string
	newActivationID func() (string, error)
}

func NewMemoryRegistry(records ...EntitlementRecord) (*MemoryRegistry, error) {
	registry := &MemoryRegistry{
		entitlements:    make(map[string]*entitlementState, len(records)),
		lookup:          make(map[string]string, len(records)),
		activations:     map[string]*activationRecord{},
		activeByDevice:  map[string]map[string]string{},
		newActivationID: randomActivationID,
	}
	for _, record := range records {
		if err := validateEntitlementRecord(record); err != nil {
			return nil, err
		}
		key := grantKey(record.SubjectID, record.Package)
		if _, exists := registry.entitlements[record.EntitlementID]; exists || registry.lookup[key] != "" {
			return nil, licensing.NewError(licensing.CodeLicenseDenied, "entitlement configuration is duplicated", nil)
		}
		copy := record
		copy.ExpiresAt = copy.ExpiresAt.UTC()
		registry.entitlements[record.EntitlementID] = &entitlementState{record: copy}
		registry.lookup[key] = record.EntitlementID
		registry.activeByDevice[record.EntitlementID] = map[string]string{}
	}
	return registry, nil
}

func (registry *MemoryRegistry) Activate(ctx context.Context, subjectID string, request entitlement.ActivateRequest, current time.Time) (ActivationDecision, error) {
	if err := ctx.Err(); err != nil {
		return ActivationDecision{}, err
	}
	if registry == nil {
		return ActivationDecision{}, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement registry is unavailable", nil)
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()

	state := registry.entitlementFor(subjectID, request.Package)
	if state == nil || state.revoked || !current.UTC().Before(state.record.ExpiresAt) {
		return ActivationDecision{}, licensing.NewError(licensing.CodeLicenseDenied, "product entitlement was denied", nil)
	}
	active := registry.activeByDevice[state.record.EntitlementID]
	if activationID := active[request.Device.DeviceID]; activationID != "" {
		record := registry.activations[activationID]
		record.decision.Sequence++
		return record.decision, nil
	}
	if len(active) >= state.record.DeviceLimit {
		return ActivationDecision{}, licensing.NewError(licensing.CodeDeviceLimitExceeded, "product device limit was exceeded", nil)
	}
	activationID, err := registry.newActivationID()
	if err != nil {
		return ActivationDecision{}, licensing.NewError(licensing.CodeServiceUnavailable, "generate activation identifier", err)
	}
	decision := ActivationDecision{
		ActivationID:         activationID,
		EntitlementID:        state.record.EntitlementID,
		SubjectID:            subjectID,
		Package:              state.record.Package,
		Device:               request.Device,
		Sequence:             1,
		State:                licensing.OnlineStateActive,
		EntitlementExpiresAt: state.record.ExpiresAt,
	}
	registry.activations[activationID] = &activationRecord{decision: decision}
	active[request.Device.DeviceID] = activationID
	return decision, nil
}

func (registry *MemoryRegistry) Refresh(ctx context.Context, subjectID string, request entitlement.RefreshRequest, current time.Time) (ActivationDecision, error) {
	if err := ctx.Err(); err != nil {
		return ActivationDecision{}, err
	}
	if registry == nil {
		return ActivationDecision{}, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement registry is unavailable", nil)
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	record, err := registry.authorizedActivation(subjectID, request.ActivationID, request.DeviceID, request.Sequence)
	if err != nil {
		return ActivationDecision{}, err
	}
	state := registry.entitlements[record.decision.EntitlementID]
	record.decision.Sequence++
	if state == nil || state.revoked || !current.UTC().Before(state.record.ExpiresAt) || record.decision.State == licensing.OnlineStateRevoked {
		record.decision.State = licensing.OnlineStateRevoked
		delete(registry.activeByDevice[record.decision.EntitlementID], record.decision.Device.DeviceID)
	}
	return record.decision, nil
}

func (registry *MemoryRegistry) Deactivate(ctx context.Context, subjectID string, request entitlement.DeactivateRequest, _ time.Time) (ActivationDecision, error) {
	if err := ctx.Err(); err != nil {
		return ActivationDecision{}, err
	}
	if registry == nil {
		return ActivationDecision{}, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement registry is unavailable", nil)
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	record, err := registry.authorizedActivation(subjectID, request.ActivationID, request.DeviceID, request.Sequence)
	if err != nil {
		return ActivationDecision{}, err
	}
	record.decision.Sequence++
	record.decision.State = licensing.OnlineStateRevoked
	delete(registry.activeByDevice[record.decision.EntitlementID], record.decision.Device.DeviceID)
	return record.decision, nil
}

// RevokeEntitlement is the trusted upstream/operator boundary. Clients cannot
// invoke it through the public handler; they learn the signed revoked state on
// their next refresh (or fail when their bounded offline cache expires).
func (registry *MemoryRegistry) RevokeEntitlement(entitlementID string) error {
	if registry == nil {
		return licensing.NewError(licensing.CodeServiceUnavailable, "entitlement registry is unavailable", nil)
	}
	registry.mu.Lock()
	defer registry.mu.Unlock()
	state := registry.entitlements[entitlementID]
	if state == nil {
		return licensing.NewError(licensing.CodeLicenseDenied, "entitlement does not exist", nil)
	}
	state.revoked = true
	return nil
}

func (registry *MemoryRegistry) entitlementFor(subjectID string, binding entitlement.PackageBinding) *entitlementState {
	identifier := registry.lookup[grantKey(subjectID, binding)]
	return registry.entitlements[identifier]
}

func (registry *MemoryRegistry) authorizedActivation(subjectID, activationID, deviceID string, sequence uint64) (*activationRecord, error) {
	record := registry.activations[activationID]
	if record == nil || record.decision.SubjectID != subjectID || record.decision.Device.DeviceID != deviceID {
		return nil, licensing.NewError(licensing.CodeLicenseDenied, "activation was denied", nil)
	}
	if sequence == 0 || sequence != record.decision.Sequence {
		return nil, licensing.NewError(licensing.CodeOnlineReplay, "activation sequence is stale", nil)
	}
	return record, nil
}

func validateEntitlementRecord(record EntitlementRecord) error {
	if !identifier.MatchString(record.EntitlementID) || !identifier.MatchString(record.SubjectID) ||
		validatePackageBinding(record.Package) != nil || record.DeviceLimit < 1 || record.ExpiresAt.IsZero() {
		return licensing.NewError(licensing.CodeLicenseDenied, "entitlement configuration is invalid", nil)
	}
	return nil
}

func grantKey(subjectID string, binding entitlement.PackageBinding) string {
	return subjectID + "\x00" + binding.PublisherID + "\x00" + binding.PublisherKeyID + "\x00" + binding.ProductID + "\x00" + binding.PackageID + "\x00" + binding.ContentKeyID
}

func randomActivationID() (string, error) {
	value := make([]byte, 18)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return "activation_" + base64.RawURLEncoding.EncodeToString(value), nil
}

type IssuanceMaterial struct {
	Package           entitlement.PackageBinding
	IssuerKeyID       string
	ContentKey        []byte
	LicenseSigningKey ed25519.PrivateKey
}

// MaterialProvider is a server-only secret boundary. Resolve must return fresh,
// caller-owned ContentKey and LicenseSigningKey buffers; SignedCacheIssuer
// clears both after use.
type MaterialProvider interface {
	Resolve(ctx context.Context, binding entitlement.PackageBinding) (IssuanceMaterial, error)
}

type CacheIssuer interface {
	Issue(ctx context.Context, request IssueRequest) ([]byte, error)
}

type IssueRequest struct {
	Decision     ActivationDecision
	RequestNonce string
	Current      time.Time
}

// SignedCacheIssuer converts an authorized server decision into the current
// signed online cache. The signed state reuses P1 device-bound claims and key
// envelope primitives without embedding an independently installable
// .odlicense that could bypass online revocation. It has no embedded signing
// key, DEK, or fallback material.
type SignedCacheIssuer struct {
	Materials    MaterialProvider
	OfflineGrace time.Duration
	RefreshAfter time.Duration
}

func (issuer SignedCacheIssuer) Issue(ctx context.Context, request IssueRequest) ([]byte, error) {
	if issuer.Materials == nil {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement issuance material is unavailable", nil)
	}
	if err := validateRequestNonce(request.RequestNonce); err != nil {
		return nil, err
	}
	decision := request.Decision
	if !identifier.MatchString(decision.ActivationID) || !identifier.MatchString(decision.EntitlementID) ||
		!identifier.MatchString(decision.SubjectID) || decision.Sequence == 0 ||
		(decision.State != licensing.OnlineStateActive && decision.State != licensing.OnlineStateRevoked) ||
		validatePackageBinding(decision.Package) != nil {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "entitlement issuance decision is invalid", nil)
	}
	if err := decision.Device.Validate(); err != nil {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "entitlement issuance device is invalid", err)
	}
	material, err := issuer.Materials.Resolve(ctx, decision.Package)
	if err != nil {
		return nil, err
	}
	defer zero(material.ContentKey)
	defer zero(material.LicenseSigningKey)
	if material.Package != decision.Package || !identifier.MatchString(material.IssuerKeyID) ||
		len(material.ContentKey) != scriptpackage.ContentKeySize || len(material.LicenseSigningKey) != ed25519.PrivateKeySize {
		return nil, licensing.NewError(licensing.CodeServiceUnavailable, "entitlement issuance material is invalid", nil)
	}

	current := request.Current.UTC().Truncate(time.Second)
	grace := issuer.OfflineGrace
	if grace == 0 {
		grace = defaultOfflineGrace
	}
	if grace <= 0 || grace > licensing.MaxOfflineGrace {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "offline grace is outside the client bound", nil)
	}
	offlineUntil := current.Add(grace)
	refreshAfter := issuer.RefreshAfter
	if refreshAfter == 0 {
		refreshAfter = grace / 2
	}
	if refreshAfter < 0 || refreshAfter > grace {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "refresh interval is outside the offline window", nil)
	}
	if decision.State == licensing.OnlineStateActive {
		if !decision.EntitlementExpiresAt.IsZero() && decision.EntitlementExpiresAt.UTC().Before(offlineUntil) {
			offlineUntil = decision.EntitlementExpiresAt.UTC().Truncate(time.Second)
		}
		if !offlineUntil.After(current) {
			return nil, licensing.NewError(licensing.CodeLicenseDenied, "product entitlement has expired", nil)
		}
		if current.Add(refreshAfter).After(offlineUntil) {
			refreshAfter = offlineUntil.Sub(current)
		}
	} else {
		// A revoked decision carries only a near-immediately-expiring device
		// envelope because the strict cache schema keeps one claims shape.
		offlineUntil = current.Add(time.Second)
		refreshAfter = 0
	}

	devicePublicKey, err := decision.Device.ECDHPublicKey()
	if err != nil {
		return nil, licensing.NewError(licensing.CodeInvalidOnlineCache, "device public key is invalid", err)
	}
	keyEnvelope, err := licensing.WrapContentKey(material.ContentKey, devicePublicKey, licensing.EnvelopeBinding{
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		ProductID:          decision.Package.ProductID,
		PackageID:          decision.Package.PackageID,
		ContentKeyID:       decision.Package.ContentKeyID,
		DeviceID:           decision.Device.DeviceID,
		DeviceKeyAlgorithm: decision.Device.KeyAlgorithm,
	})
	if err != nil {
		return nil, err
	}
	licenseClaims := licensing.LicenseClaims{
		Format:             licensing.OfflineLicenseFormat,
		FormatVersion:      licensing.OfflineLicenseFormatVersion,
		LicenseID:          decision.ActivationID,
		PublisherID:        decision.Package.PublisherID,
		PublisherKeyID:     material.IssuerKeyID,
		SubjectID:          decision.SubjectID,
		DeviceID:           decision.Device.DeviceID,
		DeviceKeyAlgorithm: decision.Device.KeyAlgorithm,
		ProductID:          decision.Package.ProductID,
		PackageID:          decision.Package.PackageID,
		ContentKeyID:       decision.Package.ContentKeyID,
		IssuedAt:           licensing.FormatLicenseTime(current),
		ExpiresAt:          licensing.FormatLicenseTime(offlineUntil),
		KeyEnvelope:        keyEnvelope,
	}
	return licensing.BuildOnlineCache(licensing.OnlineCacheClaims{
		Format:                licensing.OnlineCacheFormat,
		FormatVersion:         licensing.OnlineCacheFormatVersion,
		ActivationID:          decision.ActivationID,
		EntitlementID:         decision.EntitlementID,
		PackagePublisherKeyID: decision.Package.PublisherKeyID,
		RequestNonce:          request.RequestNonce,
		Sequence:              decision.Sequence,
		State:                 decision.State,
		IssuedAt:              licensing.FormatLicenseTime(current),
		RefreshAfter:          licensing.FormatLicenseTime(current.Add(refreshAfter)),
		OfflineUntil:          licensing.FormatLicenseTime(offlineUntil),
		License:               licenseClaims,
	}, material.LicenseSigningKey)
}

func validatePackageBinding(binding entitlement.PackageBinding) error {
	for _, value := range []string{binding.PublisherID, binding.PublisherKeyID, binding.ProductID, binding.PackageID, binding.ContentKeyID} {
		if !identifier.MatchString(value) {
			return licensing.NewError(licensing.CodeLicenseDenied, "package binding is invalid", nil)
		}
	}
	return nil
}

func validateRequestNonce(value string) error {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(decoded) != 32 || base64.StdEncoding.EncodeToString(decoded) != value {
		return licensing.NewError(licensing.CodeInvalidOnlineCache, "request nonce is invalid", err)
	}
	return nil
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}
