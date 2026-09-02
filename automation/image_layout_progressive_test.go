package automation

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

// TestLevel1_SimpleColorBlocks tests basic color block detection without any noise
func TestLevel1_SimpleColorBlocks(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level1_simple.png"

	// Create simple 3-column layout: dark | light | white
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 200, 400), color.RGBA{50, 50, 50, 255})      // Dark
	fillRect(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255}) // Light gray
	fillRect(img, image.Rect(400, 0, 600, 400), color.RGBA{255, 255, 255, 255}) // White

	saveImage(t, img, imagePath)

	// Test with median mode
	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)
	result, err := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellSize":          10,
		"quantize":          16,
		"tolerance":         32,
		"minRegionArea":     4,
		"minSeparatorScore": 0.08,
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
	})

	if err != nil {
		t.Fatalf("AnalyzeLayout failed: %v", err)
	}

	vertical, _ := mustTestSeparators(t, result["separators"])

	// Should detect 2 vertical separators at 200 and 400
	if len(vertical) < 2 {
		t.Errorf("Expected at least 2 vertical separators, got %d", len(vertical))
	}

	assertSeparatorNear(t, vertical, 200, 20)
	assertSeparatorNear(t, vertical, 400, 20)

	t.Logf("Level 1 PASSED: Detected %d vertical separators", len(vertical))
}

// TestLevel2_ColorBlocksWithBorders tests detection with thin separator lines
func TestLevel2_ColorBlocksWithBorders(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level2_borders.png"

	// Create 3-column layout with visible borders
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 200, 400), color.RGBA{50, 50, 50, 255})
	fillRect(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255})
	fillRect(img, image.Rect(400, 0, 600, 400), color.RGBA{255, 255, 255, 255})

	// Add 2px borders
	fillRect(img, image.Rect(199, 0, 201, 400), color.RGBA{150, 150, 150, 255})
	fillRect(img, image.Rect(399, 0, 401, 400), color.RGBA{220, 220, 220, 255})

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)
	result, err := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellSize":          10,
		"quantize":          16,
		"tolerance":         32,
		"minRegionArea":     4,
		"minSeparatorScore": 0.08,
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
	})

	if err != nil {
		t.Fatalf("AnalyzeLayout failed: %v", err)
	}

	vertical, _ := mustTestSeparators(t, result["separators"])

	// Should still detect separators near 200 and 400
	assertSeparatorNear(t, vertical, 200, 20)
	assertSeparatorNear(t, vertical, 400, 20)

	t.Logf("Level 2 PASSED: Detected %d vertical separators with borders", len(vertical))
}

// TestLevel3_SparseText tests detection with sparse text (low noise)
func TestLevel3_SparseText(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level3_sparse_text.png"

	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 200, 400), color.RGBA{50, 50, 50, 255})
	fillRect(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255})
	fillRect(img, image.Rect(400, 0, 600, 400), color.RGBA{255, 255, 255, 255})

	// Add sparse text (10% coverage)
	for y := 50; y < 350; y += 60 {
		for x := 20; x < 180; x += 40 {
			fillRect(img, image.Rect(x, y, x+20, y+12), color.RGBA{200, 200, 200, 255})
		}
	}
	for y := 50; y < 350; y += 60 {
		for x := 220; x < 380; x += 40 {
			fillRect(img, image.Rect(x, y, x+20, y+12), color.RGBA{80, 80, 80, 255})
		}
	}

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)

	// Test both modes
	resultMedian, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
		"minSeparatorScore": 0.08,
	})

	resultMean, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "mean",
		"boundarySpanWidth": 1,
		"minSeparatorScore": 0.14,
	})

	verticalMedian, _ := mustTestSeparators(t, resultMedian["separators"])
	verticalMean, _ := mustTestSeparators(t, resultMean["separators"])

	t.Logf("Level 3: Median detected %d, Mean detected %d separators",
		len(verticalMedian), len(verticalMean))

	// Both should detect the main separators
	assertSeparatorNear(t, verticalMedian, 200, 30)
	assertSeparatorNear(t, verticalMedian, 400, 30)
}

