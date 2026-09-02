package toolbar

import "math"

const (
	SchemaVersion         = 1
	MinButtons            = 1
	MaxButtons            = 32
	MaxVerticalButtons    = 5
	MaxColumns            = 19
	MinOuterWidth         = 60
	MaxOuterWidth         = 960
	ButtonSize            = 40
	ButtonGap             = 8
	HorizontalPadding     = 10
	OrientationHorizontal = "horizontal"
	OrientationVertical   = "vertical"
)

func IsValidOrientation(value string) bool {
	return value == OrientationHorizontal || value == OrientationVertical
}

func MaxButtonsForOrientation(orientation string) int {
	if orientation == OrientationVertical {
		return MaxVerticalButtons
	}
	return MaxButtons
}

// MaxColumnsForWidth converts a public maxWidth point constraint to the
// number of complete 40pt buttons that fit in one horizontal toolbar row.
// The native host retains ownership of the final outer bounds.
func MaxColumnsForWidth(width float64) int {
	columns := int(math.Floor((width - 2*HorizontalPadding + ButtonGap) / (ButtonSize + ButtonGap)))
	if columns < 1 {
		return 1
	}
	if columns > MaxColumns {
		return MaxColumns
	}
	return columns
}

// ColumnsForButtonCount returns the compact number of horizontal columns that
// keeps button declaration order and honours a column cap and optional row
// cap. The boolean is false only when both caps cannot hold buttonCount.
func ColumnsForButtonCount(buttonCount, maxColumns, maxRows int) (int, bool) {
	if maxColumns < 1 || maxColumns > MaxColumns || buttonCount < 1 {
		return 0, false
	}
	if maxRows > 0 {
		columns := (buttonCount + maxRows - 1) / maxRows
		if columns > maxColumns {
			return 0, false
		}
		return columns, true
	}
	if buttonCount < maxColumns {
		return buttonCount, true
	}
	return maxColumns, true
}

// MaxButtonsForLayout applies the optional horizontal row cap in addition to
// the product-wide toolbar cap. A zero maxRows means automatic wrapping.
func MaxButtonsForLayout(orientation string, maxColumns, maxRows int) int {
	maximum := MaxButtonsForOrientation(orientation)
	if orientation != OrientationHorizontal || maxRows == 0 {
		return maximum
	}
	capacity := maxColumns * maxRows
	if capacity < maximum {
		return capacity
	}
	return maximum
}

// Bounds uses the Runtime's global top-left desktop coordinate space.
type Bounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// IconPresentation is generated from the versioned reviewed icon registry.
type IconPresentation struct {
	SystemSymbol string  `json:"systemSymbol"`
	Scale        float64 `json:"scale"`
	OffsetX      float64 `json:"offsetX"`
	OffsetY      float64 `json:"offsetY"`
}

// ButtonState is the event-loop-owned logical state applied atomically by the
// native host. Revision is globally monotonic within one ToolbarSpec.
type ButtonState struct {
	Active   bool   `json:"active"`
	Disabled bool   `json:"disabled"`
	Busy     bool   `json:"busy"`
	Error    string `json:"error,omitempty"`
	Revision uint64 `json:"revision"`
}

// ButtonSpec is the complete declaration for one ordered native toolbar button.
type ButtonSpec struct {
	ID    string      `json:"id"`
	Label string      `json:"label"`
	Icon  string      `json:"icon"`
	State ButtonState `json:"state"`
}

// ToolbarSpec is carried directly over the native host protocol. FloatingWindow
// never supplies HTML, CSS, a URL, a path, or caller-selected native symbols.
type ToolbarSpec struct {
	SchemaVersion int    `json:"schemaVersion"`
	Revision      uint64 `json:"revision"`
	Orientation   string `json:"orientation"`
	// Columns is the EventLoop-derived per-row cap for a horizontal toolbar.
	// It is not a caller-selected native frame or arbitrary layout primitive.
	Columns int `json:"columns,omitempty"`
	// MaxWidth is the validated responsive outer-width ceiling in points. A
	// zero value preserves the historical native safe-width default.
	MaxWidth float64      `json:"maxWidth,omitempty"`
	Buttons  []ButtonSpec `json:"buttons"`
}

// ButtonResult is native readback: the applied logical state plus actual AppKit
// bounds, tooltip, Accessibility name, and the generated reviewed symbol recipe.
type ButtonResult struct {
	ButtonSpec
	RenderedText      string           `json:"renderedText"`
	Tooltip           string           `json:"tooltip"`
	TooltipVisible    bool             `json:"tooltipVisible"`
	IconPresentation  IconPresentation `json:"iconPresentation"`
	AccessibilityName string           `json:"accessibilityName"`
	LocalBounds       Bounds           `json:"localBounds"`
	ScreenBounds      Bounds           `json:"screenBounds"`
}
