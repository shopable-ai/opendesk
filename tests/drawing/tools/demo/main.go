package main

import (
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"

	"opendesk/automation"
)

func main() {
	// Create a canvas.
	img := image.NewRGBA(image.Rect(0, 0, 800, 600))
	d := automation.NewDrawer(img)
	d.WithFill(color.RGBA{240, 240, 240, 255}).FillRect(0, 0, 800, 600)

	// Draw the visible primitives in the order described in the README.
	d.WithStroke(color.RGBA{0, 0, 0, 255}).Text(20, 40, "Drawing System Demo - opendesk")
	d.WithStroke(color.RGBA{255, 0, 0, 255}).WithThickness(2).Rect(50, 80, 200, 150)
	d.WithFill(color.RGBA{0, 255, 0, 128}).FillRect(300, 80, 200, 150)
	d.WithStroke(color.RGBA{0, 0, 255, 255}).WithThickness(3).Circle(650, 155, 75)
	d.WithStroke(color.RGBA{255, 128, 0, 255}).WithThickness(2).Line(50, 280, 750, 280)
	d.DashedLine(50, 320, 750, 320, []int{10, 5})
	d.WithStroke(color.RGBA{128, 0, 128, 255}).WithThickness(2).Arrow(50, 360, 300, 360, 15)

	triangle := [][2]int{{400, 280}, {500, 380}, {300, 380}}
	d.WithStroke(color.RGBA{255, 0, 255, 255}).WithThickness(2).Polygon(triangle, false)
	pentagon := [][2]int{{650, 280}, {720, 310}, {690, 380}, {610, 380}, {580, 310}}
	d.WithFill(color.RGBA{255, 200, 0, 200}).Polygon(pentagon, true)
	d.WithStroke(color.RGBA{0, 128, 255, 255}).WithFill(color.RGBA{255, 255, 255, 220}).Annotation(50, 420, 200, 80, "Annotation Box")
	d.WithStroke(color.RGBA{255, 0, 0, 255}).CrossHair(400, 480, 20)
	d.WithStroke(color.RGBA{0, 128, 0, 255}).WithThickness(2).RoundedRect(500, 420, 250, 80, 15)
	d.Legend(50, 520, []automation.LegendItem{
		{Color: color.RGBA{255, 0, 0, 255}, Label: "Red - Rectangles"},
		{Color: color.RGBA{0, 255, 0, 255}, Label: "Green - Filled"},
		{Color: color.RGBA{0, 0, 255, 255}, Label: "Blue - Circles"},
		{Color: color.RGBA{255, 128, 0, 255}, Label: "Orange - Lines"},
	})

	outputDir := filepath.Join(".runtime", "tests", "drawing", "demo")
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		panic(fmt.Errorf("create output directory: %w", err))
	}
	outputPath := filepath.Join(outputDir, "drawing_demo.png")
	file, err := os.Create(outputPath)
	if err != nil {
		panic(fmt.Errorf("create image: %w", err))
	}
	defer file.Close()
	if err := png.Encode(file, img); err != nil {
		panic(fmt.Errorf("encode image: %w", err))
	}

	fmt.Printf("Drawing demo completed: %s\n", outputPath)
}
