package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type AtomicStepPlanOptions struct{}

type AtomicStepPlanResult struct {
	RunID      string
	ReportPath string
	StepCount  int
}

func RunAtomicStepPlan(bundle *Bundle, _ AtomicStepPlanOptions) (*AtomicStepPlanResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	captureContract, err := readJSONMap(filepath.Join(bundle.VerifyDir, "capture_contract.json"))
	if err != nil {
		return nil, err
	}
	actionability, err := readJSONMap(filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if err != nil {
		return nil, err
	}
	targetsPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	postSendPlan, _ := readJSONMap(filepath.Join(bundle.VerifyDir, "post_send_probe_plan.json"))

	capturesByID := captureContractByID(captureContract)
	targets := arrayOfMaps(targetsPayload["targets"])
	allowed := normalizeStringSlice(actionability["allowedActions"])

	steps := []map[string]any{
		atomicStep("locate_search_area", "search_area", capturesByID["search_capture"], nil, "定位搜索区域模板", []string{"search_capture"}),
		atomicStep("focus_search_input", "search_area", capturesByID["search_capture"], nil, "聚焦搜索框", []string{"search_capture"}),
		atomicStep("type_search_query", "search_area", capturesByID["search_capture"], nil, "在搜索框输入目标账号", []string{"search_capture"}),
		atomicStep("locate_conversation_list", "conversation_list", capturesByID["conversation_capture"], firstTargetByIntent(targets, "open_chat"), "定位会话列表", []string{"conversation_capture"}),
		atomicStep("open_chat", "conversation_list", capturesByID["conversation_capture"], firstTargetByIntent(targets, "open_chat"), "点击目标会话", []string{"conversation_capture"}),
		atomicStep("verify_chat_header", "chat_header", capturesByID["header_capture"], nil, "验证聊天头部身份", []string{"header_capture"}),
		atomicStep("verify_message_context", "message_list", capturesByID["reply_capture"], firstTargetByIntent(targets, "read_reply"), "验证消息区上下文", []string{"reply_capture"}),
		atomicStep("focus_input", "input_area", capturesByID["input_capture"], firstTargetByIntent(targets, "focus_input"), "聚焦输入框", []string{"input_capture"}),
		atomicStep("type_draft", "input_area", capturesByID["input_capture"], nil, "在输入框填写内容", []string{"input_capture"}),
		atomicStep("locate_send_action", "send_action_zone", capturesByID["send_capture"], firstTargetByIntent(targets, "send_message"), "定位发送区域", []string{"send_capture"}),
		atomicStep("click_send", "send_action_zone", capturesByID["send_capture"], firstTargetByIntent(targets, "send_message"), "点击发送", []string{"send_capture"}),
		atomicStep("verify_draft_cleared", "input_area", capturesByID["input_capture"], nil, "验证草稿已清空", []string{"input_capture"}),
		atomicStep("verify_self_message", "message_list", capturesByID["reply_capture"], nil, "验证消息区出现自发消息", []string{"reply_capture"}),
		atomicStep("read_reply", "message_list", capturesByID["reply_capture"], firstTargetByIntent(targets, "read_reply"), "读取回复", []string{"reply_capture"}),
		atomicStep("scroll_message_list", "message_list", capturesByID["reply_capture"], nil, "滚动消息列表", []string{"reply_capture"}),
	}

	for _, step := range steps {
		actionID := stringValue(step["id"])
		switch actionID {
		case "open_chat", "focus_input", "read_reply":
			step["allowedNow"] = containsString(allowed, mapAtomicStepToAction(actionID))
		case "click_send":
			step["allowedNow"] = false
		default:
			step["allowedNow"] = true
		}
	}

	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"stepCount":     len(steps),
		"steps":         steps,
		"bundles": []map[string]any{
			{"id": "bundle_search_chat", "steps": []string{"locate_search_area", "focus_search_input", "type_search_query", "locate_conversation_list", "open_chat"}},
			{"id": "bundle_open_and_focus_input", "steps": []string{"locate_conversation_list", "open_chat", "verify_chat_header", "focus_input"}},
			{"id": "bundle_send_guarded", "steps": []string{"focus_input", "type_draft", "locate_send_action", "click_send", "verify_draft_cleared", "verify_self_message"}},
			{"id": "bundle_read_reply", "steps": []string{"verify_message_context", "scroll_message_list", "read_reply"}},
		},
		"postSendProbeCount": intValue(postSendPlan["probeCount"]),
		"summary":            "atomic step plan generated for single-step execution and gradual bundle integration",
	}
	reportPath := filepath.Join(bundle.VerifyDir, "atomic_step_plan.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.atomic-step-plan",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     fmt.Sprintf("generated %d atomic steps", len(steps)),
		"reportPath": artifactPath(bundle.RunID, "verify/atomic_step_plan.json"),
	}); err != nil {
		return nil, err
	}
	return &AtomicStepPlanResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/atomic_step_plan.json"),
		StepCount:  len(steps),
	}, nil
}

func atomicStep(id, zoneID string, capture map[string]any, target map[string]any, description string, captureRefs []string) map[string]any {
	step := map[string]any{
		"id":               id,
		"zoneId":           zoneID,
		"description":      description,
		"captureRefs":      captureRefs,
		"visualReference":  capture,
		"target":           target,
		"riskLevel":        "low",
		"verificationMode": "visual",
	}
	switch id {
	case "focus_search_input", "type_search_query", "open_chat", "focus_input", "type_draft":
		step["riskLevel"] = "medium"
		step["verificationMode"] = "visual+ocr"
	case "click_send":
		step["riskLevel"] = "high"
	}
	return step
}

func mapAtomicStepToAction(id string) string {
	switch id {
	case "open_chat":
		return "open_chat"
	case "focus_input":
		return "focus_input"
	case "read_reply":
		return "read_reply"
	default:
		return ""
	}
}
