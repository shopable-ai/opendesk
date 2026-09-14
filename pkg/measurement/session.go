package measurement

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html"
	"image"
	_ "image/png"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"opendesk/pkg/customui"
)

const (
	WindowID       = "measurement-session"
	previewID      = "measurementPreview"
	eventQueueSize = 512
)

type TargetWindow struct {
	ID    string
	Title string
	PID   int64
}

type CaptureFrame struct {
	PNG              []byte
	Snapshot         Snapshot
	Reference        Reference
	Targets          []TargetWindow
	SelectedTargetID string
	// TargetConfirmed is supplied only when an entry has already obtained an
	// explicit user confirmation. Product capture intentionally leaves it false.
	TargetConfirmed bool
	// Restore is an in-process lifecycle callback supplied by the product
	// capture adapter. It reactivates the exact WindowInfo observed before
	// Measurement opened; it is intentionally never serialized with results.
	Restore func(context.Context) error
}

type CaptureAdapter interface {
	Capture(context.Context, string) (CaptureFrame, error)
}

type ClipboardWriter interface {
	Copy(string) error
}

type ServiceOptions struct {
	Driver    customui.Driver
	Capture   CaptureAdapter
	Clipboard ClipboardWriter
	BaseDir   string
	SaveDir   string
	Now       func() time.Time
}

// Service owns the one process-wide Measurement Session. Product menu,
// Recorder, and the platform shortcut must all call Open on this same value.
// Re-entry reveals the active session without refreezing or discarding state.
type Service struct {
	driver    customui.Driver
	capture   CaptureAdapter
	clipboard ClipboardWriter
	baseDir   string
	saveDir   string
	now       func() time.Time

	mu        sync.Mutex
	active    *activeSession
	opening   chan struct{}
	assetID   atomic.Uint64
	sessionID atomic.Uint64
}

type activeSession struct {
	service *Service
	session *customui.Session
	events  chan customui.Event
	done    chan struct{}

	surfaceMu  sync.RWMutex
	window     *customui.Window
	surfaceSeq uint64
	source     string

	frame           CaptureFrame
	image           image.Image
	assetPath       string
	restore         func(context.Context) error
	reference       Reference
	tool            string
	outputFormat    string
	status          string
	dragStart       *Point
	twoPointFirst   *Point
	spacingFirst    *Rect
	result          *Result
	manualPending   bool
	selectedTarget  string
	targetConfirmed bool
	closeOnce       sync.Once
	finishMu        sync.Mutex
	finishErr       error
}

type ServiceCounts struct {
	Sessions  int
	Listeners int
}

func NewService(options ServiceOptions) (*Service, error) {
	if options.Driver == nil || options.Capture == nil || options.Clipboard == nil {
		return nil, errors.New("measurement requires UI, capture, and clipboard adapters")
	}
	baseDir := strings.TrimSpace(options.BaseDir)
	if baseDir == "" {
		return nil, errors.New("measurement base directory is required")
	}
	absolute, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("resolve measurement base directory: %w", err)
	}
	if err := os.MkdirAll(absolute, 0o755); err != nil {
		return nil, fmt.Errorf("create measurement base directory: %w", err)
	}
	saveDir := strings.TrimSpace(options.SaveDir)
	if saveDir == "" {
		saveDir = filepath.Join(absolute, "results")
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	return &Service{driver: options.Driver, capture: options.Capture, clipboard: options.Clipboard, baseDir: absolute, saveDir: saveDir, now: options.Now}, nil
}

