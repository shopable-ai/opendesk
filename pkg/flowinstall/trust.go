package flowinstall

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"opendesk/pkg/flowpackage"
)

type TrustScope string
type TrustStatus string
type TrustSource string

const (
	TrustScopeFlow      TrustScope  = "flow"
	TrustScopePublisher TrustScope  = "publisher"
	TrustActive         TrustStatus = "active"
	TrustRetired        TrustStatus = "retired"
	TrustRevoked        TrustStatus = "revoked"
	TrustUser           TrustSource = "user"
	TrustOfficial       TrustSource = "official"
	TrustMarket         TrustSource = "market"
	TrustTest           TrustSource = "test"
	TrustUsageFlowSign              = "flow-signing"
)

type TrustRecord struct {
	SchemaVersion int         `json:"schemaVersion"`
	PublisherID   string      `json:"publisherId"`
	KeyID         string      `json:"keyId"`
	Fingerprint   string      `json:"fingerprint"`
	Usage         string      `json:"usage"`
	Scope         TrustScope  `json:"scope"`
	FlowID        string      `json:"flowId,omitempty"`
	Status        TrustStatus `json:"status"`
	Source        TrustSource `json:"source"`
	Sequence      uint64      `json:"sequence"`
	CreatedAt     time.Time   `json:"createdAt"`
}

type TrustStore struct{ Root string }

func (store TrustStore) Evaluate(manifest flowpackage.Manifest) (bool, error) {
	records, err := store.list()
	if err != nil {
		return false, err
	}
	effective := make(map[string]TrustRecord)
	for _, record := range records {
		if record.PublisherID == manifest.PublisherID && record.Fingerprint == manifest.PublisherFingerprint && record.Usage == TrustUsageFlowSign && record.Status == TrustRevoked {
			return false, newError(CodePublisherRevoked, "publisher signing key is revoked", nil)
		}
		identity := trustRecordIdentity(record)
		current, exists := effective[identity]
		if !exists || record.Sequence > current.Sequence || (record.Sequence == current.Sequence && trustStatusPriority(record.Status) > trustStatusPriority(current.Status)) {
			effective[identity] = record
		}
	}
	for _, record := range effective {
		if record.PublisherID != manifest.PublisherID || record.KeyID != manifest.PublisherKeyID || record.Fingerprint != manifest.PublisherFingerprint || record.Usage != TrustUsageFlowSign || record.Status != TrustActive {
			continue
		}
		if record.Scope == TrustScopePublisher || (record.Scope == TrustScopeFlow && record.FlowID == manifest.FlowID) {
			return true, nil
		}
	}
	return false, nil
}

func (store TrustStore) Approve(manifest flowpackage.Manifest, scope TrustScope, source TrustSource) error {
	if scope != TrustScopeFlow && scope != TrustScopePublisher {
		return newError(CodeTrustConflict, "trust scope is invalid", nil)
	}
	if source != TrustUser && source != TrustTest {
		return newError(CodeTrustConflict, "trust source is invalid", nil)
	}
	return store.approve(manifest, scope, source)
}

func (store TrustStore) approveAuthority(manifest flowpackage.Manifest, scope TrustScope, source TrustSource) error {
	if source != TrustOfficial && source != TrustMarket {
		return newError(CodeTrustConflict, "authority trust source is invalid", nil)
	}
	return store.approve(manifest, scope, source)
}

func (store TrustStore) approve(manifest flowpackage.Manifest, scope TrustScope, source TrustSource) error {
	record := TrustRecord{
		SchemaVersion: 1, PublisherID: manifest.PublisherID, KeyID: manifest.PublisherKeyID,
		Fingerprint: manifest.PublisherFingerprint, Usage: TrustUsageFlowSign, Scope: scope,
		Status: TrustActive, Source: source, Sequence: 1, CreatedAt: time.Now().UTC(),
	}
	if scope == TrustScopeFlow {
		record.FlowID = manifest.FlowID
	}
	return store.put(record)
}

