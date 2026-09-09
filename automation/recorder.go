package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const (
	recorderQueueCapacity        = 4096
	recorderDefaultMaxDuration   = 15 * time.Minute
	recorderMaximumMaxDuration   = 30 * time.Minute
	recorderBackendStartTimeout  = 8 * time.Second
	recorderBackendStopTimeout   = 8 * time.Second
	recorderPointerMotionPolicy  = "button-held-only"
	recorderContextQueueCapacity = 128
	recorderContextFreshness     = 750 * time.Millisecond
	recorderLibraryName          = "libuiohook"
	recorderLibraryVersion       = "1.2.2"
	recorderLibraryCommit        = "23acecfe207f8a8b5161bec97a8a6fd6ad0aea88"
)

type RecorderErrorCode string

const (
	RecorderInvalidArgument    RecorderErrorCode = "INVALID_ARGUMENT"
	RecorderCaptureDenied      RecorderErrorCode = "RECORDER_CAPTURE_DENIED"
	RecorderCaptureUnavailable RecorderErrorCode = "RECORDER_CAPTURE_UNAVAILABLE"
	RecorderCaptureOccupied    RecorderErrorCode = "RECORDER_CAPTURE_OCCUPIED"
	RecorderInvalidState       RecorderErrorCode = "RECORDER_INVALID_STATE"
	RecorderStorageFailed      RecorderErrorCode = "RECORDER_STORAGE_FAILED"
	RecorderCanceled           RecorderErrorCode = "RECORDER_CANCELED"
	RecorderNotFound           RecorderErrorCode = "RECORDER_FILE_NOT_FOUND"
	RecorderInvalidRecording   RecorderErrorCode = "INVALID_RECORDING"
	RecorderGenerationBlocked  RecorderErrorCode = "GENERATION_BLOCKED"
	RecorderWouldOverwrite     RecorderErrorCode = "WOULD_OVERWRITE"
)

