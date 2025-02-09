package automation

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"strings"
)

// ImageColor provides image analysis and color manipulation functionality
type ImageColor struct{}

// NewImageColor creates a new instance of ImageColor
func NewImageColor() *ImageColor {
	return &ImageColor{}
}

// decodeBitmap converts a base64 image string to an image.Image
func (ic *ImageColor) decodeBitmap(imageStr string) (image.Image, error) {
	// Remove data URL prefix if present
	base64Str := imageStr
	if strings.Contains(imageStr, "base64,") {
		base64Str = strings.Split(imageStr, "base64,")[1]
	}

	// Decode base64 string
	imageBytes, err := base64.StdEncoding.DecodeString(base64Str)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %v", err)
	}

	// Decode image
	img, err := png.Decode(strings.NewReader(string(imageBytes)))
	if err != nil {
		return nil, fmt.Errorf("failed to decode image: %v", err)
	}

	return img, nil
}

// colorsMatch checks if two colors match within a threshold
func (ic *ImageColor) colorsMatch(c1, c2 color.Color, threshold int) bool {
	r1, g1, b1, _ := c1.RGBA()
	r2, g2, b2, _ := c2.RGBA()

	// Convert from 0-65535 to 0-255 range
	r1, g1, b1 = r1>>8, g1>>8, b1>>8
	r2, g2, b2 = r2>>8, g2>>8, b2>>8

	return math.Abs(float64(r1)-float64(r2)) <= float64(threshold) &&
		math.Abs(float64(g1)-float64(g2)) <= float64(threshold) &&
		math.Abs(float64(b1)-float64(b2)) <= float64(threshold)
}

// Pixel gets the color of a specific pixel
func (ic *ImageColor) Pixel(imageStr string, x, y int) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
	}

	bounds := img.Bounds()
	if x < bounds.Min.X || x >= bounds.Max.X || y < bounds.Min.Y || y >= bounds.Max.Y {
		return "", fmt.Errorf("coordinates out of bounds")
	}

	c := img.At(x, y)
	r, g, b, _ := c.RGBA()
	return fmt.Sprintf("#%02x%02x%02x", r>>8, g>>8, b>>8), nil
}

// FindColor 搜索特定颜色
// optionsStr 是可选参数，不传则使用默认值
func (ic *ImageColor) FindColor(imageStr, colorStr string, optionsStr ...string) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
	}

	// Parse target color
	targetColor, err := parseHexColor(colorStr)
	if err != nil {
		return "", fmt.Errorf("invalid color format: %v", err)
	}

	// Parse options with defaults
	var options *FindColorOptions
	if len(optionsStr) > 0 && optionsStr[0] != "" {
		options, err = ParseOptions(optionsStr[0])
		if err != nil {
			return "", fmt.Errorf("invalid options format: %v", err)
		}
	}

	// Get search bounds
	x, y, width, height, threshold := options.GetSearchBounds(img)

	// Search for color
	for searchX := x; searchX < x+width; searchX++ {
		for searchY := y; searchY < y+height; searchY++ {
			if ic.colorsMatch(img.At(searchX, searchY), targetColor, threshold) {
				result := map[string]interface{}{
					"x": searchX,
					"y": searchY,
				}
				jsonResult, _ := json.Marshal(result)
				return string(jsonResult), nil
			}
		}
	}

	result := map[string]interface{}{"found": false}
	jsonResult, _ := json.Marshal(result)
	return string(jsonResult), nil
}

// FindColorBlocks 搜索颜色区域
// optionsStr 是可选参数，不传则使用默认值
func (ic *ImageColor) FindColorBlocks(imageStr, colorStr string, optionsStr ...string) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
	}

	targetColor, err := parseHexColor(colorStr)
	if err != nil {
		return "", fmt.Errorf("invalid color format: %v", err)
	}

	// Parse options with defaults
	var options *FindColorOptions
	if len(optionsStr) > 0 && optionsStr[0] != "" {
		options, err = ParseOptions(optionsStr[0])
		if err != nil {
			return "", fmt.Errorf("invalid options format: %v", err)
		}
	}

	// Get search bounds
	x, y, width, height, threshold := options.GetSearchBounds(img)

	// Create a sub-image for the search area
	searchBounds := image.Rect(x, y, x+width, y+height)
	searchArea := img.(interface {
		SubImage(r image.Rectangle) image.Image
	}).SubImage(searchBounds)

	// Detect color blocks in the search area
	blocks := ic.detectColorBlocks(searchArea, targetColor, threshold)
	blocks = ic.mergeOverlappingBlocks(blocks)
	blocks = ic.classifyBlockShapes(searchArea, blocks, targetColor, threshold)

	// Adjust coordinates to be relative to the full image
	for i := range blocks {
		blocks[i].X += x
		blocks[i].Y += y
	}

	jsonResult, _ := json.Marshal(blocks)
	return string(jsonResult), nil
}

