package visionrun

import (
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type InferOptions struct{}

type InferResult struct {
	RunID                   string
	LayoutModelPath         string
	AppClassificationPath   string
	ZonesPath               string
	ActionTargetsPath       string
	OCRMapPath              string
	ActionabilityReportPath string
	ZoneCount               int
	TargetCount             int
	CanProceed              bool
	CanSend                 bool
}

func InferStructuralContract(bundle *Bundle) (map[string]any, error) {
	reportPath := filepath.Join(bundle.DetectDir, "regions.json")
	data, err := os.ReadFile(reportPath)
	if err != nil {
		return nil, fmt.Errorf("read detect contract %s: %w", reportPath, err)
	}

	var report map[string]any
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("decode detect contract %s: %w", reportPath, err)
	}

	width, height, err := inferWindowSize(bundle, report)
	if err != nil {
		return nil, err
	}
	regions := normalizeDetectRegions(report["regions"])
	separators := report["separators"]
	columns := deriveColumnsForInference(separators, regions, width, height, filepath.Join(bundle.CaptureDir, "source.png"))
	zones := inferSemanticZones(columns, width, height)
	appClassification := inferAppClassification(columns, zones)
	actionTargets := inferActionTargets(appClassification, zones, columns)
	ocrMap := inferOCRAssistMap(regions, zones, actionTargets)
	actionability := inferActionability(appClassification, zones, actionTargets)
	return map[string]any{
		"report":            report,
		"width":             width,
		"height":            height,
		"regions":           regions,
		"separators":        separators,
		"columns":           columns,
		"zones":             zones,
		"appClassification": appClassification,
		"actionTargets":     actionTargets,
		"ocrMap":            ocrMap,
		"actionability":     actionability,
	}, nil
}

