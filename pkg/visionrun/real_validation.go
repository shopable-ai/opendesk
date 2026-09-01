package visionrun

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

type RealAppValidationOptions struct {
	ScreenshotPath   string
	Window           map[string]any
	SourceReportPath string
	WorkerBridge     *WorkerBridgeResult
	Label            string
}

type RealAppValidationResult struct {
	RunID                string
	RealRunID            string
	RealBaseDir          string
	ScreenshotPath       string
	DetectRegionsPath    string
	LayoutModelPath      string
	ZonesPath            string
	ValidationReportPath string
	ValidationPassed     bool
	FailureType          string
	CurrentFailedStage   string
	Should               string
	Blockers             []Blocker
}

func RunRealAppValidation(bundle *Bundle, opts RealAppValidationOptions) (*RealAppValidationResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	screenshotPath := strings.TrimSpace(opts.ScreenshotPath)
	if screenshotPath == "" && opts.WorkerBridge != nil {
		screenshotPath = strings.TrimSpace(opts.WorkerBridge.ScreenshotPath)
	}
	if screenshotPath == "" {
		return nil, fmt.Errorf("real screenshot path is required")
	}

	realBundle, err := InitBundle(InitOptions{
		RepoRoot:      filepath.Dir(filepath.Dir(filepath.Dir(bundle.BaseDir))),
		RunID:         bundle.RunID + "-real",
		Goal:          "real-app screenshot validation against golden structural contract",
		TargetApp:     "WeChat Desktop",
		WindowHint:    "微信 / WeChat",
		CaptureMode:   "real-app screenshot",
		OCRProvider:   "paddle|local",
		LayoutEngine:  "automation/image_layout.go",
		Source:        "visionrun-real-validation",
		PreflightPath: bundle.Preflight,
	})
	if err != nil {
		return nil, err
	}

	_, err = RunDetect(realBundle, DetectOptions{
		SourceImagePath: screenshotPath,
		Window:          opts.Window,
	})
	if err != nil {
		return nil, err
	}
	inferResult, err := RunInfer(realBundle, InferOptions{})
	if err != nil {
		return nil, err
	}

	goldenLayout, err := readJSONMap(filepath.Join(bundle.DetectDir, "layout_model.json"))
	if err != nil {
		return nil, fmt.Errorf("read golden layout model: %w", err)
	}
	realLayout, err := readJSONMap(filepath.Join(realBundle.DetectDir, "layout_model.json"))
	if err != nil {
		return nil, fmt.Errorf("read real layout model: %w", err)
	}
	goldenZones, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, fmt.Errorf("read golden zones: %w", err)
	}
	realZones, err := readJSONMap(filepath.Join(realBundle.InferDir, "zones.json"))
	if err != nil {
		return nil, fmt.Errorf("read real zones: %w", err)
	}

	requiredZones := []string{"search_area", "conversation_list", "chat_header", "message_list", "input_area", "send_action_zone"}
	zoneWeights := zoneComparisonWeights()
	missing := make([]string, 0)
	zoneDiffs := make([]map[string]any, 0)
	for _, zoneID := range requiredZones {
		goldenZone := mapValue(mapValue(goldenZones["zoneByID"])[zoneID])
		realZone := mapValue(mapValue(realZones["zoneByID"])[zoneID])
		if len(goldenZone) == 0 || len(realZone) == 0 {
			missing = append(missing, zoneID)
			continue
		}
		zoneDiffs = append(zoneDiffs, zoneDiff(zoneID, goldenZone, realZone, goldenLayout, realLayout, zoneWeights[zoneID]))
	}

	averageScore := averageZoneScore(zoneDiffs)
	weightedScore := weightedZoneScore(zoneDiffs)
	validationPassed := len(missing) == 0 && averageScore >= 0.72 && weightedScore >= 0.78 && inferResult.CanProceed
	validationPassed = validationPassed || (len(missing) == 0 && averageScore >= 0.99 && weightedScore >= 0.99)
	failureType := "none"
	currentFailedStage := ""
	should := "continue"
	if !validationPassed {
		failureType = classifyRealValidationFailure(missing, weightedScore)
		currentFailedStage = string(StageValidateRealAppAgainstGolden)
		should = diagnoseActionForFailure(failureType)
	}
	blockers := make([]Blocker, 0)
	if len(missing) > 0 {
		blockers = append(blockers, Blocker{
			Code:            "real.required_zones_missing",
			Stage:           string(StageValidateRealAppAgainstGolden),
			Severity:        "hard",
			Message:         fmt.Sprintf("missing required real-app zones: %s", strings.Join(missing, ", ")),
			SuggestedRepair: "refresh capture or region mapping before action stage",
			EvidenceRefs:    []string{artifactPath(realBundle.RunID, "infer/zones.json")},
		})
	}
	if !validationPassed && len(missing) == 0 {
		blockers = append(blockers, Blocker{
			Code:            "real.layout_score_low",
			Stage:           string(StageValidateRealAppAgainstGolden),
			Severity:        "hard",
			Message:         fmt.Sprintf("real weighted layout similarity score too low: average=%.4f weighted=%.4f", averageScore, weightedScore),
			SuggestedRepair: "diagnose structural differences and rerun capture/detect",
			EvidenceRefs:    []string{artifactPath(realBundle.RunID, "detect/layout_model.json"), artifactPath(realBundle.RunID, "infer/zones.json")},
		})
	}

	report := map[string]any{
		"schemaVersion":    schemaVersion,
		"createdAt":        time.Now().Format(time.RFC3339),
		"runId":            bundle.RunID,
		"label":            defaultString(opts.Label, "real-app-validation"),
		"sourceReportPath": opts.SourceReportPath,
		"screenshotPath":   screenshotPath,
		"workerBridgeReportPath": func() string {
			if opts.WorkerBridge == nil {
				return ""
			}
			return opts.WorkerBridge.ReportPath
		}(),
		"goldenRunId":           bundle.RunID,
		"realRunId":             realBundle.RunID,
		"goldenLayoutModelPath": artifactPath(bundle.RunID, "detect/layout_model.json"),
		"realLayoutModelPath":   artifactPath(realBundle.RunID, "detect/layout_model.json"),
		"goldenZonesPath":       artifactPath(bundle.RunID, "infer/zones.json"),
		"realZonesPath":         artifactPath(realBundle.RunID, "infer/zones.json"),
		"requiredZones":         requiredZones,
		"missingZones":          missing,
		"zoneDiffs":             zoneDiffs,
		"averageZoneScore":      round4(averageScore),
		"weightedZoneScore":     round4(weightedScore),
		"validationPassed":      validationPassed,
		"failureType":           failureType,
		"currentFailedStage":    currentFailedStage,
		"should":                should,
		"blockers":              blockersToAny(blockers),
		"summary":               realValidationDecisionSummary(validationPassed, failureType, should),
	}
	reportPath := filepath.Join(bundle.RealAppDir, "validation_report.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                time.Now().Format(time.RFC3339),
		"stage":             "realapp.validate",
		"status":            ternaryStatus(validationPassed),
		"runId":             bundle.RunID,
		"detail":            report["summary"],
		"validationReport":  artifactPath(bundle.RunID, "realapp/validation_report.json"),
		"averageZoneScore":  round4(averageScore),
		"weightedZoneScore": round4(weightedScore),
	}); err != nil {
		return nil, err
	}

	return &RealAppValidationResult{
		RunID:                bundle.RunID,
		RealRunID:            realBundle.RunID,
		RealBaseDir:          realBundle.BaseDir,
		ScreenshotPath:       screenshotPath,
		DetectRegionsPath:    artifactPath(realBundle.RunID, "detect/regions.json"),
		LayoutModelPath:      artifactPath(realBundle.RunID, "detect/layout_model.json"),
		ZonesPath:            artifactPath(realBundle.RunID, "infer/zones.json"),
		ValidationReportPath: artifactPath(bundle.RunID, "realapp/validation_report.json"),
		ValidationPassed:     validationPassed,
		FailureType:          failureType,
		CurrentFailedStage:   currentFailedStage,
		Should:               should,
		Blockers:             blockers,
	}, nil
}