// HasColor checks if a color exists in a region
func (ic *ImageColor) HasColor(imageStr, colorStr string, x, y int, width, height *int, threshold int) (bool, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return false, err
	}

	targetColor, err := parseHexColor(colorStr)
	if err != nil {
		return false, fmt.Errorf("invalid color format: %v", err)
	}

	bounds := img.Bounds()
	w := bounds.Max.X - x
	h := bounds.Max.Y - y
	if width != nil {
		w = *width
	}
	if height != nil {
		h = *height
	}

	for i := x; i < x+w && i < bounds.Max.X; i++ {
		for j := y; j < y+h && j < bounds.Max.Y; j++ {
			if ic.colorsMatch(img.At(i, j), targetColor, threshold) {
				return true, nil
			}
		}
	}

	return false, nil
}

// IsGray checks if a region contains only gray colors
func (ic *ImageColor) IsGray(imageStr string, x, y int, width, height *int, threshold int) (bool, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return false, err
	}

	bounds := img.Bounds()
	w := bounds.Max.X - x
	h := bounds.Max.Y - y
	if width != nil {
		w = *width
	}
	if height != nil {
		h = *height
	}

	for i := x; i < x+w && i < bounds.Max.X; i++ {
		for j := y; j < y+h && j < bounds.Max.Y; j++ {
			r, g, b, _ := img.At(i, j).RGBA()
			r, g, b = r>>8, g>>8, b>>8

			if math.Max(math.Max(math.Abs(float64(r)-float64(g)),
				math.Abs(float64(g)-float64(b))),
				math.Abs(float64(b)-float64(r))) > float64(threshold) {
				return false, nil
			}
		}
	}

	return true, nil
}

// Helper function to parse hex color
func parseHexColor(s string) (color.Color, error) {
	c := color.RGBA{
		A: 0xff,
	}

	s = strings.TrimPrefix(s, "#")
	switch len(s) {
	case 6:
		_, err := fmt.Sscanf(s, "%02x%02x%02x", &c.R, &c.G, &c.B)
		if err != nil {
			return nil, err
		}
	case 8:
		_, err := fmt.Sscanf(s, "%02x%02x%02x%02x", &c.R, &c.G, &c.B, &c.A)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("invalid color format")
	}

	return c, nil
}

// GetSize returns the dimensions of the image as an array [width, height]
func (ic *ImageColor) GetSize(imageStr string) []int {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return nil
	}

	bounds := img.Bounds()
	return []int{
		bounds.Max.X - bounds.Min.X,
		bounds.Max.Y - bounds.Min.Y,
	}
}

// ColorBlock represents a detected color block region
type ColorBlock struct {
	X      int     `json:"x"`
	Y      int     `json:"y"`
	Width  int     `json:"width"`
	Height int     `json:"height"`
	Area   int     `json:"area"`
	Shape  string  `json:"shape"` // "rectangle", "circle", "ellipse"
	Match  float64 `json:"match"` // percentage of matching pixels
}

// detectColorBlocks finds initial color block candidates
func (ic *ImageColor) detectColorBlocks(img image.Image, targetColor color.Color, threshold int) []ColorBlock {
	bounds := img.Bounds()
	visited := make([][]bool, bounds.Max.X)
	for i := range visited {
		visited[i] = make([]bool, bounds.Max.Y)
	}

	var blocks []ColorBlock

	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			if !visited[x][y] && ic.colorsMatch(img.At(x, y), targetColor, threshold) {
				block := ic.expandBlock(img, x, y, visited, targetColor, threshold)
				if block.Area > 20 { // Minimum area threshold
					blocks = append(blocks, block)
				}
			}
		}
	}

	return blocks
}

