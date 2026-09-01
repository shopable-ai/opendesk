package visionrun

import (
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type CompareOptions struct {
	ColorThreshold float64
	BlockSize      int
}

type CompareResult struct {
	RunID           string
	ReportPath      string
	DiffImagePath   string
	PixelDiffRatio  float64
	FrameSimilarity float64
	Status          string
}

type ReferenceStructureAuditResult struct {
	RunID         string
	ReportPath    string
	Status        string
	AverageScore  float64
	WeightedScore float64
	ComparedZones int
}

type deviationBox struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

func RunCompare(bundle *Bundle, opts CompareOptions) (*CompareResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	sourcePath := filepath.Join(bundle.CaptureDir, "source.png")
	mirrorPath := filepath.Join(bundle.MirrorDir, "mirror.png")
	sourceImg, err := readImage(sourcePath)
	if err != nil {
		return nil, err
	}
	mirrorImg, err := readImage(mirrorPath)
	if err != nil {
		return nil, err
	}

	sb := sourceImg.Bounds()
	mb := mirrorImg.Bounds()
	if sb.Dx() != mb.Dx() || sb.Dy() != mb.Dy() {
		return nil, fmt.Errorf("compare image size mismatch: source=%dx%d mirror=%dx%d", sb.Dx(), sb.Dy(), mb.Dx(), mb.Dy())
	}

	threshold := opts.ColorThreshold
	if threshold <= 0 {
		threshold = 28
	}
	blockSize := opts.BlockSize
	if blockSize <= 0 {
		blockSize = 32
	}

	diffImg := image.NewRGBA(sb)
	draw.Draw(diffImg, sb, &image.Uniform{C: color.RGBA{245, 245, 245, 255}}, image.Point{}, draw.Src)

	totalPixels := sb.Dx() * sb.Dy()
	diffPixels := 0
	mask := make([][]bool, sb.Dy())
	for y := 0; y < sb.Dy(); y++ {
		mask[y] = make([]bool, sb.Dx())
		for x := 0; x < sb.Dx(); x++ {
			dist := pixelDistance(sourceImg.At(sb.Min.X+x, sb.Min.Y+y), mirrorImg.At(mb.Min.X+x, mb.Min.Y+y))
			if dist > threshold {
				diffPixels++
				mask[y][x] = true
				diffImg.Set(x, y, color.RGBA{255, 64, 64, 255})
			} else {
				r, g, b, _ := mirrorImg.At(mb.Min.X+x, mb.Min.Y+y).RGBA()
				diffImg.Set(x, y, color.RGBA{uint8((r >> 8)), uint8((g >> 8)), uint8((b >> 8)), 255})
			}
		}
	}

	pixelDiffRatio := 0.0
	if totalPixels > 0 {
		pixelDiffRatio = float64(diffPixels) / float64(totalPixels)
	}
	frameSimilarity, zoneIoU := computeFrameSimilarity(bundle)
	weightedFrameSimilarity := weightedRegionIoU(zoneIoU)
	effectiveFrameSimilarity := frameSimilarity*0.35 + weightedFrameSimilarity*0.65

	boxes := detectDeviationBoxes(mask, blockSize)
	sort.Slice(boxes, func(i, j int) bool {
		leftArea := boxes[i].Width * boxes[i].Height
		rightArea := boxes[j].Width * boxes[j].Height
		return leftArea > rightArea
	})
	if len(boxes) > 5 {
		boxes = boxes[:5]
	}

	diffPath := filepath.Join(bundle.CompareDir, "diff.png")
	if err := writePNG(diffPath, diffImg); err != nil {
		return nil, err
	}

	status := compareStatus(effectiveFrameSimilarity, pixelDiffRatio)
	recommendations := buildCompareRecommendations(effectiveFrameSimilarity, pixelDiffRatio, boxes)
	report := map[string]any{
		"runId":                    bundle.RunID,
		"status":                   status,
		"frameSimilarity":          frameSimilarity,
		"weightedFrameSimilarity":  weightedFrameSimilarity,
		"effectiveFrameSimilarity": effectiveFrameSimilarity,
		"pixelDiffRatio":           pixelDiffRatio,
		"summary":                  compareSummary(frameSimilarity, pixelDiffRatio, len(boxes)),
		"diffImagePath":            artifactPath(bundle.RunID, "compare/diff.png"),
		"majorDeviationRegions":    boxes,
		"textSimilarity":           []map[string]any{},
		"regionIoU":                zoneIoU,
		"recommendations":          recommendations,
		"validationTarget":         "real_vs_golden_structure",
		"goldenStagePassed":        true,
		"realValidationPassed":     status != "fail",
		"diagnose":                 buildCompareDiagnosis(status, effectiveFrameSimilarity, pixelDiffRatio, boxes),
		"createdAt":                time.Now().Format(time.RFC3339),
	}

	reportPath := filepath.Join(bundle.CompareDir, "report.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                       time.Now().Format(time.RFC3339),
		"stage":                    "compare.diff",
		"status":                   status,
		"runId":                    bundle.RunID,
		"detail":                   "generated compare report and diff image",
		"pixelDiffRatio":           pixelDiffRatio,
		"frameSimilarity":          frameSimilarity,
		"weightedFrameSimilarity":  weightedFrameSimilarity,
		"effectiveFrameSimilarity": effectiveFrameSimilarity,
		"reportPath":               artifactPath(bundle.RunID, "compare/report.json"),
		"diffImagePath":            artifactPath(bundle.RunID, "compare/diff.png"),
	}); err != nil {
		return nil, err
	}

	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		payload["status"] = status
		payload["canProceed"] = status != "fail"
		if status == "fail" {
			payload["nextStep"] = "repair-detect-mirror"
		} else if status == "warn" {
			payload["nextStep"] = "ocr-role-inference"
		} else {
			payload["nextStep"] = "dashboard"
		}
		payload["summary"] = report["summary"]
		payload["stopCondition"] = ""
		payload["compare"] = map[string]any{
			"frameSimilarity":          frameSimilarity,
			"weightedFrameSimilarity":  weightedFrameSimilarity,
			"effectiveFrameSimilarity": effectiveFrameSimilarity,
			"pixelDiffRatio":           pixelDiffRatio,
			"reportPath":               artifactPath(bundle.RunID, "compare/report.json"),
			"diffImagePath":            artifactPath(bundle.RunID, "compare/diff.png"),
			"realValidationPassed":     status != "fail",
			"diagnose":                 report["diagnose"],
		}
	}); err != nil {
		return nil, err
	}

	return &CompareResult{
		RunID:           bundle.RunID,
		ReportPath:      artifactPath(bundle.RunID, "compare/report.json"),
		DiffImagePath:   artifactPath(bundle.RunID, "compare/diff.png"),
		PixelDiffRatio:  pixelDiffRatio,
		FrameSimilarity: effectiveFrameSimilarity,
		Status:          status,
	}, nil
}

