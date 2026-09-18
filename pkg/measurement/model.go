package measurement

import (
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"math"
	"strings"
	"time"
)

const ResultVersion = 2

type ReferenceType string

const (
	ReferenceWindowOuter   ReferenceType = "windowOuterBounds"
	ReferenceWindowContent ReferenceType = "windowContentBounds"
	ReferenceManualRegion  ReferenceType = "manualRegion"
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Size struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type PixelSize struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type ImagePixel struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Rect struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

func (r Rect) Right() float64  { return r.X + r.Width }
func (r Rect) Bottom() float64 { return r.Y + r.Height }
func (r Rect) Center() Point {
	return Point{X: r.X + r.Width/2, Y: r.Y + r.Height/2}
}

func RectFromPoints(first, second Point) Rect {
	return Rect{
		X:      math.Min(first.X, second.X),
		Y:      math.Min(first.Y, second.Y),
		Width:  math.Abs(second.X - first.X),
		Height: math.Abs(second.Y - first.Y),
	}
}

type CaptureMapping struct {
	Origin       Point     `json:"origin"`
	LogicalSize  Size      `json:"logicalSize"`
	ImageSize    PixelSize `json:"imageSize"`
	ScaleX       float64   `json:"scaleX"`
	ScaleY       float64   `json:"scaleY"`
	DisplayID    string    `json:"displayId"`
	DisplayIndex int       `json:"displayIndex"`
}

func NewCaptureMapping(origin Point, logical Size, pixels PixelSize, displayID string, displayIndex int) (CaptureMapping, error) {
	if !finitePoint(origin) || !finite(logical.Width) || !finite(logical.Height) || logical.Width <= 0 || logical.Height <= 0 {
		return CaptureMapping{}, errors.New("capture origin and positive logical size are required")
	}
	if pixels.Width <= 0 || pixels.Height <= 0 {
		return CaptureMapping{}, errors.New("positive capture image size is required")
	}
	if displayIndex <= 0 {
		return CaptureMapping{}, errors.New("display index must be positive")
	}
	return CaptureMapping{
		Origin: origin, LogicalSize: logical, ImageSize: pixels,
		ScaleX: float64(pixels.Width) / logical.Width, ScaleY: float64(pixels.Height) / logical.Height,
		DisplayID: strings.TrimSpace(displayID), DisplayIndex: displayIndex,
	}, nil
}

// LogicalToImage deliberately performs no clipping. Callers can preserve an
// outside-capture relationship and decide separately whether a pixel exists.
func (m CaptureMapping) LogicalToImage(point Point) Point {
	return Point{X: (point.X - m.Origin.X) * m.ScaleX, Y: (point.Y - m.Origin.Y) * m.ScaleY}
}

func (m CaptureMapping) ImageToLogical(point Point) Point {
	return Point{X: m.Origin.X + point.X/m.ScaleX, Y: m.Origin.Y + point.Y/m.ScaleY}
}

func (m CaptureMapping) PixelAt(point Point) (ImagePixel, bool) {
	imagePoint := m.LogicalToImage(point)
	x, y := int(math.Floor(imagePoint.X)), int(math.Floor(imagePoint.Y))
	inside := x >= 0 && y >= 0 && x < m.ImageSize.Width && y < m.ImageSize.Height
	return ImagePixel{X: x, Y: y}, inside
}

type Snapshot struct {
	SampledAt time.Time      `json:"sampledAt"`
	Mapping   CaptureMapping `json:"mapping"`
}

type WindowIdentity struct {
	ID           string `json:"id,omitempty"`
	PID          int64  `json:"pid,omitempty"`
	NativeHandle uint64 `json:"nativeHandle,omitempty"`
	Title        string `json:"title,omitempty"`
}

type Reference struct {
	Type                ReferenceType   `json:"type"`
	Bounds              Rect            `json:"bounds"`
	Window              *WindowIdentity `json:"window,omitempty"`
	ContentBoundsProven bool            `json:"contentBoundsProven,omitempty"`
}

func (r Reference) Validate() error {
	switch r.Type {
	case ReferenceWindowOuter:
		if r.Window == nil {
			return errors.New("window outer reference requires a window identity")
		}
	case ReferenceWindowContent:
		if r.Window == nil || !r.ContentBoundsProven {
			return errors.New("window content reference requires explicitly proven content bounds")
		}
	case ReferenceManualRegion:
		if r.Window != nil {
			return errors.New("manual reference must not claim a window identity")
		}
	default:
		return fmt.Errorf("unsupported reference type %q", r.Type)
	}
	if !validRect(r.Bounds) || r.Bounds.Width <= 0 || r.Bounds.Height <= 0 {
		return errors.New("reference bounds require positive finite width and height")
	}
	return nil
}

type RGB struct {
	R   uint8  `json:"r"`
	G   uint8  `json:"g"`
	B   uint8  `json:"b"`
	Hex string `json:"hex"`
}

func NewRGB(r, g, b uint8) RGB {
	return RGB{R: r, G: g, B: b, Hex: fmt.Sprintf("#%02X%02X%02X", r, g, b)}
}

func RGBAt(img image.Image, pixel ImagePixel) (RGB, error) {
	if img == nil {
		return RGB{}, errors.New("capture image is required")
	}
	bounds := img.Bounds()
	x, y := bounds.Min.X+pixel.X, bounds.Min.Y+pixel.Y
	if x < bounds.Min.X || y < bounds.Min.Y || x >= bounds.Max.X || y >= bounds.Max.Y {
		return RGB{}, fmt.Errorf("capture pixel (%d,%d) is outside %dx%d image", pixel.X, pixel.Y, bounds.Dx(), bounds.Dy())
	}
	r, g, b, _ := img.At(x, y).RGBA()
	return NewRGB(uint8(r>>8), uint8(g>>8), uint8(b>>8)), nil
}

type EdgeDistances struct {
	Left   float64 `json:"left"`
	Top    float64 `json:"top"`
	Right  float64 `json:"right"`
	Bottom float64 `json:"bottom"`
}

func DistancesToReference(target, reference Rect) EdgeDistances {
	return EdgeDistances{
		Left: target.X - reference.X, Top: target.Y - reference.Y,
		Right: reference.Right() - target.Right(), Bottom: reference.Bottom() - target.Bottom(),
	}
}

type RelativePoint struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	RatioX *float64 `json:"ratioX"`
	RatioY *float64 `json:"ratioY"`
}