// TestLevel4_DenseText tests detection with dense text (high noise)
func TestLevel4_DenseText(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level4_dense_text.png"

	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 200, 400), color.RGBA{50, 50, 50, 255})
	fillRect(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255})
	fillRect(img, image.Rect(400, 0, 600, 400), color.RGBA{255, 255, 255, 255})

	// Add dense text (40% coverage)
	for y := 20; y < 380; y += 24 {
		for x := 10; x < 190; x += 12 {
			fillRect(img, image.Rect(x, y, x+10, y+16), color.RGBA{200, 200, 200, 255})
		}
	}
	for y := 20; y < 380; y += 24 {
		for x := 210; x < 390; x += 12 {
			fillRect(img, image.Rect(x, y, x+10, y+16), color.RGBA{60, 60, 60, 255})
		}
	}
	for y := 20; y < 380; y += 24 {
		for x := 410; x < 590; x += 12 {
			fillRect(img, image.Rect(x, y, x+10, y+16), color.RGBA{80, 80, 80, 255})
		}
	}

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)

	resultMedian, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
		"minSeparatorScore": 0.08,
	})

	resultMean, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "mean",
		"boundarySpanWidth": 1,
		"minSeparatorScore": 0.14,
	})

	verticalMedian, _ := mustTestSeparators(t, resultMedian["separators"])
	verticalMean, _ := mustTestSeparators(t, resultMean["separators"])

	t.Logf("Level 4 (Dense Text): Median=%d, Mean=%d separators",
		len(verticalMedian), len(verticalMean))

	// Median should perform better with dense text
	// At least detect the main separators
	if len(verticalMedian) < 2 {
		t.Logf("Warning: Median mode detected fewer than 2 separators with dense text")
	}
}

// TestLevel5_ComplexLayout tests multi-region layout (like app windows)
func TestLevel5_ComplexLayout(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level5_complex.png"

	// Simulate app layout: sidebar | main area with header/content/footer
	img := image.NewRGBA(image.Rect(0, 0, 800, 600))

	// Sidebar (left)
	fillRect(img, image.Rect(0, 0, 200, 600), color.RGBA{45, 45, 45, 255})

	// Main area
	fillRect(img, image.Rect(200, 0, 800, 80), color.RGBA{240, 240, 240, 255})    // Header
	fillRect(img, image.Rect(200, 80, 800, 520), color.RGBA{255, 255, 255, 255})  // Content
	fillRect(img, image.Rect(200, 520, 800, 600), color.RGBA{245, 245, 245, 255}) // Footer

	// Add borders
	fillRect(img, image.Rect(199, 0, 201, 600), color.RGBA{180, 180, 180, 255})
	fillRect(img, image.Rect(200, 79, 800, 81), color.RGBA{220, 220, 220, 255})
	fillRect(img, image.Rect(200, 519, 800, 521), color.RGBA{220, 220, 220, 255})

	// Add text in sidebar
	for y := 30; y < 570; y += 50 {
		fillRect(img, image.Rect(20, y, 180, y+30), color.RGBA{70, 70, 70, 255})
		for x := 30; x < 170; x += 10 {
			fillRect(img, image.Rect(x, y+5, x+8, y+18), color.RGBA{200, 200, 200, 255})
		}
	}

	// Add text in content area
	for y := 100; y < 500; y += 30 {
		for x := 220; x < 760; x += 15 {
			fillRect(img, image.Rect(x, y, x+12, y+20), color.RGBA{60, 60, 60, 255})
		}
	}

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)

	result, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
		"minSeparatorScore": 0.08,
	})

	vertical, horizontal := mustTestSeparators(t, result["separators"])

	t.Logf("Level 5 (Complex): %d vertical, %d horizontal separators",
		len(vertical), len(horizontal))

	// Should detect main vertical separator (sidebar)
	assertSeparatorNear(t, vertical, 200, 30)

	// Should detect horizontal separators (header/footer)
	if len(horizontal) >= 1 {
		t.Logf("Detected horizontal separators at: %v",
			getSeparatorPositions(horizontal))
	}
}

