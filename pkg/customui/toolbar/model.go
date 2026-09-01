package toolbar

const (
	SchemaVersion         = 1
	MinButtons            = 1
	MaxButtons            = 32
	MaxVerticalButtons    = 5
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
	SchemaVersion int          `json:"schemaVersion"`
	Revision      uint64       `json:"revision"`
	Orientation   string       `json:"orientation"`
	Buttons       []ButtonSpec `json:"buttons"`
}

// ButtonResult is native readback: the applied logical state plus actual AppKit
// bounds, Accessibility name, and the generated reviewed symbol recipe.
type ButtonResult struct {
	ButtonSpec
	RenderedText      string           `json:"renderedText"`
	IconPresentation  IconPresentation `json:"iconPresentation"`
	AccessibilityName string           `json:"accessibilityName"`
	LocalBounds       Bounds           `json:"localBounds"`
	ScreenBounds      Bounds           `json:"screenBounds"`
}
