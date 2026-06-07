package automation

import (
	"image"
	"image/color"
	"image/draw"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// Drawer provides a unified interface for drawing primitives on images.
// It maintains drawing state (colors, thickness, font) and provides
// a fluent API for composing complex drawings.
//
// Coordinate system: (0,0) is top-left corner, X increases right, Y increases down.
// All drawing operations are clipped to image bounds automatically.
type Drawer struct {
	img   *image.RGBA
	style Style
}

// Style defines the visual appearance of drawn elements.
type Style struct {
	StrokeColor color.Color // Color for lines and outlines
	FillColor   color.Color // Color for filled shapes
	Thickness   int         // Line thickness in pixels (default: 1)
	Font        font.Face   // Font for text rendering (default: basicfont.Face7x13)
}

// DefaultStyle returns a sensible default style.
func DefaultStyle() Style {
	return Style{
		StrokeColor: color.RGBA{0, 0, 0, 255},
		FillColor:   color.RGBA{255, 255, 255, 255},
		Thickness:   1,
		Font:        basicfont.Face7x13,
	}
}

// NewDrawer creates a new Drawer for the given image with default style.
func NewDrawer(img *image.RGBA) *Drawer {
	return &Drawer{
		img:   img,
		style: DefaultStyle(),
	}
}

// NewDrawerWithStyle creates a new Drawer with custom style.
func NewDrawerWithStyle(img *image.RGBA, style Style) *Drawer {
	if style.Font == nil {
		style.Font = basicfont.Face7x13
	}
	if style.Thickness <= 0 {
		style.Thickness = 1
	}
	return &Drawer{
		img:   img,
		style: style,
	}
}

// Clone creates a copy of the drawer with the same style but potentially different image.
func (d *Drawer) Clone() *Drawer {
	return &Drawer{
		img:   d.img,
		style: d.style,
	}
}

// DrawTo changes the target image while keeping the style.
func (d *Drawer) DrawTo(img *image.RGBA) *Drawer {
	d.img = img
	return d
}

// Style Modifiers - these mutate the drawer's style

// WithStroke sets the stroke color.
func (d *Drawer) WithStroke(c color.Color) *Drawer {
	d.style.StrokeColor = c
	return d
}

// WithFill sets the fill color.
func (d *Drawer) WithFill(c color.Color) *Drawer {
	d.style.FillColor = c
	return d
}

// WithThickness sets the line thickness.
func (d *Drawer) WithThickness(t int) *Drawer {
	if t > 0 {
		d.style.Thickness = t
	}
	return d
}

// WithFont sets the font for text rendering.
func (d *Drawer) WithFont(f font.Face) *Drawer {
	if f != nil {
		d.style.Font = f
	}
	return d
}

// GetStyle returns a copy of the current style.
func (d *Drawer) GetStyle() Style {
	return d.style
}

// Bounds returns the image bounds.
func (d *Drawer) Bounds() image.Rectangle {
	return d.img.Bounds()
}

// Core Drawing Primitives

// Line draws a line from (x1,y1) to (x2,y2) using stroke color and thickness.
func (d *Drawer) Line(x1, y1, x2, y2 int) *Drawer {
	d.drawLine(x1, y1, x2, y2, d.style.StrokeColor, d.style.Thickness)
	return d
}

// HLine draws a horizontal line from (x1,y) to (x2,y).
func (d *Drawer) HLine(x1, x2, y int) *Drawer {
	return d.Line(x1, y, x2, y)
}

// VLine draws a vertical line from (x,y1) to (x,y2).
func (d *Drawer) VLine(x, y1, y2 int) *Drawer {
	return d.Line(x, y1, x, y2)
}

// Rect draws a rectangle outline at (x,y) with given width and height.
func (d *Drawer) Rect(x, y, width, height int) *Drawer {
	d.drawRect(x, y, width, height, d.style.StrokeColor, d.style.Thickness, false)
	return d
}

// FillRect draws a filled rectangle at (x,y) with given width and height.
func (d *Drawer) FillRect(x, y, width, height int) *Drawer {
	d.drawRect(x, y, width, height, d.style.FillColor, 0, true)
	return d
}

// Circle draws a circle outline centered at (x,y) with given radius.
func (d *Drawer) Circle(x, y, radius int) *Drawer {
	d.drawCircle(x, y, radius, d.style.StrokeColor, d.style.Thickness, false)
	return d
}

// FillCircle draws a filled circle centered at (x,y) with given radius.
func (d *Drawer) FillCircle(x, y, radius int) *Drawer {
	d.drawCircle(x, y, radius, d.style.FillColor, 0, true)
	return d
}

// Text draws text at position (x,y) where y is the baseline.
// Returns the width of the drawn text in pixels.
func (d *Drawer) Text(x, y int, text string) *Drawer {
	d.drawText(x, y, text, d.style.StrokeColor)
	return d
}

// TextWithBackground draws text with a background box.
func (d *Drawer) TextWithBackground(x, y int, text string, textColor, bgColor color.Color) *Drawer {
	d.drawTextWithBackground(x, y, text, textColor, bgColor)
	return d
}

// Point draws a single point at (x,y).
func (d *Drawer) Point(x, y int) *Drawer {
	if d.inBounds(x, y) {
		d.img.Set(x, y, d.style.StrokeColor)
	}
	return d
}

// Internal drawing implementations

func (d *Drawer) drawLine(x1, y1, x2, y2 int, c color.Color, thickness int) {
	// Bresenham's line algorithm with thickness
	dx := absInt(x2 - x1)
	dy := absInt(y2 - y1)

	if dx == 0 {
		// Vertical line
		if y1 > y2 {
			y1, y2 = y2, y1
		}
		for y := y1; y <= y2; y++ {
			d.drawThickPoint(x1, y, thickness, c)
		}
		return
	}

	if dy == 0 {
		// Horizontal line
		if x1 > x2 {
			x1, x2 = x2, x1
		}
		for x := x1; x <= x2; x++ {
			d.drawThickPoint(x, y1, thickness, c)
		}
		return
	}

	// Diagonal line - Bresenham
	sx := 1
	if x1 > x2 {
		sx = -1
	}
	sy := 1
	if y1 > y2 {
		sy = -1
	}

	err := dx - dy
	x, y := x1, y1

	for {
		d.drawThickPoint(x, y, thickness, c)

		if x == x2 && y == y2 {
			break
		}

		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x += sx
		}
		if e2 < dx {
			err += dx
			y += sy
		}
	}
}

