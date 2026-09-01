package automation

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	xdraw "golang.org/x/image/draw"
)

// ImageColor provides image analysis and color manipulation functionality
type ImageColor struct{}

// NewImageColor creates a new instance of ImageColor
func NewImageColor() *ImageColor {
	return &ImageColor{}
}

// FindPos 用图找图功能（模板匹配），返回位置、置信度以及模板的宽高
func (ic *ImageColor) FindPos(sourceImgStr, templateImgStr string, args ...float32) (map[string]interface{}, error) {
	threshold := float32(0.8)
	if len(args) > 0 {
		threshold = args[0]
	}

	// Load source and template images
	sourceImg, err := ic.loadImage(sourceImgStr)
	if err != nil {
		return nil, fmt.Errorf("failed to load source image: %v", err)
	}
	templateImg, err := ic.loadImage(templateImgStr)
	if err != nil {
		return nil, fmt.Errorf("failed to load template image: %v", err)
	}

	sourceNRGBA := imageToNRGBA(sourceImg)
	templateNRGBA := imageToNRGBA(templateImg)

	// Ensure template is smaller than source
	if templateNRGBA.Bounds().Dx() > sourceNRGBA.Bounds().Dx() || templateNRGBA.Bounds().Dy() > sourceNRGBA.Bounds().Dy() {
		return nil, fmt.Errorf("template (%dx%d) larger than source (%dx%d)",
			templateNRGBA.Bounds().Dx(), templateNRGBA.Bounds().Dy(), sourceNRGBA.Bounds().Dx(), sourceNRGBA.Bounds().Dy())
	}

	// Get template dimensions
	templateWidth := templateNRGBA.Bounds().Dx()
	templateHeight := templateNRGBA.Bounds().Dy()

	bestX, bestY, bestScore := findTemplateMatch(sourceNRGBA, templateNRGBA)

	// Prepare result
	res := make(map[string]interface{})
	res["confidence"] = bestScore
	res["width"] = templateWidth
	res["height"] = templateHeight

	if bestScore < float64(threshold) {
		res["x"] = -1
		res["y"] = -1
		res["found"] = false
	} else {
		res["x"] = bestX
		res["y"] = bestY
		res["found"] = true
	}

	return res, nil
}

// loadImage 加载图像，支持 base64 字符串或文件路径（绝对/相对）
func (ic *ImageColor) loadImage(imgStr string) (image.Image, error) {
	// 检查是否为 base64 字符串
	if strings.Contains(imgStr, "base64,") || len(imgStr) > 100 { // 粗略判断是否可能是 base64
		return ic.decodeBitmap(imgStr)
	}

	// 视为文件路径，处理相对路径和绝对路径
	path := imgStr
	if !filepath.IsAbs(path) {
		// 如果是相对路径，转换为绝对路径（基于当前工作目录）
		absPath, err := filepath.Abs(path)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve relative path: %v", err)
		}
		path = absPath
	}

	// 从文件读取图像
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open image file: %v", err)
	}
	defer file.Close()

	// 尝试解码为 PNG 或 JPEG
	img, err := png.Decode(file)
	if err != nil {
		// 重置文件指针，尝试 JPEG
		file.Seek(0, 0)
		img, err = jpeg.Decode(file)
		if err != nil {
			return nil, fmt.Errorf("failed to decode image file as PNG or JPEG: %v", err)
		}
	}
	return img, nil
}

func (ic *ImageColor) LoadBase64(imagePath string) (string, error) {
	// 打开图片文件
	file, err := os.Open(imagePath)
	if err != nil {
		return "", fmt.Errorf("failed to open image file: %v", err)
	}
	defer file.Close()

	// 解码图片
	img, _, err := image.Decode(file)
	if err != nil {
		return "", fmt.Errorf("failed to decode image from path: %v", err)
	}

	// 创建缓冲区
	var buf bytes.Buffer
	encoder := png.Encoder{
		CompressionLevel: png.BestCompression,
	}

	// 编码为PNG
	if err := encoder.Encode(&buf, img); err != nil {
		return "", fmt.Errorf("failed to encode image to PNG: %v", err)
	}

	// 转换为base64
	base64Str := base64.StdEncoding.EncodeToString(buf.Bytes())
	return "data:image/png;base64," + base64Str, nil
}

