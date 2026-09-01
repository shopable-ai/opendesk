package visionrun

import (
	"fmt"
	"image"
	"path/filepath"
	"time"
)

type CaptureContractResult struct {
	RunID      string
	ReportPath string
	Zones      int
}

func RunCaptureContract(bundle *Bundle) (*CaptureContractResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	zonesPayload, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, err
	}
	src, err := openImage(filepath.Join(bundle.CaptureDir, "source.png"))
	if err != nil {
		return nil, err
	}
	sourceBounds := src.Bounds()
	sourceWidth := maxIntSafe(1, sourceBounds.Dx())
	sourceHeight := maxIntSafe(1, sourceBounds.Dy())
	zoneIndex := mapValue(zonesPayload["zoneByID"])
	captures := []map[string]any{
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "search_capture", zoneIndex["search_area"], "search_area", "Precise crop for search and text entry."),
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "conversation_capture", zoneIndex["conversation_list"], "conversation_list", "Precise crop for conversation scan/open."),
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "header_capture", zoneIndex["chat_header"], "chat_header", "Precise crop for target chat identity verification."),
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "input_capture", zoneIndex["input_area"], "input_area", "Precise crop for input focus/draft verification."),
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "send_capture", zoneIndex["send_action_zone"], "send_action_zone", "Precise crop for send affordance/post-send clear checks."),
		buildCaptureEntry(bundle, src, sourceWidth, sourceHeight, "reply_capture", zoneIndex["message_list"], "message_list", "Coarse crop for latest reply/local readback."),
	}
	contract := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"captures":      captures,
	}
	path := filepath.Join(bundle.VerifyDir, "capture_contract.json")
	if err := writeJSON(path, contract); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":         time.Now().Format(time.RFC3339),
		"stage":      "verify.capture-contract",
		"status":     "pass",
		"runId":      bundle.RunID,
		"detail":     "generated recommended capture contract for precise screenshot regions",
		"reportPath": artifactPath(bundle.RunID, "verify/capture_contract.json"),
	}); err != nil {
		return nil, err
	}
	return &CaptureContractResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "verify/capture_contract.json"),
		Zones:      len(captures),
	}, nil
}

func buildCaptureEntry(bundle *Bundle, src image.Image, sourceWidth, sourceHeight int, id string, zoneRaw any, zoneID string, purpose string) map[string]any {
	zone := mapValue(zoneRaw)
	bbox := mapValue(zone["bbox"])
	precision := "high"
	if zoneID == "message_list" {
		precision = "coarse"
	}
	referenceRelPath := filepath.ToSlash(filepath.Join("verify", "capture_refs", id+".png"))
	referenceAbsPath := filepath.Join(bundle.BaseDir, filepath.FromSlash(referenceRelPath))
	if _, err := saveCrop(src, referenceAbsPath, bbox); err != nil {
		referenceRelPath = ""
	}
	avgColor := stringValue(zone["backgroundColor"])
	if avgColor == "" {
		if cropped, err := openImage(referenceAbsPath); err == nil {
			avgColor = averageImageColorHex(cropped)
		}
	}
	return map[string]any{
		"id":              id,
		"zoneId":          zoneID,
		"bbox":            bbox,
		"precision":       precision,
		"purpose":         purpose,
		"backgroundColor": stringValue(zone["backgroundColor"]),
		"zoneConfidence":  floatValue(zone["confidence"]),
		"referenceImagePath": func() string {
			if referenceRelPath == "" {
				return ""
			}
			return artifactPath(bundle.RunID, referenceRelPath)
		}(),
		"anchorPoint": map[string]any{
			"x": intValue(bbox["x"]) + intValue(bbox["width"])/2,
			"y": intValue(bbox["y"]) + intValue(bbox["height"])/2,
		},
		"size": map[string]any{
			"width":       intValue(bbox["width"]),
			"height":      intValue(bbox["height"]),
			"aspectRatio": round4(float64(maxIntSafe(1, intValue(bbox["width"]))) / float64(maxIntSafe(1, intValue(bbox["height"])))),
		},
		"visualFingerprint": map[string]any{
			"avgColor":        avgColor,
			"backgroundColor": stringValue(zone["backgroundColor"]),
			"bboxRatio": map[string]any{
				"x":      round4(float64(intValue(bbox["x"])) / float64(sourceWidth)),
				"y":      round4(float64(intValue(bbox["y"])) / float64(sourceHeight)),
				"width":  round4(float64(intValue(bbox["width"])) / float64(sourceWidth)),
				"height": round4(float64(intValue(bbox["height"])) / float64(sourceHeight)),
			},
		},
		"searchWindow": captureSearchWindow(bbox, sourceWidth, sourceHeight, precision),
		"templateMatch": map[string]any{
			"searchStep":       captureSearchStep(zoneID, precision),
			"scales":           captureScales(zoneID, precision),
			"minScore":         captureMinScore(zoneID, precision),
			"maxColorDistance": captureMaxColorDistance(zoneID, precision),
		},
		"matchHints": captureMatchHints(zoneID, precision),
	}
}

