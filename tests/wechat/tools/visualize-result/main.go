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
)

// 可视化配置
type VisualizationConfig struct {
	ImagePath  string `json:"imagePath"`
	ExpectedV  []int  `json:"expectedVertical"`
	ExpectedH  []int  `json:"expectedHorizontal"`
	DetectedV  []int  `json:"detectedVertical"`
	DetectedH  []int  `json:"detectedHorizontal"`
	OutputPath string `json:"outputPath"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run visualize_result.go <config.json>")
		os.Exit(1)
	}

	// 读取配置
	configData, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}

	var config VisualizationConfig
	if err := json.Unmarshal(configData, &config); err != nil {
		panic(err)
	}

	// 加载原始图片
	file, err := os.Open(config.ImagePath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		panic(err)
	}

	// 创建可绘制的图片副本
	bounds := img.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, img, bounds.Min, draw.Src)

	// 定义颜色
	colorCorrect := color.RGBA{0, 255, 0, 255}  // 绿色 - 正确检测
	colorFalse := color.RGBA{255, 0, 0, 255}    // 红色 - 误检测
	colorMissed := color.RGBA{255, 165, 0, 255} // 橙色 - 漏检测

	// 辅助函数：检查是否匹配
	isMatch := func(detected int, expected []int, tolerance int) bool {
		for _, exp := range expected {
			if abs(detected-exp) <= tolerance {
				return true
			}
		}
		return false
	}

	// 绘制垂直分隔符
	for _, x := range config.DetectedV {
		col := colorFalse
		if isMatch(x, config.ExpectedV, 10) {
			col = colorCorrect
		}
		drawVerticalLine(rgba, x, col, 3)
		// 添加标签
		drawLabel(rgba, x+5, 20, fmt.Sprintf("x=%d", x), col)
	}

	// 绘制漏检的垂直分隔符
	for _, x := range config.ExpectedV {
		if !isMatch(x, config.DetectedV, 10) {
			drawVerticalLine(rgba, x, colorMissed, 3)
			drawLabel(rgba, x+5, 40, fmt.Sprintf("x=%d (漏检)", x), colorMissed)
		}
	}

	// 绘制水平分隔符
	for _, y := range config.DetectedH {
		col := colorFalse
		if isMatch(y, config.ExpectedH, 10) {
			col = colorCorrect
		}
		drawHorizontalLine(rgba, y, col, 3)
		drawLabel(rgba, 20, y+15, fmt.Sprintf("y=%d", y), col)
	}

	// 绘制漏检的水平分隔符
	for _, y := range config.ExpectedH {
		if !isMatch(y, config.DetectedH, 10) {
			drawHorizontalLine(rgba, y, colorMissed, 3)
			drawLabel(rgba, 40, y+15, fmt.Sprintf("y=%d (漏检)", y), colorMissed)
		}
	}

	// 添加图例
	drawLegend(rgba, bounds.Dx(), bounds.Dy())

	// 保存结果
	if err := os.MkdirAll(filepath.Dir(config.OutputPath), 0o755); err != nil {
		panic(err)
	}
	outFile, err := os.Create(config.OutputPath)
	if err != nil {
		panic(err)
	}
	defer outFile.Close()

	if err := png.Encode(outFile, rgba); err != nil {
		panic(err)
	}

	fmt.Printf("✅ 可视化图片已生成: %s\n", config.OutputPath)

	// 计算并显示指标
	correctV := 0
	for _, x := range config.DetectedV {
		if isMatch(x, config.ExpectedV, 10) {
			correctV++
		}
	}

	correctH := 0
	for _, y := range config.DetectedH {
		if isMatch(y, config.ExpectedH, 10) {
			correctH++
		}
	}

	totalCorrect := correctV + correctH
	totalDetected := len(config.DetectedV) + len(config.DetectedH)
	totalExpected := len(config.ExpectedV) + len(config.ExpectedH)

	precision := float64(totalCorrect) / float64(totalDetected) * 100
	recall := float64(totalCorrect) / float64(totalExpected) * 100
	f1 := 2 * precision * recall / (precision + recall)

	fmt.Printf("\n性能指标:\n")
	fmt.Printf("  精确率: %.1f%%\n", precision)
	fmt.Printf("  召回率: %.1f%%\n", recall)
	fmt.Printf("  F1 分数: %.1f%%\n", f1)
	fmt.Printf("\n图例:\n")
	fmt.Printf("  绿色线条 - 正确检测\n")
	fmt.Printf("  红色线条 - 误检测\n")
	fmt.Printf("  橙色线条 - 漏检测\n")
}

func drawVerticalLine(img *image.RGBA, x int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for t := -thickness / 2; t <= thickness/2; t++ {
			if x+t >= bounds.Min.X && x+t < bounds.Max.X {
				img.Set(x+t, y, col)
			}
		}
	}
}

func drawHorizontalLine(img *image.RGBA, y int, col color.Color, thickness int) {
	bounds := img.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for t := -thickness / 2; t <= thickness/2; t++ {
			if y+t >= bounds.Min.Y && y+t < bounds.Max.Y {
				img.Set(x, y+t, col)
			}
		}
	}
}

func drawLabel(img *image.RGBA, x, y int, text string, col color.Color) {
	// 简单的文字背景框
	boxWidth := len(text) * 8
	boxHeight := 16

	// 绘制半透明背景
	bgColor := color.RGBA{255, 255, 255, 200}
	for dy := 0; dy < boxHeight; dy++ {
		for dx := 0; dx < boxWidth; dx++ {
			if x+dx < img.Bounds().Max.X && y+dy < img.Bounds().Max.Y {
				img.Set(x+dx, y+dy, bgColor)
			}
		}
	}

	// 绘制边框
	for dx := 0; dx < boxWidth; dx++ {
		if x+dx < img.Bounds().Max.X {
			img.Set(x+dx, y, col)
			img.Set(x+dx, y+boxHeight-1, col)
		}
	}
	for dy := 0; dy < boxHeight; dy++ {
		if y+dy < img.Bounds().Max.Y {
			img.Set(x, y+dy, col)
			img.Set(x+boxWidth-1, y+dy, col)
		}
	}
}

func drawLegend(img *image.RGBA, width, height int) {
	x := width - 200
	y := height - 100

	// 背景
	bgColor := color.RGBA{255, 255, 255, 230}
	for dy := 0; dy < 90; dy++ {
		for dx := 0; dx < 190; dx++ {
			if x+dx < img.Bounds().Max.X && y+dy < img.Bounds().Max.Y {
				img.Set(x+dx, y+dy, bgColor)
			}
		}
	}

	// 边框
	borderColor := color.RGBA{0, 0, 0, 255}
	for dx := 0; dx < 190; dx++ {
		img.Set(x+dx, y, borderColor)
		img.Set(x+dx, y+89, borderColor)
	}
	for dy := 0; dy < 90; dy++ {
		img.Set(x, y+dy, borderColor)
		img.Set(x+189, y+dy, borderColor)
	}

	// 图例项
	legends := []struct {
		color color.Color
		text  string
		yOff  int
	}{
		{color.RGBA{0, 255, 0, 255}, "正确检测", 15},
		{color.RGBA{255, 0, 0, 255}, "误检测", 40},
		{color.RGBA{255, 165, 0, 255}, "漏检测", 65},
	}

	for _, legend := range legends {
		// 绘制颜色块
		for dy := 0; dy < 10; dy++ {
			for dx := 0; dx < 20; dx++ {
				img.Set(x+10+dx, y+legend.yOff+dy, legend.color)
			}
		}
	}
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