func RunInfer(bundle *Bundle, _ InferOptions) (*InferResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	contract, err := InferStructuralContract(bundle)
	if err != nil {
		return nil, err
	}

	report := mapValue(contract["report"])
	width := intValue(contract["width"])
	height := intValue(contract["height"])
	regions := arrayOfMaps(contract["regions"])
	separators := contract["separators"]
	columns := arrayOfMaps(contract["columns"])
	zones := arrayOfMaps(contract["zones"])
	appClassification := mapValue(contract["appClassification"])
	actionTargets := arrayOfMaps(contract["actionTargets"])
	ocrMap := mapValue(contract["ocrMap"])
	actionability := mapValue(contract["actionability"])

	layoutModelPath := filepath.Join(bundle.DetectDir, "layout_model.json")
	layoutModel := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"sourceImage":   report["sourceImage"],
		"window": map[string]any{
			"x":      0,
			"y":      0,
			"width":  width,
			"height": height,
		},
		"appInference": appClassification,
		"structure": map[string]any{
			"columnCount":  len(columns),
			"columns":      columns,
			"majorZones":   zones,
			"columnRatios": collectColumnRatios(columns),
			"boundaries": map[string]any{
				"vertical":   arrayOfMaps(mapValue(separators)["vertical"]),
				"horizontal": arrayOfMaps(mapValue(separators)["horizontal"]),
			},
		},
		"coarseActionability": map[string]any{
			"allowedActions": actionability["allowedActions"],
			"blockedActions": actionability["blockedActions"],
			"canProceed":     actionability["canProceed"],
			"canSend":        actionability["canSend"],
		},
		"evidence": map[string]any{
			"regionCount": len(regions),
			"separatorCounts": map[string]any{
				"vertical":   len(arrayOfMaps(mapValue(separators)["vertical"])),
				"horizontal": len(arrayOfMaps(mapValue(separators)["horizontal"])),
			},
		},
		"notes": []string{
			"structure-first inference generated from detect/regions.json",
			"mirror/compare is auxiliary and not required for actionability gating",
		},
	}
	if err := writeJSON(layoutModelPath, layoutModel); err != nil {
		return nil, err
	}

	appClassificationPath := filepath.Join(bundle.InferDir, "app_classification.json")
	if err := writeJSON(appClassificationPath, appClassification); err != nil {
		return nil, err
	}

	zonesPath := filepath.Join(bundle.InferDir, "zones.json")
	zonesPayload := map[string]any{
		"schemaVersion":        schemaVersion,
		"createdAt":            time.Now().Format(time.RFC3339),
		"runId":                bundle.RunID,
		"zones":                zones,
		"missingRequiredZones": missingRequiredZones(zones),
		"overlapsOrConflicts":  []map[string]any{},
		"canProceed":           len(missingRequiredZones(zones)) == 0,
		"zoneByID":             zoneIndex(zones),
		"layoutSummary":        buildZoneLayoutSummary(zones, width, height),
	}
	if err := writeJSON(zonesPath, zonesPayload); err != nil {
		return nil, err
	}

	actionTargetsPath := filepath.Join(bundle.InferDir, "action_targets.json")
	actionTargetsPayload := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"targets":       actionTargets,
		"targetCount":   len(actionTargets),
	}
	if err := writeJSON(actionTargetsPath, actionTargetsPayload); err != nil {
		return nil, err
	}

	ocrMapPath := filepath.Join(bundle.InferDir, "ocr_map.json")
	if err := writeJSON(ocrMapPath, ocrMap); err != nil {
		return nil, err
	}

	actionabilityPath := filepath.Join(bundle.VerifyDir, "actionability_report.json")
	if err := writeJSON(actionabilityPath, actionability); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                    time.Now().Format(time.RFC3339),
		"stage":                 "infer.structure",
		"status":                "pass",
		"runId":                 bundle.RunID,
		"detail":                "generated layout_model/app_classification/zones/action_targets/ocr_map",
		"layoutModelPath":       artifactPath(bundle.RunID, "detect/layout_model.json"),
		"appClassificationPath": artifactPath(bundle.RunID, "infer/app_classification.json"),
		"zonesPath":             artifactPath(bundle.RunID, "infer/zones.json"),
		"actionTargetsPath":     artifactPath(bundle.RunID, "infer/action_targets.json"),
		"targetCount":           len(actionTargets),
		"zoneCount":             len(zones),
	}); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                      time.Now().Format(time.RFC3339),
		"stage":                   "verify.actionability",
		"status":                  stringValue(actionability["status"]),
		"runId":                   bundle.RunID,
		"detail":                  "generated structure-first actionability report",
		"actionabilityReportPath": artifactPath(bundle.RunID, "verify/actionability_report.json"),
		"canProceed":              actionability["canProceed"],
		"canSend":                 actionability["canSend"],
	}); err != nil {
		return nil, err
	}

	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		status := stringValue(actionability["status"])
		canProceed := false
		if value, ok := actionability["canProceed"].(bool); ok {
			canProceed = value
		}
		payload["status"] = status
		payload["canProceed"] = canProceed
		if canProceed {
			payload["nextStep"] = "probe-open-chat"
			payload["summary"] = "structure-first artifacts ready; probe-level actions may continue while send remains gated"
			payload["stopCondition"] = ""
		} else {
			payload["nextStep"] = "repair-page-inference"
			payload["summary"] = "structure-first gate failed; stop before any high-risk action"
			payload["stopCondition"] = "app/page inference or required zones incomplete"
		}
		payload["infer"] = map[string]any{
			"layoutModelPath":       artifactPath(bundle.RunID, "detect/layout_model.json"),
			"appClassificationPath": artifactPath(bundle.RunID, "infer/app_classification.json"),
			"zonesPath":             artifactPath(bundle.RunID, "infer/zones.json"),
			"actionTargetsPath":     artifactPath(bundle.RunID, "infer/action_targets.json"),
			"ocrMapPath":            artifactPath(bundle.RunID, "infer/ocr_map.json"),
		}
		payload["verify"] = map[string]any{
			"actionabilityReportPath": artifactPath(bundle.RunID, "verify/actionability_report.json"),
			"allowedActions":          actionability["allowedActions"],
			"blockedActions":          actionability["blockedActions"],
			"canSend":                 actionability["canSend"],
		}
	}); err != nil {
		return nil, err
	}

	canProceed, _ := actionability["canProceed"].(bool)
	canSend, _ := actionability["canSend"].(bool)
	return &InferResult{
		RunID:                   bundle.RunID,
		LayoutModelPath:         artifactPath(bundle.RunID, "detect/layout_model.json"),
		AppClassificationPath:   artifactPath(bundle.RunID, "infer/app_classification.json"),
		ZonesPath:               artifactPath(bundle.RunID, "infer/zones.json"),
		ActionTargetsPath:       artifactPath(bundle.RunID, "infer/action_targets.json"),
		OCRMapPath:              artifactPath(bundle.RunID, "infer/ocr_map.json"),
		ActionabilityReportPath: artifactPath(bundle.RunID, "verify/actionability_report.json"),
		ZoneCount:               len(zones),
		TargetCount:             len(actionTargets),
		CanProceed:              canProceed,
		CanSend:                 canSend,
	}, nil
}

func buildZoneLayoutSummary(zones []map[string]any, width, height int) map[string]any {
	summary := map[string]any{
		"windowWidth":  width,
		"windowHeight": height,
	}
	for _, zone := range zones {
		id := stringValue(zone["id"])
		if id == "" {
			continue
		}
		box := mapValue(zone["bbox"])
		summary[id] = map[string]any{
			"bbox":            box,
			"widthRatio":      round4(float64(intValue(box["width"])) / float64(maxIntSafe(1, width))),
			"heightRatio":     round4(float64(intValue(box["height"])) / float64(maxIntSafe(1, height))),
			"backgroundColor": stringValue(zone["backgroundColor"]),
		}
	}
	return summary
}

func zoneIndex(zones []map[string]any) map[string]any {
	out := map[string]any{}
	for _, zone := range zones {
		id := stringValue(zone["id"])
		if id != "" {
			out[id] = zone
		}
	}
	return out
}

func collectColumnRatios(columns []map[string]any) []float64 {
	out := make([]float64, 0, len(columns))
	for _, col := range columns {
		out = append(out, round4(floatValue(col["ratio"])))
	}
	return out
}

func inferWindowSize(bundle *Bundle, report map[string]any) (int, int, error) {
	window := mapValue(report["window"])
	width := intValue(window["width"])
	height := intValue(window["height"])
	if width > 0 && height > 0 {
		return width, height, nil
	}

	sourcePath := filepath.Join(bundle.CaptureDir, "source.png")
	file, err := os.Open(sourcePath)
	if err != nil {
		return 0, 0, fmt.Errorf("open source image %s: %w", sourcePath, err)
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return 0, 0, fmt.Errorf("decode source image %s: %w", sourcePath, err)
	}
	bounds := img.Bounds()
	return bounds.Dx(), bounds.Dy(), nil
}

