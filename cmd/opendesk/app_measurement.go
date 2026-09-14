package main

import (
	"bytes"
	"context"
	"fmt"
	"image/png"
	"sort"
	"strconv"
	"strings"
	"time"

	"opendesk/automation"
	"opendesk/pkg/measurement"
)

type appMeasurementCapture struct{}

type measurementWindowRow struct {
	id     string
	title  string
	pid    int64
	x      float64
	y      float64
	width  float64
	height float64
}

type measurementDisplayRow struct {
	index       int
	id          string
	isPrimary   bool
	x           float64
	y           float64
	width       float64
	height      float64
	pixelWidth  int
	pixelHeight int
}

func (appMeasurementCapture) Capture(ctx context.Context, targetID string) (measurement.CaptureFrame, error) {
	windowManager := automation.NewWindowManager()
	targets, err := measurementWindows(windowManager)
	if err != nil {
		return measurement.CaptureFrame{}, err
	}
	selected, ok := selectMeasurementWindow(targets, targetID)
	if !ok {
		return measurement.CaptureFrame{}, fmt.Errorf("target window %q is no longer available", targetID)
	}
	displays := measurementDisplays(automation.NewScreen().GetDisplays())
	display, ok := selectMeasurementDisplay(displays, selected)
	if !ok {
		return measurement.CaptureFrame{}, fmt.Errorf("no display is available for target window %q", selected.title)
	}
	result, err := automation.NewPageWithContext(ctx).Screenshot(automation.ScreenshotOptions{
		Type: "png", Target: "screen", DisplayIndex: display.index, ReturnType: "bytes",
	})
	if err != nil {
		return measurement.CaptureFrame{}, err
	}
	pngBytes, ok := result.([]byte)
	if !ok || len(pngBytes) == 0 {
		return measurement.CaptureFrame{}, fmt.Errorf("screen screenshot returned %T instead of PNG bytes", result)
	}
	config, err := png.DecodeConfig(bytes.NewReader(pngBytes))
	if err != nil {
		return measurement.CaptureFrame{}, fmt.Errorf("decode captured display dimensions: %w", err)
	}
	mapping, err := measurement.NewCaptureMapping(
		measurement.Point{X: display.x, Y: display.y},
		measurement.Size{Width: display.width, Height: display.height},
		measurement.PixelSize{Width: config.Width, Height: config.Height},
		display.id,
		display.index,
	)
	if err != nil {
		return measurement.CaptureFrame{}, err
	}
	targetOptions := make([]measurement.TargetWindow, 0, len(targets))
	for _, target := range targets {
		targetOptions = append(targetOptions, measurement.TargetWindow{ID: target.id, Title: target.title, PID: target.pid})
	}
	return measurement.CaptureFrame{
		PNG:      pngBytes,
		Snapshot: measurement.Snapshot{SampledAt: time.Now().UTC(), Mapping: mapping},
		Reference: measurement.Reference{
			Type:   measurement.ReferenceWindowOuter,
			Bounds: measurement.Rect{X: selected.x, Y: selected.y, Width: selected.width, Height: selected.height},
			Window: &measurement.WindowIdentity{ID: selected.id, PID: selected.pid, Title: selected.title},
		},
		Targets: targetOptions, SelectedTargetID: selected.id,
	}, nil
}