func zoneDiff(zoneID string, goldenZone, realZone, goldenLayout, realLayout map[string]any, weight float64) map[string]any {
	goldenBox := mapValue(goldenZone["bbox"])
	realBox := mapValue(realZone["bbox"])
	goldenWindow := mapValue(goldenLayout["window"])
	realWindow := mapValue(realLayout["window"])
	goldenWidth := maxIntSafe(1, intValue(goldenWindow["width"]))
	goldenHeight := maxIntSafe(1, intValue(goldenWindow["height"]))
	realWidth := maxIntSafe(1, intValue(realWindow["width"]))
	realHeight := maxIntSafe(1, intValue(realWindow["height"]))

	goldenRect := normalizedRect(goldenBox, goldenWidth, goldenHeight)
	realRect := normalizedRect(realBox, realWidth, realHeight)
	dx := absFloat(floatValue(goldenRect["x"]) - floatValue(realRect["x"]))
	dy := absFloat(floatValue(goldenRect["y"]) - floatValue(realRect["y"]))
	dw := absFloat(floatValue(goldenRect["width"]) - floatValue(realRect["width"]))
	dh := absFloat(floatValue(goldenRect["height"]) - floatValue(realRect["height"]))
	iouScore := normalizedRectIoU(goldenRect, realRect)
	sizeScore := normalizedSizeSimilarity(
		floatValue(goldenRect["width"]),
		floatValue(goldenRect["height"]),
		floatValue(realRect["width"]),
		floatValue(realRect["height"]),
	)
	centerScore := normalizedCenterSimilarity(
		floatValue(goldenRect["x"]),
		floatValue(goldenRect["y"]),
		floatValue(goldenRect["width"]),
		floatValue(goldenRect["height"]),
		floatValue(realRect["x"]),
		floatValue(realRect["y"]),
		floatValue(realRect["width"]),
		floatValue(realRect["height"]),
	)
	shapeScore := clamp01(iouScore*0.5 + sizeScore*0.25 + centerScore*0.25)
	colorScore := colorSimilarityScore(stringValue(goldenZone["backgroundColor"]), stringValue(realZone["backgroundColor"]))
	score := shapeScore*0.85 + colorScore*0.15
	return map[string]any{
		"zoneId":        zoneID,
		"goldenRect":    goldenRect,
		"realRect":      realRect,
		"background":    map[string]any{"golden": stringValue(goldenZone["backgroundColor"]), "real": stringValue(realZone["backgroundColor"])},
		"iouScore":      round4(iouScore),
		"sizeScore":     round4(sizeScore),
		"centerScore":   round4(centerScore),
		"shapeScore":    round4(shapeScore),
		"colorScore":    round4(colorScore),
		"score":         round4(score),
		"weight":        round4(weight),
		"positionDelta": map[string]any{"dx": round4(dx), "dy": round4(dy), "dw": round4(dw), "dh": round4(dh)},
	}
}

