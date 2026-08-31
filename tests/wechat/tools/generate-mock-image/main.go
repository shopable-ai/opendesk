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

// 微信界面的标准布局定义
type MockLayout struct {
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

// 颜色定义
var (
	ColorSidebar      = color.RGBA{46, 46, 46, 255}    // 深灰色
	ColorChatList     = color.RGBA{245, 245, 245, 255} // 浅灰色
	ColorChatSelected = color.RGBA{199, 199, 199, 255} // 选中状态
	ColorContent      = color.RGBA{255, 255, 255, 255} // 白色
	ColorHeader       = color.RGBA{245, 245, 245, 255} // 浅灰色
	ColorInput        = color.RGBA{245, 245, 245, 255} // 浅灰色
	ColorBorder       = color.RGBA{224, 224, 224, 255} // 边框（主要分隔线）
	ColorBorderLight  = color.RGBA{240, 240, 240, 255} // 浅边框（聊天项分隔线）
	ColorText         = color.RGBA{0, 0, 0, 255}       // 黑色文字
	ColorTextGray     = color.RGBA{102, 102, 102, 255} // 灰色文字
	ColorTextLight    = color.RGBA{153, 153, 153, 255} // 浅灰色文字
	ColorAvatar1      = color.RGBA{74, 144, 226, 255}  // 蓝色头像
	ColorAvatar2      = color.RGBA{124, 179, 66, 255}  // 绿色头像
	ColorMsgSelf      = color.RGBA{149, 236, 105, 255} // 自己的消息气泡
	ColorMsgOther     = color.RGBA{255, 255, 255, 255} // 对方的消息气泡
)

func main() {
	outputDir := filepath.Join(".runtime", "tests", "wechat")
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		panic(fmt.Sprintf("无法创建输出目录: %v", err))
	}

	// 定义标准布局
	layout := MockLayout{
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
				Color:  "#2E2E2E",
			},
			{
				Name:   "chatList",
				Label:  "聊天列表",
				X:      60,
				Y:      0,
				Width:  280,
				Height: 800,
				Color:  "#F5F5F5",
			},
			{
				Name:   "chatHeader",
				Label:  "聊天头部",
				X:      340,
				Y:      0,
				Width:  860,
				Height: 60,
				Color:  "#F5F5F5",
			},
			{
				Name:   "chatMessages",
				Label:  "消息区域",
				X:      340,
				Y:      60,
				Width:  860,
				Height: 640,
				Color:  "#F9F9F9",
			},
			{
				Name:   "chatInput",
				Label:  "输入区域",
				X:      340,
				Y:      700,
				Width:  860,
				Height: 100,
				Color:  "#F5F5F5",
			},
		},
	}

	// 保存布局定义为 JSON
	layoutJSON, _ := json.MarshalIndent(layout, "", "  ")
	if err := os.WriteFile(filepath.Join(outputDir, "mock_layout.json"), layoutJSON, 0644); err != nil {
		panic(fmt.Sprintf("无法写入布局文件: %v", err))
	}

	// 创建画布
	img := image.NewRGBA(image.Rect(0, 0, layout.Width, layout.Height))

	// 绘制白色背景
	draw.Draw(img, img.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)

	// 绘制各个区域
	drawSidebar(img)
	drawChatList(img)
	drawChatContent(img)

	// 保存图片
	outputPath := filepath.Join(outputDir, "mock_wechat.png")
	file, err := os.Create(outputPath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	if err := png.Encode(file, img); err != nil {
		panic(err)
	}

	fmt.Println("✅ 模拟微信界面已生成:", outputPath)
	fmt.Println("✅ 布局定义已保存: .runtime/tests/wechat/mock_layout.json")
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

func drawSidebar(img *image.RGBA) {
	// 绘制侧边栏背景
	drawRect(img, 0, 0, 60, 800, ColorSidebar)

	// 绘制图标
	icons := []struct {
		y     int
		label string
	}{
		{20, "Chat"},
		{80, "Contact"},
		{140, "Favorite"},
		{200, "Files"},
	}

	for _, icon := range icons {
		drawRect(img, 10, icon.y, 40, 40, color.RGBA{80, 80, 80, 255})
		drawText(img, 15, icon.y+25, icon.label, color.White)
	}

	// 绘制右侧分隔线
	drawVerticalLine(img, 60, ColorBorder)
}

func drawChatList(img *image.RGBA) {
	x := 60

	// 绘制聊天列表背景
	drawRect(img, x, 0, 280, 800, ColorChatList)

	// 绘制搜索框
	drawRect(img, x+10, 10, 260, 40, color.White)
	drawRectBorder(img, x+10, 10, 260, 40, ColorBorder)
	drawText(img, x+20, 35, "Search", ColorTextLight)

	// 绘制聊天项
	chats := []struct {
		y       int
		name    string
		message string
		time    string
	}{
		{60, "Zhang San", "Hello, are you there?", "14:30"},
		{140, "Li Si", "See you tomorrow", "Yesterday"},
		{220, "Wang Wu", "Received", "Monday"},
		{300, "Zhao Liu", "OK", "12/25"},
		{380, "Work Group", "Meeting notice", "14:00"},
	}

	for _, chat := range chats {
		// 统一背景色，不区分选中状态
		drawRect(img, x+10, chat.y+10, 50, 50, ColorAvatar1)
		drawText(img, x+70, chat.y+25, chat.name, ColorText)
		drawText(img, x+70, chat.y+50, chat.message, ColorTextGray)
		drawText(img, x+220, chat.y+25, chat.time, ColorTextLight)
	}

	// 绘制右侧分隔线
	drawVerticalLine(img, 340, ColorBorder)
}

func drawChatContent(img *image.RGBA) {
	x := 340

	// 1. 绘制头部
	drawRect(img, x, 0, 860, 60, ColorHeader)
	drawText(img, x+20, 35, "Zhang San", ColorText)
	drawHorizontalLine(img, 60, x, 1200, ColorBorder)

	// 2. 绘制消息区域
	drawRect(img, x, 60, 860, 640, color.RGBA{249, 249, 249, 255})

	// 对方消息
	drawRect(img, x+20, 80, 300, 60, ColorMsgOther)
	drawRectBorder(img, x+20, 80, 300, 60, ColorBorder)
	drawText(img, x+30, 110, "Hello, are you there?", ColorText)

	// 自己的消息
	drawRect(img, x+540, 160, 300, 60, ColorMsgSelf)
	drawText(img, x+550, 190, "Yes, what's up?", ColorText)

	// 对方消息
	drawRect(img, x+20, 240, 350, 80, ColorMsgOther)
	drawRectBorder(img, x+20, 240, 350, 80, ColorBorder)
	drawText(img, x+30, 270, "Meeting at 3pm tomorrow,", ColorText)
	drawText(img, x+30, 295, "please be on time.", ColorText)

	// 3. 绘制输入区域
	drawRect(img, x, 700, 860, 100, ColorInput)
	drawHorizontalLine(img, 700, x, 1200, ColorBorder)

	// 绘制输入框
	drawRect(img, x+20, 720, 820, 60, color.White)
	drawRectBorder(img, x+20, 720, 820, 60, ColorBorder)
}

func drawRect(img *image.RGBA, x, y, width, height int, col color.Color) {
	for dy := 0; dy < height; dy++ {
		for dx := 0; dx < width; dx++ {
			img.Set(x+dx, y+dy, col)
		}
	}
}

func drawRectBorder(img *image.RGBA, x, y, width, height int, col color.Color) {
	for dx := 0; dx < width; dx++ {
		img.Set(x+dx, y, col)
		img.Set(x+dx, y+height-1, col)
	}
	for dy := 0; dy < height; dy++ {
		img.Set(x, y+dy, col)
		img.Set(x+width-1, y+dy, col)
	}
}

func drawVerticalLine(img *image.RGBA, x int, col color.Color) {
	for y := 0; y < 800; y++ {
		img.Set(x, y, col)
	}
}

func drawHorizontalLine(img *image.RGBA, y, x1, x2 int, col color.Color) {
	for x := x1; x < x2; x++ {
		img.Set(x, y, col)
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