func (s *Service) Open(ctx context.Context, source string) error {
	if s == nil {
		return errors.New("measurement service is unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	for {
		s.mu.Lock()
		if current := s.active; current != nil {
			s.mu.Unlock()
			window := current.currentWindow()
			if window == nil {
				return errors.New("measurement session has no active surface")
			}
			_, err := window.Show(ctx)
			return err
		}
		if opening := s.opening; opening != nil {
			s.mu.Unlock()
			select {
			case <-opening:
				continue
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		s.opening = make(chan struct{})
		opening := s.opening
		s.mu.Unlock()

		active, err := s.openNew(ctx, source)
		s.mu.Lock()
		if err == nil {
			s.active = active
		}
		close(opening)
		s.opening = nil
		s.mu.Unlock()
		if err != nil {
			return err
		}
		go active.run()
		return nil
	}
}

func (s *Service) OpenAndWait(ctx context.Context, source string) error {
	if err := s.Open(ctx, source); err != nil {
		return err
	}
	s.mu.Lock()
	active := s.active
	s.mu.Unlock()
	if active == nil {
		return nil
	}
	select {
	case <-active.done:
		return active.finishResult()
	case <-ctx.Done():
		_ = active.finish(context.Background(), true)
		return ctx.Err()
	}
}

func (s *Service) openNew(ctx context.Context, source string) (*activeSession, error) {
	// Capture precedes any Measurement surface, so the frozen canonical image
	// cannot contain Measurement UI.
	frame, err := s.capture.Capture(ctx, "")
	if err != nil {
		return nil, fmt.Errorf("capture initial desktop snapshot: %w", err)
	}
	img, assetPath, err := s.prepareFrame(frame)
	if err != nil {
		return nil, err
	}
	active := &activeSession{
		service: s, events: make(chan customui.Event, eventQueueSize), done: make(chan struct{}),
		frame: frame, image: img, assetPath: assetPath, restore: frame.Restore, reference: frame.Reference,
		tool: "point", outputFormat: "concise", status: targetConfirmationInstruction(frame),
		selectedTarget: frame.SelectedTargetID, targetConfirmed: frame.TargetConfirmed, source: strings.TrimSpace(source),
	}
	sessionID := "measurement-" + s.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(s.sessionID.Add(1), 10)
	session, err := customui.NewSession(sessionID, s.baseDir, s.driver, active.enqueue)
	if err != nil {
		_ = os.Remove(assetPath)
		return nil, err
	}
	active.session = session
	if err := active.replaceSurface(ctx); err != nil {
		_ = session.Close(context.Background())
		_ = os.Remove(assetPath)
		return nil, err
	}
	return active, nil
}

func (a *activeSession) finishResult() error {
	a.finishMu.Lock()
	defer a.finishMu.Unlock()
	return a.finishErr
}

func (s *Service) prepareFrame(frame CaptureFrame) (image.Image, string, error) {
	if len(frame.PNG) == 0 {
		return nil, "", errors.New("measurement capture returned no PNG data")
	}
	img, format, err := image.Decode(bytes.NewReader(frame.PNG))
	if err != nil || format != "png" {
		return nil, "", fmt.Errorf("decode measurement PNG: %w", err)
	}
	if img.Bounds().Dx() != frame.Snapshot.Mapping.ImageSize.Width || img.Bounds().Dy() != frame.Snapshot.Mapping.ImageSize.Height {
		return nil, "", errors.New("measurement capture dimensions do not match capture mapping")
	}
	name := "snapshot-" + s.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(s.assetID.Add(1), 10) + ".png"
	path := filepath.Join(s.baseDir, name)
	if err := os.WriteFile(path, frame.PNG, 0o600); err != nil {
		return nil, "", fmt.Errorf("persist measurement snapshot: %w", err)
	}
	return img, path, nil
}

func (s *Service) Counts() ServiceCounts {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.active == nil {
		return ServiceCounts{}
	}
	return ServiceCounts{Sessions: 1, Listeners: 1}
}

func (s *Service) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	active := s.active
	s.mu.Unlock()
	if active == nil {
		return nil
	}
	return active.finish(ctx, true)
}

func (a *activeSession) currentWindow() *customui.Window {
	a.surfaceMu.RLock()
	defer a.surfaceMu.RUnlock()
	return a.window
}

func (a *activeSession) setWindow(window *customui.Window) {
	a.surfaceMu.Lock()
	a.window = window
	a.surfaceMu.Unlock()
}

func (a *activeSession) replaceSurface(ctx context.Context) error {
	if a.session == nil {
		return errors.New("measurement UI session is unavailable")
	}
	a.surfaceSeq++
	spec := measurementWindowSpecState(a)
	spec.ID = fmt.Sprintf("%s-%d", WindowID, a.surfaceSeq)
	window, err := a.session.Create(ctx, spec)
	if err != nil {
		return err
	}
	if _, err := window.Show(ctx); err != nil {
		_, _ = window.Close(context.Background())
		return err
	}
	old := a.currentWindow()
	a.setWindow(window)
	if old != nil {
		_, _ = old.Close(context.Background())
	}
	return nil
}

func (a *activeSession) enqueue(event customui.Event) {
	if event.Type == "measurement.pointermove" {
		select {
		case a.events <- event:
		default:
		}
		return
	}
	select {
	case a.events <- event:
	case <-a.done:
	}
}

func (a *activeSession) run() {
	for {
		select {
		case event := <-a.events:
			if event.Type == "close" {
				current := a.currentWindow()
				if current == nil || event.WindowID == current.ID() {
					_ = a.finish(context.Background(), false)
					return
				}
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			_ = a.handle(ctx, event)
			cancel()
		case <-a.done:
			return
		}
	}
}

func (a *activeSession) handle(ctx context.Context, event customui.Event) error {
	switch event.Type {
	case "click":
		switch event.TargetID {
		case "confirmTarget":
			a.targetConfirmed = true
			a.status = "候选目标已确认：窗口外框将作为锁定参照；不会把 Content Bounds 猜作外框。"
			return a.renderSurface(ctx)
		case "previousTarget":
			return a.cycleTarget(ctx, -1)
		case "nextTarget":
			return a.cycleTarget(ctx, 1)
		case "refreshSnapshot":
			return a.refresh(ctx, a.selectedTarget)
		case "copyResult":
			return a.copy(ctx)
		case "saveResult":
			return a.save(ctx)
		case "exitMeasurement":
			return a.finish(ctx, true)
		}
	case "change", "input":
		value, _ := event.Value.(string)
		switch event.TargetID {
		case "targetWindow":
			if value != "" && value != a.selectedTarget {
				return a.refresh(ctx, value)
			}
		case "referenceType":
			if value == string(ReferenceManualRegion) {
				a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = true, nil, nil, nil
				a.status = "请拖拽一个区域作为锁定参照；不会自动猜测 Content Bounds。"
				return a.renderSurface(ctx)
			}
			if !a.targetConfirmed {
				a.status = "请先确认当前候选窗口，或选择人工参照；不会静默猜测目标。"
				return a.updateStatus(ctx, a.status)
			}
			a.reference, a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = a.frame.Reference, false, nil, nil, nil
			a.status = "参照已恢复为已确认目标窗口外边界。"
			return a.renderSurface(ctx)
		case "measurementTool":
			if value == "point" || value == "region" || value == "twoPoint" || value == "spacing" {
				a.tool, a.dragStart, a.twoPointFirst, a.spacingFirst = value, nil, nil, nil
				a.status = toolInstruction(value)
				return a.updateStatus(ctx, a.status)
			}
		case "outputFormat":
			if value == "concise" || value == "human" || value == "json" {
				a.outputFormat = value
				return a.renderSurface(ctx)
			}
		}
	case "measurement.pointerdown":
		point, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		a.dragStart = &point
	case "measurement.pointerup":
		point, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		return a.completeSelection(ctx, point)
	case "measurement.key":
		return a.handleKey(ctx, event.Fields)
	}
	return nil
}

func (a *activeSession) logicalPoint(fields map[string]any) (Point, error) {
	u, okU := numberField(fields, "u")
	v, okV := numberField(fields, "v")
	if !okU || !okV || u < 0 || u > 1 || v < 0 || v > 1 {
		return Point{}, errors.New("measurement pointer coordinates are invalid")
	}
	pixels := a.frame.Snapshot.Mapping.ImageSize
	return a.frame.Snapshot.Mapping.ImageToLogical(Point{X: u * float64(pixels.Width), Y: v * float64(pixels.Height)}), nil
}

func (a *activeSession) completeSelection(ctx context.Context, end Point) error {
	start := end
	if a.dragStart != nil {
		start = *a.dragStart
	}
	a.dragStart = nil
	selection := RectFromPoints(start, end)
	if a.manualPending {
		if selection.Width <= 0 || selection.Height <= 0 {
			a.status = "参照区域必须同时具有正宽度和正高度，请重新拖拽。"
			return a.updateStatus(ctx, a.status)
		}
		a.reference = Reference{Type: ReferenceManualRegion, Bounds: selection}
		a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = false, nil, nil, nil
		a.status = "人工参照已锁定；后续测量都使用同一参照，直到用户主动切换。"
		return a.renderSurface(ctx)
	}
	if !a.targetConfirmed {
		a.status = "请先确认当前候选窗口，或改用人工参照；不会静默猜测目标。"
		return a.updateStatus(ctx, a.status)
	}
	var result Result
	var err error
	switch a.tool {
	case "point":
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, end, a.image)
	case "region":
		if selection.Width <= 0 || selection.Height <= 0 {
			a.status = "区域测量需要拖拽出正宽高区域。"
			return a.updateStatus(ctx, a.status)
		}
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, selection)
	case "twoPoint":
		if a.twoPointFirst == nil {
			first := end
			a.twoPointFirst = &first
			a.status = "第一点已锁定，请选择第二点。"
			return a.renderSurface(ctx)
		}
		result, err = BuildTwoPointResult(a.frame.Snapshot, a.reference, *a.twoPointFirst, end)
		a.twoPointFirst = nil
	case "spacing":
		if selection.Width <= 0 || selection.Height <= 0 {
			a.status = "两区域测距需要分别拖拽两个正宽高区域。"
			return a.updateStatus(ctx, a.status)
		}
		if a.spacingFirst == nil {
			first := selection
			a.spacingFirst = &first
			a.status = "第一个区域已锁定，请拖拽第二个区域。"
			return a.renderSurface(ctx)
		}
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, *a.spacingFirst, selection)
		a.spacingFirst = nil
	default:
		return errors.New("measurement tool is invalid")
	}
	if err != nil {
		a.status = "测量失败：" + err.Error()
		return a.updateStatus(ctx, a.status)
	}
	a.result = &result
	a.status = "结果来自同一冻结快照；颜色读取自原始 Capture Pixel。"
	return a.renderSurface(ctx)
}