func weightedRegionIoU(items []map[string]any) float64 {
	if len(items) == 0 {
		return 0
	}
	weights := zoneComparisonWeights()
	totalWeight := 0.0
	weighted := 0.0
	for _, item := range items {
		id := stringValue(item["regionId"])
		weight := weights[id]
		if weight <= 0 {
			weight = 0.6
		}
		totalWeight += weight
		weighted += floatValue(item["iou"]) * weight
	}
	if totalWeight <= 0 {
		return 0
	}
	return weighted / totalWeight
}

func RunReferenceStructureAudit(bundle *Bundle, sourceImagePath string) (*ReferenceStructureAuditResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	refLayoutPath, refZonesPath := resolveReferenceStructurePaths(sourceImagePath)
	if refLayoutPath == "" || refZonesPath == "" {
		return nil, nil
	}

	currentLayout, err := readJSONMap(filepath.Join(bundle.DetectDir, "layout_model.json"))
	if err != nil {
		return nil, err
	}
	currentZones, err := readJSONMap(filepath.Join(bundle.InferDir, "zones.json"))
	if err != nil {
		return nil, err
	}
	referenceLayout, err := readJSONMap(refLayoutPath)
	if err != nil {
		return nil, err
	}
	referenceZones, err := readJSONMap(refZonesPath)
	if err != nil {
		return nil, err
	}

	currentZoneIndex := canonicalZoneIndex(currentZones)
	referenceZoneIndex := canonicalZoneIndex(referenceZones)
	requiredZones := []string{"search_area", "conversation_list", "chat_header", "message_list", "input_area", "send_action_zone"}
	highPrecisionZones := []string{"search_area", "conversation_list", "chat_header", "input_area", "send_action_zone"}
	coarseZones := []string{"message_list"}
	weights := zoneComparisonWeights()
	missing := make([]string, 0)
	diffs := make([]map[string]any, 0, len(requiredZones))
	minHighPrecisionScore := 1.0
	for _, zoneID := range requiredZones {
		refZone := referenceZoneIndex[zoneID]
		curZone := currentZoneIndex[zoneID]
		if len(refZone) == 0 || len(curZone) == 0 {
			missing = append(missing, zoneID)
			continue
		}
		diff := zoneDiff(zoneID, refZone, curZone, referenceLayout, currentLayout, weights[zoneID])
		diffs = append(diffs, diff)
		if containsZoneID(highPrecisionZones, zoneID) {
			score := floatValue(diff["score"])
			if score < minHighPrecisionScore {
				minHighPrecisionScore = score
			}
		}
	}
	if minHighPrecisionScore > 1 {
		minHighPrecisionScore = 0
	}

	averageScore := averageZoneScore(diffs)
	weightedScore := weightedZoneScore(diffs)
	status := "pass"
	switch {
	case len(missing) > 0 || weightedScore < 0.72 || minHighPrecisionScore < 0.68:
		status = "fail"
	case weightedScore < 0.8 || minHighPrecisionScore < 0.75:
		status = "warn"
	}

	report := map[string]any{
		"schemaVersion":         schemaVersion,
		"createdAt":             time.Now().Format(time.RFC3339),
		"runId":                 bundle.RunID,
		"status":                status,
		"referenceLayoutPath":   filepath.ToSlash(refLayoutPath),
		"referenceZonesPath":    filepath.ToSlash(refZonesPath),
		"currentLayoutPath":     artifactPath(bundle.RunID, "detect/layout_model.json"),
		"currentZonesPath":      artifactPath(bundle.RunID, "infer/zones.json"),
		"requiredZones":         requiredZones,
		"highPrecisionZones":    highPrecisionZones,
		"coarsePrecisionZones":  coarseZones,
		"missingZones":          missing,
		"zoneDiffs":             diffs,
		"averageZoneScore":      round4(averageScore),
		"weightedZoneScore":     round4(weightedScore),
		"minHighPrecisionScore": round4(minHighPrecisionScore),
		"summary":               referenceStructureAuditSummary(status, weightedScore, minHighPrecisionScore, len(diffs)),
	}

	reportPath := filepath.Join(bundle.CompareDir, "reference_structure_audit.json")
	if err := writeJSON(reportPath, report); err != nil {
		return nil, err
	}
	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":                time.Now().Format(time.RFC3339),
		"stage":             "compare.reference-structure",
		"status":            status,
		"runId":             bundle.RunID,
		"detail":            report["summary"],
		"reportPath":        artifactPath(bundle.RunID, "compare/reference_structure_audit.json"),
		"weightedZoneScore": round4(weightedScore),
	}); err != nil {
		return nil, err
	}
	return &ReferenceStructureAuditResult{
		RunID:         bundle.RunID,
		ReportPath:    artifactPath(bundle.RunID, "compare/reference_structure_audit.json"),
		Status:        status,
		AverageScore:  round4(averageScore),
		WeightedScore: round4(weightedScore),
		ComparedZones: len(diffs),
	}, nil
}