// Resize rescales an image to the requested width and height and returns a PNG data URL.
func (ic *ImageColor) Resize(imageStr string, width, height int) (string, error) {
	if width <= 0 || height <= 0 {
		return "", fmt.Errorf("invalid resize dimensions: %dx%d", width, height)
	}

	img, err := ic.loadImage(imageStr)
	if err != nil {
		return "", fmt.Errorf("failed to load image for resize: %v", err)
	}

	src := imageToNRGBA(img)
	dst := image.NewNRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)

	var buf bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestCompression}
	if err := encoder.Encode(&buf, dst); err != nil {
		return "", fmt.Errorf("failed to encode resized image: %v", err)
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}

func imageToNRGBA(img image.Image) *image.NRGBA {
	bounds := img.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			dst.Set(x-bounds.Min.X, y-bounds.Min.Y, img.At(x, y))
		}
	}
	return dst
}

// findTemplateMatchPureGo is the portable template-matching implementation.
// The build-specific router selects it directly for normal builds and uses it
// as the fallback when the OpenCV backend cannot produce a valid result.
func findTemplateMatchPureGo(source, template *image.NRGBA) (bestX, bestY int, bestScore float64) {
	sw := source.Bounds().Dx()
	sh := source.Bounds().Dy()
	tw := template.Bounds().Dx()
	th := template.Bounds().Dy()

	if tw == 0 || th == 0 || tw > sw || th > sh {
		return -1, -1, 0
	}

	bestDiff := ^uint64(0)
	maxDiff := uint64(tw * th * 3 * 255)

	for y := 0; y <= sh-th; y++ {
		for x := 0; x <= sw-tw; x++ {
			var diff uint64
			exceeded := false
			for ty := 0; ty < th && !exceeded; ty++ {
				srcRow := (y+ty)*source.Stride + x*4
				tplRow := ty * template.Stride
				for tx := 0; tx < tw; tx++ {
					si := srcRow + tx*4
					ti := tplRow + tx*4
					diff += channelDiff(source.Pix[si+0], template.Pix[ti+0])
					diff += channelDiff(source.Pix[si+1], template.Pix[ti+1])
					diff += channelDiff(source.Pix[si+2], template.Pix[ti+2])
					if diff >= bestDiff {
						exceeded = true
						break
					}
				}
			}
			if diff < bestDiff {
				bestDiff = diff
				bestX = x
				bestY = y
			}
		}
	}

	if bestDiff == ^uint64(0) {
		return -1, -1, 0
	}

	if maxDiff == 0 {
		return bestX, bestY, 1
	}
	bestScore = 1 - float64(bestDiff)/float64(maxDiff)
	if bestScore < 0 {
		bestScore = 0
	}
	return bestX, bestY, bestScore
}

func channelDiff(a, b uint8) uint64 {
	if a > b {
		return uint64(a - b)
	}
	return uint64(b - a)
}