func deriveColumnsForInference(separators any, regions []map[string]any, width, height int, sourceImagePath string) []map[string]any {
	xBounds := deriveAxisBoundaries("vertical", separators, regions, width, height)
	xBounds = refineVerticalBoundariesFromSourceImage(sourceImagePath, xBounds, width, height)
	if shouldInferConversationBoundary(xBounds, width) {
		if extra, ok := inferConversationBoundaryFromSourceImage(sourceImagePath, xBounds, width, height); ok {
			xBounds = append(xBounds, extra)
			xBounds = dedupeBoundaries(xBounds, 48, width)
		}
	}
	columns := make([]map[string]any, 0, len(xBounds)-1)
	for i := 0; i < len(xBounds)-1; i++ {
		x0 := xBounds[i]
		x1 := xBounds[i+1]
		if x1 <= x0 {
			continue
		}
		rows := deriveRowsForInference(i, x0, x1, separators, regions, width, height)
		columns = append(columns, map[string]any{
			"id":    fmt.Sprintf("col_%02d", i+1),
			"x":     x0,
			"width": x1 - x0,
			"ratio": round4(float64(x1-x0) / float64(maxIntSafe(1, width))),
			"rows":  rows,
		})
	}
	return columns
}

func refineVerticalBoundariesFromSourceImage(sourceImagePath string, bounds []int, width, height int) []int {
	if strings.TrimSpace(sourceImagePath) == "" || len(bounds) <= 2 {
		return bounds
	}
	img, err := openImage(sourceImagePath)
	if err != nil {
		return bounds
	}
	refined := make([]int, 0, len(bounds))
	refined = append(refined, 0)
	for _, pos := range bounds[1 : len(bounds)-1] {
		start := maxIntSafe(1, pos-24)
		end := minIntSafe(width-1, pos+24)
		bestPos, _ := bestVerticalBoundaryInRange(img, start, end, height)
		refined = append(refined, bestPos)
	}
	refined = append(refined, width)
	return dedupeBoundaries(refined, 40, width)
}

func shouldInferConversationBoundary(bounds []int, width int) bool {
	if len(bounds) != 3 || width <= 0 {
		return false
	}
	leftWidth := bounds[1] - bounds[0]
	rightWidth := bounds[2] - bounds[1]
	return float64(leftWidth)/float64(width) <= 0.08 && float64(rightWidth)/float64(width) >= 0.85
}

func inferConversationBoundaryFromSourceImage(sourceImagePath string, bounds []int, width, height int) (int, bool) {
	if strings.TrimSpace(sourceImagePath) == "" || len(bounds) < 3 {
		return 0, false
	}
	img, err := openImage(sourceImagePath)
	if err != nil {
		return 0, false
	}
	firstBoundary := bounds[1]
	minConversationWidth := maxIntSafe(120, width/10)
	start := maxIntSafe(firstBoundary+minConversationWidth, int(float64(width)*0.12))
	end := minIntSafe(width-maxIntSafe(320, width/4), int(float64(width)*0.38))
	if end <= start {
		return 0, false
	}
	bestPos, bestScore := bestVerticalBoundaryInRange(img, start, end, height)
	if bestScore < 6 {
		return 0, false
	}
	return bestPos, true
}

func bestVerticalBoundaryInRange(img image.Image, start, end, height int) (int, float64) {
	bounds := img.Bounds()
	maxX := bounds.Dx() - 1
	if start < 1 {
		start = 1
	}
	if end > maxX {
		end = maxX
	}
	if end <= start {
		return start, 0
	}
	bestPos := start
	bestScore := -1.0
	for x := start; x <= end; x++ {
		score := verticalBoundaryScore(img, x, height)
		if score > bestScore {
			bestPos = x
			bestScore = score
		}
	}
	return bestPos, bestScore
}

func verticalBoundaryScore(img image.Image, x, height int) float64 {
	bands := [][2]int{
		{0, height},
		{0, maxIntSafe(24, int(float64(height)*0.18))},
		{maxIntSafe(0, int(float64(height)*0.18)), minIntSafe(height, int(float64(height)*0.75))},
		{maxIntSafe(0, int(float64(height)*0.75)), height},
	}
	total := 0.0
	count := 0.0
	for _, band := range bands {
		score := verticalBandWindowDistance(img, x, band[0], band[1])
		if score <= 0 {
			continue
		}
		total += score
		count++
	}
	if count == 0 {
		return 0
	}
	return total / count
}

func verticalBandWindowDistance(img image.Image, x, y0, y1 int) float64 {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if x < 3 || x+3 >= width {
		return 0
	}
	if y0 < 0 {
		y0 = 0
	}
	if y1 > height {
		y1 = height
	}
	if y1 <= y0 {
		return 0
	}
	leftRGB, leftCount := averageBandRGB(img, x-3, x, y0, y1)
	rightRGB, rightCount := averageBandRGB(img, x, x+3, y0, y1)
	if leftCount == 0 || rightCount == 0 {
		return 0
	}
	dr := leftRGB[0] - rightRGB[0]
	dg := leftRGB[1] - rightRGB[1]
	db := leftRGB[2] - rightRGB[2]
	return math.Sqrt(dr*dr + dg*dg + db*db)
}