type RecorderError struct {
	Code      RecorderErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *RecorderError) Error() string {
	if e == nil {
		return "Recorder operation failed"
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *RecorderError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func recorderError(code RecorderErrorCode, operation, message string, cause error) *RecorderError {
	return &RecorderError{Code: code, Operation: operation, Message: message, Cause: cause}
}

// RecorderBackendCapabilities is the native adapter's side-effect-free
// capability summary. Permission checks must not prompt the user.
type RecorderBackendCapabilities struct {
	Supported       bool
	Platform        string
	Backend         string
	Permission      string
	CoordinateSpace string
	Limitations     []string
}

// RecorderInputEvent is a copied libuiohook event. It contains no C pointers.
// Sequence and receive timestamps are assigned by recorderSession, not by a
// backend implementation.
type RecorderInputEvent struct {
	Type       uint16
	NativeTime uint64
	Mask       uint16
	Keycode    uint16
	Rawcode    uint16
	Keychar    uint16
	Button     uint16
	Clicks     uint16
	X          int16
	Y          int16
	Amount     uint16
	Rotation   int16
	Direction  uint8
}

// RecorderInputBackend is the private-test seam around the one production
// libuiohook adapter. Start returns only after a real ready signal or failure.
type RecorderInputBackend interface {
	Capabilities() RecorderBackendCapabilities
	Start(context.Context, func(RecorderInputEvent), func(error)) error
	Stop(context.Context) error
	Wait()
}

// recorderKeyboardCaptureConfigurator is implemented only by native backends
// that can narrow their OS subscription before Start. Backends without this
// optional seam still receive the session's existing callback-level filter.
type recorderKeyboardCaptureConfigurator interface {
	configureCaptureKeyboard(bool)
}

type RecorderBackendFactory func() RecorderInputBackend
type RecorderWindowProbe func() (*WindowInfo, error)
type recorderTextProbe func(context.Context, *WindowInfo, *recorderWindowSnapshot) (*recorderTextFieldSample, error)

type recorderWithin struct {
	ProcessID uint32 `json:"processId"`
	Title     string `json:"title"`
}

type recorderWindowBounds struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// recorderControlBounds is copied from the trusted Custom UI event. Floating
// controls can have fractional native layout coordinates, so keep the original
// precision instead of rounding them into recorderWindowBounds.
type recorderControlBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type recorderApplicationSnapshot struct {
	ProcessID      uint32 `json:"processId"`
	ExecutableName string `json:"executableName"`
	ExecutablePath string `json:"executablePath,omitempty"`
	IdentityKind   string `json:"identityKind"`
	IdentityValue  string `json:"identityValue"`
}

// recorderWindowSnapshot separates reusable application identity from
// execution-local PID/window handles. Bounds are a recording-time fact; a
// replay must resolve a fresh window and recompute its screen point.
type recorderWindowSnapshot struct {
	ID          string                      `json:"id"`
	Title       string                      `json:"title"`
	Handle      uint64                      `json:"handle"`
	Index       int                         `json:"index"`
	IsPopup     bool                        `json:"isPopup"`
	Application recorderApplicationSnapshot `json:"application"`
	Bounds      recorderWindowBounds        `json:"bounds"`
	ObservedAt  string                      `json:"observedAt"`
}

type recorderElementPoint struct {
	OffsetX int     `json:"offsetX"`
	OffsetY int     `json:"offsetY"`
	XRatio  float64 `json:"xRatio"`
	YRatio  float64 `json:"yRatio"`
}

type recorderElementDescriptor struct {
	Role          string               `json:"role"`
	NativeRole    string               `json:"nativeRole,omitempty"`
	Subrole       string               `json:"subrole,omitempty"`
	Name          string               `json:"name,omitempty"`
	Identifier    string               `json:"identifier,omitempty"`
	Enabled       *bool                `json:"enabled,omitempty"`
	Focused       *bool                `json:"focused,omitempty"`
	ValueSettable bool                 `json:"valueSettable"`
	NativeActions []string             `json:"nativeActions"`
	Bounds        recorderWindowBounds `json:"bounds"`
}

// recorderElementSnapshot is deliberately label-only evidence. Recorder never
// persists AXValue, selected text, or protected field contents.
type recorderElementSnapshot struct {
	Source        string                      `json:"source"`
	Resolution    string                      `json:"resolution"`
	Role          string                      `json:"role"`
	NativeRole    string                      `json:"nativeRole,omitempty"`
	Subrole       string                      `json:"subrole,omitempty"`
	Name          string                      `json:"name,omitempty"`
	Identifier    string                      `json:"identifier,omitempty"`
	Enabled       *bool                       `json:"enabled,omitempty"`
	Focused       *bool                       `json:"focused,omitempty"`
	ValueSettable bool                        `json:"valueSettable"`
	NativeActions []string                    `json:"nativeActions"`
	Bounds        recorderWindowBounds        `json:"bounds"`
	Hit           recorderElementDescriptor   `json:"hit"`
	Ancestors     []recorderElementDescriptor `json:"ancestors"`
	Point         recorderElementPoint        `json:"point"`
	ObservedAt    string                      `json:"observedAt"`
}

// recorderInputContext is resolved off the native callback thread after a
// pointer press/release (or the first typed event in a text run). It binds a
// raw event to the window/application that owns the action without delaying
// libuiohook or polluting raw with ordinary pointer motion.
type recorderInputContext struct {
	EventID           string                   `json:"eventId"`
	Kind              string                   `json:"kind"`
	Phase             string                   `json:"phase,omitempty"`
	Status            string                   `json:"status"`
	Reason            string                   `json:"reason,omitempty"`
	ResolutionDelayMS int64                    `json:"resolutionDelayMs"`
	Window            *recorderWindowSnapshot  `json:"window,omitempty"`
	Element           *recorderElementSnapshot `json:"element,omitempty"`
	SemanticStatus    string                   `json:"semanticStatus"`
	SemanticReason    string                   `json:"semanticReason,omitempty"`
}

type recorderContextRequest struct {
	EventID    string
	Kind       string
	Phase      string
	ReceivedAt time.Time
	X          *int
	Y          *int
}

type recorderStartOptions struct {
	Within          recorderWithin
	CaptureKeyboard bool
	KeyboardContent string
	Evidence        string
	OutputDir       string
	MaxDuration     time.Duration
	ControlKeycodes map[uint16]bool
}

type recorderIssue struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Message  string `json:"message"`
	EventID  string `json:"eventId,omitempty"`
}

type recorderCounts struct {
	Observed  atomic.Uint64
	Accepted  atomic.Uint64
	Persisted atomic.Uint64
	Filtered  atomic.Uint64
	Paused    atomic.Uint64
	Dropped   atomic.Uint64
	Late      atomic.Uint64
}

type recorderRawEvent struct {
	FormatVersion      string            `json:"formatVersion"`
	EventID            string            `json:"eventId"`
	Sequence           string            `json:"sequence"`
	LibraryEvent       string            `json:"libraryEvent"`
	NativeTime         string            `json:"nativeTime"`
	NativeClock        string            `json:"nativeClock"`
	NativeUnit         string            `json:"nativeUnit"`
	ReceivedAt         string            `json:"receivedAt"`
	ModifierMask       uint16            `json:"modifierMask"`
	Modifiers          []string          `json:"modifiers"`
	Source             string            `json:"source"`
	ScopeRef           string            `json:"scopeRef"`
	Button             string            `json:"button,omitempty"`
	Clicks             uint16            `json:"clicks,omitempty"`
	X                  *int              `json:"x,omitempty"`
	Y                  *int              `json:"y,omitempty"`
	CoordinateSpace    string            `json:"coordinateSpace,omitempty"`
	CoordinateVerified bool              `json:"coordinateVerified,omitempty"`
	DisplayRef         string            `json:"displayRef,omitempty"`
	Keycode            *uint16           `json:"keycode,omitempty"`
	Rawcode            *uint16           `json:"rawcode,omitempty"`
	Keychar            *uint16           `json:"keychar,omitempty"`
	WheelAmount        *uint16           `json:"wheelAmount,omitempty"`
	WheelRotation      *int16            `json:"wheelRotation,omitempty"`
	WheelDirection     *uint8            `json:"wheelDirection,omitempty"`
	Sampled            bool              `json:"sampled,omitempty"`
	Gaps               []string          `json:"gaps,omitempty"`
	Metadata           map[string]string `json:"metadata,omitempty"`
}

type recorderManifest struct {
	FormatVersion string                  `json:"formatVersion"`
	RecordingID   string                  `json:"recordingId"`
	ExecutionID   string                  `json:"executionId"`
	State         string                  `json:"state"`
	Within        recorderWithin          `json:"within"`
	InitialWindow *recorderWindowSnapshot `json:"initialWindow,omitempty"`
	Capture       struct {
		Library             string   `json:"library"`
		LibraryVersion      string   `json:"libraryVersion"`
		LibraryCommit       string   `json:"libraryCommit"`
		Platform            string   `json:"platform"`
		Backend             string   `json:"backend"`
		Permission          string   `json:"permission"`
		CaptureKeyboard     bool     `json:"captureKeyboard"`
		KeyboardContent     string   `json:"keyboardContent"`
		ControlKeycodes     []uint16 `json:"controlKeycodes"`
		Evidence            string   `json:"evidence"`
		CoordinateSpace     string   `json:"coordinateSpace"`
		PointerMotionPolicy string   `json:"pointerMotionPolicy,omitempty"`
		Limitations         []string `json:"limitations"`
	} `json:"capture"`
	Queue struct {
		Capacity           int    `json:"capacity"`
		MoveSampleInterval string `json:"moveSampleInterval,omitempty"`
		ContextCapacity    int    `json:"contextCapacity,omitempty"`
	} `json:"queue"`
	StartedAt string `json:"startedAt"`
	StoppedAt string `json:"stoppedAt,omitempty"`
	Cutoff    struct {
		Sequence string `json:"sequence,omitempty"`
		Time     string `json:"time,omitempty"`
	} `json:"cutoff"`
	Counts struct {
		Observed  uint64 `json:"observed"`
		Accepted  uint64 `json:"accepted"`
		Persisted uint64 `json:"persisted"`
		Filtered  uint64 `json:"filtered"`
		Paused    uint64 `json:"paused"`
		Dropped   uint64 `json:"dropped"`
		Late      uint64 `json:"late"`
	} `json:"counts"`
	Storage struct {
		State        string `json:"state"`
		RawFile      string `json:"rawFile,omitempty"`
		ManifestFile string `json:"manifestFile"`
		RawSHA256    string `json:"rawSha256,omitempty"`
		RawBytes     int64  `json:"rawBytes,omitempty"`
	} `json:"storage"`
	Displays      []DisplayInfo          `json:"displays"`
	InputContexts []recorderInputContext `json:"inputContexts,omitempty"`
	TextEdits     []recorderTextEdit     `json:"textEdits,omitempty"`
	Issues        []recorderIssue        `json:"issues"`
}

type recorderStopResult struct {
	RecordingID  string
	RecordingDir string
	RawFile      string
	ManifestFile string
	CaptureState string
	StorageState string
	Counts       map[string]uint64
	Issues       []recorderIssue
}

type recorderControlResult struct {
	Changed            bool
	CaptureState       string
	TransitionSequence uint64
	TransitionedAt     time.Time
}

type recorderControlClickResult struct {
	Changed            bool
	TransitionSequence uint64
	EventIDs           []string
	MatchStatus        string
}

func (r recorderControlClickResult) jsValue() map[string]any {
	var sequence any
	if r.TransitionSequence > 0 {
		sequence = fmt.Sprintf("%d", r.TransitionSequence)
	}
	return map[string]any{
		"changed": r.Changed, "transitionSequence": sequence,
		"eventIds": append([]string(nil), r.EventIDs...), "matchStatus": r.MatchStatus,
	}
}

func (r recorderControlResult) jsValue() map[string]any {
	var sequence any
	if r.TransitionSequence > 0 {
		sequence = fmt.Sprintf("%d", r.TransitionSequence)
	}
	return map[string]any{
		"changed": r.Changed, "captureState": r.CaptureState,
		"transitionSequence": sequence,
		"transitionedAt":     r.TransitionedAt.UTC().Format(time.RFC3339Nano),
	}
}

func (r recorderStopResult) jsValue() map[string]any {
	return map[string]any{
		"recordingId": r.RecordingID, "recordingDir": r.RecordingDir,
		"rawFile": nullablePath(r.RawFile), "manifestFile": nullablePath(r.ManifestFile),
		"captureState": r.CaptureState, "storageState": r.StorageState,
		"counts": r.Counts, "issues": issuesToAny(r.Issues),
	}
}

func nullablePath(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func issuesToAny(issues []recorderIssue) []map[string]any {
	result := make([]map[string]any, 0, len(issues))
	for _, issue := range issues {
		item := map[string]any{"code": issue.Code, "severity": issue.Severity, "message": issue.Message}
		if issue.EventID != "" {
			item["eventId"] = issue.EventID
		}
		result = append(result, item)
	}
	return result
}

// RecorderRuntime owns all Recorder Promise callbacks and the current
// execution's capture session. No goroutine other than the EventLoop owner
// accesses its Goja values.
type RecorderRuntime struct {
	runtime         *goja.Runtime
	loop            *eventloop.EventLoop
	context         context.Context
	workDir         string
	executionID     string
	enableCapture   bool
	backendFactory  RecorderBackendFactory
	windowProbe     RecorderWindowProbe
	targetProbe     func(context.Context, *WindowInfo, int, int) (*recorderElementSnapshot, error)
	textProbe       recorderTextProbe
	displayResolver func() []DisplayInfo
	onAsyncError    func(error)

	closing atomic.Bool
	workers atomic.Int64
	wg      sync.WaitGroup

	mu       sync.Mutex
	session  *recorderSession
	starting bool
	pending  int // EventLoop owner only.
}

type recorderSession struct {
	owner    *RecorderRuntime
	options  recorderStartOptions
	backend  RecorderInputBackend
	writer   *recorderWriter
	displays []DisplayInfo

	context         context.Context
	cancel          context.CancelFunc
	events          chan recorderRawEvent
	writerDone      chan recorderWriterResult
	contextRequests chan recorderContextRequest
	contextDone     chan struct{}
	textSignals     chan recorderTextSignal
	textDone        chan struct{}
	done            chan struct{}
	stopOnce        sync.Once
	resultMu        sync.RWMutex
	result          recorderStopResult
	stopErr         error
	// transitionMu keeps explicit Recorder controls and the callback's
	// sequence/enqueue boundary in one total order. It is never held across
	// native, filesystem, window-probe, or JavaScript work.
	transitionMu sync.Mutex
	startedAt    time.Time
	pausedAt     time.Time
	endedAt      time.Time
	pausedTotal  time.Duration
	pauseCount   uint64
	lastControl  recorderControlResult

	accepting             atomic.Bool
	paused                atomic.Bool
	captureState          atomic.Value // string
	storageState          atomic.Value // string
	cutoffSeq             atomic.Uint64
	counts                recorderCounts
	lastNativeTime        atomic.Uint64
	lastTextContextNative atomic.Uint64
	overflowSeq           atomic.Uint64
	textSignalsDropped    atomic.Uint64
	lastWheelContextMS    uint64             // guarded by transitionMu
	lastWheelDirection    uint8              // guarded by transitionMu
	lastWheelSign         int8               // guarded by transitionMu
	heldMouseButtons      map[string]bool    // guarded by transitionMu
	recentInput           []recorderRawEvent // guarded by transitionMu; bounded native-input tail
	contextMu             sync.Mutex
	inputContexts         []recorderInputContext
	textMu                sync.Mutex
	textEdits             []recorderTextEdit
	issueMu               sync.Mutex
	issues                []recorderIssue
}

func registerRecorder(runtimeValue *goja.Runtime, opts InitJSOptions) (*RecorderRuntime, error) {
	if runtimeValue == nil {
		return nil, fmt.Errorf("Recorder registration requires Runtime")
	}
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	workDir := strings.TrimSpace(opts.WorkDir)
	if workDir == "" {
		var err error
		workDir, err = filepath.Abs(".")
		if err != nil {
			return nil, fmt.Errorf("resolve Recorder workdir: %w", err)
		}
	}
	factory := opts.RecorderBackendFactory
	if factory == nil {
		factory = newRecorderInputBackend
	}
	probe := opts.RecorderWindowProbe
	if probe == nil {
		probe = NewWindowManager().GetActiveWindow
	}
	targetProbe := newRecorderTargetProbe()
	textProbe := newRecorderTextProbe()
	resolver := opts.ScreenCaptureDisplayResolver
	if resolver == nil {
		resolver = resolveDisplays
	}
	owner := &RecorderRuntime{
		runtime: runtimeValue, loop: opts.EventLoop, context: ctx,
		workDir: workDir, executionID: opts.ExecutionID,
		enableCapture:  opts.EnableRecorderCapture,
		backendFactory: factory, windowProbe: probe, targetProbe: targetProbe, textProbe: textProbe, displayResolver: resolver,
		onAsyncError: opts.OnAsyncError,
	}
	object := runtimeValue.NewObject()
	if err := object.Set("getCapabilities", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(owner.capabilities())
	}); err != nil {
		return nil, fmt.Errorf("register Recorder.getCapabilities: %w", err)
	}
	if err := object.Set("start", func(call goja.FunctionCall) goja.Value { return owner.start(call) }); err != nil {
		return nil, fmt.Errorf("register Recorder.start: %w", err)
	}
	if err := object.Set("buildActions", func(call goja.FunctionCall) goja.Value { return owner.buildActions(call) }); err != nil {
		return nil, fmt.Errorf("register Recorder.buildActions: %w", err)
	}
	if err := object.Set("generateScript", func(call goja.FunctionCall) goja.Value { return owner.generateScript(call) }); err != nil {
		return nil, fmt.Errorf("register Recorder.generateScript: %w", err)
	}
	if err := runtimeValue.Set("Recorder", object); err != nil {
		return nil, err
	}
	return owner, nil
}

func (r *RecorderRuntime) capabilities() map[string]any {
	backend := r.backendFactory()
	capability := RecorderBackendCapabilities{Platform: runtime.GOOS, Backend: "unavailable", Permission: "unknown"}
	if backend != nil {
		capability = backend.Capabilities()
	}
	available := capability.Supported && r.enableCapture && capability.Permission != "denied"
	limitations := append([]string(nil), capability.Limitations...)
	if !r.enableCapture {
		limitations = append(limitations, "capture requires the trusted local -allow-recorder-capture entrypoint flag")
	}
	sort.Strings(limitations)
	return map[string]any{
		"capture": map[string]any{
			"available": available, "supported": capability.Supported,
			"hostAuthorized": r.enableCapture, "permission": capability.Permission,
			"platform": capability.Platform, "backend": capability.Backend,
			"library":         map[string]any{"name": recorderLibraryName, "version": recorderLibraryVersion, "commit": recorderLibraryCommit, "linkage": "source-static"},
			"coordinateSpace": capability.CoordinateSpace,
			"keyboardDefault": false, "evidenceModes": []string{"none", "target-semantics"}, "limitations": limitations,
		},
		"actions":         map[string]any{"available": true, "version": recorderActionsFormatVersion, "actionSubset": []string{"click.left.single", "drag.left.straight", "drag.left.text-selection-natural", "wheel.xy.burst", "text.focused-value-patch", "text.basic-latin-fallback", "keyboard.shortcut", "keyboard.special-key"}},
		"basicGeneration": map[string]any{"available": true, "mode": "basic", "version": recorderCandidateFormatVersion},
	}
}

func (r *RecorderRuntime) start(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := r.runtime.NewPromise()
	promiseValue := r.runtime.ToValue(promise)
	defer func() {
		if recovered := recover(); recovered != nil {
			_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "Recorder.start", "could not read start options", nil)))
			value = promiseValue
		}
	}()
	if r.loop == nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCaptureUnavailable, "Recorder.start", "capture requires an event-loop-owned Runtime", nil)))
		return promiseValue
	}
	if r.closing.Load() {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCanceled, "Recorder.start", "Recorder Runtime is closing", nil)))
		return promiseValue
	}
	options, err := r.parseStartOptions(call)
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return promiseValue
	}
	if !r.enableCapture {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCaptureDenied, "Recorder.start", "capture is disabled for this execution; use the trusted local -allow-recorder-capture entrypoint", nil)))
		return promiseValue
	}
	r.mu.Lock()
	if r.starting || (r.session != nil && !r.session.finished()) {
		r.mu.Unlock()
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCaptureOccupied, "Recorder.start", "this execution already owns an active Recorder session", nil)))
		return promiseValue
	}
	r.starting = true
	r.mu.Unlock()
	r.pending++
	r.startWorker(func() (any, error) {
		session, err := r.startSession(options)
		if err != nil {
			return nil, err
		}
		if r.closing.Load() || r.context.Err() != nil {
			session.finishAsync(recorderError(RecorderCanceled, "Recorder.start", "execution ended while capture was starting", r.context.Err()))
			<-session.done
			return nil, recorderError(RecorderCanceled, "Recorder.start", "execution ended while capture was starting", r.context.Err())
		}
		return session, nil
	}, func(result any, err error) {
		r.pending--
		r.mu.Lock()
		r.starting = false
		r.mu.Unlock()
		if err != nil {
			_ = reject(recorderJSError(r.runtime, err))
			return
		}
		session := result.(*recorderSession)
		r.mu.Lock()
		r.session = session
		r.mu.Unlock()
		_ = resolve(r.sessionObject(session))
	})
	return promiseValue
}

