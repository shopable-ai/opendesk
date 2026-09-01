package automation

import (
	"image"
	"image/color"
	"testing"
)

func TestDrawerBasics(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img)

	if d.img != img {
		t.Error("Drawer should reference the provided image")
	}

	if d.style.Thickness != 1 {
		t.Errorf("Default thickness should be 1, got %d", d.style.Thickness)
	}
}

func TestDrawerStyleModifiers(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img)

	red := color.RGBA{255, 0, 0, 255}
	d.WithStroke(red).WithThickness(3)

	if d.style.StrokeColor != red {
		t.Error("Stroke color not set correctly")
	}

	if d.style.Thickness != 3 {
		t.Errorf("Thickness should be 3, got %d", d.style.Thickness)
	}
}

func TestDrawerClone(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d1 := NewDrawer(img).WithThickness(5)
	d2 := d1.Clone()

	if d2.style.Thickness != 5 {
		t.Error("Cloned drawer should have same style")
	}

	d2.WithThickness(10)
	if d1.style.Thickness != 5 {
		t.Error("Modifying clone should not affect original")
	}
}

func TestLine(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	// Horizontal line
	d.Line(10, 50, 90, 50)
	if img.RGBAAt(50, 50).R != 255 {
		t.Error("Horizontal line not drawn correctly")
	}

	// Vertical line
	d.Line(50, 10, 50, 90)
	if img.RGBAAt(50, 50).R != 255 {
		t.Error("Vertical line not drawn correctly")
	}

	// Diagonal line
	d.Line(10, 10, 90, 90)
	if img.RGBAAt(50, 50).R != 255 {
		t.Error("Diagonal line not drawn correctly")
	}
}

func TestHLineVLine(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{0, 255, 0, 255})

	d.HLine(10, 90, 50)
	if img.RGBAAt(50, 50).G != 255 {
		t.Error("HLine not drawn correctly")
	}

	d.VLine(50, 10, 90)
	if img.RGBAAt(50, 50).G != 255 {
		t.Error("VLine not drawn correctly")
	}
}

func TestRect(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Rect(10, 10, 80, 80)

	// Check corners
	if img.RGBAAt(10, 10).R != 255 {
		t.Error("Top-left corner not drawn")
	}
	if img.RGBAAt(89, 10).R != 255 {
		t.Error("Top-right corner not drawn")
	}
	if img.RGBAAt(10, 89).R != 255 {
		t.Error("Bottom-left corner not drawn")
	}
	if img.RGBAAt(89, 89).R != 255 {
		t.Error("Bottom-right corner not drawn")
	}

	// Check center is not filled
	if img.RGBAAt(50, 50).R != 0 {
		t.Error("Rectangle should not be filled")
	}
}

func TestFillRect(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithFill(color.RGBA{0, 0, 255, 255})

	d.FillRect(10, 10, 80, 80)

	// Check center is filled
	if img.RGBAAt(50, 50).B != 255 {
		t.Error("Rectangle should be filled")
	}

	// Check outside is not filled
	if img.RGBAAt(5, 5).B != 0 {
		t.Error("Outside rectangle should not be filled")
	}
}

func TestCircle(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Circle(50, 50, 30)

	// Check points on circle (approximate)
	if img.RGBAAt(80, 50).R != 255 {
		t.Error("Right point of circle not drawn")
	}
	if img.RGBAAt(20, 50).R != 255 {
		t.Error("Left point of circle not drawn")
	}
	if img.RGBAAt(50, 80).R != 255 {
		t.Error("Bottom point of circle not drawn")
	}
	if img.RGBAAt(50, 20).R != 255 {
		t.Error("Top point of circle not drawn")
	}
}

func TestFillCircle(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithFill(color.RGBA{0, 255, 0, 255})

	d.FillCircle(50, 50, 30)

	// Check center is filled
	if img.RGBAAt(50, 50).G != 255 {
		t.Error("Circle center should be filled")
	}

	// Check outside is not filled
	if img.RGBAAt(10, 10).G != 0 {
		t.Error("Outside circle should not be filled")
	}
}