func (a *activeSession) handleKey(ctx context.Context, fields map[string]any) error {
	key, _ := fields["key"].(string)
	ctrl, _ := fields["ctrl"].(bool)
	meta, _ := fields["meta"].(bool)
	shift, _ := fields["shift"].(bool)
	switch {
	case strings.EqualFold(key, "c") && (ctrl || meta):
		return a.copy(ctx)
	case key == "Enter":
		if err := a.copy(ctx); err != nil {
			return err
		}
		return a.finish(ctx, true)
	case key == "Escape":
		return a.finish(ctx, true)
	case strings.HasPrefix(key, "Arrow"):
		return a.nudge(ctx, key, shift)
	}
	return nil
}

func (a *activeSession) nudge(ctx context.Context, key string, edge bool) error {
	if a.result == nil {
		a.status = "请先完成一个测量结果，再使用方向键微调。"
		return a.updateStatus(ctx, a.status)
	}
	dx, dy := 0.0, 0.0
	switch key {
	case "ArrowLeft":
		dx = -1
	case "ArrowRight":
		dx = 1
	case "ArrowUp":
		dy = -1
	case "ArrowDown":
		dy = 1
	}
	var result Result
	var err error
	switch {
	case a.result.Point != nil:
		point := a.result.Point.Absolute
		point.X, point.Y = point.X+dx, point.Y+dy
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, point, a.image)
	case a.result.Region != nil:
		rect := a.result.Region.Absolute
		adjustRect(&rect, key, dx, dy, edge)
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, rect)
	case a.result.TwoPoint != nil:
		first, second := a.result.TwoPoint.First, a.result.TwoPoint.Second
		second.X, second.Y = second.X+dx, second.Y+dy
		result, err = BuildTwoPointResult(a.frame.Snapshot, a.reference, first, second)
	case a.result.Spacing != nil:
		first, second := a.result.Spacing.First, a.result.Spacing.Second
		adjustRect(&second, key, dx, dy, edge)
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, first, second)
	}
	if err != nil {
		a.status = "微调失败：" + err.Error()
		return a.updateStatus(ctx, a.status)
	}
	a.result = &result
	a.status = "已按屏幕逻辑坐标微调 1 logical unit。"
	return a.renderSurface(ctx)
}

