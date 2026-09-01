package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type PostSendPlanOptions struct{}

type PostSendPlanResult struct {
	RunID      string
	ReportPath string
}

func RunPostSendPlan(bundle *Bundle, _ PostSendPlanOptions) (*PostSendPlanResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	zonesPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, err
	}
	targetsPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "action_targets.json"))
	if err != nil {
		return nil, err
	}
	captureContract, _ := readJSONMap(filepath.Join(bundle.VerifyDir, "capture_contract.json"))
	captureByZone := capturePreferenceByZoneID(captureContract)
	captureByID := captureContractByID(captureContract)

	zones := arrayOfMaps(zonesPayload["zones"])
	messageZone := zoneByID(zones, "message_list")
	inputZone := zoneByID(zones, "input_area")
	sendTarget := firstTargetByIntent(arrayOfMaps(targetsPayload["targets"]), "send_message")

	probes := make([]map[string]any, 0, 4)
	if inputZone != nil {
		probes = append(probes, map[string]any{
			"id":                "draft_clear_probe",
			"intent":            "post_send_verify",
			"expectedUse":       "input_cleared_after_send",
			"bbox":              inputZone["bbox"],
			"capturePreference": defaultString(captureByZone["input_area"], "input_capture"),
			"visualReference":   captureByID[defaultString(captureByZone["input_area"], "input_capture")],
		})
	}
	if messageZone != nil {
		box := mapValue(messageZone["bbox"])
		x := intValue(box["x"])
		y := intValue(box["y"])
		w := intValue(box["width"])
		h := intValue(box["height"])
		probes = append(probes, map[string]any{
			"id":          "latest_message_probe",
			"intent":      "post_send_verify",
			"expectedUse": "latest_message_region",
			"bbox": map[string]any{
				"x":      x,
				"y":      y + maxIntSafe(0, h-240),
				"width":  w,
				"height": minIntSafe(240, h),
			},
			"capturePreference": defaultString(captureByZone["message_list"], "reply_capture"),
			"visualReference":   captureByID[defaultString(captureByZone["message_list"], "reply_capture")],
		})
		probes = append(probes, map[string]any{
			"id":          "self_bubble_probe",
			"intent":      "post_send_verify",
			"expectedUse": "self_bubble_on_right_side",
			"bbox": map[string]any{
				"x":      x + w/2,
				"y":      y + maxIntSafe(0, h-220),
				"width":  w / 2,
				"height": minIntSafe(220, h),
			},
			"capturePreference": defaultString(captureByZone["message_list"], "reply_capture"),
			"visualReference":   captureByID[defaultString(captureByZone["message_list"], "reply_capture")],
		})
	}
	if sendTarget != nil {
		probes = append(probes, map[string]any{
			"id":                "send_target_probe",
			"intent":            "post_send_verify",
			"expectedUse":       "send_target_still_visible_or_disabled",
			"bbox":              sendTarget["bbox"],
			"capturePreference": defaultString(captureByZone["send_action_zone"], "send_capture"),
			"visualReference":   captureByID[defaultString(captureByZone["send_action_zone"], "send_capture")],
		})
	}

	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"probeCount":    len(probes),
		"probes":        probes,
		"summary":       "post-send verification plan generated; execution result is still required before send can be considered safe",
	}
	reportPath := filepath.Join(bundle.VerifyDir, "post_send_probe_plan.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.post-send-plan",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     fmt.Sprintf("generated %d post-send verification probes", len(probes)),
		"reportPath": artifactPath(bundle.RunID, "verify/post_send_probe_plan.json"),
	}); err != nil {
		return nil, err
	}
	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		verify := mapValue(payload["verify"])
		verify["postSendProbePlanPath"] = artifactPath(bundle.RunID, "verify/post_send_probe_plan.json")
		payload["verify"] = verify
	}); err != nil {
		return nil, err
	}

	return &PostSendPlanResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/post_send_probe_plan.json"),
	}, nil
}

func capturePreferenceByZoneID(contract map[string]any) map[string]string {
	out := map[string]string{}
	for _, capture := range arrayOfMaps(contract["captures"]) {
		zoneID := stringValue(capture["zoneId"])
		id := stringValue(capture["id"])
		if zoneID != "" && id != "" {
			out[zoneID] = id
		}
	}
	return out
}
