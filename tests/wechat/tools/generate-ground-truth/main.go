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

// 预期的区域定义
type ExpectedRegion struct {
	Name   string `json:"name"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Color  string `json:"color"`
}

func main() {
	width := 1200
	height := 800

	// 创建图片
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// 定义预期的 5 个区域（这是我们期望算法识别出来的）
	expectedRegions := []ExpectedRegion{
		{
			Name:   "sidebar",
			X:      0,
			Y:      0,
			Width:  60,
			Height: 800,
			Color:  "#2E2E2E",
		},
		{
			Name:   "chatList",
			X:      60,
			Y:      0,
			Width:  280,
			Height: 800,
			Color:  "#E0E0E0",
		},
		{
			Name:   "chatHeader",
			X:      340,
			Y:      0,
			Width:  860,
			Height: 60,
			Color:  "#F5F5F5",
		},
		{
			Name:   "chatMessages",
			X:      340,
			Y:      60,
			Width:  860,
			Height: 640,
			Color:  "#FFFFFF",
		},
		{
			Name:   "chatInput",
			X:      340,
			Y:      700,
			Width:  860,
			Height: 100,
			Color:  "#F0F0F0",
		},
	}

	// 绘制每个区域
	for _, region := range expectedRegions {
		c := parseColor(region.Color)
		rect := image.Rect(region.X, region.Y, region.X+region.Width, region.Y+region.Height)
		draw.Draw(img, rect, &image.Uniform{c}, image.Point{}, draw.Src)
	}

	// 保存图片
	outputPath := ".runtime/tests/wechat/ground_truth_simple.png"
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		panic(fmt.Sprintf("无法创建输出目录: %v", err))
	}
	f, err := os.Create(outputPath)
	if err != nil {
		panic(err)
	}
	defer f.Close()

	if err := png.Encode(f, img); err != nil {
		panic(err)
	}

	fmt.Printf("✓ 测试图片已生成: %s\n", outputPath)
	fmt.Printf("  尺寸: %dx%d\n", width, height)
	fmt.Printf("  预期区域数量: %d\n", len(expectedRegions))

	// 保存预期区域数据（ground truth）
	groundTruthPath := ".runtime/tests/wechat/ground_truth_simple.json"
	groundTruth := map[string]interface{}{
		"imageWidth":  width,
		"imageHeight": height,
		"regions":     expectedRegions,
	}

	jsonData, err := json.MarshalIndent(groundTruth, "", "  ")
	if err != nil {
		panic(err)
	}

	if err := os.WriteFile(groundTruthPath, jsonData, 0644); err != nil {
		panic(err)
	}

	fmt.Printf("✓ Ground Truth 已保存: %s\n", groundTruthPath)

	// 打印预期区域
	fmt.Println("\n预期区域（Ground Truth）:")
	for i, region := range expectedRegions {
		fmt.Printf("  %d. %s: (%d, %d, %d, %d) - %s\n",
			i+1, region.Name, region.X, region.Y, region.Width, region.Height, region.Color)
	}
}

func parseColor(hexColor string) color.RGBA {
	var r, g, b uint8
	fmt.Sscanf(hexColor, "#%02x%02x%02x", &r, &g, &b)
	return color.RGBA{r, g, b, 255}
}
