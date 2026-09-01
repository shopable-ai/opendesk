package visionrun

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type ActionabilityRefreshOptions struct{}

type ActionabilityRefreshResult struct {
	RunID      string
	ReportPath string
	CanProceed bool
	CanSend    bool
}

func RunActionabilityRefresh(bundle *Bundle, _ ActionabilityRefreshOptions) (*ActionabilityRefreshResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	report, err := readJSONMap(filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if err != nil {
		return nil, err
	}
	ocrResults, err := readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json"))
	if err != nil {
		return nil, err
	}
	chatCandidates, err := readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))
	if err != nil {
		return nil, err
	}
	postSendPlan, err := readJSONMap(filepath.Join(bundle.VerifyDir, "post_send_probe_plan.json"))
	if err != nil {
		return nil, err
	}
	preSendBaseline, err := readJSONMap(filepath.Join(bundle.VerifyDir, "pre_send_baseline.json"))
	if err != nil {
		return nil, err
	}

	ocrByID := map[string]map[string]any{}
	for _, item := range arrayOfMaps(ocrResults["results"]) {
		ocrByID[stringValue(item["id"])] = item
	}

	reports := arrayOfMaps(report["reports"])
	for _, item := range reports {
		action := stringValue(item["action"])
		switch action {
		case "open_chat":
			candidateCount := len(arrayOfMaps(chatCandidates["candidates"]))
			allowed := candidateCount > 0
			item["allowed"] = allowed
			item["score"] = round4(0.86 + minFloat(float64(candidateCount)*0.01, 0.06))
			item["requiredExtraEvidence"] = []string{"target chat name matching against desired target"}
			item["reason"] = fmt.Sprintf("conversation list has %d OCR-ranked row candidates", candidateCount)
			item["evidence"] = []string{"chat_candidates.json", "ocr_probe_results.json"}
		case "focus_input":
			probe := ocrByID["draft_input"]
			allowed := probeHasText(probe)
			item["allowed"] = allowed
			item["score"] = round4(mapAllowedScore(allowed, 0.9, 0.52))
			item["reason"] = "input area OCR probe executed"
			item["preconditionsPassed"] = appendStringUnique(normalizeStringSlice(item["preconditionsPassed"]), "draft_input OCR probe available")
			if !allowed {
				item["preconditionsFailed"] = appendStringUnique(normalizeStringSlice(item["preconditionsFailed"]), "draft_input OCR probe missing")
			}
			item["evidence"] = []string{"evidence/ocr/ocr_probe_results.json"}
		case "read_reply":
			probe := ocrByID["latest_reply_probe"]
			allowed := probeHasText(probe)
			item["allowed"] = allowed
			item["score"] = round4(mapAllowedScore(allowed, 0.84, 0.44))
			item["reason"] = "latest reply OCR probe executed"
			item["preconditionsPassed"] = appendStringUnique(normalizeStringSlice(item["preconditionsPassed"]), "latest_reply_probe OCR available")
			if !allowed {
				item["preconditionsFailed"] = appendStringUnique(normalizeStringSlice(item["preconditionsFailed"]), "latest_reply_probe OCR missing")
			}
			item["evidence"] = []string{"evidence/ocr/ocr_probe_results.json"}
		case "send_message":
			headerProbe := ocrByID["header_identity"]
			draftProbe := ocrByID["draft_input"]
			bestCandidate := mapValue(chatCandidates["bestCandidate"])
			passed := []string{"send target zone inferred"}
			failed := make([]string, 0)
			if probeHasText(headerProbe) {
				passed = append(passed, "header identity OCR available")
			} else {
				failed = append(failed, "header identity OCR missing")
			}
			if probeHasText(draftProbe) {
				passed = append(passed, "draft text OCR available")
			} else {
				failed = append(failed, "draft text OCR missing")
			}
			if stringValue(chatCandidates["targetChatName"]) != "" && boolValue(bestCandidate["matchesTarget"]) {
				passed = append(passed, "target-specific candidate match available")
			} else {
				failed = append(failed, "target-specific identity match is still missing")
			}
			if stringValue(postSendPlan["summary"]) != "" {
				passed = append(passed, "post-send verification plan exists")
			}
			if stringValue(preSendBaseline["summary"]) != "" {
				passed = append(passed, "pre-send baseline exists")
			}
			failed = append(failed, "send remains blocked until post-send verification is actually executed")
			item["allowed"] = false
			item["score"] = round4(0.66)
			item["preconditionsPassed"] = passed
			item["preconditionsFailed"] = failed
			item["reason"] = "send gate now has OCR evidence, pre-send baseline, and post-send plan, but execution stays blocked until post-send verification runs on a real send"
			item["requiredExtraEvidence"] = []string{"post-send self-bubble verification execution"}
			item["evidence"] = []string{"evidence/ocr/ocr_probe_results.json", "infer/chat_candidates.json", "verify/post_send_probe_plan.json", "verify/pre_send_baseline.json"}
		}
	}

	allowedActions := make([]string, 0)
	blockedActions := make([]string, 0)
	for _, item := range reports {
		if allowed, _ := item["allowed"].(bool); allowed {
			allowedActions = append(allowedActions, stringValue(item["action"]))
		} else {
			blockedActions = append(blockedActions, stringValue(item["action"]))
		}
	}
	canProceed := containsString(allowedActions, "open_chat") && containsString(allowedActions, "focus_input") && containsString(allowedActions, "read_reply")
	report["reports"] = reports
	report["allowedActions"] = allowedActions
	report["blockedActions"] = blockedActions
	report["canProceed"] = canProceed
	report["canSend"] = false
	report["status"] = ternaryWarnFail(canProceed)
	report["summary"] = "actionability refreshed with OCR probes and chat candidates; send remains blocked"
	report["updatedAt"] = time.Now().Format(time.RFC3339)

	reportPath := filepath.Join(bundle.VerifyDir, "actionability_report.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.actionability-refresh",
		"status":     ternaryWarnFail(canProceed),
		"runId":      bundle.RunID,
		"detail":     "refreshed actionability report with OCR probe evidence",
		"reportPath": artifactPath(bundle.RunID, "verify/actionability_report.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		payload["status"] = ternaryWarnFail(canProceed)
		payload["canProceed"] = canProceed
		verify := mapValue(payload["verify"])
		verify["allowedActions"] = allowedActions
		verify["blockedActions"] = blockedActions
		verify["canSend"] = false
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &ActionabilityRefreshResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/actionability_report.json"),
		CanProceed: canProceed,
		CanSend:    false,
	}, nil
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func mapAllowedScore(allowed bool, yes, no float64) float64 {
	if allowed {
		return yes
	}
	return no
}

func appendStringUnique(items []string, value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return items
	}
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func ternaryWarnFail(ok bool) string {
	if ok {
		return "warn"
	}
	return "fail"
}
