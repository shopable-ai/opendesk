package inspector

import (
	"bytes"
	"context"
	"image"
	_ "image/png"
	"math"
	"strings"
	"time"

	"opendesk/automation"
)

const (
	visualMaximumLogicalDimension = 4096
	visualMaximumPixelDimension   = 8192
	visualMaximumPNGBytes         = 5 << 20
)

// VisualCaptureResult is the private, in-memory result consumed only by the
// Inspector HTTP service. It deliberately has no caller-controlled path or
// clip and is never exposed through the public Page screenshot contract.
type VisualCaptureResult struct {
	PNG                []byte
	PixelWidth         int
	PixelHeight        int
	Bounds             Bounds
	CapturedAt         time.Time
	Method             string
	Scope              string
	ForegroundVerified bool
	OcclusionRisk      bool
}

type visualPixels struct {
	png           []byte
	width         int
	height        int
	method        string
	scope         string
	occlusionRisk bool
}

// CaptureVisual re-resolves the exact native window before and after capture.
// It never focuses, raises, moves, or otherwise mutates the target window.
func (r *RuntimeRunner) CaptureVisual(ctx context.Context, expected WindowCandidate) (VisualCaptureResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := validateVisualWindow(expected); err != nil {
		return VisualCaptureResult{}, err
	}
	before, err := r.resolveVisualWindow(ctx, expected)
	if err != nil {
		return VisualCaptureResult{}, err
	}
	pixels, err := captureVisualPixels(ctx, before)
	if err != nil {
		return VisualCaptureResult{}, err
	}
	capturedAt := time.Now().UTC()
	if err := ctx.Err(); err != nil {
		return VisualCaptureResult{}, err
	}
	after, err := r.resolveVisualWindow(ctx, expected)
	if err != nil {
		return VisualCaptureResult{}, err
	}
	if !sameVisualWindow(before, after) {
		return VisualCaptureResult{}, staleVisualWindowError()
	}
	if pixels.width <= 0 || pixels.height <= 0 ||
		pixels.width > visualMaximumPixelDimension || pixels.height > visualMaximumPixelDimension {
		return VisualCaptureResult{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: pixels.method}
	}
	logicalAspect := before.Bounds.Width / before.Bounds.Height
	pixelAspect := float64(pixels.width) / float64(pixels.height)
	if math.Abs(logicalAspect-pixelAspect)/logicalAspect > 0.01 {
		return VisualCaptureResult{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: pixels.method}
	}
	if len(pixels.png) == 0 || len(pixels.png) > visualMaximumPNGBytes {
		return VisualCaptureResult{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: pixels.method}
	}
	return VisualCaptureResult{
		PNG: append([]byte(nil), pixels.png...), PixelWidth: pixels.width, PixelHeight: pixels.height,
		Bounds: before.Bounds, CapturedAt: capturedAt, Method: pixels.method, Scope: pixels.scope,
		ForegroundVerified: before.Foreground && after.Foreground,
		OcclusionRisk:      pixels.occlusionRisk,
	}, nil
}

func (r *RuntimeRunner) resolveVisualWindow(ctx context.Context, expected WindowCandidate) (WindowCandidate, error) {
	windows, err := r.Windows(ctx)
	if err != nil {
		return WindowCandidate{}, err
	}
	expectedID := visualWindowID(expected)
	var matched *WindowCandidate
	for index := range windows {
		if visualWindowID(windows[index]) != expectedID {
			continue
		}
		if matched != nil {
			return WindowCandidate{}, staleVisualWindowError()
		}
		candidate := windows[index]
		matched = &candidate
	}
	if matched == nil || !sameVisualWindow(expected, *matched) {
		return WindowCandidate{}, staleVisualWindowError()
	}
	return *matched, nil
}

func validateVisualWindow(window WindowCandidate) error {
	if strings.TrimSpace(visualWindowID(window)) == "" || window.PID <= 0 ||
		!finiteVisualBounds(window.Bounds) || window.Bounds.Width > visualMaximumLogicalDimension ||
		window.Bounds.Height > visualMaximumLogicalDimension {
		return &RuntimeError{Code: "INVALID_ARGUMENT", Stage: "window"}
	}
	return nil
}

func sameVisualWindow(expected, actual WindowCandidate) bool {
	return visualWindowID(expected) == visualWindowID(actual) &&
		expected.PID == actual.PID && expected.Title == actual.Title &&
		expected.Application == actual.Application && expected.Bounds == actual.Bounds &&
		(expected.NativeHandle == 0 || actual.NativeHandle == expected.NativeHandle)
}

func finiteVisualBounds(bounds Bounds) bool {
	return !math.IsNaN(bounds.X) && !math.IsInf(bounds.X, 0) &&
		!math.IsNaN(bounds.Y) && !math.IsInf(bounds.Y, 0) &&
		!math.IsNaN(bounds.Width) && !math.IsInf(bounds.Width, 0) &&
		!math.IsNaN(bounds.Height) && !math.IsInf(bounds.Height, 0) &&
		bounds.Width > 0 && bounds.Height > 0
}

func visualWindowID(window WindowCandidate) string {
	id, _ := window.Target["id"].(string)
	return strings.TrimSpace(id)
}

func staleVisualWindowError() error {
	return &RuntimeError{Code: "STALE_TARGET", Stage: "window", ActionState: "not_started"}
}

func captureVisibleBounds(ctx context.Context, window WindowCandidate) (visualPixels, error) {
	if err := ctx.Err(); err != nil {
		return visualPixels{}, err
	}
	x, xOK := exactVisualInteger(window.Bounds.X)
	y, yOK := exactVisualInteger(window.Bounds.Y)
	width, widthOK := exactVisualInteger(window.Bounds.Width)
	height, heightOK := exactVisualInteger(window.Bounds.Height)
	if !xOK || !yOK || !widthOK || !heightOK || width <= 0 || height <= 0 {
		return visualPixels{}, &RuntimeError{Code: "INVALID_ARGUMENT", Stage: "capture", Backend: "visible-bounds"}
	}
	result, err := automation.NewPageWithContext(ctx).Screenshot(automation.ScreenshotOptions{
		Type: "png", ReturnType: "bytes",
		Clip: &automation.ClipOptions{X: x, Y: y, Width: width, Height: height},
	})
	if err != nil {
		return visualPixels{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: "visible-bounds"}
	}
	pngBytes, ok := result.([]byte)
	if !ok || len(pngBytes) == 0 || len(pngBytes) > visualMaximumPNGBytes {
		return visualPixels{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: "visible-bounds"}
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(pngBytes))
	if err != nil {
		return visualPixels{}, &RuntimeError{Code: "BACKEND_FAILED", Stage: "capture", Backend: "visible-bounds"}
	}
	return visualPixels{
		png: pngBytes, width: config.Width, height: config.Height,
		method: "visible-bounds/robotgo", scope: "visible-bounds", occlusionRisk: true,
	}, nil
}

func exactVisualInteger(value float64) (int, bool) {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value ||
		value < float64(-1<<31) || value > float64(1<<31-1) {
		return 0, false
	}
	return int(value), true
}

func visualCaptureError(code, backend string, cause error) error {
	_ = cause // Native details stay out of the browser error surface.
	return &RuntimeError{Code: code, Stage: "capture", Backend: backend, ActionState: "not_started"}
}