// decodeBitmap converts a base64 image string to an image.Image
func (ic *ImageColor) decodeBitmap(imageStr string) (image.Image, error) {
	// 处理空输入
	if imageStr == "" {
		return nil, fmt.Errorf("empty image string")
	}

	// 移除 data URL 前缀
	base64Str := imageStr
	if strings.Contains(imageStr, "base64,") {
		base64Str = strings.Split(imageStr, "base64,")[1]
	}

	// 解码 base64
	imageBytes, err := base64.StdEncoding.DecodeString(base64Str)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %v", err)
	}

	// 创建字节读取器
	reader := bytes.NewReader(imageBytes)

	// 尝试解码为 PNG
	img, err := png.Decode(reader)
	if err != nil {
		// PNG 解码失败，重置读取器并尝试 JPEG
		reader.Seek(0, 0)
		img, err = jpeg.Decode(reader)
		if err != nil {
			return nil, fmt.Errorf("failed to decode image as PNG or JPEG: %v", err)
		}
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
func (ic *ImageColor) FindColor(imageStr, colorStr string, options interface{}) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
	}

	// Parse target color
	targetColor, err := parseHexColor(colorStr)
	if err != nil {
		return "", fmt.Errorf("invalid color format: %v", err)
	}

	// Initialize default options
	findOptions := &FindColorOptions{} // Add default values

	// Parse options if provided
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			// Parse x, y coordinates
			if x, exists := optMap["x"]; exists {
				val := jsToInt(x)
				findOptions.X = &val
			}
			if y, exists := optMap["y"]; exists {
				val := jsToInt(y)
				findOptions.Y = &val
			}

			// Parse width and height
			if width, exists := optMap["width"]; exists {
				val := jsToInt(width)
				findOptions.Width = &val
			}
			if height, exists := optMap["height"]; exists {
				val := jsToInt(height)
				findOptions.Height = &val
			}

			// Parse threshold
			if threshold, exists := optMap["threshold"]; exists {
				val := jsToInt(threshold)
				findOptions.Threshold = &val
			}
		}
	}

	// Get search bounds
	x, y, width, height, threshold := findOptions.GetSearchBounds(img)

	// Search for color
	for searchX := x; searchX < x+width; searchX++ {
		for searchY := y; searchY < y+height; searchY++ {
			if ic.colorsMatch(img.At(searchX, searchY), targetColor, threshold) {
				result := map[string]interface{}{
					"x":     searchX,
					"y":     searchY,
					"found": true,
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

func (ic *ImageColor) FindColorBlocks(imageStr, colorStr string, options interface{}) ([]map[string]interface{}, error) {
	// Check if color is empty
	if colorStr == "" {
		log.Printf("Color string is empty, returning empty array")
		return []map[string]interface{}{}, nil
	}

	// Decode bitmap
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		log.Printf("Failed to decode bitmap: %v", err)
		return nil, fmt.Errorf("failed to decode bitmap: %v", err)
	}

	// Parse target color and convert to RGBA
	colorValue, err := parseHexColor(colorStr)
	if err != nil {
		log.Printf("Color parsing failed: %v", err)
		return nil, fmt.Errorf("invalid color format: %v", err)
	}

	// Convert color.Color to color.RGBA
	r, g, b, a := colorValue.RGBA()
	targetColor := color.RGBA{
		R: uint8(r >> 8),
		G: uint8(g >> 8),
		B: uint8(b >> 8),
		A: uint8(a >> 8),
	}

	// Initialize default options
	findOptions := &FindColorOptions{} // Add default values

	// Parse options if provided
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			// Parse x, y coordinates
			if x, exists := optMap["x"]; exists {
				val := jsToInt(x)
				findOptions.X = &val
			}
			if y, exists := optMap["y"]; exists {
				val := jsToInt(y)
				findOptions.Y = &val
			}

			// Parse width and height
			if width, exists := optMap["width"]; exists {
				val := jsToInt(width)
				findOptions.Width = &val
			}
			if height, exists := optMap["height"]; exists {
				val := jsToInt(height)
				findOptions.Height = &val
			}

			// Parse threshold
			if threshold, exists := optMap["threshold"]; exists {
				val := jsToInt(threshold)
				findOptions.Threshold = &val
			}

			// Additional options can be added here
		}
	}

	// Get search bounds
	bounds := img.Bounds()
	x, y, width, height, threshold := findOptions.GetSearchBounds(img)

	// Validate bounds
	if width <= 0 || height <= 0 {
		log.Printf("Invalid search bounds: width=%d, height=%d", width, height)
		return nil, fmt.Errorf("invalid search bounds: width=%d, height=%d", width, height)
	}

	// Validate image bounds
	if x < bounds.Min.X || y < bounds.Min.Y ||
		x+width > bounds.Max.X || y+height > bounds.Max.Y {
		log.Printf("Search bounds outside image dimensions: x=%d, y=%d, width=%d, height=%d",
			x, y, width, height)
		return nil, fmt.Errorf("search bounds outside image dimensions")
	}

	// Create sub-image
	searchBounds := image.Rect(x, y, x+width, y+height)
	subImage, ok := img.(interface {
		SubImage(r image.Rectangle) image.Image
	})
	if !ok {
		log.Printf("Image does not support SubImage")
		return nil, fmt.Errorf("image does not support SubImage")
	}
	searchArea := subImage.SubImage(searchBounds)

	// Detect color blocks
	blocks := ic.detectColorBlocks(searchArea, targetColor, threshold)

	if blocks == nil || len(blocks) == 0 {
		return []map[string]interface{}{}, nil
	}

	// Process blocks
	blocks = ic.mergeOverlappingBlocks(blocks)
	blocks = ic.classifyBlockShapes(searchArea, blocks, targetColor, threshold)

	// Convert to map array and adjust coordinates
	result := make([]map[string]interface{}, len(blocks))
	for i, block := range blocks {
		result[i] = map[string]interface{}{
			"x":      block.X + x,
			"y":      block.Y + y,
			"width":  block.Width,
			"height": block.Height,
			"area":   block.Area,
			"shape":  block.Shape,
			"match":  block.Match,
		}
	}

	return result, nil
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
	// For hex color string (single color check)
	if strings.HasPrefix(imageStr, "#") {
		// Parse hex color
		color, err := ic.parseHexColor(imageStr)
		if err != nil {
			return false, fmt.Errorf("invalid hex color: %v", err)
		}

		r, g, b := color.R, color.G, color.B

		// Check if the color is Gray (all RGB components are similar)
		maxDiff := math.Max(math.Max(
			math.Abs(float64(r)-float64(g)),
			math.Abs(float64(g)-float64(b))),
			math.Abs(float64(b)-float64(r)))

		return maxDiff <= float64(threshold), nil
	}

	// For image region check
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return false, fmt.Errorf("failed to decode image: %v", err)
	}

	bounds := img.Bounds()

	// Calculate region dimensions
	w := bounds.Max.X - x
	h := bounds.Max.Y - y
	if width != nil {
		w = *width
	}
	if height != nil {
		h = *height
	}

	// Validate coordinates
	if x < 0 || y < 0 || x >= bounds.Max.X || y >= bounds.Max.Y {
		return false, fmt.Errorf("invalid coordinates: x=%d, y=%d", x, y)
	}

	// Check each pixel in the region
	for i := x; i < x+w && i < bounds.Max.X; i++ {
		for j := y; j < y+h && j < bounds.Max.Y; j++ {
			r, g, b, _ := img.At(i, j).RGBA()
			// Convert from uint32 to uint8 (0-255 range)
			r, g, b = r>>8, g>>8, b>>8

			maxDiff := math.Max(math.Max(
				math.Abs(float64(r)-float64(g)),
				math.Abs(float64(g)-float64(b))),
				math.Abs(float64(b)-float64(r)))

			if maxDiff > float64(threshold) {
				return false, nil
			}
		}
	}

	return true, nil
}

