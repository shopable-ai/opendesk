package automation

import (
	"fmt"
	"image/color"
)

// High-level drawing functions for common patterns

// DashedLine draws a dashed line with specified dash pattern.
// Pattern is [dash_length, gap_length, dash_length, gap_length, ...]
func (d *Drawer) DashedLine(x1, y1, x2, y2 int, pattern []int) *Drawer {
	if len(pattern) == 0 {
		pattern = []int{5, 3} // Default pattern
	}

	dx := x2 - x1
	dy := y2 - y1
	length := sqrtInt(dx*dx + dy*dy)

	if length == 0 {
		return d
	}

	// Normalize direction
	fx := float64(dx) / float64(length)
	fy := float64(dy) / float64(length)

	pos := 0
	patternIdx := 0
	drawing := true

	for pos < length {
		segmentLen := pattern[patternIdx%len(pattern)]
		if pos+segmentLen > length {
			segmentLen = length - pos
		}

		if drawing {
			sx := x1 + int(float64(pos)*fx)
			sy := y1 + int(float64(pos)*fy)
			ex := x1 + int(float64(pos+segmentLen)*fx)
			ey := y1 + int(float64(pos+segmentLen)*fy)
			d.Line(sx, sy, ex, ey)
		}

		pos += segmentLen
		patternIdx++
		drawing = !drawing
	}

	return d
}

// Arrow draws an arrow from (x1,y1) to (x2,y2) with arrowhead.
func (d *Drawer) Arrow(x1, y1, x2, y2 int, headSize int) *Drawer {
	// Draw main line
	d.Line(x1, y1, x2, y2)

	// Calculate arrowhead
	dx := float64(x2 - x1)
	dy := float64(y2 - y1)
	length := sqrtFloat(dx*dx + dy*dy)

	if length < 1 {
		return d
	}

	// Normalize
	dx /= length
	dy /= length

	// Arrowhead angle (30 degrees)
	angle := 0.5236 // radians

	// Left wing
	lx := x2 - int(float64(headSize)*(dx*cosFloat(angle)+dy*sinFloat(angle)))
	ly := y2 - int(float64(headSize)*(dy*cosFloat(angle)-dx*sinFloat(angle)))
	d.Line(x2, y2, lx, ly)

	// Right wing
	rx := x2 - int(float64(headSize)*(dx*cosFloat(angle)-dy*sinFloat(angle)))
	ry := y2 - int(float64(headSize)*(dy*cosFloat(angle)+dx*sinFloat(angle)))
	d.Line(x2, y2, rx, ry)

	return d
}

// Polygon draws a closed polygon through the given points.
func (d *Drawer) Polygon(points [][2]int, filled bool) *Drawer {
	if len(points) < 3 {
		return d
	}

	if filled {
		// Simple scanline fill algorithm
		d.fillPolygon(points)
	} else {
		// Draw outline
		for i := 0; i < len(points); i++ {
			next := (i + 1) % len(points)
			d.Line(points[i][0], points[i][1], points[next][0], points[next][1])
		}
	}

	return d
}

// Grid draws a grid with specified spacing.
func (d *Drawer) Grid(spacing int) *Drawer {
	bounds := d.Bounds()

	// Vertical lines
	for x := bounds.Min.X; x < bounds.Max.X; x += spacing {
		d.VLine(x, bounds.Min.Y, bounds.Max.Y-1)
	}

	// Horizontal lines
	for y := bounds.Min.Y; y < bounds.Max.Y; y += spacing {
		d.HLine(bounds.Min.X, bounds.Max.X-1, y)
	}

	return d
}

// Annotation draws a rectangle with a label - common pattern for UI annotations.
func (d *Drawer) Annotation(x, y, width, height int, label string) *Drawer {
	// Draw rectangle
	d.Rect(x, y, width, height)

	// Draw label with background
	if label != "" {
		labelX := x + 4
		labelY := y + 16
		d.TextWithBackground(labelX, labelY, label, d.style.StrokeColor, d.style.FillColor)
	}

	return d
}

// Separator draws a separator line with optional confidence indicator.
// Orientation: "horizontal" or "vertical"
func (d *Drawer) Separator(orientation string, position int, confidence float64, showLabel bool) *Drawer {
	bounds := d.Bounds()

	if orientation == "horizontal" {
		d.HLine(bounds.Min.X, bounds.Max.X-1, position)
		if showLabel && confidence > 0 {
			label := fmt.Sprintf("H:%d (%.2f)", position, confidence)
			d.TextWithBackground(5, position-5, label, d.style.StrokeColor, color.RGBA{255, 255, 255, 220})
		}
	} else if orientation == "vertical" {
		d.VLine(position, bounds.Min.Y, bounds.Max.Y-1)
		if showLabel && confidence > 0 {
			label := fmt.Sprintf("V:%d (%.2f)", position, confidence)
			d.TextWithBackground(position+5, 15, label, d.style.StrokeColor, color.RGBA{255, 255, 255, 220})
		}
	}

	return d
}

// Legend draws a legend box with items.
type LegendItem struct {
	Color color.Color
	Label string
}

