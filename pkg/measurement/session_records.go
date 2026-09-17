package measurement

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"time"
)

const (
	MeasurementSessionSchemaVersion = "desktop-measurement-session/v1"
	MaxMeasurementSessionRecords    = 100
	MaxMeasurementSessionSnapshots  = 16
)

type MeasurementRecordStatus string

const (
	MeasurementRecordConfirmed MeasurementRecordStatus = "confirmed"
	MeasurementRecordSaved     MeasurementRecordStatus = "saved"
)

// MeasurementSessionSnapshot indexes one immutable frozen source used by one or
// more confirmed records. It intentionally references the canonical
// MeasurementEvidence fields instead of introducing another geometry model.
type MeasurementSessionSnapshot struct {
	Token        SnapshotToken       `json:"token"`
	CapturedAt   time.Time           `json:"capturedAt"`
	Mapping      CaptureMapping      `json:"mapping"`
	Reference    Reference           `json:"reference"`
	FrozenPixels FrozenPixelEvidence `json:"frozenPixels"`
}

// MeasurementSessionRecord is an immutable journal row. Geometry,
// coordinate-space, provenance and product-level relocation evidence remain the
// canonical MeasurementEvidence payload; the top-level fields are indexes for
// downstream Recorder/Authoring consumers and must validate against Evidence.
type MeasurementSessionRecord struct {
	ID               string                  `json:"id"`
	Type             string                  `json:"type"`
	Label            string                  `json:"label,omitempty"`
	Status           MeasurementRecordStatus `json:"status"`
	EvidenceRef      string                  `json:"evidenceRef"`
	Reference        Reference               `json:"reference"`
	Token            SnapshotToken           `json:"token"`
	SnapshotID       string                  `json:"snapshotId"`
	Geometry         Result                  `json:"geometry"`
	CoordinateSpaces CoordinateContext       `json:"coordinateSpaces"`
	Timestamp        time.Time               `json:"timestamp"`
	Source           string                  `json:"source"`
	Evidence         MeasurementEvidence     `json:"evidence"`
}

type MeasurementSessionEnvelope struct {
	SchemaVersion string                       `json:"schemaVersion"`
	SessionID     string                       `json:"sessionId"`
	Snapshots     []MeasurementSessionSnapshot `json:"snapshots"`
	Measurements  []MeasurementSessionRecord   `json:"measurements"`
}

// MeasurementSessionJournal owns the in-memory immutable record collection for
// one Measurement Session. It does not capture, relocate targets, or write
// files. Durable persistence is a separate explicit operation so hover/click
// cannot silently become filesystem side effects.
type MeasurementSessionJournal struct {
	mu       sync.Mutex
	envelope MeasurementSessionEnvelope
}

func NewMeasurementSessionJournal(sessionID string) (*MeasurementSessionJournal, error) {
	sessionID = strings.TrimSpace(sessionID)
	if err := validateMeasurementSessionComponent("sessionId", sessionID); err != nil {
		return nil, err
	}
	return &MeasurementSessionJournal{envelope: MeasurementSessionEnvelope{
		SchemaVersion: MeasurementSessionSchemaVersion,
		SessionID:     sessionID,
		Snapshots:     []MeasurementSessionSnapshot{},
		Measurements:  []MeasurementSessionRecord{},
	}}, nil
}

