package visionrun

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type WorkerBridgeOptions struct {
	Command    []string
	ReportPath string
	StageLabel string
}

type WorkerBridgeResult struct {
	RunID          string
	ReportPath     string
	ScreenshotPath string
	Window         map[string]any
	Timestamp      string
	Raw            map[string]any
}

func RunWorkerBridge(bundle *Bundle, opts WorkerBridgeOptions) (*WorkerBridgeResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	if len(opts.Command) == 0 {
		return nil, fmt.Errorf("worker bridge command is required")
	}
	cmd := exec.Command(opts.Command[0], opts.Command[1:]...)
	cmd.Dir = filepath.Dir(bundle.BaseDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("worker bridge command failed: %w (output=%s)", err, strings.TrimSpace(string(output)))
	}
	reportPath := strings.TrimSpace(opts.ReportPath)
	if reportPath == "" {
		return nil, fmt.Errorf("worker bridge report path is required")
	}
	data, err := os.ReadFile(reportPath)
	if err != nil {
		return nil, fmt.Errorf("read worker bridge report %s: %w", reportPath, err)
	}
	var report map[string]any
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("decode worker bridge report %s: %w", reportPath, err)
	}
	normalizedScreenshotPath := stringValue(report["screenshotPath"])
	if normalizedScreenshotPath == "" {
		normalizedScreenshotPath = stringValue(report["fullScreenshot"])
	}
	if normalizedScreenshotPath == "" {
		for _, region := range arrayOfMaps(report["regions"]) {
			if shot := stringValue(region["screenshot"]); shot != "" {
				normalizedScreenshotPath = shot
				break
			}
		}
	}
	normalized := map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"runId":          bundle.RunID,
		"stage":          defaultString(opts.StageLabel, string(StageCaptureRealAppScreenshot)),
		"sourceReport":   reportPath,
		"timestamp":      stringValue(report["timestamp"]),
		"window":         mapValue(report["window"]),
		"workerType":     stringValue(report["workerType"]),
		"reportPath":     defaultString(stringValue(report["reportPath"]), reportPath),
		"screenshotPath": normalizedScreenshotPath,
		"raw":            report,
	}
	normalizedPath := filepath.Join(bundle.RealAppDir, "worker_bridge_report.json")
	if err := writeJSON(normalizedPath, normalized); err != nil {
		return nil, err
	}
	return &WorkerBridgeResult{
		RunID:          bundle.RunID,
		ReportPath:     artifactPath(bundle.RunID, "realapp/worker_bridge_report.json"),
		ScreenshotPath: normalizedScreenshotPath,
		Window:         mapValue(report["window"]),
		Timestamp:      stringValue(report["timestamp"]),
		Raw:            report,
	}, nil
}
