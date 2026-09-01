package visionrun

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type SendSafetyOptions struct{}

type SendSafetyResult struct {
	RunID      string
	ReportPath string
	Allowed    bool
}

func RunSendSafety(bundle *Bundle, _ SendSafetyOptions) (*SendSafetyResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	app, err := readJSONMap(filepath.Join(bundle.InferDir, "app_classification.json"))
	if err != nil {
		return nil, err
	}
	requirement, _ := readJSONMap(bundle.Requirement)
	zones, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, err
	}
	targets, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	ocrMap, err := readJSONMap(filepath.Join(bundle.InferDir, "ocr_map.json"))
	if err != nil {
		return nil, err
	}
	actionability, err := readJSONMap(filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if err != nil {
		return nil, err
	}

	runtimeReport := map[string]any{}
	if fileExists(bundle.RuntimePreflight) {
		runtimeReport, _ = readJSONMap(bundle.RuntimePreflight)
	}
	ocrProbeResults := map[string]any{}
	if fileExists(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json")) {
		ocrProbeResults, _ = readJSONMap(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json"))
	}
	chatCandidates := map[string]any{}
	if fileExists(filepath.Join(bundle.InferDir, "chat_candidates.json")) {
		chatCandidates, _ = readJSONMap(filepath.Join(bundle.InferDir, "chat_candidates.json"))
	}
	preSendBaseline := map[string]any{}
	if fileExists(filepath.Join(bundle.VerifyDir, "pre_send_baseline.json")) {
		preSendBaseline, _ = readJSONMap(filepath.Join(bundle.VerifyDir, "pre_send_baseline.json"))
	}
	captureTemplateReport := map[string]any{}
	if fileExists(filepath.Join(bundle.VerifyDir, "capture_template_report.json")) {
		captureTemplateReport, _ = readJSONMap(filepath.Join(bundle.VerifyDir, "capture_template_report.json"))
	}

	headerOCR := ocrProbeByID(ocrProbeResults, "header_identity")
	inputOCR := ocrProbeByID(ocrProbeResults, "draft_input")
	targetChatName := strings.TrimSpace(stringValue(requirement["targetChatName"]))
	targetChatVerified := stringValue(app["pageType"]) == "wechat_chat_page" && probeHasText(headerOCR)
	if targetChatName != "" {
		bestCandidate := mapValue(chatCandidates["bestCandidate"])
		targetChatVerified = targetChatVerified && boolValue(bestCandidate["matchesTarget"])
	}
	inputReadyVerified := zoneByID(arrayOfMaps(zones["zones"]), "input_area") != nil && stringValue(inputOCR["status"]) == "pass"
	draftVerified := probeHasText(inputOCR)
	sendTargetVerified := hasTargetIntent(arrayOfMaps(targets["targets"]), "send_message")
	runtimeCanSend, _ := runtimeReport["canSend"].(bool)
	actionabilityCanSend, _ := actionability["canSend"].(bool)
	candidateCount := len(arrayOfMaps(chatCandidates["candidates"]))
	templateMatched := intValue(captureTemplateReport["matched"])
	templateTotal := intValue(captureTemplateReport["total"])
	templateAuditReady := templateMatched >= maxIntSafe(3, templateTotal-1)

	blocking := make([]string, 0)
	if !targetChatVerified {
		if targetChatName != "" {
			blocking = append(blocking, "target chat identity does not yet match configured target")
		} else {
			blocking = append(blocking, "target chat identity is not verified by header OCR")
		}
	}
	if !inputReadyVerified {
		blocking = append(blocking, "input area OCR probe is not verified")
	}
	if !draftVerified {
		blocking = append(blocking, "draft text is not verified")
	}
	if !sendTargetVerified {
		blocking = append(blocking, "send target is not verified")
	}
	if !runtimeCanSend {
		blocking = append(blocking, "runtime preflight does not allow send")
	}
	if !actionabilityCanSend {
		blocking = append(blocking, "actionability gate does not allow send")
	}
	if len(arrayOfMaps(ocrMap["ocrConflicts"])) > 0 {
		blocking = append(blocking, "OCR conflicts remain unresolved")
	}
	if !templateAuditReady {
		blocking = append(blocking, "capture template audit is not stable enough for region-level replay")
	}

	allowed := false
	score := 0.18
	if runtimeCanSend && actionabilityCanSend && targetChatVerified && inputReadyVerified && draftVerified && sendTargetVerified {
		allowed = true
		score = 0.97
	}

	report := map[string]any{
		"schemaVersion":        schemaVersion,
		"createdAt":            time.Now().Format(time.RFC3339),
		"runId":                bundle.RunID,
		"allowed":              allowed,
		"score":                round4(score),
		"targetChatVerified":   targetChatVerified,
		"inputReadyVerified":   inputReadyVerified,
		"draftVerified":        draftVerified,
		"sendTargetVerified":   sendTargetVerified,
		"runtimeCanSend":       runtimeCanSend,
		"actionabilityCanSend": actionabilityCanSend,
		"chatCandidateCount":   candidateCount,
		"templateMatched":      templateMatched,
		"templateTotal":        templateTotal,
		"templateAuditReady":   templateAuditReady,
		"targetChatName":       targetChatName,
		"headerProbeText":      stringValue(headerOCR["text"]),
		"draftProbeText":       stringValue(inputOCR["text"]),
		"preSendBaselineReady": stringValue(preSendBaseline["summary"]) != "",
		"blockingRisks":        blocking,
		"requiredExtraEvidence": []string{
			"header identity verification",
			"draft text verification in input area",
			"send postcondition verification",
		},
		"mustStop": !allowed,
		"summary":  sendSafetySummary(allowed),
	}

	reportPath := filepath.Join(bundle.VerifyDir, "send_safety_report.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.send-safety",
		"status":     ternaryStatus(allowed),
		"runId":      bundle.RunID,
		"detail":     report["summary"],
		"reportPath": artifactPath(bundle.RunID, "verify/send_safety_report.json"),
		"allowed":    allowed,
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["sendSafetyReportPath"] = artifactPath(bundle.RunID, "verify/send_safety_report.json")
		verify["canSend"] = allowed
		verify["sendBlockingRisks"] = blocking
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &SendSafetyResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/send_safety_report.json"),
		Allowed:    allowed,
	}, nil
}

func hasTargetIntent(targets []map[string]any, intent string) bool {
	for _, target := range targets {
		if stringValue(target["intent"]) == intent {
			return true
		}
	}
	return false
}

func sendSafetySummary(allowed bool) string {
	if allowed {
		return "send safety gate passed"
	}
	return "send safety gate blocked; more runtime and conversation evidence required"
}

func ternaryStatus(allowed bool) string {
	if allowed {
		return "pass"
	}
	return "fail"
}

func boolValue(value any) bool {
	if b, ok := value.(bool); ok {
		return b
	}
	return false
}

func ocrProbeByID(report map[string]any, id string) map[string]any {
	for _, item := range arrayOfMaps(report["results"]) {
		if stringValue(item["id"]) == id {
			return item
		}
	}
	return nil
}

func probeHasText(probe map[string]any) bool {
	return stringValue(probe["status"]) == "pass" && strings.TrimSpace(stringValue(probe["text"])) != ""
}
