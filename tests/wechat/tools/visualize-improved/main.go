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

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// 实际的分隔符数据结构（包含起始和结束位置）
type SeparatorData struct {
	Position   float64 `json:"position"`
	Start      float64 `json:"start"`
	End        float64 `json:"end"`
	Confidence float64 `json:"confidence"`
	IsCorrect  bool    `json:"isCorrect"`
}

// 实际的区域数据结构
type RegionData struct {
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Label   string `json:"label"`
	Matched bool   `json:"matched"`
}

type TestResultData struct {
	Mode       string  `json:"mode"`
	Precision  float64 `json:"precision"`
	Recall     float64 `json:"recall"`
	F1         float64 `json:"f1"`
	Separators struct {
		Vertical   []SeparatorData `json:"vertical"`
		Horizontal []SeparatorData `json:"horizontal"`
	} `json:"separators"`
	Regions []RegionData `json:"regions"`
}

// 区域颜色 - 使用更鲜明的颜色
var RegionColors = []color.RGBA{
	{255, 100, 100, 255}, // 红色
	{100, 255, 100, 255}, // 绿色
	{100, 100, 255, 255}, // 蓝色
	{255, 255, 100, 255}, // 黄色
	{255, 100, 255, 255}, // 洋红
	{100, 255, 255, 255}, // 青色
	{255, 150, 100, 255}, // 橙色
	{150, 100, 255, 255}, // 紫色
}

var (
	ColorCorrect = color.RGBA{0, 255, 0, 255}     // 绿色 - 正确
	ColorWrong   = color.RGBA{255, 0, 0, 255}     // 红色 - 误检
	ColorText    = color.RGBA{0, 0, 0, 255}       // 黑色文字
	ColorBg      = color.RGBA{255, 255, 255, 230} // 白色背景
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: go run ./tests/wechat/tools/visualize-improved <image.png> <result.json>")
		os.Exit(1)
	}

	imagePath := os.Args[1]
	jsonPath := os.Args[2]

	// 加载测试结果
	jsonFile, err := os.Open(jsonPath)
	if err != nil {
		panic(fmt.Sprintf("无法打开JSON文件: %v", err))
	}
	defer jsonFile.Close()

	var result TestResultData
	if err := json.NewDecoder(jsonFile).Decode(&result); err != nil {
		panic(fmt.Sprintf("无法解析JSON: %v", err))
	}

	// 加载原始图片
	file, err := os.Open(imagePath)
	if err != nil {
		panic(fmt.Sprintf("无法打开图片: %v", err))
	}
	defer file.Close()

	originalImg, err := png.Decode(file)
	if err != nil {
		panic(fmt.Sprintf("无法解码图片: %v", err))
	}

	// 创建副本
	bounds := originalImg.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, originalImg, bounds.Min, draw.Src)

	// 1. 绘制区域边框（不同颜色，可能有偏移）
	drawRegionBorders(img, result.Regions)

	// 2. 绘制分隔符（使用实际的起始和结束位置）
	drawSeparatorsWithBounds(img, result.Separators.Vertical, result.Separators.Horizontal)

	// 3. 绘制区域标签
	drawRegionLabelsImproved(img, result.Regions)

	// 4. 绘制图例
	drawLegendImproved(img, result)

	// 保存图片
	outputPath := filepath.Join(".runtime", "tests", "wechat", fmt.Sprintf("mock_%s_improved.png", result.Mode))
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		panic(fmt.Sprintf("无法创建输出目录: %v", err))
	}
	outFile, err := os.Create(outputPath)
	if err != nil {
		panic(err)
	}
	defer outFile.Close()

	if err := png.Encode(outFile, img); err != nil {
		panic(err)
	}

	fmt.Printf("✅ 改进的可视化图片已生成: %s\n", outputPath)
	fmt.Printf("\n性能指标:\n")
	fmt.Printf("  精确率: %.1f%%\n", result.Precision)
	fmt.Printf("  召回率: %.1f%%\n", result.Recall)
	fmt.Printf("  F1 分数: %.1f%%\n", result.F1)
	fmt.Printf("\n分隔符:\n")
	fmt.Printf("  垂直: %d个\n", len(result.Separators.Vertical))
	fmt.Printf("  水平: %d个\n", len(result.Separators.Horizontal))
	fmt.Printf("\n区域: %d个\n", len(result.Regions))
}