func (d *Drawer) Legend(x, y int, items []LegendItem) *Drawer {
	if len(items) == 0 {
		return d
	}

	boxWidth := 200
	itemHeight := 25
	boxHeight := 20 + len(items)*itemHeight

	// Save original style
	origStroke := d.style.StrokeColor
	origFill := d.style.FillColor
	origThickness := d.style.Thickness

	// Draw background
	d.style.FillColor = color.RGBA{255, 255, 255, 230}
	d.FillRect(x, y, boxWidth, boxHeight)

	// Draw border
	d.style.StrokeColor = color.RGBA{0, 0, 0, 255}
	d.style.Thickness = 1
	d.Rect(x, y, boxWidth, boxHeight)

	// Draw title
	d.style.StrokeColor = color.RGBA{0, 0, 0, 255}
	d.Text(x+10, y+15, "Legend:")

	// Draw items
	for i, item := range items {
		itemY := y + 20 + i*itemHeight

		// Draw color box
		d.style.FillColor = item.Color
		d.FillRect(x+10, itemY, 20, 10)

		d.style.StrokeColor = color.RGBA{0, 0, 0, 255}
		d.Rect(x+10, itemY, 20, 10)

		// Draw label
		d.style.StrokeColor = color.RGBA{0, 0, 0, 255}
		d.Text(x+35, itemY+10, item.Label)
	}

	// Restore original style
	d.style.StrokeColor = origStroke
	d.style.FillColor = origFill
	d.style.Thickness = origThickness

	return d
}

// CrossHair draws a crosshair at (x,y) with specified size.
func (d *Drawer) CrossHair(x, y, size int) *Drawer {
	d.HLine(x-size, x+size, y)
	d.VLine(x, y-size, y+size)
	return d
}

// RoundedRect draws a rectangle with rounded corners.
func (d *Drawer) RoundedRect(x, y, width, height, radius int) *Drawer {
	if radius <= 0 || radius*2 > width || radius*2 > height {
		return d.Rect(x, y, width, height)
	}

	// Draw four sides
	d.HLine(x+radius, x+width-radius, y)                   // Top
	d.HLine(x+radius, x+width-radius, y+height-1)          // Bottom
	d.VLine(x, y+radius, y+height-radius)                  // Left
	d.VLine(x+width-1, y+radius, y+height-radius)          // Right

	// Draw four corners (simplified - quarter circles)
	d.drawQuarterCircle(x+radius, y+radius, radius, 2)             // Top-left
	d.drawQuarterCircle(x+width-radius-1, y+radius, radius, 1)     // Top-right
	d.drawQuarterCircle(x+radius, y+height-radius-1, radius, 3)    // Bottom-left
	d.drawQuarterCircle(x+width-radius-1, y+height-radius-1, radius, 4) // Bottom-right

	return d
}

// Internal helpers

func (d *Drawer) fillPolygon(points [][2]int) {
	// Find bounding box
	minY, maxY := points[0][1], points[0][1]
	for _, p := range points {
		if p[1] < minY {
			minY = p[1]
		}
		if p[1] > maxY {
			maxY = p[1]
		}
	}

	// Scanline fill
	for y := minY; y <= maxY; y++ {
		intersections := []int{}

		// Find intersections with polygon edges
		for i := 0; i < len(points); i++ {
			next := (i + 1) % len(points)
			y1, y2 := points[i][1], points[next][1]

			if (y1 <= y && y < y2) || (y2 <= y && y < y1) {
				x1, x2 := points[i][0], points[next][0]
				x := x1 + (y-y1)*(x2-x1)/(y2-y1)
				intersections = append(intersections, x)
			}
		}

		// Sort intersections
		for i := 0; i < len(intersections)-1; i++ {
			for j := i + 1; j < len(intersections); j++ {
				if intersections[i] > intersections[j] {
					intersections[i], intersections[j] = intersections[j], intersections[i]
				}
			}
		}

		// Fill between pairs
		for i := 0; i < len(intersections)-1; i += 2 {
			d.HLine(intersections[i], intersections[i+1], y)
		}
	}
}

func (d *Drawer) drawQuarterCircle(cx, cy, radius, quadrant int) {
	x := radius
	y := 0
	err := 0

	for x >= y {
		var px, py int
		switch quadrant {
		case 1: // Top-right
			px, py = cx+x, cy-y
		case 2: // Top-left
			px, py = cx-x, cy-y
		case 3: // Bottom-left
			px, py = cx-x, cy+y
		case 4: // Bottom-right
			px, py = cx+x, cy+y
		}

		if d.inBounds(px, py) {
			d.img.Set(px, py, d.style.StrokeColor)
		}

		// Also draw the symmetric point
		switch quadrant {
		case 1:
			px, py = cx+y, cy-x
		case 2:
			px, py = cx-y, cy-x
		case 3:
			px, py = cx-y, cy+x
		case 4:
			px, py = cx+y, cy+x
		}

		if d.inBounds(px, py) {
			d.img.Set(px, py, d.style.StrokeColor)
		}

		y++
		err += 1 + 2*y
		if 2*(err-x)+1 > 0 {
			x--
			err += 1 - 2*x
		}
	}
}

// Math helpers

func sqrtInt(x int) int {
	if x <= 0 {
		return 0
	}
	// Newton's method
	z := x
	for i := 0; i < 10; i++ {
		z = (z + x/z) / 2
	}
	return z
}

func sqrtFloat(x float64) float64 {
	if x <= 0 {
		return 0
	}
	// Simple approximation
	z := x
	for i := 0; i < 10; i++ {
		z = (z + x/z) / 2
	}
	return z
}

func cosFloat(angle float64) float64 {
	// Taylor series approximation for small angles
	// For production, use math.Cos
	x := angle
	result := 1.0
	term := 1.0
	for i := 1; i <= 10; i++ {
		term *= -x * x / float64(2*i*(2*i-1))
		result += term
	}
	return result
}

func sinFloat(angle float64) float64 {
	// Taylor series approximation
	// For production, use math.Sin
	x := angle
	result := x
	term := x
	for i := 1; i <= 10; i++ {
		term *= -x * x / float64((2*i+1)*2*i)
		result += term
	}
	return result
}
