package automation

import (
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"testing"
)

// TestVisualizeDetectedSeparators draws detected separators on test images
func TestVisualizeDetectedSeparators(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	visualDir := outputDir + "/visualized"
	os.MkdirAll(visualDir, 0755)

	// Load ground truth
	gtData, err := os.ReadFile(outputDir + "/ground_truth.json")
	if err != nil {
		t.Fatalf("Failed to read ground truth: %v", err)
	}

	var groundTruths []GroundTruth
	if err := json.Unmarshal(gtData, &groundTruths); err != nil {
		t.Fatalf("Failed to parse ground truth: %v", err)
	}

	for _, gt := range groundTruths {
		t.Run(gt.Name, func(t *testing.T) {
			imagePath := outputDir + "/" + gt.Name + ".png"

			// Load image
			file, err := os.Open(imagePath)
			if err != nil {
				t.Fatalf("Failed to open image: %v", err)
			}
			defer file.Close()

			img, err := png.Decode(file)
			if err != nil {
				t.Fatalf("Failed to decode image: %v", err)
			}

			// Load as base64 for analysis
			ic := NewImageColor()
			imageBase64, err := ic.LoadBase64(imagePath)
			if err != nil {
				t.Fatalf("Failed to load base64: %v", err)
			}

			// Test with median mode
			medianResult, err := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
				"cellSize":          10,
				"quantize":          16,
				"tolerance":         32,
				"minRegionArea":     4,
				"minSeparatorScore": 0.08,
				"cellColorMode":     "median",
				"boundarySpanWidth": 3,
			})
			if err != nil {
				t.Fatalf("Median analysis failed: %v", err)
			}

			// Test with mean mode
			meanResult, err := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
				"cellSize":          10,
				"quantize":          16,
				"tolerance":         32,
				"minRegionArea":     4,
				"minSeparatorScore": 0.14,
				"cellColorMode":     "mean",
				"boundarySpanWidth": 1,
			})
			if err != nil {
				t.Fatalf("Mean analysis failed: %v", err)
			}

			// Create visualizations
			visualizeResult(t, img, gt, medianResult, "median", visualDir)
			visualizeResult(t, img, gt, meanResult, "mean", visualDir)

			t.Logf("Visualized %s: median and mean modes", gt.Name)
		})
	}

	t.Logf("\n✅ Visualization complete. Check %s/ for annotated images", visualDir)
}

func visualizeResult(t *testing.T, originalImg image.Image, gt GroundTruth, result map[string]interface{}, mode string, outputDir string) {
	t.Helper()

	// Create a copy of the image
	bounds := originalImg.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, originalImg, bounds.Min, draw.Src)

	// Extract separators from result
	separators, ok := result["separators"].(map[string]interface{})
	if !ok {
		t.Fatalf("Invalid separators format")
	}

	vertical, _ := separators["vertical"].([]interface{})
	horizontal, _ := separators["horizontal"].([]interface{})

	// Draw ground truth separators in green (dashed)
	for _, pos := range gt.VerticalSeparators {
		drawDashedVerticalLine(img, pos, color.RGBA{0, 255, 0, 255})
	}
	for _, pos := range gt.HorizontalSeparators {
		drawDashedHorizontalLine(img, pos, color.RGBA{0, 255, 0, 255})
	}

	// Draw detected separators in red (solid)
	for _, sep := range vertical {
		sepMap, ok := sep.(map[string]interface{})
		if !ok {
			continue
		}
		pos, ok := sepMap["position"].(float64)
		if !ok {
			continue
		}
		drawVerticalLine(img, int(pos), color.RGBA{255, 0, 0, 255})
	}

	for _, sep := range horizontal {
		sepMap, ok := sep.(map[string]interface{})
		if !ok {
			continue
		}
		pos, ok := sepMap["position"].(float64)
		if !ok {
			continue
		}
		drawHorizontalLine(img, int(pos), color.RGBA{255, 0, 0, 255})
	}

	// Add legend
	drawLegend(img)

	// Save visualization
	outputPath := outputDir + "/" + gt.Name + "_" + mode + ".png"
	outFile, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Failed to create output file: %v", err)
	}
	defer outFile.Close()

	if err := png.Encode(outFile, img); err != nil {
		t.Fatalf("Failed to encode image: %v", err)
	}
}

func drawVerticalLine(img *image.RGBA, x int, col color.Color) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		img.Set(x, y, col)
		if x > bounds.Min.X {
			img.Set(x-1, y, col)
		}
		if x < bounds.Max.X-1 {
			img.Set(x+1, y, col)
		}
	}
}

func drawHorizontalLine(img *image.RGBA, y int, col color.Color) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		img.Set(x, y, col)
		if y > bounds.Min.Y {
			img.Set(x, y-1, col)
		}
		if y < bounds.Max.Y-1 {
			img.Set(x, y+1, col)
		}
	}
}

func drawDashedVerticalLine(img *image.RGBA, x int, col color.Color) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if y%10 < 5 { // Dash pattern
			img.Set(x, y, col)
			if x > bounds.Min.X {
				img.Set(x-1, y, col)
			}
			if x < bounds.Max.X-1 {
				img.Set(x+1, y, col)
			}
		}
	}
}

func drawDashedHorizontalLine(img *image.RGBA, y int, col color.Color) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		if x%10 < 5 { // Dash pattern
			img.Set(x, y, col)
			if y > bounds.Min.Y {
				img.Set(x, y-1, col)
			}
			if y < bounds.Max.Y-1 {
				img.Set(x, y+1, col)
			}
		}
	}
}

func drawLegend(img *image.RGBA) {
	bounds := img.Bounds()
	legendX := bounds.Min.X + 10
	legendY := bounds.Min.Y + 10

	// Background
	for y := legendY; y < legendY+60; y++ {
		for x := legendX; x < legendX+200; x++ {
			img.Set(x, y, color.RGBA{255, 255, 255, 200})
		}
	}

	// Green dashed line (ground truth)
	for x := legendX + 10; x < legendX+50; x++ {
		if x%10 < 5 {
			img.Set(x, legendY+15, color.RGBA{0, 255, 0, 255})
			img.Set(x, legendY+16, color.RGBA{0, 255, 0, 255})
		}
	}

	// Red solid line (detected)
	for x := legendX + 10; x < legendX+50; x++ {
		img.Set(x, legendY+40, color.RGBA{255, 0, 0, 255})
		img.Set(x, legendY+41, color.RGBA{255, 0, 0, 255})
	}
}