// parseHexColor parses a hex color string into RGB components
func (ic *ImageColor) parseHexColor(hexColor string) (color.RGBA, error) {
	hexColor = strings.TrimPrefix(hexColor, "#")

	if len(hexColor) != 6 {
		return color.RGBA{}, fmt.Errorf("invalid hex color length")
	}

	// Parse RGB values
	rgb, err := strconv.ParseUint(hexColor, 16, 32)
	if err != nil {
		return color.RGBA{}, err
	}

	return color.RGBA{
		R: uint8(rgb >> 16),
		G: uint8((rgb >> 8) & 0xFF),
		B: uint8(rgb & 0xFF),
		A: 255,
	}, nil
}

// parseHexColor parses a hex color string into RGBA
func parseHexColor(hexColor string) (color.RGBA, error) {
	hexColor = strings.TrimPrefix(hexColor, "#")

	if len(hexColor) != 6 {
		return color.RGBA{}, fmt.Errorf("invalid hex color length")
	}

	// Parse RGB values
	rgb, err := strconv.ParseUint(hexColor, 16, 32)
	if err != nil {
		return color.RGBA{}, err
	}

	r := uint8(rgb >> 16)
	g := uint8((rgb >> 8) & 0xFF)
	b := uint8(rgb & 0xFF)

	// Add debug logging
	// fmt.Printf("Parsing hex color #%s -> RGB(%d,%d,%d)\n", hexColor, r, g, b)

	return color.RGBA{
		R: r,
		G: g,
		B: b,
		A: 255,
	}, nil
}

