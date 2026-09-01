package desktopvision

import "time"

type RiskLevel string

const (
	RiskLow    RiskLevel = "low"
	RiskMedium RiskLevel = "medium"
	RiskHigh   RiskLevel = "high"
)

func (r RiskLevel) rank() int {
	switch r {
	case RiskLow:
		return 1
	case RiskMedium:
		return 2
	case RiskHigh:
		return 3
	default:
		return 0
	}
}

func (r RiskLevel) AllowedBy(limit RiskLevel) bool {
	if limit == "" {
		limit = RiskLow
	}
	return r.rank() <= limit.rank()
}

type Perception struct {
	App           string    `json:"app"`
	Window        Window    `json:"window"`
	Image         Image     `json:"image"`
	Display       Display   `json:"display"`
	Elements      []Element `json:"elements,omitempty"`
	Uncertainties []string  `json:"uncertainties,omitempty"`
}

type Window struct {
	Title        string     `json:"title"`
	BoundsScreen ScreenBBox `json:"bounds_screen"`
}

type Image struct {
	Size       ImageSize `json:"size"`
	Hash       string    `json:"hash"`
	CapturedAt time.Time `json:"captured_at,omitempty"`
}

type Display struct {
	ID     string     `json:"id"`
	Scale  float64    `json:"scale"`
	Bounds ScreenBBox `json:"bounds,omitempty"`
}

type ImageSize struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Element struct {
	ID           string         `json:"id,omitempty"`
	Role         string         `json:"role,omitempty"`
	Text         string         `json:"text,omitempty"`
	BBoxNorm     NormalizedBBox `json:"bbox_norm"`
	BBoxPx       PixelBBox      `json:"bbox_px,omitempty"`
	BBoxWindow   WindowBBox     `json:"bbox_window,omitempty"`
	CenterWindow WindowPoint    `json:"center_window,omitempty"`
	CenterScreen ScreenPoint    `json:"center_screen,omitempty"`
	Confidence   float64        `json:"confidence"`
	Risk         RiskLevel      `json:"risk"`
	Actionable   bool           `json:"actionable,omitempty"`
}

type NormalizedBBox [4]float64
type PixelBBox [4]int
type WindowBBox [4]float64
type ScreenBBox [4]float64
type WindowPoint [2]float64
type ScreenPoint [2]float64

type TransformContext struct {
	Image   Image
	Window  Window
	Display Display
}