func captureMatchHints(zoneID, precision string) []string {
	hints := []string{"bbox-first", "template-match", "color-check"}
	switch zoneID {
	case "search_area":
		hints = append(hints, "text-field-shape", "ocr-verify")
	case "conversation_list":
		hints = append(hints, "row-cluster-scan", "ocr-disambiguation")
	case "chat_header":
		hints = append(hints, "identity-strip", "ocr-verify")
	case "input_area":
		hints = append(hints, "draft-verify", "focus-hotspot")
	case "send_action_zone":
		hints = append(hints, "top-action-band", "button-affordance")
	case "message_list":
		hints = append(hints, "latest-band-crop", "local-ocr")
	}
	if precision == "coarse" {
		hints = append(hints, "coarse-crop")
	}
	return hints
}

func captureSearchWindow(bbox map[string]any, sourceWidth, sourceHeight int, precision string) map[string]any {
	x := intValue(bbox["x"])
	y := intValue(bbox["y"])
	width := intValue(bbox["width"])
	height := intValue(bbox["height"])
	marginX := maxIntSafe(16, width/8)
	marginY := maxIntSafe(16, height/8)
	if precision == "coarse" {
		marginX = maxIntSafe(marginX, width/5)
		marginY = maxIntSafe(marginY, height/5)
	}
	x0 := maxIntSafe(0, x-marginX)
	y0 := maxIntSafe(0, y-marginY)
	x1 := minIntSafe(sourceWidth, x+width+marginX)
	y1 := minIntSafe(sourceHeight, y+height+marginY)
	return map[string]any{
		"x":      x0,
		"y":      y0,
		"width":  maxIntSafe(1, x1-x0),
		"height": maxIntSafe(1, y1-y0),
	}
}

func captureSearchStep(zoneID, precision string) int {
	if precision == "coarse" {
		return 8
	}
	switch zoneID {
	case "send_action_zone", "search_area", "chat_header":
		return 2
	default:
		return 4
	}
}

func captureScales(zoneID, precision string) []float64 {
	if precision == "coarse" {
		return []float64{0.9, 1.0, 1.1}
	}
	switch zoneID {
	case "send_action_zone", "search_area", "chat_header":
		return []float64{0.95, 1.0, 1.05}
	default:
		return []float64{0.92, 1.0, 1.08}
	}
}

func captureMinScore(zoneID, precision string) float64 {
	if precision == "coarse" {
		return 0.72
	}
	switch zoneID {
	case "search_area", "conversation_list":
		return 0.78
	case "send_action_zone":
		return 0.82
	default:
		return 0.8
	}
}

func captureMaxColorDistance(zoneID, precision string) float64 {
	if precision == "coarse" {
		return 52
	}
	switch zoneID {
	case "search_area", "send_action_zone":
		return 28
	default:
		return 36
	}
}

func averageImageColorHex(img image.Image) string {
	bounds := img.Bounds()
	if bounds.Dx() <= 0 || bounds.Dy() <= 0 {
		return "#000000"
	}
	var rSum, gSum, bSum uint64
	var count uint64
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			rSum += uint64(r >> 8)
			gSum += uint64(g >> 8)
			bSum += uint64(b >> 8)
			count++
		}
	}
	if count == 0 {
		return "#000000"
	}
	return fmt.Sprintf("#%02x%02x%02x", uint8(rSum/count), uint8(gSum/count), uint8(bSum/count))
}
