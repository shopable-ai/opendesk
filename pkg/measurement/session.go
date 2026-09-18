package measurement

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	overlayID      = "measurementOverlay"
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
	TargetConfirmed  bool
	Restore          func(context.Context) error
}

type CaptureAdapter interface {
	Capture(context.Context, string) (CaptureFrame, error)
}

// ReferenceSelection is the result of the one explicit live-desktop action
// that is allowed to create an initial Measurement snapshot. It deliberately
// carries the exact window observation rather than a title or foreground
// fallback: Capture must revalidate this reference before it reads pixels.
type ReferenceSelection struct {
	Reference Reference
}

func (selection ReferenceSelection) Validate() error {
	if selection.Reference.Type != ReferenceWindowOuter {
		return errors.New("measurement reference selection requires an outer window reference")
	}
	return selection.Reference.Validate()
}

// ReferenceSelector owns only the live Reference-selection phase. It must
// not take screenshots or create product UI surfaces; Service owns the
// lifecycle transition into FREEZING and calls Capture separately.
type ReferenceSelector interface {
	SelectReference(context.Context) (ReferenceSelection, error)
}

// ReferenceCaptureAdapter is the optional exact-reference counterpart to the
// long-standing CaptureAdapter. The production adapter implements it so a
// confirmed PID/native handle/bounds observation is revalidated without a
// same-title or foreground-window fallback. Existing non-product adapters
// retain the CaptureAdapter contract for isolated model tests.
type ReferenceCaptureAdapter interface {
	CaptureReference(context.Context, ReferenceSelection) (CaptureFrame, error)
}

type ClipboardWriter interface {
	Copy(string) error
}

type ServiceOptions struct {
	Driver    customui.Driver
	Capture   CaptureAdapter
	Selector  ReferenceSelector
	Clipboard ClipboardWriter
	BaseDir   string
	SaveDir   string
	Now       func() time.Time
}

type Service struct {
	driver    customui.Driver
	capture   CaptureAdapter
	selector  ReferenceSelector
	clipboard ClipboardWriter
	baseDir   string
	saveDir   string
	now       func() time.Time
	mu        sync.Mutex
	active    *activeSession
	opening   chan struct{} // serializes the synchronous adapter-only compatibility open
	tool      string
	assetID   atomic.Uint64
	sessionID atomic.Uint64
}

type activeSession struct {
	service   *Service
	session   *customui.Session
	events    chan customui.Event
	done      chan struct{}
	surfaceMu sync.RWMutex
	window    *customui.Window
	source    string

	frame           CaptureFrame
	image           image.Image
	assetPath       string
	overlayPath     string
	restore         func(context.Context) error
	selection       ReferenceSelection
	selectionMu     sync.Mutex
	selectionCancel context.CancelFunc
	freezeMu        sync.Mutex

	reference       Reference
	tool            string
	outputFormat    string
	status          string
	selectedTarget  string
	targetConfirmed bool
	result          *Result
	pointer         *Point

	dragStart         *Point
	twoPointFirst     *Point
	spacingFirst      *Rect
	manualPending     bool
	copyMenuOpen      bool
	inspectorOpen     bool
	snapEnabled       bool
	snapSuspended     bool
	marginView        string
	lockedCandidate   *CandidateDescriptor
	regionHandle      RegionEditHandle
	editAnchor        *Point
	editOriginal      *Rect
	lastPointerRender time.Time

	operationMu sync.Mutex
	stateMu     sync.RWMutex
	phase       MeasurementPhase
	sessionID   string
	generation  uint64
	snapshotID  string

	closeOnce sync.Once
	finished  atomic.Bool
	runOnce   sync.Once
	finishMu  sync.Mutex
	finishErr error
}

type ServiceCounts struct {
	Sessions  int
	Listeners int
}

type ServiceSessionState struct {
	Phase MeasurementPhase `json:"phase"`
	Token SnapshotToken    `json:"snapshot"`
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
	return &Service{driver: options.Driver, capture: options.Capture, selector: options.Selector, clipboard: options.Clipboard, baseDir: absolute, saveDir: saveDir, now: options.Now, tool: "region"}, nil
}

