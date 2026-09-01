package automation

import (
	"encoding/json"
	"image"
	"image/color"
	"os"
	"testing"
)

// GroundTruth represents the known separator positions in a test image
type GroundTruth struct {
	Name                 string `json:"name"`
	Description          string `json:"description"`
	Width                int    `json:"width"`
	Height               int    `json:"height"`
	VerticalSeparators   []int  `json:"verticalSeparators"`
	HorizontalSeparators []int  `json:"horizontalSeparators"`
}

// TestGenerateValidationImages generates test images with known separator positions
func TestGenerateValidationImages(t *testing.T) {
	outputDir := testOutputDir(t, "image-layout")
	os.MkdirAll(outputDir, 0755)

	groundTruths := []GroundTruth{}

	// Test 1: Three equal columns
	t.Run("ThreeColumns", func(t *testing.T) {
		width, height := 600, 400
		img := image.NewRGBA(image.Rect(0, 0, width, height))

		// Column 1: Dark gray
		fillRect(img, image.Rect(0, 0, 200, height), color.RGBA{50, 50, 50, 255})
		// Column 2: Light gray
		fillRect(img, image.Rect(200, 0, 400, height), color.RGBA{200, 200, 200, 255})
		// Column 3: White
		fillRect(img, image.Rect(400, 0, 600, height), color.RGBA{255, 255, 255, 255})

		imagePath := outputDir + "/three_columns.png"
		saveImage(t, img, imagePath)

		gt := GroundTruth{
			Name:                 "three_columns",
			Description:          "3 equal columns",
			Width:                width,
			Height:               height,
			VerticalSeparators:   []int{200, 400},
			HorizontalSeparators: []int{},
		}
		groundTruths = append(groundTruths, gt)
		t.Logf("Generated: %s (separators at V:%v H:%v)", imagePath, gt.VerticalSeparators, gt.HorizontalSeparators)
	})

	// Test 2: Sidebar layout
	t.Run("SidebarLayout", func(t *testing.T) {
		width, height := 800, 600
		img := image.NewRGBA(image.Rect(0, 0, width, height))

		// Sidebar (left)
		fillRect(img, image.Rect(0, 0, 250, height), color.RGBA{45, 45, 45, 255})

		// Header
		fillRect(img, image.Rect(250, 0, width, 80), color.RGBA{240, 240, 240, 255})

		// Content
		fillRect(img, image.Rect(250, 80, width, 520), color.RGBA{255, 255, 255, 255})

		// Footer
		fillRect(img, image.Rect(250, 520, width, height), color.RGBA{245, 245, 245, 255})

		imagePath := outputDir + "/sidebar_layout.png"
		saveImage(t, img, imagePath)

		gt := GroundTruth{
			Name:                 "sidebar_layout",
			Description:          "Sidebar + main area",
			Width:                width,
			Height:               height,
			VerticalSeparators:   []int{250},
			HorizontalSeparators: []int{80, 520},
		}
		groundTruths = append(groundTruths, gt)
		t.Logf("Generated: %s (separators at V:%v H:%v)", imagePath, gt.VerticalSeparators, gt.HorizontalSeparators)
	})

	// Test 3: Grid layout (2x2)
	t.Run("GridLayout", func(t *testing.T) {
		width, height := 600, 400
		img := image.NewRGBA(image.Rect(0, 0, width, height))

		// Top-left
		fillRect(img, image.Rect(0, 0, 300, 200), color.RGBA{100, 100, 100, 255})
		// Top-right
		fillRect(img, image.Rect(300, 0, width, 200), color.RGBA{150, 150, 150, 255})
		// Bottom-left
		fillRect(img, image.Rect(0, 200, 300, height), color.RGBA{200, 200, 200, 255})
		// Bottom-right
		fillRect(img, image.Rect(300, 200, width, height), color.RGBA{250, 250, 250, 255})

		imagePath := outputDir + "/grid_layout.png"
		saveImage(t, img, imagePath)

		gt := GroundTruth{
			Name:                 "grid_layout",
			Description:          "2x2 grid",
			Width:                width,
			Height:               height,
			VerticalSeparators:   []int{300},
			HorizontalSeparators: []int{200},
		}
		groundTruths = append(groundTruths, gt)
		t.Logf("Generated: %s (separators at V:%v H:%v)", imagePath, gt.VerticalSeparators, gt.HorizontalSeparators)
	})

	// Test 4: Complex app layout with text
	t.Run("ComplexWithText", func(t *testing.T) {
		width, height := 1000, 700
		img := image.NewRGBA(image.Rect(0, 0, width, height))

		// Toolbar
		fillRect(img, image.Rect(0, 0, width, 60), color.RGBA{240, 240, 240, 255})

		// Sidebar
		fillRect(img, image.Rect(0, 60, 250, height), color.RGBA{50, 50, 50, 255})

		// Main content
		fillRect(img, image.Rect(250, 60, width, height), color.RGBA{255, 255, 255, 255})

		// Add text in sidebar (simulated)
		for y := 80; y < 680; y += 45 {
			fillRect(img, image.Rect(15, y, 40, y+25), color.RGBA{100, 100, 100, 255})
			for x := 50; x < 230; x += 8 {
				fillRect(img, image.Rect(x, y+5, x+6, y+18), color.RGBA{200, 200, 200, 255})
			}
		}

		// Add text in content area
		for y := 100; y < 680; y += 30 {
			for x := 270; x < 950; x += 10 {
				fillRect(img, image.Rect(x, y, x+8, y+14), color.RGBA{100, 100, 100, 255})
			}
		}

		imagePath := outputDir + "/complex_with_text.png"
		saveImage(t, img, imagePath)

		gt := GroundTruth{
			Name:                 "complex_with_text",
			Description:          "Complex app layout with text",
			Width:                width,
			Height:               height,
			VerticalSeparators:   []int{250},
			HorizontalSeparators: []int{60},
		}
		groundTruths = append(groundTruths, gt)
		t.Logf("Generated: %s (separators at V:%v H:%v)", imagePath, gt.VerticalSeparators, gt.HorizontalSeparators)
	})

	// Save ground truth data
	gtPath := outputDir + "/ground_truth.json"
	gtData, err := json.MarshalIndent(groundTruths, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal ground truth: %v", err)
	}

	if err := os.WriteFile(gtPath, gtData, 0644); err != nil {
		t.Fatalf("Failed to write ground truth: %v", err)
	}

	t.Logf("\n✅ Generated %d validation images with ground truth data", len(groundTruths))
	t.Logf("Ground truth saved to: %s", gtPath)
}
