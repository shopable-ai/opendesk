package flowinstall

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"opendesk/pkg/flowpackage"
)

const authorityProofUsage = "flow-distribution"

// AuthorityProof is an independent official/market statement. It cannot be
// supplied by flow.json and is useful only when the host already configures
// the referenced authority root for the matching source and usage.
type AuthorityProof struct {
	SchemaVersion        int         `json:"schemaVersion"`
	Source               TrustSource `json:"source"`
	RootKeyID            string      `json:"rootKeyId"`
	Usage                string      `json:"usage"`
	PublisherID          string      `json:"publisherId"`
	PublisherKeyID       string      `json:"publisherKeyId"`
	PublisherFingerprint string      `json:"publisherFingerprint"`
	FlowID               string      `json:"flowId"`
	Version              string      `json:"version"`
	ManifestDigest       string      `json:"manifestDigest"`
	ArchiveDigest        string      `json:"archiveDigest"`
	ExpiresAt            string      `json:"expiresAt"`
	Signature            string      `json:"signature"`
}

type authorityProofClaims struct {
	SchemaVersion        int         `json:"schemaVersion"`
	Source               TrustSource `json:"source"`
	RootKeyID            string      `json:"rootKeyId"`
	Usage                string      `json:"usage"`
	PublisherID          string      `json:"publisherId"`
	PublisherKeyID       string      `json:"publisherKeyId"`
	PublisherFingerprint string      `json:"publisherFingerprint"`
	FlowID               string      `json:"flowId"`
	Version              string      `json:"version"`
	ManifestDigest       string      `json:"manifestDigest"`
	ArchiveDigest        string      `json:"archiveDigest"`
	ExpiresAt            string      `json:"expiresAt"`
}

type AuthorityVerifier struct {
	OfficialRoots map[string]ed25519.PublicKey
	MarketRoots   map[string]ed25519.PublicKey
	Now           func() time.Time
}

func (verifier AuthorityVerifier) Verify(ctx context.Context, proof AuthorityProof, manifest flowpackage.Manifest, manifestDigest, archiveDigest string) (TrustSource, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if proof.SchemaVersion != 1 || proof.Usage != authorityProofUsage || proof.RootKeyID == "" {
		return "", newError(CodeTrustConflict, "authority proof metadata is invalid", nil)
	}
	var roots map[string]ed25519.PublicKey
	switch proof.Source {
	case TrustOfficial:
		roots = verifier.OfficialRoots
	case TrustMarket:
		roots = verifier.MarketRoots
	default:
		return "", newError(CodeTrustConflict, "authority proof source is not official or market", nil)
	}
	root := roots[proof.RootKeyID]
	if len(root) != ed25519.PublicKeySize {
		return "", newError(CodeTrustRequired, "authority proof root is not configured", nil)
	}
	if proof.PublisherID != manifest.PublisherID || proof.PublisherKeyID != manifest.PublisherKeyID ||
		proof.PublisherFingerprint != manifest.PublisherFingerprint || proof.FlowID != manifest.FlowID ||
		proof.Version != manifest.Version || proof.ManifestDigest != manifestDigest || proof.ArchiveDigest != archiveDigest {
		return "", newError(CodeTrustConflict, "authority proof does not match the Flow package", nil)
	}
	expiresAt, err := time.Parse(time.RFC3339, proof.ExpiresAt)
	if err != nil || expiresAt.Location() != time.UTC || expiresAt.Format(time.RFC3339) != proof.ExpiresAt {
		return "", newError(CodeTrustConflict, "authority proof expiry is invalid", err)
	}
	now := time.Now
	if verifier.Now != nil {
		now = verifier.Now
	}
	if !now().UTC().Before(expiresAt) {
		return "", newError(CodeTrustConflict, "authority proof has expired", nil)
	}
	signature, err := hex.DecodeString(proof.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize || !ed25519.Verify(root, authorityProofMessage(proof), signature) {
		return "", newError(CodeTrustConflict, "authority proof signature is invalid", nil)
	}
	return proof.Source, nil
}

func authorityProofMessage(proof AuthorityProof) []byte {
	claims := authorityProofClaims{
		SchemaVersion: proof.SchemaVersion, Source: proof.Source, RootKeyID: proof.RootKeyID, Usage: proof.Usage,
		PublisherID: proof.PublisherID, PublisherKeyID: proof.PublisherKeyID,
		PublisherFingerprint: proof.PublisherFingerprint, FlowID: proof.FlowID, Version: proof.Version,
		ManifestDigest: proof.ManifestDigest, ArchiveDigest: proof.ArchiveDigest, ExpiresAt: proof.ExpiresAt,
	}
	data, err := json.Marshal(claims)
	if err != nil {
		panic(fmt.Sprintf("encode fixed authority proof claims: %v", err))
	}
	return append([]byte("OpenDeskFlowAuthorityProof/v1\x00"), data...)
}
