// Command image-layout-lab generates deterministic layout fixtures and renders
// the result of ImageColor.analyzeLayout. It is a developer tool, not a Go
// package test: all disposable output is written below .runtime/.
package main

import (
	"encoding/json"
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

type groundTruth struct {
	Name                 string `json:"name"`
	Description          string `json:"description"`
	Width                int    `json:"width"`
	Height               int    `json:"height"`
	VerticalSeparators   []int  `json:"verticalSeparators"`
	HorizontalSeparators []int  `json:"horizontalSeparators"`
}

const defaultOutputDir = ".runtime/tests/automation/image-layout"

func main() {
	command := "all"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	outputDir := defaultOutputDir
	if len(os.Args) > 2 {
		outputDir = os.Args[2]
	}
	normalizedOutputDir, err := runtimeOutputDir(outputDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "image-layout-lab: %v\n", err)
		os.Exit(2)
	}
	outputDir = normalizedOutputDir

	err = nil
	switch command {
	case "generate":
		err = generateFixtures(outputDir)
	case "visualize":
		err = visualizeFixtures(outputDir)
	case "all":
		err = generateFixtures(outputDir)
		if err == nil {
			err = visualizeFixtures(outputDir)
		}
	case "help", "-h", "--help":
		usage()
		return
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "image-layout-lab: %v\n", err)
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

func usage() {
	fmt.Println("Usage: go run ./tests/automation/tools/image-layout-lab [generate|visualize|all] [output-dir]")
	fmt.Printf("Default output-dir: %s\n", defaultOutputDir)
}

func generateFixtures(outputDir string) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	fixtures := []struct {
		truth groundTruth
		make  func() *image.RGBA
	}{
		{
			truth: groundTruth{
				Name:               "three_columns",
				Description:        "3 equal columns",
				Width:              600,
				Height:             400,
				VerticalSeparators: []int{200, 400},
			},
			make: func() *image.RGBA {
				img := image.NewRGBA(image.Rect(0, 0, 600, 400))
				fill(img, image.Rect(0, 0, 200, 400), color.RGBA{50, 50, 50, 255})
				fill(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255})
				fill(img, image.Rect(400, 0, 600, 400), color.RGBA{255, 255, 255, 255})
				return img
			},
		},
		{
			truth: groundTruth{
				Name:                 "sidebar_layout",
				Description:          "Sidebar + main area",
				Width:                800,
				Height:               600,
				VerticalSeparators:   []int{250},
				HorizontalSeparators: []int{80, 520},
			},
			make: func() *image.RGBA {
				img := image.NewRGBA(image.Rect(0, 0, 800, 600))
				fill(img, image.Rect(0, 0, 250, 600), color.RGBA{45, 45, 45, 255})
				fill(img, image.Rect(250, 0, 800, 80), color.RGBA{240, 240, 240, 255})
				fill(img, image.Rect(250, 80, 800, 520), color.RGBA{255, 255, 255, 255})
				fill(img, image.Rect(250, 520, 800, 600), color.RGBA{245, 245, 245, 255})
				return img
			},
		},
		{
			truth: groundTruth{
				Name:                 "grid_layout",
				Description:          "2x2 grid",
				Width:                600,
				Height:               400,
				VerticalSeparators:   []int{300},
				HorizontalSeparators: []int{200},
			},
			make: func() *image.RGBA {
				img := image.NewRGBA(image.Rect(0, 0, 600, 400))
				fill(img, image.Rect(0, 0, 300, 200), color.RGBA{100, 100, 100, 255})
				fill(img, image.Rect(300, 0, 600, 200), color.RGBA{150, 150, 150, 255})
				fill(img, image.Rect(0, 200, 300, 400), color.RGBA{200, 200, 200, 255})
				fill(img, image.Rect(300, 200, 600, 400), color.RGBA{250, 250, 250, 255})
				return img
			},
		},
		{
			truth: groundTruth{
				Name:                 "complex_with_text",
				Description:          "Complex app layout with text",
				Width:                1000,
				Height:               700,
				VerticalSeparators:   []int{250},
				HorizontalSeparators: []int{60},
			},
			make: func() *image.RGBA {
				img := image.NewRGBA(image.Rect(0, 0, 1000, 700))
				fill(img, image.Rect(0, 0, 1000, 60), color.RGBA{240, 240, 240, 255})
				fill(img, image.Rect(0, 60, 250, 700), color.RGBA{50, 50, 50, 255})
				fill(img, image.Rect(250, 60, 1000, 700), color.RGBA{255, 255, 255, 255})
				for y := 80; y < 680; y += 45 {
					fill(img, image.Rect(15, y, 40, y+25), color.RGBA{100, 100, 100, 255})
					for x := 50; x < 230; x += 8 {
						fill(img, image.Rect(x, y+5, x+6, y+18), color.RGBA{200, 200, 200, 255})
					}
				}
				for y := 100; y < 680; y += 30 {
					for x := 270; x < 950; x += 10 {
						fill(img, image.Rect(x, y, x+8, y+14), color.RGBA{100, 100, 100, 255})
					}
				}
				return img
			},
		},
	}

	truths := make([]groundTruth, 0, len(fixtures))
	for _, fixture := range fixtures {
		truths = append(truths, fixture.truth)
		path := filepath.Join(outputDir, fixture.truth.Name+".png")
		if err := writePNG(path, fixture.make()); err != nil {
			return err
		}
		fmt.Printf("generated %s (V:%v H:%v)\n", path, fixture.truth.VerticalSeparators, fixture.truth.HorizontalSeparators)
	}

	data, err := json.MarshalIndent(truths, "", "  ")
	if err != nil {
		return fmt.Errorf("encode ground truth: %w", err)
	}
	path := filepath.Join(outputDir, "ground_truth.json")
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write ground truth: %w", err)
	}
	fmt.Printf("generated ground truth: %s\n", path)
	return nil
}