func (r *RecorderRuntime) parseStartOptions(call goja.FunctionCall) (recorderStartOptions, error) {
	const operation = "Recorder.start"
	if len(call.Arguments) == 0 || goja.IsUndefined(call.Argument(0)) || goja.IsNull(call.Argument(0)) {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "options.within is required", nil)
	}
	if len(call.Arguments) > 1 && !goja.IsUndefined(call.Argument(1)) {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "too many arguments", nil)
	}
	object := call.Argument(0).ToObject(r.runtime)
	if object == nil || object.ClassName() != "Object" {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "options must be an object", nil)
	}
	if err := recorderRejectUnknownKeys(object, map[string]bool{"within": true, "captureKeyboard": true, "keyboardContent": true, "evidence": true, "outputDir": true, "maxDurationMs": true, "controlKeycodes": true}); err != nil {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, err.Error(), nil)
	}
	withinValue := recorderObjectOption(object, "within")
	if goja.IsUndefined(withinValue) || goja.IsNull(withinValue) {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "options.within is required", nil)
	}
	withinObject := withinValue.ToObject(r.runtime)
	if withinObject == nil || withinObject.ClassName() != "Object" {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within must be an object", nil)
	}
	if err := recorderRejectUnknownKeys(withinObject, map[string]bool{"processId": true, "title": true}); err != nil {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within "+err.Error(), nil)
	}
	pidValue := recorderObjectOption(withinObject, "processId")
	if goja.IsUndefined(pidValue) {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within.processId is required", nil)
	}
	pidNumber, ok := recorderJSNumber(pidValue)
	if !ok {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within.processId must be a positive uint32", nil)
	}
	if math.IsNaN(pidNumber) || math.IsInf(pidNumber, 0) || pidNumber < 1 || pidNumber > math.MaxUint32 || math.Trunc(pidNumber) != pidNumber {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within.processId must be a positive uint32", nil)
	}
	titleValue := recorderObjectOption(withinObject, "title")
	if _, ok := titleValue.Export().(string); !ok {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within.title must be a string", nil)
	}
	title := strings.TrimSpace(titleValue.String())
	if title == "" || len(title) > 512 {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "within.title must be a non-empty string of at most 512 bytes", nil)
	}
	options := recorderStartOptions{
		Within:   recorderWithin{ProcessID: uint32(pidNumber), Title: title},
		Evidence: "target-semantics", MaxDuration: recorderDefaultMaxDuration,
		ControlKeycodes: map[uint16]bool{},
	}
	if value := recorderObjectOption(object, "captureKeyboard"); !goja.IsUndefined(value) {
		boolean, ok := value.Export().(bool)
		if !ok {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "captureKeyboard must be a boolean", nil)
		}
		options.CaptureKeyboard = boolean
	}
	if value := recorderObjectOption(object, "keyboardContent"); !goja.IsUndefined(value) {
		text, ok := value.Export().(string)
		if !ok {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "keyboardContent must be a string", nil)
		}
		options.KeyboardContent = strings.TrimSpace(text)
	}
	if options.CaptureKeyboard && options.KeyboardContent != "non-sensitive-test" {
		return recorderStartOptions{}, recorderError(RecorderCaptureDenied, operation, "captureKeyboard requires keyboardContent: \"non-sensitive-test\"", nil)
	}
	if !options.CaptureKeyboard && options.KeyboardContent != "" {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "keyboardContent is only valid when captureKeyboard is true", nil)
	}
	if value := recorderObjectOption(object, "evidence"); !goja.IsUndefined(value) {
		text, ok := value.Export().(string)
		if !ok {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "evidence must be a string", nil)
		}
		options.Evidence = strings.TrimSpace(text)
	}
	if options.Evidence != "none" && options.Evidence != "target-semantics" {
		return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "evidence must be \"none\" or \"target-semantics\"", nil)
	}
	if value := recorderObjectOption(object, "outputDir"); !goja.IsUndefined(value) {
		text, ok := value.Export().(string)
		if !ok {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "outputDir must be a string", nil)
		}
		options.OutputDir = strings.TrimSpace(text)
		if options.OutputDir == "" {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "outputDir must be a non-empty path string when provided", nil)
		}
	}
	if value := recorderObjectOption(object, "maxDurationMs"); !goja.IsUndefined(value) {
		number, ok := recorderJSNumber(value)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 1000 || number > float64(recorderMaximumMaxDuration/time.Millisecond) || math.Trunc(number) != number {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "maxDurationMs must be an integer from 1000 through 1800000", nil)
		}
		options.MaxDuration = time.Duration(number) * time.Millisecond
	}
	if value := recorderObjectOption(object, "controlKeycodes"); !goja.IsUndefined(value) {
		array := value.ToObject(r.runtime)
		if array == nil || array.ClassName() != "Array" {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "controlKeycodes must be an array of at most 16 uint16 values", nil)
		}
		length, ok := recorderJSNumber(array.Get("length"))
		if !ok || length < 0 || length > 16 || math.Trunc(length) != length {
			return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "controlKeycodes must be an array of at most 16 uint16 values", nil)
		}
		for index := 0; index < int(length); index++ {
			number, ok := recorderJSNumber(array.Get(strconv.Itoa(index)))
			if !ok || number < 0 || number > math.MaxUint16 || math.Trunc(number) != number {
				return recorderStartOptions{}, recorderError(RecorderInvalidArgument, operation, "controlKeycodes must contain only uint16 values", nil)
			}
			options.ControlKeycodes[uint16(number)] = true
		}
	}
	return options, nil
}

func recorderRejectUnknownKeys(object *goja.Object, allowed map[string]bool) error {
	if object == nil {
		return fmt.Errorf("must be an object")
	}
	for _, key := range object.GetOwnPropertyNames() {
		if !allowed[key] {
			return fmt.Errorf("contains unknown field %q", key)
		}
	}
	if len(object.Symbols()) != 0 {
		return fmt.Errorf("must not contain symbol fields")
	}
	return nil
}

func recorderObjectOption(object *goja.Object, name string) goja.Value {
	if object == nil {
		return goja.Undefined()
	}
	for _, key := range object.GetOwnPropertyNames() {
		if key == name {
			return object.Get(name)
		}
	}
	return goja.Undefined()
}

