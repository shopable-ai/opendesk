package automation

import (
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// TestWeChatVisualization generates annotated images for WeChat analysis
func TestWeChatVisualization(t *testing.T) {
	outputDir := wechatValidationOutputDir(t)
	imagePath := filepath.Join(outputDir, "wechat_original.png")

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		t.Fatalf("Failed to ensure output dir: %v", err)
	}

	// Check if image exists
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		t.Skip("WeChat screenshot not found. Run wechat_deep_validation.js first")
	}

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

	// Analyze with median mode
	t.Log("Analyzing with median mode...")
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
	t.Logf("Median result type: %T", medianResult)
	t.Logf("Median result keys: %v", getKeys(medianResult))
	if seps, ok := medianResult["separators"]; ok {
		t.Logf("Separators type: %T", seps)
		if sepsMap, ok := seps.(map[string]interface{}); ok {
			t.Logf("Separators keys: %v", getKeys(sepsMap))
			if v, ok := sepsMap["vertical"]; ok {
				t.Logf("Vertical type: %T, value: %v", v, v)
			}
		}
	}

	// Analyze with mean mode
	t.Log("Analyzing with mean mode...")
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

	// Generate visualizations
	t.Log("Generating median visualization...")
	generateWeChatVisualization(t, img, medianResult, "median", outputDir)

	t.Log("Generating mean visualization...")
	generateWeChatVisualization(t, img, meanResult, "mean", outputDir)

	// Save results JSON
	saveWeChatResults(t, medianResult, meanResult, outputDir)

	t.Log("✅ WeChat visualization complete")
	t.Logf("Check %s/ for annotated images", outputDir)
}

func generateWeChatVisualization(t *testing.T, originalImg image.Image, result map[string]interface{}, mode string, outputDir string) {
	t.Helper()

	// Create a copy of the image
	bounds := originalImg.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, originalImg, bounds.Min, draw.Src)

	// Extract separators
	separators, ok := result["separators"].(map[string]interface{})
	if !ok {
		t.Fatalf("Invalid separators format")
	}

	var vertical, horizontal []map[string]interface{}

	if v, ok := separators["vertical"].([]map[string]interface{}); ok {
		vertical = v
	} else if v, ok := separators["vertical"].([]interface{}); ok {
		vertical = convertToMapSlice(v)
	}

	if h, ok := separators["horizontal"].([]map[string]interface{}); ok {
		horizontal = h
	} else if h, ok := separators["horizontal"].([]interface{}); ok {
		horizontal = convertToMapSlice(h)
	}

	// Draw vertical separators in red
	for _, sepMap := range vertical {
		pos, ok := sepMap["position"].(float64)
		if !ok {
			continue
		}
		conf, _ := sepMap["confidence"].(float64)

		// Color intensity based on confidence
		alpha := uint8(255 * conf)
		if alpha < 100 {
			alpha = 100
		}
		drawVerticalLine(img, int(pos), color.RGBA{255, 0, 0, alpha})
	}

	// Draw horizontal separators in blue
	for _, sepMap := range horizontal {
		pos, ok := sepMap["position"].(float64)
		if !ok {
			continue
		}
		conf, _ := sepMap["confidence"].(float64)

		// Color intensity based on confidence
		alpha := uint8(255 * conf)
		if alpha < 100 {
			alpha = 100
		}
		drawHorizontalLine(img, int(pos), color.RGBA{0, 100, 255, alpha})
	}

	// Add legend and info
	drawWeChatLegend(img, mode, len(vertical), len(horizontal))

	// Draw region labels
	drawRegionLabels(img, vertical, horizontal)

	// Save visualization
	outputPath := filepath.Join(outputDir, "wechat_"+mode+".png")
	outFile, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Failed to create output file: %v", err)
	}
	defer outFile.Close()

	if err := png.Encode(outFile, img); err != nil {
		t.Fatalf("Failed to encode image: %v", err)
	}

	t.Logf("Saved: %s", outputPath)
}