func adjustRect(rect *Rect, key string, dx, dy float64, resize bool) {
	if !resize {
		rect.X, rect.Y = rect.X+dx, rect.Y+dy
		return
	}
	switch key {
	case "ArrowLeft":
		rect.X--
		rect.Width++
	case "ArrowRight":
		rect.Width++
	case "ArrowUp":
		rect.Y--
		rect.Height++
	case "ArrowDown":
		rect.Height++
	}
}

func (a *activeSession) refresh(ctx context.Context, targetID string) error {
	oldWindow := a.currentWindow()
	if oldWindow == nil {
		return errors.New("measurement surface is unavailable")
	}
	_, _ = oldWindow.Hide(ctx)
	frame, err := a.service.capture.Capture(ctx, targetID)
	if err != nil {
		_, _ = oldWindow.Show(context.Background())
		a.status = "刷新快照失败：" + err.Error()
		return err
	}
	img, assetPath, err := a.service.prepareFrame(frame)
	if err != nil {
		_, _ = oldWindow.Show(context.Background())
		return err
	}

	oldFrame, oldImage, oldAsset := a.frame, a.image, a.assetPath
	oldReference, oldTarget := a.reference, a.selectedTarget
	oldResult, oldDrag := a.result, a.dragStart
	oldTwoPoint, oldSpacing, oldManual := a.twoPointFirst, a.spacingFirst, a.manualPending
	oldConfirmed := a.targetConfirmed

	a.frame, a.image, a.assetPath = frame, img, assetPath
	a.reference, a.selectedTarget = frame.Reference, frame.SelectedTargetID
	a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = nil, nil, nil, nil, false
	a.targetConfirmed = false
	a.status = "已冻结新的干净快照；此前结果已清除。" + targetConfirmationInstruction(frame)
	if err := a.replaceSurface(ctx); err != nil {
		a.frame, a.image, a.assetPath = oldFrame, oldImage, oldAsset
		a.reference, a.selectedTarget = oldReference, oldTarget
		a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = oldResult, oldDrag, oldTwoPoint, oldSpacing, oldManual
		a.targetConfirmed = oldConfirmed
		_ = os.Remove(assetPath)
		_, _ = oldWindow.Show(context.Background())
		return err
	}
	_ = os.Remove(oldAsset)
	return nil
}

