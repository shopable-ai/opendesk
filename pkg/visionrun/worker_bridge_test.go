package visionrun

import (
	"path/filepath"
	"testing"
)

func TestRunWorkerBridgeAcceptsAgentProbeReport(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	reportPath := filepath.Join(repoRoot, ".runtime", "temp", "mac", "wechat_agent_region_probe_1.json")
	mustWriteJSON(t, reportPath, map[string]any{
		"timestamp":      "2026-04-06T00:00:00Z",
		"workerType":     "wechat_agent_region_probe",
		"reportPath":     reportPath,
		"window":         map[string]any{"x": 1, "y": 2, "width": 300, "height": 200},
		"fullScreenshot": ".runtime/temp/mac/full.png",
		"regions": []map[string]any{
			{"screenshot": ".runtime/temp/mac/region1.png"},
		},
	})
	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "bridge-agent-probe",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	result, err := RunWorkerBridge(bundle, WorkerBridgeOptions{
		Command:    []string{"/usr/bin/true"},
		ReportPath: reportPath,
	})
	if err != nil {
		t.Fatalf("RunWorkerBridge failed: %v", err)
	}
	if result.ScreenshotPath != ".runtime/temp/mac/full.png" {
		t.Fatalf("expected fullScreenshot fallback, got %+v", result)
	}
}