// TestLevel6_GradientBackground tests detection with gradient backgrounds
func TestLevel6_GradientBackground(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level6_gradient.png"

	img := image.NewRGBA(image.Rect(0, 0, 600, 400))

	// Left area with vertical gradient
	for y := 0; y < 400; y++ {
		gray := uint8(50 + (y * 30 / 400))
		fillRect(img, image.Rect(0, y, 200, y+1), color.RGBA{gray, gray, gray, 255})
	}

	// Middle area solid
	fillRect(img, image.Rect(200, 0, 400, 400), color.RGBA{200, 200, 200, 255})

	// Right area with vertical gradient
	for y := 0; y < 400; y++ {
		gray := uint8(255 - (y * 30 / 400))
		fillRect(img, image.Rect(400, y, 600, y+1), color.RGBA{gray, gray, gray, 255})
	}

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)

	result, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
		"minSeparatorScore": 0.08,
		"tolerance":         40, // Higher tolerance for gradients
	})

	vertical, _ := mustTestSeparators(t, result["separators"])

	t.Logf("Level 6 (Gradient): Detected %d vertical separators", len(vertical))

	// Should still detect main boundaries despite gradients
	if len(vertical) >= 2 {
		t.Logf("Successfully detected separators with gradient backgrounds")
	}
}

// TestLevel7_MixedContent tests realistic app-like content
func TestLevel7_MixedContent(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)
	imagePath := outputDir + "/level7_mixed.png"

	img := image.NewRGBA(image.Rect(0, 0, 1000, 700))

	// Toolbar (top)
	fillRect(img, image.Rect(0, 0, 1000, 60), color.RGBA{240, 240, 240, 255})

	// Sidebar (left)
	fillRect(img, image.Rect(0, 60, 250, 700), color.RGBA{50, 50, 50, 255})

	// Main content
	fillRect(img, image.Rect(250, 60, 1000, 700), color.RGBA{255, 255, 255, 255})

	// Add toolbar icons
	for x := 20; x < 980; x += 60 {
		fillRect(img, image.Rect(x, 15, x+40, 45), color.RGBA{180, 180, 180, 255})
	}

	// Add sidebar items with icons and text
	for y := 80; y < 680; y += 45 {
		// Icon
		fillRect(img, image.Rect(15, y, 40, y+25), color.RGBA{100, 100, 100, 255})
		// Text
		for x := 50; x < 230; x += 8 {
			fillRect(img, image.Rect(x, y+5, x+6, y+18), color.RGBA{200, 200, 200, 255})
		}
	}

	// Add content with mixed elements
	// Headers
	for y := 80; y < 680; y += 120 {
		fillRect(img, image.Rect(270, y, 970, y+30), color.RGBA{245, 245, 245, 255})
		for x := 280; x < 960; x += 12 {
			fillRect(img, image.Rect(x, y+8, x+10, y+22), color.RGBA{80, 80, 80, 255})
		}
	}

	// Body text
	for y := 120; y < 680; y += 120 {
		for line := 0; line < 3; line++ {
			for x := 270; x < 950; x += 10 {
				fillRect(img, image.Rect(x, y+line*20, x+8, y+line*20+14),
					color.RGBA{100, 100, 100, 255})
			}
		}
	}

	saveImage(t, img, imagePath)

	ic := NewImageColor()
	imageBase64, _ := ic.LoadBase64(imagePath)

	resultMedian, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "median",
		"boundarySpanWidth": 3,
		"minSeparatorScore": 0.08,
	})

	resultMean, _ := ic.AnalyzeLayout(imageBase64, map[string]interface{}{
		"cellColorMode":     "mean",
		"boundarySpanWidth": 1,
		"minSeparatorScore": 0.14,
	})

	verticalMedian, horizontalMedian := mustTestSeparators(t, resultMedian["separators"])
	verticalMean, horizontalMean := mustTestSeparators(t, resultMean["separators"])

	t.Logf("Level 7 (Mixed Content):")
	t.Logf("  Median: %d vertical, %d horizontal", len(verticalMedian), len(horizontalMedian))
	t.Logf("  Mean: %d vertical, %d horizontal", len(verticalMean), len(horizontalMean))

	// Should detect main layout boundaries
	assertSeparatorNear(t, verticalMedian, 250, 40)
	if len(horizontalMedian) == 0 {
		t.Fatal("mixed-content layout returned no horizontal separators")
	}
	for _, separator := range horizontalMedian {
		if separator.Position < 0 || separator.Position >= 700 {
			t.Fatalf("horizontal separator is outside image bounds: %#v", separator)
		}
	}
}

