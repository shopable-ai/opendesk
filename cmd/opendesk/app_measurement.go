package main

import (
	"bytes"
	"context"
	"fmt"
	"image/png"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"opendesk/automation"
	"opendesk/pkg/measurement"
)

const (
	measurementReferenceResolverInterval = 48 * time.Millisecond
	measurementReferenceClickTolerance   = 4.0
)

type appMeasurementCapture struct {
	observePointerSelection func(context.Context, func(automation.PointerSelectionEvent) bool) error
}

type measurementWindowRow struct {
	id       string
	title    string
	pid      int64
	handle   uint64
	x        float64
	y        float64
	width    float64
	height   float64
	isActive bool
	raw      map[string]interface{}
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

type measurementReferenceSelectionState struct {
	candidate    measurementWindowRow
	hasCandidate bool
	pressed      measurementWindowRow
	hasPressed   bool
	pressX       int
	pressY       int
	selected     measurementWindowRow
	hasSelected  bool
	canceled     bool
}

func (capture appMeasurementCapture) Capture(ctx context.Context, targetID string) (measurement.CaptureFrame, error) {
	windowManager := automation.NewWindowManager()
	var selected measurementWindowRow
	var err error
	if strings.TrimSpace(targetID) == "" {
		observe := capture.observePointerSelection
		if observe == nil {
			observe = automation.ObservePointerSelection
		}
		// Initial acquisition is live and intentionally precedes Screenshot.
		// Entering Desktop Measurement therefore does not create a frozen source;
		// only a same-window click confirmation is allowed to cross this gate.
		selected, err = selectMeasurementReference(ctx, windowManager, observe)
		if err != nil {
			return measurement.CaptureFrame{}, err
		}
	}

	targets, err := measurementWindows(windowManager)
	if err != nil {
		return measurement.CaptureFrame{}, err
	}
	if strings.TrimSpace(targetID) == "" {
		var ok bool
		selected, ok = revalidateMeasurementReference(targets, selected)
		if !ok {
			return measurement.CaptureFrame{}, fmt.Errorf("confirmed measurement reference changed before capture")
		}
	} else {
		var ok bool
		selected, ok = selectMeasurementWindow(targets, targetID)
		if !ok {
			return measurement.CaptureFrame{}, fmt.Errorf("target window %q is no longer available", targetID)
		}
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
		targetOptions = append(targetOptions, measurement.TargetWindow{
			ID: target.id, Title: target.title, PID: target.pid,
		})
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
		// A CaptureFrame reaching the service has crossed explicit initial
		// confirmation or is an explicit Update of an already locked target.
		TargetConfirmed: true,
		Restore:         measurementRestoreTarget(windowManager, selected),
	}, nil
}

func selectMeasurementReference(
	ctx context.Context,
	manager *automation.WindowManager,
	observe func(context.Context, func(automation.PointerSelectionEvent) bool) error,
) (measurementWindowRow, error) {
	if manager == nil || observe == nil {
		return measurementWindowRow{}, fmt.Errorf("measurement reference selector is unavailable")
	}
	state := measurementReferenceSelectionState{}
	var resolveErr error
	var lastResolved time.Time
	err := observe(ctx, func(event automation.PointerSelectionEvent) bool {
		if event.Kind == automation.PointerSelectionCancel {
			return state.apply(event, measurementWindowRow{}, false)
		}
		if event.Kind != automation.PointerSelectionMove && event.Kind != automation.PointerSelectionPress && event.Kind != automation.PointerSelectionRelease {
			return false
		}
		force := event.Kind == automation.PointerSelectionPress || event.Kind == automation.PointerSelectionRelease
		now := time.Now()
		if !force && !lastResolved.IsZero() && now.Sub(lastResolved) < measurementReferenceResolverInterval {
			return false
		}
		candidate, ok, candidateErr := measurementWindowAtPoint(manager, float64(event.X), float64(event.Y))
		if candidateErr != nil {
			resolveErr = candidateErr
			return true
		}
		lastResolved = now
		return state.apply(event, candidate, ok)
	})
	if resolveErr != nil {
		return measurementWindowRow{}, resolveErr
	}
	if err != nil {
		return measurementWindowRow{}, err
	}
	if state.canceled {
		return measurementWindowRow{}, fmt.Errorf("measurement reference selection canceled")
	}
	if !state.hasSelected {
		return measurementWindowRow{}, fmt.Errorf("measurement reference selection ended without a confirmed window")
	}
	return state.selected, nil
}

func (state *measurementReferenceSelectionState) apply(event automation.PointerSelectionEvent, candidate measurementWindowRow, hasCandidate bool) bool {
	if state == nil {
		return true
	}
	if event.Kind == automation.PointerSelectionCancel {
		state.canceled = true
		return true
	}
	state.candidate, state.hasCandidate = candidate, hasCandidate
	switch event.Kind {
	case automation.PointerSelectionPress:
		if event.Button != 1 || !hasCandidate {
			state.hasPressed = false
			return false
		}
		state.pressed, state.hasPressed = candidate, true
		state.pressX, state.pressY = event.X, event.Y
	case automation.PointerSelectionRelease:
		if event.Button != 1 || !state.hasPressed || !hasCandidate {
			state.hasPressed = false
			return false
		}
		movement := math.Hypot(float64(event.X-state.pressX), float64(event.Y-state.pressY))
		if movement <= measurementReferenceClickTolerance && sameMeasurementWindowObservation(state.pressed, candidate) {
			state.selected, state.hasSelected = candidate, true
			state.hasPressed = false
			return true
		}
		state.hasPressed = false
	}
	return false
}

func measurementWindowAtPoint(manager *automation.WindowManager, x, y float64) (measurementWindowRow, bool, error) {
	rows, err := manager.List()
	if err != nil {
		return measurementWindowRow{}, false, fmt.Errorf("resolve live measurement reference: %w", err)
	}
	candidate, ok := measurementWindowAtPointRows(rows, x, y)
	return candidate, ok, nil
}

func measurementWindowAtPointRows(rows []map[string]interface{}, x, y float64) (measurementWindowRow, bool) {
	// WindowManager.List preserves the platform backend's current enumeration
	// order. macOS CGWindowList and Windows EnumWindows are front-to-back; the
	// first eligible containing row is therefore the live topmost candidate.
	for _, row := range rows {
		candidate := measurementWindowFromMap(row)
		if candidate.id == "" || strings.TrimSpace(candidate.title) == "" || candidate.width <= 0 || candidate.height <= 0 || measurementExcludedWindow(candidate) {
			continue
		}
		if x >= candidate.x && x < candidate.x+candidate.width && y >= candidate.y && y < candidate.y+candidate.height {
			return candidate, true
		}
	}
	return measurementWindowRow{}, false
}

func revalidateMeasurementReference(windows []measurementWindowRow, selected measurementWindowRow) (measurementWindowRow, bool) {
	for _, current := range windows {
		if sameMeasurementWindowObservation(selected, current) {
			return current, true
		}
	}
	return measurementWindowRow{}, false
}

func sameMeasurementWindowObservation(first, second measurementWindowRow) bool {
	return first.id != "" && first.id == second.id && first.pid == second.pid && first.handle != 0 && first.handle == second.handle &&
		first.x == second.x && first.y == second.y && first.width == second.width && first.height == second.height
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
		if item.id == "" || strings.TrimSpace(item.title) == "" || item.width <= 0 || item.height <= 0 || seen[item.id] || measurementExcludedWindow(item) {
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
			item := measurementWindowFromInfo(active)
			if !measurementExcludedWindow(item) {
				windows = append(windows, item)
			}
		}
	}
	for index := range windows {
		windows[index].isActive = windows[index].id == activeID
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

func measurementExcludedWindow(window measurementWindowRow) bool {
	if window.pid == int64(os.Getpid()) {
		return true
	}
	executable := strings.ToLower(stringValue(window.raw["exeName"]))
	title := strings.ToLower(strings.TrimSpace(window.title))
	return strings.Contains(executable, "opendesk-ui-host") || strings.Contains(executable, "clawdesk-ui-host") ||
		strings.HasPrefix(title, "opendesk") || strings.HasPrefix(title, "clawdesk")
}

func measurementWindowFromMap(row map[string]interface{}) measurementWindowRow {
	return measurementWindowRow{
		id: stringValue(row["id"]), title: stringValue(row["title"]), pid: int64(numberValue(row["pid"])), handle: uint64(numberValue(row["handle"])),
		x: numberValue(row["x"]), y: numberValue(row["y"]), width: numberValue(row["width"]), height: numberValue(row["height"]),
		raw: measurementWindowExactTarget(row),
	}
}

func measurementWindowFromInfo(info *automation.WindowInfo) measurementWindowRow {
	if info == nil {
		return measurementWindowRow{}
	}
	return measurementWindowFromMap(map[string]interface{}{
		"id": info.ID, "title": info.Title, "pid": info.ProcessID, "handle": info.Handle,
		"x": info.X, "y": info.Y, "width": info.Width, "height": info.Height,
		"exeName": info.ExeName, "exePath": info.ExePath,
	})
}

// measurementWindowExactTarget keeps the existing WindowInfo contract intact:
// recovery will fail closed when a PID/native-handle observation is gone rather
// than resolving a same-titled replacement window.
func measurementWindowExactTarget(row map[string]interface{}) map[string]interface{} {
	if row == nil {
		return nil
	}
	target := map[string]interface{}{
		"id": stringValue(row["id"]), "title": stringValue(row["title"]),
		"pid": uint32(numberValue(row["pid"])), "handle": uint64(numberValue(row["handle"])),
		"x": int32(numberValue(row["x"])), "y": int32(numberValue(row["y"])),
		"width": int32(numberValue(row["width"])), "height": int32(numberValue(row["height"])),
	}
	if value := stringValue(row["exeName"]); value != "" {
		target["exeName"] = value
	}
	if value := stringValue(row["exePath"]); value != "" {
		target["exePath"] = value
	}
	return target
}

func measurementRestoreTarget(manager *automation.WindowManager, selected measurementWindowRow) func(context.Context) error {
	if manager == nil || len(selected.raw) == 0 || selected.handle == 0 {
		return nil
	}
	target := selected.raw
	return func(ctx context.Context) error {
		if ctx != nil {
			if err := ctx.Err(); err != nil {
				return err
			}
		}
		if _, err := manager.Activate(target, 1500); err != nil {
			return fmt.Errorf("恢复进入前窗口受限：%w", err)
		}
		return nil
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