func (store TrustStore) Revoke(publisherID, keyID, fingerprint string, source TrustSource, sequence uint64) error {
	if sequence == 0 {
		return newError(CodeTrustConflict, "revocation sequence must be positive", nil)
	}
	return store.put(TrustRecord{
		SchemaVersion: 1, PublisherID: publisherID, KeyID: keyID, Fingerprint: fingerprint,
		Usage: TrustUsageFlowSign, Scope: TrustScopePublisher, Status: TrustRevoked,
		Source: source, Sequence: sequence, CreatedAt: time.Now().UTC(),
	})
}

type RotationStatement struct {
	SchemaVersion  int    `json:"schemaVersion"`
	PublisherID    string `json:"publisherId"`
	Usage          string `json:"usage"`
	OldKeyID       string `json:"oldKeyId"`
	OldFingerprint string `json:"oldFingerprint"`
	NewKeyID       string `json:"newKeyId"`
	NewFingerprint string `json:"newFingerprint"`
	Sequence       uint64 `json:"sequence"`
	OldSignature   string `json:"oldSignature"`
	NewProof       string `json:"newProof"`
}

func (statement RotationStatement) message() []byte {
	return []byte(fmt.Sprintf("OpenDeskFlowKeyRotation/v1\x00%d\x00%s\x00%s\x00%s\x00%s\x00%s\x00%d", statement.SchemaVersion, statement.PublisherID, statement.Usage, statement.OldKeyID+"\x00"+statement.OldFingerprint, statement.NewKeyID, statement.NewFingerprint, statement.Sequence))
}

func (store TrustStore) ApplyRotation(ctx context.Context, statement RotationStatement, oldKey, newKey ed25519.PublicKey) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if statement.SchemaVersion != 1 || statement.Usage != TrustUsageFlowSign || statement.Sequence < 2 ||
		flowpackage.PublicKeyFingerprint(oldKey) != statement.OldFingerprint || flowpackage.PublicKeyFingerprint(newKey) != statement.NewFingerprint {
		return newError(CodeTrustConflict, "key rotation identity is invalid", nil)
	}
	oldSignature, oldErr := hex.DecodeString(statement.OldSignature)
	newProof, newErr := hex.DecodeString(statement.NewProof)
	message := statement.message()
	if oldErr != nil || newErr != nil || !ed25519.Verify(oldKey, message, oldSignature) || !ed25519.Verify(newKey, message, newProof) {
		return newError(CodeTrustConflict, "key rotation signatures are invalid", nil)
	}
	records, err := store.list()
	if err != nil {
		return err
	}
	inherited := make([]TrustRecord, 0)
	for index := range records {
		record := records[index]
		if record.PublisherID == statement.PublisherID && record.KeyID == statement.OldKeyID && record.Fingerprint == statement.OldFingerprint && record.Usage == statement.Usage {
			if record.Status == TrustRevoked {
				return newError(CodePublisherRevoked, "revoked publisher key cannot authorize rotation", nil)
			}
		}
		if record.PublisherID == statement.PublisherID && record.Usage == statement.Usage && record.Sequence >= statement.Sequence && record.Fingerprint != statement.NewFingerprint {
			return newError(CodeTrustConflict, "key rotation sequence is stale or conflicting", nil)
		}
	}
	effective := make(map[string]TrustRecord)
	for _, record := range records {
		if record.PublisherID != statement.PublisherID || record.KeyID != statement.OldKeyID || record.Fingerprint != statement.OldFingerprint || record.Usage != statement.Usage {
			continue
		}
		identity := trustRecordIdentity(record)
		current, exists := effective[identity]
		if !exists || record.Sequence > current.Sequence || (record.Sequence == current.Sequence && trustStatusPriority(record.Status) > trustStatusPriority(current.Status)) {
			effective[identity] = record
		}
	}
	for _, record := range effective {
		if record.Status == TrustActive {
			inherited = append(inherited, record)
		}
	}
	if len(inherited) == 0 {
		return newError(CodeTrustRequired, "old publisher key is not trusted", nil)
	}
	for _, source := range inherited {
		retired := source
		retired.Status = TrustRetired
		retired.Sequence = statement.Sequence
		retired.CreatedAt = time.Now().UTC()
		if err := store.put(retired); err != nil {
			return err
		}
		next := source
		next.KeyID = statement.NewKeyID
		next.Fingerprint = statement.NewFingerprint
		next.Status = TrustActive
		next.Sequence = statement.Sequence
		next.CreatedAt = time.Now().UTC()
		if err := store.put(next); err != nil {
			return err
		}
	}
	return nil
}

