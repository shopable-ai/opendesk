package measurement

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"html"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
	"opendesk/pkg/customui"
)

const (
	WindowID       = "measurement-session"
	previewID      = "measurementPreview"
	eventQueueSize = 512
)

type TargetWindow struct {
	ID     string
	Title  string
	PID    int64
	Bounds Rect
}

type CaptureFrame struct {
	PNG              []byte
	Snapshot         Snapshot
	Reference        Reference
	Targets          []TargetWindow
	SelectedTargetID string
	// TargetConfirmed is supplied only when the capture adapter observed a
	// reliable external foreground target before the Measurement surface exists.
	// All other candidates must be explicitly confirmed by the user.
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

	surfaceMu sync.RWMutex
	window    *customui.Window
	source    string

	frame             CaptureFrame
	image             image.Image
	assetPath         string
	overlayPath       string
	renderedAsset     string
	renderedOverlay   string
	restore           func(context.Context) error
	reference         Reference
	tool              string
	outputFormat      string
	status            string
	dragStart         *Point
	twoPointFirst     *Point
	spacingFirst      *Rect
	result            *Result
	manualPending     bool
	previousReference *Reference
	selectedTarget    string
	targetConfirmed   bool
	inspectorOpen     bool
	copyMenuOpen      bool
	altDown           bool
	regionEdit        *regionEdit
	closeOnce         sync.Once
	finishMu          sync.Mutex
	finishErr         error
}

