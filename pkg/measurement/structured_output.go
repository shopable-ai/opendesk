package measurement

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"time"
)

const StructuredDataSchemaVersion = "desktop-measurement/v1"

// CanonicalResult is a serialization alias for Result. It deliberately has no
// methods so StructuredMeasurementData can contain the canonical result
// without recursively applying Result.MarshalJSON.
type CanonicalResult Result

// StructuredEvidenceSummary is the machine-readable provenance carried by the
// third Measurement output level. Geometry is deliberately not duplicated
// here: Result, Reference and CaptureMapping remain the canonical geometry
// contracts shared by the product UI and automation authoring.
type StructuredEvidenceSummary struct {
	FrozenSnapshot             bool                 `json:"frozenSnapshot"`
	SnapshotSampledAt          time.Time            `json:"snapshotSampledAt"`
	Provenance                 []string             `json:"provenance"`
	MeasurementEvidenceVersion string               `json:"measurementEvidenceVersion,omitempty"`
	TaskID                     string               `json:"taskId,omitempty"`
	Source                     string               `json:"source,omitempty"`
	Candidates                 []CandidateEvidence  `json:"candidates,omitempty"`
	FrozenPixels               *FrozenPixelEvidence `json:"frozenPixels,omitempty"`
	Confidence                 *EvidenceConfidence  `json:"confidence,omitempty"`
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
	Result          CanonicalResult           `json:"result"`
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
		Unit:            "logical-unit",
		CaptureMapping:  result.Snapshot.Mapping,
		Result:          CanonicalResult(result),
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

// MarshalJSON keeps every Result v2 field for backward compatibility while
// adding the stable P0/P3 Structured Data envelope fields. Result.Outputs()
// already marshals Result for the third copy/save level, so this additive wire
// format makes the UI, saved JSON and authoring evidence share one contract.
func (r Result) MarshalJSON() ([]byte, error) {
	data, err := StructuredDataFromResult(r)
	if err != nil {
		return nil, err
	}
	return json.Marshal(struct {
		Version         int                  `json:"version"`
		Kind            string               `json:"kind"`
		CoordinateSpace CoordinateContext    `json:"coordinateSpace"`
		Snapshot        Snapshot             `json:"snapshot"`
		Reference       Reference            `json:"reference"`
		Point           *PointMeasurement    `json:"point,omitempty"`
		Region          *RegionMeasurement   `json:"region,omitempty"`
		TwoPoint        *TwoPointMeasurement `json:"twoPoint,omitempty"`
		Spacing         *SpacingMeasurement  `json:"spacing,omitempty"`
		SchemaVersion    string                    `json:"schemaVersion"`
		MeasurementKind string                    `json:"measurementKind"`
		Unit            string                    `json:"unit"`
		CaptureMapping  CaptureMapping            `json:"captureMapping"`
		Result          CanonicalResult           `json:"result"`
		Evidence        StructuredEvidenceSummary `json:"evidence"`
	}{
		Version: r.Version, Kind: r.Kind, CoordinateSpace: r.CoordinateSpace,
		Snapshot: r.Snapshot, Reference: r.Reference, Point: r.Point,
		Region: r.Region, TwoPoint: r.TwoPoint, Spacing: r.Spacing,
		SchemaVersion: data.SchemaVersion, MeasurementKind: data.MeasurementKind,
		Unit: data.Unit, CaptureMapping: data.CaptureMapping,
		Result: data.Result, Evidence: data.Evidence,
	})
}

// UnmarshalJSON accepts both the structured envelope and the legacy raw Result
// representation. This keeps older saved artifacts readable while ensuring the
// structured envelope cannot drift away from the canonical Result geometry.
func (r *Result) UnmarshalJSON(data []byte) error {
	if r == nil {
		return errors.New("measurement result target is nil")
	}
	var probe struct {
		SchemaVersion string `json:"schemaVersion"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return err
	}
	if strings.TrimSpace(probe.SchemaVersion) == "" {
		var legacy CanonicalResult
		if err := json.Unmarshal(data, &legacy); err != nil {
			return err
		}
		*r = Result(legacy)
		return nil
	}
	if probe.SchemaVersion != StructuredDataSchemaVersion {
		return errors.New("unsupported structured measurement schema")
	}
	var envelope StructuredMeasurementData
	if err := json.Unmarshal(data, &envelope); err != nil {
		return err
	}
	canonical := Result(envelope.Result)
	if err := validateStructuredResult(canonical); err != nil {
		return err
	}
	if envelope.MeasurementKind != canonical.Kind {
		return errors.New("structured measurement kind diverges from canonical result")
	}
	if !reflect.DeepEqual(envelope.Reference, canonical.Reference) {
		return errors.New("structured measurement reference diverges from canonical result")
	}
	if envelope.CaptureMapping != canonical.Snapshot.Mapping {
		return errors.New("structured measurement mapping diverges from canonical result")
	}
	if !reflect.DeepEqual(envelope.CoordinateSpace, canonical.CoordinateSpace) {
		return errors.New("structured measurement coordinate space diverges from canonical result")
	}
	if envelope.Unit != "logical-unit" {
		return errors.New("structured measurement unit is unsupported")
	}
	*r = canonical
	return nil
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
