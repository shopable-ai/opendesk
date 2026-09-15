package measurement

import (
	"encoding/json"
	"testing"
)

func TestStructuredOutputContainsP0P3ContractAndLegacyResultFields(t *testing.T) {
	snapshot, reference := testContext(t)
	result, err := BuildRegionResult(snapshot, reference, Rect{X: -1100, Y: 80, Width: 160, Height: 90})
	if err != nil {
		t.Fatal(err)
	}
	outputs, err := result.Outputs()
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(outputs.JSON), &payload); err != nil {
		t.Fatalf("structured output is not JSON: %v", err)
	}
	for _, key := range []string{"schemaVersion", "measurementKind", "reference", "coordinateSpace", "unit", "captureMapping", "result", "evidence"} {
		if _, ok := payload[key]; !ok {
			t.Fatalf("structured output missing %q: %s", key, outputs.JSON)
		}
	}
	if payload["schemaVersion"] != StructuredDataSchemaVersion || payload["measurementKind"] != "region" || payload["unit"] != "logical" {
		t.Fatalf("unexpected structured identity: %#v", payload)
	}
	// Result v2 remains additive/backward compatible for consumers that still
	// read the original top-level fields.
	if payload["kind"] != "region" || payload["version"] != float64(ResultVersion) {
		t.Fatalf("legacy result fields were not preserved: %#v", payload)
	}
	evidence, ok := payload["evidence"].(map[string]any)
	if !ok || evidence["frozenSnapshot"] != true {
		t.Fatalf("frozen snapshot provenance missing: %#v", payload["evidence"])
	}
}

func TestStructuredDataFromEvidenceCarriesPersistedProvenanceWithoutNewGeometry(t *testing.T) {
	frame, result, frozenPNG := evidenceFixture(t)
	ev, err := BuildEvidence("task-structured", "recorder", frame, result, frozenPNG, EvidenceConfidence{Target: .9, Geometry: 1, Pixel: 1, Overall: .95})
	if err != nil {
		t.Fatal(err)
	}
	data, err := StructuredDataFromEvidence(ev)
	if err != nil {
		t.Fatal(err)
	}
	if data.SchemaVersion != StructuredDataSchemaVersion || data.MeasurementKind != result.Kind || data.CaptureMapping != ev.Mapping {
		t.Fatalf("structured evidence changed canonical mapping/result identity: %+v", data)
	}
	if data.Reference.Type != ev.Reference.Type || data.Reference.Bounds != ev.Reference.Bounds {
		t.Fatalf("structured evidence changed canonical reference: %+v", data.Reference)
	}
	if data.Evidence.MeasurementEvidenceVersion != EvidenceVersion || data.Evidence.TaskID != ev.TaskID || data.Evidence.Source != "recorder" {
		t.Fatalf("persisted provenance missing: %+v", data.Evidence)
	}
	if data.Evidence.FrozenPixels == nil || data.Evidence.FrozenPixels.SHA256 != ev.FrozenPixels.SHA256 || data.Evidence.Confidence == nil {
		t.Fatalf("frozen/persisted evidence missing: %+v", data.Evidence)
	}
}
