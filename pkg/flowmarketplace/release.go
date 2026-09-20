package flowmarketplace

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"opendesk/pkg/flowpackage"
)

const releaseAttestationUsage = "flow-marketplace-release"

var marketplaceVersionPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`)

type ReleaseStatus string
type EntitlementPolicy string

const (
	ReleaseDraft     ReleaseStatus = "draft"
	ReleasePublished ReleaseStatus = "published"
	ReleaseYanked    ReleaseStatus = "yanked"
	ReleaseRevoked   ReleaseStatus = "revoked"

	EntitlementFree         EntitlementPolicy = "free"
	EntitlementAccount      EntitlementPolicy = "account"
	EntitlementSubscription EntitlementPolicy = "subscription"
	EntitlementPurchase     EntitlementPolicy = "purchase"
)

type Release struct {
	SchemaVersion                  int               `json:"schemaVersion"`
	MarketplaceID                  string            `json:"marketplaceId"`
	FlowID                         string            `json:"flowId"`
	FlowName                       string            `json:"flowName"`
	ReleaseID                      string            `json:"releaseId"`
	MetadataRevision               int               `json:"metadataRevision,omitempty"`
	Version                        string            `json:"version"`
	PublisherID                    string            `json:"publisherId"`
	PublisherSigningKeyID          string            `json:"publisherSigningKeyId"`
	PublisherSigningKeyFingerprint string            `json:"publisherSigningKeyFingerprint"`
	ArtifactDigest                 string            `json:"artifactDigest"`
	ArtifactSize                   int64             `json:"artifactSize"`
	ArtifactLocation               string            `json:"artifactLocation,omitempty"`
	MinimumOpenDeskVersion         string            `json:"minimumOpenDeskVersion"`
	PublishedAt                    string            `json:"publishedAt"`
	ReleaseStatus                  ReleaseStatus     `json:"releaseStatus"`
	EntitlementPolicy              EntitlementPolicy `json:"entitlementPolicy"`
	UpdateChannel                  string            `json:"updateChannel,omitempty"`
	VerifiedPublisher              bool              `json:"verifiedPublisher,omitempty"`
}

func (release Release) Validate() error {
	switch release.SchemaVersion {
	case 1:
		if release.MetadataRevision != 0 || release.ArtifactLocation != "" {
			return fmt.Errorf("marketplace release v1 cannot carry static distribution fields")
		}
	case 2:
		if release.MetadataRevision < 1 || release.MetadataRevision > 1_000_000_000 {
			return fmt.Errorf("marketplace release metadataRevision is invalid")
		}
		if strings.TrimSpace(release.ArtifactLocation) != release.ArtifactLocation || release.ArtifactLocation == "" || len(release.ArtifactLocation) > 2048 || strings.ContainsAny(release.ArtifactLocation, "\r\n\x00") {
			return fmt.Errorf("marketplace release artifactLocation is invalid")
		}
	default:
		return fmt.Errorf("marketplace release schema version is unsupported")
	}
	for name, value := range map[string]string{
		"marketplaceId": release.MarketplaceID, "flowId": release.FlowID, "releaseId": release.ReleaseID,
		"publisherId": release.PublisherID, "publisherSigningKeyId": release.PublisherSigningKeyID,
	} {
		if !marketplaceIdentifierPattern.MatchString(value) {
			return fmt.Errorf("marketplace release %s is invalid", name)
		}
	}
	if strings.TrimSpace(release.FlowName) != release.FlowName || release.FlowName == "" || len(release.FlowName) > 400 || strings.ContainsAny(release.FlowName, "\r\n\x00") {
		return fmt.Errorf("marketplace release flowName is invalid")
	}
	if !marketplaceVersionPattern.MatchString(release.Version) || !marketplaceVersionPattern.MatchString(release.MinimumOpenDeskVersion) {
		return fmt.Errorf("marketplace release version is invalid")
	}
	if !validLowerSHA256(release.PublisherSigningKeyFingerprint) || !validLowerSHA256(release.ArtifactDigest) {
		return fmt.Errorf("marketplace release digest or publisher fingerprint is invalid")
	}
	if release.ArtifactSize < 1 || release.ArtifactSize > flowpackage.MaxArchiveSize {
		return fmt.Errorf("marketplace release artifact size is invalid")
	}
	publishedAt, err := parseCanonicalUTC(release.PublishedAt)
	if err != nil || publishedAt.After(time.Now().UTC().Add(24*time.Hour)) {
		return fmt.Errorf("marketplace release publishedAt is invalid")
	}
	switch release.ReleaseStatus {
	case ReleaseDraft, ReleasePublished, ReleaseYanked, ReleaseRevoked:
	default:
		return fmt.Errorf("marketplace release status is invalid")
	}
	switch release.EntitlementPolicy {
	case EntitlementFree, EntitlementAccount, EntitlementSubscription, EntitlementPurchase:
	default:
		return fmt.Errorf("marketplace release entitlement policy is invalid")
	}
	if release.UpdateChannel != "" && !marketplaceIdentifierPattern.MatchString(release.UpdateChannel) {
		return fmt.Errorf("marketplace release update channel is invalid")
	}
	return nil
}

func (release Release) ValidateInstallable() error {
	if err := release.Validate(); err != nil {
		return err
	}
	if release.ReleaseStatus != ReleasePublished {
		return fmt.Errorf("marketplace release is not installable: %s", release.ReleaseStatus)
	}
	return nil
}

type ReleaseAttestation struct {
	SchemaVersion int    `json:"schemaVersion"`
	RootKeyID     string `json:"rootKeyId"`
	Usage         string `json:"usage"`
	ExpiresAt     string `json:"expiresAt"`
	Signature     string `json:"signature"`
}

type releaseAttestationClaims struct {
	SchemaVersion                  int               `json:"schemaVersion"`
	RootKeyID                      string            `json:"rootKeyId"`
	Usage                          string            `json:"usage"`
	MarketplaceID                  string            `json:"marketplaceId"`
	FlowID                         string            `json:"flowId"`
	FlowName                       string            `json:"flowName,omitempty"`
	ReleaseID                      string            `json:"releaseId"`
	MetadataRevision               int               `json:"metadataRevision,omitempty"`
	Version                        string            `json:"version"`
	PublisherID                    string            `json:"publisherId"`
	PublisherSigningKeyID          string            `json:"publisherSigningKeyId"`
	PublisherSigningKeyFingerprint string            `json:"publisherSigningKeyFingerprint"`
	ArtifactDigest                 string            `json:"artifactDigest"`
	ArtifactSize                   int64             `json:"artifactSize"`
	ArtifactLocation               string            `json:"artifactLocation,omitempty"`
	MinimumOpenDeskVersion         string            `json:"minimumOpenDeskVersion"`
	PublishedAt                    string            `json:"publishedAt"`
	ReleaseStatus                  ReleaseStatus     `json:"releaseStatus"`
	EntitlementPolicy              EntitlementPolicy `json:"entitlementPolicy"`
	UpdateChannel                  string            `json:"updateChannel,omitempty"`
	VerifiedPublisher              bool              `json:"verifiedPublisher,omitempty"`
	ExpiresAt                      string            `json:"expiresAt"`
}

func ReleaseAttestationMessage(release Release, attestation ReleaseAttestation) ([]byte, error) {
	if release.SchemaVersion != attestation.SchemaVersion || (release.SchemaVersion != 1 && release.SchemaVersion != 2) {
		return nil, fmt.Errorf("marketplace release and attestation schema versions do not match")
	}
	claims := releaseAttestationClaims{
		SchemaVersion: attestation.SchemaVersion, RootKeyID: attestation.RootKeyID, Usage: attestation.Usage,
		MarketplaceID: release.MarketplaceID, FlowID: release.FlowID, ReleaseID: release.ReleaseID,
		MetadataRevision: release.MetadataRevision, Version: release.Version,
		PublisherID: release.PublisherID, PublisherSigningKeyID: release.PublisherSigningKeyID,
		PublisherSigningKeyFingerprint: release.PublisherSigningKeyFingerprint,
		ArtifactDigest: release.ArtifactDigest, ArtifactSize: release.ArtifactSize, ArtifactLocation: release.ArtifactLocation,
		MinimumOpenDeskVersion: release.MinimumOpenDeskVersion, PublishedAt: release.PublishedAt,
		ReleaseStatus: release.ReleaseStatus, EntitlementPolicy: release.EntitlementPolicy,
		UpdateChannel: release.UpdateChannel, VerifiedPublisher: release.VerifiedPublisher, ExpiresAt: attestation.ExpiresAt,
	}
	if release.SchemaVersion == 2 {
		claims.FlowName = release.FlowName
	}
	data, err := json.Marshal(claims)
	if err != nil {
		return nil, err
	}
	prefix := "OpenDeskMarketplaceReleaseAttestation/v1\x00"
	if release.SchemaVersion == 2 {
		prefix = "OpenDeskMarketplaceReleaseAttestation/v2\x00"
	}
	return append([]byte(prefix), data...), nil
}

type ReleaseVerifier struct {
	Roots map[string]ed25519.PublicKey
	Now   func() time.Time
}

func (verifier ReleaseVerifier) Verify(release Release, attestation ReleaseAttestation) error {
	if err := release.ValidateInstallable(); err != nil {
		return err
	}
	if attestation.SchemaVersion != release.SchemaVersion || (attestation.SchemaVersion != 1 && attestation.SchemaVersion != 2) || attestation.Usage != releaseAttestationUsage || !marketplaceIdentifierPattern.MatchString(attestation.RootKeyID) {
		return fmt.Errorf("marketplace release attestation metadata is invalid")
	}
	root := verifier.Roots[attestation.RootKeyID]
	if len(root) != ed25519.PublicKeySize {
		return fmt.Errorf("marketplace release attestation root is not configured")
	}
	expiresAt, err := parseCanonicalUTC(attestation.ExpiresAt)
	if err != nil {
		return fmt.Errorf("marketplace release attestation expiry is invalid")
	}
	now := time.Now
	if verifier.Now != nil {
		now = verifier.Now
	}
	if !now().UTC().Before(expiresAt) {
		return fmt.Errorf("marketplace release attestation has expired")
	}
	signature, err := hex.DecodeString(attestation.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize {
		return fmt.Errorf("marketplace release attestation signature is invalid")
	}
	message, err := ReleaseAttestationMessage(release, attestation)
	if err != nil {
		return err
	}
	if !ed25519.Verify(root, message, signature) {
		return fmt.Errorf("marketplace release attestation signature is invalid")
	}
	return nil
}

func validLowerSHA256(value string) bool {
	if len(value) != sha256.Size*2 || strings.ToLower(value) != value {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}

func parseCanonicalUTC(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil || parsed.Location() != time.UTC || parsed.Format(time.RFC3339) != value {
		return time.Time{}, fmt.Errorf("time must be canonical UTC RFC3339")
	}
	return parsed, nil
}
