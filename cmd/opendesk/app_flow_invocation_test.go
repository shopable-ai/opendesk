package main

import (
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/flowinstall"
)

func TestLoadAppFlowInvocationValidatesStrictSignedProjection(t *testing.T) {
	root := t.TempDir()
	data := []byte(`{
	  "schemaVersion": 1,
	  "effectSummary": "Write one sandbox result.",
	  "parameters": {
	    "amount": {"type": "number", "required": true, "description": "Sandbox amount."},
	    "account": {"type": "string", "required": true}
	  },
	  "fixedInputs": {"account": "sandbox"}
	}`)
	if err := os.WriteFile(filepath.Join(root, appFlowInvocationFile), data, 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := loadAppFlowInvocation(&flowinstall.RunLease{
		Root: root,
		Record: flowinstall.Record{Origin: "odflow"},
	})
	if err != nil {
		t.Fatalf("load invocation: %v", err)
	}
	if got == nil || got.SchemaVersion != 1 || got.EffectSummary != "Write one sandbox result." {
		t.Fatalf("invocation=%+v", got)
	}
	if got.Parameters["amount"].Type != "number" || !got.Parameters["amount"].Required {
		t.Fatalf("amount parameter=%+v", got.Parameters["amount"])
	}
	if got.FixedInputs["account"] != "sandbox" {
		t.Fatalf("fixedInputs=%+v", got.FixedInputs)
	}
}

func TestLoadAppFlowInvocationRejectsUnknownFieldsAndFixedTypeMismatch(t *testing.T) {
	for name, data := range map[string]string{
		"unknown": `{"schemaVersion":1,"effectSummary":"Effect.","unexpected":true}`,
		"fixed-type": `{
		  "schemaVersion":1,
		  "effectSummary":"Effect.",
		  "parameters":{"amount":{"type":"number"}},
		  "fixedInputs":{"amount":"not-a-number"}
		}`,
		"undeclared-fixed": `{
		  "schemaVersion":1,
		  "effectSummary":"Effect.",
		  "parameters":{},
		  "fixedInputs":{"account":"sandbox"}
		}`,
	} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, appFlowInvocationFile), []byte(data), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := loadAppFlowInvocation(&flowinstall.RunLease{
				Root: root,
				Record: flowinstall.Record{Origin: "odflow"},
			}); err == nil {
				t.Fatal("invalid invocation contract was accepted")
			}
		})
	}
}

func TestLoadAppFlowInvocationDoesNotTreatLocalJSSiblingAsSignedContract(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, appFlowInvocationFile), []byte(
		`{"schemaVersion":1,"effectSummary":"Untrusted sibling.","parameters":{}}`,
	), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := loadAppFlowInvocation(&flowinstall.RunLease{
		Root: root,
		Record: flowinstall.Record{Origin: "js"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("local JS sibling unexpectedly became an assistant invocation contract: %+v", got)
	}
}
