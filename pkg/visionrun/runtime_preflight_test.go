package visionrun

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"opendesk/automation"
)

type fakeRuntimePage struct {
	report map[string]interface{}
}

func (f *fakeRuntimePage) CheckScreenshotPermissions() map[string]interface{} {
	return f.report
}

type fakeRuntimeWindowManager struct {
	windows []map[string]interface{}
	active  *automation.WindowInfo
	listErr error
}

func (f *fakeRuntimeWindowManager) List() ([]map[string]interface{}, error) {
	return f.windows, f.listErr
}

func (f *fakeRuntimeWindowManager) GetActiveWindow() (*automation.WindowInfo, error) {
	if f.active == nil {
		return nil, fmt.Errorf("no active window")
	}
	return f.active, nil
}

type fakeRuntimeVision struct {
	caps map[string]interface{}
	ocr  map[string]interface{}
	err  error
}

func (f *fakeRuntimeVision) GetCapabilities(options map[string]interface{}) (map[string]interface{}, error) {
	return f.caps, f.err
}

func (f *fakeRuntimeVision) RunOCR(options map[string]interface{}) (map[string]interface{}, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.ocr != nil {
		return f.ocr, nil
	}
	return map[string]interface{}{"text": "", "lineCount": 0}, nil
}

func TestRunRuntimePreflightWarnsInOfflineSourceImageMode(t *testing.T) {
	restoreRuntimeDeps := stubRuntimeDeps(
		&fakeRuntimePage{report: map[string]interface{}{"ok": true, "screenCapture": true, "accessibility": true}},
		&fakeRuntimeWindowManager{
			windows: []map[string]interface{}{{"title": "Notes", "exeName": "Notes"}},
			active:  nil,
		},
		&fakeRuntimeVision{caps: readyLocalVisionCaps()},
	)
	defer restoreRuntimeDeps()

	bundle := mustInitBundleWithSourceImage(t, "runtime-offline")
	result, err := RunRuntimePreflight(bundle, RuntimePreflightOptions{AllowOfflineSourceImage: true})
	if err != nil {
		t.Fatalf("RunRuntimePreflight failed: %v", err)
	}
	if result.Status != "warn" {
		t.Fatalf("expected warn, got %+v", result)
	}
	if !result.CanProbe {
		t.Fatalf("expected canProbe=true, got %+v", result)
	}
	if result.CanSend {
		t.Fatalf("expected canSend=false, got %+v", result)
	}
}

func TestRunRuntimePreflightPassesWhenTargetWindowAndOCRReady(t *testing.T) {
	restoreRuntimeDeps := stubRuntimeDeps(
		&fakeRuntimePage{report: map[string]interface{}{"ok": true, "screenCapture": true, "accessibility": true}},
		&fakeRuntimeWindowManager{
			windows: []map[string]interface{}{{"title": "WeChat", "exeName": "WeChat"}},
			active:  &automation.WindowInfo{Title: "WeChat", ExeName: "WeChat", ProcessID: 42},
		},
		&fakeRuntimeVision{caps: readyLocalVisionCaps()},
	)
	defer restoreRuntimeDeps()

	bundle := mustInitBundleWithSourceImage(t, "runtime-pass")
	result, err := RunRuntimePreflight(bundle, RuntimePreflightOptions{AllowOfflineSourceImage: true})
	if err != nil {
		t.Fatalf("RunRuntimePreflight failed: %v", err)
	}
	if result.Status != "pass" || !result.CanProbe || !result.CanSend {
		t.Fatalf("unexpected runtime preflight result: %+v", result)
	}
	report := mustReadJSON(t, bundle.RuntimePreflight)
	if report["status"] != "pass" {
		t.Fatalf("unexpected report: %+v", report)
	}
}

func stubRuntimeDeps(page runtimePage, wm runtimeWindowManager, vision runtimeVision) func() {
	origPage := newRuntimePage
	origWM := newRuntimeWindowManager
	origVision := newRuntimeVision
	newRuntimePage = func() runtimePage { return page }
	newRuntimeWindowManager = func() runtimeWindowManager { return wm }
	newRuntimeVision = func() runtimeVision { return vision }
	return func() {
		newRuntimePage = origPage
		newRuntimeWindowManager = origWM
		newRuntimeVision = origVision
	}
}

func readyLocalVisionCaps() map[string]interface{} {
	return map[string]interface{}{
		"defaultProvider": "local",
		"providers": []map[string]interface{}{
			{
				"provider":         "local",
				"implemented":      true,
				"endpointRequired": false,
				"switchReady":      true,
			},
		},
	}
}

func mustInitBundleWithSourceImage(t *testing.T, runID string) *Bundle {
	t.Helper()
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, "artifacts", "preflight", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})
	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         runID,
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}
	source := filepath.Join(bundle.CaptureDir, "source.png")
	mustWriteSyntheticLayoutPNG(t, source)
	if _, err := os.Stat(source); err != nil {
		t.Fatalf("source image missing: %v", err)
	}
	return bundle
}