type regionEdit struct {
	kind     string
	handle   string
	start    Point
	original Result
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
	overlayPath, err := active.writeOverlay()
	if err != nil {
		_ = os.Remove(assetPath)
		return nil, err
	}
	active.overlayPath = overlayPath
	sessionID := "measurement-" + s.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(s.sessionID.Add(1), 10)
	session, err := customui.NewSession(sessionID, s.baseDir, s.driver, active.enqueue)
	if err != nil {
		_ = os.Remove(assetPath)
		return nil, err
	}
	active.session = session
	if err := active.createSurface(ctx); err != nil {
		_ = session.Close(context.Background())
		_ = os.Remove(assetPath)
		_ = os.Remove(overlayPath)
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

// createSurface is deliberately called once for each session.  All subsequent
// Measurement rendering uses UpdateControl on this same native surface.
func (a *activeSession) createSurface(ctx context.Context) error {
	if a.session == nil {
		return errors.New("measurement UI session is unavailable")
	}
	spec := measurementWindowSpecState(a)
	window, err := a.session.Create(ctx, spec)
	if err != nil {
		return err
	}
	if _, err := window.Show(ctx); err != nil {
		_, _ = window.Close(context.Background())
		return err
	}
	a.setWindow(window)
	a.renderedAsset = a.assetPath
	a.renderedOverlay = a.overlayPath
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
			if err := a.confirmSelectedTarget(); err != nil {
				a.status = "确认候选失败：" + err.Error()
				return a.updateStatus(ctx, a.status)
			}
			a.status = "候选窗口已锁定为参照；快照保持不变。"
			return a.renderSurface(ctx)
		case "previousTarget":
			return a.cycleTarget(ctx, -1, false)
		case "nextTarget":
			return a.cycleTarget(ctx, 1, false)
		case "refreshSnapshot":
			return a.refresh(ctx, a.selectedTarget)
		case "toolPoint", "toolRegion", "toolTwoPoint", "toolSpacing":
			return a.setTool(ctx, map[string]string{"toolPoint": "point", "toolRegion": "region", "toolTwoPoint": "twoPoint", "toolSpacing": "spacing"}[event.TargetID])
		case "selectReference":
			previous := a.reference
			a.previousReference = &previous
			a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = true, nil, nil, nil
			a.status = "拖拽区域以明确新的锁定参照；不会重新截图。"
			return a.renderSurface(ctx)
		case "copyMenu":
			a.copyMenuOpen = !a.copyMenuOpen
			return a.renderSurface(ctx)
		case "copyConcise":
			return a.copyFormat(ctx, "concise")
		case "copyHuman":
			return a.copyFormat(ctx, "human")
		case "copyJSON":
			return a.copyFormat(ctx, "json")
		case "details":
			a.inspectorOpen = true
			a.copyMenuOpen = false
			return a.renderSurface(ctx)
		case "closeDetails":
			a.inspectorOpen = false
			return a.renderSurface(ctx)
		case "applyReference":
			if a.reference.Type == ReferenceManualRegion {
				a.manualPending = true
				a.status = "拖拽区域以明确新的锁定参照；不会重新截图。"
				return a.renderSurface(ctx)
			}
			if err := a.confirmSelectedTarget(); err != nil {
				return err
			}
			a.status = "已将当前真实候选窗口设为锁定参照；快照保持不变。"
			return a.renderSurface(ctx)
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
				for _, target := range a.frame.Targets {
					if target.ID == value {
						a.selectedTarget = value
						a.targetConfirmed = false
						a.status = "已选择真实窗口候选；确认后才会改变锁定参照，快照保持不变。"
						return a.renderSurface(ctx)
					}
				}
				return a.updateStatus(ctx, "所选候选窗口已不可用；快照保持不变。")
			}
		case "referenceType":
			if value == string(ReferenceManualRegion) {
				previous := a.reference
				a.previousReference = &previous
				a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = true, nil, nil, nil
				a.status = "请拖拽一个区域作为锁定参照；不会自动猜测 Content Bounds。"
				return a.renderSurface(ctx)
			}
			a.reference = a.frame.Reference
			a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = false, nil, nil, nil
			a.status = "选择当前候选窗口后点击“应用参照”确认；不会静默漂移。"
			return a.renderSurface(ctx)
		case "measurementTool":
			return a.setTool(ctx, value)
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
		return a.beginSelection(ctx, point)
	case "measurement.pointermove":
		point, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		return a.moveSelection(ctx, point)
	case "measurement.pointerup":
		point, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		return a.finishSelection(ctx, point)
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

func (a *activeSession) beginSelection(ctx context.Context, point Point) error {
	if a.manualPending {
		a.dragStart = &point
		return nil
	}
	if a.tool == "region" && a.result != nil && a.result.Region != nil {
		if kind, handle := regionEditAt(a.result.Region.Absolute, point, a.regionHandleTolerance()); kind != "" {
			a.regionEdit = &regionEdit{kind: kind, handle: handle, start: point, original: *a.result}
			a.status = "正在调整区域；Esc 取消本次局部编辑。"
			return a.updateStatus(ctx, a.status)
		}
	}
	a.dragStart = &point
	return nil
}

func (a *activeSession) moveSelection(ctx context.Context, point Point) error {
	if a.regionEdit == nil || a.regionEdit.original.Region == nil {
		return nil
	}
	edit := a.regionEdit
	region := edit.original.Region.Absolute
	switch edit.kind {
	case "move":
		region.X += point.X - edit.start.X
		region.Y += point.Y - edit.start.Y
	case "resize":
		region = resizeRegion(region, edit.handle, point)
	default:
		return errors.New("measurement region edit is invalid")
	}
	result, err := BuildRegionResult(a.frame.Snapshot, a.reference, region)
	if err != nil {
		return err
	}
	a.result = &result
	return a.renderSurface(ctx)
}

func (a *activeSession) finishSelection(ctx context.Context, point Point) error {
	if a.regionEdit != nil {
		if err := a.moveSelection(ctx, point); err != nil {
			return err
		}
		a.regionEdit = nil
		a.status = "区域已就地调整；参照、快照和 Measurement Surface 均未重建。"
		return a.renderSurface(ctx)
	}
	// A nonactivating native surface can first receive the pointer release that
	// opened its tray or menu entry. A release without this surface's own press
	// is not a user measurement gesture, so never synthesize a point from it.
	if a.dragStart == nil {
		return nil
	}
	return a.completeSelection(ctx, point)
}

func (a *activeSession) regionHandleTolerance() float64 {
	mapping := a.frame.Snapshot.Mapping
	scale := math.Min(mapping.ScaleX, mapping.ScaleY)
	if scale <= 0 {
		return 5
	}
	return math.Max(3, 8/scale)
}

func regionEditAt(region Rect, point Point, tolerance float64) (kind, handle string) {
	if point.X < region.X-tolerance || point.X > region.Right()+tolerance || point.Y < region.Y-tolerance || point.Y > region.Bottom()+tolerance {
		return "", ""
	}
	west := math.Abs(point.X-region.X) <= tolerance
	east := math.Abs(point.X-region.Right()) <= tolerance
	north := math.Abs(point.Y-region.Y) <= tolerance
	south := math.Abs(point.Y-region.Bottom()) <= tolerance
	switch {
	case north && west:
		return "resize", "nw"
	case north && east:
		return "resize", "ne"
	case south && east:
		return "resize", "se"
	case south && west:
		return "resize", "sw"
	case north:
		return "resize", "n"
	case east:
		return "resize", "e"
	case south:
		return "resize", "s"
	case west:
		return "resize", "w"
	case point.X > region.X && point.X < region.Right() && point.Y > region.Y && point.Y < region.Bottom():
		return "move", ""
	default:
		return "", ""
	}
}

// resizeRegion follows the Prototype contract: a dragged edge may approach
// and cross its opposite edge, but the committed rectangle remains normalized
// with a minimum one-logical-unit size instead of acquiring negative geometry.
func resizeRegion(region Rect, handle string, point Point) Rect {
	right, bottom := region.Right(), region.Bottom()
	if strings.Contains(handle, "w") {
		region.X = math.Min(right-1, point.X)
		region.Width = right - region.X
	}
	if strings.Contains(handle, "e") {
		region.Width = math.Max(1, point.X-region.X)
	}
	if strings.Contains(handle, "n") {
		region.Y = math.Min(bottom-1, point.Y)
		region.Height = bottom - region.Y
	}
	if strings.Contains(handle, "s") {
		region.Height = math.Max(1, point.Y-region.Y)
	}
	return region
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
		a.manualPending, a.previousReference, a.result, a.spacingFirst, a.twoPointFirst = false, nil, nil, nil, nil
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
		if !a.altDown && (selection.Width < 3 || selection.Height < 3) {
			if candidate, ok := a.targetWindow(); ok && containsPoint(candidate.Bounds, start) {
				selection = candidate.Bounds
				a.status = "已吸附到当前真实窗口候选；按住 Option 可临时暂停吸附。"
			}
		}
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
	alt, _ := fields["alt"].(bool)
	phase, _ := fields["phase"].(string)
	if phase == "up" {
		if key == "Alt" || key == "Option" {
			a.altDown = false
			return a.updateStatus(ctx, "吸附已恢复；Tab 只在当前真实候选中切换。")
		}
		return nil
	}
	switch {
	case key == "Alt" || key == "Option":
		a.altDown = true
		return a.updateStatus(ctx, "吸附已暂时暂停；松开 Option 后恢复。")
	case strings.EqualFold(key, "c") && (ctrl || meta):
		if alt {
			return a.copyFormat(ctx, "json")
		}
		if shift {
			return a.copyFormat(ctx, "human")
		}
		return a.copyFormat(ctx, "concise")
	case key == "Escape":
		return a.escape(ctx)
	case key == "1":
		return a.setTool(ctx, "point")
	case key == "2":
		return a.setTool(ctx, "region")
	case key == "3":
		return a.setTool(ctx, "twoPoint")
	case key == "4":
		return a.setTool(ctx, "spacing")
	case key == "Tab":
		if a.inspectorOpen || a.altDown {
			return nil
		}
		direction := 1
		if shift {
			direction = -1
		}
		return a.cycleTarget(ctx, direction, false)
	case strings.EqualFold(key, "r"):
		a.copyMenuOpen = false
		previous := a.reference
		a.previousReference = &previous
		a.manualPending, a.result, a.spacingFirst, a.twoPointFirst = true, nil, nil, nil
		a.status = "拖拽区域以明确新的锁定参照；不会重新截图。"
		return a.renderSurface(ctx)
	case strings.EqualFold(key, "i"):
		a.copyMenuOpen = false
		a.inspectorOpen = true
		return a.renderSurface(ctx)
	case strings.HasPrefix(key, "Arrow"):
		return a.nudge(ctx, key, shift)
	}
	return nil
}

func (a *activeSession) escape(ctx context.Context) error {
	switch {
	case a.copyMenuOpen:
		a.copyMenuOpen = false
		return a.renderSurface(ctx)
	case a.inspectorOpen:
		a.inspectorOpen = false
		return a.renderSurface(ctx)
	case a.regionEdit != nil:
		restored := a.regionEdit.original
		a.result, a.regionEdit = &restored, nil
		a.status = "已取消本次区域局部编辑；测量会话仍在继续。"
		return a.renderSurface(ctx)
	case a.dragStart != nil || a.manualPending || a.twoPointFirst != nil || a.spacingFirst != nil:
		a.dragStart, a.twoPointFirst, a.spacingFirst = nil, nil, nil
		if a.manualPending && a.previousReference != nil {
			a.reference = *a.previousReference
		}
		a.previousReference = nil
		a.manualPending = false
		a.status = "已取消当前局部操作；测量会话仍在继续。"
		return a.renderSurface(ctx)
	default:
		return a.finish(ctx, true)
	}
}

func (a *activeSession) nudge(ctx context.Context, key string, large bool) error {
	if a.result == nil {
		a.status = "请先完成一个测量结果，再使用方向键微调。"
		return a.updateStatus(ctx, a.status)
	}
	step := 1.0
	if large {
		step = 10
	}
	dx, dy := 0.0, 0.0
	switch key {
	case "ArrowLeft":
		dx = -step
	case "ArrowRight":
		dx = step
	case "ArrowUp":
		dy = -step
	case "ArrowDown":
		dy = step
	}
	var result Result
	var err error
	switch {
	case a.result.Point != nil:
		point := a.result.Point.Absolute
		point.X, point.Y = point.X+dx/a.frame.Snapshot.Mapping.ScaleX, point.Y+dy/a.frame.Snapshot.Mapping.ScaleY
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, point, a.image)
	case a.result.Region != nil:
		rect := a.result.Region.Absolute
		adjustRect(&rect, dx, dy)
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, rect)
	case a.result.TwoPoint != nil:
		first, second := a.result.TwoPoint.First, a.result.TwoPoint.Second
		second.X, second.Y = second.X+dx, second.Y+dy
		result, err = BuildTwoPointResult(a.frame.Snapshot, a.reference, first, second)
	case a.result.Spacing != nil:
		first, second := a.result.Spacing.First, a.result.Spacing.Second
		adjustRect(&second, dx, dy)
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, first, second)
	}
	if err != nil {
		a.status = "微调失败：" + err.Error()
		return a.updateStatus(ctx, a.status)
	}
	a.result = &result
	a.status = fmt.Sprintf("已按屏幕逻辑坐标微调 %.0f logical unit。", step)
	return a.renderSurface(ctx)
}