func (store TrustStore) list() ([]TrustRecord, error) {
	if strings.TrimSpace(store.Root) == "" || !filepath.IsAbs(store.Root) {
		return nil, newError(CodeInvalidRoot, "trust root must be absolute", nil)
	}
	if err := os.MkdirAll(filepath.Join(store.Root, "records"), 0o700); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(filepath.Join(store.Root, "records"))
	if err != nil {
		return nil, err
	}
	records := make([]TrustRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := readBoundedRegular(filepath.Join(store.Root, "records", entry.Name()), 64<<10)
		if readErr != nil {
			return nil, newError(CodeTrustConflict, "cannot read trust record", readErr)
		}
		record, decodeErr := decodeTrustRecord(data)
		if decodeErr != nil {
			return nil, newError(CodeTrustConflict, "trust record is invalid", decodeErr)
		}
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool { return trustRecordToken(records[i]) < trustRecordToken(records[j]) })
	return records, nil
}

func (store TrustStore) put(record TrustRecord) error {
	if err := validateTrustRecord(record); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(store.Root, "records"), 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(store.Root, "records", trustRecordToken(record)+".json"), append(data, '\n'), 0o600)
}

func validateTrustRecord(record TrustRecord) error {
	if record.SchemaVersion != 1 || record.PublisherID == "" || record.KeyID == "" || len(record.Fingerprint) != sha256.Size*2 || record.Usage != TrustUsageFlowSign || record.Sequence == 0 {
		return newError(CodeTrustConflict, "trust record identity is invalid", nil)
	}
	if record.Scope != TrustScopeFlow && record.Scope != TrustScopePublisher {
		return newError(CodeTrustConflict, "trust record scope is invalid", nil)
	}
	if record.Scope == TrustScopeFlow && record.FlowID == "" {
		return newError(CodeTrustConflict, "flow-local trust requires a flowId", nil)
	}
	if record.Scope == TrustScopePublisher && record.FlowID != "" {
		return newError(CodeTrustConflict, "publisher trust must not contain a flowId", nil)
	}
	if record.Status != TrustActive && record.Status != TrustRetired && record.Status != TrustRevoked {
		return newError(CodeTrustConflict, "trust record status is invalid", nil)
	}
	if record.Source != TrustUser && record.Source != TrustOfficial && record.Source != TrustMarket && record.Source != TrustTest {
		return newError(CodeTrustConflict, "trust record source is invalid", nil)
	}
	return nil
}

func trustRecordIdentity(record TrustRecord) string {
	return strings.Join([]string{
		record.PublisherID, record.KeyID, record.Fingerprint, record.Usage,
		string(record.Scope), record.FlowID,
	}, "\x00")
}

func trustStatusPriority(status TrustStatus) int {
	switch status {
	case TrustRevoked:
		return 3
	case TrustRetired:
		return 2
	case TrustActive:
		return 1
	default:
		return 0
	}
}

func trustRecordToken(record TrustRecord) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{
		"OpenDeskFlowTrust/v1", record.PublisherID, record.KeyID, record.Fingerprint,
		string(record.Scope), record.FlowID, string(record.Status), fmt.Sprint(record.Sequence),
	}, "\x00")))
	return hex.EncodeToString(digest[:])
}

func decodeTrustRecord(data []byte) (TrustRecord, error) {
	var record TrustRecord
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&record); err != nil {
		return record, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return record, fmt.Errorf("trailing trust record data")
	}
	return record, validateTrustRecord(record)
}