func canonicalZoneIndex(payload map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for key, value := range mapValue(payload["zoneByID"]) {
		zone := mapValue(value)
		id := canonicalZoneID(key, stringValue(zone["role"]), stringValue(zone["selector"]))
		if id == "" {
			id = key
		}
		out[id] = canonicalZonePayload(id, zone)
	}
	for _, raw := range arrayOfMaps(payload["zones"]) {
		zoneID := stringValue(raw["id"])
		if zoneID == "" {
			zoneID = stringValue(raw["zoneId"])
		}
		canonicalID := canonicalZoneID(zoneID, stringValue(raw["role"]), stringValue(raw["selector"]))
		if canonicalID == "" {
			continue
		}
		if _, exists := out[canonicalID]; exists {
			continue
		}
		out[canonicalID] = canonicalZonePayload(canonicalID, raw)
	}
	return out
}

func canonicalZonePayload(id string, zone map[string]any) map[string]any {
	normalized := map[string]any{}
	for key, value := range zone {
		normalized[key] = value
	}
	normalized["id"] = id
	return normalized
}

func canonicalZoneID(id, role, selector string) string {
	switch strings.TrimSpace(id) {
	case "conversation_search":
		return "search_area"
	case "sidebar":
		return "left_nav"
	}
	switch strings.TrimSpace(role) {
	case "search_header":
		return "search_area"
	case "nav_rail":
		return "left_nav"
	}
	switch strings.TrimSpace(selector) {
	case "conversation_search":
		return "search_area"
	case "sidebar":
		return "left_nav"
	}
	switch strings.TrimSpace(id) {
	case "search_area", "conversation_list", "chat_header", "message_list", "input_area", "send_action_zone", "left_nav":
		return id
	}
	return strings.TrimSpace(id)
}