// 绘制区域边框（不同颜色，处理重叠）
func drawRegionBorders(img *image.RGBA, regions []RegionData) {
	// 为了处理重叠，我们给每个区域添加一个小偏移
	for i, region := range regions {
		if !region.Matched {
			continue
		}

		col := RegionColors[i%len(RegionColors)]

		// 计算偏移量（如果区域重叠）
		offset := (i % 3) * 2 // 0, 2, 4 像素偏移

		x1 := region.X + offset
		y1 := region.Y + offset
		x2 := region.X + region.Width - offset
		y2 := region.Y + region.Height - offset

		// 确保在边界内
		bounds := img.Bounds()
		if x1 < 0 {
			x1 = 0
		}
		if y1 < 0 {
			y1 = 0
		}
		if x2 > bounds.Dx() {
			x2 = bounds.Dx()
		}
		if y2 > bounds.Dy() {
			y2 = bounds.Dy()
		}

		thickness := 3

		// 绘制四条边
		// 上边
		for x := x1; x < x2; x++ {
			for t := 0; t < thickness; t++ {
				if y1+t < bounds.Dy() {
					img.Set(x, y1+t, col)
				}
			}
		}

		// 下边
		for x := x1; x < x2; x++ {
			for t := 0; t < thickness; t++ {
				if y2-t >= 0 {
					img.Set(x, y2-t, col)
				}
			}
		}

		// 左边
		for y := y1; y < y2; y++ {
			for t := 0; t < thickness; t++ {
				if x1+t < bounds.Dx() {
					img.Set(x1+t, y, col)
				}
			}
		}

		// 右边
		for y := y1; y < y2; y++ {
			for t := 0; t < thickness; t++ {
				if x2-t >= 0 {
					img.Set(x2-t, y, col)
				}
			}
		}
	}
}

// 绘制分隔符（使用实际的起始和结束位置）
func drawSeparatorsWithBounds(img *image.RGBA, vertical, horizontal []SeparatorData) {
	bounds := img.Bounds()
	thickness := 3

	// 绘制垂直分隔符
	for _, sep := range vertical {
		col := ColorWrong
		if sep.IsCorrect {
			col = ColorCorrect
		}

		x := int(sep.Position)
		start := int(sep.Start)
		end := int(sep.End)

		// 如果没有指定起始和结束，使用整个高度
		if start == 0 && end == 0 {
			start = bounds.Min.Y
			end = bounds.Max.Y
		}

		for y := start; y < end; y++ {
			for t := 0; t < thickness; t++ {
				if x+t >= bounds.Min.X && x+t < bounds.Max.X && y >= bounds.Min.Y && y < bounds.Max.Y {
					img.Set(x+t, y, col)
				}
			}
		}
	}

	// 绘制水平分隔符
	for _, sep := range horizontal {
		col := ColorWrong
		if sep.IsCorrect {
			col = ColorCorrect
		}

		y := int(sep.Position)
		start := int(sep.Start)
		end := int(sep.End)

		// 如果没有指定起始和结束，使用整个宽度
		if start == 0 && end == 0 {
			start = bounds.Min.X
			end = bounds.Max.X
		}

		for x := start; x < end; x++ {
			for t := 0; t < thickness; t++ {
				if y+t >= bounds.Min.Y && y+t < bounds.Max.Y && x >= bounds.Min.X && x < bounds.Max.X {
					img.Set(x, y+t, col)
				}
			}
		}
	}
}