func (a *activeSession) cycleTarget(ctx context.Context, direction int) error {
	if len(a.frame.Targets) < 2 {
		a.status = "当前没有可切换的其他候选窗口；可选择人工参照。"
		return a.updateStatus(ctx, a.status)
	}
	current := 0
	for index, target := range a.frame.Targets {
		if target.ID == a.selectedTarget {
			current = index
			break
		}
	}
	next := (current + direction) % len(a.frame.Targets)
	if next < 0 {
		next += len(a.frame.Targets)
	}
	return a.refresh(ctx, a.frame.Targets[next].ID)
}

func (a *activeSession) renderSurface(ctx context.Context) error {
	if err := a.replaceSurface(ctx); err != nil {
		return err
	}
	return nil
}

func (a *activeSession) updateStatus(ctx context.Context, message string) error {
	a.status = message
	window := a.currentWindow()
	if window == nil {
		return errors.New("measurement surface is unavailable")
	}
	_, err := window.UpdateControl(ctx, "measurementStatus", customui.ControlPatch{Text: &message})
	return err
}

func (a *activeSession) copy(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, "复制失败：尚无测量结果。")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	if err := a.service.clipboard.Copy(outputValue(outputs, a.outputFormat)); err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	return a.updateStatus(ctx, "已复制"+outputFormatLabel(a.outputFormat)+"结果。")
}

func (a *activeSession) save(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, "保存失败：尚无测量结果。")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return a.updateStatus(ctx, "保存失败："+err.Error())
	}
	if err := os.MkdirAll(a.service.saveDir, 0o755); err != nil {
		return a.updateStatus(ctx, "保存失败："+err.Error())
	}
	stamp := a.service.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(a.service.assetID.Add(1), 10)
	ext := ".txt"
	if a.outputFormat == "json" {
		ext = ".json"
	}
	path := filepath.Join(a.service.saveDir, "measurement-"+stamp+"-"+a.outputFormat+ext)
	if err := os.WriteFile(path, []byte(outputValue(outputs, a.outputFormat)+"\n"), 0o600); err != nil {
		return a.updateStatus(ctx, "保存失败："+err.Error())
	}
	return a.updateStatus(ctx, "已保存"+outputFormatLabel(a.outputFormat)+"结果："+path)
}

func outputValue(outputs Outputs, format string) string {
	switch format {
	case "human":
		return outputs.Human
	case "json":
		return outputs.JSON
	default:
		return outputs.Concise
	}
}

func outputFormatLabel(format string) string {
	switch format {
	case "human":
		return "完整中文"
	case "json":
		return "结构化 JSON"
	default:
		return "简明数值"
	}
}

func (a *activeSession) finish(ctx context.Context, closeWindow bool) error {
	var result error
	a.closeOnce.Do(func() {
		if closeWindow {
			if window := a.currentWindow(); window != nil {
				_, result = window.Close(ctx)
			}
		}
		if err := a.session.Close(ctx); result == nil {
			result = err
		}
		if a.restore != nil {
			if err := a.restore(ctx); err != nil && result == nil {
				result = fmt.Errorf("measurement recovery limited: %w", err)
			}
		}
		a.finishMu.Lock()
		a.finishErr = result
		a.finishMu.Unlock()
		a.service.mu.Lock()
		if a.service.active == a {
			a.service.active = nil
		}
		a.service.mu.Unlock()
		close(a.done)
		if a.assetPath != "" {
			_ = os.Remove(a.assetPath)
		}
	})
	return result
}

func measurementWindowSpec(frame CaptureFrame, assetName, source string) customui.WindowSpec {
	view := &activeSession{
		frame: frame, reference: frame.Reference, assetPath: assetName, tool: "point", outputFormat: "concise",
		status: targetConfirmationInstruction(frame), selectedTarget: frame.SelectedTargetID, source: strings.TrimSpace(source),
	}
	return measurementWindowSpecState(view)
}

