package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type PostSendVerifierOptions struct{}

type PostSendVerifierResult struct {
	RunID      string
	ReportPath string
	Status     string
}

func RunPostSendVerifier(bundle *Bundle, _ PostSendVerifierOptions) (*PostSendVerifierResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	plan, err := readJSONMap(filepath.Join(bundle.VerifyDir, "post_send_probe_plan.json"))
	if err != nil {
		return nil, err
	}
	baseline, err := readJSONMap(filepath.Join(bundle.VerifyDir, "pre_send_baseline.json"))
	if err != nil {
		return nil, err
	}
	vision := newRuntimeVision()
	provider := preferredOCRProvider(vision, "")

	src, err := openImage(filepath.Join(bundle.CaptureDir, "source.png"))
	if err != nil {
		return nil, err
	}

	results := make([]map[string]any, 0)
	for _, probe := range arrayOfMaps(plan["probes"]) {
		id := sanitizeEvidenceName(stringValue(probe["id"]))
		relPath := filepath.ToSlash(filepath.Join("evidence", "actions", "post_send_"+id+".png"))
		absPath := filepath.Join(bundle.BaseDir, filepath.FromSlash(relPath))
		if _, err := saveCrop(src, absPath, probe["bbox"]); err != nil {
			results = append(results, map[string]any{
				"id":     probe["id"],
				"status": "fail",
				"error":  err.Error(),
			})
			continue
		}
		ocr, err := vision.RunOCR(map[string]interface{}{
			"provider":  provider,
			"imagePath": absPath,
		})
		if err != nil {
			results = append(results, map[string]any{
				"id":     probe["id"],
				"status": "fail",
				"error":  err.Error(),
				"path":   artifactPath(bundle.RunID, relPath),
			})
			continue
		}
		results = append(results, map[string]any{
			"id":        probe["id"],
			"status":    "pass",
			"path":      artifactPath(bundle.RunID, relPath),
			"text":      stringValue(ocr["text"]),
			"lineCount": intValue(ocr["lineCount"]),
			"provider":  stringValue(ocr["provider"]),
		})
	}

	draftBaseline := stringValue(mapValue(baseline["draftProbe"])["text"])
	replyBaseline := stringValue(mapValue(baseline["replyProbe"])["text"])
	draftCurrent := stringValue(resultByID(results, "draft_clear_probe")["text"])
	replyCurrent := stringValue(resultByID(results, "latest_message_probe")["text"])

	draftCleared := normalizedMatchToken(draftCurrent) != normalizedMatchToken(draftBaseline) && draftCurrent != ""
	selfBubbleChanged := normalizedMatchToken(replyCurrent) != normalizedMatchToken(replyBaseline) && replyCurrent != ""

	status := "baseline_only"
	if draftCleared && selfBubbleChanged {
		status = "pass"
	}

	report := map[string]any{
		"schemaVersion":     schemaVersion,
		"createdAt":         time.Now().Format(time.RFC3339),
		"runId":             bundle.RunID,
		"status":            status,
		"draftBaseline":     draftBaseline,
		"draftCurrent":      draftCurrent,
		"replyBaseline":     replyBaseline,
		"replyCurrent":      replyCurrent,
		"draftCleared":      draftCleared,
		"selfBubbleChanged": selfBubbleChanged,
		"results":           results,
		"summary":           "post-send verifier executed against current screenshot; a real send transition is still required for a meaningful pass",
	}
	reportPath := filepath.Join(bundle.VerifyDir, "post_send_verifier_result.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.post-send-verifier",
		"status":     status,
		"runId":      bundle.RunID,
		"detail":     "executed post-send verifier against current screenshot",
		"reportPath": artifactPath(bundle.RunID, "verify/post_send_verifier_result.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["postSendVerifierResultPath"] = artifactPath(bundle.RunID, "verify/post_send_verifier_result.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &PostSendVerifierResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/post_send_verifier_result.json"),
		Status:     status,
	}, nil
}

func resultByID(results []map[string]any, id string) map[string]any {
	for _, item := range results {
		if stringValue(item["id"]) == id {
			return item
		}
	}
	return nil
}
