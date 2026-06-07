package execution

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// PrepareArtifacts 准备执行产物目录与路径。
func PrepareArtifacts(logDir, executionID, ext string) (ExecutionArtifacts, error) {
	targetDir := strings.TrimSpace(logDir)
	if targetDir == "" {
		targetDir = filepath.Join(".runtime", "runs", executionID)
	}
	if ext == "" {
		ext = ".js"
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return ExecutionArtifacts{}, fmt.Errorf("create artifact dir %s: %w", targetDir, err)
	}
	return ExecutionArtifacts{
		ExecutionID:        executionID,
		RunDir:             targetDir,
		StdoutPath:         filepath.Join(targetDir, "stdout.log"),
		StderrPath:         filepath.Join(targetDir, "stderr.log"),
		ScriptSnapshotPath: filepath.Join(targetDir, "script_snapshot"+ext),
		SummaryPath:        filepath.Join(targetDir, "summary.json"),
		AgentSummaryPath:   filepath.Join(targetDir, "agent_summary.json"),
		EventLogPath:       filepath.Join(targetDir, "events.ndjson"),
	}, nil
}
