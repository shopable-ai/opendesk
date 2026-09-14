package measurement

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html"
	"image"
	_ "image/png"
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
	window  *customui.Window
	events  chan customui.Event
	done    chan struct{}

	frame          CaptureFrame
	image          image.Image
	assetPath      string
	reference      Reference
	tool           string
	outputFormat   string
	dragStart      *Point
	twoPointFirst  *Point
	spacingFirst   *Rect
	result         *Result
	manualPending  bool
	selectedTarget string
	closeOnce      sync.Once
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
			window := current.window
			s.mu.Unlock()
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

// OpenAndWait is used by Recorder after it has entered the formal paused
// state. Waiting keeps Recorder controls disabled for the Measurement lifetime;
// it never resumes capture when the session ends.
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
		return nil
	case <-ctx.Done():
		_ = active.finish(context.Background(), true)
		return ctx.Err()
	}
}

func (s *Service) openNew(ctx context.Context, source string) (*activeSession, error) {
	// Freeze before any Measurement surface exists so the canonical snapshot
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
		frame: frame, image: img, assetPath: assetPath, reference: frame.Reference,
		tool: "point", outputFormat: "concise", selectedTarget: frame.SelectedTargetID,
	}
	sessionID := "measurement-" + s.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(s.sessionID.Add(1), 10)
	session, err := customui.NewSession(sessionID, s.baseDir, s.driver, active.enqueue)
	if err != nil {
		_ = os.Remove(assetPath)
		return nil, err
	}
	active.session = session
	spec := measurementWindowSpec(frame, filepath.Base(assetPath), strings.TrimSpace(source))
	window, err := session.Create(ctx, spec)
	if err != nil {
		_ = session.Close(context.Background())
		_ = os.Remove(assetPath)
		return nil, err
	}
	active.window = window
	if _, err := window.Show(ctx); err != nil {
		_ = session.Close(context.Background())
		_ = os.Remove(assetPath)
		return nil, err
	}
	return active, nil
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
				_ = a.finish(context.Background(), false)
				return
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
				return a.clearResult(ctx, "请拖拽一个区域作为锁定参照；不会自动猜测 Content Bounds。")
			}
			a.reference, a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = a.frame.Reference, false, nil, nil, nil
			return a.clearResult(ctx, "参照已恢复为已确认目标窗口外边界。")
		case "measurementTool":
			if value == "point" || value == "region" || value == "twoPoint" || value == "spacing" {
				a.tool, a.dragStart, a.twoPointFirst, a.spacingFirst = value, nil, nil, nil
				return a.updateStatus(ctx, toolInstruction(value))
			}
		case "outputFormat":
			if value == "concise" || value == "human" || value == "json" {
				a.outputFormat = value
				return a.renderResult(ctx)
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
			return a.updateStatus(ctx, "参照区域必须同时具有正宽度和正高度，请重新拖拽。")
		}
		a.reference = Reference{Type: ReferenceManualRegion, Bounds: selection}
		a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = false, nil, nil, nil
		return a.updateStatus(ctx, "人工参照已锁定；后续测量都使用同一参照，直到用户主动切换。")
	}
	var result Result
	var err error
	switch a.tool {
	case "point":
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, end, a.image)
	case "region":
		if selection.Width <= 0 || selection.Height <= 0 {
			return a.updateStatus(ctx, "区域测量需要拖拽出正宽高区域。")
		}
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, selection)
	case "twoPoint":
		if a.twoPointFirst == nil {
			first := end
			a.twoPointFirst = &first
			return a.updateStatus(ctx, "第一点已锁定，请选择第二点。")
		}
		result, err = BuildTwoPointResult(a.frame.Snapshot, a.reference, *a.twoPointFirst, end)
		a.twoPointFirst = nil
	case "spacing":
		if selection.Width <= 0 || selection.Height <= 0 {
			return a.updateStatus(ctx, "两区域测距需要分别拖拽两个正宽高区域。")
		}
		if a.spacingFirst == nil {
			first := selection
			a.spacingFirst = &first
			return a.updateStatus(ctx, "第一个区域已锁定，请拖拽第二个区域。")
		}
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, *a.spacingFirst, selection)
		a.spacingFirst = nil
	default:
		return errors.New("measurement tool is invalid")
	}
	if err != nil {
		return a.updateStatus(ctx, "测量失败："+err.Error())
	}
	a.result = &result
	return a.renderResult(ctx)
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
		return a.updateStatus(ctx, "请先完成一个测量结果，再使用方向键微调。")
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
		return a.updateStatus(ctx, "微调失败："+err.Error())
	}
	a.result = &result
	return a.renderResult(ctx)
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
	_, _ = a.window.Hide(ctx)
	defer func() { _, _ = a.window.Show(context.Background()) }()
	frame, err := a.service.capture.Capture(ctx, targetID)
	if err != nil {
		_ = a.updateStatus(ctx, "刷新快照失败："+err.Error())
		return err
	}
	img, assetPath, err := a.service.prepareFrame(frame)
	if err != nil {
		return err
	}
	source := filepath.Base(assetPath)
	if _, err := a.window.UpdateControl(ctx, previewID, customui.ControlPatch{Source: &source}); err != nil {
		_ = os.Remove(assetPath)
		return err
	}

	oldAsset := a.assetPath
	a.frame, a.image, a.assetPath = frame, img, assetPath
	a.reference, a.selectedTarget = frame.Reference, frame.SelectedTargetID
	a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = nil, nil, nil, nil, false
	value := frame.SelectedTargetID
	options := targetOptions(frame.Targets)
	if _, err := a.window.UpdateControl(ctx, "targetWindow", customui.ControlPatch{Value: value, Options: options}); err != nil {
		return a.failClosedRefresh(oldAsset, err)
	}
	referenceValue := string(ReferenceWindowOuter)
	if _, err := a.window.UpdateControl(ctx, "referenceType", customui.ControlPatch{Value: referenceValue}); err != nil {
		return a.failClosedRefresh(oldAsset, err)
	}
	if err := a.updateSnapshotText(ctx, "已冻结新的干净快照；此前结果已清除。"); err != nil {
		return a.failClosedRefresh(oldAsset, err)
	}
	_ = os.Remove(oldAsset)
	return nil
}