func adjustRect(rect *Rect, dx, dy float64) {
	rect.X, rect.Y = rect.X+dx, rect.Y+dy
}

func containsPoint(rect Rect, point Point) bool {
	return point.X >= rect.X && point.X <= rect.Right() && point.Y >= rect.Y && point.Y <= rect.Bottom()
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

	oldFrame, oldImage, oldAsset, oldOverlay := a.frame, a.image, a.assetPath, a.overlayPath
	oldReference, oldTarget := a.reference, a.selectedTarget
	oldResult, oldDrag := a.result, a.dragStart
	oldTwoPoint, oldSpacing, oldManual := a.twoPointFirst, a.spacingFirst, a.manualPending
	oldConfirmed, oldPreviousReference := a.targetConfirmed, a.previousReference
	oldBounds := customui.Bounds{}
	if state, stateErr := oldWindow.State(ctx); stateErr == nil {
		oldBounds = state.Bounds
	}

	a.frame, a.image, a.assetPath = frame, img, assetPath
	a.reference, a.selectedTarget = frame.Reference, frame.SelectedTargetID
	a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = nil, nil, nil, nil, false
	a.targetConfirmed = frame.TargetConfirmed
	a.status = "已冻结新的干净快照；此前结果已清除。" + targetConfirmationInstruction(frame)
	newOverlay, overlayErr := a.writeOverlay()
	if overlayErr != nil {
		a.frame, a.image, a.assetPath, a.overlayPath = oldFrame, oldImage, oldAsset, oldOverlay
		_ = os.Remove(assetPath)
		_, _ = oldWindow.Show(context.Background())
		return overlayErr
	}
	a.overlayPath = newOverlay
	newBounds := customui.Bounds{X: a.frame.Snapshot.Mapping.Origin.X, Y: a.frame.Snapshot.Mapping.Origin.Y, Width: a.frame.Snapshot.Mapping.LogicalSize.Width, Height: a.frame.Snapshot.Mapping.LogicalSize.Height}
	if oldBounds != (customui.Bounds{}) && oldBounds != newBounds {
		if _, err := oldWindow.SetBounds(ctx, newBounds); err != nil {
			a.frame, a.image, a.assetPath, a.overlayPath = oldFrame, oldImage, oldAsset, oldOverlay
			a.reference, a.selectedTarget = oldReference, oldTarget
			a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = oldResult, oldDrag, oldTwoPoint, oldSpacing, oldManual
			a.targetConfirmed, a.previousReference = oldConfirmed, oldPreviousReference
			_ = os.Remove(assetPath)
			_ = os.Remove(newOverlay)
			_, _ = oldWindow.Show(context.Background())
			return err
		}
	}
	if err := a.renderSurface(ctx); err != nil {
		a.frame, a.image, a.assetPath, a.overlayPath = oldFrame, oldImage, oldAsset, oldOverlay
		a.reference, a.selectedTarget = oldReference, oldTarget
		a.result, a.dragStart, a.twoPointFirst, a.spacingFirst, a.manualPending = oldResult, oldDrag, oldTwoPoint, oldSpacing, oldManual
		a.targetConfirmed, a.previousReference = oldConfirmed, oldPreviousReference
		if oldBounds != (customui.Bounds{}) && oldBounds != newBounds {
			_, _ = oldWindow.SetBounds(context.Background(), oldBounds)
		}
		_ = os.Remove(assetPath)
		_ = os.Remove(newOverlay)
		_, _ = oldWindow.Show(context.Background())
		return err
	}
	if oldAsset != "" && oldAsset != a.assetPath {
		_ = os.Remove(oldAsset)
	}
	_, _ = oldWindow.Show(ctx)
	return nil
}