func resolveReferenceStructurePaths(sourceImagePath string) (string, string) {
	sourceImagePath = strings.TrimSpace(sourceImagePath)
	if sourceImagePath == "" {
		return "", ""
	}
	seen := map[string]bool{}
	dir := filepath.Dir(sourceImagePath)
	for i := 0; i < 4; i++ {
		if dir == "" || seen[dir] {
			break
		}
		seen[dir] = true
		candidates := []string{
			dir,
			filepath.Dir(dir),
		}
		for _, candidate := range candidates {
			if candidate == "" {
				continue
			}
			layoutPath := filepath.Join(candidate, "detect", "layout_model.json")
			zonesPath := filepath.Join(candidate, "infer", "zones.json")
			if fileExists(layoutPath) && fileExists(zonesPath) {
				return layoutPath, zonesPath
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", ""
}

func containsZoneID(items []string, zoneID string) bool {
	for _, item := range items {
		if item == zoneID {
			return true
		}
	}
	return false
}

func referenceStructureAuditSummary(status string, weightedScore, minHighPrecisionScore float64, comparedZones int) string {
	return fmt.Sprintf("reference structure audit %s: weighted=%.4f minHighPrecision=%.4f zones=%d", status, weightedScore, minHighPrecisionScore, comparedZones)
}

func readImage(path string) (image.Image, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open image %s: %w", path, err)
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return nil, fmt.Errorf("decode image %s: %w", path, err)
	}
	return img, nil
}

func writePNG(path string, img image.Image) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("create compare dir: %w", err)
	}
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create png %s: %w", path, err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		return fmt.Errorf("encode png %s: %w", path, err)
	}
	return nil
}

func pixelDistance(a, b color.Color) float64 {
	ar, ag, ab, _ := a.RGBA()
	br, bg, bb, _ := b.RGBA()
	dr := float64(int(ar>>8) - int(br>>8))
	dg := float64(int(ag>>8) - int(bg>>8))
	db := float64(int(ab>>8) - int(bb>>8))
	return math.Sqrt(dr*dr + dg*dg + db*db)
}

