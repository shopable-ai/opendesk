package visionrun

import (
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opendesk/automation"
)

type DetectOptions struct {
	SourceImagePath string
	Window          map[string]any
	LayoutOptions   map[string]any
}

type DetectResult struct {
	RunID          string
	SourceImage    string
	RegionsPath    string
	AnnotatedImage string
	RegionCount    int
}

func RunDetect(bundle *Bundle, opts DetectOptions) (*DetectResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}

	sourceImagePath := strings.TrimSpace(opts.SourceImagePath)
	if sourceImagePath == "" {
		return nil, fmt.Errorf("source image path is required")
	}

	captureTarget := filepath.Join(bundle.CaptureDir, "source.png")
	if err := copyImageAsPNG(sourceImagePath, captureTarget); err != nil {
		_ = appendAuditEvent(bundle.AuditLog, map[string]any{
			"ts":     time.Now().Format(time.RFC3339),
			"stage":  "detect.capture",
			"status": "fail",
			"runId":  bundle.RunID,
			"detail": err.Error(),
		})
		_ = updateDecision(bundle.Decision, func(payload map[string]any) {
			payload["status"] = "fail"
			payload["canProceed"] = false
			payload["nextStep"] = "detect"
			payload["summary"] = "detect failed while preparing source image"
			payload["stopCondition"] = "capture source normalization failed"
		})
		return nil, err
	}

	vision := automation.NewVision()
	layoutOptions := defaultDetectLayoutOptions()
	for key, value := range opts.LayoutOptions {
		layoutOptions[key] = value
	}
	layoutOptions["imagePath"] = captureTarget

	layout, err := vision.AnalyzeLayout(layoutOptions)
	if err != nil {
		_ = appendAuditEvent(bundle.AuditLog, map[string]any{
			"ts":     time.Now().Format(time.RFC3339),
			"stage":  "detect.layout",
			"status": "fail",
			"runId":  bundle.RunID,
			"detail": err.Error(),
		})
		_ = updateDecision(bundle.Decision, func(payload map[string]any) {
			payload["status"] = "fail"
			payload["canProceed"] = false
			payload["nextStep"] = "detect"
			payload["summary"] = "detect failed during layout analysis"
			payload["stopCondition"] = "layout analyze failed"
		})
		return nil, fmt.Errorf("analyze layout: %w", err)
	}

	width := intValue(layout["width"])
	height := intValue(layout["height"])
	warnings := normalizeStringSlice(layout["warnings"])
	regions := normalizeDetectRegions(layout["regions"])

	annotatedRelative := artifactPath(bundle.RunID, "detect/annotated.png")
	annotatedPath := filepath.Join(bundle.DetectDir, "annotated.png")
	if _, err := vision.AnnotateRegions(map[string]any{
		"imagePath":  captureTarget,
		"regions":    layout["regions"],
		"separators": layout["separators"],
		"title":      bundle.RunID,
		"outputPath": annotatedPath,
	}); err != nil {
		warnings = append(warnings, "annotate failed: "+err.Error())
		annotatedRelative = ""
	}

	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"sourceImage":   artifactPath(bundle.RunID, "capture/source.png"),
		"window": map[string]any{
			"x":      0,
			"y":      0,
			"width":  width,
			"height": height,
		},
		"regions":    regions,
		"separators": layout["separators"],
		"warnings":   warnings,
		"detector": map[string]any{
			"type":          "layout-first-hybrid",
			"layoutEngine":  "automation/image_layout.go",
			"layoutOptions": layoutOptionsForReport(layoutOptions),
		},
	}
	if len(opts.Window) > 0 {
		report["window"] = opts.Window
	}
	if annotatedRelative != "" {
		report["annotatedImage"] = annotatedRelative
	}

	regionsPath := filepath.Join(bundle.DetectDir, "regions.json")
	if err := writeJSON(regionsPath, report); err != nil {
		return nil, err
	}

	if err := appendAuditEvent(bundle.AuditLog, map[string]any{
		"ts":          time.Now().Format(time.RFC3339),
		"stage":       "detect.layout",
		"status":      "pass",
		"runId":       bundle.RunID,
		"detail":      "wrote detect contract",
		"regionCount": len(regions),
		"regionsPath": artifactPath(bundle.RunID, "detect/regions.json"),
	}); err != nil {
		return nil, err
	}

	if err := updateDecision(bundle.Decision, func(payload map[string]any) {
		payload["status"] = "pending"
		payload["canProceed"] = true
		payload["nextStep"] = "infer-structure"
		payload["summary"] = fmt.Sprintf("detect contract ready with %d regions", len(regions))
		payload["stopCondition"] = ""
		payload["detect"] = map[string]any{
			"regionCount": len(regions),
			"regionsPath": artifactPath(bundle.RunID, "detect/regions.json"),
		}
	}); err != nil {
		return nil, err
	}

	return &DetectResult{
		RunID:          bundle.RunID,
		SourceImage:    artifactPath(bundle.RunID, "capture/source.png"),
		RegionsPath:    artifactPath(bundle.RunID, "detect/regions.json"),
		AnnotatedImage: annotatedRelative,
		RegionCount:    len(regions),
	}, nil
}