// Fixed GetSize function to properly handle cropped images:
func (ic *ImageColor) GetSize(imageStr string) []int {
	// Handle empty input
	if imageStr == "" {
		return nil
	}

	// 使用 loadImage 方法加载图像
	img, err := ic.loadImage(imageStr)
	if err != nil {
		return nil
	}

	// 获取图像尺寸
	bounds := img.Bounds()
	width := bounds.Max.X - bounds.Min.X
	height := bounds.Max.Y - bounds.Min.Y

	// 返回实际尺寸
	return []int{width, height}
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

func (ic *ImageColor) Clip(imageStr string, options interface{}) (string, error) {
	// Decode original image
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", fmt.Errorf("failed to decode image: %v", err)
	}

	// Get original dimensions
	bounds := img.Bounds()
	originalWidth := bounds.Max.X - bounds.Min.X
	originalHeight := bounds.Max.Y - bounds.Min.Y

	// Initialize default values to entire image
	x := 0
	y := 0
	width := originalWidth
	height := originalHeight

	// Use provided options if available
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if val, ok := optMap["x"]; ok {
				x = jsToInt(val)
			}
			if val, ok := optMap["y"]; ok {
				y = jsToInt(val)
			}
			if val, ok := optMap["width"]; ok {
				width = jsToInt(val)
			}
			if val, ok := optMap["height"]; ok {
				height = jsToInt(val)
			}
		}
	}

	// Validate and adjust coordinates and dimensions
	if x < 0 {
		width += x
		x = 0
	}
	if y < 0 {
		height += y
		y = 0
	}
	if x >= originalWidth || y >= originalHeight {
		return "", fmt.Errorf("coordinates out of bounds: x=%d, y=%d", x, y)
	}

	// Adjust width and height to fit within bounds
	if width <= 0 || height <= 0 {
		return "", fmt.Errorf("invalid dimensions: width=%d, height=%d", width, height)
	}
	if x+width > originalWidth {
		width = originalWidth - x
	}
	if y+height > originalHeight {
		height = originalHeight - y
	}

	// Create new RGBA image with exact cropped dimensions
	croppedImg := image.NewRGBA(image.Rect(0, 0, width, height))

	// Copy pixels from source to cropped image
	for dy := 0; dy < height; dy++ {
		for dx := 0; dx < width; dx++ {
			sourceColor := img.At(x+dx, y+dy)
			croppedImg.Set(dx, dy, sourceColor)
		}
	}

	// Encode to PNG
	var buf bytes.Buffer
	encoder := png.Encoder{
		CompressionLevel: png.BestCompression,
	}
	if err := encoder.Encode(&buf, croppedImg); err != nil {
		return "", fmt.Errorf("failed to encode cropped image: %v", err)
	}

	// Convert to base64
	base64Str := base64.StdEncoding.EncodeToString(buf.Bytes())
	return "data:image/png;base64," + base64Str, nil
}

func (ic *ImageColor) Save(image string, path string, format string, quality int) (bool, error) {
	// 参数验证和默认值设置
	if path == "" {
		return false, fmt.Errorf("path cannot be empty")
	}

	// 设置默认格式
	if format == "" {
		format = "png"
	}
	format = strings.ToLower(format)
	if format != "png" && format != "jpeg" && format != "jpg" {
		format = "png"
	}

	// 设置默认质量并验证范围
	if quality <= 0 {
		quality = 100
	}
	if quality > 100 {
		quality = 100
	}

	// 解码base64图片
	img, err := ic.decodeBitmap(image)
	if err != nil {
		return false, fmt.Errorf("failed to decode image: %v", err)
	}

	// 确保目录存在
	dir := filepath.Dir(path)
	if dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return false, fmt.Errorf("failed to create directory: %v", err)
		}
	}

	// 创建输出文件
	file, err := os.Create(path)
	if err != nil {
		return false, fmt.Errorf("failed to create file: %v", err)
	}
	defer file.Close()

	// 根据格式保存图片
	switch format {
	case "jpeg", "jpg":
		err = jpeg.Encode(file, img, &jpeg.Options{
			Quality: quality,
		})
	default: // png
		encoder := png.Encoder{
			CompressionLevel: png.BestCompression,
		}
		err = encoder.Encode(file, img)
	}

	if err != nil {
		return false, fmt.Errorf("failed to encode image: %v", err)
	}

	return true, nil
}

// FindRedChannel finds the first non-grayscale pixel with significant red component
func (ic *ImageColor) FindRedChannel(imageStr string, x, y int, width, height *int) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
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
			// Convert from 0-65535 to 0-255 range
			r, g, b = r>>8, g>>8, b>>8

			// Check if red component is significant and pixel is not grayscale
			if r > 20 && !(math.Abs(float64(r)-float64(g)) < 10 &&
				math.Abs(float64(g)-float64(b)) < 10 &&
				math.Abs(float64(b)-float64(r)) < 10) {
				return fmt.Sprintf("#%02x%02x%02x", r, g, b), nil
			}
		}
	}

	return "", nil
}

// FindGreenChannel finds the first non-grayscale pixel with significant green component
func (ic *ImageColor) FindGreenChannel(imageStr string, x, y int, width, height *int) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
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
			// Convert from 0-65535 to 0-255 range
			r, g, b = r>>8, g>>8, b>>8

			// Check if green component is significant and pixel is not grayscale
			if g > 20 && !(math.Abs(float64(r)-float64(g)) < 10 &&
				math.Abs(float64(g)-float64(b)) < 10 &&
				math.Abs(float64(b)-float64(r)) < 10) {
				return fmt.Sprintf("#%02x%02x%02x", r, g, b), nil
			}
		}
	}

	return "", nil
}