func PointRelativeTo(point Point, reference Rect) RelativePoint {
	relative := RelativePoint{X: point.X - reference.X, Y: point.Y - reference.Y}
	if reference.Width != 0 {
		value := relative.X / reference.Width
		relative.RatioX = &value
	}
	if reference.Height != 0 {
		value := relative.Y / reference.Height
		relative.RatioY = &value
	}
	return relative
}

type RelativeRect struct {
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	Width       float64  `json:"width"`
	Height      float64  `json:"height"`
	XRatio      *float64 `json:"xRatio"`
	YRatio      *float64 `json:"yRatio"`
	WidthRatio  *float64 `json:"widthRatio"`
	HeightRatio *float64 `json:"heightRatio"`
}

func RectRelativeTo(target, reference Rect) RelativeRect {
	result := RelativeRect{X: target.X - reference.X, Y: target.Y - reference.Y, Width: target.Width, Height: target.Height}
	if reference.Width != 0 {
		x, width := result.X/reference.Width, result.Width/reference.Width
		result.XRatio, result.WidthRatio = &x, &width
	}
	if reference.Height != 0 {
		y, height := result.Y/reference.Height, result.Height/reference.Height
		result.YRatio, result.HeightRatio = &y, &height
	}
	return result
}

type AxisSpacing struct {
	Gap      float64 `json:"gap"`
	Delta    float64 `json:"delta"`
	Relation string  `json:"relation"`
}

type Spacing struct {
	Horizontal AxisSpacing `json:"horizontal"`
	Vertical   AxisSpacing `json:"vertical"`
}

func RegionSpacing(first, second Rect) Spacing {
	return Spacing{
		Horizontal: axisSpacing(first.X, first.Right(), second.X, second.Right(), "left", "right"),
		Vertical:   axisSpacing(first.Y, first.Bottom(), second.Y, second.Bottom(), "above", "below"),
	}
}

func axisSpacing(firstMin, firstMax, secondMin, secondMax float64, before, after string) AxisSpacing {
	delta := secondMin - firstMin
	switch {
	case firstMax < secondMin:
		return AxisSpacing{Gap: secondMin - firstMax, Delta: delta, Relation: after}
	case firstMax == secondMin:
		return AxisSpacing{Gap: 0, Delta: delta, Relation: "adjacent-" + after}
	case secondMax < firstMin:
		return AxisSpacing{Gap: firstMin - secondMax, Delta: delta, Relation: before}
	case secondMax == firstMin:
		return AxisSpacing{Gap: 0, Delta: delta, Relation: "adjacent-" + before}
	default:
		return AxisSpacing{Gap: 0, Delta: delta, Relation: "overlap"}
	}
}