func defaultDetectLayoutOptions() map[string]any {
	return map[string]any{
		"cellSize":          8,
		"quantize":          16,
		"tolerance":         32,
		"minRegionArea":     4,
		"minSeparatorScore": 0.08,
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
	}
}

func layoutOptionsForReport(options map[string]any) map[string]any {
	out := map[string]any{}
	for _, key := range []string{
		"cellSize",
		"quantize",
		"tolerance",
		"minRegionArea",
		"minSeparatorScore",
		"cellColorMode",
		"boundarySpanWidth",
	} {
		if value, ok := options[key]; ok {
			out[key] = value
		}
	}
	return out
}

func normalizeDetectRegions(raw any) []map[string]any {
	items := make([]map[string]any, 0)
	switch typed := raw.(type) {
	case []map[string]any:
		items = append(items, typed...)
	case []any:
		for _, item := range typed {
			if row, ok := item.(map[string]any); ok {
				items = append(items, row)
				continue
			}
			if row, ok := item.(map[string]interface{}); ok {
				items = append(items, row)
			}
		}
	}

	out := make([]map[string]any, 0, len(items))
	for index, item := range items {
		bbox := normalizeBBox(item["bbox"])
		if bbox["width"].(int) <= 0 || bbox["height"].(int) <= 0 {
			continue
		}

		id := stringValue(item["id"])
		if id == "" {
			id = fmt.Sprintf("region_%02d", index+1)
		}
		role := stringValue(item["role"])
		if role == "" {
			role = "layout_region"
		}

		out = append(out, map[string]any{
			"id":         id,
			"role":       role,
			"label":      stringValue(item["label"]),
			"bbox":       bbox,
			"avgColor":   defaultString(stringValue(item["avgColor"]), "#000000"),
			"ocrText":    "",
			"confidence": clamp01(floatValue(item["confidence"])),
		})
	}
	return out
}

func normalizeBBox(raw any) map[string]any {
	row, ok := raw.(map[string]any)
	if !ok {
		if converted, ok := raw.(map[string]interface{}); ok {
			row = converted
		}
	}
	if row == nil {
		return map[string]any{"x": 0, "y": 0, "width": 0, "height": 0}
	}
	return map[string]any{
		"x":      intValue(row["x"]),
		"y":      intValue(row["y"]),
		"width":  intValue(row["width"]),
		"height": intValue(row["height"]),
	}
}

func normalizeStringSlice(raw any) []string {
	switch typed := raw.(type) {
	case nil:
		return nil
	case []string:
		return append([]string(nil), typed...)
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if s := strings.TrimSpace(fmt.Sprintf("%v", item)); s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		s := strings.TrimSpace(fmt.Sprintf("%v", typed))
		if s == "" {
			return nil
		}
		return []string{s}
	}
}

func artifactPath(runID, name string) string {
	return filepath.ToSlash(filepath.Join(".runtime", "runs", runID, name))
}

func copyImageAsPNG(srcPath, dstPath string) error {
	srcAbs, err := filepath.Abs(strings.TrimSpace(srcPath))
	if err != nil {
		return fmt.Errorf("resolve source image path: %w", err)
	}
	file, err := os.Open(srcAbs)
	if err != nil {
		return fmt.Errorf("open source image %s: %w", srcAbs, err)
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		return fmt.Errorf("decode source image %s: %w", srcAbs, err)
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return fmt.Errorf("mkdir %s: %w", filepath.Dir(dstPath), err)
	}
	out, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("create capture image %s: %w", dstPath, err)
	}
	defer out.Close()
	if err := png.Encode(out, img); err != nil {
		return fmt.Errorf("encode capture image %s: %w", dstPath, err)
	}
	return nil
}

func updateDecision(path string, mutate func(map[string]any)) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read decision %s: %w", path, err)
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return fmt.Errorf("decode decision %s: %w", path, err)
	}
	mutate(payload)
	payload["updatedAt"] = time.Now().Format(time.RFC3339)
	return writeJSON(path, payload)
}

func stringValue(value any) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", value))
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case int32:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	default:
		return 0
	}
}

func floatValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case int32:
		return float64(typed)
	default:
		return 0
	}
}

func clamp01(value float64) float64 {
	switch {
	case value < 0:
		return 0
	case value > 1:
		return 1
	default:
		return value
	}
}
