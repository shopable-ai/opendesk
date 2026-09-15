package main

import (
	"context"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"opendesk/automation"
	"opendesk/pkg/measurement"
)

func newAppMeasurementCandidateProviders() []measurement.SnapshotCandidateProvider {
	return []measurement.SnapshotCandidateProvider{
		appMeasurementAccessibilityCandidates{},
		&appMeasurementVisionCandidates{vision: automation.NewVision(), cache: map[string]appMeasurementVisionCache{}},
	}
}

type appMeasurementAccessibilityCandidates struct{}

func (appMeasurementAccessibilityCandidates) Name() string { return "accessibility" }

func (appMeasurementAccessibilityCandidates) Candidates(ctx context.Context, request measurement.SnapshotCandidateRequest) ([]measurement.SnapshotCandidate, error) {
	if err := request.Token.Validate(); err != nil {
		return nil, err
	}
	if request.Reference.Window == nil {
		return nil, fmt.Errorf("measurement accessibility candidates require an exact target window")
	}
	manager := automation.NewWindowManager()
	windows, err := measurementWindows(manager)
	if err != nil {
		return nil, err
	}
	var selected measurementWindowRow
	found := false
	for _, window := range windows {
		if window.id == request.Reference.Window.ID {
			selected, found = window, true
			break
		}
	}
	if !found || selected.pid != request.Reference.Window.PID || selected.handle == 0 {
		return nil, fmt.Errorf("measurement accessibility target window is stale")
	}
	currentBounds := measurement.Rect{X: selected.x, Y: selected.y, Width: selected.width, Height: selected.height}
	if !measurementCandidateSameBounds(currentBounds, request.Reference.Bounds, 2) {
		return nil, fmt.Errorf("measurement accessibility target geometry changed after the frozen snapshot")
	}
	window := &automation.WindowInfo{
		ID: selected.id, Title: selected.title, ProcessID: uint32(selected.pid), Handle: selected.handle,
		X: int32(math.Round(selected.x)), Y: int32(math.Round(selected.y)), Width: int32(math.Round(selected.width)), Height: int32(math.Round(selected.height)),
		ExeName: stringValue(selected.raw["exeName"]), ExePath: stringValue(selected.raw["exePath"]), IsForeground: selected.isActive,
	}
	observation, observeErr := automation.ObserveAccessibilityAtPoint(ctx, window, int(math.Round(request.Pointer.X)), int(math.Round(request.Pointer.Y)))
	if observation == nil {
		return nil, observeErr
	}
	reliability := measurement.CandidateReliabilityReliable
	if !observation.Complete {
		reliability = measurement.CandidateReliabilityEstimated
	}
	candidates := make([]measurement.SnapshotCandidate, 0, len(observation.Elements))
	for index, element := range observation.Elements {
		bounds := measurement.Rect{X: element.Bounds.X, Y: element.Bounds.Y, Width: element.Bounds.Width, Height: element.Bounds.Height}
		label := strings.TrimSpace(element.Name)
		if label == "" {
			label = strings.TrimSpace(element.Role)
		}
		confidence := 0.94
		if element.Relation == "hit" {
			confidence = 0.99
		}
		candidates = append(candidates, measurement.SnapshotCandidate{
			CandidateDescriptor: measurement.CandidateDescriptor{
				ID: fmt.Sprintf("%s:%s:%d", element.Source, element.Relation, index), Label: label, Source: element.Source,
				Bounds: bounds, Reliability: reliability, Semantic: true, StableRelocationHint: false,
			},
			Token: request.Token, Role: element.Role, Name: element.Name, Identifier: element.Identifier, Confidence: confidence,
		})
	}
	if len(candidates) == 0 && observeErr == nil {
		observeErr = fmt.Errorf("measurement accessibility provider returned no bounded candidate")
	}
	if !observation.Complete {
		partialErr := fmt.Errorf("measurement accessibility snapshot is partial: %s", strings.TrimSpace(observation.Reason))
		if observeErr == nil {
			observeErr = partialErr
		}
	}
	return candidates, observeErr
}

func measurementCandidateSameBounds(first, second measurement.Rect, tolerance float64) bool {
	if tolerance < 0 {
		tolerance = 0
	}
	return math.Abs(first.X-second.X) <= tolerance && math.Abs(first.Y-second.Y) <= tolerance &&
		math.Abs(first.Width-second.Width) <= tolerance && math.Abs(first.Height-second.Height) <= tolerance
}

type appMeasurementVisualLine struct {
	text       string
	confidence float64
	x          int
	y          int
	width      int
	height     int
}

type appMeasurementVisionCache struct {
	provider string
	lines    []appMeasurementVisualLine
}