func (a *activeSession) cycleTarget(ctx context.Context, direction int, confirm bool) error {
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
	a.selectedTarget = a.frame.Targets[next].ID
	a.targetConfirmed = false
	if confirm {
		if err := a.confirmSelectedTarget(); err != nil {
			return err
		}
		a.status = "候选窗口已锁定为参照；快照保持不变。"
	} else {
		a.status = "已切换到下一个真实窗口候选；按“确认候选”或在详情中应用参照后才会改变锁定参照。"
	}
	return a.renderSurface(ctx)
}

func (a *activeSession) renderSurface(ctx context.Context) error {
	window := a.currentWindow()
	if window == nil {
		return errors.New("measurement surface is unavailable")
	}
	overlayPath, err := a.writeOverlay()
	if err != nil {
		return err
	}
	previousOverlay := a.overlayPath
	a.overlayPath = overlayPath
	updates := []struct {
		id    string
		patch customui.ControlPatch
	}{
		{"measurementOverlay", customui.ControlPatch{Source: stringPtr(filepath.Base(a.overlayPath))}},
		{"measurementHUDMode", customui.ControlPatch{Text: stringPtr(toolLabel(a.tool))}},
		{"measurementHUDValue", customui.ControlPatch{Text: stringPtr(a.hudValue())}},
		{"measurementHUDReference", customui.ControlPatch{Text: stringPtr(referenceSummary(a.reference))}},
		{"measurementStatus", customui.ControlPatch{Text: stringPtr(a.status)}},
		{"measurementInspector", customui.ControlPatch{Visible: boolPtr(a.inspectorOpen)}},
		{"copyMenuPanel", customui.ControlPatch{Visible: boolPtr(a.copyMenuOpen)}},
		{"measurementFull", customui.ControlPatch{Text: stringPtr(a.fullText())}},
		{"measurementMapping", customui.ControlPatch{Text: stringPtr(snapshotSummary(a.frame))}},
		{"measurementJSON", customui.ControlPatch{Text: stringPtr(a.structuredText())}},
		{"referenceType", customui.ControlPatch{Value: string(a.reference.Type)}},
		{"outputFormat", customui.ControlPatch{Value: a.outputFormat}},
		{"toolPoint", customui.ControlPatch{Active: boolPtr(a.tool == "point")}},
		{"toolRegion", customui.ControlPatch{Active: boolPtr(a.tool == "region")}},
		{"toolTwoPoint", customui.ControlPatch{Active: boolPtr(a.tool == "twoPoint")}},
		{"toolSpacing", customui.ControlPatch{Active: boolPtr(a.tool == "spacing")}},
		{"details", customui.ControlPatch{Active: boolPtr(a.inspectorOpen)}},
	}
	if a.renderedAsset != a.assetPath {
		updates = append([]struct {
			id    string
			patch customui.ControlPatch
		}{{"measurementPreview", customui.ControlPatch{Source: stringPtr(filepath.Base(a.assetPath))}}}, updates...)
	}
	for _, update := range updates {
		if _, err := window.UpdateControl(ctx, update.id, update.patch); err != nil {
			a.overlayPath = previousOverlay
			_ = os.Remove(overlayPath)
			return fmt.Errorf("patch measurement control %s: %w", update.id, err)
		}
	}
	oldRenderedOverlay := a.renderedOverlay
	a.renderedAsset, a.renderedOverlay = a.assetPath, a.overlayPath
	if oldRenderedOverlay != "" && oldRenderedOverlay != a.overlayPath {
		_ = os.Remove(oldRenderedOverlay)
	}
	if previousOverlay != "" && previousOverlay != oldRenderedOverlay && previousOverlay != a.overlayPath {
		_ = os.Remove(previousOverlay)
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
	return a.copyFormat(ctx, a.outputFormat)
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
		return "完整中文说明"
	case "json":
		return "结构化数据"
	default:
		return "简明数值"
	}
}

