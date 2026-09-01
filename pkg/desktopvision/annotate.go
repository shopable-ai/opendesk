package desktopvision

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
)

var annotationPalette = []color.RGBA{
	{R: 255, G: 99, B: 71, A: 255},
	{R: 30, G: 144, B: 255, A: 255},
	{R: 60, G: 179, B: 113, A: 255},
	{R: 255, G: 215, B: 0, A: 255},
	{R: 186, G: 85, B: 211, A: 255},
}

func AnnotateImage(src image.Image, perception Perception) (*image.RGBA, error) {
	if src == nil {
		return nil, fmt.Errorf("source image is required")
	}
	bounds := src.Bounds()
	canvas := image.NewRGBA(bounds)
	draw.Draw(canvas, bounds, src, bounds.Min, draw.Src)

	for index, element := range perception.Elements {
		resolved, err := ResolveElementCoordinates(element, TransformContext{
			Image:   perception.Image,
			Window:  perception.Window,
			Display: perception.Display,
		})
		if err != nil {
			return nil, err
		}
		clr := annotationPalette[index%len(annotationPalette)]
		drawBBox(canvas, resolved.BBoxPx, clr)
		drawCenter(canvas, resolved.CenterScreen, perception.Window, clr)
	}
	return canvas, nil
}

func WriteAnnotatedPNG(imagePath string, perception Perception, outputPath string) error {
	if imagePath == "" {
		return fmt.Errorf("image path is required")
	}
	if outputPath == "" {
		return fmt.Errorf("output path is required")
	}
	file, err := os.Open(imagePath)
	if err != nil {
		return fmt.Errorf("open source image: %w", err)
	}
	defer file.Close()

	src, _, err := image.Decode(file)
	if err != nil {
		return fmt.Errorf("decode source image: %w", err)
	}

	annotated, err := AnnotateImage(src, perception)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return fmt.Errorf("create annotate dir: %w", err)
	}
	out, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create annotate output: %w", err)
	}
	defer out.Close()
	if err := png.Encode(out, annotated); err != nil {
		return fmt.Errorf("encode annotate output: %w", err)
	}
	return nil
}

func drawBBox(img *image.RGBA, bbox PixelBBox, clr color.RGBA) {
	if img == nil {
		return
	}
	minX := clampInt(bbox[0], 0, img.Bounds().Dx()-1)
	minY := clampInt(bbox[1], 0, img.Bounds().Dy()-1)
	maxX := clampInt(bbox[2]-1, 0, img.Bounds().Dx()-1)
	maxY := clampInt(bbox[3]-1, 0, img.Bounds().Dy()-1)
	for x := minX; x <= maxX; x++ {
		img.SetRGBA(x, minY, clr)
		img.SetRGBA(x, maxY, clr)
	}
	for y := minY; y <= maxY; y++ {
		img.SetRGBA(minX, y, clr)
		img.SetRGBA(maxX, y, clr)
	}
}

func drawCenter(img *image.RGBA, point ScreenPoint, window Window, clr color.RGBA) {
	if img == nil {
		return
	}
	windowX := int(point[0] - window.BoundsScreen[0])
	windowY := int(point[1] - window.BoundsScreen[1])
	x := clampInt(windowX, 0, img.Bounds().Dx()-1)
	y := clampInt(windowY, 0, img.Bounds().Dy()-1)
	for delta := -2; delta <= 2; delta++ {
		img.SetRGBA(clampInt(x+delta, 0, img.Bounds().Dx()-1), y, clr)
		img.SetRGBA(x, clampInt(y+delta, 0, img.Bounds().Dy()-1), clr)
	}
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
