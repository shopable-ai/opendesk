package measurement

import (
	"errors"
	"strings"
	"time"
)

const StructuredDataSchemaVersion = "desktop-measurement/structured/v1"

// StructuredEvidenceSummary is the machine-readable provenance carried by the
// third Measurement output level. Geometry is deliberately not duplicated
// here: Result, Reference and CaptureMapping remain the canonical geometry
// contracts shared by the product UI and automation authoring.
type StructuredEvidenceSummary struct {
	FrozenSnapshot             bool                `json:"frozenSnapshot"`
	SnapshotSampledAt          time.Time           `json:"snapshotSampledAt"`
	Provenance                 []string            `json:"provenance"`
	MeasurementEvidenceVersion string              `json:"measurementEvidenceVersion,omitempty"`
	TaskID                     string              `json:"taskId,omitempty"`
	Source                     string              `json:"source,omitempty"`
	Candidates                 []CandidateEvidence `json:"candidates,omitempty"`
	FrozenPixels               *FrozenPixelEvidence `json:"frozenPixels,omitempty"`
	Confidence                 *EvidenceConfidence `json:"confidence,omitempty"`
}

// StructuredMeasurementData is the stable third output level used by copy,
// save and automation-authoring consumers. It intentionally wraps the existing
// canonical models instead of introducing a parallel Geometry/Mapping schema.
type StructuredMeasurementData struct {
	SchemaVersion    string                    `json:"schemaVersion"`
	MeasurementKind string                    `json:"measurementKind"`
	Reference       Reference                 `json:"reference"`
	CoordinateSpace CoordinateContext         `json:"coordinateSpace"`
	Unit            string                    `json:"unit"`
	CaptureMapping  CaptureMapping            `json:"captureMapping"`
	Result          Result                    `json:"result"`
	Evidence        StructuredEvidenceSummary `json:"evidence"`
}

func StructuredDataFromResult(result Result) (StructuredMeasurementData, error) {
	if err := validateStructuredResult(result); err != nil {
		return StructuredMeasurementData{}, err
	}
	return StructuredMeasurementData{
		SchemaVersion:    StructuredDataSchemaVersion,
		MeasurementKind: result.Kind,
		Reference:       result.Reference,
		CoordinateSpace: result.CoordinateSpace,
		Unit:            "logical",
		CaptureMapping:  result.Snapshot.Mapping,
		Result:          result,
		Evidence: StructuredEvidenceSummary{
			FrozenSnapshot:    true,
			SnapshotSampledAt: result.Snapshot.SampledAt,
			Provenance:        []string{"measurement", "frozen-capture"},
		},
	}, nil
}

// StructuredDataFromEvidence enriches the same product output contract with
// the persisted P3 evidence provenance. The resulting JSON can therefore be
// consumed by Recorder / Human-to-Recipe / Agent-to-Recipe / Qualification /
// Repair without changing coordinate models.
func StructuredDataFromEvidence(ev MeasurementEvidence) (StructuredMeasurementData, error) {
	if err := ValidateEvidence(ev); err != nil {
		return StructuredMeasurementData{}, err
	}
	data, err := StructuredDataFromResult(ev.Result)
	if err != nil {
		return StructuredMeasurementData{}, err
	}
	provenance := []string{"measurement", "frozen-capture"}
	if source := strings.TrimSpace(ev.Source); source != "" {
		provenance = append(provenance, source)
	}
	pixels := ev.FrozenPixels
	confidence := ev.Confidence
	data.Evidence = StructuredEvidenceSummary{
		FrozenSnapshot:             true,
		SnapshotSampledAt:          ev.CapturedAt,
		Provenance:                 provenance,
		MeasurementEvidenceVersion: ev.Version,
		TaskID:                     ev.TaskID,
		Source:                     strings.TrimSpace(ev.Source),
		Candidates:                 append([]CandidateEvidence(nil), ev.Candidates...),
		FrozenPixels:               &pixels,
		Confidence:                 &confidence,
	}
	return data, nil
}

func validateStructuredResult(result Result) error {
	if result.Version != ResultVersion {
		return errors.New("structured measurement data requires the current result version")
	}
	if strings.TrimSpace(result.Kind) == "" {
		return errors.New("structured measurement data requires measurement kind")
	}
	if result.Snapshot.SampledAt.IsZero() {
		return errors.New("structured measurement data requires frozen snapshot sampledAt")
	}
	if result.Snapshot.Mapping.ScaleX <= 0 || result.Snapshot.Mapping.ScaleY <= 0 {
		return errors.New("structured measurement data requires a valid capture mapping")
	}
	if err := result.Reference.Validate(); err != nil {
		return err
	}
	return nil
}