func stringPtr(value string) *string { return &value }
func boolPtr(value bool) *bool       { return &value }

func toolLabel(tool string) string {
	switch tool {
	case "region":
		return "区域"
	case "twoPoint":
		return "两点"
	case "spacing":
		return "两区域"
	default:
		return "点"
	}
}

func (a *activeSession) setTool(ctx context.Context, tool string) error {
	if tool != "point" && tool != "region" && tool != "twoPoint" && tool != "spacing" {
		return nil
	}
	a.tool, a.dragStart, a.twoPointFirst, a.spacingFirst, a.regionEdit = tool, nil, nil, nil, nil
	a.status = toolInstruction(tool)
	return a.renderSurface(ctx)
}

func (a *activeSession) targetWindow() (TargetWindow, bool) {
	for _, target := range a.frame.Targets {
		if target.ID == a.selectedTarget {
			if validRect(target.Bounds) && target.Bounds.Width > 0 && target.Bounds.Height > 0 {
				return target, true
			}
			if target.ID == a.frame.SelectedTargetID {
				return TargetWindow{ID: target.ID, Title: target.Title, PID: target.PID, Bounds: a.frame.Reference.Bounds}, true
			}
		}
	}
	return TargetWindow{}, false
}

func (a *activeSession) confirmSelectedTarget() error {
	target, ok := a.targetWindow()
	if !ok {
		return errors.New("当前候选没有可证明的窗口边界")
	}
	a.reference = Reference{
		Type:   ReferenceWindowOuter,
		Bounds: target.Bounds,
		Window: &WindowIdentity{ID: target.ID, PID: target.PID, Title: target.Title},
	}
	a.targetConfirmed, a.manualPending, a.previousReference, a.result, a.twoPointFirst, a.spacingFirst = true, false, nil, nil, nil, nil
	return nil
}

func (a *activeSession) hudValue() string {
	if a.result == nil {
		if a.manualPending {
			return "拖拽以确认参照区域"
		}
		return "尚无测量结果"
	}
	switch {
	case a.result.Point != nil:
		point := a.result.Point
		colorValue := "颜色不可用"
		if point.Color != nil {
			colorValue = point.Color.Hex
		}
		return fmt.Sprintf("x %.1f  y %.1f  %s", point.Absolute.X, point.Absolute.Y, colorValue)
	case a.result.Region != nil:
		region := a.result.Region
		return fmt.Sprintf("%.1f × %.1f · L %.1f R %.1f", region.Absolute.Width, region.Absolute.Height, region.EdgeDistances.Left, region.EdgeDistances.Right)
	case a.result.TwoPoint != nil:
		pair := a.result.TwoPoint
		return fmt.Sprintf("dx %.1f · dy %.1f · %.1f", pair.DeltaX, pair.DeltaY, pair.Distance)
	case a.result.Spacing != nil:
		spacing := a.result.Spacing.Spacing
		return fmt.Sprintf("水平 %.1f · 垂直 %.1f", spacing.Horizontal.Gap, spacing.Vertical.Gap)
	default:
		return "尚无测量结果"
	}
}

func (a *activeSession) fullText() string {
	if a.result == nil {
		return "尚未选择测量对象。"
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return "测量导出失败：" + err.Error()
	}
	return outputs.Human
}

func (a *activeSession) structuredText() string {
	if a.result == nil {
		return "尚无结构化数据。"
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return "测量导出失败：" + err.Error()
	}
	return outputs.JSON
}

func (a *activeSession) copyFormat(ctx context.Context, format string) error {
	if a.result == nil {
		return a.updateStatus(ctx, "复制失败：尚无测量结果。")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	if err := a.service.clipboard.Copy(outputValue(outputs, format)); err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	a.copyMenuOpen = false
	a.status = "已复制“" + outputFormatLabel(format) + "”（含参照、坐标空间与单位）。"
	return a.renderSurface(ctx)
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
		if a.overlayPath != "" {
			_ = os.Remove(a.overlayPath)
		}
		if a.renderedOverlay != "" && a.renderedOverlay != a.overlayPath {
			_ = os.Remove(a.renderedOverlay)
		}
	})
	return result
}

func measurementWindowSpec(frame CaptureFrame, assetName, source string) customui.WindowSpec {
	view := &activeSession{
		frame: frame, reference: frame.Reference, assetPath: assetName, overlayPath: "overlay.png", tool: "point", outputFormat: "concise",
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
		// Snapshot and transparent overlay assets live in the Service runtime
		// directory, not in the process working directory. The native asset
		// scheme resolves their relative img sources from this exact directory.
		Content:     customui.ContentSpec{HTML: measurementHTML(a), CSS: measurementCSS(), BasePath: filepath.Dir(a.assetPath)},
		Measurement: &customui.MeasurementSurfaceSpec{TargetID: previewID},
	}
}