// AppendConfirmed adds one completed measurement without mutating previous
// records or recapturing the desktop. The caller supplies the already-created
// canonical evidence and an artifact-relative evidenceRef. Any validation or
// retention failure leaves the journal unchanged.
func (journal *MeasurementSessionJournal) AppendConfirmed(recordID, label, evidenceRef string, recordedAt time.Time, evidence MeasurementEvidence) (MeasurementSessionRecord, error) {
	if journal == nil {
		return MeasurementSessionRecord{}, errors.New("measurement session journal is unavailable")
	}
	if err := validateMeasurementSessionComponent("record id", recordID); err != nil {
		return MeasurementSessionRecord{}, err
	}
	if err := validateRelativeArtifactRef(evidenceRef); err != nil {
		return MeasurementSessionRecord{}, err
	}
	if err := ValidateEvidence(evidence); err != nil {
		return MeasurementSessionRecord{}, err
	}
	if evidence.Product == nil {
		return MeasurementSessionRecord{}, errors.New("measurement session records require product evidence with a snapshot token")
	}
	token := evidence.Product.Runtime.Snapshot
	if err := token.Validate(); err != nil {
		return MeasurementSessionRecord{}, err
	}
	if recordedAt.IsZero() {
		recordedAt = time.Now()
	}
	recordType, err := measurementSessionRecordType(evidence.Result.Kind)
	if err != nil {
		return MeasurementSessionRecord{}, err
	}
	clonedEvidence, err := cloneMeasurementEvidence(evidence)
	if err != nil {
		return MeasurementSessionRecord{}, err
	}
	token = clonedEvidence.Product.Runtime.Snapshot
	snapshot := MeasurementSessionSnapshot{
		Token: token, CapturedAt: clonedEvidence.CapturedAt, Mapping: clonedEvidence.Mapping,
		Reference: clonedEvidence.Reference, FrozenPixels: clonedEvidence.FrozenPixels,
	}
	record := MeasurementSessionRecord{
		ID: recordID, Type: recordType, Label: strings.TrimSpace(label), Status: MeasurementRecordConfirmed,
		EvidenceRef: evidenceRef, Reference: clonedEvidence.Reference, Token: token, SnapshotID: token.SnapshotID,
		Geometry: clonedEvidence.Result, CoordinateSpaces: clonedEvidence.Result.CoordinateSpace,
		Timestamp: recordedAt.UTC(), Source: strings.TrimSpace(clonedEvidence.Source), Evidence: clonedEvidence,
	}

	journal.mu.Lock()
	defer journal.mu.Unlock()
	if token.SessionID != journal.envelope.SessionID {
		return MeasurementSessionRecord{}, errors.New("measurement record belongs to a different session")
	}
	if len(journal.envelope.Measurements) >= MaxMeasurementSessionRecords {
		return MeasurementSessionRecord{}, fmt.Errorf("measurement session record limit %d reached", MaxMeasurementSessionRecords)
	}
	for _, existing := range journal.envelope.Measurements {
		if existing.ID == recordID {
			return MeasurementSessionRecord{}, fmt.Errorf("measurement record %q already exists", recordID)
		}
	}
	foundSnapshot := false
	for _, existing := range journal.envelope.Snapshots {
		if existing.Token.SnapshotID != token.SnapshotID {
			continue
		}
		foundSnapshot = true
		if !reflect.DeepEqual(existing, snapshot) {
			return MeasurementSessionRecord{}, errors.New("measurement snapshot identity was reused with different frozen evidence")
		}
		break
	}
	if !foundSnapshot && len(journal.envelope.Snapshots) >= MaxMeasurementSessionSnapshots {
		return MeasurementSessionRecord{}, fmt.Errorf("measurement session snapshot limit %d reached", MaxMeasurementSessionSnapshots)
	}
	if !foundSnapshot {
		journal.envelope.Snapshots = append(journal.envelope.Snapshots, snapshot)
	}
	journal.envelope.Measurements = append(journal.envelope.Measurements, record)
	return cloneMeasurementSessionRecord(record)
}

