package automation

import (
	"fmt"
	"math"
	"sort"

	"github.com/go-vgo/robotgo"
)

// Screen provides methods for screen-related operations.
// Display control extends this existing facade instead of creating a parallel
// Display namespace with duplicate list/primary methods.
type Screen struct {
	displayControl displayControlBackend
	readPixel      func(x, y int) string
}

// DisplayInfo describes one physical display.
// Index is 1-based and aligned with macOS screencapture -D index semantics.
type DisplayInfo struct {
	Index       int     `json:"index"`
	ID          string  `json:"id"`
	HardwareID  string  `json:"hardwareId"`
	IsPrimary   bool    `json:"isPrimary"`
	IsBuiltin   bool    `json:"isBuiltin"`
	Vendor      uint32  `json:"vendor"`
	Model       uint32  `json:"model"`
	Serial      uint32  `json:"serial"`
	Unit        uint32  `json:"unit"`
	X           int     `json:"x"`
	Y           int     `json:"y"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	PixelWidth  int     `json:"pixelWidth"`
	PixelHeight int     `json:"pixelHeight"`
	Scale       float64 `json:"scale"`
}

// BoundsInfo represents a rectangle in virtual desktop coordinates.
type BoundsInfo struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// NewScreen creates a new Screen instance
func NewScreen() *Screen {
	return &Screen{displayControl: newDefaultDisplayControlBackend()}
}

// GetWidth returns the width of the primary screen
func (s *Screen) GetWidth() int {
	if primary := getPrimaryDisplayInfo(resolveDisplays()); primary != nil {
		return primary.Width
	}
	width, _ := robotgo.GetScreenSize()
	return width
}

// GetHeight returns the height of the primary screen
func (s *Screen) GetHeight() int {
	if primary := getPrimaryDisplayInfo(resolveDisplays()); primary != nil {
		return primary.Height
	}
	_, height := robotgo.GetScreenSize()
	return height
}

// GetDisplays returns all currently available displays.
// The ordering is stable by index (1..N) and intended to match screenshot displayIndex.
func (s *Screen) GetDisplays() []map[string]interface{} {
	displays := resolveDisplays()
	sort.Slice(displays, func(i, j int) bool {
		return displays[i].Index < displays[j].Index
	})
	result := make([]map[string]interface{}, 0, len(displays))
	for _, d := range displays {
		result = append(result, displayInfoToMap(d))
	}
	return result
}

// GetPrimaryDisplay returns the primary display metadata.
func (s *Screen) GetPrimaryDisplay() map[string]interface{} {
	displays := resolveDisplays()
	primary := getPrimaryDisplayInfo(displays)
	if primary == nil {
		return nil
	}
	return displayInfoToMap(*primary)
}

// GetDisplay returns display metadata by 1-based index.
func (s *Screen) GetDisplay(index int) map[string]interface{} {
	if index <= 0 {
		return nil
	}
	displays := resolveDisplays()
	for _, d := range displays {
		if d.Index == index {
			return displayInfoToMap(d)
		}
	}
	return nil
}

// GetVirtualBounds returns union bounds of all displays in virtual desktop coordinates.
func (s *Screen) GetVirtualBounds() map[string]interface{} {
	displays := resolveDisplays()
	bounds := computeVirtualBounds(displays)
	return map[string]interface{}{
		"x":      bounds.X,
		"y":      bounds.Y,
		"width":  bounds.Width,
		"height": bounds.Height,
	}
}

// Pixel returns the color of a specific pixel at (x, y) coordinates
func (s *Screen) Pixel(x, y int) string {
	var color string
	if s.readPixel == nil {
		color = robotgo.GetPixelColor(x, y)
	} else {
		color = s.readPixel(x, y)
	}
	if color == "" {
		return ""
	}
	return "#" + color
}

// Pixels validates the entire batch before reading any screen pixel.
func (s *Screen) Pixels(points any, _ bool) ([]string, error) {
	list, ok := points.([]any)
	if !ok {
		return nil, fmt.Errorf("points must be an array")
	}

	coordinates := make([][2]int, len(list))
	for i, point := range list {
		var x, y any
		switch p := point.(type) {
		case []any:
			if len(p) != 2 {
				return nil, fmt.Errorf("points[%d] must contain exactly two coordinates", i)
			}
			x, y = p[0], p[1]
		case map[string]any:
			x, y = p["x"], p["y"]
		default:
			return nil, fmt.Errorf("points[%d] must be a coordinate pair or an object with x and y", i)
		}

		px, xOK := screenPixelCoordinate(x)
		py, yOK := screenPixelCoordinate(y)
		if !xOK || !yOK {
			return nil, fmt.Errorf("points[%d] requires finite numeric x and y coordinates in the supported range", i)
		}
		coordinates[i] = [2]int{px, py}
	}

	colors := make([]string, len(coordinates))
	for i, point := range coordinates {
		colors[i] = s.Pixel(point[0], point[1])
	}
	return colors, nil
}

func screenPixelCoordinate(value any) (int, bool) {
	var numeric float64
	switch v := value.(type) {
	case int:
		numeric = float64(v)
	case int64:
		numeric = float64(v)
	case float64:
		numeric = v
	default:
		return 0, false
	}
	// robotgo marshals coordinates as signed 32-bit integers. Preserve the
	// previous truncation of fractional inputs without letting large values wrap.
	numeric = math.Trunc(numeric)
	if math.IsNaN(numeric) || numeric < math.MinInt32 || numeric > math.MaxInt32 {
		return 0, false
	}
	return int(numeric), true
}

func resolveDisplays() []DisplayInfo {
	displays, err := listDisplaysPlatform()
	if err == nil && len(displays) > 0 {
		return displays
	}
	return []DisplayInfo{primaryDisplayFallback()}
}

func getPrimaryDisplayInfo(displays []DisplayInfo) *DisplayInfo {
	for _, d := range displays {
		if d.IsPrimary {
			dd := d
			return &dd
		}
	}
	if len(displays) == 0 {
		return nil
	}
	dd := displays[0]
	return &dd
}

func displayInfoToMap(d DisplayInfo) map[string]interface{} {
	return map[string]interface{}{
		"index":       d.Index,
		"id":          d.ID,
		"hardwareId":  d.HardwareID,
		"isPrimary":   d.IsPrimary,
		"isBuiltin":   d.IsBuiltin,
		"vendor":      d.Vendor,
		"model":       d.Model,
		"serial":      d.Serial,
		"unit":        d.Unit,
		"x":           d.X,
		"y":           d.Y,
		"width":       d.Width,
		"height":      d.Height,
		"pixelWidth":  d.PixelWidth,
		"pixelHeight": d.PixelHeight,
		"scale":       d.Scale,
	}
}

func primaryDisplayFallback() DisplayInfo {
	width, height := robotgo.GetScreenSize()
	return DisplayInfo{
		Index:       1,
		ID:          "primary",
		HardwareID:  "unknown:primary",
		IsPrimary:   true,
		X:           0,
		Y:           0,
		Width:       width,
		Height:      height,
		PixelWidth:  width,
		PixelHeight: height,
		Scale:       1,
	}
}

func computeVirtualBounds(displays []DisplayInfo) BoundsInfo {
	if len(displays) == 0 {
		return BoundsInfo{}
	}

	minX := displays[0].X
	minY := displays[0].Y
	maxX := displays[0].X + displays[0].Width
	maxY := displays[0].Y + displays[0].Height

	for _, d := range displays[1:] {
		if d.X < minX {
			minX = d.X
		}
		if d.Y < minY {
			minY = d.Y
		}
		if d.X+d.Width > maxX {
			maxX = d.X + d.Width
		}
		if d.Y+d.Height > maxY {
			maxY = d.Y + d.Height
		}
	}

	return BoundsInfo{
		X:      minX,
		Y:      minY,
		Width:  maxX - minX,
		Height: maxY - minY,
	}
}

// CaptureScreen is the compatibility name for Screenshot.  Keeping a separate
// robotgo-only implementation here caused JavaScript options such as clip,
// path, and returnType to be silently ignored.  Route both names through the
// single option parser and response builder so their public contracts agree.
func (p *Page) CaptureScreen(options interface{}) (interface{}, error) {
	return p.Screenshot(options)
}

// Helper function to merge options
func mergeOptions(defaults, provided interface{}) map[string]interface{} {
	result := make(map[string]interface{})

	// Convert defaults to map
	if defaultMap, ok := defaults.(map[string]interface{}); ok {
		for k, v := range defaultMap {
			result[k] = v
		}
	}

	// Merge with provided options
	if providedMap, ok := provided.(map[string]interface{}); ok {
		for k, v := range providedMap {
			if v != nil {
				result[k] = v
			}
		}
	}

	return result
}

// Helper function to convert interface{} to int
func toInt(val interface{}) int {
	switch v := val.(type) {
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

// Helper function to convert interface to string
func toString(val interface{}) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}