// FindBlueChannel finds the first non-grayscale pixel with significant blue component
func (ic *ImageColor) FindBlueChannel(imageStr string, x, y int, width, height *int) (string, error) {
	img, err := ic.decodeBitmap(imageStr)
	if err != nil {
		return "", err
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
			// Convert from 0-65535 to 0-255 range
			r, g, b = r>>8, g>>8, b>>8

			// Check if blue component is significant and pixel is not grayscale
			if b > 20 && !(math.Abs(float64(r)-float64(g)) < 10 &&
				math.Abs(float64(g)-float64(b)) < 10 &&
				math.Abs(float64(b)-float64(r)) < 10) {
				return fmt.Sprintf("#%02x%02x%02x", r, g, b), nil
			}
		}
	}

	return "", nil
}

// ToRGB converts a hex color string to RGB format
func (ic *ImageColor) ToRGB(colorStr string) (string, error) {
	c, err := parseHexColor(colorStr)
	if err != nil {
		return "", err
	}

	r, g, b, _ := c.RGBA()
	return fmt.Sprintf("rgb(%d,%d,%d)", r>>8, g>>8, b>>8), nil
}

// ToRGBA converts a hex color string to RGBA format
func (ic *ImageColor) ToRGBA(colorStr string) (string, error) {
	c, err := parseHexColor(colorStr)
	if err != nil {
		return "", err
	}

	r, g, b, a := c.RGBA()
	return fmt.Sprintf("rgba(%d,%d,%d,%f)", r>>8, g>>8, b>>8, float64(a>>8)/255.0), nil
}

// RGBToHSL converts RGB values to HSL
func rgbToHSL(r, g, b uint32) (h, s, l float64) {
	// Convert RGB to 0-1 range
	rf := float64(r) / 255.0
	gf := float64(g) / 255.0
	bf := float64(b) / 255.0

	max := math.Max(math.Max(rf, gf), bf)
	min := math.Min(math.Min(rf, gf), bf)

	// Calculate luminance
	l = (max + min) / 2.0

	// If max equals min, it's a shade of Gray
	if max == min {
		h = 0
		s = 0
		return h, s * 100, l * 100
	}

	// Calculate saturation
	if l <= 0.5 {
		s = (max - min) / (max + min)
	} else {
		s = (max - min) / (2.0 - max - min)
	}

	// Calculate hue
	var delta = max - min
	if delta == 0 {
		delta = 1 // Prevent division by zero
	}

	switch max {
	case rf:
		h = ((gf - bf) / delta)
		if gf < bf {
			h += 6
		}
	case gf:
		h = ((bf - rf) / delta) + 2
	case bf:
		h = ((rf - gf) / delta) + 4
	}
	h *= 60

	// Ensure hue is between 0-360
	if h < 0 {
		h += 360
	}

	// Add debug logging
	// fmt.Printf("RGB(%d,%d,%d) -> HSL(%.2f,%.2f,%.2f)\n", r, g, b, h, s*100, l*100)

	return h, s * 100, l * 100
}

// ToHSL converts a hex color string to HSL format
func (ic *ImageColor) ToHSL(colorStr string) (string, error) {
	c, err := parseHexColor(colorStr)
	if err != nil {
		return "", err
	}

	r, g, b, _ := c.RGBA()
	h, s, l := rgbToHSL(r, g, b)
	return fmt.Sprintf("hsl(%f,%f%%,%f%%)", h, s, l), nil
}

// ToHSLA converts a hex color string to HSLA format
func (ic *ImageColor) ToHSLA(colorStr string) (string, error) {
	c, err := parseHexColor(colorStr)
	if err != nil {
		return "", err
	}

	r, g, b, a := c.RGBA()
	h, s, l := rgbToHSL(r, g, b)
	return fmt.Sprintf("hsla(%f,%f%%,%f%%,%f)", h, s, l, float64(a>>8)/255.0), nil
}

// ColorSimilarity represents the similarity between two colors
type ColorSimilarity struct {
	Similar    bool    `json:"similar"`
	Similarity float64 `json:"similarity"` // 0-1 range
	Reason     string  `json:"reason"`
}

