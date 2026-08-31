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
	"sort"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// Region represents an identified layout region
type Region struct {
	X      int
	Y      int
	Width  int
	Height int
	Label  string
	Color  color.RGBA
}

// Separator represents a detected separator line
type Separator struct {
	Position   float64 `json:"position"`
	Confidence float64 `json:"confidence"`
}

// AnalysisResult contains the layout analysis results
type AnalysisResult struct {
	Separators struct {
		Vertical   []Separator `json:"vertical"`
		Horizontal []Separator `json:"horizontal"`
	} `json:"separators"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

func main() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: generate_visualization <original_image> <analysis_json> <output_image>")
		os.Exit(1)
	}

	originalPath := os.Args[1]
	jsonPath := os.Args[2]
	outputPath := os.Args[3]
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		fmt.Printf("Failed to create output directory: %v\n", err)
		os.Exit(1)
	}

	// Load original image
	file, err := os.Open(originalPath)
	if err != nil {
		fmt.Printf("Failed to open image: %v\n", err)
		os.Exit(1)
	}
	defer file.Close()

	originalImg, err := png.Decode(file)
	if err != nil {
		fmt.Printf("Failed to decode image: %v\n", err)
		os.Exit(1)
	}

	// Load analysis results
	jsonData, err := os.ReadFile(jsonPath)
	if err != nil {
		fmt.Printf("Failed to read JSON: %v\n", err)
		os.Exit(1)
	}

	var result AnalysisResult
	if err := json.Unmarshal(jsonData, &result); err != nil {
		fmt.Printf("Failed to parse JSON: %v\n", err)
		os.Exit(1)
	}

	// Generate visualization
	annotated := generateVisualization(originalImg, &result)

	// Save output
	outFile, err := os.Create(outputPath)
	if err != nil {
		fmt.Printf("Failed to create output: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	if err := png.Encode(outFile, annotated); err != nil {
		fmt.Printf("Failed to encode image: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✅ Generated: %s\n", outputPath)
}

func generateVisualization(originalImg image.Image, result *AnalysisResult) *image.RGBA {
	bounds := originalImg.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, originalImg, bounds.Min, draw.Src)

	// Extract separator positions
	var vPositions []int
	for _, sep := range result.Separators.Vertical {
		vPositions = append(vPositions, int(sep.Position))
	}
	var hPositions []int
	for _, sep := range result.Separators.Horizontal {
		hPositions = append(hPositions, int(sep.Position))
	}

	sort.Ints(vPositions)
	sort.Ints(hPositions)

	// Identify regions
	regions := identifyRegions(vPositions, hPositions, bounds.Dx(), bounds.Dy())

	// Draw region overlays with different colors
	for _, region := range regions {
		drawRegionOverlay(img, region)
	}

	// Draw separator lines
	for _, pos := range vPositions {
		drawVerticalLine(img, pos, color.RGBA{255, 0, 0, 200})
	}
	for _, pos := range hPositions {
		drawHorizontalLine(img, pos, color.RGBA{0, 100, 255, 200})
	}

	// Draw region labels
	for _, region := range regions {
		drawRegionLabel(img, region)
	}

	// Draw legend
	drawLegend(img, len(vPositions), len(hPositions), len(regions))

	return img
}

func identifyRegions(vPositions, hPositions []int, width, height int) []Region {
	regions := []Region{}

	// Define colors for different regions
	colors := []color.RGBA{
		{255, 200, 200, 80}, // Light red
		{200, 255, 200, 80}, // Light green
		{200, 200, 255, 80}, // Light blue
		{255, 255, 200, 80}, // Light yellow
		{255, 200, 255, 80}, // Light magenta
		{200, 255, 255, 80}, // Light cyan
	}

	colorIdx := 0

	if len(vPositions) == 0 {
		// Single region
		regions = append(regions, Region{
			X:      0,
			Y:      0,
			Width:  width,
			Height: height,
			Label:  "主区域",
			Color:  colors[colorIdx%len(colors)],
		})
	} else if len(vPositions) == 1 {
		// Two regions: left | right
		regions = append(regions, Region{
			X:      0,
			Y:      0,
			Width:  vPositions[0],
			Height: height,
			Label:  "侧边栏",
			Color:  colors[colorIdx%len(colors)],
		})
		colorIdx++

		regions = append(regions, Region{
			X:      vPositions[0],
			Y:      0,
			Width:  width - vPositions[0],
			Height: height,
			Label:  "内容区域",
			Color:  colors[colorIdx%len(colors)],
		})
	} else if len(vPositions) >= 2 {
		// Three or more regions
		regions = append(regions, Region{
			X:      0,
			Y:      0,
			Width:  vPositions[0],
			Height: height,
			Label:  "侧边栏",
			Color:  colors[colorIdx%len(colors)],
		})
		colorIdx++

		regions = append(regions, Region{
			X:      vPositions[0],
			Y:      0,
			Width:  vPositions[1] - vPositions[0],
			Height: height,
			Label:  "聊天列表",
			Color:  colors[colorIdx%len(colors)],
		})
		colorIdx++

		regions = append(regions, Region{
			X:      vPositions[1],
			Y:      0,
			Width:  width - vPositions[1],
			Height: height,
			Label:  "内容区域",
			Color:  colors[colorIdx%len(colors)],
		})
		colorIdx++
	}

	// Add toolbar region if there's a horizontal separator near the top
	if len(hPositions) > 0 && hPositions[0] < 100 {
		regions = append(regions, Region{
			X:      0,
			Y:      0,
			Width:  width,
			Height: hPositions[0],
			Label:  "工具栏",
			Color:  colors[colorIdx%len(colors)],
		})
	}

	return regions
}

func drawRegionOverlay(img *image.RGBA, region Region) {
	bounds := img.Bounds()
	for y := region.Y; y < region.Y+region.Height; y++ {
		for x := region.X; x < region.X+region.Width; x++ {
			if x >= bounds.Min.X && x < bounds.Max.X && y >= bounds.Min.Y && y < bounds.Max.Y {
				// Blend the overlay color with existing pixel
				existing := img.At(x, y)
				r1, g1, b1, a1 := existing.RGBA()
				r2, g2, b2, a2 := region.Color.RGBA()

				// Simple alpha blending
				alpha := float64(a2) / 65535.0
				r := uint8((float64(r1)/257.0)*(1-alpha) + (float64(r2)/257.0)*alpha)
				g := uint8((float64(g1)/257.0)*(1-alpha) + (float64(g2)/257.0)*alpha)
				b := uint8((float64(b1)/257.0)*(1-alpha) + (float64(b2)/257.0)*alpha)

				img.Set(x, y, color.RGBA{r, g, b, uint8(a1 / 257)})
			}
		}
	}
}

func drawRegionLabel(img *image.RGBA, region Region) {
	// Calculate label position (center of region)
	labelX := region.X + region.Width/2
	labelY := region.Y + region.Height/2

	// Draw background box
	text := region.Label
	boxWidth := len(text)*7 + 20
	boxHeight := 30
	boxX := labelX - boxWidth/2
	boxY := labelY - boxHeight/2

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
				img.Set(px, py, color.RGBA{255, 255, 255, 230})
			}
		}
	}

	// Draw border
	borderColor := color.RGBA{0, 0, 0, 255}
	for dx := 0; dx < boxWidth; dx++ {
		img.Set(boxX+dx, boxY, borderColor)
		img.Set(boxX+dx, boxY+boxHeight-1, borderColor)
	}
	for dy := 0; dy < boxHeight; dy++ {
		img.Set(boxX, boxY+dy, borderColor)
		img.Set(boxX+boxWidth-1, boxY+dy, borderColor)
	}

	// Draw text
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

func drawVerticalLine(img *image.RGBA, x int, col color.RGBA) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if x >= bounds.Min.X && x < bounds.Max.X {
			img.Set(x, y, col)
			if x+1 < bounds.Max.X {
				img.Set(x+1, y, col)
			}
		}
	}
}

func drawHorizontalLine(img *image.RGBA, y int, col color.RGBA) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		if y >= bounds.Min.Y && y < bounds.Max.Y {
			img.Set(x, y, col)
			if y+1 < bounds.Max.Y {
				img.Set(x, y+1, col)
			}
		}
	}
}

func drawLegend(img *image.RGBA, vCount, hCount, regionCount int) {
	bounds := img.Bounds()
	legendX := bounds.Min.X + 10
	legendY := bounds.Min.Y + 10
	legendWidth := 280
	legendHeight := 110

	// Background
	for y := legendY; y < legendY+legendHeight; y++ {
		for x := legendX; x < legendX+legendWidth; x++ {
			img.Set(x, y, color.RGBA{255, 255, 255, 240})
		}
	}

	// Border
	for x := legendX; x < legendX+legendWidth; x++ {
		img.Set(x, legendY, color.RGBA{0, 0, 0, 255})
		img.Set(x, legendY+legendHeight-1, color.RGBA{0, 0, 0, 255})
	}
	for y := legendY; y < legendY+legendHeight; y++ {
		img.Set(legendX, y, color.RGBA{0, 0, 0, 255})
		img.Set(legendX+legendWidth-1, y, color.RGBA{0, 0, 0, 255})
	}

	// Red line (vertical separators)
	for x := legendX + 10; x < legendX+50; x++ {
		for i := 0; i < 3; i++ {
			img.Set(x, legendY+25+i, color.RGBA{255, 0, 0, 255})
		}
	}

	// Blue line (horizontal separators)
	for x := legendX + 10; x < legendX+50; x++ {
		for i := 0; i < 3; i++ {
			img.Set(x, legendY+50+i, color.RGBA{0, 100, 255, 255})
		}
	}

	// Color overlay example
	for dy := 0; dy < 15; dy++ {
		for dx := 0; dx < 40; dx++ {
			img.Set(legendX+10+dx, legendY+75+dy, color.RGBA{255, 200, 200, 150})
		}
	}

	// Text labels (using simple approach since basicfont doesn't support Chinese well)
	// In production, you'd use a proper font with Chinese support
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.RGBA{0, 0, 0, 255}),
		Face: basicfont.Face7x13,
	}

	d.Dot = fixed.Point26_6{X: fixed.Int26_6(legendX+60) << 6, Y: fixed.Int26_6(legendY+30) << 6}
	d.DrawString(fmt.Sprintf("Vertical: %d", vCount))

	d.Dot = fixed.Point26_6{X: fixed.Int26_6(legendX+60) << 6, Y: fixed.Int26_6(legendY+55) << 6}
	d.DrawString(fmt.Sprintf("Horizontal: %d", hCount))

	d.Dot = fixed.Point26_6{X: fixed.Int26_6(legendX+60) << 6, Y: fixed.Int26_6(legendY+85) << 6}
	d.DrawString(fmt.Sprintf("Regions: %d", regionCount))
}