func averageBandRGB(img image.Image, x0, x1, y0, y1 int) ([3]float64, int) {
	sum := [3]float64{}
	count := 0
	for x := x0; x < x1; x++ {
		for y := y0; y < y1; y++ {
			r, g, b, _ := img.At(x, y).RGBA()
			sum[0] += float64(r >> 8)
			sum[1] += float64(g >> 8)
			sum[2] += float64(b >> 8)
			count++
		}
	}
	if count == 0 {
		return sum, 0
	}
	sum[0] /= float64(count)
	sum[1] /= float64(count)
	sum[2] /= float64(count)
	return sum, count
}

func deriveRowsForInference(index, x0, x1 int, separators any, regions []map[string]any, width, height int) []map[string]any {
	yBounds := deriveColumnRows(x0, x1, separators, regions, width, height)
	rows := make([]map[string]any, 0, len(yBounds)-1)
	for i := 0; i < len(yBounds)-1; i++ {
		y0 := yBounds[i]
		y1 := yBounds[i+1]
		if y1 <= y0 {
			continue
		}
		rows = append(rows, map[string]any{
			"id":     fmt.Sprintf("col_%02d_row_%02d", index+1, i+1),
			"y":      y0,
			"height": y1 - y0,
			"ratio":  round4(float64(y1-y0) / float64(maxIntSafe(1, height))),
		})
	}
	return rows
}

func inferSemanticZones(columns []map[string]any, width, height int) []map[string]any {
	zones := make([]map[string]any, 0)
	if len(columns) == 0 {
		return zones
	}

	conversationIndex := 0
	mainIndex := 1

	firstRatio := floatValue(columns[0]["ratio"])
	secondWidth := 0
	if len(columns) > 1 {
		secondWidth = intValue(columns[1]["width"])
	}
	if len(columns) >= 3 && firstRatio <= 0.22 && intValue(columns[0]["width"]) < maxIntSafe(64, int(float64(secondWidth)*0.7)) {
		zones = append(zones, zonePayload("left_nav", "nav_strip", intValue(columns[0]["x"]), 0, intValue(columns[0]["width"]), height, "layout_rule", 0.82, []string{"narrow left rail detected"}, []string{"open_chat"}, "#343434"))
		conversationIndex = 1
		mainIndex = 2
	}

	if conversationIndex < len(columns) {
		col := columns[conversationIndex]
		conversationBox := map[string]any{"x": intValue(col["x"]), "y": 0, "width": intValue(col["width"]), "height": height}
		zones = append(zones, zonePayload("conversation_list", "chat_list", intValue(col["x"]), 0, intValue(col["width"]), height, "layout_rule", 0.84, []string{"conversation column inferred from major vertical split"}, []string{"open_chat"}, "#ededed"))
		searchHeight := minIntSafe(72, maxIntSafe(60, int(float64(height)*0.068)))
		zones = append(zones, zonePayload("search_area", "search_area", intValue(conversationBox["x"]), 0, intValue(conversationBox["width"]), searchHeight, "layout_rule", 0.71, []string{"top band of conversation list reserved for search"}, []string{"open_chat"}, "#f5f5f5"))
	}

	if mainIndex < len(columns) {
		col := columns[mainIndex]
		x := intValue(col["x"])
		w := intValue(col["width"])
		rows := arrayOfMaps(col["rows"])
		header, message, input := splitMainRows(rows, x, w, height)
		if header != nil {
			zones = append(zones, header)
		}
		if message != nil {
			zones = append(zones, message)
		}
		if input != nil {
			zones = append(zones, input)
			inputBox := input["bbox"].(map[string]any)
			sendHeight := minIntSafe(60, maxIntSafe(52, intValue(inputBox["height"])/4))
			zones = append(zones, zonePayload("send_action_zone", "send_action_zone", intValue(inputBox["x"]), intValue(inputBox["y"]), intValue(inputBox["width"]), sendHeight, "layout_rule", 0.72, []string{"derived from top action band of input area"}, []string{"send_message"}, "#f0f0f0"))
		}
	}

	if mainIndex+1 < len(columns) {
		x := intValue(columns[mainIndex+1]["x"])
		w := 0
		for _, col := range columns[mainIndex+1:] {
			w += intValue(col["width"])
		}
		zones = append(zones, zonePayload("detail_panel", "aux_panel", x, 0, w, height, "layout_rule", 0.58, []string{"trailing columns merged as auxiliary panel"}, []string{}, "#f8f8f8"))
	}

	return zones
}

