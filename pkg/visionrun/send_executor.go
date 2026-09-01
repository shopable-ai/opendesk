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

type SendExecutorOptions struct {
	Command    []string
	ReportPath string
}

type SendExecutorResult struct {
	RunID      string
	ReportPath string
	Raw        map[string]any
	Succeeded  bool
}

func RunSendExecutor(bundle *Bundle, opts SendExecutorOptions) (*SendExecutorResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	if len(opts.Command) == 0 {
		return nil, fmt.Errorf("send executor command is required")
	}
	cmd := exec.Command(opts.Command[0], opts.Command[1:]...)
	cmd.Dir = filepath.Dir(bundle.BaseDir)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("send executor command failed: %w (output=%s)", err, strings.TrimSpace(string(output)))
	}
	reportPath := strings.TrimSpace(opts.ReportPath)
	if reportPath == "" {
		return nil, fmt.Errorf("send executor report path is required")
	}
	data, err := os.ReadFile(reportPath)
	if err != nil {
		return nil, fmt.Errorf("read send executor report %s: %w", reportPath, err)
	}
	var report map[string]any
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("decode send executor report %s: %w", reportPath, err)
	}
	normalized := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"sourceReport":  reportPath,
		"timestamp":     stringValue(report["timestamp"]),
		"window":        mapValue(report["window"]),
		"raw":           report,
		"succeeded":     boolValue(report["draftCleared"]) && boolValue(report["selfMessageObserved"]),
	}
	normalizedPath := filepath.Join(bundle.RealAppDir, "send_executor_report.json")
	if err := writeJSON(normalizedPath, normalized); err != nil {
		return nil, err
	}
	return &SendExecutorResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "realapp/send_executor_report.json"),
		Raw:        report,
		Succeeded:  boolValue(report["draftCleared"]) && boolValue(report["selfMessageObserved"]),
	}, nil
}