func (a *activeSession) failClosedRefresh(oldAsset string, refreshErr error) error {
	_ = os.Remove(oldAsset)
	closeErr := a.finish(context.Background(), true)
	return errors.Join(refreshErr, closeErr)
}

func (a *activeSession) renderResult(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, toolInstruction(a.tool))
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return err
	}
	detail := outputValue(outputs, a.outputFormat)
	hud := outputs.Concise
	if _, err := a.window.UpdateControl(ctx, "measurementHUDValue", customui.ControlPatch{Text: &hud}); err != nil {
		return err
	}
	if _, err := a.window.UpdateControl(ctx, "measurementResult", customui.ControlPatch{Text: &detail}); err != nil {
		return err
	}
	ready := false
	if _, err := a.window.UpdateControl(ctx, "copyResult", customui.ControlPatch{Disabled: &ready}); err != nil {
		return err
	}
	if _, err := a.window.UpdateControl(ctx, "saveResult", customui.ControlPatch{Disabled: &ready}); err != nil {
		return err
	}
	return a.updateStatus(ctx, "结果来自同一冻结快照；颜色读取自原始 Capture Pixel。")
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

func (a *activeSession) updateStatus(ctx context.Context, message string) error {
	_, err := a.window.UpdateControl(ctx, "measurementStatus", customui.ControlPatch{Text: &message})
	return err
}

func (a *activeSession) updateSnapshotText(ctx context.Context, status string) error {
	text := snapshotSummary(a.frame)
	if _, err := a.window.UpdateControl(ctx, "snapshotInfo", customui.ControlPatch{Text: &text}); err != nil {
		return err
	}
	return a.clearResult(ctx, status)
}