func drawWeChatLegend(img *image.RGBA, mode string, vCount, hCount int) {
	bounds := img.Bounds()
	legendX := bounds.Min.X + 10
	legendY := bounds.Min.Y + 10

	// Background
	for y := legendY; y < legendY+90; y++ {
		for x := legendX; x < legendX+250; x++ {
			img.Set(x, y, color.RGBA{255, 255, 255, 230})
		}
	}

	// Border
	for x := legendX; x < legendX+250; x++ {
		img.Set(x, legendY, color.RGBA{0, 0, 0, 255})
		img.Set(x, legendY+89, color.RGBA{0, 0, 0, 255})
	}
	for y := legendY; y < legendY+90; y++ {
		img.Set(legendX, y, color.RGBA{0, 0, 0, 255})
		img.Set(legendX+249, y, color.RGBA{0, 0, 0, 255})
	}

	// Red line (vertical)
	for x := legendX + 10; x < legendX+50; x++ {
		img.Set(x, legendY+25, color.RGBA{255, 0, 0, 255})
		img.Set(x, legendY+26, color.RGBA{255, 0, 0, 255})
		img.Set(x, legendY+27, color.RGBA{255, 0, 0, 255})
	}

	// Blue line (horizontal)
	for x := legendX + 10; x < legendX+50; x++ {
		img.Set(x, legendY+55, color.RGBA{0, 100, 255, 255})
		img.Set(x, legendY+56, color.RGBA{0, 100, 255, 255})
		img.Set(x, legendY+57, color.RGBA{0, 100, 255, 255})
	}

	// Mode indicator at bottom
	modeY := legendY + 75
	// Draw mode text background
	for x := legendX + 10; x < legendX+240; x++ {
		img.Set(x, modeY, color.RGBA{240, 240, 240, 255})
		img.Set(x, modeY+1, color.RGBA{240, 240, 240, 255})
		img.Set(x, modeY+2, color.RGBA{240, 240, 240, 255})
	}
}

func saveWeChatResults(t *testing.T, medianResult, meanResult map[string]interface{}, outputDir string) {
	t.Helper()

	medianSeps, ok := medianResult["separators"].(map[string]interface{})
	if !ok {
		t.Logf("Warning: medianResult separators type assertion failed")
		medianSeps = make(map[string]interface{})
	}

	meanSeps, ok := meanResult["separators"].(map[string]interface{})
	if !ok {
		t.Logf("Warning: meanResult separators type assertion failed")
		meanSeps = make(map[string]interface{})
	}

	// Try both []interface{} and []map[string]interface{}
	var medianV, medianH, meanV, meanH []map[string]interface{}

	if v, ok := medianSeps["vertical"].([]map[string]interface{}); ok {
		medianV = v
	} else if v, ok := medianSeps["vertical"].([]interface{}); ok {
		medianV = convertToMapSlice(v)
	}

	if h, ok := medianSeps["horizontal"].([]map[string]interface{}); ok {
		medianH = h
	} else if h, ok := medianSeps["horizontal"].([]interface{}); ok {
		medianH = convertToMapSlice(h)
	}

	if v, ok := meanSeps["vertical"].([]map[string]interface{}); ok {
		meanV = v
	} else if v, ok := meanSeps["vertical"].([]interface{}); ok {
		meanV = convertToMapSlice(v)
	}

	if h, ok := meanSeps["horizontal"].([]map[string]interface{}); ok {
		meanH = h
	} else if h, ok := meanSeps["horizontal"].([]interface{}); ok {
		meanH = convertToMapSlice(h)
	}

	t.Logf("Median: %d vertical, %d horizontal", len(medianV), len(medianH))
	t.Logf("Mean: %d vertical, %d horizontal", len(meanV), len(meanH))

	// Extract positions and confidences
	extractInfo := func(seps []map[string]interface{}) []map[string]interface{} {
		result := make([]map[string]interface{}, 0, len(seps))
		for _, sepMap := range seps {
			result = append(result, map[string]interface{}{
				"position":   sepMap["position"],
				"confidence": sepMap["confidence"],
			})
		}
		return result
	}

	results := map[string]interface{}{
		"timestamp": "2026-03-17",
		"median": map[string]interface{}{
			"vertical_count":   len(medianV),
			"horizontal_count": len(medianH),
			"total":            len(medianV) + len(medianH),
			"vertical":         extractInfo(medianV),
			"horizontal":       extractInfo(medianH),
		},
		"mean": map[string]interface{}{
			"vertical_count":   len(meanV),
			"horizontal_count": len(meanH),
			"total":            len(meanV) + len(meanH),
			"vertical":         extractInfo(meanV),
			"horizontal":       extractInfo(meanH),
		},
		"comparison": map[string]interface{}{
			"difference":    (len(medianV) + len(medianH)) - (len(meanV) + len(meanH)),
			"median_better": len(medianV)+len(medianH) < len(meanV)+len(meanH),
			"median_total":  len(medianV) + len(medianH),
			"mean_total":    len(meanV) + len(meanH),
		},
	}

	data, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal results: %v", err)
	}

	outputPath := filepath.Join(outputDir, "analysis_results.json")
	if err := os.WriteFile(outputPath, data, 0644); err != nil {
		t.Fatalf("Failed to write results: %v", err)
	}

	t.Logf("Results saved to: %s", outputPath)
}

func convertToMapSlice(items []interface{}) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		if m, ok := item.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result
}

func getKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func drawRegionLabels(img *image.RGBA, vertical, horizontal []map[string]interface{}) {
	bounds := img.Bounds()

	// Extract vertical separator positions
	var vPositions []int
	for _, sepMap := range vertical {
		if pos, ok := sepMap["position"].(float64); ok {
			vPositions = append(vPositions, int(pos))
		}
	}

	// Extract horizontal separator positions
	var hPositions []int
	for _, sepMap := range horizontal {
		if pos, ok := sepMap["position"].(float64); ok {
			hPositions = append(hPositions, int(pos))
		}
	}

	// Sort positions
	sortInts(vPositions)
	sortInts(hPositions)

	// Define regions based on vertical separators
	// For WeChat: typically sidebar | chat list | content area
	regions := []struct {
		x, y, width, height int
		label               string
	}{}

	// Vertical regions
	if len(vPositions) == 0 {
		// No vertical separators - single region
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      bounds.Min.X + 20,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  bounds.Dx(),
			height: bounds.Dy(),
			label:  "主区域",
		})
	} else if len(vPositions) == 1 {
		// One separator: left | right
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      bounds.Min.X + vPositions[0]/2,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  vPositions[0],
			height: bounds.Dy(),
			label:  "侧边栏",
		})
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      vPositions[0] + (bounds.Dx()-vPositions[0])/2,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  bounds.Dx() - vPositions[0],
			height: bounds.Dy(),
			label:  "内容区域",
		})
	} else if len(vPositions) >= 2 {
		// Two or more separators: left | middle | right
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      bounds.Min.X + vPositions[0]/2,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  vPositions[0],
			height: bounds.Dy(),
			label:  "侧边栏",
		})
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      vPositions[0] + (vPositions[1]-vPositions[0])/2,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  vPositions[1] - vPositions[0],
			height: bounds.Dy(),
			label:  "聊天列表",
		})
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      vPositions[1] + (bounds.Dx()-vPositions[1])/2,
			y:      bounds.Min.Y + bounds.Dy()/2,
			width:  bounds.Dx() - vPositions[1],
			height: bounds.Dy(),
			label:  "内容区域",
		})
	}

	// Add top toolbar region if there's a horizontal separator near the top
	if len(hPositions) > 0 && hPositions[0] < 100 {
		regions = append(regions, struct {
			x, y, width, height int
			label               string
		}{
			x:      bounds.Min.X + bounds.Dx()/2,
			y:      bounds.Min.Y + hPositions[0]/2,
			width:  bounds.Dx(),
			height: hPositions[0],
			label:  "工具栏",
		})
	}

	// Draw region labels
	for _, region := range regions {
		drawChineseLabel(img, region.x, region.y, region.label)
	}
}

func drawChineseLabel(img *image.RGBA, x, y int, text string) {
	// Draw background box
	boxWidth := len(text)*12 + 20
	boxHeight := 30
	boxX := x - boxWidth/2
	boxY := y - boxHeight/2

	// Ensure box is within bounds
	bounds := img.Bounds()
	if boxX < bounds.Min.X {
		boxX = bounds.Min.X + 5
	}
	if boxY < bounds.Min.Y {
		boxY = bounds.Min.Y + 5
	}
	if boxX+boxWidth > bounds.Max.X {
		boxX = bounds.Max.X - boxWidth - 5
	}
	if boxY+boxHeight > bounds.Max.Y {
		boxY = bounds.Max.Y - boxHeight - 5
	}

	// Draw semi-transparent background
	for dy := 0; dy < boxHeight; dy++ {
		for dx := 0; dx < boxWidth; dx++ {
			px := boxX + dx
			py := boxY + dy
			if px >= bounds.Min.X && px < bounds.Max.X && py >= bounds.Min.Y && py < bounds.Max.Y {
				// Semi-transparent yellow background
				img.Set(px, py, color.RGBA{255, 255, 200, 200})
			}
		}
	}

	// Draw border
	for dx := 0; dx < boxWidth; dx++ {
		img.Set(boxX+dx, boxY, color.RGBA{0, 0, 0, 255})
		img.Set(boxX+dx, boxY+boxHeight-1, color.RGBA{0, 0, 0, 255})
	}
	for dy := 0; dy < boxHeight; dy++ {
		img.Set(boxX, boxY+dy, color.RGBA{0, 0, 0, 255})
		img.Set(boxX+boxWidth-1, boxY+dy, color.RGBA{0, 0, 0, 255})
	}

	// Draw text using basicfont
	point := fixed.Point26_6{
		X: fixed.Int26_6(boxX+10) << 6,
		Y: fixed.Int26_6(boxY+20) << 6,
	}

	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.RGBA{0, 0, 0, 255}),
		Face: basicfont.Face7x13,
		Dot:  point,
	}
	d.DrawString(text)
}

func sortInts(arr []int) {
	// Simple bubble sort for small arrays
	n := len(arr)
	for i := 0; i < n-1; i++ {
		for j := 0; j < n-i-1; j++ {
			if arr[j] > arr[j+1] {
				arr[j], arr[j+1] = arr[j+1], arr[j]
			}
		}
	}
}

func wechatValidationOutputDir(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("Failed to resolve current test file path")
	}

	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".runtime", "tests", "wechat", "wechat_validation"))
}