type appMeasurementVisionCandidates struct {
	mu     sync.Mutex
	vision *automation.Vision
	cache  map[string]appMeasurementVisionCache
}

func (*appMeasurementVisionCandidates) Name() string { return "vision-ocr" }

func (p *appMeasurementVisionCandidates) Candidates(ctx context.Context, request measurement.SnapshotCandidateRequest) ([]measurement.SnapshotCandidate, error) {
	if p == nil || p.vision == nil {
		return nil, fmt.Errorf("measurement vision provider is unavailable")
	}
	if err := request.Token.Validate(); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.ImagePath) == "" {
		return nil, fmt.Errorf("measurement vision provider requires the frozen snapshot image")
	}
	cacheKey := request.Token.SessionID + ":" + fmt.Sprint(request.Token.Generation) + ":" + request.Token.SnapshotID
	p.mu.Lock()
	cached, ok := p.cache[cacheKey]
	p.mu.Unlock()
	if !ok {
		timeoutMS := 2500
		if deadline, hasDeadline := ctx.Deadline(); hasDeadline {
			remaining := time.Until(deadline)
			if remaining <= 0 {
				return nil, context.DeadlineExceeded
			}
			if value := int(remaining / time.Millisecond); value > 0 && value < timeoutMS {
				timeoutMS = value
			}
		}
		result, err := p.vision.RunOCR(map[string]interface{}{
			"imagePath": request.ImagePath,
			"timeoutMs": timeoutMS,
		})
		if err != nil {
			return nil, err
		}
		cached = appMeasurementVisionCache{provider: strings.TrimSpace(stringValue(result["provider"])), lines: measurementVisionLines(result["lines"])}
		if cached.provider == "" {
			cached.provider = "unknown"
		}
		p.mu.Lock()
		// Keep only the current frozen generation in this per-service cache.
		p.cache = map[string]appMeasurementVisionCache{cacheKey: cached}
		p.mu.Unlock()
	}

	mapping := request.Snapshot.Mapping
	candidates := make([]measurement.SnapshotCandidate, 0, len(cached.lines))
	for index, line := range cached.lines {
		if strings.TrimSpace(line.text) == "" || line.width <= 0 || line.height <= 0 {
			continue
		}
		first := mapping.ImageToLogical(measurement.Point{X: float64(line.x), Y: float64(line.y)})
		second := mapping.ImageToLogical(measurement.Point{X: float64(line.x + line.width), Y: float64(line.y + line.height)})
		bounds := measurement.Rect{X: math.Min(first.X, second.X), Y: math.Min(first.Y, second.Y), Width: math.Abs(second.X - first.X), Height: math.Abs(second.Y - first.Y)}
		reliability := measurement.CandidateReliabilityEstimated
		if line.confidence >= 0.9 {
			reliability = measurement.CandidateReliabilityReliable
		}
		candidates = append(candidates, measurement.SnapshotCandidate{
			CandidateDescriptor: measurement.CandidateDescriptor{
				ID: fmt.Sprintf("ocr:%s:%d", cached.provider, index), Label: line.text, Source: "ocr:" + cached.provider,
				Bounds: bounds, Reliability: reliability, Semantic: false, StableRelocationHint: false,
			},
			Token: request.Token, Confidence: measurementCandidateConfidence(line.confidence),
		})
	}
	if len(candidates) == 0 {
		return nil, fmt.Errorf("measurement vision provider returned no bounded OCR candidate")
	}
	return candidates, nil
}

func measurementCandidateConfidence(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func measurementVisionLines(raw interface{}) []appMeasurementVisualLine {
	result := []appMeasurementVisualLine{}
	appendRow := func(row map[string]interface{}) {
		bbox, _ := row["bbox"].(map[string]int)
		if bbox == nil {
			if generic, ok := row["bbox"].(map[string]interface{}); ok {
				bbox = map[string]int{
					"x": int(numberValue(generic["x"])), "y": int(numberValue(generic["y"])),
					"width": int(numberValue(generic["width"])), "height": int(numberValue(generic["height"])),
				}
			}
		}
		if bbox == nil {
			return
		}
		result = append(result, appMeasurementVisualLine{
			text: strings.TrimSpace(stringValue(row["text"])), confidence: numberValue(row["confidence"]),
			x: bbox["x"], y: bbox["y"], width: bbox["width"], height: bbox["height"],
		})
	}
	switch rows := raw.(type) {
	case []map[string]interface{}:
		for _, row := range rows {
			appendRow(row)
		}
	case []interface{}:
		for _, item := range rows {
			if row, ok := item.(map[string]interface{}); ok {
				appendRow(row)
			}
		}
	}
	return result
}