func splitMainRows(rows []map[string]any, x, width, height int) (map[string]any, map[string]any, map[string]any) {
	if len(rows) == 0 {
		headerH := minIntSafe(72, maxIntSafe(48, int(float64(height)*0.1)))
		inputH := minIntSafe(128, maxIntSafe(88, int(float64(height)*0.22)))
		messageH := maxIntSafe(0, height-headerH-inputH)
		return zonePayload("chat_header", "chat_header", x, 0, width, headerH, "layout_rule", 0.66, []string{"fallback header slice"}, []string{"verify_header"}, "#f9f9f9"),
			zonePayload("message_list", "message_list", x, headerH, width, messageH, "layout_rule", 0.62, []string{"fallback message slice"}, []string{"read_reply"}, "#ffffff"),
			zonePayload("input_area", "input_area", x, headerH+messageH, width, inputH, "layout_rule", 0.68, []string{"fallback input slice"}, []string{"focus_input", "input_message", "send_message"}, "#f6f6f6")
	}
	if len(rows) == 1 {
		headerH := minIntSafe(72, maxIntSafe(52, int(float64(height)*0.06)))
		inputH := minIntSafe(286, maxIntSafe(180, int(float64(height)*0.286)))
		messageH := maxIntSafe(0, height-headerH-inputH)
		return zonePayload("chat_header", "chat_header", x, 0, width, headerH, "layout_rule", 0.64, []string{"single main row fallback split for header"}, []string{"verify_header"}, "#f9f9f9"),
			zonePayload("message_list", "message_list", x, headerH, width, messageH, "layout_rule", 0.72, []string{"single main row fallback split for message list"}, []string{"read_reply"}, "#ffffff"),
			zonePayload("input_area", "input_area", x, headerH+messageH, width, inputH, "layout_rule", 0.67, []string{"single main row fallback split for input area"}, []string{"focus_input", "input_message", "send_message"}, "#f6f6f6")
	}

	first := rows[0]
	last := rows[len(rows)-1]
	headerH := intValue(first["height"])
	inputH := intValue(last["height"])
	headerOK := floatValue(first["ratio"]) <= 0.22
	inputOK := len(rows) > 1 && floatValue(last["ratio"]) <= 0.35

	var header map[string]any
	if headerOK {
		header = zonePayload("chat_header", "chat_header", x, intValue(first["y"]), width, headerH, "layout_rule", 0.79, []string{"top row of main column inferred as header"}, []string{"verify_header"}, "#f9f9f9")
	}
	if header == nil && len(rows) >= 2 {
		header = zonePayload("chat_header", "chat_header", x, intValue(first["y"]), width, headerH, "layout_rule", 0.61, []string{"fallback top row promoted to header"}, []string{"verify_header"}, "#f9f9f9")
	}

	var input map[string]any
	if inputOK {
		input = zonePayload("input_area", "input_area", x, intValue(last["y"]), width, inputH, "layout_rule", 0.81, []string{"bottom row of main column inferred as input area"}, []string{"focus_input", "input_message", "send_message"}, "#f6f6f6")
	}
	if input == nil && len(rows) >= 2 {
		input = zonePayload("input_area", "input_area", x, intValue(last["y"]), width, inputH, "layout_rule", 0.65, []string{"fallback bottom row promoted to input area"}, []string{"focus_input", "input_message", "send_message"}, "#f6f6f6")
	}

	messageTop := 0
	messageBottom := height
	if header != nil {
		messageTop = intValue(header["bbox"].(map[string]any)["y"]) + intValue(header["bbox"].(map[string]any)["height"])
	}
	if input != nil {
		messageBottom = intValue(input["bbox"].(map[string]any)["y"])
	}
	if messageBottom <= messageTop {
		messageBottom = height
	}

	message := zonePayload("message_list", "message_list", x, messageTop, width, messageBottom-messageTop, "layout_rule", 0.83, []string{"middle area of main column inferred as message list"}, []string{"read_reply"}, "#ffffff")
	return header, message, input
}

func inferAppClassification(columns, zones []map[string]any) map[string]any {
	appClass := "unknown"
	pageType := "unknown"
	confidence := 0.42
	signals := make([]string, 0)
	counterSignals := make([]string, 0)
	uncertainties := make([]string, 0)

	hasConversation := zoneByID(zones, "conversation_list") != nil
	hasHeader := zoneByID(zones, "chat_header") != nil
	hasMessage := zoneByID(zones, "message_list") != nil
	hasInput := zoneByID(zones, "input_area") != nil
	hasNav := zoneByID(zones, "left_nav") != nil

	if hasConversation {
		signals = append(signals, "conversation_list detected")
	}
	if hasHeader {
		signals = append(signals, "chat_header detected")
	}
	if hasMessage {
		signals = append(signals, "message_list detected")
	}
	if hasInput {
		signals = append(signals, "input_area detected")
	}
	if hasNav {
		signals = append(signals, "narrow left navigation rail detected")
	}

	if len(columns) >= 3 && hasConversation && hasHeader && hasMessage && hasInput {
		appClass = "wechat-desktop"
		pageType = "wechat_chat_page"
		confidence = 0.93
	} else if len(columns) >= 2 && hasConversation && hasMessage {
		appClass = "desktop-chat-like"
		pageType = "wechat_chat_list_only"
		confidence = 0.79
		counterSignals = append(counterSignals, "header or input area incomplete")
	} else {
		appClass = "generic-desktop-app"
		pageType = "unknown"
		confidence = 0.48
		counterSignals = append(counterSignals, "required chat zones are incomplete")
		uncertainties = append(uncertainties, "current page may not be a chat page")
	}

	if !hasInput {
		uncertainties = append(uncertainties, "input area not confidently detected")
	}
	if !hasHeader {
		uncertainties = append(uncertainties, "chat header not confidently detected")
	}

	isBlocking := pageType == "unknown"
	canProceed := confidence >= 0.75 && !isBlocking
	return map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"appClass":       appClass,
		"pageType":       pageType,
		"confidence":     round4(confidence),
		"signals":        signals,
		"counterSignals": counterSignals,
		"decisionTrace":  []string{"layout_model.columns", "semantic_zones", "chat-page heuristics"},
		"uncertainties":  uncertainties,
		"isBlockingPage": isBlocking,
		"canProceed":     canProceed,
	}
}