func (a *activeSession) clearResult(ctx context.Context, status string) error {
	hud := "尚无结果"
	if _, err := a.window.UpdateControl(ctx, "measurementHUDValue", customui.ControlPatch{Text: &hud}); err != nil {
		return err
	}
	if _, err := a.window.UpdateControl(ctx, "measurementResult", customui.ControlPatch{Text: &hud}); err != nil {
		return err
	}
	disabled := true
	if _, err := a.window.UpdateControl(ctx, "copyResult", customui.ControlPatch{Disabled: &disabled}); err != nil {
		return err
	}
	if _, err := a.window.UpdateControl(ctx, "saveResult", customui.ControlPatch{Disabled: &disabled}); err != nil {
		return err
	}
	return a.updateStatus(ctx, status)
}

func (a *activeSession) copy(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, "复制失败：尚无测量结果。")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		_ = a.updateStatus(ctx, "复制失败："+err.Error())
		return err
	}
	value := outputValue(outputs, a.outputFormat)
	if err := a.service.clipboard.Copy(value); err != nil {
		_ = a.updateStatus(ctx, "复制失败："+err.Error())
		return err
	}
	return a.updateStatus(ctx, "已复制"+outputFormatLabel(a.outputFormat)+"结果。")
}

func (a *activeSession) save(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, "保存失败：尚无测量结果。")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		_ = a.updateStatus(ctx, "保存失败："+err.Error())
		return err
	}
	if err := os.MkdirAll(a.service.saveDir, 0o755); err != nil {
		_ = a.updateStatus(ctx, "保存失败："+err.Error())
		return err
	}
	stamp := a.service.now().UTC().Format("20060102T150405.000000000Z")
	ext := ".txt"
	if a.outputFormat == "json" {
		ext = ".json"
	}
	path := filepath.Join(a.service.saveDir, "measurement-"+stamp+"-"+a.outputFormat+ext)
	if err := os.WriteFile(path, []byte(outputValue(outputs, a.outputFormat)+"\n"), 0o600); err != nil {
		_ = a.updateStatus(ctx, "保存失败："+err.Error())
		return err
	}
	return a.updateStatus(ctx, "已保存"+outputFormatLabel(a.outputFormat)+"结果："+path)
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
		if closeWindow && a.window != nil {
			_, result = a.window.Close(ctx)
		}
		if err := a.session.Close(ctx); result == nil {
			result = err
		}
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
	m := frame.Snapshot.Mapping
	return customui.WindowSpec{
		ID: WindowID, Kind: "floating", Title: "", Bounds: customui.Bounds{
			X: m.Origin.X, Y: m.Origin.Y, Width: m.LogicalSize.Width, Height: m.LogicalSize.Height,
		},
		AlwaysOnTop: true, Theme: "dark",
		Content:     customui.ContentSpec{HTML: measurementHTML(frame, assetName, source), CSS: measurementCSS(), BasePath: "."},
		Measurement: &customui.MeasurementSurfaceSpec{TargetID: previewID},
	}
}

func measurementHTML(frame CaptureFrame, assetName, source string) string {
	var options strings.Builder
	for _, target := range frame.Targets {
		selected := ""
		if target.ID == frame.SelectedTargetID {
			selected = " selected"
		}
		fmt.Fprintf(&options, `<option value="%s"%s>%s</option>`, html.EscapeString(target.ID), selected, html.EscapeString(target.Title))
	}
	corner, constrained := hudPlacement(frame.Snapshot.Mapping, frame.Reference.Bounds)
	constraintText := ""
	if constrained {
		constraintText = `<span class="limited">目标较大：HUD 以受限模式收起</span>`
	}
	outline := overlayRectStyle(frame.Snapshot.Mapping, frame.Reference.Bounds)
	return `<main id="measurementRoot"><img id="measurementPreview" src="` + html.EscapeString(assetName) + `"><div id="targetOutline" style="` + outline + `"></div><div id="referenceOutline" style="` + outline + `"></div><section id="measurementToolbar"><select id="measurementTool" aria-label="测量工具"><option value="point" selected>取点/取色</option><option value="region">区域</option><option value="twoPoint">两点距离</option><option value="spacing">两区域间距</option></select><select id="referenceType" aria-label="参照"><option value="windowOuterBounds" selected>窗口参照</option><option value="manualRegion">人工参照</option></select><button id="copyResult" disabled>复制</button><button id="saveResult" disabled>保存</button><button id="exitMeasurement">退出</button></section><aside id="measurementHUD" class="` + corner + `"><strong>桌面测量</strong><p id="measurementHUDValue">尚无结果</p><p id="measurementStatus">` + html.EscapeString(toolInstruction("point")) + `</p>` + constraintText + `<details id="measurementDetails"><summary>详情</summary><div class="detailsBody"><label>目标<select id="targetWindow">` + options.String() + `</select></label><button id="refreshSnapshot">重新冻结</button><label>导出<select id="outputFormat"><option value="concise" selected>简明数值</option><option value="human">完整中文</option><option value="json">结构化 JSON</option></select></label><p id="snapshotInfo">` + html.EscapeString(snapshotSummary(frame)) + `</p><pre id="measurementResult">尚无结果</pre><p class="hint">入口：` + html.EscapeString(source) + ` · Esc 退出 · 方向键移动 · Shift+方向键调整尺寸</p></div></details></aside></main>`
}

