package automation

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"
)

type layoutSeparator struct {
	Orientation string                 `json:"orientation"`
	Position    int                    `json:"position"`
	Thickness   int                    `json:"thickness"`
	Score       float64                `json:"score"`
	Source      string                 `json:"source"`
	Confidence  float64                `json:"confidence"`
	Meta        map[string]interface{} `json:"meta,omitempty"`
}

type layoutRegion struct {
	ID         string                 `json:"id"`
	Role       string                 `json:"role"`
	Label      string                 `json:"label"`
	BBox       VisionBBox             `json:"bbox"`
	AvgColor   string                 `json:"avgColor"`
	Center     map[string]int         `json:"center"`
	Confidence float64                `json:"confidence"`
	Meta       map[string]interface{} `json:"meta,omitempty"`
}

func (v *Vision) AnalyzeLayout(options map[string]interface{}) (map[string]interface{}, error) {
	options = visionMergedOptions(options)
	img, err := visionDecodeImageOptions(options)
	if err != nil {
		return nil, err
	}
	return analyzeLayoutImage(img, options)
}

func (v *Vision) AnnotateRegions(options map[string]interface{}) (map[string]interface{}, error) {
	options = visionMergedOptions(options)
	img, err := visionDecodeImageOptions(options)
	if err != nil {
		return nil, err
	}
	rgba := cloneImageToRGBA(img)

	regions, err := visionParseRegions(options["regions"])
	if err != nil {
		return nil, err
	}
	separators := visionParseSeparators(options["separators"])

	if len(regions) == 0 && len(separators) == 0 {
		layout, layoutErr := v.AnalyzeLayout(options)
		if layoutErr != nil {
			return nil, layoutErr
		}
		regions, err = visionParseRegions(layout["regions"])
		if err != nil {
			return nil, err
		}
		separators = visionParseSeparators(layout["separators"])
	}

	drawVisionAnnotations(rgba, separators, regions, strings.TrimSpace(visionStringOption(options, "title", "")))

	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return nil, fmt.Errorf("failed to encode annotated image: %w", err)
	}

	result := map[string]interface{}{
		"width":  rgba.Bounds().Dx(),
		"height": rgba.Bounds().Dy(),
		"count":  len(regions),
		"image":  fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(buf.Bytes())),
	}

	outputPath := strings.TrimSpace(visionStringOption(options, "outputPath", ""))
	if outputPath != "" {
		absPath, err := filepath.Abs(outputPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve outputPath: %w", err)
		}
		if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
			return nil, fmt.Errorf("failed to create annotate output dir: %w", err)
		}
		if err := os.WriteFile(absPath, buf.Bytes(), 0644); err != nil {
			return nil, fmt.Errorf("failed to write annotated image: %w", err)
		}
		result["outputPath"] = absPath
	}

	return result, nil
}

func drawVisionAnnotations(img *image.RGBA, separators []layoutSeparator, regions []layoutRegion, title string) {
	d := NewDrawer(img)

	// Draw title if provided
	if strings.TrimSpace(title) != "" {
		d.TextWithBackground(10, 22, title, color.RGBA{255, 255, 255, 255}, color.RGBA{25, 25, 25, 220})
	}

	// Draw separators
	for _, sep := range separators {
		c := colorForSeparator(sep.Orientation)
		start, end := separatorSpan(sep, img.Bounds())

		d.WithStroke(c).WithThickness(1)
		if sep.Orientation == "vertical" {
			d.VLine(sep.Position, start, end)
		} else if sep.Orientation == "horizontal" {
			d.HLine(start, end, sep.Position)
		}
	}

	// Draw regions
	for _, region := range regions {
		rect := bboxToRect(region.BBox).Intersect(img.Bounds())
		c := colorForRegion(region.Role, region.ID)

		// Draw rectangle outline
		d.WithStroke(c).WithThickness(2).Rect(rect.Min.X, rect.Min.Y, rect.Dx(), rect.Dy())

		// Prepare label
		label := strings.TrimSpace(region.Label)
		if label == "" {
			label = region.ID
		}
		if region.Confidence > 0 {
			label = fmt.Sprintf("%s %.2f", label, region.Confidence)
		}
		if strings.TrimSpace(region.AvgColor) != "" {
			label = fmt.Sprintf("%s %s", label, region.AvgColor)
		}

		// Draw label with background
		labelX := rect.Min.X + 4
		labelY := maxInt(14, rect.Min.Y+16)
		d.TextWithBackground(labelX, labelY, label, color.RGBA{255, 255, 255, 255}, c)
	}
}

func separatorSpan(sep layoutSeparator, bounds image.Rectangle) (int, int) {
	start := 0
	end := 0
	if sep.Orientation == "vertical" {
		end = bounds.Max.Y - 1
	} else {
		end = bounds.Max.X - 1
	}
	if sep.Meta == nil {
		return start, end
	}
	raw, ok := sep.Meta["span"].(map[string]interface{})
	if !ok {
		return start, end
	}
	start = maxInt(start, visionInt(raw["start"], start))
	end = minInt(end, visionInt(raw["end"], end)-1)
	if end < start {
		end = start
	}
	return start, end
}