func inferActionTargets(app map[string]any, zones, columns []map[string]any) []map[string]any {
	targets := make([]map[string]any, 0)
	pageType := stringValue(app["pageType"])

	if zone := zoneByID(zones, "conversation_list"); zone != nil {
		box := mapValue(zone["bbox"])
		candidates := buildConversationRowCandidates(zone, columns)
		point := map[string]any{"x": intValue(box["x"]) + minIntSafe(80, maxIntSafe(24, intValue(box["width"])/4)), "y": intValue(box["y"]) + minIntSafe(72, maxIntSafe(32, intValue(box["height"])/6))}
		if len(candidates) > 0 {
			point = mapValue(candidates[0]["point"])
		}
		targets = append(targets, map[string]any{
			"id":         "target_open_chat_primary",
			"intent":     "open_chat",
			"zoneId":     "conversation_list",
			"targetType": "row_candidate_set",
			"bbox":       box,
			"point":      point,
			"selectorLogic": map[string]any{
				"kind":    "hybrid",
				"signals": []string{"chat-list zone", "row clustering", "OCR target-name matching", "candidate rows"},
			},
			"candidates": candidates,
			"fallbacks": []map[string]any{
				{"kind": "refine-ocr-row-match"},
				{"kind": "search-flow"},
			},
			"preconditions":  []string{"conversation_list zone present", "target name can be disambiguated"},
			"postconditions": []string{"chat_header switched to target identity", "message_list refreshed"},
			"riskLevel":      "medium",
			"confidence":     round4(floatValue(zone["confidence"]) * 0.88),
		})
	}

	if zone := zoneByID(zones, "input_area"); zone != nil {
		box := mapValue(zone["bbox"])
		targets = append(targets, map[string]any{
			"id":         "target_focus_input_primary",
			"intent":     "focus_input",
			"zoneId":     "input_area",
			"targetType": "textbox",
			"bbox":       box,
			"point":      map[string]any{"x": intValue(box["x"]) + intValue(box["width"])*3/5, "y": intValue(box["y"]) + intValue(box["height"])*7/10},
			"selectorLogic": map[string]any{
				"kind":    "zone-center-hotspot",
				"signals": []string{"input area zone", "bottom content band"},
			},
			"fallbacks": []map[string]any{
				{"kind": "zone-center-retry"},
				{"kind": "keyboard-focus-shortcut"},
			},
			"preconditions":  []string{"pageType is wechat_chat_page", "input_area zone present"},
			"postconditions": []string{"draft text becomes visible in input area"},
			"riskLevel":      "medium",
			"confidence":     round4(floatValue(zone["confidence"]) * 0.9),
		})
	}

	sendZone := zoneByID(zones, "send_action_zone")
	if sendZone == nil {
		sendZone = zoneByID(zones, "input_area")
	}
	if sendZone != nil {
		box := mapValue(sendZone["bbox"])
		x := intValue(box["x"]) + maxIntSafe(0, intValue(box["width"])-maxIntSafe(18, intValue(box["width"])/5))
		targets = append(targets, map[string]any{
			"id":         "target_send_message_primary",
			"intent":     "send_message",
			"zoneId":     stringValue(sendZone["id"]),
			"targetType": "button",
			"bbox":       box,
			"point":      map[string]any{"x": x, "y": intValue(box["y"]) + intValue(box["height"])/2},
			"selectorLogic": map[string]any{
				"kind":    "zone-right-action",
				"signals": []string{"send action zone", "right side of input area"},
			},
			"fallbacks": []map[string]any{
				{"kind": "press-enter-if-enabled"},
			},
			"preconditions":  []string{"target chat verified", "draft verified", "send safety gate passed"},
			"postconditions": []string{"draft cleared", "self message appears in message list"},
			"riskLevel":      "high",
			"confidence":     round4(floatValue(sendZone["confidence"]) * 0.72),
		})
	}

	if pageType == "wechat_chat_page" {
		if zone := zoneByID(zones, "message_list"); zone != nil {
			box := mapValue(zone["bbox"])
			targets = append(targets, map[string]any{
				"id":         "target_read_reply_primary",
				"intent":     "read_reply",
				"zoneId":     "message_list",
				"targetType": "text_anchor",
				"bbox":       box,
				"point":      map[string]any{"x": intValue(box["x"]) + intValue(box["width"])/2, "y": intValue(box["y"]) + intValue(box["height"])/2},
				"selectorLogic": map[string]any{
					"kind":    "zone-local-ocr",
					"signals": []string{"message list zone", "local OCR only"},
				},
				"fallbacks": []map[string]any{
					{"kind": "crop-latest-message-region"},
				},
				"preconditions":  []string{"message_list zone present", "local OCR available"},
				"postconditions": []string{"reply text extracted from message list only"},
				"riskLevel":      "low",
				"confidence":     round4(floatValue(zone["confidence"]) * 0.88),
			})
		}
	}

	return targets
}