func measurementCSS() string {
	return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}#targetOutline,#referenceOutline{position:absolute;pointer-events:none;z-index:4}#targetOutline{border:2px solid rgba(70,174,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.65)}#referenceOutline{border:1px dashed rgba(255,206,82,.95)}#measurementToolbar{position:absolute;z-index:12;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);box-shadow:0 6px 22px rgba(0,0,0,.26)}select,button{height:30px;max-width:190px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px}button{cursor:pointer}button:disabled{opacity:.42;cursor:default}#measurementHUD{position:absolute;z-index:11;width:min(270px,calc(100vw - 24px));max-height:calc(100vh - 78px);padding:10px 11px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(14,18,24,.88);box-shadow:0 8px 26px rgba(0,0,0,.28);overflow:auto}#measurementHUD.top-left{top:58px;left:12px}#measurementHUD.top-right{top:58px;right:12px}#measurementHUD.bottom-left{bottom:12px;left:12px}#measurementHUD.bottom-right{bottom:12px;right:12px}#measurementHUD strong{font-size:13px}#measurementHUD p{margin:6px 0 0;font-size:11px;line-height:1.42;white-space:pre-wrap}#measurementHUDValue{color:#fff}#measurementStatus{color:#92d2ff}.limited{display:block;margin-top:6px;color:#ffd479;font-size:10px}details{margin-top:8px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px}summary{cursor:pointer;color:#c9d5e2;font-size:11px}.detailsBody{display:flex;flex-direction:column;gap:7px;padding-top:8px}.detailsBody label{display:flex;flex-direction:column;gap:4px;color:#aebccc;font-size:10px}.detailsBody select{width:100%;max-width:none}#snapshotInfo{color:#aebccc}#measurementResult{margin:0;max-height:200px;overflow:auto;white-space:pre-wrap;font:10px ui-monospace,SFMono-Regular,Consolas,monospace;color:#e2ebf5;background:rgba(0,0,0,.28);padding:7px;border-radius:6px}.hint{color:#8290a1!important}`
}

func overlayRectStyle(mapping CaptureMapping, rect Rect) string {
	left := (rect.X - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	top := (rect.Y - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	right := (rect.Right() - mapping.Origin.X) / mapping.LogicalSize.Width * 100
	bottom := (rect.Bottom() - mapping.Origin.Y) / mapping.LogicalSize.Height * 100
	left, top = clampPercent(left), clampPercent(top)
	right, bottom = clampPercent(right), clampPercent(bottom)
	if right < left {
		left, right = right, left
	}
	if bottom < top {
		top, bottom = bottom, top
	}
	return fmt.Sprintf("left:%.4f%%;top:%.4f%%;width:%.4f%%;height:%.4f%%", left, top, right-left, bottom-top)
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

func targetOptions(targets []TargetWindow) []customui.SelectOption {
	result := make([]customui.SelectOption, 0, len(targets))
	for _, target := range targets {
		result = append(result, customui.SelectOption{Value: target.ID, Label: target.Title})
	}
	return result
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