func visionParseRegions(raw interface{}) ([]layoutRegion, error) {
	if raw == nil {
		return nil, nil
	}
	if typed, ok := raw.([]layoutRegion); ok {
		return typed, nil
	}
	if typed, ok := raw.([]map[string]interface{}); ok {
		items := make([]interface{}, 0, len(typed))
		for _, item := range typed {
			items = append(items, item)
		}
		raw = items
	}
	items, ok := raw.([]interface{})
	if !ok {
		return nil, fmt.Errorf("regions must be an array")
	}
	regions := make([]layoutRegion, 0, len(items))
	for _, item := range items {
		row, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		bbox := parseVisionBBox(row["bbox"])
		if bbox.Width <= 0 || bbox.Height <= 0 {
			continue
		}
		id := strings.TrimSpace(visionString(row["id"], ""))
		role := strings.TrimSpace(visionString(row["role"], id))
		label := strings.TrimSpace(visionString(row["label"], id))
		regions = append(regions, layoutRegion{
			ID:         id,
			Role:       role,
			Label:      label,
			BBox:       bbox,
			AvgColor:   strings.TrimSpace(visionString(row["avgColor"], "")),
			Center:     parseLayoutCenter(row["center"]),
			Confidence: visionFloat(row["confidence"], 0),
			Meta:       visionToMap(row["meta"]),
		})
	}
	return regions, nil
}

func visionParseSeparators(raw interface{}) []layoutSeparator {
	items := make([]layoutSeparator, 0)
	switch node := raw.(type) {
	case map[string]interface{}:
		appendParsedSeparators(&items, node["vertical"], "vertical")
		appendParsedSeparators(&items, node["horizontal"], "horizontal")
	case []layoutSeparator:
		items = append(items, node...)
	case []interface{}:
		appendParsedSeparators(&items, node, "")
	}
	return items
}

func appendParsedSeparators(out *[]layoutSeparator, raw interface{}, defaultOrientation string) {
	switch typed := raw.(type) {
	case []layoutSeparator:
		*out = append(*out, typed...)
	case []map[string]interface{}:
		for _, item := range typed {
			if sep, ok := parseSeparator(item, defaultOrientation); ok {
				*out = append(*out, sep)
			}
		}
	case []interface{}:
		for _, item := range typed {
			if sep, ok := parseSeparator(item, defaultOrientation); ok {
				*out = append(*out, sep)
			}
		}
	}
}

func parseSeparator(raw interface{}, defaultOrientation string) (layoutSeparator, bool) {
	if typed, ok := raw.(layoutSeparator); ok {
		if typed.Orientation == "" {
			typed.Orientation = defaultOrientation
		}
		return typed, typed.Position >= 0
	}
	row, ok := raw.(map[string]interface{})
	if !ok {
		return layoutSeparator{}, false
	}
	position := visionInt(row["position"], -1)
	if position < 0 {
		return layoutSeparator{}, false
	}
	orientation := strings.TrimSpace(visionString(row["orientation"], defaultOrientation))
	if orientation == "" {
		orientation = defaultOrientation
	}
	return layoutSeparator{
		Orientation: orientation,
		Position:    position,
		Thickness:   maxInt(1, visionInt(row["thickness"], 2)),
		Score:       visionFloat(row["score"], 0),
		Source:      strings.TrimSpace(visionString(row["source"], "")),
		Confidence:  visionFloat(row["confidence"], 0),
		Meta:        visionToMap(row["meta"]),
	}, true
}

func parseLayoutCenter(raw interface{}) map[string]int {
	row, ok := raw.(map[string]interface{})
	if !ok {
		return nil
	}
	return map[string]int{
		"x": visionInt(row["x"], 0),
		"y": visionInt(row["y"], 0),
	}
}

func bboxToRect(b VisionBBox) image.Rectangle {
	return image.Rect(b.X, b.Y, b.X+b.Width, b.Y+b.Height)
}

func visionDecodeImageOptions(options map[string]interface{}) (image.Image, error) {
	raw, err := visionExtractImage(options)
	if err != nil {
		return nil, err
	}
	decoded, err := base64.StdEncoding.DecodeString(normalizeVisionBase64(raw))
	if err != nil {
		return nil, fmt.Errorf("failed to decode vision image: %w", err)
	}
	img, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		return nil, fmt.Errorf("failed to parse vision image: %w", err)
	}
	return img, nil
}

func cloneImageToRGBA(src image.Image) *image.RGBA {
	bounds := src.Bounds()
	dst := image.NewRGBA(bounds)
	draw.Draw(dst, bounds, src, bounds.Min, draw.Src)
	return dst
}

func colorForSeparator(orientation string) color.RGBA {
	if orientation == "horizontal" {
		return color.RGBA{239, 68, 68, 255}
	}
	return color.RGBA{59, 130, 246, 255}
}

func colorForRegion(role, id string) color.RGBA {
	key := strings.ToLower(strings.TrimSpace(role))
	if key == "" {
		key = strings.ToLower(strings.TrimSpace(id))
	}
	switch key {
	case "layout_region":
		return color.RGBA{15, 118, 110, 220}
	case "list_row":
		return color.RGBA{245, 158, 11, 220}
	default:
		return color.RGBA{15, 118, 110, 220}
	}
}

func clampInt(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