func detectDeviationBoxes(mask [][]bool, blockSize int) []deviationBox {
	if len(mask) == 0 || len(mask[0]) == 0 {
		return nil
	}
	h := len(mask)
	w := len(mask[0])
	blockH := int(math.Ceil(float64(h) / float64(blockSize)))
	blockW := int(math.Ceil(float64(w) / float64(blockSize)))
	blockMask := make([][]bool, blockH)
	for by := 0; by < blockH; by++ {
		blockMask[by] = make([]bool, blockW)
		for bx := 0; bx < blockW; bx++ {
			diffCount := 0
			total := 0
			for y := by * blockSize; y < minCompareInt((by+1)*blockSize, h); y++ {
				for x := bx * blockSize; x < minCompareInt((bx+1)*blockSize, w); x++ {
					total++
					if mask[y][x] {
						diffCount++
					}
				}
			}
			if total > 0 && float64(diffCount)/float64(total) >= 0.18 {
				blockMask[by][bx] = true
			}
		}
	}

	visited := make([][]bool, blockH)
	for y := range visited {
		visited[y] = make([]bool, blockW)
	}

	boxes := make([]deviationBox, 0)
	dirs := [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
	for by := 0; by < blockH; by++ {
		for bx := 0; bx < blockW; bx++ {
			if visited[by][bx] || !blockMask[by][bx] {
				continue
			}
			queue := [][2]int{{bx, by}}
			visited[by][bx] = true
			minBX, minBY, maxBX, maxBY := bx, by, bx, by
			for len(queue) > 0 {
				cur := queue[0]
				queue = queue[1:]
				cx, cy := cur[0], cur[1]
				if cx < minBX {
					minBX = cx
				}
				if cy < minBY {
					minBY = cy
				}
				if cx > maxBX {
					maxBX = cx
				}
				if cy > maxBY {
					maxBY = cy
				}
				for _, d := range dirs {
					nx, ny := cx+d[0], cy+d[1]
					if nx < 0 || ny < 0 || nx >= blockW || ny >= blockH || visited[ny][nx] || !blockMask[ny][nx] {
						continue
					}
					visited[ny][nx] = true
					queue = append(queue, [2]int{nx, ny})
				}
			}
			boxes = append(boxes, deviationBox{
				X:      minBX * blockSize,
				Y:      minBY * blockSize,
				Width:  minCompareInt(w, (maxBX+1)*blockSize) - minBX*blockSize,
				Height: minCompareInt(h, (maxBY+1)*blockSize) - minBY*blockSize,
			})
		}
	}
	return boxes
}

func compareStatus(frameSimilarity, ratio float64) string {
	if frameSimilarity >= 0.85 {
		if ratio <= 0.18 {
			return "pass"
		}
		if ratio <= 0.35 {
			return "warn"
		}
	}
	switch {
	case ratio <= 0.12:
		return "pass"
	case ratio <= 0.30:
		return "warn"
	default:
		return "fail"
	}
}

func buildCompareRecommendations(frameSimilarity, ratio float64, boxes []deviationBox) []string {
	out := make([]string, 0, 4)
	switch {
	case frameSimilarity >= 0.85 && ratio > 0.18:
		out = append(out, "框架层已基本对齐，下一步优先补 OCR 文本、主区域内部层次和控件语义，而不是继续按整图像素硬对齐。")
	case ratio > 0.30:
		out = append(out, "优先修正大块布局与主区域尺寸，当前像素偏差过高，尚不适合进入自动动作链路。")
	case ratio > 0.12:
		out = append(out, "先修正主要偏差区域的尺寸与位置，再收敛颜色和文本。")
	default:
		out = append(out, "块级布局已达到最小 compare 基线，可继续进入更细粒度的文本与颜色修正。")
	}
	if len(boxes) > 0 {
		first := boxes[0]
		out = append(out, fmt.Sprintf("优先检查最大偏差区域 x=%d y=%d w=%d h=%d。", first.X, first.Y, first.Width, first.Height))
	}
	if len(boxes) > 3 {
		out = append(out, "偏差区域分散，建议回看 detect contract 是否存在过度切分或语义缺失。")
	}
	return out
}

func buildCompareDiagnosis(status string, frameSimilarity, ratio float64, boxes []deviationBox) map[string]any {
	failureType := "validation_problem"
	why := "real screenshot is close enough to golden-derived structure"
	nextRepair := "none"
	recommendation := "continue to action-stage gating"
	should := "continue"
	switch status {
	case "fail":
		if frameSimilarity < 0.75 {
			failureType = "structure_problem"
			why = "main layout columns or key regions diverged too much from golden-derived structure"
			nextRepair = "refresh live screenshot and rerun detect/infer"
			recommendation = "retry after fresh capture; escalate if window size/layout changed"
			should = "retry"
		} else {
			failureType = "validation_problem"
			why = "large visual mismatch remains after mirror/compare despite acceptable frame structure"
			nextRepair = "repair compare thresholds or region mapping"
			recommendation = "diagnose mismatch regions before retry"
			should = "repair"
		}
	case "warn":
		failureType = "recognition_problem"
		why = "coarse structure is usable but some layout zones still differ"
		nextRepair = "refresh OCR/zone evidence and rerun compare"
		recommendation = "continue cautiously with real validation gate still active"
		should = "retry"
	}
	return map[string]any{
		"currentFailedStage":  "ValidateRealAppAgainstGolden",
		"why":                 why,
		"failureType":         failureType,
		"nextRepair":          nextRepair,
		"recommendedAction":   recommendation,
		"should":              should,
		"mismatchRegionCount": len(boxes),
		"frameSimilarity":     frameSimilarity,
		"pixelDiffRatio":      ratio,
	}
}

func compareSummary(frameSimilarity, ratio float64, deviationCount int) string {
	if frameSimilarity >= 0.85 {
		return fmt.Sprintf("frame similarity %.4f with coarse pixel diff %.4f across %d deviation regions", frameSimilarity, ratio, deviationCount)
	}
	return fmt.Sprintf("pixel diff ratio %.4f across %d deviation regions", ratio, deviationCount)
}

func decodeCompareReport(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func minCompareInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxCompareInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func computeFrameSimilarity(bundle *Bundle) (float64, []map[string]any) {
	modelPath := filepath.Join(bundle.DetectDir, "layout_model.json")
	metaPath := filepath.Join(bundle.MirrorDir, "meta.json")
	model, err := decodeCompareReport(modelPath)
	if err != nil {
		return 0, []map[string]any{}
	}
	meta, err := decodeCompareReport(metaPath)
	if err != nil {
		return 0, []map[string]any{}
	}
	structure := mapValue(model["structure"])
	expected := arrayOfMaps(structure["majorZones"])
	visible := arrayOfMaps(meta["visibleCells"])
	mirrorZones := make([]map[string]any, 0)
	for _, cell := range visible {
		if stringValue(cell["kind"]) == "zone" {
			mirrorZones = append(mirrorZones, cell)
		}
	}
	if len(expected) == 0 || len(mirrorZones) == 0 {
		return 0, []map[string]any{}
	}
	total := 0.0
	items := make([]map[string]any, 0, len(expected))
	for _, zone := range expected {
		best := 0.0
		for _, mirrorZone := range mirrorZones {
			iou := rectIoU(zone, mirrorZone)
			if iou > best {
				best = iou
			}
		}
		total += best
		items = append(items, map[string]any{
			"regionId": stringValue(zone["id"]),
			"role":     stringValue(zone["role"]),
			"iou":      best,
		})
	}
	return total / float64(len(expected)), items
}

func rectIoU(a, b map[string]any) float64 {
	ax0 := intValue(a["x"])
	ay0 := intValue(a["y"])
	ax1 := ax0 + intValue(a["width"])
	ay1 := ay0 + intValue(a["height"])
	bx0 := intValue(b["x"])
	by0 := intValue(b["y"])
	bx1 := bx0 + intValue(b["width"])
	by1 := by0 + intValue(b["height"])
	ix := overlapCompare(ax0, ax1, bx0, bx1)
	iy := overlapCompare(ay0, ay1, by0, by1)
	if ix <= 0 || iy <= 0 {
		return 0
	}
	inter := float64(ix * iy)
	union := float64((ax1-ax0)*(ay1-ay0) + (bx1-bx0)*(by1-by0) - int(inter))
	if union <= 0 {
		return 0
	}
	return inter / union
}

func overlapCompare(a0, a1, b0, b1 int) int {
	start := maxCompareInt(a0, b0)
	end := minCompareInt(a1, b1)
	if end <= start {
		return 0
	}
	return end - start
}