func visualizeFixtures(outputDir string) error {
	data, err := os.ReadFile(filepath.Join(outputDir, "ground_truth.json"))
	if err != nil {
		return fmt.Errorf("read ground truth: %w", err)
	}
	var truths []groundTruth
	if err := json.Unmarshal(data, &truths); err != nil {
		return fmt.Errorf("parse ground truth: %w", err)
	}
	visualDir := filepath.Join(outputDir, "visualized")
	if err := os.MkdirAll(visualDir, 0o755); err != nil {
		return fmt.Errorf("create visualization directory: %w", err)
	}

	for _, truth := range truths {
		imagePath := filepath.Join(outputDir, truth.Name+".png")
		file, err := os.Open(imagePath)
		if err != nil {
			return fmt.Errorf("open %s: %w", imagePath, err)
		}
		original, _, decodeErr := image.Decode(file)
		file.Close()
		if decodeErr != nil {
			return fmt.Errorf("decode %s: %w", imagePath, decodeErr)
		}

		// This is deliberately a tool-level call through the same exported Go
		// API used by the JavaScript ImageColor binding.
		imageColor := automation.NewImageColor()
		encoded, err := imageColor.LoadBase64(imagePath)
		if err != nil {
			return err
		}
		for _, mode := range []struct {
			name string
			opt  map[string]interface{}
		}{
			{"median", map[string]interface{}{"cellSize": 10, "quantize": 16, "tolerance": 32, "minRegionArea": 4, "minSeparatorScore": 0.08, "cellColorMode": "median", "boundarySpanWidth": 3}},
			{"mean", map[string]interface{}{"cellSize": 10, "quantize": 16, "tolerance": 32, "minRegionArea": 4, "minSeparatorScore": 0.14, "cellColorMode": "mean", "boundarySpanWidth": 1}},
		} {
			result, err := imageColor.AnalyzeLayout(encoded, mode.opt)
			if err != nil {
				return fmt.Errorf("analyze %s/%s: %w", truth.Name, mode.name, err)
			}
			path := filepath.Join(visualDir, truth.Name+"_"+mode.name+".png")
			if err := writeVisualization(path, original, truth, result); err != nil {
				return err
			}
			fmt.Printf("visualized %s/%s: %s\n", truth.Name, mode.name, path)
		}
	}
	return nil
}

func writeVisualization(path string, original image.Image, truth groundTruth, result map[string]interface{}) error {
	bounds := original.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, original, bounds.Min, draw.Src)
	separators, _ := result["separators"].(map[string]interface{})
	for _, position := range separatorPositions(separators["vertical"]) {
		drawLine(img, position, true, color.RGBA{255, 0, 0, 255}, false)
	}
	for _, position := range separatorPositions(separators["horizontal"]) {
		drawLine(img, position, false, color.RGBA{255, 0, 0, 255}, false)
	}
	for _, position := range truth.VerticalSeparators {
		drawLine(img, position, true, color.RGBA{0, 255, 0, 255}, true)
	}
	for _, position := range truth.HorizontalSeparators {
		drawLine(img, position, false, color.RGBA{0, 255, 0, 255}, true)
	}
	return writePNG(path, img)
}

func separatorPositions(value interface{}) []int {
	var items []interface{}
	switch typed := value.(type) {
	case []interface{}:
		items = typed
	case []map[string]interface{}:
		for _, item := range typed {
			items = append(items, item)
		}
	}
	positions := make([]int, 0, len(items))
	for _, item := range items {
		entry, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		if position, ok := numberAsInt(entry["position"]); ok {
			positions = append(positions, position)
		}
	}
	return positions
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

func drawLine(img *image.RGBA, position int, vertical bool, col color.Color, dashed bool) {
	bounds := img.Bounds()
	if vertical {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			if dashed && (y-bounds.Min.Y)%10 >= 5 {
				continue
			}
			for x := position - 1; x <= position+1; x++ {
				if x >= bounds.Min.X && x < bounds.Max.X {
					img.Set(x, y, col)
				}
			}
		}
		return
	}
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		if dashed && (x-bounds.Min.X)%10 >= 5 {
			continue
		}
		for y := position - 1; y <= position+1; y++ {
			if y >= bounds.Min.Y && y < bounds.Max.Y {
				img.Set(x, y, col)
			}
		}
	}
}

func fill(img *image.RGBA, rect image.Rectangle, col color.Color) {
	draw.Draw(img, rect, &image.Uniform{C: col}, image.Point{}, draw.Src)
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
