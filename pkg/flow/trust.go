package flow

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"opendesk/pkg/scriptpackage"
)

type trustDecision struct {
	Status TrustStatus
	Scope  TrustScope
	Record *TrustRecord
}

func publisherFingerprint(publicKey ed25519.PublicKey) string {
	digest := sha256.Sum256(publicKey)
	return hex.EncodeToString(digest[:])
}

func candidatePublisher(pkg *Package) (ed25519.PublicKey, string, error) {
	if pkg == nil {
		return nil, "", newError(CodeInvalidPackage, "flow package is nil", nil)
	}
	key, err := scriptpackage.ParseEd25519PublicKey(pkg.Files[PublisherPublicKeyEntryName])
	if err != nil {
		return nil, "", newError(CodeInvalidManifest, "trust/publisher.pub is not a valid Ed25519 public key", nil)
	}
	if err := Verify(pkg, key); err != nil {
		return nil, "", err
	}
	return key, publisherFingerprint(key), nil
}

func (store *Store) evaluateTrust(manifest Manifest, fingerprint string) (trustDecision, error) {
	records, err := store.loadTrustRecords()
	if err != nil {
		return trustDecision{}, err
	}
	var trustedFlow *TrustRecord
	var trustedPublisher *TrustRecord
	for index := range records {
		record := records[index]
		if record.PublisherFingerprint != fingerprint || record.PublisherID != manifest.PublisherID || record.PublisherKeyID != manifest.PublisherKeyID {
			continue
		}
		matchesFlow := record.Scope == TrustScopeFlow && record.FlowID == manifest.FlowID
		matchesPublisher := record.Scope == TrustScopePublisher
		if !matchesFlow && !matchesPublisher {
			continue
		}
		if record.Status == TrustStatusRejected {
			copy := record
			return trustDecision{Status: TrustStatusRejected, Scope: record.Scope, Record: &copy}, nil
		}
		copy := record
		if matchesFlow {
			trustedFlow = &copy
		} else if matchesPublisher {
			trustedPublisher = &copy
		}
	}
	if trustedFlow != nil {
		return trustDecision{Status: TrustStatusTrusted, Scope: TrustScopeFlow, Record: trustedFlow}, nil
	}
	if trustedPublisher != nil {
		return trustDecision{Status: TrustStatusTrusted, Scope: TrustScopePublisher, Record: trustedPublisher}, nil
	}
	return trustDecision{}, nil
}

func (store *Store) loadTrustRecords() ([]TrustRecord, error) {
	entries, err := os.ReadDir(store.trustRoot())
	if err != nil {
		return nil, newError(CodeTrustStoreCorrupt, "cannot read flow publisher trust store", err)
	}
	result := make([]TrustRecord, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := readBoundedRegularFile(filepath.Join(store.trustRoot(), entry.Name()), MaxManifestSize)
		if err != nil {
			return nil, newError(CodeTrustStoreCorrupt, "cannot read flow publisher trust record", err)
		}
		var record TrustRecord
		if err := decodeLocalJSON(data, &record); err != nil || validateTrustRecord(record) != nil {
			return nil, newError(CodeTrustStoreCorrupt, "flow publisher trust record is invalid", err)
		}
		result = append(result, record)
	}
	sort.Slice(result, func(i, j int) bool { return trustRecordToken(result[i]) < trustRecordToken(result[j]) })
	return result, nil
}

func validateTrustRecord(record TrustRecord) error {
	if record.SchemaVersion != localStateSchemaVersion || !identifierPattern.MatchString(record.PublisherID) ||
		!identifierPattern.MatchString(record.PublisherKeyID) || !digestPattern.MatchString(record.PublisherFingerprint) {
		return errors.New("invalid trust identity")
	}
	if record.Status != TrustStatusTrusted && record.Status != TrustStatusRejected {
		return errors.New("invalid trust status")
	}
	if record.Scope == TrustScopeFlow {
		if !identifierPattern.MatchString(record.FlowID) {
			return errors.New("invalid flow-scoped trust record")
		}
	} else if record.Scope == TrustScopePublisher {
		if record.FlowID != "" {
			return errors.New("publisher-scoped trust record must not carry flowId")
		}
	} else {
		return errors.New("invalid trust scope")
	}
	return nil
}

func makeTrustRecord(manifest Manifest, fingerprint string, scope TrustScope, status TrustStatus, now time.Time) TrustRecord {
	record := TrustRecord{
		SchemaVersion:        localStateSchemaVersion,
		PublisherID:          manifest.PublisherID,
		PublisherKeyID:       manifest.PublisherKeyID,
		PublisherFingerprint: fingerprint,
		Scope:                scope,
		Status:               status,
		Source:               "user",
		CreatedAt:            now.UTC(),
	}
	if scope == TrustScopeFlow {
		record.FlowID = manifest.FlowID
	}
	return record
}

func trustRecordToken(record TrustRecord) string {
	hash := sha256.New()
	_, _ = hash.Write([]byte("OpenDeskFlowTrust/v1\x00"))
	for _, value := range []string{record.PublisherID, record.PublisherKeyID, record.PublisherFingerprint, string(record.Scope), record.FlowID} {
		_, _ = hash.Write([]byte(value))
		_, _ = hash.Write([]byte{0})
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func (store *Store) trustPath(record TrustRecord) string {
	return filepath.Join(store.trustRoot(), trustRecordToken(record)+".json")
}
