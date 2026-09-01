package desktopvision

import (
	"fmt"
	"math"
)

func ResolveElementCoordinates(element Element, ctx TransformContext) (Element, error) {
	pixelBBox, err := NormToPixelBBox(element.BBoxNorm, ctx.Image.Size)
	if err != nil {
		return Element{}, err
	}

	windowBBox, err := PixelToWindowBBox(pixelBBox, ctx.Image.Size, ctx.Window)
	if err != nil {
		return Element{}, err
	}

	centerWindow := CenterOfWindowBBox(windowBBox)
	centerScreen := WindowToScreenPoint(centerWindow, ctx.Window)

	element.BBoxPx = pixelBBox
	element.BBoxWindow = windowBBox
	element.CenterWindow = centerWindow
	element.CenterScreen = centerScreen
	return element, nil
}

func NormToPixelBBox(bbox NormalizedBBox, size ImageSize) (PixelBBox, error) {
	if err := bbox.Validate(); err != nil {
		return PixelBBox{}, err
	}
	if size.Width <= 0 || size.Height <= 0 {
		return PixelBBox{}, fmt.Errorf("image size must be positive")
	}

	return PixelBBox{
		int(math.Round(bbox[0] * float64(size.Width))),
		int(math.Round(bbox[1] * float64(size.Height))),
		int(math.Round(bbox[2] * float64(size.Width))),
		int(math.Round(bbox[3] * float64(size.Height))),
	}, nil
}

func PixelToWindowBBox(bbox PixelBBox, size ImageSize, window Window) (WindowBBox, error) {
	windowWidth := window.BoundsScreen.Width()
	windowHeight := window.BoundsScreen.Height()
	if size.Width <= 0 || size.Height <= 0 || windowWidth <= 0 || windowHeight <= 0 {
		return WindowBBox{}, fmt.Errorf("image and window dimensions must be positive")
	}

	scaleX := windowWidth / float64(size.Width)
	scaleY := windowHeight / float64(size.Height)
	return WindowBBox{
		float64(bbox[0]) * scaleX,
		float64(bbox[1]) * scaleY,
		float64(bbox[2]) * scaleX,
		float64(bbox[3]) * scaleY,
	}, nil
}

func WindowToScreenPoint(point WindowPoint, window Window) ScreenPoint {
	return ScreenPoint{
		window.BoundsScreen[0] + point[0],
		window.BoundsScreen[1] + point[1],
	}
}

func CenterOfWindowBBox(bbox WindowBBox) WindowPoint {
	return WindowPoint{
		(bbox[0] + bbox[2]) / 2,
		(bbox[1] + bbox[3]) / 2,
	}
}

func (bbox NormalizedBBox) Validate() error {
	if bbox[0] < 0 || bbox[1] < 0 || bbox[2] > 1 || bbox[3] > 1 {
		return fmt.Errorf("normalized bbox must stay within [0,1]")
	}
	if bbox[0] >= bbox[2] || bbox[1] >= bbox[3] {
		return fmt.Errorf("normalized bbox must have positive area")
	}
	return nil
}

func (bbox ScreenBBox) Width() float64 {
	return bbox[2] - bbox[0]
}

func (bbox ScreenBBox) Height() float64 {
	return bbox[3] - bbox[1]
}

func (bbox WindowBBox) Contains(point ScreenPoint, window Window) bool {
	screenBBox := ScreenBBox{
		window.BoundsScreen[0] + bbox[0],
		window.BoundsScreen[1] + bbox[1],
		window.BoundsScreen[0] + bbox[2],
		window.BoundsScreen[1] + bbox[3],
	}
	return screenBBox.Contains(point)
}

func (bbox ScreenBBox) Contains(point ScreenPoint) bool {
	return point[0] >= bbox[0] && point[0] <= bbox[2] && point[1] >= bbox[1] && point[1] <= bbox[3]
}