func measurementWindowSpecState(a *activeSession) customui.WindowSpec {
	m := a.frame.Snapshot.Mapping
	return customui.WindowSpec{
		// This is deliberately not a normal/floating Custom UI window. The native
		// host maps the first-party-only kind to a borderless tool surface that is
		// absent from the ordinary window switcher while still consuming the
		// bounded Measurement pointer and keyboard events.
		ID: WindowID, Kind: "measurement", Title: "",
		Bounds:      customui.Bounds{X: m.Origin.X, Y: m.Origin.Y, Width: m.LogicalSize.Width, Height: m.LogicalSize.Height},
		AlwaysOnTop: true, Theme: "dark",
		Content:     customui.ContentSpec{HTML: measurementHTML(a), CSS: measurementCSS(), BasePath: "."},
		Measurement: &customui.MeasurementSurfaceSpec{TargetID: previewID},
	}
}

func measurementHTML(a *activeSession) string {
	var options strings.Builder
	for _, target := range a.frame.Targets {
		selected := ""
		if target.ID == a.selectedTarget {
			selected = " selected"
		}
		fmt.Fprintf(&options, `<option value="%s"%s>%s</option>`, html.EscapeString(target.ID), selected, html.EscapeString(target.Title))
	}
	corner, constrained := hudPlacement(a.frame.Snapshot.Mapping, a.frame.Reference.Bounds)
	constraintText := ""
	if constrained {
		constraintText = `<span class="limited">目标较大：HUD 以受限模式收起</span>`
	}
	resultText, concise := "尚无结果", "尚无结果"
	copyDisabled := " disabled"
	if a.result != nil {
		if outputs, err := a.result.Outputs(); err == nil {
			resultText, concise = outputValue(outputs, a.outputFormat), outputs.Concise
			copyDisabled = ""
		}
	}
	assetName := filepath.Base(a.assetPath)
	confirmation := `<button id="confirmTarget">确认候选</button>`
	if a.targetConfirmed {
		confirmation = `<span class="targetConfirmed">已确认窗口参照</span>`
	}
	return `<main id="measurementRoot"><img id="measurementPreview" src="` + html.EscapeString(assetName) + `">` + measurementOverlayHTML(a) + `<section id="measurementToolbar"><button id="previousTarget" aria-label="上一个候选">‹</button><span class="candidateTitle">` + html.EscapeString(selectedTargetTitle(a.frame.Targets, a.selectedTarget)) + `</span><button id="nextTarget" aria-label="下一个候选">›</button>` + confirmation + `<select id="measurementTool" aria-label="测量工具">` + toolOptions(a.tool) + `</select><select id="referenceType" aria-label="参照">` + referenceOptions(a) + `</select><button id="copyResult"` + copyDisabled + `>复制</button><button id="saveResult"` + copyDisabled + `>保存</button><button id="exitMeasurement">退出</button></section><section id="measurementHUD" class="` + corner + `"><strong>桌面测量</strong><p id="measurementHUDValue">` + html.EscapeString(concise) + `</p><p id="measurementStatus">` + html.EscapeString(a.status) + `</p><p class="referenceInfo">` + html.EscapeString(referenceSummary(a.reference)) + `</p>` + constraintText + `<details><summary>详情</summary><div class="detailsBody"><label>目标<select id="targetWindow">` + options.String() + `</select></label><button id="refreshSnapshot">重新冻结</button><label>导出<select id="outputFormat">` + outputOptions(a.outputFormat) + `</select></label><p id="snapshotInfo">` + html.EscapeString(snapshotSummary(a.frame)) + `</p><pre>` + html.EscapeString(resultText) + `</pre><p class="hint">入口：` + html.EscapeString(a.source) + ` · Esc 先关闭详情 · 方向键移动 · Shift+方向键调整尺寸</p></div></details></section></main>`
}

func selectedTargetTitle(targets []TargetWindow, selected string) string {
	for _, target := range targets {
		if target.ID == selected {
			return target.Title
		}
	}
	return "候选窗口不可用"
}

func targetConfirmationInstruction(frame CaptureFrame) string {
	return "当前候选：" + selectedTargetTitle(frame.Targets, frame.SelectedTargetID) + "。请确认窗口外框，或选择人工参照；不会静默猜测 Content Bounds。"
}

func toolOptions(selected string) string {
	values := []struct{ value, label string }{{"point", "取点/取色"}, {"region", "区域"}, {"twoPoint", "两点距离"}, {"spacing", "两区域间距"}}
	var b strings.Builder
	for _, item := range values {
		mark := ""
		if item.value == selected {
			mark = " selected"
		}
		fmt.Fprintf(&b, `<option value="%s"%s>%s</option>`, item.value, mark, item.label)
	}
	return b.String()
}

