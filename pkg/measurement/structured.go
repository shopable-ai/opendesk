package measurement

import (
	"encoding/json"
	"errors"
	"strings"
)

const StructuredDataSchemaVersion = "desktop-measurement/v1"

type structuredResultAlias Result

type StructuredEvidenceSummary struct {
	SnapshotSource string `json:"snapshotSource"`
	PixelSource    string `json:"pixelSource,omitempty"`
	ReferenceSource string `json:"referenceSource"`
}

type StructuredMeasurementData struct {
	SchemaVersion   string                    `json:"schemaVersion"`
	MeasurementKind string                    `json:"measurementKind"`
	Reference       Reference                 `json:"reference"`
	CoordinateSpace CoordinateContext         `json:"coordinateSpace"`
	Unit            string                    `json:"unit"`
	CaptureMapping  CaptureMapping            `json:"captureMapping"`
	Result          structuredResultAlias     `json:"result"`
	Evidence        StructuredEvidenceSummary `json:"evidence"`
}

func (r Result) StructuredData() StructuredMeasurementData {
	pixelSource:=""
	if r.Point!=nil && r.Point.Color!=nil { pixelSource="frozen-capture-pixel" }
	refSource:="manual"
	if r.Reference.Window!=nil { refSource="window" }
	return StructuredMeasurementData{
		SchemaVersion:StructuredDataSchemaVersion,
		MeasurementKind:r.Kind,
		Reference:r.Reference,
		CoordinateSpace:r.CoordinateSpace,
		Unit:"logical-unit",
		CaptureMapping:r.Snapshot.Mapping,
		Result:structuredResultAlias(r),
		Evidence:StructuredEvidenceSummary{SnapshotSource:"frozen-capture",PixelSource:pixelSource,ReferenceSource:refSource},
	}
}

// MarshalJSON makes the third product output a stable machine-consumable
// envelope while keeping the canonical geometry in Result. There is no V2
// geometry or platform-specific result model hidden in the envelope.
func (r Result) MarshalJSON()([]byte,error){return json.Marshal(r.StructuredData())}

// UnmarshalJSON accepts both the structured envelope and the legacy raw Result
// representation so saved evidence and authoring artifacts remain readable.
func (r *Result) UnmarshalJSON(data []byte)error{
	if r==nil{return errors.New("measurement result target is nil")}
	var probe struct{SchemaVersion string `json:"schemaVersion"`}
	if err:=json.Unmarshal(data,&probe);err!=nil{return err}
	if strings.TrimSpace(probe.SchemaVersion)!=""{
		if probe.SchemaVersion!=StructuredDataSchemaVersion{return errors.New("unsupported structured measurement schema")}
		var envelope StructuredMeasurementData
		if err:=json.Unmarshal(data,&envelope);err!=nil{return err}
		canonical:=Result(envelope.Result)
		if canonical.Kind==""||envelope.MeasurementKind!=canonical.Kind{return errors.New("structured measurement kind diverges from canonical result")}
		if envelope.Reference.Type!=canonical.Reference.Type||envelope.Reference.Bounds!=canonical.Reference.Bounds{return errors.New("structured measurement reference diverges from canonical result")}
		if envelope.CaptureMapping!=canonical.Snapshot.Mapping{return errors.New("structured measurement mapping diverges from canonical result")}
		*r=canonical
		return nil
	}
	var legacy structuredResultAlias
	if err:=json.Unmarshal(data,&legacy);err!=nil{return err}
	*r=Result(legacy)
	return nil
}
