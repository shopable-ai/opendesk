package toolbar

import (
	"fmt"
	"math"
)

const (
	// SchemaVersion is the typed native-toolbar wire schema. Version 2 replaces
	// the button-only list with ordered toolbar items while retaining ButtonSpec
	// as the only actionable item payload.
	SchemaVersion       = 2
	LegacySchemaVersion = 1

	MinButtons         = 1
	MaxButtons         = 32
	MaxVerticalButtons = 5
	// MaxItems is deliberately derived from the compact action limit: at most
	// one structural boundary can appear between two adjacent action groups.
	// It prevents structural items from becoming an unbounded resource bypass.
	MaxItems         = MaxButtons*2 - 1
	MaxVerticalItems = MaxVerticalButtons*2 - 1

	MaxColumns         = 19
	MinOuterWidth      = 60
	MaxOuterWidth      = 960
	ButtonSize         = 40
	ButtonGap          = 8
	SeparatorThickness = 1
	// SpacerIntrinsicSize deliberately remains zero. The native host keeps the
	// gap before a spacer and suppresses the following stack gap, making Spacer
	// a compact, fixed ButtonGap boundary instead of an unintended 24pt gap.
	SpacerIntrinsicSize   = 0
	SpacerGroupGap        = ButtonGap
	HorizontalPadding     = 10
	VerticalPadding       = 8
	ChromeHeight          = 25
	OrientationHorizontal = "horizontal"
	OrientationVertical   = "vertical"

	ItemButton    = "button"
	ItemSeparator = "separator"
	ItemSpacer    = "spacer"
)

func IsValidOrientation(value string) bool {
	return value == OrientationHorizontal || value == OrientationVertical
}

func IsValidItemType(value string) bool {
	return value == ItemButton || value == ItemSeparator || value == ItemSpacer
}

func IsStructuralItemType(value string) bool {
	return value == ItemSeparator || value == ItemSpacer
}

func MaxButtonsForOrientation(orientation string) int {
	if orientation == OrientationVertical {
		return MaxVerticalButtons
	}
	return MaxButtons
}

func MaxItemsForOrientation(orientation string) int {
	if orientation == OrientationVertical {
		return MaxVerticalItems
	}
	return MaxItems
}

// MaxColumnsForWidth converts a public maxWidth point constraint to the
// number of complete 40pt buttons that fit in one horizontal toolbar row.
// Structural boundaries are planned separately because they are not buttons.
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

// ColumnsForButtonCount returns the compact number of horizontal button
// tracks that keeps declaration order and honours a column cap and optional
// row cap. Structural items do not consume this action capacity.
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
	Kind          string  `json:"kind,omitempty"`
	SystemSymbol  string  `json:"systemSymbol"`
	Scale         float64 `json:"scale"`
	OffsetX       float64 `json:"offsetX"`
	OffsetY       float64 `json:"offsetY"`
	MediaType     string  `json:"mediaType,omitempty"`
	PixelWidth    int     `json:"pixelWidth,omitempty"`
	PixelHeight   int     `json:"pixelHeight,omitempty"`
	RenderingMode string  `json:"renderingMode,omitempty"`
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

// ButtonSpec is the complete declaration for one actionable native toolbar
// button. It is deliberately not used for non-interactive structural items.
type ButtonSpec struct {
	ID        string      `json:"id"`
	Label     string      `json:"label"`
	Icon      string      `json:"icon,omitempty"`
	IconImage *IconImage  `json:"iconImage,omitempty"`
	State     ButtonState `json:"state"`
}

// ToolbarItemSpec is one ordered native toolbar primitive. Button carries the
// only actionable payload; Separator and Spacer have only a stable item ID.
// Button.ID must equal ID, which keeps all item IDs in one strict namespace.
type ToolbarItemSpec struct {
	Type   string      `json:"type"`
	ID     string      `json:"id"`
	Button *ButtonSpec `json:"button,omitempty"`
}

func ButtonItem(button ButtonSpec) ToolbarItemSpec {
	return ToolbarItemSpec{Type: ItemButton, ID: button.ID, Button: &button}
}

