package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type PreSendBaselineOptions struct{}

type PreSendBaselineResult struct {
	RunID      string
	ReportPath string
}

func RunPreSendBaseline(bundle *Bundle, _ PreSendBaselineOptions) (*PreSendBaselineResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	ocrResults, err := readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json"))
	if err != nil {
		return nil, err
	}
	postSendPlan, err := readJSONMap(filepath.Join(bundle.VerifyDir, "post_send_probe_plan.json"))
	if err != nil {
		return nil, err
	}
	chatCandidates, _ := readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))

	report := map[string]any{
		"schemaVersion":      schemaVersion,
		"createdAt":          time.Now().Format(time.RFC3339),
		"runId":              bundle.RunID,
		"headerProbe":        ocrProbeByID(ocrResults, "header_identity"),
		"draftProbe":         ocrProbeByID(ocrResults, "draft_input"),
		"replyProbe":         ocrProbeByID(ocrResults, "latest_reply_probe"),
		"bestCandidate":      mapValue(chatCandidates["bestCandidate"]),
		"postSendPlanPath":   artifactPath(bundle.RunID, "verify/post_send_probe_plan.json"),
		"postSendProbeCount": postSendPlan["probeCount"],
		"summary":            "pre-send OCR baseline captured for later post-send comparison",
	}
	reportPath := filepath.Join(bundle.VerifyDir, "pre_send_baseline.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.pre-send-baseline",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     "captured pre-send OCR baseline",
		"reportPath": artifactPath(bundle.RunID, "verify/pre_send_baseline.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["preSendBaselinePath"] = artifactPath(bundle.RunID, "verify/pre_send_baseline.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}
	return &PreSendBaselineResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/pre_send_baseline.json"),
	}, nil
}