func (s *Service) Open(ctx context.Context, source string) error {
	if s == nil {
		return errors.New("measurement service is unavailable")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	var current *activeSession
	for {
		s.mu.Lock()
		current = s.active
		if current != nil {
			s.mu.Unlock()
			break
		}
		if s.selector != nil {
			// Product construction always supplies a Selector. Publish this live
			// session immediately so concurrent entry points share its one observer.
			active := s.newSelectingSession(source, s.tool)
			s.active = active
			s.mu.Unlock()
			go active.selectAndFreeze(ctx)
			return nil
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
		// The adapter-only seam predates Live Reference Selection. Complete the
		// historic Capture-backed surface before publishing it, so old callers
		// cannot send Measurement input into a partially initialized session.
		opening := make(chan struct{})
		s.opening = opening
		active := s.newSelectingSession(source, s.tool)
		s.mu.Unlock()

		active.selectAndFreeze(ctx)
		result := active.finishResult()

		s.mu.Lock()
		if !active.isFinished() && s.active == nil {
			s.active = active
		}
		if s.opening == opening {
			s.opening = nil
			close(opening)
		}
		s.mu.Unlock()
		return result
	}

	switch current.phaseValue() {
	case PhaseAdjusting:
		return current.continueMeasurement(ctx)
	case PhaseReferenceSelecting, PhaseFreezing:
		// A selection session already owns the only observer and native hint
		// surface. Re-entry is intentionally a no-op, never a second capture.
		return nil
	}
	w := current.currentWindow()
	if w == nil {
		return errors.New("measurement session has no active surface")
	}
	_, err := w.Show(ctx)
	return err
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

func (s *Service) newSelectingSession(source, tool string) *activeSession {
	if tool == "" {
		tool = "region"
	}
	sessionID := "measurement-" + s.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(s.sessionID.Add(1), 10)
	return &activeSession{
		service: s, events: make(chan customui.Event, eventQueueSize), done: make(chan struct{}),
		tool: tool, outputFormat: "concise", status: "移动鼠标选择窗口 · 单击开始测量 · Esc 取消",
		source:      strings.TrimSpace(source),
		snapEnabled: true, marginView: "window",
		phase: PhaseReferenceSelecting, sessionID: sessionID, generation: 1,
	}

}

// selectAndFreeze keeps initial selection outside Capture so REFERENCE_SELECTING
// is observable, cancellable and snapshot-free. A failed capture returns to a
// fresh Live selection instead of silently substituting a foreground window or
// retaining an old frozen image.
func (a *activeSession) selectAndFreeze(parent context.Context) {
	if a.isFinished() {
		return
	}
	if parent == nil {
		parent = context.Background()
	}
	if a.service.selector == nil {
		// Isolated package tests and non-product embedders retain the historic
		// adapter-only seam. App Mode always installs a selector and therefore
		// never reaches this compatibility path.
		a.stateMu.Lock()
		a.phase, a.snapshotID = PhaseFreezing, ""
		a.stateMu.Unlock()
		frame, err := a.service.capture.Capture(parent, "")
		if err != nil {
			a.finishWithError(context.Background(), true, fmt.Errorf("capture initial desktop snapshot: %w", err))
			return
		}
		if err := a.initializeFrozenSurfaceForLiveSession(parent, frame); err != nil {
			a.finishWithError(context.Background(), true, err)
			return
		}
		a.startRun()
		return
	}
	for {
		if a.isFinished() {
			return
		}
		ctx, cancel := context.WithCancel(parent)
		if !a.setSelectionCancel(cancel) {
			cancel()
			return
		}
		selection, err := a.selectReference(ctx)
		if err != nil {
			a.clearSelectionCancel(cancel)
			cancel()
			if a.isFinished() {
				return
			}
			a.finishWithError(context.Background(), true, fmt.Errorf("select measurement reference: %w", err))
			return
		}
		if a.isFinished() {
			a.clearSelectionCancel(cancel)
			cancel()
			return
		}
		if err := selection.Validate(); err != nil {
			a.clearSelectionCancel(cancel)
			cancel()
			a.finishWithError(context.Background(), true, fmt.Errorf("invalid measurement reference selection: %w", err))
			return
		}
		a.stateMu.Lock()
		if a.phase != PhaseReferenceSelecting {
			a.stateMu.Unlock()
			return
		}
		a.phase = PhaseFreezing
		a.snapshotID = ""
		a.stateMu.Unlock()
		a.selection = selection

		frame, err := a.captureInitial(ctx, selection)
		a.clearSelectionCancel(cancel)
		cancel()
		if err != nil {
			if a.isFinished() {
				return
			}
			a.stateMu.Lock()
			a.phase = PhaseReferenceSelecting
			a.snapshotID = ""
			a.stateMu.Unlock()
			a.status = "冻结参照窗口失败；请重新选择窗口。"
			continue
		}
		if a.isFinished() {
			return
		}
		if err := a.initializeFrozenSurfaceForLiveSession(context.Background(), frame); err != nil {
			if a.isFinished() {
				return
			}
			a.stateMu.Lock()
			a.phase = PhaseReferenceSelecting
			a.snapshotID = ""
			a.stateMu.Unlock()
			a.status = "创建测量界面失败；请重新选择窗口。"
			continue
		}
		a.startRun()
		return
	}
}

// initializeFrozenSurfaceForLiveSession makes terminal cleanup and surface
// construction mutually exclusive. A capture backend can return a valid frame
// after cancellation; in that case finish wins and the frame is discarded
// before it can persist an asset or revive the Custom UI session. This lock is
// deliberately separate from operationMu: initialization renders the surface,
// while reselect/refresh operations own operationMu and must not deadlock on
// that render path.
func (a *activeSession) initializeFrozenSurfaceForLiveSession(ctx context.Context, frame CaptureFrame) error {
	a.freezeMu.Lock()
	defer a.freezeMu.Unlock()
	if a.isFinished() {
		return context.Canceled
	}
	return a.initializeFrozenSurface(ctx, frame)
}

func (a *activeSession) selectReference(ctx context.Context) (ReferenceSelection, error) {
	if a.service.selector == nil {
		// Compatibility for isolated callers which provide only the historic
		// CaptureAdapter. Product construction always supplies a selector.
		return ReferenceSelection{}, nil
	}
	return a.service.selector.SelectReference(ctx)
}

func (a *activeSession) captureInitial(ctx context.Context, selection ReferenceSelection) (CaptureFrame, error) {
	if exact, ok := a.service.capture.(ReferenceCaptureAdapter); ok && a.service.selector != nil {
		return exact.CaptureReference(ctx, selection)
	}
	return a.service.capture.Capture(ctx, "")
}

func (a *activeSession) initializeFrozenSurface(ctx context.Context, frame CaptureFrame) error {
	img, assetPath, err := a.service.prepareFrame(frame)
	if err != nil {
		return err
	}
	a.frame, a.image, a.assetPath, a.restore, a.reference = frame, img, assetPath, frame.Restore, frame.Reference
	a.status, a.selectedTarget, a.targetConfirmed = targetConfirmationInstruction(frame), frame.SelectedTargetID, frame.TargetConfirmed
	a.snapshotID = snapshotIdentity(a.sessionID, a.generation, frame.Snapshot)
	overlayPath, err := a.writeOverlay()
	if err != nil {
		_ = os.Remove(assetPath)
		return err
	}
	a.overlayPath = overlayPath
	// A Service session can reselect and create multiple frozen generations.
	// Custom UI intentionally reserves a closed window ID for a driver session,
	// so give each frozen surface a private generation-scoped transport session
	// while retaining a.sessionID as the stable Measurement/Snapshot identity.
	session, err := customui.NewSession(a.frozenSurfaceSessionID(), a.service.baseDir, a.service.driver, a.enqueue)
	if err != nil {
		_ = os.Remove(assetPath)
		_ = os.Remove(overlayPath)
		return err
	}
	a.session = session
	if err := a.createSurface(ctx); err != nil {
		_ = session.Close(context.Background())
		_ = os.Remove(assetPath)
		_ = os.Remove(overlayPath)
		return err
	}
	a.stateMu.Lock()
	a.phase = PhaseMeasuring
	a.stateMu.Unlock()
	if err := a.renderSurface(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Service) prepareFrame(frame CaptureFrame) (image.Image, string, error) {
	if len(frame.PNG) == 0 {
		return nil, "", errors.New("measurement capture returned no PNG data")
	}
	img, format, err := image.Decode(bytes.NewReader(frame.PNG))
	if err != nil || format != "png" {
		if err == nil {
			err = errors.New("capture is not PNG")
		}
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

func (s *Service) State() ServiceSessionState {
	if s == nil {
		return ServiceSessionState{Phase: PhaseIdle}
	}
	s.mu.Lock()
	a := s.active
	s.mu.Unlock()
	if a == nil {
		return ServiceSessionState{Phase: PhaseIdle}
	}
	return ServiceSessionState{Phase: a.phaseValue(), Token: a.snapshotToken()}
}

func (s *Service) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	a := s.active
	s.mu.Unlock()
	if a == nil {
		return nil
	}
	return a.finish(ctx, true)
}

func (a *activeSession) finishResult() error {
	a.finishMu.Lock()
	defer a.finishMu.Unlock()
	return a.finishErr
}

func (a *activeSession) setSelectionCancel(cancel context.CancelFunc) bool {
	a.selectionMu.Lock()
	if a.finished.Load() {
		a.selectionMu.Unlock()
		return false
	}
	a.selectionCancel = cancel
	a.selectionMu.Unlock()
	return true
}

func (a *activeSession) clearSelectionCancel(cancel context.CancelFunc) {
	a.selectionMu.Lock()
	if a.selectionCancel != nil {
		a.selectionCancel = nil
	}
	a.selectionMu.Unlock()
}

func (a *activeSession) cancelSelection() {
	a.selectionMu.Lock()
	cancel := a.selectionCancel
	a.selectionCancel = nil
	a.selectionMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (a *activeSession) isFinished() bool {
	if a.finished.Load() {
		return true
	}
	select {
	case <-a.done:
		return true
	default:
		return false
	}
}

func (a *activeSession) currentWindow() *customui.Window {
	a.surfaceMu.RLock()
	defer a.surfaceMu.RUnlock()
	return a.window
}

func (a *activeSession) setWindow(w *customui.Window) {
	a.surfaceMu.Lock()
	a.window = w
	a.surfaceMu.Unlock()
}

func (a *activeSession) createSurface(ctx context.Context) error {
	if a.session == nil {
		return errors.New("measurement UI session is unavailable")
	}
	w, err := a.session.Create(ctx, measurementWindowSpecProduct(a))
	if err != nil {
		return err
	}
	if _, err = w.Show(ctx); err != nil {
		_, _ = w.Close(context.Background())
		return err
	}
	a.setWindow(w)
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

func (a *activeSession) startRun() {
	a.runOnce.Do(func() { go a.run() })
}

func (a *activeSession) run() {
	for {
		select {
		case event := <-a.events:
			if event.Type == "close" {
				w := a.currentWindow()
				if w != nil && event.WindowID == w.ID() {
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
	if a.phaseValue() != PhaseMeasuring {
		return nil
	}
	switch event.Type {
	case "click":
		return a.handleClick(ctx, event.TargetID)
	case "change", "input":
		value, _ := event.Value.(string)
		return a.handleChange(ctx, event.TargetID, value)
	case "measurement.pointerdown":
		p, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		return a.pointerDown(ctx, p)
	case "measurement.pointermove":
		p, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		return a.pointerMove(ctx, p)
	case "measurement.pointerup":
		p, err := a.logicalPoint(event.Fields)
		if err != nil {
			return err
		}
		if err := a.pointerUp(ctx, p, snapshotCandidateFromEvent(event, a.snapshotToken())); err != nil {
			return err
		}
		return a.applyCandidateLocalReference(ctx, event.Fields)
	case "measurement.key":
		return a.handleKey(ctx, event.Fields)
	}
	return nil
}

func (a *activeSession) applyCandidateLocalReference(ctx context.Context, fields map[string]any) error {
	semantic, _ := fields["snapCandidateSemantic"].(bool)
	if !semantic || a.tool != "region" || a.result == nil || a.result.Region == nil {
		return nil
	}
	x, okX := numberField(fields, "snapLocalX")
	y, okY := numberField(fields, "snapLocalY")
	w, okW := numberField(fields, "snapLocalWidth")
	h, okH := numberField(fields, "snapLocalHeight")
	if !(okX && okY && okW && okH) || w <= 0 || h <= 0 {
		return nil
	}
	label, _ := fields["snapLocalLabel"].(string)
	if strings.TrimSpace(label) == "" {
		label = "局部参照"
	}
	a.reference = Reference{Type: ReferenceManualRegion, Bounds: Rect{X: x, Y: y, Width: w, Height: h}}
	a.marginView = "window"
	a.status = "已锁定语义 Target；派生唯一 Local Reference：" + label
	return a.renderSurface(ctx)
}

func (a *activeSession) handleClick(ctx context.Context, id string) error {
	switch id {
	case "toolPoint":
		setMeasurementTool(a, "point")
		return a.renderSurface(ctx)
	case "toolRegion":
		setMeasurementTool(a, "region")
		return a.renderSurface(ctx)
	case "toolTwoPoint":
		setMeasurementTool(a, "twoPoint")
		return a.renderSurface(ctx)
	case "toolSpacing":
		setMeasurementTool(a, "spacing")
		return a.renderSurface(ctx)
	case "magnetToggle":
		a.snapEnabled = !a.snapEnabled
		a.snapSuspended = false
		a.service.resetSnapshotCandidatesForOracle(a, a.snapEnabled, false, a.snapEnabled)
		if a.snapEnabled {
			a.status = "磁吸定位已开启；Alt/Option 可临时暂停。"
		} else {
			a.status = "磁吸定位已关闭；Tab 不再切换候选。"
		}
		return a.renderSurface(ctx)
	case "marginToggle":
		if !hasLocalReference(a) {
			a.marginView = "window"
			return a.updateStatus(ctx, "当前没有可靠局部参照；继续显示 Target → Window 边距。")
		}
		if a.marginView == "local" {
			a.marginView = "window"
		} else {
			a.marginView = "local"
		}
		return a.renderSurface(ctx)
	case "referenceButton":
		return a.beginReferenceEdit(ctx)
	case "reselectReference":
		return a.beginReferenceReselect(ctx)
	case "copyMenuButton":
		if a.result == nil {
			return a.updateStatus(ctx, "复制失败：尚无测量结果。")
		}
		a.copyMenuOpen = !a.copyMenuOpen
		return a.renderSurface(ctx)
	case "copyConcise":
		return a.copyFormat(ctx, "concise")
	case "copyHuman":
		return a.copyFormat(ctx, "human")
	case "copyStructured":
		return a.copyEvidence(ctx)
	case "inspectorButton":
		a.inspectorOpen = true
		a.copyMenuOpen = false
		return a.renderSurface(ctx)
	case "closeInspector":
		a.inspectorOpen = false
		a.copyMenuOpen = false
		return a.renderSurface(ctx)
	case "confirmTarget":
		a.targetConfirmed = true
		a.status = "候选目标已确认：窗口外框作为锁定参照。"
		return a.renderSurface(ctx)
	case "previousTarget":
		return a.cycleTarget(ctx, -1)
	case "nextTarget":
		return a.cycleTarget(ctx, 1)
	case "refreshSnapshot":
		return a.refresh(ctx, a.selectedTarget)
	case "adjustInterface":
		return a.beginAdjusting(ctx)
	case "saveResult":
		return a.save(ctx)
	case "exitMeasurement":
		return a.finish(ctx, true)
	}
	return nil
}

func (a *activeSession) handleChange(ctx context.Context, id, value string) error {
	switch id {
	case "targetWindow":
		if value != "" && value != a.selectedTarget {
			return a.refresh(ctx, value)
		}
	case "referenceType":
		if value == string(ReferenceManualRegion) {
			return a.beginReferenceEdit(ctx)
		}
		return a.restoreWindowReference(ctx)
	case "outputFormat":
		if isOutputFormat(value) {
			a.outputFormat = value
			return a.renderSurface(ctx)
		}
	}
	return nil
}

func setMeasurementTool(a *activeSession, value string) bool {
	if value != "point" && value != "region" && value != "twoPoint" && value != "spacing" {
		return false
	}
	a.tool = value
	a.result = nil
	a.dragStart = nil
	a.twoPointFirst = nil
	a.spacingFirst = nil
	a.manualPending = false
	a.reference = a.frame.Reference
	a.marginView = "window"
	a.lockedCandidate = nil
	a.regionHandle = RegionEditNone
	a.editAnchor = nil
	a.editOriginal = nil
	a.copyMenuOpen = false
	a.status = toolInstruction(value)
	if a.service != nil {
		a.service.mu.Lock()
		a.service.tool = value
		a.service.mu.Unlock()
		a.service.resetSnapshotCandidatesForOracle(a, a.snapEnabled, a.snapSuspended, false)
	}
	return true
}

func (a *activeSession) beginReferenceEdit(ctx context.Context) error {
	if a.manualPending {
		a.manualPending = false
		a.status = "已取消参照编辑。"
		return a.renderSurface(ctx)
	}
	a.manualPending = true
	a.dragStart = nil
	a.regionHandle = RegionEditNone
	a.editAnchor = nil
	a.editOriginal = nil
	a.copyMenuOpen = false
	a.status = "参照编辑：拖拽一个区域作为锁定参照。"
	return a.renderSurface(ctx)
}

// beginReferenceReselect releases only snapshot-bound native resources while
// retaining the one Service-owned session. It is intentionally separate from
// the local-reference editor: changing a Window Reference must return to the
// Live desktop gate and can never be implemented as a target dropdown or a
// same-title lookup behind the frozen surface.
func (a *activeSession) beginReferenceReselect(ctx context.Context) error {
	if a.service == nil || a.service.selector == nil {
		return a.updateStatus(ctx, "当前环境不支持重新选择窗口。")
	}
	// Keep the same freeze → operation ordering as terminal cleanup. A direct
	// test or fast user click can request reselect as the first frozen surface
	// finishes rendering; wait for that construction to settle before tearing
	// it down and beginning the next Live selection.
	a.freezeMu.Lock()
	defer a.freezeMu.Unlock()
	a.operationMu.Lock()
	defer a.operationMu.Unlock()
	if a.phaseValue() != PhaseMeasuring {
		return nil
	}
	if w := a.currentWindow(); w != nil {
		if _, err := w.Hide(ctx); err != nil {
			return err
		}
	}
	// Detach the visible surface before internally closing its session. The
	// driver emits a close event for session teardown; leaving the old window
	// published until after Close lets the run loop mistake that internal event
	// for a user-requested exit and race the new Live selection.
	oldSession := a.session
	a.session = nil
	a.setWindow(nil)
	if oldSession != nil {
		if err := oldSession.Close(context.Background()); err != nil {
			return err
		}
	}
	oldAsset, oldOverlay := a.assetPath, a.overlayPath
	a.assetPath, a.overlayPath = "", ""
	a.frame, a.image, a.reference = CaptureFrame{}, nil, Reference{}
	a.result, a.pointer, a.lockedCandidate = nil, nil, nil
	a.dragStart, a.twoPointFirst, a.spacingFirst = nil, nil, nil
	a.manualPending, a.copyMenuOpen, a.inspectorOpen = false, false, false
	a.regionHandle, a.editAnchor, a.editOriginal = RegionEditNone, nil, nil
	a.marginView, a.snapSuspended = "window", false
	a.status = "移动鼠标选择窗口 · 单击开始测量 · Esc 取消"
	a.stateMu.Lock()
	a.phase = PhaseReferenceSelecting
	a.generation++
	a.snapshotID = ""
	a.stateMu.Unlock()
	a.service.resetSnapshotCandidatesForOracle(a, a.snapEnabled, false, false)
	_ = os.Remove(oldAsset)
	_ = os.Remove(oldOverlay)
	go a.selectAndFreeze(context.Background())
	return nil
}

func (a *activeSession) restoreWindowReference(ctx context.Context) error {
	if !a.targetConfirmed {
		a.status = "请先确认当前候选窗口，或继续使用人工参照。"
		return a.updateStatus(ctx, a.status)
	}
	a.reference = a.frame.Reference
	a.manualPending = false
	a.marginView = "window"
	a.regionHandle = RegionEditNone
	a.status = "参照已恢复为已确认目标窗口外边界。"
	return a.renderSurface(ctx)
}

func (a *activeSession) logicalPoint(fields map[string]any) (Point, error) {
	u, okU := numberField(fields, "u")
	v, okV := numberField(fields, "v")
	if !okU || !okV || u < 0 || u > 1 || v < 0 || v > 1 {
		return Point{}, errors.New("measurement pointer coordinates are invalid")
	}
	p := a.frame.Snapshot.Mapping.ImageSize
	return a.frame.Snapshot.Mapping.ImageToLogical(Point{X: u * float64(p.Width), Y: v * float64(p.Height)}), nil
}

func (a *activeSession) pointerDown(ctx context.Context, p Point) error {
	a.pointer = &p
	if !a.manualPending && a.tool == "region" && a.result != nil && a.result.Region != nil {
		a.result = nil
		a.regionHandle = RegionEditNone
		a.editAnchor = nil
		a.editOriginal = nil
		a.lockedCandidate = nil
		a.status = "开始新的区域测量。"
	}
	a.dragStart = &p
	return nil
}

func (a *activeSession) pointerMove(ctx context.Context, p Point) error {
	a.pointer = &p
	if a.editAnchor != nil && a.editOriginal != nil && a.result != nil && a.result.Region != nil {
		dx, dy := p.X-a.editAnchor.X, p.Y-a.editAnchor.Y
		region := ApplyRegionEdit(*a.editOriginal, a.regionHandle, dx, dy, captureLogicalBounds(a.frame.Snapshot.Mapping), 1)
		if region != a.result.Region.Absolute {
			r, err := BuildRegionResult(a.frame.Snapshot, a.reference, region)
			if err != nil {
				return err
			}
			a.result = &r
		}
	}
	now := time.Now()
	if !a.lastPointerRender.IsZero() && now.Sub(a.lastPointerRender) < 32*time.Millisecond {
		return nil
	}
	a.lastPointerRender = now
	return a.renderCursorHUD(ctx)
}

func (a *activeSession) pointerUp(ctx context.Context, p Point, candidate *CandidateDescriptor) error {
	a.pointer = &p
	if a.editAnchor != nil && a.editOriginal != nil {
		dx, dy := p.X-a.editAnchor.X, p.Y-a.editAnchor.Y
		region := ApplyRegionEdit(*a.editOriginal, a.regionHandle, dx, dy, captureLogicalBounds(a.frame.Snapshot.Mapping), 1)
		r, err := BuildRegionResult(a.frame.Snapshot, a.reference, region)
		if err != nil {
			return err
		}
		a.result = &r
		a.editAnchor = nil
		a.editOriginal = nil
		a.status = "区域编辑已应用。"
		return a.renderSurface(ctx)
	}
	return a.completeSelection(ctx, p, candidate)
}

func (a *activeSession) completeSelection(ctx context.Context, end Point, candidate *CandidateDescriptor) error {
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
		a.manualPending = false
		a.marginView = "local"
		a.result = nil
		a.spacingFirst = nil
		a.twoPointFirst = nil
		a.lockedCandidate = nil
		a.status = "人工参照已锁定；Window 参照仍保留，当前人工区域作为唯一 Local Layout Reference。"
		return a.renderSurface(ctx)
	}
	if !a.targetConfirmed && a.reference.Type != ReferenceManualRegion {
		a.status = "请先确认当前候选窗口，或改用人工参照。"
		return a.updateStatus(ctx, a.status)
	}
	var result Result
	var err error
	switch a.tool {
	case "point":
		result, err = BuildPointResult(a.frame.Snapshot, a.reference, end, a.image)
		a.regionHandle = RegionEditNone
	case "region":
		if selection.Width < 5 || selection.Height < 5 {
			a.status = "区域测量需要拖拽至少 5×5 logical px；单击不会创建人工 Target。"
			return a.updateStatus(ctx, a.status)
		}
		result, err = BuildRegionResult(a.frame.Snapshot, a.reference, selection)
		a.regionHandle = RegionEditNone
	case "twoPoint":
		if a.twoPointFirst == nil {
			if a.result != nil && a.result.TwoPoint != nil {
				a.result = nil
			}
			first := end
			a.twoPointFirst = &first
			a.status = "第一点已锁定，请选择第二点。"
			return a.renderSurface(ctx)
		}
		result, err = BuildTwoPointResult(a.frame.Snapshot, a.reference, *a.twoPointFirst, end)
		a.twoPointFirst = nil
		a.regionHandle = RegionEditNone
	case "spacing":
		if selection.Width < 5 || selection.Height < 5 {
			a.status = "两区域测距需要分别拖拽两个至少 5×5 logical px 的区域。"
			return a.updateStatus(ctx, a.status)
		}
		if a.spacingFirst == nil {
			if a.result != nil && a.result.Spacing != nil {
				a.result = nil
			}
			first := selection
			a.spacingFirst = &first
			a.status = "第一个区域已锁定，请拖拽第二个区域。"
			return a.renderSurface(ctx)
		}
		result, err = BuildSpacingResult(a.frame.Snapshot, a.reference, *a.spacingFirst, selection)
		a.spacingFirst = nil
		a.regionHandle = RegionEditNone
	default:
		return errors.New("measurement tool is invalid")
	}
	if err != nil {
		a.status = "测量失败：" + err.Error()
		return a.updateStatus(ctx, a.status)
	}
	a.result = &result
	if a.tool == "region" {
		a.lockedCandidate = candidate
	} else {
		a.lockedCandidate = nil
	}
	a.status = "结果来自同一冻结快照；颜色读取自原始 Capture Pixel。"
	return a.renderSurface(ctx)
}

func (a *activeSession) handleKey(ctx context.Context, fields map[string]any) error {
	key, _ := fields["key"].(string)
	phase, _ := fields["phase"].(string)
	shift, _ := fields["shift"].(bool)
	lower := strings.ToLower(key)
	if key == "Alt" || key == "Option" {
		if !a.snapEnabled {
			if a.snapSuspended {
				a.snapSuspended = false
				a.service.resetSnapshotCandidatesForOracle(a, false, false, false)
				return a.renderSurface(ctx)
			}
			return nil
		}
		suspended := phase != "up"
		if a.snapSuspended != suspended {
			a.snapSuspended = suspended
			a.service.resetSnapshotCandidatesForOracle(a, true, suspended, !suspended)
			if suspended {
				a.status = "吸附已暂停；松开 Alt/Option 恢复。"
			} else {
				a.status = "吸附已恢复。"
			}
			return a.renderSurface(ctx)
		}
		return nil
	}
	switch {
	case key == "Escape":
		return a.handleEscape(ctx)
	case key == "Tab":
		if !a.snapEnabled {
			return a.updateStatus(ctx, "磁吸定位已关闭；Tab 不执行候选切换。")
		}
		direction := "下一个"
		if shift {
			direction = "上一个"
		}
		return a.updateStatus(ctx, "当前冻结 Snapshot 尚无可切换的 UI 候选；Tab/Shift+Tab 只用于同一 Snapshot 内的候选层级，不会切换目标窗口或重新截图（请求："+direction+"候选）。")
	case lower == "i":
		a.inspectorOpen = !a.inspectorOpen
		a.copyMenuOpen = false
		return a.renderSurface(ctx)
	case key == "1" || key == "2" || key == "3" || key == "4":
		tools := map[string]string{"1": "point", "2": "region", "3": "twoPoint", "4": "spacing"}
		if setMeasurementTool(a, tools[key]) {
			return a.renderSurface(ctx)
		}
	case strings.HasPrefix(key, "Arrow"):
		return nil
	}
	return nil
}

func (a *activeSession) handleEscape(ctx context.Context) error {
	if a.inspectorOpen {
		a.inspectorOpen = false
		a.copyMenuOpen = false
		a.status = "已关闭详情。"
		return a.renderSurface(ctx)
	}
	return a.finish(ctx, true)
}

func (a *activeSession) beginAdjusting(ctx context.Context) error {
	a.operationMu.Lock()
	defer a.operationMu.Unlock()
	if a.phaseValue() == PhaseAdjusting {
		return nil
	}
	w := a.currentWindow()
	if w == nil {
		return errors.New("measurement surface is unavailable")
	}
	old := a.snapshotToken()
	a.stateMu.Lock()
	a.phase = PhaseAdjusting
	a.generation++
	a.snapshotID = ""
	a.stateMu.Unlock()
	a.result = nil
	a.lockedCandidate = nil
	a.pointer = nil
	a.dragStart = nil
	a.twoPointFirst = nil
	a.spacingFirst = nil
	a.manualPending = false
	a.copyMenuOpen = false
	a.inspectorOpen = false
	a.regionHandle = RegionEditNone
	a.editAnchor = nil
	a.editOriginal = nil
	a.snapSuspended = false
	a.status = "正在调整界面：Measurement Surface 已隐藏；再次使用任一桌面测量入口继续测量并生成新 Snapshot。"
	if _, err := w.Hide(ctx); err != nil {
		a.stateMu.Lock()
		a.phase = PhaseMeasuring
		a.generation = old.Generation
		a.snapshotID = old.SnapshotID
		a.stateMu.Unlock()
		return err
	}
	return nil
}

func (a *activeSession) continueMeasurement(ctx context.Context) error {
	if a.phaseValue() != PhaseAdjusting {
		w := a.currentWindow()
		if w == nil {
			return errors.New("measurement surface is unavailable")
		}
		_, err := w.Show(ctx)
		return err
	}
	return a.refresh(ctx, a.selectedTarget)
}

func (a *activeSession) refresh(ctx context.Context, targetID string) error {
	a.operationMu.Lock()
	defer a.operationMu.Unlock()
	w := a.currentWindow()
	if w == nil {
		return errors.New("measurement surface is unavailable")
	}
	oldState, err := w.State(ctx)
	if err != nil {
		return err
	}
	oldPhase := a.phaseValue()
	wasAdjusting := oldPhase == PhaseAdjusting
	oldToken := a.snapshotToken()
	newGeneration := oldToken.Generation + 1
	if wasAdjusting {
		newGeneration = oldToken.Generation
	}
	if newGeneration == 0 {
		newGeneration = 1
	}
	a.stateMu.Lock()
	a.phase = PhaseFreezing
	a.generation = newGeneration
	a.snapshotID = ""
	a.stateMu.Unlock()
	if !wasAdjusting {
		_, _ = w.Hide(ctx)
	}
	frame, err := a.service.capture.Capture(ctx, targetID)
	if err != nil {
		a.rollbackFreezeState(oldPhase, oldToken, wasAdjusting)
		if !wasAdjusting {
			_, _ = w.Show(context.Background())
		}
		a.status = "刷新快照失败：" + err.Error()
		return err
	}
	img, assetPath, err := a.service.prepareFrame(frame)
	if err != nil {
		a.rollbackFreezeState(oldPhase, oldToken, wasAdjusting)
		if !wasAdjusting {
			_, _ = w.Show(context.Background())
		}
		return err
	}
	oldFrame, oldImage, oldAsset := a.frame, a.image, a.assetPath
	oldReference, oldTarget := a.reference, a.selectedTarget
	oldResult := a.result
	oldCandidate := a.lockedCandidate
	oldConfirmed, oldStatus := a.targetConfirmed, a.status
	oldManual, oldCopy, oldInspector, oldSnap, oldMargin := a.manualPending, a.copyMenuOpen, a.inspectorOpen, a.snapSuspended, a.marginView
	oldHandle := a.regionHandle
	oldDrag, oldTwo, oldSpacing := a.dragStart, a.twoPointFirst, a.spacingFirst
	oldPointer := a.pointer

	a.frame, a.image, a.assetPath = frame, img, assetPath
	a.reference, a.selectedTarget = frame.Reference, frame.SelectedTargetID
	a.result = nil
	a.lockedCandidate = nil
	if wasAdjusting {
		a.pointer = nil
		a.inspectorOpen = false
	}
	a.dragStart, a.twoPointFirst, a.spacingFirst = nil, nil, nil
	a.manualPending, a.copyMenuOpen, a.snapSuspended = false, false, false
	a.marginView = "window"
	a.regionHandle, a.editAnchor, a.editOriginal = RegionEditNone, nil, nil
	a.targetConfirmed = frame.TargetConfirmed
	a.status = "已冻结新的干净快照；此前结果和旧 Snapshot 派生候选均已失效。" + targetConfirmationInstruction(frame)
	a.stateMu.Lock()
	a.phase = PhaseMeasuring
	a.snapshotID = snapshotIdentity(a.sessionID, a.generation, frame.Snapshot)
	a.stateMu.Unlock()

	mapping := frame.Snapshot.Mapping
	newBounds := customui.Bounds{X: mapping.Origin.X, Y: mapping.Origin.Y, Width: mapping.LogicalSize.Width, Height: mapping.LogicalSize.Height}
	if _, err = w.SetBounds(ctx, newBounds); err == nil {
		err = a.renderSurface(ctx)
	}
	if err != nil {
		a.frame, a.image, a.assetPath = oldFrame, oldImage, oldAsset
		a.reference, a.selectedTarget = oldReference, oldTarget
		a.result, a.pointer = oldResult, oldPointer
		a.lockedCandidate = oldCandidate
		a.targetConfirmed, a.status = oldConfirmed, oldStatus
		a.manualPending, a.copyMenuOpen, a.inspectorOpen, a.snapSuspended, a.marginView = oldManual, oldCopy, oldInspector, oldSnap, oldMargin
		a.regionHandle, a.dragStart, a.twoPointFirst, a.spacingFirst = oldHandle, oldDrag, oldTwo, oldSpacing
		_ = os.Remove(assetPath)
		_, _ = w.SetBounds(context.Background(), oldState.Bounds)
		a.rollbackFreezeState(oldPhase, oldToken, wasAdjusting)
		if !wasAdjusting {
			_ = a.renderSurface(context.Background())
			_, _ = w.Show(context.Background())
		}
		return err
	}
	_ = os.Remove(oldAsset)
	_, err = w.Show(ctx)
	return err
}

func (a *activeSession) rollbackFreezeState(oldPhase MeasurementPhase, oldToken SnapshotToken, wasAdjusting bool) {
	a.stateMu.Lock()
	defer a.stateMu.Unlock()
	if wasAdjusting {
		a.phase = PhaseAdjusting
		a.generation = oldToken.Generation
		a.snapshotID = ""
		return
	}
	a.phase = oldPhase
	a.generation = oldToken.Generation
	a.snapshotID = oldToken.SnapshotID
}

func (a *activeSession) cycleTarget(ctx context.Context, direction int) error {
	if len(a.frame.Targets) < 2 {
		a.status = "当前没有可切换的其他目标窗口。"
		return a.updateStatus(ctx, a.status)
	}
	current := 0
	for i, target := range a.frame.Targets {
		if target.ID == a.selectedTarget {
			current = i
			break
		}
	}
	next := (current + direction) % len(a.frame.Targets)
	if next < 0 {
		next += len(a.frame.Targets)
	}
	return a.refresh(ctx, a.frame.Targets[next].ID)
}

func (a *activeSession) renderCursorHUD(ctx context.Context) error {
	if a.pointer == nil {
		return nil
	}
	w := a.currentWindow()
	if w == nil {
		return errors.New("measurement surface is unavailable")
	}
	micro := MicroPlacement(a.frame.Snapshot.Mapping, Rect{X: a.pointer.X, Y: a.pointer.Y, Width: 1, Height: 1})
	if _, err := w.UpdateControl(ctx, "measurementMicro", customui.ControlPatch{Classes: micro.Classes}); err != nil {
		return err
	}
	text := microText(a)
	_, err := w.UpdateControl(ctx, "measurementMicroValue", customui.ControlPatch{Text: &text})
	return err
}

func (a *activeSession) renderSurface(ctx context.Context) error {
	w := a.currentWindow()
	if w == nil {
		return errors.New("measurement surface is unavailable")
	}
	newOverlay, err := a.writeOverlay()
	if err != nil {
		return err
	}
	oldOverlay := a.overlayPath
	microTarget := a.reference.Bounds
	if a.pointer != nil {
		microTarget = Rect{X: a.pointer.X, Y: a.pointer.Y, Width: 1, Height: 1}
	} else if result, ok := resultBounds(a.result); ok {
		microTarget = result
	}
	micro := MicroPlacement(a.frame.Snapshot.Mapping, microTarget)
	marginLabel := marginToggleText(a)
	patches := []struct {
		id    string
		patch customui.ControlPatch
	}{
		{previewID, customui.ControlPatch{Source: stringPtr(filepath.Base(a.assetPath))}},
		{overlayID, customui.ControlPatch{Source: stringPtr(filepath.Base(newOverlay))}},
		{"toolPoint", customui.ControlPatch{Active: boolPtr(a.tool == "point")}},
		{"toolRegion", customui.ControlPatch{Active: boolPtr(a.tool == "region")}},
		{"toolTwoPoint", customui.ControlPatch{Active: boolPtr(a.tool == "twoPoint")}},
		{"toolSpacing", customui.ControlPatch{Active: boolPtr(a.tool == "spacing")}},
		{"magnetToggle", customui.ControlPatch{Active: boolPtr(a.snapEnabled)}},
		{"marginToggle", customui.ControlPatch{Text: &marginLabel, Active: boolPtr(a.marginView == "local" && hasLocalReference(a)), Disabled: boolPtr(!hasLocalReference(a))}},
		{"referenceButton", customui.ControlPatch{Active: boolPtr(a.manualPending)}},
		{"copyMenuButton", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}},
		{"inspectorButton", customui.ControlPatch{Active: boolPtr(a.inspectorOpen)}},
		{"measurementCopyMenu", customui.ControlPatch{Visible: boolPtr(a.copyMenuOpen)}},
		{"measurementInspector", customui.ControlPatch{Visible: boolPtr(a.inspectorOpen)}},
		{"copyConcise", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}},
		{"copyHuman", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}},
		{"copyStructured", customui.ControlPatch{Disabled: boolPtr(false)}},
		{"saveResult", customui.ControlPatch{Disabled: boolPtr(a.result == nil)}},
		{"targetWindow", customui.ControlPatch{Value: a.selectedTarget, Options: targetOptions(a.frame.Targets)}},
		{"confirmTarget", customui.ControlPatch{Visible: boolPtr(!a.targetConfirmed)}},
		{"targetConfirmed", customui.ControlPatch{Visible: boolPtr(a.targetConfirmed)}},
		{"referenceType", customui.ControlPatch{Value: referenceValue(a)}},
		{"outputFormat", customui.ControlPatch{Value: a.outputFormat}},
		{"measurementMicro", customui.ControlPatch{Classes: micro.Classes}},
		{"measurementMicroValue", customui.ControlPatch{Text: stringPtr(microText(a))}},
		{"measurementStatus", customui.ControlPatch{Text: stringPtr(a.status)}},
		{"referenceInfo", customui.ControlPatch{Text: stringPtr(measurementReferenceSummary(a))}},
		{"snapInfo", customui.ControlPatch{Text: stringPtr(snapSummary(a))}},
		{"snapshotInfo", customui.ControlPatch{Text: stringPtr(snapshotSummary(a.frame) + " · " + snapshotTokenSummary(a.snapshotToken()))}},
		{"measurementInspectorResult", customui.ControlPatch{Text: stringPtr(a.inspectorEvidence())}},
		{"measurementHint", customui.ControlPatch{Text: stringPtr(measurementHint(a.source))}},
	}
	for _, patch := range patches {
		if _, err := w.UpdateControl(ctx, patch.id, patch.patch); err != nil {
			_ = os.Remove(newOverlay)
			a.status = "Measurement surface update failed: " + err.Error()
			return err
		}
	}
	a.overlayPath = newOverlay
	if oldOverlay != "" && oldOverlay != newOverlay {
		_ = os.Remove(oldOverlay)
	}
	return nil
}

func (a *activeSession) writeOverlay() (string, error) {
	name := "overlay-" + a.service.now().UTC().Format("20060102T150405.000000000Z") + "-" + strconv.FormatUint(a.service.assetID.Add(1), 10) + ".png"
	path := filepath.Join(a.service.baseDir, name)
	marginReference := a.frame.Reference
	if a.marginView == "local" && hasLocalReference(a) {
		marginReference = a.reference
	}
	if err := RenderOverlayPNG(path, a.frame.Snapshot.Mapping, a.frame.Reference, marginReference, a.result, a.twoPointFirst, a.spacingFirst); err != nil {
		return "", err
	}
	return path, nil
}

func (a *activeSession) updateStatus(ctx context.Context, message string) error {
	a.status = message
	w := a.currentWindow()
	if w == nil {
		return errors.New("measurement surface is unavailable")
	}
	_, err := w.UpdateControl(ctx, "measurementStatus", customui.ControlPatch{Text: &message})
	return err
}

func (a *activeSession) copy(ctx context.Context) error {
	return a.copyFormat(ctx, a.outputFormat)
}

func (a *activeSession) copyFormat(ctx context.Context, format string) error {
	if a.result == nil {
		return a.updateStatus(ctx, "复制失败：尚无测量结果。")
	}
	if !isOutputFormat(format) {
		return a.updateStatus(ctx, "复制失败：未知导出格式。")
	}
	outputs, err := a.outputsWithProductEvidence()
	if err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	if err := a.service.clipboard.Copy(outputValue(outputs, format)); err != nil {
		return a.updateStatus(ctx, "复制失败："+err.Error())
	}
	a.copyMenuOpen = false
	a.status = "已复制" + outputFormatLabel(format) + "结果。"
	return a.renderSurface(ctx)
}

func (a *activeSession) save(ctx context.Context) error {
	if a.result == nil {
		return a.updateStatus(ctx, "保存失败：尚无测量结果。")
	}
	outputs, err := a.outputsWithProductEvidence()
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

// outputsWithProductEvidence is the one export path for Inspector, Copy and
// Save. It keeps the concise and human views stable while making structured
// output carry the active Snapshot, locator and runtime evidence.
func (a *activeSession) outputsWithProductEvidence() (Outputs, error) {
	if a == nil || a.result == nil {
		return Outputs{}, errors.New("measurement result is unavailable")
	}
	outputs, err := a.result.Outputs()
	if err != nil {
		return Outputs{}, err
	}
	token := a.snapshotToken()
	var target *Rect
	if a.result.Region != nil {
		bounds := a.result.Region.Absolute
		target = &bounds
	}
	var local *LayoutReference
	if target != nil && a.lockedCandidate != nil {
		view := a.service.SnapshotCandidates()
		if view.Token.Matches(token) {
			candidates := make([]CandidateDescriptor, 0, len(view.Candidates))
			for _, item := range view.Candidates {
				candidates = append(candidates, item.CandidateDescriptor)
			}
			references, referenceErr := BuildTwoLevelReferences(a.frame.Reference, *target, candidates)
			if referenceErr != nil {
				return Outputs{}, referenceErr
			}
			local = references.Local
		}
	}
	var cursor *CoordinateTriple
	if a.pointer != nil {
		coordinates, coordinateErr := CoordinatesAt(*a.pointer, a.frame.Reference, local)
		if coordinateErr != nil {
			return Outputs{}, coordinateErr
		}
		cursor = &coordinates
	}
	evidence, err := BuildEvidenceWithProduct(
		token.SessionID,
		a.source,
		a.frame,
		*a.result,
		a.frame.PNG,
		EvidenceConfidence{Target: .9, Geometry: 1, Pixel: 1, Overall: .9, Notes: []string{"interactive measurement export"}},
		token,
		a.phaseValue(),
		target,
		local,
		a.lockedCandidate,
		cursor,
	)
	if err != nil {
		return Outputs{}, err
	}
	structured, err := StructuredDataFromEvidence(evidence)
	if err != nil {
		return Outputs{}, err
	}
	encoded, err := json.MarshalIndent(structured, "", "  ")
	if err != nil {
		return Outputs{}, err
	}
	outputs.JSON = string(encoded)
	return outputs, nil
}

func snapshotCandidateFromEvent(event customui.Event, token SnapshotToken) *CandidateDescriptor {
	candidate, ok := event.Fields[snapshotCandidateEventField].(SnapshotCandidate)
	if !ok || candidate.Validate() != nil || token.Validate() != nil || !candidate.Token.Matches(token) {
		return nil
	}
	copy := candidate.CandidateDescriptor
	return &copy
}

func (a *activeSession) finish(ctx context.Context, closeWindow bool) error {
	return a.finishWithError(ctx, closeWindow, nil)
}

func (a *activeSession) finishWithError(ctx context.Context, closeWindow bool, terminal error) error {
	var result error
	a.closeOnce.Do(func() {
		a.finished.Store(true)
		a.cancelSelection()
		a.freezeMu.Lock()
		defer a.freezeMu.Unlock()
		a.operationMu.Lock()
		defer a.operationMu.Unlock()
		a.copyMenuOpen = false
		a.inspectorOpen = false
		a.manualPending = false
		a.lockedCandidate = nil
		a.regionHandle = RegionEditNone
		a.editAnchor = nil
		a.editOriginal = nil
		a.snapSuspended = false
		a.pointer = nil
		a.result = nil
		a.dragStart = nil
		a.twoPointFirst = nil
		a.spacingFirst = nil
		a.stateMu.Lock()
		a.phase = PhaseIdle
		a.snapshotID = ""
		a.stateMu.Unlock()
		if closeWindow {
			if w := a.currentWindow(); w != nil {
				_, result = w.Close(ctx)
			}
		}
		if a.session != nil {
			if err := a.session.Close(ctx); result == nil {
				result = err
			}
		}
		if a.restore != nil {
			if err := a.restore(ctx); err != nil && result == nil {
				result = fmt.Errorf("measurement recovery limited: %w", err)
			}
		}
		if terminal != nil {
			if result != nil {
				result = fmt.Errorf("%v; cleanup: %w", terminal, result)
			} else {
				result = terminal
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
		_ = os.Remove(a.assetPath)
		_ = os.Remove(a.overlayPath)
	})
	return result
}

func (a *activeSession) phaseValue() MeasurementPhase {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()
	if a.phase == "" {
		return PhaseIdle
	}
	return a.phase
}

func (a *activeSession) snapshotToken() SnapshotToken {
	a.stateMu.RLock()
	defer a.stateMu.RUnlock()
	if a.phase != PhaseMeasuring {
		return SnapshotToken{SessionID: a.sessionID, Generation: a.generation}
	}
	return SnapshotToken{SessionID: a.sessionID, Generation: a.generation, SnapshotID: a.snapshotID}
}

func (a *activeSession) acceptsSnapshot(token SnapshotToken) bool {
	return a.snapshotToken().Matches(token)
}

func (a *activeSession) frozenSurfaceSessionID() string {
	return fmt.Sprintf("%s-ui-g%d", a.sessionID, a.generation)
}

func snapshotIdentity(sessionID string, generation uint64, snapshot Snapshot) string {
	return fmt.Sprintf("%s:g%d:%s", sessionID, generation, snapshot.SampledAt.UTC().Format("20060102T150405.000000000Z"))
}

func snapshotTokenSummary(token SnapshotToken) string {
	if token.SnapshotID == "" {
		return fmt.Sprintf("generation=%d · snapshot=invalidated", token.Generation)
	}
	return fmt.Sprintf("generation=%d · snapshotId=%s", token.Generation, token.SnapshotID)
}

func numberField(fields map[string]any, name string) (float64, bool) {
	value, ok := fields[name]
	if !ok {
		return 0, false
	}
	switch number := value.(type) {
	case float64:
		return number, true
	case float32:
		return float64(number), true
	case int:
		return float64(number), true
	case int64:
		return float64(number), true
	default:
		return 0, false
	}
}

func stringPtr(value string) *string { return &value }
func boolPtr(value bool) *bool       { return &value }
