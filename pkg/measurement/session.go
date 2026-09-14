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

// Service owns the one process-wide Measurement Session. Both product entry
// points call Open on this same value; repeated calls only reveal the existing
// window and cannot allocate another overlay, listener, or capture owner.
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
		tool: "point", outputFormat: "human", selectedTarget: frame.SelectedTargetID,
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
			return a.copy(false)
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
				a.manualPending, a.result, a.spacingFirst = true, nil, nil
				return a.clearResult(ctx, "请在冻结快照上拖拽参照区域；参照外坐标不会被裁切。")
			}
			a.reference, a.manualPending, a.result, a.spacingFirst = a.frame.Reference, false, nil, nil
			return a.clearResult(ctx, "参照已恢复为真实窗口外边界（Window Outer Bounds）。")
		case "measurementTool":
			if value == "point" || value == "region" || value == "spacing" {
				a.tool, a.dragStart, a.spacingFirst = value, nil, nil
				return a.updateStatus(ctx, toolInstruction(value))
			}
		case "outputFormat":
			if value == "human" || value == "json" {
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
		a.manualPending, a.result, a.spacingFirst = false, nil, nil
		return a.updateStatus(ctx, "Manual Region 参照已设置；现在可继续取点、框选或测距。")
	}
	var result Result
	var err error
	switch a.tool {
	case "point":
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, end, a.image)
	case "region":
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, selection)
	case "spacing":
		if a.spacingFirst == nil {
			first := selection
			a.spacingFirst = &first
			return a.updateStatus(ctx, "已记录第一个点/区域，请选择第二个目标。")
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
		return a.copy(true)
	case key == "Enter":
		if err := a.copy(true); err != nil {
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
		return a.updateStatus(ctx, "请先选择一个点或区域，再使用方向键微调。")
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
		if edge {
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
		} else {
			rect.X, rect.Y = rect.X+dx, rect.Y+dy
		}
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, rect)
	case a.result.Spacing != nil:
		first, second := a.result.Spacing.First, a.result.Spacing.Second
		if edge {
			switch key {
			case "ArrowLeft":
				second.X--
				second.Width++
			case "ArrowRight":
				second.Width++
			case "ArrowUp":
				second.Y--
				second.Height++
			case "ArrowDown":
				second.Height++
			}
		} else {
			second.X, second.Y = second.X+dx, second.Y+dy
		}
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, first, second)
	}
	if err != nil {
		return err
	}
	a.result = &result
	return a.renderResult(ctx)
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

	// The preview is the frame boundary. Do not switch the canonical mapping,
	// image, sampledAt, or reference until the host has accepted that exact
	// image. If any following metadata update fails, close the surface rather
	// than leave a usable window whose labels belong to a different frame.
	oldAsset := a.assetPath
	a.frame, a.image, a.assetPath = frame, img, assetPath
	a.reference, a.selectedTarget = frame.Reference, frame.SelectedTargetID
	a.result, a.dragStart, a.spacingFirst, a.manualPending = nil, nil, nil, false
	value := frame.SelectedTargetID
	options := targetOptions(frame.Targets)
	if _, err := a.window.UpdateControl(ctx, "targetWindow", customui.ControlPatch{Value: value, Options: options}); err != nil {
		return a.failClosedRefresh(oldAsset, err)
	}
	referenceValue := string(ReferenceWindowOuter)
	if _, err := a.window.UpdateControl(ctx, "referenceType", customui.ControlPatch{Value: referenceValue}); err != nil {
		return a.failClosedRefresh(oldAsset, err)
	}
	if err := a.updateSnapshotText(ctx, "已冻结新快照；此前结果已清除。"); err != nil {
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
	text := outputs.Human
	if a.outputFormat == "json" {
		text = outputs.JSON
	}
	if _, err := a.window.UpdateControl(ctx, "measurementResult", customui.ControlPatch{Text: &text}); err != nil {
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

func (a *activeSession) updateStatus(ctx context.Context, message string) error {
	_, err := a.window.UpdateControl(ctx, "measurementStatus", customui.ControlPatch{Text: &message})
	return err
}

func (a *activeSession) updateSnapshotText(ctx context.Context, status string) error {
	text := snapshotSummary(a.frame)
	if _, err := a.window.UpdateControl(ctx, "snapshotInfo", customui.ControlPatch{Text: &text}); err != nil {
		return err
	}
	blank := "尚无结果"
	if _, err := a.window.UpdateControl(ctx, "measurementResult", customui.ControlPatch{Text: &blank}); err != nil {
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

func (a *activeSession) clearResult(ctx context.Context, status string) error {
	blank := "尚无结果"
	if _, err := a.window.UpdateControl(ctx, "measurementResult", customui.ControlPatch{Text: &blank}); err != nil {
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

func (a *activeSession) copy(full bool) error {
	if a.result == nil {
		return errors.New("measurement result is empty")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return err
	}
	value := outputs.JSON
	if !full && a.outputFormat == "human" {
		value = outputs.Human
	}
	return a.service.clipboard.Copy(value)
}

func (a *activeSession) save(ctx context.Context) error {
	if a.result == nil {
		return errors.New("measurement result is empty")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(a.service.saveDir, 0o755); err != nil {
		return err
	}
	stamp := a.service.now().UTC().Format("20060102T150405.000000000Z")
	jsonPath := filepath.Join(a.service.saveDir, "measurement-"+stamp+".json")
	textPath := filepath.Join(a.service.saveDir, "measurement-"+stamp+".txt")
	if err := os.WriteFile(jsonPath, []byte(outputs.JSON+"\n"), 0o600); err != nil {
		return err
	}
	if err := os.WriteFile(textPath, []byte(outputs.Human+"\n"), 0o600); err != nil {
		return err
	}
	return a.updateStatus(ctx, "已保存同一 Canonical Result："+jsonPath+"（并生成 .txt）")
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
	width := boundedWindowDimension(frame.Snapshot.Mapping.LogicalSize.Width-80, 640, 1120)
	height := boundedWindowDimension(frame.Snapshot.Mapping.LogicalSize.Height-120, 480, 820)
	return customui.WindowSpec{
		ID: WindowID, Kind: "normal", Title: "OpenDesk 桌面测量", Bounds: customui.Bounds{Width: width, Height: height},
		AlwaysOnTop: true, Theme: "dark", Placement: &customui.WindowPlacement{Horizontal: customui.PlacementCenter, Vertical: customui.PlacementCenter, Display: customui.PlacementDisplayActive},
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
		fmt.Fprintf(&options, `<option value="%s"%s>%s (PID %d)</option>`, html.EscapeString(target.ID), selected, html.EscapeString(target.Title), target.PID)
	}
	return `<main id="measurementRoot"><header id="measurementHeader"><strong>桌面测量</strong><span>唯一 Measurement Session · ` + html.EscapeString(source) + `</span></header><section id="measurementControls"><label>目标窗口<select id="targetWindow">` + options.String() + `</select></label><label>参照<select id="referenceType"><option value="windowOuterBounds" selected>Window Outer Bounds</option><option value="manualRegion">Manual Region</option></select></label><label>工具<select id="measurementTool"><option value="point" selected>取点 / 取色</option><option value="region">区域测量</option><option value="spacing">间距测量</option></select></label><button id="refreshSnapshot">刷新快照</button></section><section id="measurementBody"><div id="previewShell"><img id="measurementPreview" src="` + html.EscapeString(assetName) + `"></div><div id="measurementSide"><p id="snapshotInfo">` + html.EscapeString(snapshotSummary(frame)) + `</p><p id="measurementStatus">` + html.EscapeString(toolInstruction("point")) + `</p><label>结果格式<select id="outputFormat"><option value="human" selected>可读文本</option><option value="json">JSON</option></select></label><p id="measurementResult">尚无结果</p><div id="measurementActions"><button id="copyResult" disabled>复制结果</button><button id="saveResult" disabled>保存结果</button><button id="exitMeasurement">退出测量</button></div><p>快捷键：⌘/Ctrl+C 复制完整 JSON；Enter 复制并退出；Esc 取消；方向键移动，Shift+方向键调整边。</p></div></section></main>`
}

func measurementCSS() string {
	return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#11151b;color:#eef3fa}*{box-sizing:border-box}body{margin:0;overflow:hidden}#measurementRoot{display:flex;flex-direction:column;height:100vh}#measurementHeader{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#181e27;border-bottom:1px solid #303a49}#measurementHeader strong{font-size:18px}#measurementHeader span{color:#94a5ba;font-size:12px}#measurementControls{display:flex;gap:10px;align-items:end;padding:10px 14px;background:#131922}label{display:flex;flex-direction:column;gap:5px;color:#a9b8ca;font-size:12px}select,button{height:34px;border:1px solid #3a4658;border-radius:7px;background:#202938;color:#eef3fa;padding:0 10px}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}#targetWindow{width:270px}#referenceType{width:190px}#measurementTool{width:150px}#measurementBody{min-height:0;flex:1;display:grid;grid-template-columns:minmax(0,2.1fr) minmax(310px,.9fr);gap:12px;padding:12px}#previewShell{min-width:0;min-height:0;display:flex;align-items:center;justify-content:center;background:#080b10;border:1px solid #303a49;border-radius:9px;overflow:hidden}#measurementPreview{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain}#measurementSide{min-height:0;display:flex;flex-direction:column;gap:10px}#snapshotInfo,#measurementStatus,#measurementSide>p{margin:0;padding:9px;border-radius:7px;background:#171e28;color:#bdcad9;font-size:12px;line-height:1.45;white-space:pre-wrap}#measurementStatus{color:#8ed0ff}#measurementResult{min-height:0;flex:1;overflow:auto;white-space:pre-wrap;font:12px ui-monospace,SFMono-Regular,Consolas,monospace;padding:10px;border:1px solid #303a49;border-radius:7px;background:#0c1118;color:#dbe8f7}#measurementActions{display:flex;gap:8px}#measurementActions button{flex:1}`
}

func snapshotSummary(frame CaptureFrame) string {
	m := frame.Snapshot.Mapping
	return fmt.Sprintf("冻结采样：%s\nCapture origin=(%.2f, %.2f), logical=%.2f×%.2f, image=%d×%d, scaleX=%.4f, scaleY=%.4f\n参照：%s（不冒充 Content Bounds）",
		frame.Snapshot.SampledAt.UTC().Format(time.RFC3339Nano), m.Origin.X, m.Origin.Y, m.LogicalSize.Width, m.LogicalSize.Height,
		m.ImageSize.Width, m.ImageSize.Height, m.ScaleX, m.ScaleY, frame.Reference.Type)
}

func toolInstruction(tool string) string {
	switch tool {
	case "region":
		return "在冻结快照上拖拽框选区域；坐标和边距不会隐式裁切。"
	case "spacing":
		return "依次点击或拖拽两个点/区域，计算确定的水平与垂直间距。"
	default:
		return "在冻结快照上点击取点和原始 Capture Pixel 颜色；悬停可见局部放大镜。"
	}
}

func targetOptions(targets []TargetWindow) []customui.SelectOption {
	result := make([]customui.SelectOption, 0, len(targets))
	for _, target := range targets {
		result = append(result, customui.SelectOption{Value: target.ID, Label: target.Title + " (PID " + strconv.FormatInt(target.PID, 10) + ")"})
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

func minFloat(first, second float64) float64 {
	if first < second {
		return first
	}
	return second
}

func boundedWindowDimension(available, preferredMinimum, maximum float64) float64 {
	if available <= 0 {
		return preferredMinimum
	}
	return minFloat(maximum, available)
}