func referenceOptions(a *activeSession) string {
	outer, manual := "", ""
	if a.reference.Type == ReferenceManualRegion || a.manualPending {
		manual = " selected"
	} else {
		outer = " selected"
	}
	return `<option value="windowOuterBounds"` + outer + `>窗口参照</option><option value="manualRegion"` + manual + `>人工参照</option>`
}

func outputOptions(selected string) string {
	values := []struct{ value, label string }{{"concise", "简明数值"}, {"human", "完整中文"}, {"json", "结构化 JSON"}}
	var b strings.Builder
	for _, item := range values {
		mark := ""
		if item.value == selected {
			mark = " selected"
		}
		fmt.Fprintf(&b, `<option value="%s"%s>%s</option>`, item.value, mark, item.label)
	}
	return b.String()
}

func measurementOverlayHTML(a *activeSession) string {
	mapping := a.frame.Snapshot.Mapping
	var b strings.Builder
	fmt.Fprintf(&b, `<div class="targetOutline" style="%s"></div>`, overlayRectStyle(mapping, a.frame.Reference.Bounds))
	fmt.Fprintf(&b, `<div class="referenceOutline" style="%s"></div>`, overlayRectStyle(mapping, a.reference.Bounds))
	if a.twoPointFirst != nil {
		fmt.Fprintf(&b, `<span class="pointMarker pending" style="%s"></span>`, overlayPointStyle(mapping, *a.twoPointFirst))
	}
	if a.spacingFirst != nil {
		fmt.Fprintf(&b, `<div class="resultRect pending" style="%s"></div>`, overlayRectStyle(mapping, *a.spacingFirst))
	}
	if a.result == nil {
		return b.String()
	}
	switch {
	case a.result.Point != nil:
		fmt.Fprintf(&b, `<span class="pointMarker" style="%s"></span>`, overlayPointStyle(mapping, a.result.Point.Absolute))
	case a.result.Region != nil:
		fmt.Fprintf(&b, `<div class="resultRect" style="%s"></div>`, overlayRectStyle(mapping, a.result.Region.Absolute))
	case a.result.TwoPoint != nil:
		first, second := a.result.TwoPoint.First, a.result.TwoPoint.Second
		fmt.Fprintf(&b, `<span class="pointMarker" style="%s"></span><span class="pointMarker" style="%s"></span><span class="distanceLine" style="%s"></span>`, overlayPointStyle(mapping, first), overlayPointStyle(mapping, second), overlayLineStyle(mapping, first, second))
	case a.result.Spacing != nil:
		first, second := a.result.Spacing.First, a.result.Spacing.Second
		fmt.Fprintf(&b, `<div class="resultRect" style="%s"></div><div class="resultRect" style="%s"></div><span class="distanceLine" style="%s"></span>`, overlayRectStyle(mapping, first), overlayRectStyle(mapping, second), overlayLineStyle(mapping, first.Center(), second.Center()))
	}
	return b.String()
}

func measurementCSS() string {
	return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}.targetOutline,.referenceOutline,.resultRect,.pointMarker,.distanceLine{position:absolute;pointer-events:none;z-index:4}.targetOutline{border:2px solid rgba(70,174,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.65)}.referenceOutline{border:1px dashed rgba(255,206,82,.95)}.resultRect{border:2px solid rgba(113,238,169,.96);background:rgba(113,238,169,.08)}.resultRect.pending{border-style:dashed}.pointMarker{width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid rgba(113,238,169,.98);border-radius:50%;background:rgba(0,0,0,.45)}.pointMarker.pending{border-color:#ffd479}.distanceLine{height:2px;transform-origin:0 50%;background:rgba(113,238,169,.95);box-shadow:0 0 0 1px rgba(0,0,0,.28)}#measurementToolbar{position:absolute;z-index:12;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;max-width:calc(100vw - 24px);padding:6px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);box-shadow:0 6px 22px rgba(0,0,0,.26)}.candidateTitle{max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c9d5e2;font-size:11px}.targetConfirmed{color:#9ee9c2;font-size:11px;white-space:nowrap}select,button{height:30px;max-width:190px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px}button{cursor:pointer}button:disabled{opacity:.42;cursor:default}#measurementHUD{position:absolute;z-index:11;width:min(280px,calc(100vw - 24px));max-height:calc(100vh - 78px);padding:10px 11px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);box-shadow:0 8px 26px rgba(0,0,0,.28);overflow:auto}#measurementHUD.top-left{top:58px;left:12px}#measurementHUD.top-right{top:58px;right:12px}#measurementHUD.bottom-left{bottom:12px;left:12px}#measurementHUD.bottom-right{bottom:12px;right:12px}#measurementHUD strong{font-size:13px}#measurementHUD p{margin:6px 0 0;font-size:11px;line-height:1.42;white-space:pre-wrap}#measurementHUDValue{color:#fff}#measurementStatus{color:#92d2ff}.referenceInfo{color:#ffd479}.limited{display:block;margin-top:6px;color:#ffd479;font-size:10px}details{margin-top:8px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px}summary{cursor:pointer;color:#c9d5e2;font-size:11px}.detailsBody{display:flex;flex-direction:column;gap:7px;padding-top:8px}.detailsBody label{display:flex;flex-direction:column;gap:4px;color:#aebccc;font-size:10px}.detailsBody select{width:100%;max-width:none}#snapshotInfo{color:#aebccc}#measurementResult{margin:0;max-height:200px;overflow:auto;white-space:pre-wrap;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#e2ebf5;background:rgba(0,0,0,.28);padding:7px;border-radius:6px}.hint{color:#8290a1!important}`
}