// 绘制区域标签（改进版）
func drawRegionLabelsImproved(img *image.RGBA, regions []RegionData) {
	for i, region := range regions {
		if !region.Matched {
			continue
		}

		// 使用与边框相同的颜色
		labelColor := RegionColors[i%len(RegionColors)]

		// 计算标签位置（区域中心）
		labelX := region.X + region.Width/2
		labelY := region.Y + region.Height/2

		// 绘制标签背景
		text := region.Label
		boxWidth := len(text)*7 + 20
		boxHeight := 30
		boxX := labelX - boxWidth/2
		boxY := labelY - boxHeight/2

		// 确保在边界内
		bounds := img.Bounds()
		if boxX < 5 {
			boxX = 5
		}
		if boxY < 5 {
			boxY = 5
		}
		if boxX+boxWidth > bounds.Dx()-5 {
			boxX = bounds.Dx() - boxWidth - 5
		}
		if boxY+boxHeight > bounds.Dy()-5 {
			boxY = bounds.Dy() - boxHeight - 5
		}

		// 绘制背景（使用区域颜色的半透明版本）
		bgColor := color.RGBA{labelColor.R, labelColor.G, labelColor.B, 200}
		for dy := 0; dy < boxHeight; dy++ {
			for dx := 0; dx < boxWidth; dx++ {
				img.Set(boxX+dx, boxY+dy, bgColor)
			}
		}

		// 绘制边框（使用区域颜色）
		for dx := 0; dx < boxWidth; dx++ {
			img.Set(boxX+dx, boxY, labelColor)
			img.Set(boxX+dx, boxY+boxHeight-1, labelColor)
		}
		for dy := 0; dy < boxHeight; dy++ {
			img.Set(boxX, boxY+dy, labelColor)
			img.Set(boxX+boxWidth-1, boxY+dy, labelColor)
		}

		// 绘制文字（黑色）
		drawText(img, boxX+10, boxY+20, text, ColorText)
	}
}

func drawLegendImproved(img *image.RGBA, result TestResultData) {
	bounds := img.Bounds()
	legendX := bounds.Min.X + 10
	legendY := bounds.Min.Y + 10
	legendWidth := 300
	legendHeight := 150

	// 背景
	for y := legendY; y < legendY+legendHeight; y++ {
		for x := legendX; x < legendX+legendWidth; x++ {
			img.Set(x, y, ColorBg)
		}
	}

	// 边框
	for x := legendX; x < legendX+legendWidth; x++ {
		img.Set(x, legendY, ColorText)
		img.Set(x, legendY+legendHeight-1, ColorText)
	}
	for y := legendY; y < legendY+legendHeight; y++ {
		img.Set(legendX, y, ColorText)
		img.Set(legendX+legendWidth-1, y, ColorText)
	}

	// 标题
	title := fmt.Sprintf("%s Mode", result.Mode)
	drawText(img, legendX+10, legendY+20, title, ColorText)

	// 性能指标
	y := legendY + 40
	drawText(img, legendX+10, y, fmt.Sprintf("Precision: %.1f%%", result.Precision), ColorText)
	y += 20
	drawText(img, legendX+10, y, fmt.Sprintf("Recall: %.1f%%", result.Recall), ColorText)
	y += 20
	drawText(img, legendX+10, y, fmt.Sprintf("F1 Score: %.1f%%", result.F1), ColorText)

	// 图例
	y += 30
	// 绿色线
	for i := 0; i < 40; i++ {
		for j := 0; j < 3; j++ {
			img.Set(legendX+10+i, y+j, ColorCorrect)
		}
	}
	drawText(img, legendX+60, y+5, "Correct", ColorText)

	y += 15
	// 红色线
	for i := 0; i < 40; i++ {
		for j := 0; j < 3; j++ {
			img.Set(legendX+10+i, y+j, ColorWrong)
		}
	}
	drawText(img, legendX+60, y+5, "Wrong", ColorText)
}

func drawText(img *image.RGBA, x, y int, text string, col color.Color) {
	point := fixed.Point26_6{
		X: fixed.Int26_6(x) << 6,
		Y: fixed.Int26_6(y) << 6,
	}

	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(col),
		Face: basicfont.Face7x13,
		Dot:  point,
	}
	d.DrawString(text)
}
