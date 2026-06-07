package execution

import "fmt"

// LegacySummary 保留原有 summary.json 结构并补充新路径。
type LegacySummary struct {
	ExecutionID       string `json:"execution_id,omitempty"`
	Source            string `json:"source"`
	Ext               string `json:"ext"`
	ScriptHash        string `json:"script_hash"`
	Success           bool   `json:"success"`
	Status            string `json:"status,omitempty"`
	Error             string `json:"error,omitempty"`
	DurationMs        int64  `json:"duration_ms"`
	StdoutPath        string `json:"stdout_path,omitempty"`
	StderrPath        string `json:"stderr_path,omitempty"`
	ScriptSnapshotPath string `json:"script_snapshot_path,omitempty"`
	StartedAt         string `json:"started_at"`
	FinishedAt        string `json:"finished_at"`
	AgentSummaryPath  string `json:"agent_summary_path,omitempty"`
	EventLogPath      string `json:"event_log_path,omitempty"`
}

// WriteLegacySummary 写出兼容旧版的 summary.json。
func WriteLegacySummary(path string, result ExecutionResult, summary AgentSummary) error {
	payload := LegacySummary{
		ExecutionID:        result.ExecutionID,
		Source:             result.Source,
		Ext:                result.Ext,
		ScriptHash:         result.ScriptHash,
		Success:            result.Status == ExecutionStatusSucceeded,
		Status:             string(result.Status),
		Error:              result.Error,
		DurationMs:         result.DurationMs,
		StdoutPath:         result.Artifacts.StdoutPath,
		StderrPath:         result.Artifacts.StderrPath,
		ScriptSnapshotPath: result.Artifacts.ScriptSnapshotPath,
		StartedAt:          summary.StartedAt,
		FinishedAt:         summary.FinishedAt,
		AgentSummaryPath:   result.Artifacts.AgentSummaryPath,
		EventLogPath:       result.Artifacts.EventLogPath,
	}
	if err := writeJSONFile(path, payload); err != nil {
		return fmt.Errorf("write legacy summary: %w", err)
	}
	return nil
}
