package runtimeversion

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestProductVersionSourcesStayAligned(t *testing.T) {
	versionBytes, err := os.ReadFile("../../VERSION")
	if err != nil {
		t.Fatalf("read VERSION: %v", err)
	}
	canonical := strings.TrimSpace(string(versionBytes))
	if canonical == "" {
		t.Fatal("VERSION must not be empty")
	}
	if Current != canonical {
		t.Fatalf("runtimeversion.Current=%q, VERSION=%q", Current, canonical)
	}

	manifestBytes, err := os.ReadFile("../../apps/opendesk/opendesk.app.json")
	if err != nil {
		t.Fatalf("read OpenDesk product manifest: %v", err)
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("parse OpenDesk product manifest: %v", err)
	}
	if got := strings.TrimSpace(manifest.Version); got != canonical {
		t.Fatalf("apps/opendesk/opendesk.app.json version=%q, VERSION=%q", got, canonical)
	}
}