func (item ToolbarItemSpec) IsButton() bool { return item.Type == ItemButton && item.Button != nil }

func (item ToolbarItemSpec) VisualSize(orientation string) (width, height float64) {
	switch item.Type {
	case ItemButton:
		return ButtonSize, ButtonSize
	case ItemSeparator:
		if orientation == OrientationVertical {
			return ButtonSize, SeparatorThickness
		}
		return SeparatorThickness, ButtonSize
	case ItemSpacer:
		if orientation == OrientationVertical {
			return ButtonSize, SpacerIntrinsicSize
		}
		return SpacerIntrinsicSize, ButtonSize
	default:
		return 0, 0
	}
}

// ToolbarSpec is carried directly over the native host protocol. FloatingWindow
// never supplies HTML, CSS, a URL, a path, or caller-selected native symbols.
// A validated custom raster icon crosses only as bounded image data. Buttons
// remains decode-only for schema v1 adaptation in Normalize; schema v2 always
// crosses the native boundary as Items.
type ToolbarSpec struct {
	SchemaVersion int    `json:"schemaVersion"`
	Revision      uint64 `json:"revision"`
	Orientation   string `json:"orientation"`
	// MaxColumns is the EventLoop-derived per-row cap for actionable buttons.
	// It is not a caller-selected frame or arbitrary layout primitive.
	MaxColumns int `json:"maxColumns,omitempty"`
	// MaxRows is zero for automatic wrapping. A positive value is a hard limit
	// after structural boundaries have been laid out.
	MaxRows int `json:"maxRows,omitempty"`
	// MaxWidth is the validated responsive outer-width ceiling in points. A
	// zero value preserves the historical native safe-width default.
	MaxWidth float64           `json:"maxWidth,omitempty"`
	Items    []ToolbarItemSpec `json:"items,omitempty"`
	Buttons  []ButtonSpec      `json:"buttons,omitempty"`
}

func (spec ToolbarSpec) ButtonCount() int {
	count := 0
	for _, item := range spec.Items {
		if item.IsButton() {
			count++
		}
	}
	return count
}

// LayoutPlan is a pure, deterministic projection of validated toolbar items.
// It lets the Runtime reject a row-cap violation before native create while
// the host independently reproduces the same compact visual geometry.
type LayoutPlan struct {
	Rows        [][]ToolbarItemSpec
	OuterWidth  float64
	OuterHeight float64
}

func rowWidth(row []ToolbarItemSpec, orientation string) float64 {
	width := 0.0
	for index, item := range row {
		if index > 0 && row[index-1].Type != ItemSpacer {
			width += ButtonGap
		}
		itemWidth, _ := item.VisualSize(orientation)
		width += itemWidth
	}
	return width
}

// Plan applies the group-boundary wrapping rule. A structural item is held as
// a pending boundary until its following Button fits the current row; if it
// does not, the new row itself is the visual boundary and the separator/spacer
// is intentionally omitted. This makes a boundary impossible at a row start
// or end without special cases in callers.
func Plan(spec ToolbarSpec) (LayoutPlan, error) {
	orientation := spec.Orientation
	if !IsValidOrientation(orientation) {
		return LayoutPlan{}, fmt.Errorf("toolbar orientation is invalid")
	}
	if len(spec.Items) == 0 {
		return LayoutPlan{}, fmt.Errorf("toolbar requires at least one item")
	}
	if spec.MaxColumns == 0 {
		spec.MaxColumns = MaxColumns
	}
	if spec.MaxColumns < 1 || spec.MaxColumns > MaxColumns {
		return LayoutPlan{}, fmt.Errorf("toolbar maxColumns is invalid")
	}
	if spec.MaxRows < 0 || spec.MaxRows > MaxButtons {
		return LayoutPlan{}, fmt.Errorf("toolbar maxRows is invalid")
	}
	if spec.MaxWidth != 0 && (spec.MaxWidth < MinOuterWidth || spec.MaxWidth > MaxOuterWidth) {
		return LayoutPlan{}, fmt.Errorf("toolbar maxWidth is invalid")
	}
	if orientation == OrientationVertical {
		if spec.MaxColumns != 1 && spec.MaxColumns != MaxColumns {
			return LayoutPlan{}, fmt.Errorf("vertical toolbar must have one column")
		}
		if spec.MaxRows != 0 || spec.MaxWidth != 0 {
			return LayoutPlan{}, fmt.Errorf("vertical toolbar does not accept wrapping constraints")
		}
		return planVertical(spec.Items)
	}
	return planHorizontal(spec)
}