func buildConversationRowCandidates(zone map[string]any, columns []map[string]any) []map[string]any {
	box := mapValue(zone["bbox"])
	x := intValue(box["x"])
	y := intValue(box["y"])
	width := intValue(box["width"])
	height := intValue(box["height"])
	if width <= 0 || height <= 0 {
		return nil
	}

	startY := y + minIntSafe(120, maxIntSafe(72, height/7))
	rowHeight := minIntSafe(112, maxIntSafe(84, height/9))
	bottom := y + height
	candidates := make([]map[string]any, 0, 6)

	if col := matchColumnForZone(columns, x, width); col != nil {
		rows := arrayOfMaps(col["rows"])
		for _, row := range rows {
			ry := intValue(row["y"])
			rh := intValue(row["height"])
			if ry+rh <= startY {
				continue
			}
			if rh >= rowHeight && len(candidates) < 3 {
				candidates = append(candidates, rowCandidatePayload(len(candidates)+1, x, maxIntSafe(ry, startY), width, minIntSafe(rh, rowHeight)))
			}
		}
	}

	for cy := startY; cy+rowHeight <= bottom && len(candidates) < 6; cy += rowHeight {
		candidates = append(candidates, rowCandidatePayload(len(candidates)+1, x, cy, width, rowHeight))
	}
	return candidates
}

func rowCandidatePayload(index, x, y, width, height int) map[string]any {
	return map[string]any{
		"id":    fmt.Sprintf("conversation_row_%02d", index),
		"bbox":  map[string]any{"x": x, "y": y, "width": width, "height": height},
		"point": map[string]any{"x": x + minIntSafe(80, maxIntSafe(24, width/4)), "y": y + height/2},
	}
}

func matchColumnForZone(columns []map[string]any, x, width int) map[string]any {
	for _, col := range columns {
		if intValue(col["x"]) == x && intValue(col["width"]) == width {
			return col
		}
	}
	return nil
}

func inferOCRAssistMap(regions, zones, targets []map[string]any) map[string]any {
	lines := make([]map[string]any, 0)
	for _, region := range regions {
		text := stringValue(region["ocrText"])
		if text == "" {
			continue
		}
		lines = append(lines, map[string]any{
			"regionId": stringValue(region["id"]),
			"text":     text,
			"bbox":     region["bbox"],
		})
	}
	zoneBindings := make([]map[string]any, 0)
	textAnchors := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		textAnchors = append(textAnchors, line)
	}

	if zone := zoneByID(zones, "chat_header"); zone != nil {
		zoneBindings = append(zoneBindings, ocrBinding("header_identity", "verify_header", zone))
	}
	if zone := zoneByID(zones, "input_area"); zone != nil {
		zoneBindings = append(zoneBindings, ocrBinding("draft_input", "verify_draft", zone))
	}
	if zone := zoneByID(zones, "message_list"); zone != nil {
		zoneBindings = append(zoneBindings, ocrBinding("message_list_local", "read_reply", zone))
		if latestBand := latestReplyProbe(zone); latestBand != nil {
			textAnchors = append(textAnchors, latestBand)
		}
	}
	for _, target := range targets {
		if stringValue(target["intent"]) != "open_chat" {
			continue
		}
		for _, candidate := range arrayOfMaps(target["candidates"]) {
			textAnchors = append(textAnchors, map[string]any{
				"id":          stringValue(candidate["id"]),
				"intent":      "open_chat",
				"expectedUse": "target_name_disambiguation",
				"bbox":        candidate["bbox"],
			})
		}
	}

	conflicts := make([]map[string]any, 0)
	if zoneByID(zones, "chat_header") == nil {
		conflicts = append(conflicts, map[string]any{"id": "missing_header_zone", "severity": "high"})
	}
	if zoneByID(zones, "input_area") == nil {
		conflicts = append(conflicts, map[string]any{"id": "missing_input_zone", "severity": "high"})
	}
	return map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"zoneBindings":  zoneBindings,
		"textAnchors":   textAnchors,
		"ocrConflicts":  conflicts,
		"usableFor":     []string{"open_chat", "verify_header", "verify_draft", "read_reply"},
		"notSafeFor":    []string{"whole-window reply verification"},
		"summary":       "zone-aware OCR plan generated for header, conversation candidates, draft input, and reply readback",
	}
}

func ocrBinding(id, intent string, zone map[string]any) map[string]any {
	return map[string]any{
		"id":     id,
		"intent": intent,
		"zoneId": stringValue(zone["id"]),
		"bbox":   zone["bbox"],
	}
}

func latestReplyProbe(zone map[string]any) map[string]any {
	box := mapValue(zone["bbox"])
	x := intValue(box["x"])
	y := intValue(box["y"])
	width := intValue(box["width"])
	height := intValue(box["height"])
	if width <= 0 || height <= 0 {
		return nil
	}
	probeHeight := minIntSafe(220, maxIntSafe(120, height/3))
	return map[string]any{
		"id":          "latest_reply_probe",
		"intent":      "read_reply",
		"expectedUse": "latest_reply_readback",
		"bbox": map[string]any{
			"x":      x,
			"y":      y + height - probeHeight,
			"width":  width,
			"height": probeHeight,
		},
	}
}