func recorderJSNumber(value goja.Value) (float64, bool) {
	switch number := value.Export().(type) {
	case int64:
		return float64(number), true
	case float64:
		return number, true
	default:
		return 0, false
	}
}

func (r *RecorderRuntime) startSession(options recorderStartOptions) (*recorderSession, error) {
	if r.context.Err() != nil || r.closing.Load() {
		return nil, recorderError(RecorderCanceled, "Recorder.start", "execution was canceled before capture started", r.context.Err())
	}
	initialIssues := make([]recorderIssue, 0, 2)
	var initialWindow *recorderWindowSnapshot
	active, err := r.windowProbe()
	if err != nil || active == nil {
		initialIssues = append(initialIssues, recorderIssue{
			Code: "initial-window-unverified", Severity: "warning",
			Message: "the initial foreground window could not be rechecked; options.within is retained as provenance only",
		})
	} else if active.ProcessID != options.Within.ProcessID || active.Title != options.Within.Title {
		initialIssues = append(initialIssues, recorderIssue{
			Code: "initial-window-changed", Severity: "warning",
			Message: "the foreground window changed during startup; options.within is retained as provenance only",
		})
	}
	if active != nil {
		initialWindow, err = recorderSnapshotWindow(active, time.Now().UTC())
		if err != nil {
			initialWindow = nil
			initialIssues = append(initialIssues, recorderIssue{
				Code: "initial-window-context-incomplete", Severity: "warning",
				Message: "the initial window lacks reusable application identity or bounds; action-level contexts will still be resolved",
			})
		}
	}
	backend := r.backendFactory()
	if backend == nil {
		return nil, recorderError(RecorderCaptureUnavailable, "Recorder.start", "Recorder input backend is unavailable", nil)
	}
	if configurable, ok := backend.(recorderKeyboardCaptureConfigurator); ok {
		configurable.configureCaptureKeyboard(options.CaptureKeyboard)
	}
	capability := backend.Capabilities()
	if !capability.Supported {
		return nil, recorderError(RecorderCaptureUnavailable, "Recorder.start", strings.Join(capability.Limitations, "; "), nil)
	}
	if capability.Permission == "denied" {
		return nil, recorderError(RecorderCaptureDenied, "Recorder.start", "operating-system input monitoring permission is denied", nil)
	}
	displays := append([]DisplayInfo(nil), r.displayResolver()...)
	if len(displays) == 0 {
		return nil, recorderError(RecorderCaptureUnavailable, "Recorder.start", "no display geometry is available for coordinate validation", nil)
	}
	manifest := newRecorderManifest(r.executionID, options, capability, displays, initialWindow)
	manifest.Issues = append(manifest.Issues, initialIssues...)
	writer, err := newRecorderWriter(r.workDir, options.OutputDir, manifest, nil)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(r.context)
	session := &recorderSession{
		owner: r, options: options, backend: backend, writer: writer,
		displays: displays, context: ctx, cancel: cancel,
		events:          make(chan recorderRawEvent, recorderQueueCapacity),
		writerDone:      make(chan recorderWriterResult, 1),
		contextRequests: make(chan recorderContextRequest, recorderContextQueueCapacity),
		contextDone:     make(chan struct{}),
		textSignals:     make(chan recorderTextSignal, recorderQueueCapacity),
		textDone:        make(chan struct{}), done: make(chan struct{}),
		heldMouseButtons: map[string]bool{}, inputContexts: make([]recorderInputContext, 0),
	}
	session.issues = append(session.issues, initialIssues...)
	session.startedAt, _ = time.Parse(time.RFC3339Nano, manifest.StartedAt)
	session.captureState.Store("starting")
	session.storageState.Store("open")
	session.accepting.Store(true)
	go session.runWriter()
	go session.runContextResolver()
	go session.runTextTracker()
	startCtx, startCancel := context.WithTimeout(ctx, recorderBackendStartTimeout)
	err = backend.Start(startCtx, session.receiveNativeEvent, session.backendFailed)
	startCancel()
	if err != nil {
		session.addIssue("backend-start-failed", "error", "native input backend did not become ready", "")
		session.captureState.Store("failed")
		session.finishAsync(err)
		<-session.done
		return nil, recorderError(mapBackendRecorderCode(err), "Recorder.start", "native input backend failed to start", err)
	}
	if err := writer.markRecording(); err != nil {
		session.addIssue("manifest-recording-state-failed", "error", "the ready session state could not be saved", "")
		session.captureState.Store("failed")
		session.finishAsync(recorderError(RecorderStorageFailed, "Recorder.start", "could not persist the ready recording state", err))
		<-session.done
		return nil, recorderError(RecorderStorageFailed, "Recorder.start", "could not persist the ready recording state", err)
	}
	session.captureState.Store("recording")
	go session.monitorDeadline()
	go session.monitorExecution()
	return session, nil
}

func newRecorderManifest(executionID string, options recorderStartOptions, capability RecorderBackendCapabilities, displays []DisplayInfo, initialWindow *recorderWindowSnapshot) recorderManifest {
	manifest := recorderManifest{
		FormatVersion: recorderRecordingFormatVersion, RecordingID: newRecorderID(),
		ExecutionID: executionID, State: "starting", Within: options.Within,
		InitialWindow: initialWindow,
		StartedAt:     time.Now().UTC().Format(time.RFC3339Nano),
		Displays:      append(make([]DisplayInfo, 0, len(displays)), displays...),
		Issues:        make([]recorderIssue, 0),
	}
	manifest.Capture.Library = recorderLibraryName
	manifest.Capture.LibraryVersion = recorderLibraryVersion
	manifest.Capture.LibraryCommit = recorderLibraryCommit
	manifest.Capture.Platform = capability.Platform
	manifest.Capture.Backend = capability.Backend
	manifest.Capture.Permission = capability.Permission
	manifest.Capture.CaptureKeyboard = options.CaptureKeyboard
	manifest.Capture.KeyboardContent = options.KeyboardContent
	manifest.Capture.ControlKeycodes = make([]uint16, 0, len(options.ControlKeycodes))
	for code := range options.ControlKeycodes {
		manifest.Capture.ControlKeycodes = append(manifest.Capture.ControlKeycodes, code)
	}
	sort.Slice(manifest.Capture.ControlKeycodes, func(i, j int) bool {
		return manifest.Capture.ControlKeycodes[i] < manifest.Capture.ControlKeycodes[j]
	})
	manifest.Capture.Evidence = options.Evidence
	manifest.Capture.CoordinateSpace = capability.CoordinateSpace
	manifest.Capture.PointerMotionPolicy = recorderPointerMotionPolicy
	manifest.Capture.Limitations = append(make([]string, 0, len(capability.Limitations)), capability.Limitations...)
	manifest.Queue.Capacity = recorderQueueCapacity
	manifest.Queue.ContextCapacity = recorderContextQueueCapacity
	manifest.Storage.State = "open"
	manifest.Storage.RawFile = "raw/events.ndjson"
	manifest.Storage.ManifestFile = "manifest.json"
	return manifest
}

func recorderSnapshotWindow(info *WindowInfo, observedAt time.Time) (*recorderWindowSnapshot, error) {
	if info == nil || info.ProcessID == 0 || strings.TrimSpace(info.Title) == "" || info.Width <= 0 || info.Height <= 0 {
		return nil, fmt.Errorf("window identity or bounds are incomplete")
	}
	name := strings.TrimSpace(info.ExeName)
	path := strings.TrimSpace(info.ExePath)
	kind, value := "executable-path", path
	if value == "" {
		kind, value = "executable-name", name
	}
	if value == "" {
		return nil, fmt.Errorf("window application identity is unavailable")
	}
	id := strings.TrimSpace(info.ID)
	if id == "" {
		id = makeWindowID(info.ProcessID, info.Handle)
	}
	return &recorderWindowSnapshot{
		ID: id, Title: strings.TrimSpace(info.Title), Handle: info.Handle, Index: info.Index, IsPopup: info.IsPopup,
		Application: recorderApplicationSnapshot{
			ProcessID: info.ProcessID, ExecutableName: name, ExecutablePath: path,
			IdentityKind: kind, IdentityValue: value,
		},
		Bounds:     recorderWindowBounds{X: int(info.X), Y: int(info.Y), Width: int(info.Width), Height: int(info.Height)},
		ObservedAt: observedAt.UTC().Format(time.RFC3339Nano),
	}, nil
}

func mapBackendRecorderCode(err error) RecorderErrorCode {
	var recorderErr *RecorderError
	if errors.As(err, &recorderErr) {
		return recorderErr.Code
	}
	return RecorderCaptureUnavailable
}

func (r *RecorderRuntime) sessionObject(session *recorderSession) *goja.Object {
	object := r.runtime.NewObject()
	_ = object.Set("status", func(goja.FunctionCall) goja.Value { return r.runtime.ToValue(session.status()) })
	_ = object.Set("pause", func(goja.FunctionCall) goja.Value { return r.pauseSession(session) })
	_ = object.Set("resume", func(goja.FunctionCall) goja.Value { return r.resumeSession(session) })
	_ = object.Set("excludeControlClick", func(call goja.FunctionCall) goja.Value { return r.excludeControlClick(session, call) })
	_ = object.Set("stop", func(goja.FunctionCall) goja.Value { return r.stopSession(session) })
	return object
}