// IsColorSimilar checks if two colors are similar
func (ic *ImageColor) IsColorSimilar(targetColor, gradientColor string, tolerance float64) (map[string]interface{}, error) {
	// Default tolerance if not specified or invalid
	if tolerance <= 0 || tolerance > 1 {
		tolerance = 0.85
	}

	// Parse both colors
	target, err := parseHexColor(targetColor)
	if err != nil {
		return nil, fmt.Errorf("invalid target color: %v", err)
	}

	gradient, err := parseHexColor(gradientColor)
	if err != nil {
		return nil, fmt.Errorf("invalid gradient color: %v", err)
	}

	// Get RGB values and convert to 0-255 range
	tr, tg, tb := uint32(target.R), uint32(target.G), uint32(target.B)
	gr, gg, gb := uint32(gradient.R), uint32(gradient.G), uint32(gradient.B)

	// Convert to HSL
	th, ts, tl := rgbToHSL(tr, tg, tb)
	gh, gs, gl := rgbToHSL(gr, gg, gb)

	// Calculate hue difference considering the circular nature of hue
	hDiff := math.Abs(th - gh)
	if hDiff > 180 {
		hDiff = 360 - hDiff
	}

	// Normalize differences to 0-1 range
	normHDiff := hDiff / 180.0 // Normalize hue difference to 0-1
	normSDiff := math.Abs(ts-gs) / 100.0
	normLDiff := math.Abs(tl-gl) / 100.0

	// Strong hue penalty for large hue differences
	huePenalty := 0.0
	if normHDiff > 0.25 { // More than 45 degrees difference
		huePenalty = normHDiff * 2.0
	}

	// Calculate weighted similarity
	const (
		hueWeight        = 0.6
		saturationWeight = 0.25
		lightnessWeight  = 0.15
	)

	// Calculate overall difference with penalties
	totalDiff := (normHDiff * hueWeight) +
		(normSDiff * saturationWeight) +
		(normLDiff * lightnessWeight) +
		huePenalty

	// Calculate similarity (0-1 range)
	similarity := math.Max(0, math.Min(1, 1.0-totalDiff))
	similarity = math.Round(similarity*10000) / 10000

	// Add debug logging
	// fmt.Printf("Color comparison:\n")
	// fmt.Printf("Target:  HSL(%.2f, %.2f, %.2f)\n", th, ts, tl)
	// fmt.Printf("Compare: HSL(%.2f, %.2f, %.2f)\n", gh, gs, gl)
	// fmt.Printf("Differences - H: %.2f, S: %.2f, L: %.2f\n", hDiff, math.Abs(ts-gs), math.Abs(tl-gl))
	// fmt.Printf("Similarity: %.4f\n", similarity)

	// Determine if colors are similar based on tolerance
	similar := similarity >= tolerance

	// Generate result
	result := map[string]interface{}{
		"data":       similar,
		"similarity": similarity,
		"details": map[string]interface{}{
			"hueDiff":        math.Round(hDiff*100) / 100,
			"saturationDiff": math.Round(math.Abs(ts-gs)*100) / 100,
			"lightnessDiff":  math.Round(math.Abs(tl-gl)*100) / 100,
			"hue1":           math.Round(th*100) / 100,
			"hue2":           math.Round(gh*100) / 100,
		},
		"reason": fmt.Sprintf("Colors are %.1f%% similar", similarity*100),
	}

	if !similar {
		result["reason"] = fmt.Sprintf("Colors differ by %.1f degrees in hue, %.1f%% in saturation, %.1f%% in lightness",
			hDiff, math.Abs(ts-gs), math.Abs(tl-gl))
	}

	return result, nil
}

// isBase64 判断字符串是否为base64编码
func isBase64(str string) bool {
	// 检查是否包含base64前缀
	if strings.HasPrefix(str, "data:image") && strings.Contains(str, ";base64,") {
		return true
	}

	// 移除可能的空白字符
	str = strings.TrimSpace(str)

	// 检查字符串长度是否为4的倍数(base64特征)
	if len(str)%4 != 0 {
		return false
	}

	// 检查是否只包含base64合法字符
	for _, c := range str {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=') {
			return false
		}
	}

	return true
}

// // loadImageFromPath 从文件路径加载图像
// func loadImageFromPath(path string) (gocv.Mat, error) {
// 	// 处理路径
// 	if !filepath.IsAbs(path) {
// 		currentDir, err := os.Getwd()
// 		if err != nil {
// 			return gocv.Mat{}, fmt.Errorf("获取当前目录失败: %v", err)
// 		}
// 		path = filepath.Join(currentDir, path)
// 	}

// 	// 检查文件是否存在
// 	if _, err := os.Stat(path); os.IsNotExist(err) {
// 		return gocv.Mat{}, fmt.Errorf("文件不存在: %s", path)
// 	}

// 	// 读取图像
// 	img := gocv.IMRead(path, gocv.IMReadColor)
// 	if img.Empty() {
// 		return gocv.Mat{}, fmt.Errorf("无法读取图像: %s", path)
// 	}
// 	return img, nil
// }