func measurementHTML(a *activeSession) string {
	assetName := html.EscapeString(filepath.Base(a.assetPath))
	overlayName := html.EscapeString(filepath.Base(a.overlayPath))
	return `<main id="measurementRoot"><img id="measurementPreview" src="` + assetName + `"><img id="measurementOverlay" src="` + overlayName + `"><section id="measurementHUD" class="top-right"><strong>桌面测量</strong><p id="measurementHUDMode">` + html.EscapeString(toolLabel(a.tool)) + `</p><p id="measurementHUDValue">` + html.EscapeString(a.hudValue()) + `</p><p id="measurementHUDReference">` + html.EscapeString(referenceSummary(a.reference)) + `</p></section><p id="measurementStatus" role="status">` + html.EscapeString(a.status) + `</p><section id="measurementToolbar" data-opendesk-measurement-toolbar aria-label="桌面测量工具"><span class="measurementToolbarDragHandle" data-opendesk-measurement-toolbar-drag role="img" aria-label="拖动工具条">⠿</span><button id="toolPoint" aria-label="点">点</button><button id="toolRegion" aria-label="区域">区域</button><button id="toolTwoPoint" aria-label="两点">两点</button><button id="toolSpacing" aria-label="两区域">两区域</button><span class="sep">|</span><button id="selectReference">参照</button><button id="copyMenu">复制 ▾</button><button id="details">详情</button><button id="exitMeasurement">退出</button><section id="copyMenuPanel" hidden><button id="copyConcise">① 简明数值</button><button id="copyHuman">② 完整中文说明</button><button id="copyJSON">③ 结构化数据</button></section></section><section id="measurementInspector" data-opendesk-measurement-inspector hidden aria-label="测量详情"><header><strong>测量详情</strong><button id="closeDetails">关闭</button></header><p>完整 Measurement、Snapshot / Mapping 与导出内容只在此处显示；关闭详情不会结束测量。</p><label>候选窗口<select id="targetWindow">` + targetOptions(a) + `</select></label><button id="previousTarget">上一个候选</button><button id="nextTarget">下一个候选</button><button id="confirmTarget">确认候选</button><button id="refreshSnapshot">重新冻结</button><label>参照<select id="referenceType">` + referenceOptions(a) + `</select></label><button id="applyReference">应用参照</button><p class="detailTitle">完整 Measurement</p><p id="measurementFull" class="detailData">` + html.EscapeString(a.fullText()) + `</p><p class="detailTitle">Snapshot / Mapping</p><p id="measurementMapping" class="detailData">` + html.EscapeString(snapshotSummary(a.frame)) + `</p><p class="detailTitle">结构化数据</p><p id="measurementJSON" class="detailData">` + html.EscapeString(a.structuredText()) + `</p><label>导出档位<select id="outputFormat">` + outputOptions(a.outputFormat) + `</select></label><button id="copyResult">复制所选档</button><button id="saveResult">保存所选档</button></section></main>`
}

func targetOptions(a *activeSession) string {
	var options strings.Builder
	for _, target := range a.frame.Targets {
		selected := ""
		if target.ID == a.selectedTarget {
			selected = " selected"
		}
		fmt.Fprintf(&options, `<option value="%s"%s>%s</option>`, html.EscapeString(target.ID), selected, html.EscapeString(target.Title))
	}
	return options.String()
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
	if frame.TargetConfirmed {
		return "当前外部前台窗口已锁定为参照；快照与参照均不会随鼠标漂移。"
	}
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
	values := []struct{ value, label string }{{"concise", "① 简明数值"}, {"human", "② 完整中文说明"}, {"json", "③ 结构化数据"}}
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

// writeOverlay renders only presentation pixels.  Result Geometry, reference
// relation and color always remain in pkg/measurement's canonical Result; this
// transparent asset merely keeps the single native surface patchable without a
// second DOM geometry implementation.
func (a *activeSession) writeOverlay() (string, error) {
	mapping := a.frame.Snapshot.Mapping
	if mapping.ImageSize.Width <= 0 || mapping.ImageSize.Height <= 0 {
		return "", errors.New("measurement overlay requires a positive capture image")
	}
	overlay := image.NewRGBA(image.Rect(0, 0, mapping.ImageSize.Width, mapping.ImageSize.Height))
	draw.Draw(overlay, overlay.Bounds(), image.NewUniform(color.RGBA{}), image.Point{}, draw.Src)
	if target, ok := a.targetWindow(); ok {
		drawLogicalRect(overlay, mapping, target.Bounds, color.RGBA{R: 33, G: 140, B: 205, A: 245}, 3)
	} else {
		drawLogicalRect(overlay, mapping, a.frame.Reference.Bounds, color.RGBA{R: 33, G: 140, B: 205, A: 245}, 3)
	}
	drawLogicalRect(overlay, mapping, a.reference.Bounds, color.RGBA{R: 41, G: 138, B: 120, A: 245}, 2)
	if a.result != nil {
		switch {
		case a.result.Point != nil:
			drawLogicalPoint(overlay, mapping, a.result.Point.Absolute, color.RGBA{R: 255, G: 255, B: 255, A: 255})
			drawMicro(overlay, mapping, a.result.Point.Absolute, a.hudValue())
		case a.result.Region != nil:
			drawLogicalRect(overlay, mapping, a.result.Region.Absolute, color.RGBA{R: 113, G: 238, B: 169, A: 255}, 3)
			drawLogicalHandles(overlay, mapping, a.result.Region.Absolute)
			drawMicro(overlay, mapping, a.result.Region.Absolute.Center(), a.hudValue())
		case a.result.TwoPoint != nil:
			first, second := a.result.TwoPoint.First, a.result.TwoPoint.Second
			drawLogicalPoint(overlay, mapping, first, color.RGBA{R: 113, G: 238, B: 169, A: 255})
			drawLogicalPoint(overlay, mapping, second, color.RGBA{R: 113, G: 238, B: 169, A: 255})
			drawLogicalLine(overlay, mapping, first, second, color.RGBA{R: 113, G: 238, B: 169, A: 255})
			drawMicro(overlay, mapping, second, a.hudValue())
		case a.result.Spacing != nil:
			first, second := a.result.Spacing.First, a.result.Spacing.Second
			drawLogicalRect(overlay, mapping, first, color.RGBA{R: 113, G: 238, B: 169, A: 255}, 3)
			drawLogicalRect(overlay, mapping, second, color.RGBA{R: 113, G: 238, B: 169, A: 255}, 3)
			drawLogicalLine(overlay, mapping, first.Center(), second.Center(), color.RGBA{R: 113, G: 238, B: 169, A: 255})
			drawMicro(overlay, mapping, second.Center(), a.hudValue())
		}
	}
	name := "overlay-" + a.service.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(a.service.assetID.Add(1), 10) + ".png"
	path := filepath.Join(a.service.baseDir, name)
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, overlay); err != nil {
		return "", fmt.Errorf("encode measurement overlay: %w", err)
	}
	if err := os.WriteFile(path, encoded.Bytes(), 0o600); err != nil {
		return "", fmt.Errorf("persist measurement overlay: %w", err)
	}
	return path, nil
}

