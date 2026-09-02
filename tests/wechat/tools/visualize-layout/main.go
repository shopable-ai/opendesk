// Command visualize-layout analyzes a captured WeChat screenshot and writes
// annotated images plus a JSON summary. It is intentionally a standalone
// developer tool, not a package test.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"opendesk/automation"
)

const defaultOutputDir = ".runtime/tests/wechat/wechat_validation"

type separator struct {
	Position   int
	Confidence float64
}

func main() {
	flags := flag.NewFlagSet("visualize-layout", flag.ExitOnError)
	imagePath := flags.String("image", filepath.Join(defaultOutputDir, "wechat_original.png"), "captured screenshot")
	outputDir := flags.String("output", defaultOutputDir, "directory for annotated images and JSON")
	flags.Parse(os.Args[1:])

	normalizedOutputDir, err := runtimeOutputDir(*outputDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "visualize-layout: %v\n", err)
		os.Exit(2)
	}
	if err := run(*imagePath, normalizedOutputDir); err != nil {
		fmt.Fprintf(os.Stderr, "visualize-layout: %v\n", err)
		os.Exit(1)
	}
}

func runtimeOutputDir(path string) (string, error) {
	absPath, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", fmt.Errorf("resolve output directory: %w", err)
	}
	runtimeRoot, err := filepath.Abs(".runtime")
	if err != nil {
		return "", fmt.Errorf("resolve .runtime directory: %w", err)
	}
	relative, err := filepath.Rel(runtimeRoot, absPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("output directory must stay below .runtime: %s", path)
	}
	return absPath, nil
}

func run(imagePath, outputDir string) error {
	file, err := os.Open(imagePath)
	if err != nil {
		return fmt.Errorf("open screenshot %s: %w", imagePath, err)
	}
	original, _, decodeErr := image.Decode(file)
	file.Close()
	if decodeErr != nil {
		return fmt.Errorf("decode screenshot %s: %w", imagePath, decodeErr)
	}

	// ImageColor is the same exported Go implementation exposed to JavaScript
	// as ImageColor.loadBase64/analyzeLayout.
	imageColor := automation.NewImageColor()
	encoded, err := imageColor.LoadBase64(imagePath)
	if err != nil {
		return fmt.Errorf("load screenshot as base64: %w", err)
	}

	results := make(map[string]map[string]interface{}, 2)
	for _, mode := range []struct {
		name string
		opt  map[string]interface{}
	}{
		{"median", map[string]interface{}{"cellSize": 10, "quantize": 16, "tolerance": 32, "minRegionArea": 4, "minSeparatorScore": 0.08, "cellColorMode": "median", "boundarySpanWidth": 3}},
		{"mean", map[string]interface{}{"cellSize": 10, "quantize": 16, "tolerance": 32, "minRegionArea": 4, "minSeparatorScore": 0.14, "cellColorMode": "mean", "boundarySpanWidth": 1}},
	} {
		result, err := imageColor.AnalyzeLayout(encoded, mode.opt)
		if err != nil {
			return fmt.Errorf("analyze %s mode: %w", mode.name, err)
		}
		results[mode.name] = result
		path := filepath.Join(outputDir, "wechat_"+mode.name+".png")
		if err := writeVisualization(path, original, result); err != nil {
			return err
		}
		separators := extractSeparators(result)
		fmt.Printf("%s: %d vertical, %d horizontal -> %s\n", mode.name, len(separators.vertical), len(separators.horizontal), path)
	}

	data, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		return fmt.Errorf("encode analysis results: %w", err)
	}
	resultPath := filepath.Join(outputDir, "analysis_results.json")
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}
	if err := os.WriteFile(resultPath, data, 0o644); err != nil {
		return fmt.Errorf("write analysis results: %w", err)
	}
	fmt.Printf("analysis results: %s\n", resultPath)
	return nil
}

func writeVisualization(path string, original image.Image, result map[string]interface{}) error {
	bounds := original.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, original, bounds.Min, draw.Src)
	separators := extractSeparators(result)
	for _, item := range separators.vertical {
		drawLine(img, item.Position, true, confidenceColor(color.RGBA{255, 0, 0, 255}, item.Confidence))
	}
	for _, item := range separators.horizontal {
		drawLine(img, item.Position, false, confidenceColor(color.RGBA{0, 100, 255, 255}, item.Confidence))
	}
	return writePNG(path, img)
}

type separatorGroups struct {
	vertical   []separator
	horizontal []separator
}

func extractSeparators(result map[string]interface{}) separatorGroups {
	groups, _ := result["separators"].(map[string]interface{})
	return separatorGroups{
		vertical:   extractSeparatorList(groups["vertical"]),
		horizontal: extractSeparatorList(groups["horizontal"]),
	}
}

func extractSeparatorList(value interface{}) []separator {
	var items []interface{}
	switch typed := value.(type) {
	case []interface{}:
		items = typed
	case []map[string]interface{}:
		for _, item := range typed {
			items = append(items, item)
		}
	}
	separators := make([]separator, 0, len(items))
	for _, item := range items {
		entry, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		position, ok := numberAsInt(entry["position"])
		if !ok {
			continue
		}
		confidence, _ := numberAsFloat(entry["confidence"])
		separators = append(separators, separator{Position: position, Confidence: confidence})
	}
	return separators
}

func numberAsInt(value interface{}) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, true
	case int32:
		return int(number), true
	case int64:
		return int(number), true
	case float32:
		return int(number), true
	case float64:
		return int(number), true
	default:
		return 0, false
	}
}

func numberAsFloat(value interface{}) (float64, bool) {
	switch number := value.(type) {
	case int:
		return float64(number), true
	case int32:
		return float64(number), true
	case int64:
		return float64(number), true
	case float32:
		return float64(number), true
	case float64:
		return number, true
	default:
		return 0, false
	}
}

func confidenceColor(base color.RGBA, confidence float64) color.RGBA {
	if confidence < 0.4 {
		confidence = 0.4
	}
	if confidence > 1 {
		confidence = 1
	}
	base.A = uint8(confidence * 255)
	return base
}

func drawLine(img *image.RGBA, position int, vertical bool, col color.Color) {
	bounds := img.Bounds()
	if vertical {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := position - 1; x <= position+1; x++ {
				if x >= bounds.Min.X && x < bounds.Max.X {
					img.Set(x, y, col)
				}
			}
		}
		return
	}
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for y := position - 1; y <= position+1; y++ {
			if y >= bounds.Min.Y && y < bounds.Max.Y {
				img.Set(x, y, col)
			}
		}
	}
}

func writePNG(path string, img image.Image) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create parent for %s: %w", path, err)
	}
	file, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create %s: %w", path, err)
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		return fmt.Errorf("encode %s: %w", path, err)
	}
	return nil
}
