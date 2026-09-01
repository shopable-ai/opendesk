package visionrun

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type ReplayStateOptions struct{}

type ReplayStateResult struct {
	RunID                  string
	StateSnapshotPath      string
	ReplayResultPath       string
	StateTransitionLogPath string
	ResumeFrom             string
}

func RunReplayState(bundle *Bundle, _ ReplayStateOptions) (*ReplayStateResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	decision, err := readJSONMap(bundle.Decision)
	if err != nil {
		return nil, err
	}
	app, _ := readJSONMap(filepath.Join(bundle.InferDir, "app_classification.json"))
	actionability, _ := readJSONMap(filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	sendSafety, _ := readJSONMap(filepath.Join(bundle.VerifyDir, "send_safety_report.json"))
	runtimeReport, _ := readJSONMap(bundle.RuntimePreflight)

	stateSnapshot := map[string]any{
		"schemaVersion":     schemaVersion,
		"createdAt":         time.Now().Format(time.RFC3339),
		"runId":             bundle.RunID,
		"pageType":          app["pageType"],
		"appClass":          app["appClass"],
		"decisionStatus":    decision["status"],
		"canProceed":        decision["canProceed"],
		"canSend":           mapValue(decision["verify"])["canSend"],
		"allowedActions":    actionability["allowedActions"],
		"blockedActions":    actionability["blockedActions"],
		"runtimeStatus":     runtimeReport["status"],
		"sendSafetyAllowed": sendSafety["allowed"],
	}
	stateSnapshotPath := filepath.Join(bundle.CheckpointsDir, "current_state.json")
	if err := writeJSON(stateSnapshotPath, stateSnapshot); err != nil {
		return nil, err
	}

	transitions, err := readAuditTransitions(bundle.AuditLog)
	if err != nil {
		return nil, err
	}
	transitionLog := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"transitions":   transitions,
	}
	transitionLogPath := filepath.Join(bundle.ReplayDir, "state_transition_log.json")
	if err := writeJSON(transitionLogPath, transitionLog); err != nil {
		return nil, err
	}

	resumeFrom := stringValue(decision["nextStep"])
	replayResult := map[string]any{
		"schemaVersion":     schemaVersion,
		"createdAt":         time.Now().Format(time.RFC3339),
		"runId":             bundle.RunID,
		"status":            decision["status"],
		"resumeFrom":        resumeFrom,
		"currentState":      deriveReplayState(decision, sendSafety),
		"checkpointPath":    artifactPath(bundle.RunID, "checkpoints/current_state.json"),
		"transitionLogPath": artifactPath(bundle.RunID, "replay/state_transition_log.json"),
		"canResume":         resumeFrom != "",
	}
	replayResultPath := filepath.Join(bundle.ReplayDir, "replay_result.json")
	if err := writeJSON(replayResultPath, replayResult); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "replay.state",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     "generated checkpoint and replay state artifacts",
		"resumeFrom": resumeFrom,
		"reportPath": artifactPath(bundle.RunID, "replay/replay_result.json"),
	}); err != nil {
		return nil, err
	}

	return &ReplayStateResult{
		RunID:                  bundle.RunID,
		StateSnapshotPath:      artifactPath(bundle.RunID, "checkpoints/current_state.json"),
		ReplayResultPath:       artifactPath(bundle.RunID, "replay/replay_result.json"),
		StateTransitionLogPath: artifactPath(bundle.RunID, "replay/state_transition_log.json"),
		ResumeFrom:             resumeFrom,
	}, nil
}

func readAuditTransitions(path string) ([]map[string]any, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open audit log %s: %w", path, err)
	}
	defer file.Close()

	out := make([]map[string]any, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var item map[string]any
		if err := json.Unmarshal(line, &item); err != nil {
			return nil, fmt.Errorf("decode audit transition: %w", err)
		}
		out = append(out, item)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan audit log: %w", err)
	}
	return out, nil
}

func deriveReplayState(decision, sendSafety map[string]any) string {
	canProceed, _ := decision["canProceed"].(bool)
	if allowed, _ := sendSafety["allowed"].(bool); allowed {
		return "SEND_ALLOWED"
	}
	if canProceed {
		return "PROBE_READY_SEND_BLOCKED"
	}
	return "REPAIR_REQUIRED"
}