// expandBlock expands a color block from a starting point
func (ic *ImageColor) expandBlock(img image.Image, startX, startY int, visited [][]bool, targetColor color.Color, threshold int) ColorBlock {
	bounds := img.Bounds()
	minX, minY := startX, startY
	maxX, maxY := startX, startY
	area := 0

	// Stack-based flood fill
	type Point struct{ x, y int }
	stack := []Point{{startX, startY}}

	for len(stack) > 0 {
		p := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		if p.x < bounds.Min.X || p.x >= bounds.Max.X || p.y < bounds.Min.Y || p.y >= bounds.Max.Y {
			continue
		}
		if visited[p.x][p.y] {
			continue
		}
		if !ic.colorsMatch(img.At(p.x, p.y), targetColor, threshold) {
			continue
		}

		visited[p.x][p.y] = true
		area++

		minX = min(minX, p.x)
		minY = min(minY, p.y)
		maxX = max(maxX, p.x)
		maxY = max(maxY, p.y)

		// Add adjacent pixels
		stack = append(stack, Point{p.x - 1, p.y})
		stack = append(stack, Point{p.x + 1, p.y})
		stack = append(stack, Point{p.x, p.y - 1})
		stack = append(stack, Point{p.x, p.y + 1})
	}

	return ColorBlock{
		X:      minX,
		Y:      minY,
		Width:  maxX - minX + 1,
		Height: maxY - minY + 1,
		Area:   area,
		Shape:  "rectangle", // Initial shape, will be classified later
		Match:  1.0,         // Initial match percentage
	}
}

// mergeOverlappingBlocks combines overlapping color blocks
func (ic *ImageColor) mergeOverlappingBlocks(blocks []ColorBlock) []ColorBlock {
	if len(blocks) <= 1 {
		return blocks
	}

	var merged []ColorBlock
	used := make([]bool, len(blocks))

	for i := 0; i < len(blocks); i++ {
		if used[i] {
			continue
		}

		current := blocks[i]
		used[i] = true

		for j := i + 1; j < len(blocks); j++ {
			if used[j] {
				continue
			}

			if ic.blocksOverlap(current, blocks[j]) {
				current = ic.mergeBlocks(current, blocks[j])
				used[j] = true
			}
		}

		merged = append(merged, current)
	}

	return merged
}

// blocksOverlap checks if two blocks overlap
func (ic *ImageColor) blocksOverlap(b1, b2 ColorBlock) bool {
	return !(b1.X+b1.Width <= b2.X ||
		b2.X+b2.Width <= b1.X ||
		b1.Y+b1.Height <= b2.Y ||
		b2.Y+b2.Height <= b1.Y)
}

// mergeBlocks combines two overlapping blocks
func (ic *ImageColor) mergeBlocks(b1, b2 ColorBlock) ColorBlock {
	minX := min(b1.X, b2.X)
	minY := min(b1.Y, b2.Y)
	maxX := max(b1.X+b1.Width, b2.X+b2.Width)
	maxY := max(b1.Y+b1.Height, b2.Y+b2.Height)

	return ColorBlock{
		X:      minX,
		Y:      minY,
		Width:  maxX - minX,
		Height: maxY - minY,
		Area:   b1.Area + b2.Area,
		Shape:  "rectangle",
		Match:  (b1.Match*float64(b1.Area) + b2.Match*float64(b2.Area)) / float64(b1.Area+b2.Area),
	}
}

// classifyBlockShapes determines the shape of each color block
func (ic *ImageColor) classifyBlockShapes(img image.Image, blocks []ColorBlock, targetColor color.Color, threshold int) []ColorBlock {
	for i, block := range blocks {
		matchingPixels := 0
		totalPixels := 0
		centerX := float64(block.X) + float64(block.Width)/2
		centerY := float64(block.Y) + float64(block.Height)/2
		radiusX := float64(block.Width) / 2
		radiusY := float64(block.Height) / 2

		for x := block.X; x < block.X+block.Width; x++ {
			for y := block.Y; y < block.Y+block.Height; y++ {
				// Check if point is within potential ellipse
				normalizedX := math.Pow((float64(x)-centerX)/radiusX, 2)
				normalizedY := math.Pow((float64(y)-centerY)/radiusY, 2)
				withinEllipse := normalizedX+normalizedY <= 1.0

				if withinEllipse {
					totalPixels++
					if ic.colorsMatch(img.At(x, y), targetColor, threshold) {
						matchingPixels++
					}
				}
			}
		}

		// Calculate match percentage
		matchPercent := float64(matchingPixels) / float64(totalPixels)
		blocks[i].Match = matchPercent

		// Classify shape based on dimensions and match percentage
		if math.Abs(float64(block.Width)-float64(block.Height)) <= 5 {
			if matchPercent >= 0.8 {
				blocks[i].Shape = "circle"
			}
		} else if matchPercent >= 0.75 {
			blocks[i].Shape = "ellipse"
		}
		// else remains "rectangle"
	}

	return blocks
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