type CoordinateContext struct {
	Screen   string `json:"screen"`
	Relative string `json:"relative"`
	Image    string `json:"image"`
	Ratio    string `json:"ratio"`
}

func canonicalCoordinateContext() CoordinateContext {
	return CoordinateContext{
		Screen: "screen-logical", Relative: "reference-relative-logical",
		Image: "capture-pixel", Ratio: "ratio-0-1",
	}
}

type PointMeasurement struct {
	Absolute   Point         `json:"absolute"`
	Relative   RelativePoint `json:"relative"`
	ImagePixel ImagePixel    `json:"imagePixel"`
	Color      *RGB          `json:"color,omitempty"`
}

type RegionMeasurement struct {
	Absolute      Rect          `json:"absolute"`
	Center        Point         `json:"center"`
	Relative      RelativeRect  `json:"relative"`
	EdgeDistances EdgeDistances `json:"edgeDistances"`
}

type TwoPointMeasurement struct {
	First          Point         `json:"first"`
	Second         Point         `json:"second"`
	FirstRelative  RelativePoint `json:"firstRelative"`
	SecondRelative RelativePoint `json:"secondRelative"`
	DeltaX         float64       `json:"deltaX"`
	DeltaY         float64       `json:"deltaY"`
	Distance       float64       `json:"distance"`
}

type SpacingMeasurement struct {
	First   Rect    `json:"first"`
	Second  Rect    `json:"second"`
	Spacing Spacing `json:"spacing"`
}

type Result struct {
	Version         int                  `json:"version"`
	Kind            string               `json:"kind"`
	CoordinateSpace CoordinateContext    `json:"coordinateSpace"`
	Snapshot        Snapshot             `json:"snapshot"`
	Reference       Reference            `json:"reference"`
	Point           *PointMeasurement    `json:"point,omitempty"`
	Region          *RegionMeasurement   `json:"region,omitempty"`
	TwoPoint        *TwoPointMeasurement `json:"twoPoint,omitempty"`
	Spacing         *SpacingMeasurement  `json:"spacing,omitempty"`
}

func BuildPointResult(snapshot Snapshot, reference Reference, point Point, img image.Image) (Result, error) {
	if err := validateContext(snapshot, reference); err != nil {
		return Result{}, err
	}
	pixel, inside := snapshot.Mapping.PixelAt(point)
	measurement := PointMeasurement{Absolute: point, Relative: PointRelativeTo(point, reference.Bounds), ImagePixel: pixel}
	if inside && img != nil {
		color, err := RGBAt(img, pixel)
		if err != nil {
			return Result{}, err
		}
		measurement.Color = &color
	}
	return newResult("point", snapshot, reference, &measurement, nil, nil, nil), nil
}

func BuildRegionResult(snapshot Snapshot, reference Reference, region Rect) (Result, error) {
	if err := validateContext(snapshot, reference); err != nil {
		return Result{}, err
	}
	if !validRect(region) || region.Width < 0 || region.Height < 0 {
		return Result{}, errors.New("region requires finite non-negative dimensions")
	}
	measurement := RegionMeasurement{
		Absolute: region, Center: region.Center(), Relative: RectRelativeTo(region, reference.Bounds),
		EdgeDistances: DistancesToReference(region, reference.Bounds),
	}
	return newResult("region", snapshot, reference, nil, &measurement, nil, nil), nil
}

func BuildTwoPointResult(snapshot Snapshot, reference Reference, first, second Point) (Result, error) {
	if err := validateContext(snapshot, reference); err != nil {
		return Result{}, err
	}
	if !finitePoint(first) || !finitePoint(second) {
		return Result{}, errors.New("two-point targets require finite coordinates")
	}
	dx, dy := second.X-first.X, second.Y-first.Y
	measurement := TwoPointMeasurement{
		First: first, Second: second,
		FirstRelative: PointRelativeTo(first, reference.Bounds), SecondRelative: PointRelativeTo(second, reference.Bounds),
		DeltaX: dx, DeltaY: dy, Distance: math.Hypot(dx, dy),
	}
	return newResult("twoPoint", snapshot, reference, nil, nil, &measurement, nil), nil
}

func BuildSpacingResult(snapshot Snapshot, reference Reference, first, second Rect) (Result, error) {
	if err := validateContext(snapshot, reference); err != nil {
		return Result{}, err
	}
	if !validRect(first) || !validRect(second) || first.Width < 0 || first.Height < 0 || second.Width < 0 || second.Height < 0 {
		return Result{}, errors.New("spacing targets require finite non-negative dimensions")
	}
	measurement := SpacingMeasurement{First: first, Second: second, Spacing: RegionSpacing(first, second)}
	return newResult("spacing", snapshot, reference, nil, nil, nil, &measurement), nil
}