func logicalImagePoint(mapping CaptureMapping, point Point) image.Point {
	pixel := mapping.LogicalToImage(point)
	return image.Point{X: int(math.Round(pixel.X)), Y: int(math.Round(pixel.Y))}
}

func drawLogicalRect(dst *image.RGBA, mapping CaptureMapping, rect Rect, tint color.RGBA, width int) {
	first := logicalImagePoint(mapping, Point{X: rect.X, Y: rect.Y})
	second := logicalImagePoint(mapping, Point{X: rect.Right(), Y: rect.Bottom()})
	if second.X < first.X {
		first.X, second.X = second.X, first.X
	}
	if second.Y < first.Y {
		first.Y, second.Y = second.Y, first.Y
	}
	strokeImageRect(dst, image.Rect(first.X, first.Y, second.X+1, second.Y+1), tint, width)
}

func drawLogicalPoint(dst *image.RGBA, mapping CaptureMapping, point Point, tint color.RGBA) {
	p := logicalImagePoint(mapping, point)
	for offset := -9; offset <= 9; offset++ {
		setRGBA(dst, p.X+offset, p.Y, tint)
		setRGBA(dst, p.X, p.Y+offset, tint)
	}
	strokeImageRect(dst, image.Rect(p.X-5, p.Y-5, p.X+6, p.Y+6), color.RGBA{R: 0, G: 0, B: 0, A: 220}, 1)
}

func drawLogicalLine(dst *image.RGBA, mapping CaptureMapping, first, second Point, tint color.RGBA) {
	a, b := logicalImagePoint(mapping, first), logicalImagePoint(mapping, second)
	dx, dy := int(math.Abs(float64(b.X-a.X))), -int(math.Abs(float64(b.Y-a.Y)))
	sx, sy := -1, -1
	if a.X < b.X {
		sx = 1
	}
	if a.Y < b.Y {
		sy = 1
	}
	err := dx + dy
	for {
		setRGBA(dst, a.X, a.Y, tint)
		if a == b {
			return
		}
		double := 2 * err
		if double >= dy {
			err += dy
			a.X += sx
		}
		if double <= dx {
			err += dx
			a.Y += sy
		}
	}
}

func drawLogicalHandles(dst *image.RGBA, mapping CaptureMapping, region Rect) {
	for _, point := range []Point{
		{X: region.X, Y: region.Y}, {X: region.X + region.Width/2, Y: region.Y}, {X: region.Right(), Y: region.Y},
		{X: region.Right(), Y: region.Y + region.Height/2}, {X: region.Right(), Y: region.Bottom()}, {X: region.X + region.Width/2, Y: region.Bottom()},
		{X: region.X, Y: region.Bottom()}, {X: region.X, Y: region.Y + region.Height/2},
	} {
		p := logicalImagePoint(mapping, point)
		fillImageRect(dst, image.Rect(p.X-4, p.Y-4, p.X+5, p.Y+5), color.RGBA{R: 248, G: 255, B: 252, A: 255})
		strokeImageRect(dst, image.Rect(p.X-4, p.Y-4, p.X+5, p.Y+5), color.RGBA{R: 28, G: 105, B: 83, A: 255}, 1)
	}
}

func drawMicro(dst *image.RGBA, mapping CaptureMapping, point Point, value string) {
	anchor := logicalImagePoint(mapping, point)
	width, height := len(value)*7+10, 19
	x, y := anchor.X+14, anchor.Y+14
	if x+width >= dst.Bounds().Max.X {
		x = anchor.X - width - 14
	}
	if y+height >= dst.Bounds().Max.Y {
		y = anchor.Y - height - 14
	}
	x = minNumberInt(maxNumberInt(2, x), maxNumberInt(2, dst.Bounds().Max.X-width-2))
	y = minNumberInt(maxNumberInt(2, y), maxNumberInt(2, dst.Bounds().Max.Y-height-2))
	fillImageRect(dst, image.Rect(x, y, x+width, y+height), color.RGBA{R: 18, G: 34, B: 41, A: 235})
	strokeImageRect(dst, image.Rect(x, y, x+width, y+height), color.RGBA{R: 230, G: 239, B: 239, A: 255}, 1)
	drawer := &font.Drawer{Dst: dst, Src: image.NewUniform(color.RGBA{R: 244, G: 252, B: 250, A: 255}), Face: basicfont.Face7x13, Dot: fixed.P(x+5, y+14)}
	drawer.DrawString(value)
}