func (d *Drawer) drawThickPoint(x, y, thickness int, c color.Color) {
	halfThick := thickness / 2
	for dy := -halfThick; dy <= halfThick; dy++ {
		for dx := -halfThick; dx <= halfThick; dx++ {
			px, py := x+dx, y+dy
			if d.inBounds(px, py) {
				d.img.Set(px, py, c)
			}
		}
	}
}

func (d *Drawer) drawRect(x, y, width, height int, c color.Color, thickness int, filled bool) {
	if width <= 0 || height <= 0 {
		return
	}

	bounds := d.img.Bounds()
	rect := image.Rect(x, y, x+width, y+height).Intersect(bounds)
	if rect.Empty() {
		return
	}

	if filled {
		// Fill the rectangle using direct pixel setting for predictable behavior
		for py := rect.Min.Y; py < rect.Max.Y; py++ {
			for px := rect.Min.X; px < rect.Max.X; px++ {
				d.img.Set(px, py, c)
			}
		}
	} else {
		// Draw outline
		for i := 0; i < thickness; i++ {
			// Top
			d.drawLine(x, y+i, x+width-1, y+i, c, 1)
			// Bottom
			d.drawLine(x, y+height-1-i, x+width-1, y+height-1-i, c, 1)
			// Left
			d.drawLine(x+i, y, x+i, y+height-1, c, 1)
			// Right
			d.drawLine(x+width-1-i, y, x+width-1-i, y+height-1, c, 1)
		}
	}
}

func (d *Drawer) drawCircle(cx, cy, radius int, c color.Color, thickness int, filled bool) {
	if radius <= 0 {
		return
	}

	// Midpoint circle algorithm
	x := radius
	y := 0
	err := 0

	for x >= y {
		if filled {
			// Draw horizontal lines to fill
			d.drawLine(cx-x, cy+y, cx+x, cy+y, c, 1)
			d.drawLine(cx-x, cy-y, cx+x, cy-y, c, 1)
			d.drawLine(cx-y, cy+x, cx+y, cy+x, c, 1)
			d.drawLine(cx-y, cy-x, cx+y, cy-x, c, 1)
		} else {
			// Draw circle outline with 8-way symmetry
			points := [][2]int{
				{cx + x, cy + y}, {cx + y, cy + x},
				{cx - y, cy + x}, {cx - x, cy + y},
				{cx - x, cy - y}, {cx - y, cy - x},
				{cx + y, cy - x}, {cx + x, cy - y},
			}
			for _, pt := range points {
				d.drawThickPoint(pt[0], pt[1], thickness, c)
			}
		}

		y++
		err += 1 + 2*y
		if 2*(err-x)+1 > 0 {
			x--
			err += 1 - 2*x
		}
	}
}

func (d *Drawer) drawText(x, y int, text string, c color.Color) {
	if text == "" {
		return
	}

	drawer := &font.Drawer{
		Dst:  d.img,
		Src:  image.NewUniform(c),
		Face: d.style.Font,
		Dot:  fixed.P(x, y),
	}
	drawer.DrawString(text)
}

func (d *Drawer) drawTextWithBackground(x, y int, text string, textColor, bgColor color.Color) {
	if text == "" {
		return
	}

	// Calculate text dimensions
	width := len(text)*7 + 8
	height := 16
	padding := 2

	// Draw background
	bgRect := image.Rect(
		clampInt(x-padding, 0, d.img.Bounds().Max.X),
		clampInt(y-height+padding, 0, d.img.Bounds().Max.Y),
		clampInt(x+width-padding, 0, d.img.Bounds().Max.X),
		clampInt(y+padding, 0, d.img.Bounds().Max.Y),
	)
	draw.Draw(d.img, bgRect, &image.Uniform{bgColor}, image.Point{}, draw.Over)

	// Draw text
	d.drawText(x, y, text, textColor)
}

func (d *Drawer) inBounds(x, y int) bool {
	bounds := d.img.Bounds()
	return x >= bounds.Min.X && x < bounds.Max.X && y >= bounds.Min.Y && y < bounds.Max.Y
}