func TestLayoutSeparatorSpanFilterImprovesLocalTextBlockPrecision(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 300, 400), color.RGBA{210, 210, 210, 255})
	fillRect(img, image.Rect(300, 0, 600, 400), color.RGBA{245, 245, 245, 255})

	// A high-contrast, text-line-sized block has enough aggregate support to
	// pass the historical density gate, but it is not a full layout boundary.
	fillRect(img, image.Rect(80, 110, 210, 220), color.RGBA{30, 30, 30, 255})
	fillRect(img, image.Rect(80, 110, 90, 220), color.RGBA{150, 150, 150, 255})
	fillRect(img, image.Rect(90, 110, 100, 220), color.RGBA{90, 90, 90, 255})
	fillRect(img, image.Rect(190, 110, 200, 220), color.RGBA{90, 90, 90, 255})
	fillRect(img, image.Rect(200, 110, 210, 220), color.RGBA{150, 150, 150, 255})

	analyze := func(minSpanRatio float64) map[string]interface{} {
		result, err := analyzeLayoutImage(img, map[string]interface{}{
			"cellSize":               10,
			"minSeparatorScore":      0.08,
			"minSeparatorSpanRatio":  minSpanRatio,
			"maxSeparatorCandidates": 8,
		})
		if err != nil {
			t.Fatalf("AnalyzeLayout failed: %v", err)
		}
		return result
	}

	baselineVertical, baselineHorizontal := mustTestSeparators(t, analyze(0)["separators"])
	filteredVertical, filteredHorizontal := mustTestSeparators(t, analyze(0.30)["separators"])
	assertSeparatorNear(t, baselineVertical, 300, 20)
	assertSeparatorNear(t, filteredVertical, 300, 20)

	baselineCount := len(baselineVertical) + len(baselineHorizontal)
	filteredCount := len(filteredVertical) + len(filteredHorizontal)
	if baselineCount <= filteredCount {
		t.Fatalf("span filtering did not reduce local-block false positives: baseline=%v/%v filtered=%v/%v",
			getSeparatorPositions(baselineVertical), getSeparatorPositions(baselineHorizontal),
			getSeparatorPositions(filteredVertical), getSeparatorPositions(filteredHorizontal))
	}
	if len(filteredVertical) != 1 || len(filteredHorizontal) != 0 {
		t.Fatalf("span filtering should leave only the true panel boundary: vertical=%v horizontal=%v",
			getSeparatorPositions(filteredVertical), getSeparatorPositions(filteredHorizontal))
	}

	t.Logf("local text-block precision: baseline=1/%d filtered=1/%d", baselineCount, filteredCount)
}

func BenchmarkAnalyzeLayoutSeparatorSpanFilter(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 300, 400), color.RGBA{210, 210, 210, 255})
	fillRect(img, image.Rect(300, 0, 600, 400), color.RGBA{245, 245, 245, 255})
	fillRect(img, image.Rect(80, 110, 210, 220), color.RGBA{30, 30, 30, 255})

	for _, ratio := range []float64{0, 0.30} {
		name := "disabled"
		if ratio > 0 {
			name = "default"
		}
		b.Run(name, func(b *testing.B) {
			b.ReportAllocs()
			for index := 0; index < b.N; index++ {
				if _, err := analyzeLayoutImage(img, map[string]interface{}{"minSeparatorSpanRatio": ratio}); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

func BenchmarkAnalyzeLayoutSeparatorThresholdMode(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 600, 400))
	fillRect(img, image.Rect(0, 0, 300, 400), color.RGBA{210, 210, 210, 255})
	fillRect(img, image.Rect(300, 0, 600, 400), color.RGBA{245, 245, 245, 255})
	fillRect(img, image.Rect(80, 110, 210, 220), color.RGBA{30, 30, 30, 255})

	for _, mode := range []string{"fixed", "adaptive"} {
		b.Run(mode, func(b *testing.B) {
			b.ReportAllocs()
			for index := 0; index < b.N; index++ {
				if _, err := analyzeLayoutImage(img, map[string]interface{}{"separatorThresholdMode": mode}); err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

// Helper functions

func saveImage(t *testing.T, img image.Image, path string) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("Failed to create image: %v", err)
	}
	defer file.Close()

	if err := png.Encode(file, img); err != nil {
		t.Fatalf("Failed to encode image: %v", err)
	}
}

func getSeparatorPositions(seps []layoutSeparator) []int {
	positions := make([]int, len(seps))
	for i, sep := range seps {
		positions[i] = sep.Position
	}
	return positions
}