func newResult(kind string, snapshot Snapshot, reference Reference, point *PointMeasurement, region *RegionMeasurement, twoPoint *TwoPointMeasurement, spacing *SpacingMeasurement) Result {
	return Result{
		Version: ResultVersion, Kind: kind, CoordinateSpace: canonicalCoordinateContext(), Snapshot: snapshot,
		Reference: reference, Point: point, Region: region, TwoPoint: twoPoint, Spacing: spacing,
	}
}

func validateContext(snapshot Snapshot, reference Reference) error {
	if snapshot.SampledAt.IsZero() {
		return errors.New("snapshot sampledAt is required")
	}
	if snapshot.Mapping.ScaleX <= 0 || snapshot.Mapping.ScaleY <= 0 {
		return errors.New("snapshot capture scale must be positive")
	}
	return reference.Validate()
}

type Outputs struct {
	Concise string `json:"concise"`
	Human   string `json:"human"`
	JSON    string `json:"json"`
}

func (r Result) Outputs() (Outputs, error) {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return Outputs{}, err
	}
	return Outputs{Concise: r.ConciseText(), Human: r.HumanText(), JSON: string(data)}, nil
}

func (r Result) ConciseText() string {
	ref := fmt.Sprintf("ref=%s [%.2f,%.2f %.2fx%.2f] logical", r.Reference.Type,
		r.Reference.Bounds.X, r.Reference.Bounds.Y, r.Reference.Bounds.Width, r.Reference.Bounds.Height)
	switch {
	case r.Point != nil:
		color := "color=n/a"
		if r.Point.Color != nil {
			color = "color=" + r.Point.Color.Hex
		}
		return fmt.Sprintf("点 (%.2f,%.2f) logical; relative=(%.2f,%.2f); ratio=(%s,%s); capture=(%d,%d) px; %s; %s",
			r.Point.Absolute.X, r.Point.Absolute.Y, r.Point.Relative.X, r.Point.Relative.Y,
			formatPercent(r.Point.Relative.RatioX), formatPercent(r.Point.Relative.RatioY),
			r.Point.ImagePixel.X, r.Point.ImagePixel.Y, color, ref)
	case r.Region != nil:
		return fmt.Sprintf("区域 [%.2f,%.2f %.2fx%.2f] logical; margins=(L %.2f,T %.2f,R %.2f,B %.2f); %s",
			r.Region.Absolute.X, r.Region.Absolute.Y, r.Region.Absolute.Width, r.Region.Absolute.Height,
			r.Region.EdgeDistances.Left, r.Region.EdgeDistances.Top, r.Region.EdgeDistances.Right, r.Region.EdgeDistances.Bottom, ref)
	case r.TwoPoint != nil:
		return fmt.Sprintf("两点 A(%.2f,%.2f) → B(%.2f,%.2f) logical; dx=%.2f dy=%.2f distance=%.2f; %s",
			r.TwoPoint.First.X, r.TwoPoint.First.Y, r.TwoPoint.Second.X, r.TwoPoint.Second.Y,
			r.TwoPoint.DeltaX, r.TwoPoint.DeltaY, r.TwoPoint.Distance, ref)
	case r.Spacing != nil:
		return fmt.Sprintf("两区域间距 horizontal=%.2f(%s) vertical=%.2f(%s) logical; %s",
			r.Spacing.Spacing.Horizontal.Gap, r.Spacing.Spacing.Horizontal.Relation,
			r.Spacing.Spacing.Vertical.Gap, r.Spacing.Spacing.Vertical.Relation, ref)
	default:
		return "尚无测量目标; " + ref
	}
}