func (r *RecorderRuntime) excludeControlClick(session *recorderSession, call goja.FunctionCall) goja.Value {
	promise, resolve, reject := r.runtime.NewPromise()
	value := r.runtime.ToValue(promise)
	if session == nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "session is unavailable", nil)))
		return value
	}
	if len(call.Arguments) == 0 || goja.IsUndefined(call.Argument(0)) || goja.IsNull(call.Argument(0)) {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "a Custom UI click event is required", nil)))
		return value
	}
	if len(call.Arguments) > 1 && !goja.IsUndefined(call.Argument(1)) {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "too many arguments", nil)))
		return value
	}
	event := call.Argument(0).ToObject(r.runtime)
	if event == nil || event.ClassName() != "Object" {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event must be an object", nil)))
		return value
	}
	allowed := map[string]bool{
		"sessionId": true, "windowId": true, "targetId": true, "type": true,
		"sequence": true, "timestamp": true, "value": true, "checked": true,
		"bounds": true, "reason": true,
	}
	if err := recorderRejectUnknownKeys(event, allowed); err != nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", err.Error(), nil)))
		return value
	}
	readString := func(name string) (string, bool) {
		raw := recorderObjectOption(event, name)
		text, ok := raw.Export().(string)
		return strings.TrimSpace(text), ok
	}
	windowID, windowOK := readString("windowId")
	targetID, targetOK := readString("targetId")
	eventType, typeOK := readString("type")
	timestamp, timestampOK := readString("timestamp")
	at, timestampErr := time.Parse(time.RFC3339Nano, timestamp)
	if !windowOK || !targetOK || !typeOK || !timestampOK || eventType != "click" ||
		!recorderIDPattern.MatchString(windowID) || !recorderIDPattern.MatchString(targetID) || timestampErr != nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event must be a valid Custom UI click with stable windowId, targetId, and timestamp", timestampErr)))
		return value
	}
	boundsValue := recorderObjectOption(event, "bounds")
	if goja.IsUndefined(boundsValue) || goja.IsNull(boundsValue) {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event.bounds must contain the original Custom UI control screen bounds", nil)))
		return value
	}
	boundsObject := boundsValue.ToObject(r.runtime)
	if boundsObject == nil || boundsObject.ClassName() != "Object" {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event.bounds must be an object", nil)))
		return value
	}
	if err := recorderRejectUnknownKeys(boundsObject, map[string]bool{"x": true, "y": true, "width": true, "height": true}); err != nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event.bounds "+err.Error(), nil)))
		return value
	}
	readNumber := func(name string) (float64, bool) {
		value := recorderObjectOption(boundsObject, name)
		if goja.IsUndefined(value) || goja.IsNull(value) {
			return 0, false
		}
		return recorderJSNumber(value)
	}
	x, xOK := readNumber("x")
	y, yOK := readNumber("y")
	width, widthOK := readNumber("width")
	height, heightOK := readNumber("height")
	if !xOK || !yOK || !widthOK || !heightOK || math.IsNaN(x) || math.IsInf(x, 0) || math.IsNaN(y) || math.IsInf(y, 0) || math.IsNaN(width) || math.IsInf(width, 0) || math.IsNaN(height) || math.IsInf(height, 0) || width <= 0 || height <= 0 {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.excludeControlClick", "event.bounds must contain finite x/y and positive width/height", nil)))
		return value
	}
	result, err := session.excludeControlClick(windowID, targetID, at, recorderControlBounds{X: x, Y: y, Width: width, Height: height})
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return value
	}
	_ = resolve(result.jsValue())
	return value
}

func (r *RecorderRuntime) pauseSession(session *recorderSession) goja.Value {
	promise, resolve, reject := r.runtime.NewPromise()
	value := r.runtime.ToValue(promise)
	if session == nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.pause", "session is unavailable", nil)))
		return value
	}
	result, err := session.pause()
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return value
	}
	_ = resolve(result.jsValue())
	return value
}

func (r *RecorderRuntime) resumeSession(session *recorderSession) goja.Value {
	promise, resolve, reject := r.runtime.NewPromise()
	value := r.runtime.ToValue(promise)
	if session == nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.resume", "session is unavailable", nil)))
		return value
	}
	if result, done, err := session.resumeNoop(); done {
		if err != nil {
			_ = reject(recorderJSError(r.runtime, err))
		} else {
			_ = resolve(result.jsValue())
		}
		return value
	}
	control, err := session.resume()
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return value
	}
	_ = resolve(control.jsValue())
	return value
}

func (r *RecorderRuntime) stopSession(session *recorderSession) goja.Value {
	promise, resolve, reject := r.runtime.NewPromise()
	value := r.runtime.ToValue(promise)
	if session == nil {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "RecorderSession.stop", "session is unavailable", nil)))
		return value
	}
	r.pending++
	session.finishAsync(nil)
	r.startWorker(func() (any, error) {
		<-session.done
		session.resultMu.RLock()
		defer session.resultMu.RUnlock()
		return session.result, session.stopErr
	}, func(result any, err error) {
		r.pending--
		stopResult := result.(recorderStopResult)
		if err != nil {
			_ = reject(recorderJSErrorWithPartial(r.runtime, err, stopResult.jsValue()))
			return
		}
		_ = resolve(stopResult.jsValue())
	})
	return value
}

func (s *recorderSession) status() map[string]any {
	state, _ := s.captureState.Load().(string)
	storage, _ := s.storageState.Load().(string)
	cutoff := s.cutoffSeq.Load()
	var cutoffValue any
	if cutoff > 0 {
		cutoffValue = fmt.Sprintf("%d", cutoff)
	}
	s.issueMu.Lock()
	issues := append(make([]recorderIssue, 0, len(s.issues)), s.issues...)
	s.issueMu.Unlock()
	timing := s.timingSnapshot()
	return map[string]any{
		"captureState": state, "storageState": storage,
		"recordingId": s.writer.recordingID, "recordingDir": s.writer.recordingDir,
		"counts": s.countSnapshot(), "cutoffSequence": cutoffValue,
		"maxDurationMs": s.options.MaxDuration.Milliseconds(), "issues": issuesToAny(issues),
		"startedAt": timing["startedAt"], "pausedAt": timing["pausedAt"],
		"elapsedDurationMs": timing["elapsedDurationMs"], "activeDurationMs": timing["activeDurationMs"],
		"pausedDurationMs": timing["pausedDurationMs"], "pauseCount": timing["pauseCount"],
	}
}

func (s *recorderSession) countSnapshot() map[string]uint64 {
	return map[string]uint64{
		"observed": s.counts.Observed.Load(), "accepted": s.counts.Accepted.Load(),
		"persisted": s.counts.Persisted.Load(), "filtered": s.counts.Filtered.Load(),
		"paused":  s.counts.Paused.Load(),
		"dropped": s.counts.Dropped.Load(), "late": s.counts.Late.Load(),
	}
}

func (s *recorderSession) finished() bool {
	select {
	case <-s.done:
		return true
	default:
		return false
	}
}

func (s *recorderSession) pause() (recorderControlResult, error) {
	now := time.Now().UTC()
	s.transitionMu.Lock()
	state, _ := s.captureState.Load().(string)
	if state == "paused" {
		result := s.lastControl
		result.Changed = false
		s.transitionMu.Unlock()
		return result, nil
	}
	if state != "recording" || !s.accepting.Load() {
		s.transitionMu.Unlock()
		return recorderControlResult{}, recorderError(RecorderInvalidState, "RecorderSession.pause", "pause requires a recording session", nil)
	}

	s.paused.Store(true)
	event, ok := s.enqueueControlEventLocked("RECORDER_PAUSED", now)
	s.recentInput = nil
	s.heldMouseButtons = map[string]bool{}
	s.lastTextContextNative.Store(0)
	if !ok {
		s.transitionMu.Unlock()
		s.addIssue("queue-overflow", "error", "the bounded capture queue overflowed while saving a pause boundary", event.EventID)
		s.finishAsync(recorderError(RecorderStorageFailed, "RecorderSession.pause", "capture queue overflowed while saving the pause boundary", nil))
		return recorderControlResult{}, recorderError(RecorderStorageFailed, "RecorderSession.pause", "could not save the pause boundary", nil)
	}
	s.captureState.Store("paused")
	s.pausedAt = now
	s.pauseCount++
	result := recorderControlResult{Changed: true, CaptureState: "paused", TransitionSequence: recorderNativeStringValue(event.Sequence), TransitionedAt: now}
	s.lastControl = result
	s.transitionMu.Unlock()
	return result, nil
}

func (s *recorderSession) resumeNoop() (recorderControlResult, bool, error) {
	s.transitionMu.Lock()
	defer s.transitionMu.Unlock()
	state, _ := s.captureState.Load().(string)
	if state == "recording" {
		result := s.lastControl
		result.Changed = false
		result.CaptureState = "recording"
		if result.TransitionedAt.IsZero() {
			result.TransitionedAt = s.startedAt
		}
		return result, true, nil
	}
	if state != "paused" || !s.accepting.Load() {
		return recorderControlResult{}, true, recorderError(RecorderInvalidState, "RecorderSession.resume", "resume requires a paused session", nil)
	}
	return recorderControlResult{}, false, nil
}

func (s *recorderSession) resume() (recorderControlResult, error) {
	now := time.Now().UTC()
	s.transitionMu.Lock()
	state, _ := s.captureState.Load().(string)
	if state == "recording" {
		result := s.lastControl
		result.Changed = false
		result.CaptureState = "recording"
		s.transitionMu.Unlock()
		return result, nil
	}
	if state != "paused" || !s.accepting.Load() {
		s.transitionMu.Unlock()
		return recorderControlResult{}, recorderError(RecorderInvalidState, "RecorderSession.resume", "resume requires a paused session", nil)
	}
	event, ok := s.enqueueControlEventLocked("RECORDER_RESUMED", now)
	s.recentInput = nil
	s.heldMouseButtons = map[string]bool{}
	s.lastTextContextNative.Store(0)
	if !ok {
		s.transitionMu.Unlock()
		s.addIssue("queue-overflow", "error", "the bounded capture queue overflowed while saving a resume boundary", event.EventID)
		s.finishAsync(recorderError(RecorderStorageFailed, "RecorderSession.resume", "capture queue overflowed while saving the resume boundary", nil))
		return recorderControlResult{}, recorderError(RecorderStorageFailed, "RecorderSession.resume", "could not save the resume boundary", nil)
	}
	if !s.pausedAt.IsZero() {
		s.pausedTotal += now.Sub(s.pausedAt)
		s.pausedAt = time.Time{}
	}
	s.paused.Store(false)
	s.captureState.Store("recording")
	result := recorderControlResult{Changed: true, CaptureState: "recording", TransitionSequence: recorderNativeStringValue(event.Sequence), TransitionedAt: now}
	s.lastControl = result
	s.transitionMu.Unlock()
	return result, nil
}

