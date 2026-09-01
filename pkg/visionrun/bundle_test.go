package visionrun

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitBundleCreatesRunArtifactSkeleton(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "demo-run",
		Goal:          "repair layout regression",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if bundle.RunID != "demo-run" {
		t.Fatalf("unexpected run id: %s", bundle.RunID)
	}

	for _, path := range []string{
		bundle.BaseDir,
		bundle.CaptureDir,
		bundle.DetectDir,
		bundle.InferDir,
		bundle.VerifyDir,
		bundle.CheckpointsDir,
		bundle.ReplayDir,
		bundle.EvidenceDir,
		bundle.EvidenceActionsDir,
		bundle.EvidenceAnchorsDir,
		bundle.EvidenceOCRDir,
		bundle.MirrorDir,
		bundle.CompareDir,
		bundle.Requirement,
		bundle.Preflight,
		bundle.AuditLog,
		bundle.Decision,
	} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected artifact path missing: %s (%v)", path, err)
		}
	}

	requirement := mustReadJSON(t, bundle.Requirement)
	if requirement["runId"] != "demo-run" {
		t.Fatalf("requirement runId mismatch: %+v", requirement)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["status"] != "pending" {
		t.Fatalf("expected pending decision, got %+v", decision)
	}
	if decision["canProceed"] != true {
		t.Fatalf("expected canProceed=true, got %+v", decision)
	}

	auditRaw, err := os.ReadFile(bundle.AuditLog)
	if err != nil {
		t.Fatalf("read audit log: %v", err)
	}
	if !strings.Contains(string(auditRaw), "\"stage\":\"bundle.init\"") {
		t.Fatalf("audit log missing init event: %s", string(auditRaw))
	}
}

func TestInitBundleBlocksWhenPreflightFails(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "fail",
	})

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "bad preflight",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if bundle.RunID != "bad-preflight" {
		t.Fatalf("expected sanitized run id, got %s", bundle.RunID)
	}

	decision := mustReadJSON(t, bundle.Decision)
	if decision["status"] != "blocked" {
		t.Fatalf("expected blocked decision, got %+v", decision)
	}
	if decision["canProceed"] != false {
		t.Fatalf("expected canProceed=false, got %+v", decision)
	}
}

func mustWriteJSON(t *testing.T, path string, payload any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal %s: %v", path, err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustReadJSON(t *testing.T, path string) map[string]any {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	return payload
}