func TestText(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 200, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{0, 0, 0, 255})

	d.Text(10, 50, "Test")

	// Check that some pixels are drawn (text rendering is complex, just verify non-empty)
	hasPixels := false
	for y := 40; y < 60; y++ {
		for x := 10; x < 50; x++ {
			if img.RGBAAt(x, y).A > 0 {
				hasPixels = true
				break
			}
		}
	}

	if !hasPixels {
		t.Error("Text should draw some pixels")
	}
}

func TestTextWithBackground(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 200, 100))
	d := NewDrawer(img)

	textColor := color.RGBA{0, 0, 0, 255}
	bgColor := color.RGBA{255, 255, 255, 255}

	d.TextWithBackground(10, 50, "Test", textColor, bgColor)

	// Check background is drawn
	if img.RGBAAt(12, 45).R != 255 {
		t.Error("Background should be white")
	}
}

func TestPoint(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Point(50, 50)

	if img.RGBAAt(50, 50).R != 255 {
		t.Error("Point not drawn")
	}
}

func TestBoundsClipping(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	// Draw line outside bounds - should not panic
	d.Line(-10, 50, 110, 50)

	// Draw rect partially outside
	d.Rect(90, 90, 20, 20)

	// Should complete without panic
}

func TestThickness(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255}).WithThickness(3)

	d.Line(50, 10, 50, 90)

	// Check that line is thick (pixels around center line)
	if img.RGBAAt(49, 50).R != 255 || img.RGBAAt(51, 50).R != 255 {
		t.Error("Line should be thick")
	}
}

func TestDashedLine(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.DashedLine(10, 50, 90, 50, []int{5, 3})

	// Check that some pixels are drawn and some are not (dashed pattern)
	// Pattern: 5 pixels on, 3 pixels off
	// Starting at x=10: [10-14] on, [15-17] off, [18-22] on, [23-25] off...
	drawn := img.RGBAAt(12, 50).R == 255  // Should be in first dash
	notDrawn := img.RGBAAt(16, 50).R == 0 // Should be in first gap

	if !drawn {
		t.Error("Dashed line should have drawn segments")
	}
	if !notDrawn {
		t.Error("Dashed line should have gaps")
	}
}

func TestArrow(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Arrow(10, 50, 90, 50, 10)

	// Check main line
	if img.RGBAAt(50, 50).R != 255 {
		t.Error("Arrow line not drawn")
	}

	// Check arrowhead (approximate)
	if img.RGBAAt(90, 50).R != 255 {
		t.Error("Arrow tip not drawn")
	}
}

func TestPolygon(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	points := [][2]int{
		{50, 10},
		{90, 90},
		{10, 90},
	}

	d.Polygon(points, false)

	// Check that edges are drawn
	if img.RGBAAt(50, 10).R != 255 {
		t.Error("Polygon vertex not drawn")
	}
}

func TestGrid(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{200, 200, 200, 255})

	d.Grid(10)

	// Check grid lines
	if img.RGBAAt(10, 50).R != 200 {
		t.Error("Vertical grid line not drawn")
	}
	if img.RGBAAt(50, 10).R != 200 {
		t.Error("Horizontal grid line not drawn")
	}
}

func TestAnnotation(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 200, 200))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Annotation(10, 10, 100, 50, "Test Region")

	// Check rectangle is drawn
	if img.RGBAAt(10, 10).R != 255 {
		t.Error("Annotation rectangle not drawn")
	}

	// Check label background exists (white pixels near label position)
	hasBackground := false
	for x := 12; x < 30; x++ {
		if img.RGBAAt(x, 20).R == 255 && img.RGBAAt(x, 20).G == 255 {
			hasBackground = true
			break
		}
	}
	if !hasBackground {
		t.Error("Annotation label background not drawn")
	}
}

