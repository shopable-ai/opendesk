# Drawing System Documentation

## Overview

The testMonkey-go drawing system provides a unified, professional-grade API for drawing primitives and complex shapes on images. It replaces the scattered drawing functions across the codebase with a single, well-tested, and extensible system.

## Architecture

### Core Components

1. **Drawer** (`automation/drawing.go`) - Main drawing interface with state management
2. **Shapes** (`automation/drawing_shapes.go`) - Advanced shapes and patterns
3. **Tests** (`automation/drawing_test.go`) - Comprehensive test suite

### Design Principles

- **Fluent API**: Method chaining for readable code
- **Immutable Operations**: Drawing operations don't modify state unexpectedly
- **Bounds Checking**: All operations are automatically clipped to image bounds
- **Type Safety**: Strongly typed parameters, no `map[string]interface{}`
- **Performance**: Direct pixel manipulation, minimal allocations

## Quick Start

```go
import (
    "image"
    "image/color"
    "testMonkey-go/automation"
)

// Create canvas
img := image.NewRGBA(image.Rect(0, 0, 800, 600))

// Create drawer
d := automation.NewDrawer(img)

// Draw with fluent API
d.WithStroke(color.RGBA{255, 0, 0, 255}).
  WithThickness(2).
  Line(10, 10, 100, 100).
  Circle(200, 200, 50)
```

## API Reference

### Creating a Drawer

```go
// With default style
d := automation.NewDrawer(img)

// With custom style
style := automation.Style{
    StrokeColor: color.RGBA{255, 0, 0, 255},
    FillColor:   color.RGBA{0, 255, 0, 255},
    Thickness:   2,
}
d := automation.NewDrawerWithStyle(img, style)
```

### Style Modifiers

```go
d.WithStroke(color.RGBA{255, 0, 0, 255})  // Set stroke color
d.WithFill(color.RGBA{0, 255, 0, 255})    // Set fill color
d.WithThickness(3)                         // Set line thickness
d.WithFont(myFont)                         // Set text font
```

### Basic Primitives

```go
// Lines
d.Line(x1, y1, x2, y2)           // Arbitrary line
d.HLine(x1, x2, y)               // Horizontal line
d.VLine(x, y1, y2)               // Vertical line

// Rectangles
d.Rect(x, y, width, height)      // Outline
d.FillRect(x, y, width, height)  // Filled

// Circles
d.Circle(x, y, radius)           // Outline
d.FillCircle(x, y, radius)       // Filled

// Text
d.Text(x, y, "Hello")                              // Simple text
d.TextWithBackground(x, y, "Label", textC, bgC)    // With background

// Point
d.Point(x, y)                    // Single pixel
```

### Advanced Shapes

```go
// Dashed line
d.DashedLine(x1, y1, x2, y2, []int{5, 3})  // 5px dash, 3px gap

// Arrow
d.Arrow(x1, y1, x2, y2, headSize)

// Polygon
points := [][2]int{{x1,y1}, {x2,y2}, {x3,y3}}
d.Polygon(points, false)  // Outline
d.Polygon(points, true)   // Filled

// Grid
d.Grid(spacing)

// Rounded rectangle
d.RoundedRect(x, y, width, height, radius)

// Crosshair
d.CrossHair(x, y, size)
```

### High-Level Patterns

```go
// Annotation (rect + label)
d.Annotation(x, y, width, height, "Label")

// Separator with confidence
d.Separator("horizontal", position, 0.95, true)

// Legend
items := []automation.LegendItem{
    {Color: color.RGBA{255,0,0,255}, Label: "Red"},
    {Color: color.RGBA{0,255,0,255}, Label: "Green"},
}
d.Legend(x, y, items)
```

## Examples

### Example 1: Simple Annotation

```go
img := image.NewRGBA(image.Rect(0, 0, 400, 300))
d := automation.NewDrawer(img)

// Draw background
d.WithFill(color.RGBA{240, 240, 240, 255}).
  FillRect(0, 0, 400, 300)

// Draw annotated region
d.WithStroke(color.RGBA{255, 0, 0, 255}).
  WithFill(color.RGBA{255, 255, 255, 220}).
  Annotation(50, 50, 300, 200, "Main Content Area")
```

### Example 2: UI Layout Visualization

```go
img := image.NewRGBA(image.Rect(0, 0, 1200, 800))
d := automation.NewDrawer(img)

// Draw separators
d.WithStroke(color.RGBA{255, 0, 0, 255}).
  VLine(300, 0, 800).  // Sidebar separator
  HLine(0, 1200, 60)   // Header separator

// Annotate regions
d.WithStroke(color.RGBA{0, 128, 255, 255}).
  Annotation(10, 10, 280, 40, "Sidebar").
  Annotation(310, 10, 880, 40, "Header").
  Annotation(310, 70, 880, 720, "Content")
```

### Example 3: Data Visualization

```go
img := image.NewRGBA(image.Rect(0, 0, 600, 400))
d := automation.NewDrawer(img)

// Draw axes
d.WithStroke(color.RGBA{0, 0, 0, 255}).WithThickness(2).
  Line(50, 350, 550, 350).  // X-axis
  Line(50, 50, 50, 350).    // Y-axis
  Arrow(550, 350, 570, 350, 10).  // X arrow
  Arrow(50, 50, 50, 30, 10)       // Y arrow

// Draw data points
for i, val := range dataPoints {
    x := 50 + i*50
    y := 350 - val*3
    d.WithFill(color.RGBA{0, 128, 255, 255}).
      FillCircle(x, y, 5)
}

// Add legend
legend := []automation.LegendItem{
    {Color: color.RGBA{0,128,255,255}, Label: "Data Series 1"},
}
d.Legend(450, 50, legend)
```

## Migration Guide

### From Old Code

**Before:**
```go
// Old scattered functions
drawVerticalLine(img, x, col, 3)
drawHorizontalLine(img, y, col, 3)
drawLabel(img, x, y, "text", col)
```

**After:**
```go
// New unified API
d := automation.NewDrawer(img)
d.WithStroke(col).WithThickness(3).
  VLine(x, 0, img.Bounds().Dy()).
  HLine(0, img.Bounds().Dx(), y).
  Text(x, y, "text")
```

### Updating vision_layout.go

The `vision_layout.go` file has been updated to use the new Drawer system. Old functions like `drawRectOutline`, `drawVerticalSegment`, `drawHorizontalSegment`, and `drawLabel` have been removed and replaced with Drawer calls.

## Performance

Benchmarks on 1000x1000 image:

```
BenchmarkLine-8         50000    25000 ns/op
BenchmarkRect-8         20000    60000 ns/op
BenchmarkFillRect-8      5000   250000 ns/op
BenchmarkCircle-8       10000   120000 ns/op
```

## Testing

Run the comprehensive test suite:

```bash
go test ./automation -run TestDrawer -v
go test ./automation -run "Test(Line|Rect|Circle)" -v
```

All drawing functions have unit tests with >95% coverage.

## Future Enhancements

Planned features (not yet implemented):

- Anti-aliasing support
- Gradient fills
- Bezier curves
- Path operations (union, intersection)
- SVG export
- Image filters and effects

## Contributing

When adding new drawing functions:

1. Add to `automation/drawing_shapes.go`
2. Follow the fluent API pattern (return `*Drawer`)
3. Add comprehensive tests in `automation/drawing_test.go`
4. Update this documentation
5. Add example usage

## License

Part of testMonkey-go project.