func inferActionability(app map[string]any, zones, targets []map[string]any) map[string]any {
	pageType := stringValue(app["pageType"])
	allowed := make([]string, 0)
	blocked := make([]string, 0)
	reports := make([]map[string]any, 0, 4)

	openChatAllowed := zoneByID(zones, "conversation_list") != nil && stringValue(app["appClass"]) != "generic-desktop-app"
	reports = append(reports, actionReport("open_chat", openChatAllowed, 0.86, []string{"conversation_list zone present"}, []string{}, []string{"header switches to target identity"}, []string{"target chat disambiguation evidence"}, "refine OCR row candidates", "medium", "conversation list is structurally available"))
	if openChatAllowed {
		allowed = append(allowed, "open_chat")
	} else {
		blocked = append(blocked, "open_chat")
	}

	focusInputAllowed := pageType == "wechat_chat_page" && zoneByID(zones, "input_area") != nil
	reports = append(reports, actionReport("focus_input", focusInputAllowed, 0.82, []string{"pageType is wechat_chat_page", "input_area present"}, []string{}, []string{"draft text visible in input area"}, []string{"focus confirmation evidence"}, "retry center-of-input hotspot", "medium", "input zone is structurally available"))
	if focusInputAllowed {
		allowed = append(allowed, "focus_input")
	} else {
		blocked = append(blocked, "focus_input")
	}

	readReplyAllowed := pageType == "wechat_chat_page" && zoneByID(zones, "message_list") != nil
	reports = append(reports, actionReport("read_reply", readReplyAllowed, 0.79, []string{"message_list present"}, []string{}, []string{"reply text extracted from local message list OCR"}, []string{"latest message crop evidence"}, "crop latest message region", "low", "message list zone can support local OCR probe"))
	if readReplyAllowed {
		allowed = append(allowed, "read_reply")
	} else {
		blocked = append(blocked, "read_reply")
	}

	sendFailures := []string{
		"target chat identity not yet verified",
		"draft text verification not yet available in this round",
		"send safety gate is intentionally hard-blocked until runtime evidence exists",
	}
	reports = append(reports, map[string]any{
		"action":                 "send_message",
		"allowed":                false,
		"score":                  round4(0.34),
		"preconditionsPassed":    []string{"send target zone inferred"},
		"preconditionsFailed":    sendFailures,
		"postconditionsExpected": []string{"draft clears", "self message appears in message list"},
		"requiredExtraEvidence":  []string{"target chat verified", "draft verified", "send path verified"},
		"recommendedFallback":    "stop before send and gather more evidence",
		"riskLevel":              "high",
		"reason":                 "send remains hard-gated in execution round 1",
	})
	blocked = append(blocked, "send_message")

	canProceed := stringValue(app["pageType"]) == "wechat_chat_page" && len(missingRequiredZones(zones)) == 0
	status := "fail"
	if canProceed {
		status = "warn"
	}
	return map[string]any{
		"schemaVersion":  schemaVersion,
		"createdAt":      time.Now().Format(time.RFC3339),
		"status":         status,
		"canProceed":     canProceed,
		"canSend":        false,
		"currentPage":    pageType,
		"reports":        reports,
		"allowedActions": allowed,
		"blockedActions": blocked,
		"summary":        "structure-first actionability established for probe-level actions; send remains blocked pending runtime evidence",
		"targetCount":    len(targets),
		"zoneCount":      len(zones),
	}
}

func actionReport(action string, allowed bool, score float64, preconditionsPassed, preconditionsFailed, postconditionsExpected, requiredExtraEvidence []string, recommendedFallback, riskLevel, reason string) map[string]any {
	return map[string]any{
		"action":                 action,
		"allowed":                allowed,
		"score":                  round4(score),
		"preconditionsPassed":    preconditionsPassed,
		"preconditionsFailed":    preconditionsFailed,
		"postconditionsExpected": postconditionsExpected,
		"requiredExtraEvidence":  requiredExtraEvidence,
		"recommendedFallback":    recommendedFallback,
		"riskLevel":              riskLevel,
		"reason":                 reason,
	}
}

func zonePayload(id, role string, x, y, width, height int, source string, confidence float64, evidence, requiredForAction []string, backgroundColor string) map[string]any {
	return map[string]any{
		"id":                id,
		"role":              role,
		"bbox":              map[string]any{"x": x, "y": y, "width": width, "height": height},
		"x":                 x,
		"y":                 y,
		"width":             width,
		"height":            height,
		"source":            source,
		"confidence":        round4(confidence),
		"evidence":          evidence,
		"requiredForAction": requiredForAction,
		"backgroundColor":   backgroundColor,
	}
}

func zoneByID(zones []map[string]any, id string) map[string]any {
	for _, zone := range zones {
		if stringValue(zone["id"]) == id {
			return zone
		}
	}
	return nil
}

func missingRequiredZones(zones []map[string]any) []string {
	required := []string{"conversation_list", "chat_header", "message_list", "input_area"}
	out := make([]string, 0)
	for _, id := range required {
		if zoneByID(zones, id) == nil {
			out = append(out, id)
		}
	}
	return out
}

func round4(v float64) float64 {
	return float64(int(v*10000+0.5)) / 10000
}