func normalizedSizeSimilarity(goldenWidth, goldenHeight, realWidth, realHeight float64) float64 {
	widthScore := 1 - absFloat(goldenWidth-realWidth)/maxFloatSafe(goldenWidth, realWidth, 0.0001)
	heightScore := 1 - absFloat(goldenHeight-realHeight)/maxFloatSafe(goldenHeight, realHeight, 0.0001)
	return clamp01((widthScore + heightScore) / 2)
}

func normalizedCenterSimilarity(goldenX, goldenY, goldenWidth, goldenHeight, realX, realY, realWidth, realHeight float64) float64 {
	goldenCenterX := goldenX + goldenWidth/2
	goldenCenterY := goldenY + goldenHeight/2
	realCenterX := realX + realWidth/2
	realCenterY := realY + realHeight/2
	xScore := 1 - absFloat(goldenCenterX-realCenterX)/maxFloatSafe(goldenWidth, realWidth, 0.0001)
	yScore := 1 - absFloat(goldenCenterY-realCenterY)/maxFloatSafe(goldenHeight, realHeight, 0.0001)
	return clamp01((xScore + yScore) / 2)
}

func maxFloatSafe(values ...float64) float64 {
	best := 0.0
	for _, value := range values {
		if value > best {
			best = value
		}
	}
	if best <= 0 {
		return 1
	}
	return best
}

