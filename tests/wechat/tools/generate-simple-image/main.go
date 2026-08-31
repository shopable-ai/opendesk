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

// 简化的微信界面布局定义
type SimpleLayout struct {
	Width   int      `json:"width"`
	Height  int      `json:"height"`
	Regions []Region `json:"regions"`
}

type Region struct {
	Name   string `json:"name"`
	Label  string `json:"label"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Color  string `json:"color"`
}

func main() {
	outputDir := filepath.Join(".runtime", "tests", "wechat")
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		panic(fmt.Sprintf("无法创建输出目录: %v", err))
	}

	// 定义标准布局
	layout := SimpleLayout{
		Width:  1200,
		Height: 800,
		Regions: []Region{
			{
				Name:   "sidebar",
				Label:  "侧边栏",
				X:      0,
				Y:      0,
				Width:  60,
				Height: 800,
				Color:  "#2E2E2E", // 深灰色
			},
			{
				Name:   "chatList",
				Label:  "聊天列表",
				X:      60,
				Y:      0,
				Width:  280,
				Height: 800,
				Color:  "#E0E0E0", // 中灰色
			},
			{
				Name:   "chatHeader",
				Label:  "聊天头部",
				X:      340,
				Y:      0,
				Width:  860,
				Height: 60,
				Color:  "#F5F5F5", // 浅灰色
			},
			{
				Name:   "chatMessages",
				Label:  "消息区域",
				X:      340,
				Y:      60,
				Width:  860,
				Height: 640,
				Color:  "#FFFFFF", // 白色
			},
			{
				Name:   "chatInput",
				Label:  "输入区域",
				X:      340,
				Y:      700,
				Width:  860,
				Height: 100,
				Color:  "#F0F0F0", // 浅灰色
			},
		},
	}

	// 保存布局定义为 JSON
	layoutJSON, _ := json.MarshalIndent(layout, "", "  ")
	if err := os.WriteFile(filepath.Join(outputDir, "simple_layout.json"), layoutJSON, 0644); err != nil {
		panic(fmt.Sprintf("无法写入布局文件: %v", err))
	}

	// 创建画布
	img := image.NewRGBA(image.Rect(0, 0, layout.Width, layout.Height))

	// 绘制白色背景
	draw.Draw(img, img.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)

	// 绘制各个区域（纯色矩形，无任何细节）
	for _, region := range layout.Regions {
		col := parseColor(region.Color)
		drawRect(img, region.X, region.Y, region.Width, region.Height, col)
	}

	// 保存图片
	outputPath := filepath.Join(outputDir, "simple_wechat.png")
	file, err := os.Create(outputPath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	if err := png.Encode(file, img); err != nil {
		panic(err)
	}

	fmt.Println("✅ 简化微信界面已生成:", outputPath)
	fmt.Println("✅ 布局定义已保存: .runtime/tests/wechat/simple_layout.json")
	fmt.Println("\n标准布局定义:")
	fmt.Println("================================================================================")
	for _, region := range layout.Regions {
		fmt.Printf("  [%s] %s\n", region.Name, region.Label)
		fmt.Printf("    位置: (%d, %d)\n", region.X, region.Y)
		fmt.Printf("    尺寸: %dx%d\n", region.Width, region.Height)
		fmt.Printf("    颜色: %s\n", region.Color)
		fmt.Println()
	}

	fmt.Println("关键分隔线:")
	fmt.Println("  垂直分隔线:")
	fmt.Println("    x=60  (侧边栏 | 聊天列表)")
	fmt.Println("    x=340 (聊天列表 | 聊天内容)")
	fmt.Println("  水平分隔线:")
	fmt.Println("    y=60  (聊天头部 | 消息区域)")
	fmt.Println("    y=700 (消息区域 | 输入区域)")
}

func drawRect(img *image.RGBA, x, y, width, height int, col color.Color) {
	for dy := 0; dy < height; dy++ {
		for dx := 0; dx < width; dx++ {
			img.Set(x+dx, y+dy, col)
		}
	}
}

func parseColor(hex string) color.Color {
	var r, g, b uint8
	fmt.Sscanf(hex, "#%02x%02x%02x", &r, &g, &b)
	return color.RGBA{r, g, b, 255}
}