func (s *recorderSession) enqueueControlEventLocked(kind string, now time.Time) (recorderRawEvent, bool) {
	return s.enqueueControlEventWithMetadataLocked(kind, now, nil)
}

func (s *recorderSession) enqueueControlEventWithMetadataLocked(kind string, now time.Time, metadata map[string]string) (recorderRawEvent, bool) {
	sequence := s.counts.Observed.Add(1)
	event := recorderRawEvent{
		FormatVersion: recorderRawEventFormatVersion,
		EventID:       fmt.Sprintf("e%012d", sequence),
		Sequence:      fmt.Sprintf("%d", sequence),
		LibraryEvent:  kind,
		NativeTime:    fmt.Sprintf("%d", s.lastNativeTime.Load()),
		NativeClock:   recorderNativeClock(),
		NativeUnit:    recorderNativeUnit(),
		ReceivedAt:    now.UTC().Format(time.RFC3339Nano),
		Modifiers:     []string{},
		Source:        "recorder",
		ScopeRef:      "desktop:global-input",
		Metadata:      metadata,
	}
	select {
	case s.events <- event:
		s.counts.Accepted.Add(1)
		s.lastWheelContextMS, s.lastWheelDirection, s.lastWheelSign = 0, 0, 0
		s.signalTextTrackerLocked(event)
		return event, true
	default:
		s.counts.Dropped.Add(1)
		s.overflowSeq.CompareAndSwap(0, sequence)
		return event, false
	}
}

func (s *recorderSession) excludeControlClick(windowID, targetID string, uiTimestamp time.Time, controlBounds recorderControlBounds) (recorderControlClickResult, error) {
	const operation = "RecorderSession.excludeControlClick"
	now := time.Now().UTC()
	if uiTimestamp.After(now.Add(time.Second)) || now.Sub(uiTimestamp) > 5*time.Second {
		return recorderControlClickResult{}, recorderError(RecorderInvalidArgument, operation, "Custom UI click timestamp is outside the live control-event window", nil)
	}
	s.transitionMu.Lock()
	state, _ := s.captureState.Load().(string)
	if state == "paused" {
		// Native callbacks are already discarded before normalization while
		// paused, so the resume/stop click has no raw input to exclude.
		s.transitionMu.Unlock()
		return recorderControlClickResult{Changed: false, EventIDs: []string{}, MatchStatus: "not-observed"}, nil
	}
	if state != "recording" || !s.accepting.Load() {
		s.transitionMu.Unlock()
		return recorderControlClickResult{}, recorderError(RecorderInvalidState, operation, "control-click exclusion requires a recording or paused session", nil)
	}
	matched := recorderTrailingControlClickWithin(s.recentInput, uiTimestamp, &controlBounds)
	eventIDs := make([]string, 0, len(matched))
	for _, event := range matched {
		eventIDs = append(eventIDs, event.EventID)
	}
	matchStatus := "matched"
	if len(eventIDs) == 0 {
		matchStatus = "not-observed"
		if recorderRecentControlPointerInput(s.recentInput, uiTimestamp, controlBounds) {
			matchStatus = "unmatched"
		}
	}
	encodedIDs, _ := json.Marshal(eventIDs)
	encodedBounds, _ := json.Marshal(controlBounds)
	boundary, ok := s.enqueueControlEventWithMetadataLocked("RECORDER_CONTROL_CLICK", now, map[string]string{
		"windowId": windowID, "targetId": targetID,
		"uiTimestamp":     uiTimestamp.UTC().Format(time.RFC3339Nano),
		"triggerEventIds": string(encodedIDs),
		"controlBounds":   string(encodedBounds),
		"matchStatus":     matchStatus,
	})
	s.recentInput = nil
	if !ok {
		s.transitionMu.Unlock()
		s.addIssue("queue-overflow", "error", "the bounded capture queue overflowed while saving a Custom UI control-click boundary", boundary.EventID)
		s.finishAsync(recorderError(RecorderStorageFailed, operation, "capture queue overflowed while saving the control-click boundary", nil))
		return recorderControlClickResult{}, recorderError(RecorderStorageFailed, operation, "could not save the Custom UI control-click boundary", nil)
	}
	s.transitionMu.Unlock()
	return recorderControlClickResult{
		Changed: true, TransitionSequence: recorderNativeStringValue(boundary.Sequence), EventIDs: eventIDs, MatchStatus: matchStatus,
	}, nil
}

func (s *recorderSession) timingSnapshot() map[string]any {
	s.transitionMu.Lock()
	defer s.transitionMu.Unlock()
	now := time.Now().UTC()
	if !s.endedAt.IsZero() {
		now = s.endedAt
	}
	pausedDuration := s.pausedTotal
	var pausedAt any
	if !s.pausedAt.IsZero() {
		pausedDuration += now.Sub(s.pausedAt)
		pausedAt = s.pausedAt.UTC().Format(time.RFC3339Nano)
	}
	elapsed := now.Sub(s.startedAt)
	if elapsed < 0 {
		elapsed = 0
	}
	if pausedDuration < 0 {
		pausedDuration = 0
	}
	active := elapsed - pausedDuration
	if active < 0 {
		active = 0
	}
	return map[string]any{
		"startedAt": s.startedAt.UTC().Format(time.RFC3339Nano), "pausedAt": pausedAt,
		"elapsedDurationMs": elapsed.Milliseconds(), "activeDurationMs": active.Milliseconds(),
		"pausedDurationMs": pausedDuration.Milliseconds(), "pauseCount": s.pauseCount,
	}
}

func (s *recorderSession) receiveNativeEvent(input RecorderInputEvent) {
	s.transitionMu.Lock()
	sequence := s.counts.Observed.Add(1)
	s.lastNativeTime.Store(input.NativeTime)
	if !s.accepting.Load() {
		s.counts.Late.Add(1)
		s.transitionMu.Unlock()
		return
	}
	if s.paused.Load() {
		s.counts.Paused.Add(1)
		s.transitionMu.Unlock()
		return
	}
	if input.Type == recorderEventHookEnabled || input.Type == recorderEventHookDisabled {
		s.counts.Filtered.Add(1)
		s.transitionMu.Unlock()
		return
	}
	if recorderIsKeyboardEvent(input.Type) && !s.options.CaptureKeyboard {
		s.counts.Filtered.Add(1)
		s.transitionMu.Unlock()
		return
	}
	if recorderIsKeyboardEvent(input.Type) && s.options.ControlKeycodes[input.Keycode] {
		s.counts.Filtered.Add(1)
		s.transitionMu.Unlock()
		return
	}
	if input.Type == recorderEventMouseMoved {
		// Hover motion is neither an action nor required evidence for click
		// reconstruction. Preserve motion only while a mouse button is held so
		// drag paths and click jitter remain lossless.
		if len(s.heldMouseButtons) == 0 {
			s.counts.Filtered.Add(1)
			s.transitionMu.Unlock()
			return
		}
	}
	button := recorderButtonName(input.Button)
	if input.Type == recorderEventMousePressed && button != "none" {
		s.heldMouseButtons[button] = true
	}
	event := s.normalizeEvent(sequence, input)
	select {
	case s.events <- event:
		s.counts.Accepted.Add(1)
		s.recentInput = append(s.recentInput, event)
		if len(s.recentInput) > 64 {
			s.recentInput = append([]recorderRawEvent(nil), s.recentInput[len(s.recentInput)-64:]...)
		}
		if input.Type != recorderEventMouseWheel {
			s.lastWheelContextMS, s.lastWheelDirection, s.lastWheelSign = 0, 0, 0
		}
		if input.Type == recorderEventMousePressed {
			s.queueInputContextLocked(event, "pointer", "pressed")
		} else if input.Type == recorderEventMouseReleased {
			delete(s.heldMouseButtons, button)
			s.queueInputContextLocked(event, "pointer", "released")
		} else if input.Type == recorderEventMouseWheel {
			nativeMS := recorderInputTimeMilliseconds(input.NativeTime)
			sign := int8(0)
			if input.Rotation > 0 {
				sign = 1
			} else if input.Rotation < 0 {
				sign = -1
			}
			if s.lastWheelContextMS == 0 || nativeMS < s.lastWheelContextMS || nativeMS-s.lastWheelContextMS > recorderWheelBurstGapMS || input.Direction != s.lastWheelDirection || sign != s.lastWheelSign {
				s.queueInputContextLocked(event, "pointer", "wheel")
			}
			s.lastWheelContextMS, s.lastWheelDirection, s.lastWheelSign = nativeMS, input.Direction, sign
		} else if input.Type == recorderEventKeyPressed && !recorderIsModifierKey(input.Keycode) {
			keyName, known := recorderKeyName(input.Keycode)
			if recorderHasControlModifier(input.Mask) || (known && recorderIsReplayableSpecialKey(keyName)) {
				s.queueInputContextLocked(event, "keyboard", "pressed")
			}
		} else if input.Type == recorderEventKeyTyped {
			nativeMS := recorderInputTimeMilliseconds(input.NativeTime)
			previous := s.lastTextContextNative.Load()
			if previous == 0 || nativeMS < previous || nativeMS-previous > 1000 {
				s.queueInputContextLocked(event, "keyboard", "")
			}
			s.lastTextContextNative.Store(nativeMS)
		}
		s.signalTextTrackerLocked(event)
		s.transitionMu.Unlock()
	default:
		s.counts.Dropped.Add(1)
		s.overflowSeq.CompareAndSwap(0, sequence)
		s.transitionMu.Unlock()
		s.finishAsync(recorderError(RecorderStorageFailed, "Recorder.capture", "capture queue overflowed", nil))
	}
}