func normalizedRect(box map[string]any, width, height int) map[string]any {
	return map[string]any{
		"x":      round4(float64(intValue(box["x"])) / float64(width)),
		"y":      round4(float64(intValue(box["y"])) / float64(height)),
		"width":  round4(float64(intValue(box["width"])) / float64(width)),
		"height": round4(float64(intValue(box["height"])) / float64(height)),
	}
}

func normalizedRectIoU(a, b map[string]any) float64 {
	ax0 := floatValue(a["x"])
	ay0 := floatValue(a["y"])
	ax1 := ax0 + floatValue(a["width"])
	ay1 := ay0 + floatValue(a["height"])
	bx0 := floatValue(b["x"])
	by0 := floatValue(b["y"])
	bx1 := bx0 + floatValue(b["width"])
	by1 := by0 + floatValue(b["height"])
	ix := overlapFloat(ax0, ax1, bx0, bx1)
	iy := overlapFloat(ay0, ay1, by0, by1)
	if ix <= 0 || iy <= 0 {
		return 0
	}
	inter := ix * iy
	union := (ax1-ax0)*(ay1-ay0) + (bx1-bx0)*(by1-by0) - inter
	if union <= 0 {
		return 0
	}
	return inter / union
}

func averageZoneScore(items []map[string]any) float64 {
	if len(items) == 0 {
		return 0
	}
	sum := 0.0
	for _, item := range items {
		sum += floatValue(item["score"])
	}
	return sum / float64(len(items))
}

func weightedZoneScore(items []map[string]any) float64 {
	if len(items) == 0 {
		return 0
	}
	weightedSum := 0.0
	totalWeight := 0.0
	for _, item := range items {
		weight := floatValue(item["weight"])
		if weight <= 0 {
			weight = 1
		}
		weightedSum += floatValue(item["score"]) * weight
		totalWeight += weight
	}
	if totalWeight <= 0 {
		return 0
	}
	return weightedSum / totalWeight
}

func zoneComparisonWeights() map[string]float64 {
	return map[string]float64{
		"search_area":       1.35,
		"conversation_list": 1.35,
		"chat_header":       1.2,
		"input_area":        1.35,
		"send_action_zone":  1.4,
		"message_list":      0.75,
	}
}

func colorSimilarityScore(golden, real string) float64 {
	g := normalizeColorString(golden)
	r := normalizeColorString(real)
	if g == "" || r == "" {
		return 0.5
	}
	if g == r {
		return 1
	}
	return 0.7
}

func normalizeColorString(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.ReplaceAll(value, " ", "")
	return value
}

func classifyRealValidationFailure(missing []string, score float64) string {
	if len(missing) > 0 {
		return "recognition_problem"
	}
	if score < 0.55 {
		return "structure_problem"
	}
	return "validation_problem"
}

func diagnoseActionForFailure(failureType string) string {
	switch failureType {
	case "structure_problem":
		return "retry"
	case "recognition_problem":
		return "repair"
	case "validation_problem":
		return "repair"
	default:
		return "continue"
	}
}

func realValidationDecisionSummary(ok bool, failureType, should string) string {
	if ok {
		return "real screenshot validation passed and action-stage gate may continue"
	}
	return fmt.Sprintf("real screenshot validation failed (%s); framework should %s", failureType, should)
}

func absFloat(v float64) float64 {
	if v < 0 {
		return -v
	}
	return v
}

func overlapFloat(a0, a1, b0, b1 float64) float64 {
	start := a0
	if b0 > start {
		start = b0
	}
	end := a1
	if b1 < end {
		end = b1
	}
	if end <= start {
		return 0
	}
	return end - start
}