// MarkSaved applies only after the caller has durable-save acknowledgement.
// The operation is atomic: an unknown ID leaves every record unchanged.
func (journal *MeasurementSessionJournal) MarkSaved(recordIDs ...string) error {
	if journal == nil {
		return errors.New("measurement session journal is unavailable")
	}
	if len(recordIDs) == 0 {
		return errors.New("measurement saved acknowledgement requires at least one record id")
	}
	journal.mu.Lock()
	defer journal.mu.Unlock()
	indexes := make([]int, 0, len(recordIDs))
	seen := map[string]bool{}
	for _, id := range recordIDs {
		if err := validateMeasurementSessionComponent("record id", id); err != nil {
			return err
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		index := -1
		for i := range journal.envelope.Measurements {
			if journal.envelope.Measurements[i].ID == id {
				index = i
				break
			}
		}
		if index < 0 {
			return fmt.Errorf("measurement record %q does not exist", id)
		}
		indexes = append(indexes, index)
	}
	for _, index := range indexes {
		journal.envelope.Measurements[index].Status = MeasurementRecordSaved
	}
	return nil
}

func (journal *MeasurementSessionJournal) Snapshot() (MeasurementSessionEnvelope, error) {
	if journal == nil {
		return MeasurementSessionEnvelope{}, errors.New("measurement session journal is unavailable")
	}
	journal.mu.Lock()
	defer journal.mu.Unlock()
	return cloneMeasurementSessionEnvelope(journal.envelope)
}

// BuildAuthoringInputs lowers every immutable record through the existing
// single-evidence authoring adapter. It preserves one evidenceRef and one
// SnapshotToken per record; it never combines geometry across snapshots.
func (journal *MeasurementSessionJournal) BuildAuthoringInputs(consumer AuthoringConsumer, semanticAvailable bool, now time.Time) ([]AuthoringMeasurementInput, error) {
	envelope, err := journal.Snapshot()
	if err != nil {
		return nil, err
	}
	if err := ValidateMeasurementSessionEnvelope(envelope); err != nil {
		return nil, err
	}
	inputs := make([]AuthoringMeasurementInput, 0, len(envelope.Measurements))
	for _, record := range envelope.Measurements {
		input, err := BuildAuthoringMeasurementInput(consumer, record.EvidenceRef, record.Evidence, semanticAvailable, now)
		if err != nil {
			return nil, fmt.Errorf("measurement record %s authoring handoff: %w", record.ID, err)
		}
		inputs = append(inputs, input)
	}
	return inputs, nil
}

func ValidateMeasurementSessionEnvelope(envelope MeasurementSessionEnvelope) error {
	if envelope.SchemaVersion != MeasurementSessionSchemaVersion {
		return fmt.Errorf("unsupported measurement session schema %q", envelope.SchemaVersion)
	}
	if err := validateMeasurementSessionComponent("sessionId", envelope.SessionID); err != nil {
		return err
	}
	if len(envelope.Measurements) > MaxMeasurementSessionRecords || len(envelope.Snapshots) > MaxMeasurementSessionSnapshots {
		return errors.New("measurement session exceeds retention bounds")
	}
	snapshots := map[string]MeasurementSessionSnapshot{}
	for _, snapshot := range envelope.Snapshots {
		if err := validateMeasurementSessionSnapshot(envelope.SessionID, snapshot); err != nil {
			return err
		}
		if _, exists := snapshots[snapshot.Token.SnapshotID]; exists {
			return fmt.Errorf("duplicate measurement snapshot %q", snapshot.Token.SnapshotID)
		}
		snapshots[snapshot.Token.SnapshotID] = snapshot
	}
	records := map[string]bool{}
	for _, record := range envelope.Measurements {
		if err := validateMeasurementSessionRecord(envelope.SessionID, record, snapshots); err != nil {
			return err
		}
		if records[record.ID] {
			return fmt.Errorf("duplicate measurement record %q", record.ID)
		}
		records[record.ID] = true
	}
	return nil
}

func validateMeasurementSessionSnapshot(sessionID string, snapshot MeasurementSessionSnapshot) error {
	if err := snapshot.Token.Validate(); err != nil {
		return err
	}
	if snapshot.Token.SessionID != sessionID {
		return errors.New("measurement snapshot belongs to a different session")
	}
	if snapshot.CapturedAt.IsZero() {
		return errors.New("measurement session snapshot capturedAt is required")
	}
	if err := snapshot.Reference.Validate(); err != nil {
		return err
	}
	if snapshot.Mapping.ScaleX <= 0 || snapshot.Mapping.ScaleY <= 0 || snapshot.FrozenPixels.SHA256 == "" {
		return errors.New("measurement session snapshot mapping/frozen pixels are invalid")
	}
	return nil
}

func validateMeasurementSessionRecord(sessionID string, record MeasurementSessionRecord, snapshots map[string]MeasurementSessionSnapshot) error {
	if err := validateMeasurementSessionComponent("record id", record.ID); err != nil {
		return err
	}
	if err := validateRelativeArtifactRef(record.EvidenceRef); err != nil {
		return err
	}
	if record.Timestamp.IsZero() {
		return errors.New("measurement record timestamp is required")
	}
	if record.Status != MeasurementRecordConfirmed && record.Status != MeasurementRecordSaved {
		return fmt.Errorf("unsupported measurement record status %q", record.Status)
	}
	if err := ValidateEvidence(record.Evidence); err != nil {
		return err
	}
	if record.Evidence.Product == nil {
		return errors.New("measurement record requires product evidence")
	}
	if record.Token.SessionID != sessionID || record.SnapshotID != record.Token.SnapshotID || !record.Token.Matches(record.Evidence.Product.Runtime.Snapshot) {
		return errors.New("measurement record snapshot token diverges from canonical evidence")
	}
	wantType, err := measurementSessionRecordType(record.Evidence.Result.Kind)
	if err != nil {
		return err
	}
	if record.Type != wantType || !reflect.DeepEqual(record.Reference, record.Evidence.Reference) ||
		!reflect.DeepEqual(record.Geometry, record.Evidence.Result) || !reflect.DeepEqual(record.CoordinateSpaces, record.Evidence.Result.CoordinateSpace) ||
		strings.TrimSpace(record.Source) != strings.TrimSpace(record.Evidence.Source) {
		return errors.New("measurement record index fields diverge from canonical evidence")
	}
	snapshot, ok := snapshots[record.SnapshotID]
	if !ok {
		return fmt.Errorf("measurement record %q references missing snapshot %q", record.ID, record.SnapshotID)
	}
	wantSnapshot := MeasurementSessionSnapshot{
		Token: record.Token, CapturedAt: record.Evidence.CapturedAt, Mapping: record.Evidence.Mapping,
		Reference: record.Evidence.Reference, FrozenPixels: record.Evidence.FrozenPixels,
	}
	if !reflect.DeepEqual(snapshot, wantSnapshot) {
		return errors.New("measurement record snapshot index diverges from canonical evidence")
	}
	return nil
}

func measurementSessionRecordType(resultKind string) (string, error) {
	switch resultKind {
	case "point":
		return "point", nil
	case "region":
		return "region", nil
	case "twoPoint":
		return "point-to-point", nil
	case "spacing":
		return "region-to-region", nil
	default:
		return "", fmt.Errorf("unsupported measurement session result kind %q", resultKind)
	}
}

func validateMeasurementSessionComponent(name, value string) error {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 160 || strings.ContainsAny(value, `/\\`) || value == "." || value == ".." || strings.Contains(value, "..") {
		return fmt.Errorf("measurement %s is not a safe identifier", name)
	}
	return nil
}

func cloneMeasurementEvidence(evidence MeasurementEvidence) (MeasurementEvidence, error) {
	data, err := json.Marshal(evidence)
	if err != nil {
		return MeasurementEvidence{}, err
	}
	var clone MeasurementEvidence
	if err := json.Unmarshal(data, &clone); err != nil {
		return MeasurementEvidence{}, err
	}
	return clone, nil
}

func cloneMeasurementSessionRecord(record MeasurementSessionRecord) (MeasurementSessionRecord, error) {
	data, err := json.Marshal(record)
	if err != nil {
		return MeasurementSessionRecord{}, err
	}
	var clone MeasurementSessionRecord
	if err := json.Unmarshal(data, &clone); err != nil {
		return MeasurementSessionRecord{}, err
	}
	return clone, nil
}

func cloneMeasurementSessionEnvelope(envelope MeasurementSessionEnvelope) (MeasurementSessionEnvelope, error) {
	data, err := json.Marshal(envelope)
	if err != nil {
		return MeasurementSessionEnvelope{}, err
	}
	var clone MeasurementSessionEnvelope
	if err := json.Unmarshal(data, &clone); err != nil {
		return MeasurementSessionEnvelope{}, err
	}
	return clone, nil
}