func (s *recorderSession) normalizeEvent(sequence uint64, input RecorderInputEvent) recorderRawEvent {
	event := recorderRawEvent{
		FormatVersion: recorderRawEventFormatVersion,
		EventID:       fmt.Sprintf("e%012d", sequence), Sequence: fmt.Sprintf("%d", sequence),
		LibraryEvent: recorderEventName(input.Type), NativeTime: fmt.Sprintf("%d", input.NativeTime),
		NativeClock: recorderNativeClock(), NativeUnit: recorderNativeUnit(), ReceivedAt: time.Now().UTC().Format(time.RFC3339Nano),
		ModifierMask: input.Mask, Modifiers: recorderModifiers(input.Mask), Source: "unknown",
		ScopeRef: "desktop:global-input",
	}
	if recorderIsKeyboardEvent(input.Type) {
		keycode, rawcode, keychar := input.Keycode, input.Rawcode, input.Keychar
		event.Keycode, event.Rawcode, event.Keychar = &keycode, &rawcode, &keychar
		if input.Type == recorderEventKeyTyped {
			event.Gaps = append(event.Gaps, "key-typed-is-not-an-ime-commit")
		}
	}
	if recorderIsMouseEvent(input.Type) {
		x, y := int(input.X), int(input.Y)
		event.X, event.Y = &x, &y
		event.Button = recorderButtonName(input.Button)
		event.Clicks = input.Clicks
		event.CoordinateSpace = "screen-logical"
		event.CoordinateVerified, event.DisplayRef = recorderValidatePoint(x, y, s.displays)
		if !event.CoordinateVerified {
			event.Gaps = append(event.Gaps, "coordinate-outside-known-display")
		}
		if input.Type == recorderEventMouseMoved {
			event.Sampled = false
		}
	}
	if input.Type == recorderEventMouseWheel {
		amount, rotation, direction := input.Amount, input.Rotation, input.Direction
		event.WheelAmount, event.WheelRotation, event.WheelDirection = &amount, &rotation, &direction
	}
	return event
}

func recorderInputTimeMilliseconds(value uint64) uint64 {
	if recorderNativeUnit() == "nanoseconds" {
		return value / uint64(time.Millisecond)
	}
	return value
}

func (s *recorderSession) queueInputContextLocked(event recorderRawEvent, kind, phase string) {
	if s.contextRequests == nil {
		return
	}
	receivedAt, err := time.Parse(time.RFC3339Nano, event.ReceivedAt)
	if err != nil {
		receivedAt = time.Now().UTC()
	}
	request := recorderContextRequest{EventID: event.EventID, Kind: kind, Phase: phase, ReceivedAt: receivedAt}
	if event.X != nil && event.Y != nil {
		x, y := *event.X, *event.Y
		request.X, request.Y = &x, &y
	}
	select {
	case s.contextRequests <- request:
	default:
		s.appendInputContext(recorderInputContext{
			EventID: event.EventID, Kind: kind, Phase: phase, Status: "unverified",
			Reason: "window context queue overflowed", SemanticStatus: "not-applicable",
		})
		s.addIssue("window-context-overflow", "error", "the bounded window-context queue overflowed", event.EventID)
	}
}

func (s *recorderSession) appendInputContext(context recorderInputContext) {
	s.contextMu.Lock()
	s.inputContexts = append(s.inputContexts, context)
	s.contextMu.Unlock()
}

func (s *recorderSession) runContextResolver() {
	defer close(s.contextDone)
	for request := range s.contextRequests {
		observedAt := time.Now().UTC()
		resolved := recorderInputContext{
			EventID: request.EventID, Kind: request.Kind, Phase: request.Phase, Status: "unverified",
			ResolutionDelayMS: observedAt.Sub(request.ReceivedAt).Milliseconds(),
			SemanticStatus:    "not-applicable",
		}
		active, err := s.owner.windowProbe()
		if err != nil || active == nil {
			resolved.Reason = "active window could not be resolved after input"
		} else if snapshot, snapshotErr := recorderSnapshotWindow(active, observedAt); snapshotErr != nil {
			resolved.Reason = "active window identity or bounds are incomplete"
		} else if resolved.ResolutionDelayMS < 0 || time.Duration(resolved.ResolutionDelayMS)*time.Millisecond > recorderContextFreshness {
			resolved.Reason = "window context was resolved too late"
			resolved.Window = snapshot
		} else if request.X != nil && request.Y != nil && !recorderPointInsideWindow(*request.X, *request.Y, snapshot.Bounds) {
			resolved.Reason = "pointer release is outside the resolved active window"
			if request.Phase == "pressed" {
				resolved.Reason = "pointer press is outside the resolved active window"
			} else if request.Phase == "wheel" {
				resolved.Reason = "wheel position is outside the resolved active window"
			}
			resolved.Window = snapshot
		} else {
			resolved.Status = "verified"
			resolved.Window = snapshot
			if request.Kind == "pointer" && request.Phase != "wheel" && request.X != nil && request.Y != nil {
				if s.options.Evidence == "none" {
					resolved.SemanticStatus = "not-requested"
					s.appendInputContext(resolved)
					continue
				}
				resolved.SemanticStatus = "unavailable"
				if s.owner.targetProbe == nil {
					resolved.SemanticReason = "platform target semantics are unavailable"
				} else {
					probeContext, cancel := context.WithTimeout(context.Background(), recorderContextFreshness)
					element, semanticErr := s.owner.targetProbe(probeContext, active, *request.X, *request.Y)
					cancel()
					if semanticErr != nil {
						resolved.SemanticReason = semanticErr.Error()
					} else if element == nil {
						resolved.SemanticReason = "no accessibility element was resolved at the pointer"
					} else {
						resolved.SemanticStatus = "verified"
						resolved.Element = element
					}
				}
			}
		}
		s.appendInputContext(resolved)
	}
}

func recorderPointInsideWindow(x, y int, bounds recorderWindowBounds) bool {
	return bounds.Width > 0 && bounds.Height > 0 && x >= bounds.X && x < bounds.X+bounds.Width && y >= bounds.Y && y < bounds.Y+bounds.Height
}

func (s *recorderSession) runWriter() {
	result := s.writer.consume(s.events, &s.counts.Persisted)
	s.writerDone <- result
}

func (s *recorderSession) finishAsync(reason error) {
	s.stopOnce.Do(func() {
		cutoffTime := time.Now().UTC()
		s.transitionMu.Lock()
		state, _ := s.captureState.Load().(string)
		if state != "failed" {
			s.captureState.Store("stopping")
		}
		s.cutoffSeq.Store(s.counts.Observed.Load())
		s.accepting.Store(false)
		if !s.pausedAt.IsZero() {
			s.pausedTotal += cutoffTime.Sub(s.pausedAt)
			s.pausedAt = time.Time{}
		}
		s.paused.Store(false)
		s.endedAt = cutoffTime
		s.transitionMu.Unlock()
		go s.finish(reason, cutoffTime)
	})
}

func (s *recorderSession) finish(reason error, cutoffTime time.Time) {
	// Freeze the acceptance boundary before asking the process-wide hook to
	// stop. Events already accepted remain in the queue and are drained; later
	// callbacks are counted as late but cannot extend the recording.
	s.accepting.Store(false)
	s.cancel()
	stopCtx, cancel := context.WithTimeout(context.Background(), recorderBackendStopTimeout)
	backendErr := s.backend.Stop(stopCtx)
	cancel()
	if backendErr == nil {
		// A nil Stop result is the backend contract that callbacks and hook_run
		// have exited. Avoid an unbounded join after a stop deadline failure.
		s.backend.Wait()
	}
	close(s.contextRequests)
	<-s.contextDone
	close(s.textSignals)
	<-s.textDone
	close(s.events)
	writerResult := <-s.writerDone
	s.storageState.Store(writerResult.State)
	if backendErr != nil {
		s.addIssue("backend-stop-failed", "error", "native input backend did not confirm a clean stop", "")
	}
	if writerResult.Err != nil {
		s.addIssue("storage-finalize-failed", "error", "raw event storage could not be fully finalized", "")
	}
	if s.counts.Dropped.Load() > 0 {
		overflowEventID := ""
		if sequence := s.overflowSeq.Load(); sequence > 0 {
			overflowEventID = fmt.Sprintf("e%012d", sequence)
		}
		s.addIssue("queue-overflow", "error", "the bounded capture queue overflowed; capture stopped", overflowEventID)
		s.addIssue("events-dropped", "error", "one or more observed events were not accepted by the writer queue", "")
	}
	if s.textSignalsDropped.Load() > 0 {
		s.addIssue("text-tracker-overflow", "error", "the bounded text-classification queue overflowed; keyboard text cannot be reconstructed safely", "")
	}
	s.issueMu.Lock()
	issues := append([]recorderIssue(nil), s.issues...)
	s.issueMu.Unlock()
	s.contextMu.Lock()
	inputContexts := append([]recorderInputContext(nil), s.inputContexts...)
	s.contextMu.Unlock()
	s.textMu.Lock()
	textEdits := append([]recorderTextEdit(nil), s.textEdits...)
	s.textMu.Unlock()
	sort.SliceStable(inputContexts, func(i, j int) bool {
		return recorderNativeStringValue(strings.TrimPrefix(inputContexts[i].EventID, "e")) < recorderNativeStringValue(strings.TrimPrefix(inputContexts[j].EventID, "e"))
	})
	captureState := "stopped"
	if reason != nil || backendErr != nil {
		captureState = "failed"
	}
	s.captureState.Store(captureState)
	manifestState := captureState
	if writerResult.State != "saved" {
		manifestState = "partial"
	}
	manifestErr := s.writer.finishManifest(recorderManifestFinal{
		State: manifestState, StoppedAt: cutoffTime, CutoffSequence: s.cutoffSeq.Load(),
		Counts: s.countSnapshot(), Storage: writerResult, InputContexts: inputContexts, TextEdits: textEdits, Issues: issues,
	})
	if manifestErr != nil {
		writerResult.State = "failed"
		s.storageState.Store("failed")
		s.addIssue("manifest-finalize-failed", "error", "terminal manifest could not be saved", "")
	}
	s.issueMu.Lock()
	issues = append(make([]recorderIssue, 0, len(s.issues)), s.issues...)
	s.issueMu.Unlock()
	result := recorderStopResult{
		RecordingID: s.writer.recordingID, RecordingDir: s.writer.recordingDir,
		RawFile: writerResult.RawFile, ManifestFile: s.writer.manifestPath,
		CaptureState: captureState, StorageState: writerResult.State,
		Counts: s.countSnapshot(), Issues: issues,
	}
	var finalErr error
	if reason != nil {
		finalErr = reason
	}
	if finalErr == nil && backendErr != nil {
		finalErr = recorderError(RecorderCaptureUnavailable, "RecorderSession.stop", "native backend stop failed", backendErr)
	}
	if finalErr == nil && writerResult.Err != nil {
		finalErr = recorderError(RecorderStorageFailed, "RecorderSession.stop", "recording storage finalization failed", writerResult.Err)
	}
	if finalErr == nil && manifestErr != nil {
		finalErr = recorderError(RecorderStorageFailed, "RecorderSession.stop", "terminal manifest finalization failed", manifestErr)
	}
	s.resultMu.Lock()
	s.result, s.stopErr = result, finalErr
	s.resultMu.Unlock()
	close(s.done)
}

