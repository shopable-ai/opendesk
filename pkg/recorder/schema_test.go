package recorder

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRecorderSchemasParseAndAcceptModelRequiredFields(t *testing.T) {
	tests := []struct {
		name     string
		file     string
		instance any
	}{
		{
			name: "manifest", file: "manifest-v0.1.schema.json",
			instance: Manifest{SchemaVersion: SchemaVersion, SessionID: "rec-schema", Goal: "schema", Source: "test", ObservationPolicy: ObservationStandard, State: SessionStopped, StartedAt: "2026-09-01T00:00:00Z", EventCount: 2, ActionCount: 0, Paths: map[string]string{"root": "root", "rawTrace": "raw", "flow": "flow", "variables": "variables", "report": "report", "generatedJS": "js"}},
		},
		{
			name: "trace", file: "trace-event-v0.1.schema.json",
			instance: TraceEvent{SchemaVersion: SchemaVersion, EventID: "evt-1", EventType: "session.started", SessionID: "rec-schema", Sequence: 1, Timestamp: "2026-09-01T00:00:00Z"},
		},
		{
			name: "flow", file: "flow-v0.1.schema.json",
			instance: Flow{SchemaVersion: SchemaVersion, FlowID: "flow-1", SessionID: "rec-schema", Goal: "schema", Mode: "deterministic", CreatedAt: "2026-09-01T00:00:00Z", Steps: []FlowStep{{StepID: "step-001", SourceActionIDs: []string{"act-1"}, Intent: "click", Target: "target", Action: ActionRequest{Name: "click"}, Verification: Verification{Status: "pass"}, Risk: "low"}}},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "..", "schemas", "recorder", test.file))
			if err != nil {
				t.Fatal(err)
			}
			var schema map[string]any
			if err := json.Unmarshal(data, &schema); err != nil {
				t.Fatal(err)
			}
			if schema["$schema"] == "" || schema["$id"] == "" {
				t.Fatal("schema identity is missing")
			}
			encoded, err := json.Marshal(test.instance)
			if err != nil {
				t.Fatal(err)
			}
			var instance map[string]any
			if err := json.Unmarshal(encoded, &instance); err != nil {
				t.Fatal(err)
			}
			required, ok := schema["required"].([]any)
			if !ok || len(required) == 0 {
				t.Fatal("schema has no required field contract")
			}
			for _, rawName := range required {
				name, _ := rawName.(string)
				if _, exists := instance[name]; !exists {
					t.Fatalf("model instance is missing schema-required field %q", name)
				}
			}
		})
	}
}