func (r Result) HumanText() string {
	header := fmt.Sprintf("OpenDesk 桌面测量（%s）\n采样：%s\n坐标空间：屏幕逻辑坐标；参照相对逻辑坐标；Capture Pixel；比例为 0–1\n参照：%s x=%.2f y=%.2f w=%.2f h=%.2f\n映射：display=%s/%d origin=(%.2f,%.2f) logical=%.2fx%.2f image=%dx%d px scale=(%.4f,%.4f)",
		r.Kind, r.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano), r.Reference.Type,
		r.Reference.Bounds.X, r.Reference.Bounds.Y, r.Reference.Bounds.Width, r.Reference.Bounds.Height,
		r.Snapshot.Mapping.DisplayID, r.Snapshot.Mapping.DisplayIndex,
		r.Snapshot.Mapping.Origin.X, r.Snapshot.Mapping.Origin.Y,
		r.Snapshot.Mapping.LogicalSize.Width, r.Snapshot.Mapping.LogicalSize.Height,
		r.Snapshot.Mapping.ImageSize.Width, r.Snapshot.Mapping.ImageSize.Height,
		r.Snapshot.Mapping.ScaleX, r.Snapshot.Mapping.ScaleY)
	switch {
	case r.Point != nil:
		color := "超出 Capture，无颜色"
		if r.Point.Color != nil {
			color = fmt.Sprintf("RGB(%d,%d,%d) %s", r.Point.Color.R, r.Point.Color.G, r.Point.Color.B, r.Point.Color.Hex)
		}
		return fmt.Sprintf("%s\n点：absolute=(%.2f,%.2f) relative=(%.2f,%.2f) ratio=(%s,%s) image=(%d,%d) %s",
			header, r.Point.Absolute.X, r.Point.Absolute.Y, r.Point.Relative.X, r.Point.Relative.Y,
			formatRatio(r.Point.Relative.RatioX), formatRatio(r.Point.Relative.RatioY),
			r.Point.ImagePixel.X, r.Point.ImagePixel.Y, color)
	case r.Region != nil:
		return fmt.Sprintf("%s\n区域：x=%.2f y=%.2f w=%.2f h=%.2f center=(%.2f,%.2f)\n相对：x=%.2f y=%.2f w=%.2f h=%.2f ratios=(%s,%s,%s,%s)\n四边距：left=%.2f top=%.2f right=%.2f bottom=%.2f（正=参照内余量，0=重合，负=越界）",
			header, r.Region.Absolute.X, r.Region.Absolute.Y, r.Region.Absolute.Width, r.Region.Absolute.Height,
			r.Region.Center.X, r.Region.Center.Y, r.Region.Relative.X, r.Region.Relative.Y,
			r.Region.Relative.Width, r.Region.Relative.Height,
			formatRatio(r.Region.Relative.XRatio), formatRatio(r.Region.Relative.YRatio), formatRatio(r.Region.Relative.WidthRatio), formatRatio(r.Region.Relative.HeightRatio),
			r.Region.EdgeDistances.Left, r.Region.EdgeDistances.Top, r.Region.EdgeDistances.Right, r.Region.EdgeDistances.Bottom)
	case r.TwoPoint != nil:
		return fmt.Sprintf("%s\n第一点：absolute=(%.2f,%.2f) relative=(%.2f,%.2f)\n第二点：absolute=(%.2f,%.2f) relative=(%.2f,%.2f)\n两点距离：dx=%.2f dy=%.2f euclidean=%.2f logical",
			header, r.TwoPoint.First.X, r.TwoPoint.First.Y, r.TwoPoint.FirstRelative.X, r.TwoPoint.FirstRelative.Y,
			r.TwoPoint.Second.X, r.TwoPoint.Second.Y, r.TwoPoint.SecondRelative.X, r.TwoPoint.SecondRelative.Y,
			r.TwoPoint.DeltaX, r.TwoPoint.DeltaY, r.TwoPoint.Distance)
	case r.Spacing != nil:
		return fmt.Sprintf("%s\n第一个：x=%.2f y=%.2f w=%.2f h=%.2f\n第二个：x=%.2f y=%.2f w=%.2f h=%.2f\n两区域间距：horizontal=%.2f (%s, delta=%.2f) vertical=%.2f (%s, delta=%.2f)",
			header, r.Spacing.First.X, r.Spacing.First.Y, r.Spacing.First.Width, r.Spacing.First.Height,
			r.Spacing.Second.X, r.Spacing.Second.Y, r.Spacing.Second.Width, r.Spacing.Second.Height,
			r.Spacing.Spacing.Horizontal.Gap, r.Spacing.Spacing.Horizontal.Relation,
			r.Spacing.Spacing.Horizontal.Delta, r.Spacing.Spacing.Vertical.Gap,
			r.Spacing.Spacing.Vertical.Relation, r.Spacing.Spacing.Vertical.Delta)
	default:
		return header + "\n尚无测量目标"
	}
}

func formatRatio(value *float64) string {
	if value == nil {
		return "n/a"
	}
	return fmt.Sprintf("%.6f", *value)
}

func formatPercent(value *float64) string {
	if value == nil {
		return "n/a"
	}
	return fmt.Sprintf("%.2f%%", *value*100)
}

func finite(value float64) bool    { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func finitePoint(point Point) bool { return finite(point.X) && finite(point.Y) }
func validRect(rect Rect) bool {
	return finite(rect.X) && finite(rect.Y) && finite(rect.Width) && finite(rect.Height)
}
