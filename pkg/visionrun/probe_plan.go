package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type ProbePlanOptions struct{}

type ProbePlanResult struct {
	RunID      string
	ReportPath string
	StepCount  int
}

func RunProbePlan(bundle *Bundle, _ ProbePlanOptions) (*ProbePlanResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	actionability, err := readJSONMap(filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if err != nil {
		return nil, err
	}
	captureContract, err := readJSONMap(filepath.Join(bundle.VerifyDir, "capture_contract.json"))
	if err != nil {
		return nil, err
	}
	targetsPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	chatCandidates, _ := readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))

	targets := arrayOfMaps(targetsPayload["targets"])
	allowed := normalizeStringSlice(actionability["allowedActions"])
	capturesByID := captureContractByID(captureContract)
	steps := make([]map[string]any, 0)
	order := []string{"open_chat", "focus_input", "read_reply"}
	for _, action := range order {
		if !containsString(allowed, action) {
			continue
		}
		target := firstTargetByIntent(targets, action)
		if target == nil {
			continue
		}
		step := map[string]any{
			"id":             "probe_" + action,
			"action":         action,
			"targetId":       target["id"],
			"point":          target["point"],
			"bbox":           target["bbox"],
			"preconditions":  target["preconditions"],
			"postconditions": target["postconditions"],
			"fallbacks":      target["fallbacks"],
			"evidence":       []string{},
		}
		switch action {
		case "open_chat":
			step["candidates"] = chatCandidates["candidates"]
			step["evidence"] = []string{
				artifactPath(bundle.RunID, "infer/chat_candidates.json"),
				artifactPath(bundle.RunID, "evidence/actions/probe_actions.json"),
				artifactPath(bundle.RunID, "verify/capture_contract.json"),
			}
			step["capturePreference"] = "conversation_capture"
			step["visualReference"] = capturesByID["conversation_capture"]
		case "focus_input":
			step["evidence"] = []string{
				artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_results.json"),
				artifactPath(bundle.RunID, "verify/capture_contract.json"),
			}
			step["capturePreference"] = "input_capture"
			step["visualReference"] = capturesByID["input_capture"]
		case "read_reply":
			step["evidence"] = []string{
				artifactPath(bundle.RunID, "evidence/ocr/ocr_probe_results.json"),
				artifactPath(bundle.RunID, "verify/actionability_report.json"),
				artifactPath(bundle.RunID, "verify/capture_contract.json"),
			}
			step["capturePreference"] = "reply_capture"
			step["visualReference"] = capturesByID["reply_capture"]
		}
		steps = append(steps, step)
	}

	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"stepCount":     len(steps),
		"steps":         steps,
		"summary":       "probe execution plan generated from current allowed actions and preferred capture regions",
	}
	reportPath := filepath.Join(bundle.VerifyDir, "probe_execution_plan.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.probe-plan",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     fmt.Sprintf("generated %d probe execution steps", len(steps)),
		"reportPath": artifactPath(bundle.RunID, "verify/probe_execution_plan.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["probeExecutionPlanPath"] = artifactPath(bundle.RunID, "verify/probe_execution_plan.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}
	return &ProbePlanResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/probe_execution_plan.json"),
		StepCount:  len(steps),
	}, nil
}

func captureContractByID(contract map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, capture := range arrayOfMaps(contract["captures"]) {
		id := stringValue(capture["id"])
		if id != "" {
			out[id] = capture
		}
	}
	return out
}