func overlayRectStyle(mapping CaptureMapping, rect Rect) string {
	left := (rect.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	top := (rect.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	right := (rect.Right() - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	bottom := (rect.Bottom() - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	left, top, right, bottom = clampPercent(left), clampPercent(top), clampPercent(right), clampPercent(bottom)
	if right < left {
		left, right = right, left
	}
	if bottom < top {
		top, bottom = bottom, top
	}
	return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4f%%;height:%.4f%%", left, top, right-left, bottom-top)
}

func overlayPointStyle(mapping CaptureMapping, point Point) string {
	x := clampPercent((point.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100)
	y := clampPercent((point.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100)
	return fmt.Sprintf("left:%.4f%%;top:%.4f%%", x, y)
}

func overlayLineStyle(mapping CaptureMapping, first, second Point) string {
	x1 := (first.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	y1 := (first.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	x2 := (second.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	y2 := (second.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	dxPx := (x2 - x1) / 100 * mapping.LogicalSize.Width
	dyPx := (y2 - y1) / 100 * mapping.LogicalSize.Height
	length := math.Hypot(dxPx, dyPx)
	angle := math.Atan2(dyPx, dxPx) * 180 / math.Pi
	return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4fpx;transform:rotate(%.4fdeg)", clampPercent(x1), clampPercent(y1), length, angle)
}

func clampPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func hudPlacement(mapping CaptureMapping, target Rect) (string, bool) {
	center := target.Center()
	horizontal := "right"
	if center.X >= mapping.Origin.X+mapping.LogicalSize.Width/2 {
		horizontal = "left"
	}
	vertical := "bottom"
	if center.Y >= mapping.Origin.Y+mapping.LogicalSize.Height/2 {
		vertical = "top"
	}
	constrained := target.Width >= mapping.LogicalSize.Width*0.7 || target.Height >= mapping.LogicalSize.Height*0.7
	return vertical + "-" + horizontal, constrained
}

func referenceSummary(reference Reference) string {
	return fmt.Sprintf("参照 %s · x=%.2f y=%.2f w=%.2f h=%.2f logical", reference.Type, reference.Bounds.X, reference.Bounds.Y, reference.Bounds.Width, reference.Bounds.Height)
}

func snapshotSummary(frame CaptureFrame) string {
	m := frame.Snapshot.Mapping
	return fmt.Sprintf("冻结采样：%s\n显示器：%s / %d\nscreen logical origin=(%.2f, %.2f), size=%.2f×%.2f\ncapture pixel=%d×%d, scale=(%.4f, %.4f)\n参照：%s",
		frame.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano), m.DisplayID, m.DisplayIndex,
		m.Origin.X, m.Origin.Y, m.LogicalSize.Width, m.LogicalSize.Height,
		m.ImageSize.Width, m.ImageSize.Height, m.ScaleX, m.ScaleY, frame.Reference.Type)
}

func toolInstruction(tool string) string {
	switch tool {
	case "region":
		return "拖拽框选区域；四边距保留正/零/负语义。"
	case "twoPoint":
		return "依次选择两个点，读取 dx / dy / 直线距离。"
	case "spacing":
		return "依次拖拽两个区域，读取水平与垂直间距。"
	default:
		return "点击取点与原始 Capture Pixel 颜色。"
	}
}

func numberField(fields map[string]any, key string) (float64, bool) {
	switch value := fields[key].(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	case jsonNumber:
		parsed, err := strconv.ParseFloat(string(value), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

type jsonNumber string
