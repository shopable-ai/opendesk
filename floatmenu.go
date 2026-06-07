//go:build floatmenu_legacy
// +build floatmenu_legacy

package main

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// 自定义主题
type myTheme struct {
	fyne.Theme
}

func (m myTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	if name == theme.ColorNameBackground {
		return color.NRGBA{R: 40, G: 40, B: 40, A: 255}
	}
	if name == theme.ColorNameButton {
		return color.NRGBA{R: 231, G: 76, B: 60, A: 255} // 红色按钮
	}
	return theme.DefaultTheme().Color(name, variant)
}

func main() {
	myApp := app.New()
	myApp.Settings().SetTheme(&myTheme{theme.DefaultTheme()})

	window := myApp.NewWindow("录屏工具")
	window.Resize(fyne.NewSize(500, 80))
	window.SetFixedSize(true)

	// 创建按钮样式
	buttonStyle := &widget.Button{
		Importance: widget.HighImportance,
	}

	// 开始录制按钮
	startBtn := widget.NewButtonWithIcon("", theme.MediaRecordIcon(), func() {})
	startBtn.Importance = buttonStyle.Importance
	startBtn.Resize(fyne.NewSize(50, 50))

	// 区域选择按钮
	areaBtn := widget.NewButtonWithIcon("", theme.ViewFullScreenIcon(), func() {})
	areaBtn.Importance = buttonStyle.Importance
	areaBtn.Resize(fyne.NewSize(50, 50))

	// 摄像头按钮
	cameraBtn := widget.NewButtonWithIcon("", theme.MediaVideoIcon(), func() {})
	cameraBtn.Importance = buttonStyle.Importance
	cameraBtn.Resize(fyne.NewSize(50, 50))

	// 系统声音按钮
	audioBtn := widget.NewButtonWithIcon("", theme.VolumeUpIcon(), func() {})
	audioBtn.Importance = buttonStyle.Importance
	audioBtn.Resize(fyne.NewSize(50, 50))

	// 创建工具提示
	startBtn.SetTooltip("开始录制")
	areaBtn.SetTooltip("选择区域")
	cameraBtn.SetTooltip("开启摄像头")
	audioBtn.SetTooltip("系统声音")

	// 创建按钮容器
	buttons := container.NewHBox(
		container.NewPadded(startBtn),
		container.NewPadded(areaBtn),
		container.NewPadded(cameraBtn),
		container.NewPadded(audioBtn),
	)

	// 添加背景
	bg := canvas.NewRectangle(color.NRGBA{R: 40, G: 40, B: 40, A: 230})

	// 主容器
	content := container.NewMax(
		bg,
		container.NewPadded(buttons),
	)

	window.SetContent(content)
	window.SetTitle("") // 隐藏标题栏
	window.CenterOnScreen()

	// 设置窗口属性
	window.SetOnTop(true) // 保持窗口在最顶层

	// 添加拖动支持
	var startPos fyne.Position
	var dragging bool

	window.Canvas().SetOnMouseDown(func(ev *fyne.PointEvent) {
		startPos = ev.Position
		dragging = true
	})

	window.Canvas().SetOnMouseUp(func(ev *fyne.PointEvent) {
		dragging = false
	})

	window.Canvas().SetOnMouseMoved(func(ev *fyne.PointEvent) {
		if !dragging {
			return
		}

		currentPos := window.Position()
		deltaX := ev.Position.X - startPos.X
		deltaY := ev.Position.Y - startPos.Y

		window.Move(fyne.NewPos(
			currentPos.X+int(deltaX),
			currentPos.Y+int(deltaY),
		))
	})

	window.ShowAndRun()
}