func measurementWindows(manager *automation.WindowManager) ([]measurementWindowRow, error) {
	rows, err := manager.List()
	if err != nil {
		return nil, fmt.Errorf("list target windows: %w", err)
	}
	windows := make([]measurementWindowRow, 0, len(rows)+1)
	seen := map[string]bool{}
	for _, row := range rows {
		item := measurementWindowFromMap(row)
		if item.id == "" || strings.TrimSpace(item.title) == "" || item.width <= 0 || item.height <= 0 || seen[item.id] {
			continue
		}
		seen[item.id] = true
		windows = append(windows, item)
	}
	active, activeErr := manager.GetActiveWindow()
	activeID := ""
	if activeErr == nil && active != nil && active.Width > 0 && active.Height > 0 {
		activeID = active.ID
		if !seen[active.ID] {
			windows = append(windows, measurementWindowRow{id: active.ID, title: active.Title, pid: int64(active.ProcessID), x: float64(active.X), y: float64(active.Y), width: float64(active.Width), height: float64(active.Height)})
		}
	}
	if len(windows) == 0 {
		if activeErr != nil {
			return nil, fmt.Errorf("resolve active target window: %w", activeErr)
		}
		return nil, fmt.Errorf("no measurable target window is available")
	}
	sort.SliceStable(windows, func(i, j int) bool {
		if windows[i].id == activeID {
			return true
		}
		if windows[j].id == activeID {
			return false
		}
		return strings.ToLower(windows[i].title) < strings.ToLower(windows[j].title)
	})
	return windows, nil
}

func measurementWindowFromMap(row map[string]interface{}) measurementWindowRow {
	return measurementWindowRow{
		id: stringValue(row["id"]), title: stringValue(row["title"]), pid: int64(numberValue(row["pid"])),
		x: numberValue(row["x"]), y: numberValue(row["y"]), width: numberValue(row["width"]), height: numberValue(row["height"]),
	}
}

func selectMeasurementWindow(windows []measurementWindowRow, id string) (measurementWindowRow, bool) {
	if id == "" && len(windows) > 0 {
		return windows[0], true
	}
	for _, window := range windows {
		if window.id == id {
			return window, true
		}
	}
	return measurementWindowRow{}, false
}

func measurementDisplays(rows []map[string]interface{}) []measurementDisplayRow {
	result := make([]measurementDisplayRow, 0, len(rows))
	for _, row := range rows {
		display := measurementDisplayRow{
			index: int(numberValue(row["index"])), id: stringValue(row["id"]), isPrimary: boolValue(row["isPrimary"]),
			x: numberValue(row["x"]), y: numberValue(row["y"]), width: numberValue(row["width"]), height: numberValue(row["height"]),
			pixelWidth: int(numberValue(row["pixelWidth"])), pixelHeight: int(numberValue(row["pixelHeight"])),
		}
		if display.index > 0 && display.width > 0 && display.height > 0 && display.pixelWidth > 0 && display.pixelHeight > 0 {
			result = append(result, display)
		}
	}
	return result
}

func selectMeasurementDisplay(displays []measurementDisplayRow, window measurementWindowRow) (measurementDisplayRow, bool) {
	if len(displays) == 0 {
		return measurementDisplayRow{}, false
	}
	bestIndex, bestArea := -1, -1.0
	for index, display := range displays {
		left := maxNumber(window.x, display.x)
		top := maxNumber(window.y, display.y)
		right := minNumber(window.x+window.width, display.x+display.width)
		bottom := minNumber(window.y+window.height, display.y+display.height)
		area := maxNumber(0, right-left) * maxNumber(0, bottom-top)
		if area > bestArea {
			bestIndex, bestArea = index, area
		}
	}
	if bestArea > 0 {
		return displays[bestIndex], true
	}
	for _, display := range displays {
		if display.isPrimary {
			return display, true
		}
	}
	return displays[0], true
}

func stringValue(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprint(value)
	}
}

func numberValue(value interface{}) float64 {
	switch typed := value.(type) {
	case int:
		return float64(typed)
	case int32:
		return float64(typed)
	case int64:
		return float64(typed)
	case uint:
		return float64(typed)
	case uint32:
		return float64(typed)
	case uint64:
		return float64(typed)
	case float32:
		return float64(typed)
	case float64:
		return typed
	case string:
		parsed, _ := strconv.ParseFloat(typed, 64)
		return parsed
	default:
		return 0
	}
}

func boolValue(value interface{}) bool {
	typed, _ := value.(bool)
	return typed
}

func minNumber(first, second float64) float64 {
	if first < second {
		return first
	}
	return second
}

func maxNumber(first, second float64) float64 {
	if first > second {
		return first
	}
	return second
}
