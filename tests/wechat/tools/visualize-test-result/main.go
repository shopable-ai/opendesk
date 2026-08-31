package main

import (
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

// 测试结果数据结构
type TestResult struct {
	Mode       string             `json:"mode"`
	Precision  float64            `json:"precision"`
	Recall     float64            `json:"recall"`
	F1         float64            `json:"f1"`
	Separators DetectedSeparators `json:"separators"`
	Expected   ExpectedSeparators `json:"expected"`
	Regions    []RegionMatch      `json:"regions"`
}

type DetectedSeparators struct {
	Vertical   []Separator `json:"vertical"`
	Horizontal []Separator `json:"horizontal"`
}

type ExpectedSeparators struct {
	Vertical   []ExpectedSep `json:"vertical"`
	Horizontal []ExpectedSep `json:"horizontal"`
}

type Separator struct {
	Position   float64 `json:"position"`
	Confidence float64 `json:"confidence"`
	IsCorrect  bool    `json:"isCorrect"`
}

type ExpectedSep struct {
	Position int    `json:"position"`
	Label    string `json:"label"`
	Detected bool   `json:"detected"`
}

type RegionMatch struct {
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Label   string `json:"label"`
	Name    string `json:"name"`
	Matched bool   `json:"matched"`
}

// 颜色定义
var (
	ColorCorrect = color.RGBA{0, 255, 0, 255}     // 绿色 - 正确
	ColorWrong   = color.RGBA{255, 0, 0, 255}     // 红色 - 误检
	ColorMissing = color.RGBA{255, 165, 0, 255}   // 橙色 - 漏检
	ColorText    = color.RGBA{0, 0, 0, 255}       // 黑色文字
	ColorBg      = color.RGBA{255, 255, 255, 230} // 白色背景

	// 区域颜色
	RegionColors = []color.RGBA{
		{255, 200, 200, 80}, // 浅红色
		{200, 255, 200, 80}, // 浅绿色
		{200, 200, 255, 80}, // 浅蓝色
		{255, 255, 200, 80}, // 浅黄色
		{255, 200, 255, 80}, // 浅洋红
		{200, 255, 255, 80}, // 浅青色
	}
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run visualize_test_result.go <median|mean>")
		os.Exit(1)
	}

	mode := os.Args[1]

	// 加载原始图片
	originalPath := ".runtime/tests/wechat/mock_wechat.png"
	file, err := os.Open(originalPath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	originalImg, err := png.Decode(file)
	if err != nil {
		panic(err)
	}

	// 创建副本
	bounds := originalImg.Bounds()
	img := image.NewRGBA(bounds)
	draw.Draw(img, bounds, originalImg, bounds.Min, draw.Src)

	// 根据模式加载测试结果
	var result TestResult
	if mode == "median" {
		result = getMedianTestResult()
	} else {
		result = getMeanTestResult()
	}

	// 1. 绘制区域覆盖层
	drawRegionOverlays(img, result.Regions)

	// 2. 绘制分隔符线条
	drawSeparators(img, result)

	// 3. 绘制区域标签
	drawRegionLabels(img, result.Regions)

	// 4. 绘制图例
	drawLegend(img, result)

	// 保存图片
	outputPath := fmt.Sprintf(".runtime/tests/wechat/mock_%s_visualization.png", mode)
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

	fmt.Printf("✅ 可视化图片已生成: %s\n", outputPath)
	fmt.Printf("\n性能指标:\n")
	fmt.Printf("  精确率: %.1f%%\n", result.Precision)
	fmt.Printf("  召回率: %.1f%%\n", result.Recall)
	fmt.Printf("  F1 分数: %.1f%%\n", result.F1)
	fmt.Printf("\n颜色说明:\n")
	fmt.Printf("  绿色线条 - 正确检测的分隔符\n")
	fmt.Printf("  红色线条 - 误检测的分隔符\n")
	fmt.Printf("  橙色线条 - 漏检的分隔符\n")
	fmt.Printf("  彩色区域 - 识别的区域，带中文标签\n")
}

func getMedianTestResult() TestResult {
	return TestResult{
		Mode:      "median",
		Precision: 66.7,
		Recall:    100.0,
		F1:        80.0,
		Separators: DetectedSeparators{
			Vertical: []Separator{
				{Position: 60, Confidence: 0.571, IsCorrect: true},
				{Position: 300, Confidence: 0.357, IsCorrect: true},
			},
			Horizontal: []Separator{
				{Position: 60, Confidence: 0.660, IsCorrect: true},
				{Position: 710, Confidence: 0.531, IsCorrect: true},
				{Position: 130, Confidence: 0.523, IsCorrect: false},
				{Position: 190, Confidence: 0.395, IsCorrect: false},
			},
		},
		Expected: ExpectedSeparators{
			Vertical: []ExpectedSep{
				{Position: 60, Label: "侧边栏|聊天列表", Detected: true},
				{Position: 340, Label: "聊天列表|聊天内容", Detected: true},
			},
			Horizontal: []ExpectedSep{
				{Position: 60, Label: "聊天头部|消息区域", Detected: true},
				{Position: 700, Label: "消息区域|输入区域", Detected: true},
			},
		},
		Regions: []RegionMatch{
			{X: 0, Y: 0, Width: 60, Height: 800, Label: "侧边栏", Name: "sidebar", Matched: true},
			{X: 60, Y: 0, Width: 280, Height: 800, Label: "聊天列表", Name: "chatList", Matched: true},
			{X: 340, Y: 0, Width: 860, Height: 60, Label: "聊天头部", Name: "chatHeader", Matched: true},
			{X: 340, Y: 60, Width: 860, Height: 640, Label: "消息区域", Name: "chatMessages", Matched: true},
			{X: 340, Y: 700, Width: 860, Height: 100, Label: "输入区域", Name: "chatInput", Matched: true},
		},
	}
}

func getMeanTestResult() TestResult {
	return TestResult{
		Mode:      "mean",
		Precision: 30.8,
		Recall:    100.0,
		F1:        47.1,
		Separators: DetectedSeparators{
			Vertical: []Separator{
				{Position: 60, Confidence: 0.665, IsCorrect: true},
				{Position: 330, Confidence: 0.595, IsCorrect: true},
				{Position: 130, Confidence: 0.297, IsCorrect: false},
				{Position: 370, Confidence: 0.332, IsCorrect: false},
			},
			Horizontal: []Separator{
				{Position: 50, Confidence: 0.594, IsCorrect: true},
				{Position: 710, Confidence: 0.807, IsCorrect: true},
				{Position: 110, Confidence: 0.589, IsCorrect: false},
				{Position: 130, Confidence: 0.797, IsCorrect: false},
				{Position: 140, Confidence: 0.486, IsCorrect: false},
				{Position: 170, Confidence: 0.589, IsCorrect: false},
				{Position: 230, Confidence: 0.501, IsCorrect: false},
				{Position: 270, Confidence: 0.503, IsCorrect: false},
				{Position: 340, Confidence: 0.503, IsCorrect: false},
			},
		},
		Expected: ExpectedSeparators{
			Vertical: []ExpectedSep{
				{Position: 60, Label: "侧边栏|聊天列表", Detected: true},
				{Position: 340, Label: "聊天列表|聊天内容", Detected: true},
			},
			Horizontal: []ExpectedSep{
				{Position: 60, Label: "聊天头部|消息区域", Detected: true},
				{Position: 700, Label: "消息区域|输入区域", Detected: true},
			},
		},
		Regions: []RegionMatch{
			{X: 0, Y: 0, Width: 60, Height: 800, Label: "侧边栏", Name: "sidebar", Matched: true},
			{X: 60, Y: 0, Width: 280, Height: 800, Label: "聊天列表", Name: "chatList", Matched: true},
			{X: 340, Y: 0, Width: 860, Height: 60, Label: "聊天头部", Name: "chatHeader", Matched: true},
			{X: 340, Y: 60, Width: 860, Height: 640, Label: "消息区域", Name: "chatMessages", Matched: true},
			{X: 340, Y: 700, Width: 860, Height: 100, Label: "输入区域", Name: "chatInput", Matched: true},
		},
	}
}

func drawRegionOverlays(img *image.RGBA, regions []RegionMatch) {
	for i, region := range regions {
		if !region.Matched {
			continue
		}

		col := RegionColors[i%len(RegionColors)]

		// 绘制半透明覆盖层
		for y := region.Y; y < region.Y+region.Height; y++ {
			for x := region.X; x < region.X+region.Width; x++ {
				if x >= 0 && x < img.Bounds().Dx() && y >= 0 && y < img.Bounds().Dy() {
					existing := img.At(x, y)
					r1, g1, b1, a1 := existing.RGBA()

					// Alpha blending
					alpha := float64(col.A) / 255.0
					r := uint8((float64(r1)/257.0)*(1-alpha) + float64(col.R)*alpha)
					g := uint8((float64(g1)/257.0)*(1-alpha) + float64(col.G)*alpha)
					b := uint8((float64(b1)/257.0)*(1-alpha) + float64(col.B)*alpha)

					img.Set(x, y, color.RGBA{r, g, b, uint8(a1 / 257)})
				}
			}
		}
	}
}

func drawSeparators(img *image.RGBA, result TestResult) {
	// 绘制垂直分隔符
	for _, sep := range result.Separators.Vertical {
		col := ColorWrong
		if sep.IsCorrect {
			col = ColorCorrect
		}
		drawThickVerticalLine(img, int(sep.Position), col, 3)
	}

	// 绘制水平分隔符
	for _, sep := range result.Separators.Horizontal {
		col := ColorWrong
		if sep.IsCorrect {
			col = ColorCorrect
		}
		drawThickHorizontalLine(img, int(sep.Position), col, 3)
	}

	// 绘制漏检的分隔符（橙色虚线）
	for _, exp := range result.Expected.Vertical {
		if !exp.Detected {
			drawDashedVerticalLine(img, exp.Position, ColorMissing, 3)
		}
	}

	for _, exp := range result.Expected.Horizontal {
		if !exp.Detected {
			drawDashedHorizontalLine(img, exp.Position, ColorMissing, 3)
		}
	}
}

func drawRegionLabels(img *image.RGBA, regions []RegionMatch) {
	for _, region := range regions {
		if !region.Matched {
			continue
		}

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

		// 绘制背景
		for dy := 0; dy < boxHeight; dy++ {
			for dx := 0; dx < boxWidth; dx++ {
				img.Set(boxX+dx, boxY+dy, ColorBg)
			}
		}

		// 绘制边框
		for dx := 0; dx < boxWidth; dx++ {
			img.Set(boxX+dx, boxY, ColorText)
			img.Set(boxX+dx, boxY+boxHeight-1, ColorText)
		}
		for dy := 0; dy < boxHeight; dy++ {
			img.Set(boxX, boxY+dy, ColorText)
			img.Set(boxX+boxWidth-1, boxY+dy, ColorText)
		}

		// 绘制文字
		drawText(img, boxX+10, boxY+20, text, ColorText)
	}
}

func drawLegend(img *image.RGBA, result TestResult) {
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

func drawThickVerticalLine(img *image.RGBA, x int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for t := 0; t < thickness; t++ {
			if x+t >= bounds.Min.X && x+t < bounds.Max.X {
				img.Set(x+t, y, col)
			}
		}
	}
}

func drawThickHorizontalLine(img *image.RGBA, y int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for t := 0; t < thickness; t++ {
			if y+t >= bounds.Min.Y && y+t < bounds.Max.Y {
				img.Set(x, y+t, col)
			}
		}
	}
}

func drawDashedVerticalLine(img *image.RGBA, x int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if y%10 < 5 { // 虚线效果
			for t := 0; t < thickness; t++ {
				if x+t >= bounds.Min.X && x+t < bounds.Max.X {
					img.Set(x+t, y, col)
				}
			}
		}
	}
}

func drawDashedHorizontalLine(img *image.RGBA, y int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		if x%10 < 5 { // 虚线效果
			for t := 0; t < thickness; t++ {
				if y+t >= bounds.Min.Y && y+t < bounds.Max.Y {
					img.Set(x, y+t, col)
				}
			}
		}
	}
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