func planVertical(items []ToolbarItemSpec) (LayoutPlan, error) {
	height := float64(ChromeHeight + 2*VerticalPadding)
	for index, item := range items {
		if index > 0 && items[index-1].Type != ItemSpacer {
			height += ButtonGap
		}
		_, itemHeight := item.VisualSize(OrientationVertical)
		height += itemHeight
	}
	return LayoutPlan{
		Rows:        [][]ToolbarItemSpec{append([]ToolbarItemSpec(nil), items...)},
		OuterWidth:  MinOuterWidth,
		OuterHeight: height,
	}, nil
}

func planHorizontal(spec ToolbarSpec) (LayoutPlan, error) {
	maxOuterWidth := spec.MaxWidth
	if maxOuterWidth == 0 {
		maxOuterWidth = MaxOuterWidth
	}
	maxContentWidth := maxOuterWidth - 2*HorizontalPadding
	rows := make([][]ToolbarItemSpec, 0, 2)
	row := make([]ToolbarItemSpec, 0, spec.MaxColumns*2)
	rowButtons := 0
	var pending *ToolbarItemSpec
	flush := func() {
		if len(row) > 0 {
			rows = append(rows, row)
			row = make([]ToolbarItemSpec, 0, spec.MaxColumns*2)
			rowButtons = 0
		}
	}
	canAppend := func(candidate ToolbarItemSpec) bool {
		combined := append(append([]ToolbarItemSpec(nil), row...), candidate)
		return rowWidth(combined, OrientationHorizontal) <= maxContentWidth+0.0001
	}
	for _, item := range spec.Items {
		if IsStructuralItemType(item.Type) {
			copy := item
			pending = &copy
			continue
		}
		if pending != nil {
			withBoundary := append(append([]ToolbarItemSpec(nil), row...), *pending, item)
			if rowButtons < spec.MaxColumns && rowWidth(withBoundary, OrientationHorizontal) <= maxContentWidth+0.0001 {
				row = withBoundary
				rowButtons++
			} else {
				flush()
				row = append(row, item)
				rowButtons = 1
			}
			pending = nil
			continue
		}
		if rowButtons >= spec.MaxColumns || !canAppend(item) {
			flush()
		}
		row = append(row, item)
		rowButtons++
	}
	flush()
	if spec.MaxRows > 0 && len(rows) > spec.MaxRows {
		return LayoutPlan{}, fmt.Errorf("toolbar items require %d rows but maxRows is %d", len(rows), spec.MaxRows)
	}
	maxWidth := 0.0
	structural := false
	for _, item := range spec.Items {
		structural = structural || IsStructuralItemType(item.Type)
	}
	for _, planned := range rows {
		maxWidth = math.Max(maxWidth, rowWidth(planned, OrientationHorizontal))
	}
	outerWidth := math.Max(MinOuterWidth, maxWidth+2*HorizontalPadding)
	// Preserve v1's deliberate 960pt safe outer frame for a button-only
	// toolbar that has crossed the historical 19-column default.
	if spec.MaxWidth == 0 && !structural && spec.ButtonCount() > MaxColumns {
		outerWidth = MaxOuterWidth
	}
	height := float64(ChromeHeight + 2*VerticalPadding + len(rows)*ButtonSize)
	if len(rows) > 1 {
		height += float64((len(rows) - 1) * ButtonGap)
	}
	return LayoutPlan{Rows: rows, OuterWidth: outerWidth, OuterHeight: height}, nil
}

// ButtonResult is native readback: the applied logical state plus actual AppKit
// bounds, tooltip, Accessibility name, and the applied symbol/image recipe.
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