func strokeImageRect(dst *image.RGBA, rect image.Rectangle, tint color.RGBA, width int) {
	for offset := 0; offset < width; offset++ {
		for x := rect.Min.X + offset; x < rect.Max.X-offset; x++ {
			setRGBA(dst, x, rect.Min.Y+offset, tint)
			setRGBA(dst, x, rect.Max.Y-1-offset, tint)
		}
		for y := rect.Min.Y + offset; y < rect.Max.Y-offset; y++ {
			setRGBA(dst, rect.Min.X+offset, y, tint)
			setRGBA(dst, rect.Max.X-1-offset, y, tint)
		}
	}
}

func fillImageRect(dst *image.RGBA, rect image.Rectangle, tint color.RGBA) {
	for y := rect.Min.Y; y < rect.Max.Y; y++ {
		for x := rect.Min.X; x < rect.Max.X; x++ {
			setRGBA(dst, x, y, tint)
		}
	}
}

func setRGBA(dst *image.RGBA, x, y int, tint color.RGBA) {
	if image.Pt(x, y).In(dst.Bounds()) {
		dst.SetRGBA(x, y, tint)
	}
}

func minNumberInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}
func maxNumberInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}

func measurementCSS() string {
	return `:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#000;color:#f5f8fc}*{box-sizing:border-box}html,body,#measurementRoot{margin:0;width:100%;height:100%;overflow:hidden}#measurementRoot{position:relative;background:#000;user-select:none}#measurementPreview,#measurementOverlay{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block}#measurementPreview{z-index:1}#measurementOverlay{z-index:4;pointer-events:none}button,select{height:29px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:#202833;color:#f5f8fc;padding:0 9px;font:12px inherit}button{cursor:pointer}button[aria-pressed=true]{background:#21554b;border-color:#69dcc1;color:#c5ffef}#measurementToolbar{position:absolute;z-index:12;left:50%;bottom:17px;top:auto;transform:translateX(-50%);display:flex;align-items:center;gap:3px;max-width:calc(100vw - 32px);padding:5px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(18,27,35,.94);box-shadow:0 8px 26px rgba(0,0,0,.32)}#measurementToolbar .measurementToolbarDragHandle{display:grid;place-items:center;width:22px;height:29px;margin-right:1px;border-radius:6px;color:#9db1c0;font-size:17px;line-height:1;cursor:grab;touch-action:none;user-select:none}#measurementToolbar .measurementToolbarDragHandle:hover{background:rgba(255,255,255,.1);color:#f5f8fc}#measurementToolbar .measurementToolbarDragHandle:active{cursor:grabbing}#measurementToolbar .sep{padding:0 3px;color:#687989}#copyMenuPanel{position:absolute;right:48px;top:43px;bottom:auto;display:flex;flex-direction:column;gap:3px;min-width:150px;padding:5px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#1b2833;box-shadow:0 8px 24px rgba(0,0,0,.32)}#measurementToolbar[data-opendesk-toolbar-menu-placement=above] #copyMenuPanel{top:auto;bottom:43px}#copyMenuPanel button{text-align:left}#measurementHUD{position:absolute;z-index:11;width:min(268px,calc(100vw - 24px));padding:9px 11px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(18,27,35,.94);box-shadow:0 8px 26px rgba(0,0,0,.28);pointer-events:none}#measurementHUD.top-right{top:12px;right:12px}#measurementHUD p{margin:5px 0 0;font-size:11px;line-height:1.35;white-space:pre-wrap}#measurementHUDMode{color:#9fe8d6}#measurementHUDValue{color:#fff;font-weight:600}#measurementHUDReference{color:#ffd479}#measurementStatus{position:absolute;z-index:11;left:16px;top:62px;bottom:auto;max-width:min(360px,calc(100vw - 32px));margin:0;padding:6px 9px;border-radius:7px;background:rgba(18,27,35,.88);color:#a8cce7;font-size:11px;line-height:1.35;pointer-events:none}#measurementInspector{position:absolute;z-index:15;right:12px;top:12px;width:min(382px,calc(100vw - 24px));max-height:calc(100vh - 90px);overflow:auto;padding:14px;border:1px solid #8394a0;border-radius:12px;background:#f4f7f8;color:#24333f;box-shadow:0 18px 55px rgba(0,0,0,.35)}#measurementInspector header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}#measurementInspector button,#measurementInspector select{margin:3px 3px 3px 0;background:#e4ecf0;color:#223f48;border-color:#c6d1d9}#measurementInspector label{display:flex;flex-direction:column;gap:3px;margin-top:9px;font-size:11px}#measurementInspector select{max-width:100%;margin:0}.detailTitle{margin:13px 0 4px;font-size:11px;color:#637987;font-weight:600}.detailData{margin:0;white-space:pre-wrap;word-break:break-word;padding:8px;border-radius:6px;background:#e5ecef;font:10px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#203742}body>div[style*="214748364"]{display:none!important}[hidden]{display:none!important}`
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