func (s *recorderSession) monitorDeadline() {
	timer := time.NewTimer(s.options.MaxDuration)
	defer timer.Stop()
	select {
	case <-s.context.Done():
		return
	case <-timer.C:
		s.addIssue("maximum-duration", "error", "Recorder reached its configured maximum duration", "")
		s.finishAsync(recorderError(RecorderCanceled, "Recorder.capture", "maximum recording duration reached", nil))
	}
}

func (s *recorderSession) monitorExecution() {
	select {
	case <-s.context.Done():
		if s.owner.context.Err() != nil {
			s.addIssue("execution-canceled", "error", "execution ended while Recorder was active", "")
			s.finishAsync(recorderError(RecorderCanceled, "Recorder.capture", "execution ended while recording", s.owner.context.Err()))
		}
	case <-s.done:
	}
}

func (s *recorderSession) backendFailed(err error) {
	if s.finished() {
		return
	}
	s.addIssue("backend-interrupted", "error", "native input backend exited before an explicit stop", "")
	s.finishAsync(recorderError(RecorderCaptureUnavailable, "Recorder.capture", "native input backend was interrupted", err))
}

func (s *recorderSession) addIssue(code, severity, message, eventID string) {
	s.issueMu.Lock()
	defer s.issueMu.Unlock()
	for _, issue := range s.issues {
		if issue.Code == code && issue.EventID == eventID {
			return
		}
	}
	s.issues = append(s.issues, recorderIssue{Code: code, Severity: severity, Message: message, EventID: eventID})
}

func (r *RecorderRuntime) startWorker(work func() (any, error), finish func(any, error)) {
	r.workers.Add(1)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		result, err := work()
		r.workers.Add(-1)
		if r.closing.Load() || r.loop == nil {
			finishUnpublishedRecorderSession(result)
			return
		}
		if !r.loop.RunOnLoop(func(*goja.Runtime) { finish(result, err) }) {
			finishUnpublishedRecorderSession(result)
			if err != nil && r.onAsyncError != nil {
				r.onAsyncError(err)
			}
		}
	}()
}

func finishUnpublishedRecorderSession(result any) {
	session, ok := result.(*recorderSession)
	if !ok || session == nil || session.finished() {
		return
	}
	session.finishAsync(recorderError(RecorderCanceled, "Recorder.start", "execution ended before the Recorder session handle was published", nil))
	<-session.done
}

func (r *RecorderRuntime) AsyncCounts() (int64, int) {
	if r == nil {
		return 0, 0
	}
	workers := r.workers.Load()
	r.mu.Lock()
	if r.session != nil && !r.session.finished() {
		workers++
	}
	r.mu.Unlock()
	return workers, r.pending
}

func (r *RecorderRuntime) ResourceCounts() (workers int64, pending, sessions, backendLeases, writers int) {
	if r == nil {
		return
	}
	workers = r.workers.Load()
	pending = r.pending
	r.mu.Lock()
	session := r.session
	r.starting = false
	r.mu.Unlock()
	if session != nil {
		if !session.finished() {
			sessions = 1
			if session.writer != nil {
				writers = 1
			}
		}
		if counter, ok := session.backend.(interface{ ResourceCount() int }); ok {
			backendLeases = counter.ResourceCount()
		}
	}
	return
}

func (r *RecorderRuntime) Close() {
	if r == nil || !r.closing.CompareAndSwap(false, true) {
		return
	}
	r.mu.Lock()
	session := r.session
	r.mu.Unlock()
	if session != nil && !session.finished() {
		session.finishAsync(recorderError(RecorderCanceled, "Recorder", "execution teardown stopped the recording", nil))
	}
	// Teardown runs on the Goja owner. Queued Promise callbacks are discarded
	// with the Runtime, so they are no longer counted as retained resources.
	r.pending = 0
}

func (r *RecorderRuntime) Wait() {
	if r == nil {
		return
	}
	r.mu.Lock()
	session := r.session
	r.mu.Unlock()
	if session != nil {
		<-session.done
	}
	r.wg.Wait()
}

func recorderJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	return recorderJSErrorWithPartial(runtimeValue, err, nil)
}

func recorderJSErrorWithPartial(runtimeValue *goja.Runtime, err error, partial any) *goja.Object {
	message := "Recorder operation failed"
	code := RecorderStorageFailed
	operation := "Recorder"
	if err != nil {
		message = err.Error()
	}
	var typed *RecorderError
	if errors.As(err, &typed) {
		code, operation, message = typed.Code, typed.Operation, typed.Message
	}
	object := runtimeValue.NewGoError(errors.New(message))
	_ = object.Set("name", "RecorderError")
	_ = object.Set("code", string(code))
	_ = object.Set("operation", operation)
	if partial != nil {
		_ = object.Set("partial", partial)
	}
	return object
}

func recorderValidatePoint(x, y int, displays []DisplayInfo) (bool, string) {
	for _, display := range displays {
		if display.Width <= 0 || display.Height <= 0 {
			continue
		}
		if x >= display.X && x < display.X+display.Width && y >= display.Y && y < display.Y+display.Height {
			return true, display.ID
		}
	}
	return false, ""
}

func recorderModifiers(mask uint16) []string {
	modifiers := make([]string, 0, 8)
	values := []struct {
		bit  uint16
		name string
	}{
		{1 << 0, "shift-left"}, {1 << 1, "control-left"}, {1 << 2, "meta-left"}, {1 << 3, "alt-left"},
		{1 << 4, "shift-right"}, {1 << 5, "control-right"}, {1 << 6, "meta-right"}, {1 << 7, "alt-right"},
		{1 << 13, "num-lock"}, {1 << 14, "caps-lock"}, {1 << 15, "scroll-lock"},
	}
	for _, value := range values {
		if mask&value.bit != 0 {
			modifiers = append(modifiers, value.name)
		}
	}
	return modifiers
}

func recorderButtonName(button uint16) string {
	switch button {
	case 1:
		return "left"
	case 2:
		return "right"
	case 3:
		return "middle"
	case 4:
		return "button4"
	case 5:
		return "button5"
	default:
		return "none"
	}
}

const (
	recorderEventHookEnabled   uint16 = 1
	recorderEventHookDisabled  uint16 = 2
	recorderEventKeyTyped      uint16 = 3
	recorderEventKeyPressed    uint16 = 4
	recorderEventKeyReleased   uint16 = 5
	recorderEventMouseClicked  uint16 = 6
	recorderEventMousePressed  uint16 = 7
	recorderEventMouseReleased uint16 = 8
	recorderEventMouseMoved    uint16 = 9
	recorderEventMouseDragged  uint16 = 10
	recorderEventMouseWheel    uint16 = 11
)

func recorderEventName(eventType uint16) string {
	switch eventType {
	case recorderEventHookEnabled:
		return "HOOK_ENABLED"
	case recorderEventHookDisabled:
		return "HOOK_DISABLED"
	case recorderEventKeyTyped:
		return "KEY_TYPED"
	case recorderEventKeyPressed:
		return "KEY_PRESSED"
	case recorderEventKeyReleased:
		return "KEY_RELEASED"
	case recorderEventMouseClicked:
		return "MOUSE_CLICKED"
	case recorderEventMousePressed:
		return "MOUSE_PRESSED"
	case recorderEventMouseReleased:
		return "MOUSE_RELEASED"
	case recorderEventMouseMoved:
		return "MOUSE_MOVED"
	case recorderEventMouseDragged:
		return "MOUSE_DRAGGED"
	case recorderEventMouseWheel:
		return "MOUSE_WHEEL"
	default:
		return fmt.Sprintf("UNKNOWN_%d", eventType)
	}
}

func recorderIsKeyboardEvent(eventType uint16) bool {
	return eventType >= recorderEventKeyTyped && eventType <= recorderEventKeyReleased
}
func recorderIsMouseEvent(eventType uint16) bool {
	return eventType >= recorderEventMouseClicked && eventType <= recorderEventMouseWheel
}

func recorderNativeClock() string {
	switch runtime.GOOS {
	case "darwin":
		return "cg-event-timestamp"
	case "windows":
		return "system-uptime"
	case "linux":
		return "x11-server-time"
	default:
		return "backend-monotonic"
	}
}

func recorderNativeUnit() string {
	if runtime.GOOS == "darwin" {
		return "nanoseconds"
	}
	return "milliseconds"
}