// // loadImageFromBase64 从base64字符串加载图像
// func loadImageFromBase64(base64Str string) (gocv.Mat, error) {
// 	// 移除可能的Data URI前缀
// 	if strings.Contains(base64Str, ";base64,") {
// 		base64Str = strings.Split(base64Str, ";base64,")[1]
// 	}

// 	// 解码base64
// 	imgData, err := base64.StdEncoding.DecodeString(base64Str)
// 	if err != nil {
// 		return gocv.Mat{}, fmt.Errorf("base64解码失败: %v", err)
// 	}

// 	// 将字节数据转换为Mat
// 	img, err := gocv.IMDecode(imgData, gocv.IMReadColor)
// 	if err != nil {
// 		return gocv.Mat{}, fmt.Errorf("图像解码失败: %v", err)
// 	}
// 	if img.Empty() {
// 		return gocv.Mat{}, fmt.Errorf("无法读取base64图像")
// 	}
// 	return img, nil
// }

// // FindImage 在大图中查找小图，返回结果对象
// func FindImage(largeImg, smallImg string, threshold float32) map[string]interface{} {
// 	result := make(map[string]interface{})

// 	// 加载大图
// 	large, err := loadImage(largeImg)
// 	if err != nil {
// 		result["success"] = false
// 		result["error"] = fmt.Sprintf("加载大图失败: %v", err)
// 		return result
// 	}
// 	defer large.Close()

// 	// 加载小图
// 	small, err := loadImage(smallImg)
// 	if err != nil {
// 		result["success"] = false
// 		result["error"] = fmt.Sprintf("加载小图失败: %v", err)
// 		return result
// 	}
// 	defer small.Close()

// 	// 创建结果矩阵
// 	resultMat := gocv.NewMat()
// 	defer resultMat.Close()

// 	// 执行模板匹配
// 	gocv.MatchTemplate(large, small, &resultMat, gocv.TmCcoeffNormed, gocv.NewMat())

// 	// 获取最佳匹配位置
// 	_, maxVal, _, maxLoc := gocv.MinMaxLoc(resultMat)

// 	// 如果匹配度小于阈值,返回错误
// 	if maxVal < float64(threshold) {
// 		result["success"] = false
// 		result["error"] = fmt.Sprintf("未找到匹配图像 (最大匹配度: %f)", maxVal)
// 		return result
// 	}

// 	// 计算匹配区域的中心点
// 	x := maxLoc.X + small.Cols()/2
// 	y := maxLoc.Y + small.Rows()/2

// 	// 构造返回结果
// 	result["success"] = true
// 	result["x"] = x
// 	result["y"] = y
// 	result["confidence"] = maxVal // 添加匹配度信息

// 	return result
// }

// // FindAllImages 找出所有匹配的位置
// func FindAllImages(largeImg, smallImg string, threshold float32) map[string]interface{} {
// 	result := make(map[string]interface{})

// 	// 加载大图
// 	large, err := loadImage(largeImg)
// 	if err != nil {
// 		result["success"] = false
// 		result["error"] = fmt.Sprintf("加载大图失败: %v", err)
// 		return result
// 	}
// 	defer large.Close()

// 	// 加载小图
// 	small, err := loadImage(smallImg)
// 	if err != nil {
// 		result["success"] = false
// 		result["error"] = fmt.Sprintf("加载小图失败: %v", err)
// 		return result
// 	}
// 	defer small.Close()

// 	// 创建结果矩阵
// 	resultMat := gocv.NewMat()
// 	defer resultMat.Close()

// 	// 执行模板匹配
// 	gocv.MatchTemplate(large, small, &resultMat, gocv.TmCcoeffNormed, gocv.NewMat())

// 	// 存储所有匹配位置
// 	var matches []map[string]interface{}
// 	rows := resultMat.Rows()
// 	cols := resultMat.Cols()

// 	// 遍历结果矩阵查找所有匹配位置
// 	for y := 0; y < rows; y++ {
// 		for x := 0; x < cols; x++ {
// 			val := resultMat.GetFloatAt(y, x)
// 			if val >= float64(threshold) {
// 				centerX := x + small.Cols()/2
// 				centerY := y + small.Rows()/2
// 				match := map[string]interface{}{
// 					"x":          centerX,
// 					"y":          centerY,
// 					"confidence": val,
// 				}
// 				matches = append(matches, match)
// 			}
// 		}
// 	}

// 	result["success"] = true
// 	result["matches"] = matches
// 	result["count"] = len(matches)

// 	return result
// }