func TestSeparator(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 200, 200))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.Separator("horizontal", 50, 0.95, true)
	d.Separator("vertical", 100, 0.85, true)

	// Check lines are drawn
	if img.RGBAAt(100, 50).R != 255 {
		t.Error("Horizontal separator not drawn")
	}
	if img.RGBAAt(100, 100).R != 255 {
		t.Error("Vertical separator not drawn")
	}
}

func TestLegend(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 300, 300))
	d := NewDrawer(img)

	items := []LegendItem{
		{Color: color.RGBA{255, 0, 0, 255}, Label: "Red Item"},
		{Color: color.RGBA{0, 255, 0, 255}, Label: "Green Item"},
		{Color: color.RGBA{0, 0, 255, 255}, Label: "Blue Item"},
	}

	d.Legend(10, 10, items)

	// Check background is drawn (white with alpha 230)
	bgColor := img.RGBAAt(50, 50)
	if bgColor.R < 200 || bgColor.G < 200 || bgColor.B < 200 {
		t.Errorf("Legend background not drawn correctly, got R=%d G=%d B=%d", bgColor.R, bgColor.G, bgColor.B)
	}

	// Check color boxes - first item at y=30 (10 + 20), box from (20,30) to (30,40)
	// (20,30) is the border (black), so check (21,31) which is inside the box
	boxColor := img.RGBAAt(21, 31)
	if boxColor.R < 200 {
		t.Errorf("First legend color box not drawn, got R=%d G=%d B=%d at (21,31)", boxColor.R, boxColor.G, boxColor.B)
	}
}

func TestCrossHair(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.CrossHair(50, 50, 10)

	// Check horizontal line
	if img.RGBAAt(40, 50).R != 255 || img.RGBAAt(60, 50).R != 255 {
		t.Error("CrossHair horizontal line not drawn")
	}

	// Check vertical line
	if img.RGBAAt(50, 40).R != 255 || img.RGBAAt(50, 60).R != 255 {
		t.Error("CrossHair vertical line not drawn")
	}
}

func TestRoundedRect(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	d.RoundedRect(10, 10, 80, 80, 10)

	// Check straight edges
	if img.RGBAAt(50, 10).R != 255 {
		t.Error("Top edge not drawn")
	}

	// Check corners are rounded (approximate - corner pixel should not be drawn)
	if img.RGBAAt(10, 10).R == 255 {
		t.Error("Corner should be rounded, not sharp")
	}
}

func TestFluentAPI(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 100, 100))

	// Test method chaining
	NewDrawer(img).
		WithStroke(color.RGBA{255, 0, 0, 255}).
		WithThickness(2).
		Line(10, 10, 90, 90).
		WithStroke(color.RGBA{0, 255, 0, 255}).
		Circle(50, 50, 20).
		WithFill(color.RGBA{0, 0, 255, 255}).
		FillRect(20, 20, 30, 30)

	// Verify multiple operations completed
	if img.RGBAAt(50, 50).R != 255 {
		t.Error("First operation (line) not completed")
	}
	if img.RGBAAt(30, 30).B != 255 {
		t.Error("Last operation (fill rect) not completed")
	}
}

func BenchmarkLine(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 1000, 1000))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Line(0, 0, 999, 999)
	}
}

func BenchmarkRect(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 1000, 1000))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Rect(100, 100, 800, 800)
	}
}

func BenchmarkFillRect(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 1000, 1000))
	d := NewDrawer(img).WithFill(color.RGBA{255, 0, 0, 255})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.FillRect(100, 100, 800, 800)
	}
}

func BenchmarkCircle(b *testing.B) {
	img := image.NewRGBA(image.Rect(0, 0, 1000, 1000))
	d := NewDrawer(img).WithStroke(color.RGBA{255, 0, 0, 255})

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Circle(500, 500, 200)
	}
}
