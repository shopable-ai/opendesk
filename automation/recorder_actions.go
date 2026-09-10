package automation

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/dop251/goja"
)

const (
	recorderActionsFormatVersion                        = "opendesk.recorder.actions/v2"
	recorderCandidateFormatVersion                      = "opendesk.recorder.basic-candidate/v4"
	recorderMaxRawBytes                                 = 16 * 1024 * 1024
	recorderMaxActionsBytes                             = 8 * 1024 * 1024
	recorderMaxRawEvents                                = 100000
	recorderMaxRawLineBytes                             = 256 * 1024
	recorderMaxActions                                  = 10000
	recorderMaxTextActionRunes                          = 4096
	recorderDefaultMinimumDelayMS                       = uint64(500)
	recorderDefaultMaximumDelayMS                       = uint64(30000)
	recorderMaximumTimingDelayMS                        = uint64(1800000)
	recorderMinimumSpeedMultiplier                      = 0.1
	recorderMaximumSpeedMultiplier                      = 100.0
	recorderDefaultPointerMotion                        = "instant"
	recorderSmoothPointerMotion                         = "smooth"
	recorderSmoothPointerMotionSteps                    = 60
	recorderClickJitterPixels                           = 4
	recorderDragLineTolerancePixels                     = 8
	recorderTextSelectionDragMaximumLineTolerancePixels = 16
	recorderTextSelectionDragLineToleranceRatio         = 0.08
	recorderTextSelectionDragMaximumPathRatio           = 1.08
	recorderMaximumDragDurationMS                       = uint64(30000)
	recorderMaximumDragSteps                            = 100
	recorderClickedBasis                                = "libuiohook CLICKED associated with PRESSED and RELEASED"
	recorderJitterClickBasis                            = "libuiohook press/release with bounded drag jitter and no CLICKED event"
	recorderDragBasis                                   = "libuiohook left press/motion/release straight drag"
	recorderTextSelectionDragBasis                      = "libuiohook left press/motion/release natural near-linear text selection"
	recorderWheelBasis                                  = "libuiohook contiguous same-axis wheel burst"
	recorderWheelBurstGapMS                             = uint64(250)
	recorderMaximumWheelSteps                           = 100
	recorderMaximumKeyRepeatCount                       = 100
	recorderTextEditBasis                               = "verified focused editable value transition associated with keyboard events"
	recorderShortcutBasis                               = "libuiohook physical modifier chord press/release"
	recorderSpecialKeyBasis                             = "libuiohook physical special-key press/release"
	recorderInitialRevisionReason                       = "initial deterministic build from fixed raw bytes"
	recorderRebuildRevisionReason                       = "prior actions revision had different bytes; rebuilt from fixed raw without overwriting it"
	recorderRevisionBasis                               = "Recorder.buildActions/opendesk.recorder.actions-v2"
)

var recorderIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

type recorderRawReference struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type recorderActionEnvironment struct {
	Platform        string                  `json:"platform"`
	CoordinateSpace string                  `json:"coordinateSpace"`
	Within          recorderWithin          `json:"within"`
	InitialWindow   *recorderWindowSnapshot `json:"initialWindow,omitempty"`
}

type recorderActionSource struct {
	EventIDs []string `json:"eventIds"`
	Basis    string   `json:"basis"`
}

type recorderActionTiming struct {
	SequenceStart string `json:"sequenceStart"`
	SequenceEnd   string `json:"sequenceEnd"`
	NativeStart   string `json:"nativeStart"`
	NativeEnd     string `json:"nativeEnd"`
	NativeUnit    string `json:"nativeUnit"`
}

type recorderActionPosition struct {
	X          int                      `json:"x"`
	Y          int                      `json:"y"`
	Space      string                   `json:"space"`
	DisplayRef string                   `json:"displayRef"`
	Verified   bool                     `json:"verified"`
	Window     *recorderWindowPosition  `json:"window,omitempty"`
	Display    *recorderDisplayPosition `json:"display,omitempty"`
}

type recorderWindowPosition struct {
	Anchor   string  `json:"anchor"`
	OffsetX  int     `json:"offsetX"`
	OffsetY  int     `json:"offsetY"`
	XRatio   float64 `json:"xRatio"`
	YRatio   float64 `json:"yRatio"`
	Space    string  `json:"space"`
	Verified bool    `json:"verified"`
}

type recorderDisplayPosition struct {
	Anchor   string  `json:"anchor"`
	OffsetX  int     `json:"offsetX"`
	OffsetY  int     `json:"offsetY"`
	XRatio   float64 `json:"xRatio"`
	YRatio   float64 `json:"yRatio"`
	Space    string  `json:"space"`
	Verified bool    `json:"verified"`
}

type recorderActionTarget struct {
	Kind           string                     `json:"kind"`
	Resolution     string                     `json:"resolution"`
	Window         *recorderWindowSnapshot    `json:"window,omitempty"`
	Display        *DisplayInfo               `json:"display,omitempty"`
	SemanticStatus string                     `json:"semanticStatus"`
	SemanticReason string                     `json:"semanticReason,omitempty"`
	Element        *recorderElementSnapshot   `json:"element,omitempty"`
	Editable       *recorderElementDescriptor `json:"editable,omitempty"`
	Pointer        *recorderPointerEvidence   `json:"pointer,omitempty"`
}

type recorderPointerEndpointEvidence struct {
	EventID        string                   `json:"eventId"`
	Phase          string                   `json:"phase"`
	Status         string                   `json:"status"`
	Reason         string                   `json:"reason,omitempty"`
	Window         *recorderWindowSnapshot  `json:"window,omitempty"`
	SemanticStatus string                   `json:"semanticStatus"`
	SemanticReason string                   `json:"semanticReason,omitempty"`
	Element        *recorderElementSnapshot `json:"element,omitempty"`
}

type recorderPointerEvidence struct {
	Classification string                           `json:"classification"`
	Press          *recorderPointerEndpointEvidence `json:"press,omitempty"`
	Release        *recorderPointerEndpointEvidence `json:"release"`
}

type recorderActionArguments struct {
	Button        string                       `json:"button,omitempty"`
	ClickCount    int                          `json:"clickCount,omitempty"`
	DeltaX        int                          `json:"deltaX,omitempty"`
	DeltaY        int                          `json:"deltaY,omitempty"`
	Steps         int                          `json:"steps,omitempty"`
	DelayMS       int                          `json:"delayMs,omitempty"`
	Text          string                       `json:"text,omitempty"`
	EditSemantics string                       `json:"editSemantics,omitempty"`
	Key           string                       `json:"key,omitempty"`
	Keys          []string                     `json:"keys,omitempty"`
	RepeatCount   int                          `json:"repeatCount,omitempty"`
	TextEdit      *recorderTextActionArguments `json:"textEdit,omitempty"`
}

type recorderTextActionArguments struct {
	Before recorderTextFingerprint `json:"before"`
	Patch  recorderTextPatch       `json:"patch"`
	After  recorderTextFingerprint `json:"after"`
}

type recorderActionReview struct {
	Required bool   `json:"required"`
	Status   string `json:"status"`
}

type recorderAction struct {
	ID          string                  `json:"id"`
	Kind        string                  `json:"kind"`
	Source      recorderActionSource    `json:"source"`
	Timing      recorderActionTiming    `json:"timing"`
	Position    *recorderActionPosition `json:"position"`
	Destination *recorderActionPosition `json:"destination,omitempty"`
	Target      *recorderActionTarget   `json:"target,omitempty"`
	Args        recorderActionArguments `json:"args"`
	Strategy    string                  `json:"strategy"`
	Review      recorderActionReview    `json:"review"`
}

type recorderEventDisposition struct {
	EventID     string `json:"eventId"`
	Disposition string `json:"disposition"`
	ActionID    string `json:"actionId,omitempty"`
	Reason      string `json:"reason"`
}

type recorderActions struct {
	FormatVersion    string                     `json:"formatVersion"`
	RecordingID      string                     `json:"recordingId"`
	Revision         int                        `json:"revision"`
	RevisionReason   string                     `json:"revisionReason"`
	RevisionBasis    string                     `json:"revisionBasis"`
	CreatedAt        string                     `json:"createdAt"`
	Raw              recorderRawReference       `json:"raw"`
	Environment      recorderActionEnvironment  `json:"environment"`
	Actions          []recorderAction           `json:"actions"`
	EventDisposition []recorderEventDisposition `json:"eventDisposition"`
	Readiness        string                     `json:"readiness"`
	Issues           []recorderIssue            `json:"issues"`
}

type recorderActionsResult struct {
	ActionsFile string
	Revision    int
	ActionCount int
	Readiness   string
	Issues      []recorderIssue
}

func (r recorderActionsResult) jsValue() map[string]any {
	return map[string]any{
		"actionsFile": r.ActionsFile, "revision": r.Revision,
		"actionCount": r.ActionCount, "readiness": r.Readiness,
		"issues": issuesToAny(r.Issues),
	}
}

type recorderCandidateActionsRef struct {
	File     string `json:"file"`
	SHA256   string `json:"sha256"`
	Revision int    `json:"revision"`
}

type recorderCandidateScriptRef struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
}

type recorderCandidateMapping struct {
	ActionID string `json:"actionId"`
	Line     int    `json:"line"`
}

type recorderGenerationTiming struct {
	MinimumDelayMS  uint64  `json:"minimumDelayMs"`
	MaximumDelayMS  uint64  `json:"maximumDelayMs"`
	SpeedMultiplier float64 `json:"speedMultiplier"`
}

func recorderDefaultGenerationTiming() recorderGenerationTiming {
	return recorderGenerationTiming{
		MinimumDelayMS:  recorderDefaultMinimumDelayMS,
		MaximumDelayMS:  recorderDefaultMaximumDelayMS,
		SpeedMultiplier: 1,
	}
}

func (t recorderGenerationTiming) jsValue() map[string]any {
	return map[string]any{
		"minimumDelayMs": t.MinimumDelayMS, "maximumDelayMs": t.MaximumDelayMS,
		"speedMultiplier": t.SpeedMultiplier,
	}
}

type recorderCandidate struct {
	FormatVersion string                      `json:"formatVersion"`
	RecordingID   string                      `json:"recordingId"`
	CreatedAt     string                      `json:"createdAt"`
	Mode          string                      `json:"mode"`
	Actions       recorderCandidateActionsRef `json:"actions"`
	Script        recorderCandidateScriptRef  `json:"script"`
	Timing        recorderGenerationTiming    `json:"timing"`
	PointerMotion string                      `json:"pointerMotion"`
	Constraints   []string                    `json:"constraints"`
	Mappings      []recorderCandidateMapping  `json:"mappings"`
	Verification  string                      `json:"verification"`
}

type recorderScriptResult struct {
	ScriptFile    string
	CandidateFile string
	ActionsSHA256 string
	ScriptSHA256  string
	Constraints   []string
	Verification  string
	Timing        recorderGenerationTiming
	PointerMotion string
}

func (r recorderScriptResult) jsValue() map[string]any {
	return map[string]any{
		"scriptFile": r.ScriptFile, "candidateFile": r.CandidateFile,
		"actionsSha256": r.ActionsSHA256, "scriptSha256": r.ScriptSHA256,
		"constraints": append([]string(nil), r.Constraints...), "verification": r.Verification,
		"timing": r.Timing.jsValue(), "pointerMotion": r.PointerMotion,
	}
}

func (r *RecorderRuntime) buildActions(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := r.runtime.NewPromise()
	promiseValue := r.runtime.ToValue(promise)
	defer func() {
		if recover() != nil {
			_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "Recorder.buildActions", "could not read recordingDir", nil)))
			value = promiseValue
		}
	}()
	path, err := recorderRequiredString(call, 0, "Recorder.buildActions", "recordingDir")
	if err == nil {
		err = recorderNoExtraArguments(call, 1, "Recorder.buildActions")
	}
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return promiseValue
	}
	if r.loop == nil || r.closing.Load() {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCanceled, "Recorder.buildActions", "Recorder Runtime is unavailable", nil)))
		return promiseValue
	}
	r.pending++
	r.startWorker(func() (any, error) { return r.buildActionsFile(path) }, func(result any, err error) {
		r.pending--
		if err != nil {
			_ = reject(recorderJSError(r.runtime, err))
			return
		}
		_ = resolve(result.(recorderActionsResult).jsValue())
	})
	return promiseValue
}

func (r *RecorderRuntime) generateScript(call goja.FunctionCall) (value goja.Value) {
	promise, resolve, reject := r.runtime.NewPromise()
	promiseValue := r.runtime.ToValue(promise)
	defer func() {
		if recover() != nil {
			_ = reject(recorderJSError(r.runtime, recorderError(RecorderInvalidArgument, "Recorder.generateScript", "could not read arguments", nil)))
			value = promiseValue
		}
	}()
	actionsFile, err := recorderRequiredString(call, 0, "Recorder.generateScript", "actionsFile")
	mode, outputFile, pointerMotion := "basic", "", recorderDefaultPointerMotion
	timing := recorderDefaultGenerationTiming()
	if err == nil && len(call.Arguments) > 1 && !goja.IsUndefined(call.Argument(1)) && !goja.IsNull(call.Argument(1)) {
		object := call.Argument(1).ToObject(r.runtime)
		if object == nil || object.ClassName() != "Object" {
			err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options must be an object", nil)
		} else if unknownErr := recorderRejectUnknownKeys(object, map[string]bool{"mode": true, "outputFile": true, "timing": true, "pointerMotion": true}); unknownErr != nil {
			err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", unknownErr.Error(), nil)
		} else {
			if item := recorderObjectOption(object, "mode"); !goja.IsUndefined(item) {
				text, ok := item.Export().(string)
				if !ok {
					err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options.mode must be a string", nil)
				} else {
					mode = strings.TrimSpace(text)
				}
			}
			if err == nil {
				if item := recorderObjectOption(object, "outputFile"); !goja.IsUndefined(item) {
					text, ok := item.Export().(string)
					if !ok {
						err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options.outputFile must be a string", nil)
					} else {
						outputFile = strings.TrimSpace(text)
					}
				}
			}
			if err == nil {
				if item := recorderObjectOption(object, "timing"); !goja.IsUndefined(item) {
					timing, err = r.parseGenerationTiming(item)
				}
			}
			if err == nil {
				if item := recorderObjectOption(object, "pointerMotion"); !goja.IsUndefined(item) {
					text, ok := item.Export().(string)
					if !ok {
						err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options.pointerMotion must be a string", nil)
					} else {
						pointerMotion = strings.TrimSpace(text)
					}
				}
			}
		}
	}
	if err == nil {
		err = recorderNoExtraArguments(call, 2, "Recorder.generateScript")
	}
	if err == nil && mode != "basic" {
		err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "mode must be \"basic\"", nil)
	}
	if err == nil && pointerMotion != recorderDefaultPointerMotion && pointerMotion != recorderSmoothPointerMotion {
		err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options.pointerMotion must be \"instant\" or \"smooth\"", nil)
	}
	if err != nil {
		_ = reject(recorderJSError(r.runtime, err))
		return promiseValue
	}
	if r.loop == nil || r.closing.Load() {
		_ = reject(recorderJSError(r.runtime, recorderError(RecorderCanceled, "Recorder.generateScript", "Recorder Runtime is unavailable", nil)))
		return promiseValue
	}
	r.pending++
	r.startWorker(func() (any, error) { return r.generateBasicScript(actionsFile, outputFile, timing, pointerMotion) }, func(result any, err error) {
		r.pending--
		if err != nil {
			_ = reject(recorderJSError(r.runtime, err))
			return
		}
		_ = resolve(result.(recorderScriptResult).jsValue())
	})
	return promiseValue
}

func (r *RecorderRuntime) parseGenerationTiming(value goja.Value) (recorderGenerationTiming, error) {
	const operation = "Recorder.generateScript"
	timing := recorderDefaultGenerationTiming()
	if goja.IsNull(value) {
		return timing, recorderError(RecorderInvalidArgument, operation, "options.timing must be an object", nil)
	}
	object := value.ToObject(r.runtime)
	if object == nil || object.ClassName() != "Object" {
		return timing, recorderError(RecorderInvalidArgument, operation, "options.timing must be an object", nil)
	}
	if err := recorderRejectUnknownKeys(object, map[string]bool{"minimumDelayMs": true, "maximumDelayMs": true, "speedMultiplier": true}); err != nil {
		return timing, recorderError(RecorderInvalidArgument, operation, "options.timing "+err.Error(), nil)
	}
	if item := recorderObjectOption(object, "minimumDelayMs"); !goja.IsUndefined(item) {
		number, ok := recorderJSNumber(item)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > float64(recorderMaximumTimingDelayMS) || math.Trunc(number) != number {
			return timing, recorderError(RecorderInvalidArgument, operation, "options.timing.minimumDelayMs must be an integer from 0 through 1800000", nil)
		}
		timing.MinimumDelayMS = uint64(number)
	}
	if item := recorderObjectOption(object, "maximumDelayMs"); !goja.IsUndefined(item) {
		number, ok := recorderJSNumber(item)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > float64(recorderMaximumTimingDelayMS) || math.Trunc(number) != number {
			return timing, recorderError(RecorderInvalidArgument, operation, "options.timing.maximumDelayMs must be an integer from 0 through 1800000", nil)
		}
		timing.MaximumDelayMS = uint64(number)
	}
	if item := recorderObjectOption(object, "speedMultiplier"); !goja.IsUndefined(item) {
		number, ok := recorderJSNumber(item)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < recorderMinimumSpeedMultiplier || number > recorderMaximumSpeedMultiplier {
			return timing, recorderError(RecorderInvalidArgument, operation, "options.timing.speedMultiplier must be a finite number from 0.1 through 100", nil)
		}
		timing.SpeedMultiplier = number
	}
	if timing.MinimumDelayMS > timing.MaximumDelayMS {
		return timing, recorderError(RecorderInvalidArgument, operation, "options.timing.minimumDelayMs must not exceed maximumDelayMs", nil)
	}
	return timing, nil
}

func recorderRequiredString(call goja.FunctionCall, index int, operation, name string) (string, error) {
	if len(call.Arguments) <= index || goja.IsUndefined(call.Argument(index)) || goja.IsNull(call.Argument(index)) {
		return "", recorderError(RecorderInvalidArgument, operation, name+" is required", nil)
	}
	exported := call.Argument(index).Export()
	value, ok := exported.(string)
	if !ok || strings.TrimSpace(value) == "" || len(value) > 4096 {
		return "", recorderError(RecorderInvalidArgument, operation, name+" must be a non-empty path string", nil)
	}
	return value, nil
}

func recorderNoExtraArguments(call goja.FunctionCall, expected int, operation string) error {
	for index := expected; index < len(call.Arguments); index++ {
		if !goja.IsUndefined(call.Argument(index)) {
			return recorderError(RecorderInvalidArgument, operation, "too many arguments", nil)
		}
	}
	return nil
}

func (r *RecorderRuntime) buildActionsFile(input string) (recorderActionsResult, error) {
	const operation = "Recorder.buildActions"
	recordingDir, err := r.resolveRecordingDir(input, operation)
	if err != nil {
		return recorderActionsResult{}, err
	}
	manifestBytes, err := recorderReadRegular(filepath.Join(recordingDir, "manifest.json"), recorderMaxActionsBytes)
	if err != nil {
		return recorderActionsResult{}, recorderWrapFileError(operation, "manifest.json", err)
	}
	var manifest recorderManifest
	if err := recorderDecodeStrict(manifestBytes, &manifest); err != nil {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "manifest.json does not match the Recorder recording schema", err)
	}
	if (manifest.FormatVersion != recorderRecordingFormatVersion && manifest.FormatVersion != recorderLegacyRecordingFormatVersion) || manifest.RecordingID == "" || manifest.RecordingID != filepath.Base(recordingDir) {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "manifest recording identity or version is invalid", nil)
	}
	terminal, err := recorderValidateManifestStructure(manifest)
	if err != nil {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "manifest.json contains invalid recording facts", err)
	}
	if manifest.Storage.RawFile != filepath.ToSlash(filepath.Join("raw", "events.ndjson")) && manifest.Storage.RawFile != filepath.Join("raw", "events.ndjson") {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "manifest rawFile must be raw/events.ndjson", nil)
	}
	rawPath := filepath.Join(recordingDir, "raw", "events.ndjson")
	rawBytes, err := recorderReadRegular(rawPath, recorderMaxRawBytes)
	if err != nil {
		return recorderActionsResult{}, recorderWrapFileError(operation, "raw/events.ndjson", err)
	}
	rawHash := recorderSHA256(rawBytes)
	events, parseIssues, err := recorderParseRawEvents(rawBytes, !terminal || manifest.Storage.State != "saved")
	if err != nil {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "raw/events.ndjson is invalid", err)
	}
	actions := recorderActions{
		FormatVersion: recorderActionsFormatVersion, RecordingID: manifest.RecordingID,
		CreatedAt:   manifest.StoppedAt,
		Raw:         recorderRawReference{File: filepath.ToSlash(filepath.Join("raw", "events.ndjson")), SHA256: rawHash, Bytes: int64(len(rawBytes))},
		Environment: recorderActionEnvironment{Platform: manifest.Capture.Platform, CoordinateSpace: manifest.Capture.CoordinateSpace, Within: manifest.Within, InitialWindow: manifest.InitialWindow},
		Actions:     []recorderAction{}, EventDisposition: []recorderEventDisposition{}, Issues: append(make([]recorderIssue, 0), parseIssues...),
	}
	if err := recorderValidateManifestRawFacts(manifest, rawBytes, events, terminal); err != nil {
		return recorderActionsResult{}, recorderError(RecorderInvalidRecording, operation, "manifest and raw recording facts disagree", err)
	}
	if actions.CreatedAt == "" {
		actions.CreatedAt = manifest.StartedAt
	}
	if !terminal {
		actions.Issues = appendIssue(actions.Issues, recorderIssue{Code: "terminal-manifest-missing", Severity: "error", Message: "the recording has no terminal manifest; only its validated raw prefix was recovered"})
	}
	if (manifest.State != "stopped" && !recorderManifestFailureAllowsPartial(manifest)) || manifest.Storage.State != "saved" {
		actions.Issues = appendIssue(actions.Issues, recorderIssue{Code: "recording-incomplete", Severity: "error", Message: "the recording did not finish with stopped capture and saved storage"})
	}
	if manifest.Storage.RawSHA256 != "" && manifest.Storage.RawSHA256 != rawHash {
		actions.Issues = appendIssue(actions.Issues, recorderIssue{Code: "raw-hash-mismatch", Severity: "error", Message: "raw bytes do not match the terminal manifest hash"})
	}
	if manifest.Counts.Dropped > 0 || manifest.Counts.Accepted != manifest.Counts.Persisted {
		actions.Issues = appendIssue(actions.Issues, recorderIssue{Code: "recording-loss", Severity: "error", Message: "the terminal manifest reports dropped or unpersisted accepted events"})
	}
	for _, issue := range manifest.Issues {
		if issue.Severity == "error" {
			actions.Issues = appendIssue(actions.Issues, issue)
		}
	}
	produced, dispositions, issues := recorderBuildActionListWithContexts(events, manifest.TextEdits, manifest.InputContexts)
	produced, contextIssues := recorderEnrichActionsWithWindowContext(produced, manifest, events)
	actions.Issues = appendIssues(actions.Issues, issues)
	actions.Issues = appendIssues(actions.Issues, contextIssues)
	produced, dispositions, actions.Issues = recorderFinalizePartialActions(produced, dispositions, actions.Issues)
	actions.Actions = produced
	actions.EventDisposition = dispositions
	actions.Readiness = recorderReadiness(actions.Issues)
	file, revision, err := recorderSaveActionsRevision(recordingDir, &actions)
	if err != nil {
		return recorderActionsResult{}, recorderError(RecorderStorageFailed, operation, "could not save actions revision", err)
	}
	return recorderActionsResult{ActionsFile: file, Revision: revision, ActionCount: len(actions.Actions), Readiness: actions.Readiness, Issues: actions.Issues}, nil
}

func recorderParseRawEvents(payload []byte, allowDamagedTail bool) ([]recorderRawEvent, []recorderIssue, error) {
	lines := bytes.Split(payload, []byte{'\n'})
	terminated := len(payload) == 0 || payload[len(payload)-1] == '\n'
	if terminated && len(lines) > 0 && len(lines[len(lines)-1]) == 0 {
		lines = lines[:len(lines)-1]
	}
	events := make([]recorderRawEvent, 0)
	issues := make([]recorderIssue, 0)
	var previous uint64
	var nativeClock, nativeUnit string
	seen := map[string]bool{}
	for index, source := range lines {
		if len(events) >= recorderMaxRawEvents {
			return nil, nil, fmt.Errorf("event count exceeds %d", recorderMaxRawEvents)
		}
		line := append([]byte(nil), source...)
		if len(line) > recorderMaxRawLineBytes {
			return nil, nil, fmt.Errorf("event line %d exceeds %d bytes", index+1, recorderMaxRawLineBytes)
		}
		if len(bytes.TrimSpace(line)) == 0 {
			return nil, nil, fmt.Errorf("blank NDJSON line")
		}
		var event recorderRawEvent
		if err := recorderDecodeStrict(line, &event); err != nil {
			if allowDamagedTail && index == len(lines)-1 && !terminated {
				issues = append(issues, recorderIssue{Code: "raw-tail-damaged", Severity: "error", Message: "the final unterminated raw line was damaged and excluded; only the validated prefix was recovered"})
				break
			}
			return nil, nil, fmt.Errorf("event %d: %w", len(events)+1, err)
		}
		if event.FormatVersion != recorderRawEventFormatVersion && event.FormatVersion != recorderLegacyRawEventFormatVersion {
			return nil, nil, fmt.Errorf("event %d has unsupported formatVersion", len(events)+1)
		}
		if !recorderIDPattern.MatchString(event.EventID) {
			return nil, nil, fmt.Errorf("event %d has invalid eventId", len(events)+1)
		}
		if seen[event.EventID] {
			return nil, nil, fmt.Errorf("duplicate eventId %q", event.EventID)
		}
		seen[event.EventID] = true
		sequence, err := strconv.ParseUint(event.Sequence, 10, 64)
		if err != nil || sequence == 0 {
			return nil, nil, fmt.Errorf("event %s has invalid sequence", event.EventID)
		}
		if len(events) > 0 && sequence <= previous {
			return nil, nil, fmt.Errorf("event %s reverses source sequence order", event.EventID)
		}
		previous = sequence
		if _, err := strconv.ParseUint(event.NativeTime, 10, 64); err != nil {
			return nil, nil, fmt.Errorf("event %s has invalid nativeTime", event.EventID)
		}
		if _, err := time.Parse(time.RFC3339Nano, event.ReceivedAt); err != nil {
			return nil, nil, fmt.Errorf("event %s has invalid receivedAt", event.EventID)
		}
		if event.LibraryEvent == "" || event.ReceivedAt == "" || event.NativeClock == "" || (event.NativeUnit != "milliseconds" && event.NativeUnit != "nanoseconds") || event.Source == "" || event.ScopeRef == "" {
			return nil, nil, fmt.Errorf("event %s is missing required provenance", event.EventID)
		}
		if len(events) == 0 {
			nativeClock, nativeUnit = event.NativeClock, event.NativeUnit
		} else if event.NativeClock != nativeClock || event.NativeUnit != nativeUnit {
			return nil, nil, fmt.Errorf("event %s changes native clock or unit", event.EventID)
		}
		if event.LibraryEvent == "MOUSE_CLICKED" || event.LibraryEvent == "MOUSE_PRESSED" || event.LibraryEvent == "MOUSE_RELEASED" || event.LibraryEvent == "MOUSE_MOVED" || event.LibraryEvent == "MOUSE_DRAGGED" || event.LibraryEvent == "MOUSE_WHEEL" {
			if event.X == nil || event.Y == nil || event.CoordinateSpace == "" {
				return nil, nil, fmt.Errorf("mouse event %s is missing coordinates", event.EventID)
			}
		}
		events = append(events, event)
	}
	if len(events) == 0 {
		issues = append(issues, recorderIssue{Code: "no-events", Severity: "warning", Message: "the recording contains no accepted input events"})
	}
	return events, issues, nil
}

func recorderValidateManifestStructure(manifest recorderManifest) (bool, error) {
	legacy := manifest.FormatVersion == recorderLegacyRecordingFormatVersion
	if !legacy && manifest.FormatVersion != recorderRecordingFormatVersion {
		return false, fmt.Errorf("recording format version is invalid")
	}
	if manifest.Within.ProcessID == 0 || strings.TrimSpace(manifest.Within.Title) == "" || len(manifest.Within.Title) > 512 {
		return false, fmt.Errorf("within is incomplete")
	}
	if _, err := time.Parse(time.RFC3339Nano, manifest.StartedAt); err != nil {
		return false, fmt.Errorf("startedAt is invalid")
	}
	terminal := false
	switch manifest.State {
	case "starting", "recording":
		if manifest.StoppedAt != "" {
			return false, fmt.Errorf("active state must not contain stoppedAt")
		}
	case "stopped", "failed", "partial":
		if _, err := time.Parse(time.RFC3339Nano, manifest.StoppedAt); err != nil {
			return false, fmt.Errorf("terminal state has invalid stoppedAt")
		}
		terminal = true
	default:
		return false, fmt.Errorf("state is invalid")
	}
	if manifest.Capture.Library != recorderLibraryName || manifest.Capture.LibraryVersion != recorderLibraryVersion || manifest.Capture.LibraryCommit != recorderLibraryCommit {
		return false, fmt.Errorf("capture library provenance is invalid")
	}
	if manifest.Capture.Platform != "darwin" && manifest.Capture.Platform != "windows" && manifest.Capture.Platform != "linux" {
		return false, fmt.Errorf("capture platform is invalid")
	}
	if strings.TrimSpace(manifest.Capture.Backend) == "" || len(manifest.Capture.Backend) > 256 || manifest.Capture.CoordinateSpace != "screen-logical" || (manifest.Capture.Evidence != "none" && manifest.Capture.Evidence != "target-semantics") {
		return false, fmt.Errorf("capture backend, coordinate space, or evidence mode is invalid")
	}
	switch manifest.Capture.Permission {
	case "authorized", "denied", "not-required", "unsupported", "unknown":
	default:
		return false, fmt.Errorf("capture permission is invalid")
	}
	if manifest.Capture.CaptureKeyboard {
		if manifest.Capture.KeyboardContent != "non-sensitive-test" {
			return false, fmt.Errorf("keyboard capture has no non-sensitive declaration")
		}
	} else if manifest.Capture.KeyboardContent != "" {
		return false, fmt.Errorf("keyboardContent is present while keyboard capture is disabled")
	}
	if len(manifest.Capture.ControlKeycodes) > 16 {
		return false, fmt.Errorf("control keycode limit is exceeded")
	}
	seenControl := map[uint16]bool{}
	for _, keycode := range manifest.Capture.ControlKeycodes {
		if seenControl[keycode] {
			return false, fmt.Errorf("control keycodes contain a duplicate")
		}
		seenControl[keycode] = true
	}
	if manifest.Queue.Capacity != recorderQueueCapacity {
		return false, fmt.Errorf("queue capacity is invalid")
	}
	if legacy {
		if manifest.Queue.MoveSampleInterval != "50ms" {
			return false, fmt.Errorf("legacy pointer sampling policy is invalid")
		}
	} else {
		if manifest.Capture.PointerMotionPolicy != recorderPointerMotionPolicy || manifest.Queue.ContextCapacity != recorderContextQueueCapacity || manifest.Queue.MoveSampleInterval != "" {
			return false, fmt.Errorf("pointer/context capture policy is invalid")
		}
		if manifest.InitialWindow != nil {
			if err := recorderValidateWindowSnapshot(manifest.InitialWindow); err != nil {
				return false, fmt.Errorf("initial window snapshot is invalid: %w", err)
			}
		}
	}
	switch manifest.Storage.State {
	case "open":
		if terminal {
			return false, fmt.Errorf("terminal recording still has open storage")
		}
	case "saved", "partial", "failed":
		if !terminal {
			return false, fmt.Errorf("active recording has terminal storage state")
		}
	default:
		return false, fmt.Errorf("storage state is invalid")
	}
	if manifest.Storage.ManifestFile != "manifest.json" {
		return false, fmt.Errorf("manifestFile is invalid")
	}
	if len(manifest.Displays) == 0 {
		return false, fmt.Errorf("display provenance is missing")
	}
	seenDisplays := map[string]bool{}
	for _, display := range manifest.Displays {
		if display.Index < 1 || strings.TrimSpace(display.ID) == "" || seenDisplays[display.ID] || display.Width <= 0 || display.Height <= 0 || display.PixelWidth <= 0 || display.PixelHeight <= 0 || math.IsNaN(display.Scale) || math.IsInf(display.Scale, 0) || display.Scale <= 0 {
			return false, fmt.Errorf("display provenance is invalid")
		}
		seenDisplays[display.ID] = true
	}
	for _, issue := range manifest.Issues {
		if !recorderIDPattern.MatchString(issue.Code) || (issue.Severity != "warning" && issue.Severity != "error") || strings.TrimSpace(issue.Message) == "" || len(issue.Message) > 2048 || (issue.EventID != "" && !recorderIDPattern.MatchString(issue.EventID)) {
			return false, fmt.Errorf("manifest issue is invalid")
		}
	}
	return terminal, nil
}

func recorderValidateManifestRawFacts(manifest recorderManifest, raw []byte, events []recorderRawEvent, terminal bool) error {
	if manifest.Storage.RawSHA256 != "" && manifest.Storage.RawSHA256 != recorderSHA256(raw) {
		return fmt.Errorf("raw hash does not match manifest")
	}
	if terminal && manifest.Storage.RawBytes != int64(len(raw)) {
		return fmt.Errorf("raw byte count does not match manifest")
	}
	if manifest.Counts.Persisted != uint64(len(events)) && terminal {
		return fmt.Errorf("persisted count does not match complete raw records")
	}
	if manifest.Counts.Accepted < manifest.Counts.Persisted {
		return fmt.Errorf("accepted count is below persisted count")
	}
	if manifest.Storage.State == "saved" && manifest.Counts.Accepted != manifest.Counts.Persisted {
		return fmt.Errorf("saved storage has unpersisted accepted events")
	}
	if terminal {
		cutoff, err := strconv.ParseUint(manifest.Cutoff.Sequence, 10, 64)
		if err != nil {
			return fmt.Errorf("cutoff sequence is invalid")
		}
		if _, err := time.Parse(time.RFC3339Nano, manifest.Cutoff.Time); err != nil {
			return fmt.Errorf("cutoff time is invalid")
		}
		if manifest.Counts.Observed < manifest.Counts.Late || cutoff != manifest.Counts.Observed-manifest.Counts.Late {
			return fmt.Errorf("cutoff does not match observed and late counts")
		}
		total := manifest.Counts.Accepted + manifest.Counts.Filtered
		if total < manifest.Counts.Accepted {
			return fmt.Errorf("count sum overflows")
		}
		total += manifest.Counts.Paused
		if total < manifest.Counts.Paused {
			return fmt.Errorf("count sum overflows")
		}
		total += manifest.Counts.Dropped
		if total < manifest.Counts.Dropped {
			return fmt.Errorf("count sum overflows")
		}
		total += manifest.Counts.Late
		if total < manifest.Counts.Late || total != manifest.Counts.Observed {
			return fmt.Errorf("observed count does not reconcile")
		}
		if len(events) > 0 && recorderNativeStringValue(events[len(events)-1].Sequence) > cutoff {
			return fmt.Errorf("raw event exceeds the stop cutoff")
		}
	}
	displays := make(map[string]DisplayInfo, len(manifest.Displays))
	for _, display := range manifest.Displays {
		displays[display.ID] = display
	}
	var previousNative uint64
	paused := false
	heldButtons := map[string]bool{}
	eventsByID := make(map[string]recorderRawEvent, len(events))
	for index, event := range events {
		eventsByID[event.EventID] = event
		expectedEventVersion := recorderRawEventFormatVersion
		if manifest.FormatVersion == recorderLegacyRecordingFormatVersion {
			expectedEventVersion = recorderLegacyRawEventFormatVersion
		}
		if event.FormatVersion != expectedEventVersion {
			return fmt.Errorf("raw event version does not match manifest at event %s", event.EventID)
		}
		native := recorderNativeStringValue(event.NativeTime)
		if index > 0 && native < previousNative {
			return fmt.Errorf("native time regresses at event %s", event.EventID)
		}
		previousNative = native
		if !reflect.DeepEqual(event.Modifiers, recorderModifiers(event.ModifierMask)) {
			return fmt.Errorf("modifier names disagree with mask at event %s", event.EventID)
		}
		if event.Source != "unknown" && event.Source != "physical" && event.Source != "injected" && event.Source != "recorder" {
			return fmt.Errorf("input source is invalid at event %s", event.EventID)
		}
		switch event.TextInputSource {
		case "":
		case "keyboard-layout":
			if event.LibraryEvent != "KEY_TYPED" || recorderRawEventHasGap(event, "key-typed-is-not-an-ime-commit") {
				return fmt.Errorf("keyboard-layout text source is inconsistent at event %s", event.EventID)
			}
		case "input-method", "unknown":
			if event.LibraryEvent != "KEY_TYPED" || !recorderRawEventHasGap(event, "key-typed-is-not-an-ime-commit") {
				return fmt.Errorf("unverified text source is inconsistent at event %s", event.EventID)
			}
		default:
			return fmt.Errorf("text input source is invalid at event %s", event.EventID)
		}
		switch event.LibraryEvent {
		case "RECORDER_PAUSED":
			if event.Source != "recorder" || paused {
				return fmt.Errorf("pause boundary is invalid at event %s", event.EventID)
			}
			paused = true
		case "RECORDER_RESUMED":
			if event.Source != "recorder" || !paused {
				return fmt.Errorf("resume boundary is invalid at event %s", event.EventID)
			}
			paused = false
		case "RECORDER_CONTROL_CLICK":
			if event.Source != "recorder" {
				return fmt.Errorf("control-click boundary is invalid at event %s", event.EventID)
			}
			if _, err := recorderControlClickReferences(event); err != nil {
				return fmt.Errorf("control-click boundary is invalid at event %s: %w", event.EventID, err)
			}
		default:
			if event.Source == "recorder" {
				return fmt.Errorf("recorder source is invalid for %s at event %s", event.LibraryEvent, event.EventID)
			}
		}
		if manifest.FormatVersion == recorderRecordingFormatVersion {
			switch event.LibraryEvent {
			case "MOUSE_PRESSED":
				heldButtons[event.Button] = true
			case "MOUSE_MOVED":
				if len(heldButtons) == 0 {
					return fmt.Errorf("ordinary pointer motion violates button-held-only policy at event %s", event.EventID)
				}
			case "MOUSE_RELEASED":
				delete(heldButtons, event.Button)
			case "RECORDER_PAUSED", "RECORDER_RESUMED":
				heldButtons = map[string]bool{}
			}
		}
		if event.X == nil || event.Y == nil {
			continue
		}
		if event.LibraryEvent == "MOUSE_WHEEL" && (event.WheelAmount == nil || event.WheelRotation == nil || event.WheelDirection == nil) {
			return fmt.Errorf("wheel event is missing native delta facts at event %s", event.EventID)
		}
		if *event.X < math.MinInt16 || *event.X > math.MaxInt16 || *event.Y < math.MinInt16 || *event.Y > math.MaxInt16 {
			return fmt.Errorf("coordinate exceeds libuiohook field range at event %s", event.EventID)
		}
		if event.CoordinateVerified {
			display, ok := displays[event.DisplayRef]
			if !ok || *event.X < display.X || *event.X >= display.X+display.Width || *event.Y < display.Y || *event.Y >= display.Y+display.Height {
				return fmt.Errorf("verified coordinate disagrees with display provenance at event %s", event.EventID)
			}
		}
	}
	if err := recorderValidateManifestKeyStatesAtStop(manifest, eventsByID); err != nil {
		return err
	}
	seenContexts := map[string]bool{}
	for _, context := range manifest.InputContexts {
		if !recorderIDPattern.MatchString(context.EventID) || seenContexts[context.EventID] || (context.Kind != "pointer" && context.Kind != "keyboard") || (context.Status != "verified" && context.Status != "unverified") || context.ResolutionDelayMS < 0 {
			return fmt.Errorf("input window context is invalid for event %s", context.EventID)
		}
		seenContexts[context.EventID] = true
		event, ok := eventsByID[context.EventID]
		validPointerPhase := context.Kind != "pointer" ||
			((context.Phase == "" || context.Phase == "released") && event.LibraryEvent == "MOUSE_RELEASED") ||
			(context.Phase == "pressed" && event.LibraryEvent == "MOUSE_PRESSED") ||
			(context.Phase == "wheel" && event.LibraryEvent == "MOUSE_WHEEL")
		validKeyboardPhase := context.Kind != "keyboard" ||
			(context.Phase == "" && event.LibraryEvent == "KEY_TYPED") ||
			(context.Phase == "pressed" && event.LibraryEvent == "KEY_PRESSED")
		if !ok || !validPointerPhase || !validKeyboardPhase {
			return fmt.Errorf("input window context has an invalid event reference %s", context.EventID)
		}
		if context.Status == "verified" {
			if context.Reason != "" || recorderValidateWindowSnapshot(context.Window) != nil || time.Duration(context.ResolutionDelayMS)*time.Millisecond > recorderContextFreshness {
				return fmt.Errorf("verified input window context is incomplete for event %s", context.EventID)
			}
			if context.Kind == "pointer" && (event.X == nil || event.Y == nil || !recorderPointInsideWindow(*event.X, *event.Y, context.Window.Bounds)) {
				return fmt.Errorf("verified pointer context does not contain event %s", context.EventID)
			}
		} else if strings.TrimSpace(context.Reason) == "" {
			return fmt.Errorf("unverified input window context has no reason for event %s", context.EventID)
		}
		if context.Kind == "keyboard" {
			if context.SemanticStatus != "not-applicable" || context.Element != nil {
				return fmt.Errorf("keyboard context contains pointer semantics for event %s", context.EventID)
			}
		} else if context.Phase == "wheel" {
			if context.SemanticStatus != "not-applicable" || context.SemanticReason != "" || context.Element != nil {
				return fmt.Errorf("wheel context contains click semantics for event %s", context.EventID)
			}
		} else {
			switch context.SemanticStatus {
			case "verified":
				if context.SemanticReason != "" || recorderValidateElementSnapshot(context.Element) != nil {
					return fmt.Errorf("verified semantic target is invalid for event %s", context.EventID)
				}
			case "unavailable":
				if context.Element != nil || strings.TrimSpace(context.SemanticReason) == "" {
					return fmt.Errorf("unavailable semantic target has no reason for event %s", context.EventID)
				}
			case "not-applicable":
				if context.Status == "verified" {
					return fmt.Errorf("verified pointer context skipped semantic resolution for event %s", context.EventID)
				}
			case "not-requested":
				if context.Status != "verified" || manifest.Capture.Evidence != "none" || context.Element != nil || context.SemanticReason != "" {
					return fmt.Errorf("not-requested semantic target is inconsistent for event %s", context.EventID)
				}
			default:
				return fmt.Errorf("semantic target status is invalid for event %s", context.EventID)
			}
		}
	}
	if err := recorderValidateManifestTextEdits(manifest, eventsByID); err != nil {
		return err
	}
	return nil
}

func recorderValidateManifestKeyStatesAtStop(manifest recorderManifest, eventsByID map[string]recorderRawEvent) error {
	if len(manifest.KeyStatesAtStop) == 0 {
		return nil
	}
	if manifest.FormatVersion != recorderRecordingFormatVersion || !manifest.Capture.CaptureKeyboard || manifest.Capture.KeyboardContent != "non-sensitive-test" || len(manifest.KeyStatesAtStop) > 256 {
		return fmt.Errorf("stop key-state evidence requires explicit non-sensitive keyboard capture")
	}
	seen := map[string]bool{}
	hasIssue := func(code, eventID string) bool {
		for _, issue := range manifest.Issues {
			if issue.Code == code && issue.EventID == eventID {
				return true
			}
		}
		return false
	}
	for _, state := range manifest.KeyStatesAtStop {
		event, ok := eventsByID[state.PressEventID]
		if !ok || seen[state.PressEventID] || event.LibraryEvent != "KEY_PRESSED" || event.Keycode == nil || event.Rawcode == nil || *event.Keycode != state.Keycode || *event.Rawcode != state.Rawcode {
			return fmt.Errorf("stop key-state evidence has an invalid press reference %s", state.PressEventID)
		}
		seen[state.PressEventID] = true
		if _, err := time.Parse(time.RFC3339Nano, state.ObservedAt); err != nil {
			return fmt.Errorf("stop key-state evidence has an invalid observation time for %s", state.PressEventID)
		}
		for _, candidate := range eventsByID {
			if candidate.LibraryEvent == "KEY_RELEASED" && candidate.Keycode != nil && *candidate.Keycode == state.Keycode && recorderNativeStringValue(candidate.Sequence) > recorderNativeStringValue(event.Sequence) {
				return fmt.Errorf("stop key-state evidence contradicts a recorded release for %s", state.PressEventID)
			}
		}
		switch state.State {
		case "pressed":
			if state.Source != "combined-session-key-state" || !hasIssue("key-still-pressed-at-stop", state.PressEventID) {
				return fmt.Errorf("pressed stop key-state evidence is incomplete for %s", state.PressEventID)
			}
		case "released":
			if state.Source != "combined-session-key-state" || !hasIssue("key-release-not-observed-at-stop", state.PressEventID) {
				return fmt.Errorf("released stop key-state evidence is incomplete for %s", state.PressEventID)
			}
		case "unavailable":
			if state.Source != "unavailable" {
				return fmt.Errorf("unavailable stop key-state evidence has an invalid source for %s", state.PressEventID)
			}
		default:
			return fmt.Errorf("stop key-state evidence has an invalid state for %s", state.PressEventID)
		}
	}
	return nil
}

func recorderValidateManifestTextEdits(manifest recorderManifest, eventsByID map[string]recorderRawEvent) error {
	if len(manifest.TextEdits) == 0 {
		return nil
	}
	if manifest.FormatVersion != recorderRecordingFormatVersion || !manifest.Capture.CaptureKeyboard || manifest.Capture.KeyboardContent != "non-sensitive-test" {
		return fmt.Errorf("text edits require explicit non-sensitive keyboard capture")
	}
	if len(manifest.TextEdits) > recorderMaxActions {
		return fmt.Errorf("text edit count exceeds limit")
	}
	seenEdits := map[string]bool{}
	seenEvents := map[string]bool{}
	segments := recorderCaptureSegmentIndexesFromMap(eventsByID)
	for _, edit := range manifest.TextEdits {
		if !recorderIDPattern.MatchString(edit.ID) || seenEdits[edit.ID] || edit.Status != "verified" || len(edit.SourceEventIDs) == 0 {
			return fmt.Errorf("text edit identity or status is invalid")
		}
		seenEdits[edit.ID] = true
		if err := recorderValidateWindowSnapshot(edit.Window); err != nil {
			return fmt.Errorf("text edit %s window is invalid: %w", edit.ID, err)
		}
		if err := recorderValidateEditableDescriptor(edit.Element); err != nil {
			return fmt.Errorf("text edit %s target is not a verified writable focused text field", edit.ID)
		}
		if _, err := time.Parse(time.RFC3339Nano, edit.ObservedAt); err != nil {
			return fmt.Errorf("text edit %s observedAt is invalid", edit.ID)
		}
		validFingerprint := func(value recorderTextFingerprint) bool {
			decoded, err := hex.DecodeString(value.SHA256)
			return err == nil && len(decoded) == sha256.Size && value.UTF16Units >= 0 && value.UTF16Units <= 1<<20
		}
		if !validFingerprint(edit.Before) || !validFingerprint(edit.After) || edit.Before.SHA256 == edit.After.SHA256 {
			return fmt.Errorf("text edit %s fingerprints are invalid", edit.ID)
		}
		insertUnits := recorderFingerprintText(edit.Patch.InsertText).UTF16Units
		if edit.Patch.Unit != "utf16-code-unit" || edit.Patch.Start < 0 || edit.Patch.DeleteCount < 0 || edit.Patch.Start > edit.Before.UTF16Units || edit.Patch.DeleteCount > edit.Before.UTF16Units-edit.Patch.Start || (edit.Patch.DeleteCount == 0 && insertUnits == 0) || len([]rune(edit.Patch.InsertText)) > recorderMaxTextActionRunes || edit.After.UTF16Units != edit.Before.UTF16Units-edit.Patch.DeleteCount+insertUnits {
			return fmt.Errorf("text edit %s patch is invalid", edit.ID)
		}
		var priorSequence uint64
		segment := -1
		for _, eventID := range edit.SourceEventIDs {
			event, ok := eventsByID[eventID]
			if !ok || seenEvents[eventID] || (event.LibraryEvent != "KEY_PRESSED" && event.LibraryEvent != "KEY_RELEASED" && event.LibraryEvent != "KEY_TYPED") {
				return fmt.Errorf("text edit %s has an invalid or reused keyboard source", edit.ID)
			}
			sequence := recorderNativeStringValue(event.Sequence)
			if priorSequence != 0 && sequence <= priorSequence {
				return fmt.Errorf("text edit %s source order is invalid", edit.ID)
			}
			if segment < 0 {
				segment = segments[eventID]
			} else if segments[eventID] != segment {
				return fmt.Errorf("text edit %s crosses a pause boundary", edit.ID)
			}
			priorSequence = sequence
			seenEvents[eventID] = true
		}
	}
	return nil
}

func recorderCaptureSegmentIndexesFromMap(eventsByID map[string]recorderRawEvent) map[string]int {
	events := make([]recorderRawEvent, 0, len(eventsByID))
	for _, event := range eventsByID {
		events = append(events, event)
	}
	sort.Slice(events, func(i, j int) bool {
		return recorderNativeStringValue(events[i].Sequence) < recorderNativeStringValue(events[j].Sequence)
	})
	return recorderCaptureSegmentIndexes(events)
}

func recorderValidateWindowSnapshot(snapshot *recorderWindowSnapshot) error {
	if snapshot == nil || snapshot.Application.ProcessID == 0 || strings.TrimSpace(snapshot.ID) == "" || strings.TrimSpace(snapshot.Title) == "" || snapshot.Bounds.Width <= 0 || snapshot.Bounds.Height <= 0 {
		return fmt.Errorf("identity or bounds are incomplete")
	}
	if _, err := time.Parse(time.RFC3339Nano, snapshot.ObservedAt); err != nil {
		return fmt.Errorf("observedAt is invalid")
	}
	switch snapshot.Application.IdentityKind {
	case "executable-path":
		if strings.TrimSpace(snapshot.Application.ExecutablePath) == "" || snapshot.Application.IdentityValue != snapshot.Application.ExecutablePath {
			return fmt.Errorf("executable-path identity is invalid")
		}
	case "executable-name":
		if strings.TrimSpace(snapshot.Application.ExecutableName) == "" || snapshot.Application.IdentityValue != snapshot.Application.ExecutableName {
			return fmt.Errorf("executable-name identity is invalid")
		}
	default:
		return fmt.Errorf("identity kind is unsupported")
	}
	return nil
}

func recorderValidateElementSnapshot(snapshot *recorderElementSnapshot) error {
	if snapshot == nil || snapshot.Source != "accessibility" || (snapshot.Resolution != "point-hit" && snapshot.Resolution != "nearest-actionable-ancestor" && snapshot.Resolution != "focused-input-fallback") || strings.TrimSpace(snapshot.Role) == "" || snapshot.Bounds.Width <= 0 || snapshot.Bounds.Height <= 0 || !recorderPointInsideWindow(snapshot.Bounds.X+snapshot.Point.OffsetX, snapshot.Bounds.Y+snapshot.Point.OffsetY, snapshot.Bounds) {
		return fmt.Errorf("element identity, role, bounds, or point is invalid")
	}
	pointX, pointY := snapshot.Bounds.X+snapshot.Point.OffsetX, snapshot.Bounds.Y+snapshot.Point.OffsetY
	if err := recorderValidateElementDescriptor(snapshot.Hit); err != nil || snapshot.Ancestors == nil || len(snapshot.Ancestors) > 6 || !recorderPointInsideWindow(pointX, pointY, snapshot.Hit.Bounds) {
		return fmt.Errorf("element hit or ancestor path is invalid")
	}
	for _, ancestor := range snapshot.Ancestors {
		if err := recorderValidateElementDescriptor(ancestor); err != nil || !recorderPointInsideWindow(pointX, pointY, ancestor.Bounds) {
			return fmt.Errorf("element ancestor path is invalid")
		}
	}
	selected := recorderElementDescriptor{
		Role: snapshot.Role, NativeRole: snapshot.NativeRole, Subrole: snapshot.Subrole, Name: snapshot.Name, Identifier: snapshot.Identifier,
		Enabled: snapshot.Enabled, Focused: snapshot.Focused, ValueSettable: snapshot.ValueSettable,
		NativeActions: snapshot.NativeActions, Bounds: snapshot.Bounds, BoundsSpace: snapshot.BoundsSpace,
	}
	if err := recorderValidateElementDescriptor(selected); err != nil {
		return fmt.Errorf("selected element descriptor is invalid")
	}
	if snapshot.Resolution == "point-hit" && !reflect.DeepEqual(selected, snapshot.Hit) {
		return fmt.Errorf("point-hit target does not match its hit descriptor")
	}
	if snapshot.Resolution == "nearest-actionable-ancestor" && (len(snapshot.Ancestors) == 0 || len(snapshot.NativeActions) == 0) {
		return fmt.Errorf("actionable ancestor resolution is incomplete")
	}
	if snapshot.Resolution == "nearest-actionable-ancestor" && !reflect.DeepEqual(selected, snapshot.Ancestors[len(snapshot.Ancestors)-1]) {
		return fmt.Errorf("actionable target does not match the nearest selected ancestor")
	}
	if snapshot.Resolution == "focused-input-fallback" && (snapshot.Role != "textField" || !snapshot.ValueSettable || snapshot.Focused == nil || !*snapshot.Focused || len(snapshot.Ancestors) != 0 || !reflect.DeepEqual(selected, snapshot.Hit)) {
		return fmt.Errorf("focused input fallback evidence is invalid")
	}
	if _, err := time.Parse(time.RFC3339Nano, snapshot.ObservedAt); err != nil {
		return fmt.Errorf("element observedAt is invalid")
	}
	if math.IsNaN(snapshot.Point.XRatio) || math.IsInf(snapshot.Point.XRatio, 0) || math.IsNaN(snapshot.Point.YRatio) || math.IsInf(snapshot.Point.YRatio, 0) || snapshot.Point.XRatio < 0 || snapshot.Point.XRatio >= 1 || snapshot.Point.YRatio < 0 || snapshot.Point.YRatio >= 1 || math.Abs(snapshot.Point.XRatio-float64(snapshot.Point.OffsetX)/float64(snapshot.Bounds.Width)) > 1e-12 || math.Abs(snapshot.Point.YRatio-float64(snapshot.Point.OffsetY)/float64(snapshot.Bounds.Height)) > 1e-12 {
		return fmt.Errorf("element-relative point is invalid")
	}
	return nil
}

func recorderValidateElementDescriptor(descriptor recorderElementDescriptor) error {
	if err := recorderValidateElementDescriptorFields(descriptor); err != nil || descriptor.Bounds.Width <= 0 || descriptor.Bounds.Height <= 0 {
		return fmt.Errorf("element descriptor is invalid")
	}
	return nil
}

func recorderValidateElementDescriptorFields(descriptor recorderElementDescriptor) error {
	if strings.TrimSpace(descriptor.Role) == "" || len(descriptor.Role) > 128 || len(descriptor.NativeRole) > 128 || len(descriptor.Subrole) > 128 || len(descriptor.Name) > 1024 || len(descriptor.Identifier) > 512 || descriptor.NativeActions == nil || len(descriptor.NativeActions) > 32 {
		return fmt.Errorf("element descriptor fields are invalid")
	}
	for _, action := range descriptor.NativeActions {
		if strings.TrimSpace(action) == "" || len(action) > 128 {
			return fmt.Errorf("element native action is invalid")
		}
	}
	return nil
}

func recorderValidateEditableDescriptor(descriptor recorderElementDescriptor) error {
	if err := recorderValidateElementDescriptorFields(descriptor); err != nil || descriptor.Role != "textField" || !descriptor.ValueSettable || descriptor.Focused == nil || !*descriptor.Focused {
		return fmt.Errorf("editable element descriptor is invalid")
	}
	if descriptor.Bounds.Width == 0 && descriptor.Bounds.Height == 0 {
		if descriptor.Bounds.X != 0 || descriptor.Bounds.Y != 0 || descriptor.BoundsSpace != "" {
			return fmt.Errorf("editable element has partial unavailable bounds")
		}
		if strings.TrimSpace(descriptor.Identifier) == "" && strings.TrimSpace(descriptor.Name) == "" {
			return fmt.Errorf("bounds-free editable element has no stable locator")
		}
		return nil
	}
	if descriptor.Bounds.Width <= 0 || descriptor.Bounds.Height <= 0 {
		return fmt.Errorf("editable element bounds are invalid")
	}
	return nil
}

type recorderMouseSegment struct {
	button  string
	press   *recorderRawEvent
	release *recorderRawEvent
	dragged []recorderRawEvent
	motion  []recorderRawEvent
}

const recorderPointerButtonMask uint16 = (1 << 8) | (1 << 9) | (1 << 10) | (1 << 11) | (1 << 12)

func recorderValidControlClickEnvelope(events []recorderRawEvent) bool {
	if len(events) < 2 || events[0].LibraryEvent != "MOUSE_PRESSED" || events[0].Button != "left" || events[0].Clicks == 0 {
		return false
	}
	first := events[0]
	clickSeriesCount := first.Clicks
	if first.X == nil || first.Y == nil || recorderHasControlModifier(first.ModifierMask) {
		return false
	}
	pressed, released, clicked := 0, 0, 0
	for index, event := range events {
		if event.X == nil || event.Y == nil || recorderPointDistanceSquared(*first.X, *first.Y, *event.X, *event.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
			return false
		}
		switch event.LibraryEvent {
		case "MOUSE_PRESSED":
			pressed++
			if index != 0 || event.Button != "left" || event.Clicks != clickSeriesCount || recorderHasControlModifier(event.ModifierMask) {
				return false
			}
		case "MOUSE_RELEASED":
			released++
			if event.Button != "left" || event.Clicks != clickSeriesCount || recorderHasControlModifier(event.ModifierMask) {
				return false
			}
		case "MOUSE_CLICKED":
			clicked++
			if index != len(events)-1 || event.Button != "left" || event.Clicks != clickSeriesCount || recorderHasControlModifier(event.ModifierMask) {
				return false
			}
		case "MOUSE_DRAGGED":
			if event.Button != "none" && event.Button != "left" {
				return false
			}
		case "MOUSE_MOVED":
		default:
			return false
		}
	}
	last := events[len(events)-1]
	if pressed != 1 || released != 1 || (clicked == 1 && last.LibraryEvent != "MOUSE_CLICKED") || clicked > 1 {
		return false
	}
	if clicked == 0 && last.LibraryEvent != "MOUSE_RELEASED" {
		return false
	}
	start, end := recorderNativeTimeValue(first), recorderNativeTimeValue(last)
	return end >= start && end-start <= 2000
}

func recorderButtonMask(button string) uint16 {
	switch button {
	case "left":
		return 1 << 8
	case "right":
		return 1 << 9
	case "middle":
		return 1 << 10
	case "button4":
		return 1 << 11
	case "button5":
		return 1 << 12
	default:
		return 0
	}
}

func recorderSingleHeldButton(modifierMask uint16) (string, bool) {
	held := modifierMask & recorderPointerButtonMask
	for _, button := range []string{"left", "right", "middle", "button4", "button5"} {
		mask := recorderButtonMask(button)
		if held == mask {
			return button, true
		}
	}
	return "", false
}

// recorderCaptureStartPointerExclusions recognizes only an input suffix that
// was already in progress when the native listener became ready. The first
// persisted event can therefore be DRAGGED/MOVED or RELEASED without a press
// even when the session reports no loss. A matching release must return to a
// neutral pointer state before the prefix can be excluded; the same shape
// later in the recording remains an integrity error.
func recorderCaptureStartPointerExclusions(events []recorderRawEvent) map[string]string {
	excluded := map[string]string{}
	if len(events) == 0 {
		return excluded
	}
	const reason = "capture-start partial pointer envelope"
	first := events[0]
	button := ""
	releaseIndex := -1
	switch first.LibraryEvent {
	case "MOUSE_DRAGGED", "MOUSE_MOVED":
		var ok bool
		button, ok = recorderSingleHeldButton(first.ModifierMask)
		if !ok {
			return excluded
		}
		index := 0
		for index < len(events) && (events[index].LibraryEvent == "MOUSE_DRAGGED" || events[index].LibraryEvent == "MOUSE_MOVED") {
			event := events[index]
			heldButton, single := recorderSingleHeldButton(event.ModifierMask)
			if !single || heldButton != button || (event.Button != "" && event.Button != "none" && event.Button != button) {
				return excluded
			}
			index++
		}
		releaseIndex = index
	case "MOUSE_RELEASED":
		button = first.Button
		releaseIndex = 0
	case "MOUSE_CLICKED":
		if recorderButtonMask(first.Button) == 0 || first.Clicks == 0 || first.ModifierMask&recorderPointerButtonMask != 0 {
			return excluded
		}
		excluded[first.EventID] = reason
		return excluded
	default:
		return excluded
	}
	if recorderButtonMask(button) == 0 || releaseIndex < 0 || releaseIndex >= len(events) {
		return excluded
	}
	release := events[releaseIndex]
	if release.LibraryEvent != "MOUSE_RELEASED" || release.Button != button || release.ModifierMask&recorderPointerButtonMask != 0 {
		return excluded
	}
	for index := 0; index <= releaseIndex; index++ {
		excluded[events[index].EventID] = reason
	}
	if releaseIndex+1 < len(events) && recorderReleaseMatchesImmediateClick(release, events[releaseIndex+1]) {
		excluded[events[releaseIndex+1].EventID] = reason
	}
	return excluded
}

func recorderReleaseMatchesImmediateClick(release, clicked recorderRawEvent) bool {
	if clicked.LibraryEvent != "MOUSE_CLICKED" || clicked.Button != release.Button || clicked.Clicks == 0 ||
		clicked.ModifierMask&recorderPointerButtonMask != 0 || release.X == nil || release.Y == nil || clicked.X == nil || clicked.Y == nil ||
		recorderPointDistanceSquared(*release.X, *release.Y, *clicked.X, *clicked.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
		return false
	}
	if release.Clicks > 0 && release.Clicks != clicked.Clicks {
		return false
	}
	releaseTime := recorderActionTimeMilliseconds(release.NativeTime, release.NativeUnit)
	clickedTime := recorderActionTimeMilliseconds(clicked.NativeTime, clicked.NativeUnit)
	return clickedTime >= releaseTime && clickedTime-releaseTime <= 2000
}

// recorderMotionSegment associates libuiohook's production drag shape with
// the held press. On every supported backend DRAGGED is reported with
// MOUSE_NOBUTTON, so the button field alone is not an association key.
func recorderMotionSegment(segments map[string]*recorderMouseSegment, event recorderRawEvent) (*recorderMouseSegment, bool) {
	if event.Button != "" && event.Button != "none" {
		segment := segments[event.Button]
		if segment != nil && segment.press != nil && segment.release == nil {
			return segment, false
		}
		return nil, false
	}
	candidates := make([]*recorderMouseSegment, 0, len(segments))
	masked := make([]*recorderMouseSegment, 0, len(segments))
	for button, segment := range segments {
		if segment == nil || segment.press == nil || segment.release != nil {
			continue
		}
		candidates = append(candidates, segment)
		if mask := recorderButtonMask(button); mask != 0 && event.ModifierMask&mask != 0 {
			masked = append(masked, segment)
		}
	}
	if len(masked) == 1 {
		return masked[0], false
	}
	if len(masked) > 1 {
		return nil, true
	}
	if len(candidates) == 1 {
		return candidates[0], false
	}
	return nil, len(candidates) > 1
}

// recorderTrailingControlClick finds only a complete, bounded pointer-click
// envelope at the native-input tail. A Custom UI controller records the IDs in
// an explicit raw boundary; buildActions never guesses from coordinates alone.
func recorderTrailingControlClick(events []recorderRawEvent, controlAt time.Time) []recorderRawEvent {
	return recorderTrailingControlClickWithin(events, controlAt, nil)
}

func recorderTrailingControlClickWithin(events []recorderRawEvent, controlAt time.Time, bounds *recorderControlBounds) []recorderRawEvent {
	if len(events) == 0 {
		return nil
	}
	first := len(events) - 64
	if first < 0 {
		first = 0
	}
	for end := len(events); end > first; end-- {
		candidateEnd := events[end-1].LibraryEvent
		if candidateEnd != "MOUSE_CLICKED" && candidateEnd != "MOUSE_RELEASED" {
			if candidateEnd == "MOUSE_MOVED" {
				continue
			}
			return nil
		}
		trailingMovesOnly := true
		for _, trailing := range events[end:] {
			if trailing.LibraryEvent != "MOUSE_MOVED" {
				trailingMovesOnly = false
				break
			}
		}
		if !trailingMovesOnly {
			continue
		}
		for start := end - 1; start >= first; start-- {
			if events[start].LibraryEvent != "MOUSE_PRESSED" {
				continue
			}
			candidate := events[start:end]
			lastReceivedAt, receivedErr := time.Parse(time.RFC3339Nano, candidate[len(candidate)-1].ReceivedAt)
			delta := controlAt.Sub(lastReceivedAt)
			if delta < 0 {
				delta = -delta
			}
			if receivedErr == nil && delta <= 1500*time.Millisecond && recorderValidControlClickEnvelope(candidate) && recorderControlEnvelopeInside(candidate, bounds) {
				return append([]recorderRawEvent(nil), candidate...)
			}
		}
	}
	return nil
}

func recorderControlEnvelopeInside(events []recorderRawEvent, bounds *recorderControlBounds) bool {
	if bounds == nil {
		return true
	}
	if !recorderValidControlBounds(*bounds) {
		return false
	}
	for _, event := range events {
		if event.X == nil || event.Y == nil || !recorderControlBoundsContains(*bounds, *event.X, *event.Y) {
			return false
		}
	}
	return true
}

func recorderRecentControlPointerInput(events []recorderRawEvent, controlAt time.Time, bounds recorderControlBounds) bool {
	if !recorderValidControlBounds(bounds) {
		return false
	}
	first := len(events) - 64
	if first < 0 {
		first = 0
	}
	for _, event := range events[first:] {
		switch event.LibraryEvent {
		case "MOUSE_PRESSED", "MOUSE_RELEASED", "MOUSE_CLICKED", "MOUSE_MOVED", "MOUSE_DRAGGED":
		default:
			continue
		}
		if event.X == nil || event.Y == nil || !recorderControlBoundsContains(bounds, *event.X, *event.Y) {
			continue
		}
		receivedAt, err := time.Parse(time.RFC3339Nano, event.ReceivedAt)
		if err != nil {
			continue
		}
		delta := controlAt.Sub(receivedAt)
		if delta < 0 {
			delta = -delta
		}
		if delta <= 1500*time.Millisecond {
			return true
		}
	}
	return false
}

func recorderValidControlBounds(bounds recorderControlBounds) bool {
	return !math.IsNaN(bounds.X) && !math.IsInf(bounds.X, 0) &&
		!math.IsNaN(bounds.Y) && !math.IsInf(bounds.Y, 0) &&
		!math.IsNaN(bounds.Width) && !math.IsInf(bounds.Width, 0) &&
		!math.IsNaN(bounds.Height) && !math.IsInf(bounds.Height, 0) &&
		bounds.Width > 0 && bounds.Height > 0
}

func recorderControlBoundsContains(bounds recorderControlBounds, x, y int) bool {
	return recorderValidControlBounds(bounds) && float64(x) >= bounds.X && float64(x) < bounds.X+bounds.Width &&
		float64(y) >= bounds.Y && float64(y) < bounds.Y+bounds.Height
}

type recorderControlClickMetadata struct {
	EventIDs    []string
	UITimestamp time.Time
	Bounds      *recorderControlBounds
	MatchStatus string
	Legacy      bool
}

func recorderParseControlClickMetadata(event recorderRawEvent) (recorderControlClickMetadata, error) {
	if event.LibraryEvent != "RECORDER_CONTROL_CLICK" || event.Source != "recorder" {
		return recorderControlClickMetadata{}, fmt.Errorf("not a Recorder control-click boundary")
	}
	legacy := len(event.Metadata) == 4 && event.Metadata["controlBounds"] == "" && event.Metadata["matchStatus"] == ""
	if (!legacy && len(event.Metadata) != 6) || event.Metadata["windowId"] == "" || event.Metadata["targetId"] == "" || event.Metadata["uiTimestamp"] == "" || event.Metadata["triggerEventIds"] == "" {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click metadata is incomplete")
	}
	for key := range event.Metadata {
		if key != "windowId" && key != "targetId" && key != "uiTimestamp" && key != "triggerEventIds" && key != "controlBounds" && key != "matchStatus" {
			return recorderControlClickMetadata{}, fmt.Errorf("control-click metadata contains an unknown field")
		}
	}
	if !recorderIDPattern.MatchString(event.Metadata["windowId"]) || !recorderIDPattern.MatchString(event.Metadata["targetId"]) {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click identity is invalid")
	}
	uiTimestamp, err := time.Parse(time.RFC3339Nano, event.Metadata["uiTimestamp"])
	if err != nil {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click timestamp is invalid")
	}
	boundaryTimestamp, err := time.Parse(time.RFC3339Nano, event.ReceivedAt)
	if err != nil || uiTimestamp.After(boundaryTimestamp.Add(time.Second)) || boundaryTimestamp.Sub(uiTimestamp) > 5*time.Second {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click timestamp is outside the boundary window")
	}
	var eventIDs []string
	if err := json.Unmarshal([]byte(event.Metadata["triggerEventIds"]), &eventIDs); err != nil || eventIDs == nil || len(eventIDs) > 64 {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click event references are invalid")
	}
	seen := map[string]bool{}
	for _, eventID := range eventIDs {
		if !recorderIDPattern.MatchString(eventID) || seen[eventID] {
			return recorderControlClickMetadata{}, fmt.Errorf("control-click event references are invalid")
		}
		seen[eventID] = true
	}
	metadata := recorderControlClickMetadata{EventIDs: eventIDs, UITimestamp: uiTimestamp, Legacy: legacy}
	if legacy {
		metadata.MatchStatus = "matched"
		if len(eventIDs) == 0 {
			metadata.MatchStatus = "unmatched"
		}
		return metadata, nil
	}
	var bounds recorderControlBounds
	if event.Metadata["controlBounds"] == "" || recorderDecodeStrict([]byte(event.Metadata["controlBounds"]), &bounds) != nil || !recorderValidControlBounds(bounds) {
		return recorderControlClickMetadata{}, fmt.Errorf("control-click screen bounds are invalid")
	}
	metadata.Bounds = &bounds
	metadata.MatchStatus = event.Metadata["matchStatus"]
	switch metadata.MatchStatus {
	case "matched":
		if len(eventIDs) == 0 {
			return recorderControlClickMetadata{}, fmt.Errorf("matched control-click has no event references")
		}
	case "not-observed", "unmatched":
		if len(eventIDs) != 0 {
			return recorderControlClickMetadata{}, fmt.Errorf("unmatched control-click must not contain event references")
		}
	default:
		return recorderControlClickMetadata{}, fmt.Errorf("control-click match status is invalid")
	}
	return metadata, nil
}

func recorderControlClickReferences(event recorderRawEvent) ([]string, error) {
	metadata, err := recorderParseControlClickMetadata(event)
	return metadata.EventIDs, err
}

func recorderControlClickExclusions(events []recorderRawEvent) (map[string]string, []recorderIssue) {
	excluded := map[string]string{}
	issues := make([]recorderIssue, 0)
	positions := make(map[string]int, len(events))
	for index, event := range events {
		positions[event.EventID] = index
	}
	for boundaryIndex, event := range events {
		if event.LibraryEvent != "RECORDER_CONTROL_CLICK" {
			continue
		}
		excluded[event.EventID] = "explicit Custom UI control-click boundary"
		metadata, err := recorderParseControlClickMetadata(event)
		if err != nil {
			issues = appendIssue(issues, recorderIssue{Code: "control-click-boundary-invalid", Severity: "error", Message: err.Error(), EventID: event.EventID})
			continue
		}
		references := metadata.EventIDs
		if metadata.MatchStatus == "not-observed" {
			if metadata.Bounds == nil || recorderRecentControlPointerInput(events[:boundaryIndex], metadata.UITimestamp, *metadata.Bounds) {
				issues = appendIssue(issues, recorderIssue{Code: "control-click-boundary-invalid", Severity: "error", Message: "Custom UI reported no native control input but matching raw pointer input exists", EventID: event.EventID})
			}
			continue
		}
		if metadata.MatchStatus == "unmatched" {
			issues = appendIssue(issues, recorderIssue{Code: "control-click-unmatched", Severity: "error", Message: "Custom UI reported a control click but no complete recent pointer envelope could be matched", EventID: event.EventID})
			continue
		}
		group := make([]recorderRawEvent, 0, len(references))
		priorPosition := -1
		valid := true
		for _, eventID := range references {
			position, exists := positions[eventID]
			if !exists || position >= boundaryIndex || position <= priorPosition {
				valid = false
				break
			}
			priorPosition = position
			group = append(group, events[position])
		}
		if valid {
			lastPosition := positions[references[len(references)-1]]
			for _, trailing := range events[lastPosition+1 : boundaryIndex] {
				if trailing.LibraryEvent != "MOUSE_MOVED" {
					valid = false
					break
				}
			}
		}
		if valid {
			lastTimestamp, timestampErr := time.Parse(time.RFC3339Nano, group[len(group)-1].ReceivedAt)
			delta := metadata.UITimestamp.Sub(lastTimestamp)
			if delta < 0 {
				delta = -delta
			}
			if timestampErr != nil || delta > 1500*time.Millisecond {
				valid = false
			}
		}
		if !valid || !recorderValidControlClickEnvelope(group) || !recorderControlEnvelopeInside(group, metadata.Bounds) {
			issues = appendIssue(issues, recorderIssue{Code: "control-click-boundary-invalid", Severity: "error", Message: "Custom UI control-click references do not identify the latest bounded pointer envelope", EventID: event.EventID})
			continue
		}
		for _, referenced := range group {
			excluded[referenced.EventID] = "excluded by explicit Custom UI control-click boundary " + event.EventID
		}
	}
	return excluded, issues
}

type recorderTextGroup struct {
	events      []recorderRawEvent
	text        strings.Builder
	firstNative uint64
	lastNative  uint64
}

func recorderWheelDelta(event recorderRawEvent) (int, int, bool) {
	if event.LibraryEvent != "MOUSE_WHEEL" || event.WheelAmount == nil || event.WheelRotation == nil || event.WheelDirection == nil ||
		event.X == nil || event.Y == nil || !event.CoordinateVerified || event.DisplayRef == "" || *event.WheelAmount == 0 || *event.WheelRotation == 0 ||
		event.ModifierMask&((1<<13)-1) != 0 {
		return 0, 0, false
	}
	delta := int(*event.WheelAmount) * int(*event.WheelRotation)
	switch *event.WheelDirection {
	case 3: // libuiohook WHEEL_VERTICAL_DIRECTION; positive is down.
		return 0, delta, true
	case 4: // libuiohook WHEEL_HORIZONTAL_DIRECTION; positive is right.
		return delta, 0, true
	default:
		return 0, 0, false
	}
}

func recorderWheelEventsCanGroup(events []recorderRawEvent, next recorderRawEvent) bool {
	if len(events) == 0 {
		return true
	}
	if len(events) >= recorderMaximumWheelSteps {
		return false
	}
	last := events[len(events)-1]
	lastX, lastY, lastOK := recorderWheelDelta(last)
	nextX, nextY, nextOK := recorderWheelDelta(next)
	if !lastOK || !nextOK || last.DisplayRef != next.DisplayRef || (lastX == 0) != (nextX == 0) || (lastY == 0) != (nextY == 0) {
		return false
	}
	lastDelta, nextDelta := lastX+lastY, nextX+nextY
	if (lastDelta < 0) != (nextDelta < 0) {
		return false
	}
	total := int64(nextDelta)
	for _, event := range events {
		x, y, _ := recorderWheelDelta(event)
		total += int64(x + y)
	}
	if total < math.MinInt32 || total > math.MaxInt32 {
		return false
	}
	lastTime := recorderActionTimeMilliseconds(last.NativeTime, last.NativeUnit)
	nextTime := recorderActionTimeMilliseconds(next.NativeTime, next.NativeUnit)
	return nextTime >= lastTime && nextTime-lastTime <= recorderWheelBurstGapMS
}

func recorderBuildWheelAction(events []recorderRawEvent, ordinal int) *recorderAction {
	if len(events) == 0 || len(events) > recorderMaximumWheelSteps {
		return nil
	}
	var deltaX, deltaY int
	for index, event := range events {
		x, y, ok := recorderWheelDelta(event)
		if !ok || (index > 0 && !recorderWheelEventsCanGroup(events[:index], event)) {
			return nil
		}
		deltaX += x
		deltaY += y
	}
	if deltaX == 0 && deltaY == 0 {
		return nil
	}
	first, last := events[0], events[len(events)-1]
	eventIDs := make([]string, 0, len(events))
	for _, event := range events {
		eventIDs = append(eventIDs, event.EventID)
	}
	delayMS := 0
	if len(events) > 1 {
		start := recorderActionTimeMilliseconds(first.NativeTime, first.NativeUnit)
		end := recorderActionTimeMilliseconds(last.NativeTime, last.NativeUnit)
		if end > start {
			delayMS = int(math.Round(float64(end-start) / float64(len(events))))
		}
	}
	return &recorderAction{
		ID: fmt.Sprintf("a%04d", ordinal), Kind: "wheel",
		Source:   recorderActionSource{EventIDs: eventIDs, Basis: recorderWheelBasis},
		Timing:   recorderTiming(first, last),
		Position: &recorderActionPosition{X: *first.X, Y: *first.Y, Space: "screen-logical", DisplayRef: first.DisplayRef, Verified: true},
		Args:     recorderActionArguments{DeltaX: deltaX, DeltaY: deltaY, Steps: len(events), DelayMS: delayMS},
		Strategy: "mouse.wheel", Review: recorderActionReview{Required: false, Status: "not-required"},
	}
}

func recorderCaptureSegmentIndexes(events []recorderRawEvent) map[string]int {
	result := make(map[string]int, len(events))
	segment := 0
	for _, event := range events {
		if event.LibraryEvent == "RECORDER_RESUMED" {
			segment++
		}
		result[event.EventID] = segment
	}
	return result
}

func recorderHasPauseBoundary(events []recorderRawEvent, afterSequence, beforeSequence uint64) bool {
	for _, event := range events {
		sequence := recorderNativeStringValue(event.Sequence)
		if sequence <= afterSequence || sequence >= beforeSequence {
			continue
		}
		if event.LibraryEvent == "RECORDER_PAUSED" || event.LibraryEvent == "RECORDER_RESUMED" {
			return true
		}
	}
	return false
}

func recorderBuildActionList(events []recorderRawEvent) ([]recorderAction, []recorderEventDisposition, []recorderIssue) {
	return recorderBuildActionListWithTextEdits(events, nil)
}

func recorderBuildActionListWithTextEdits(events []recorderRawEvent, textEdits []recorderTextEdit) ([]recorderAction, []recorderEventDisposition, []recorderIssue) {
	return recorderBuildActionListWithContexts(events, textEdits, nil)
}

func recorderBuildActionListWithContexts(events []recorderRawEvent, textEdits []recorderTextEdit, inputContexts []recorderInputContext) ([]recorderAction, []recorderEventDisposition, []recorderIssue) {
	actions := make([]recorderAction, 0)
	disposition := make(map[string]recorderEventDisposition, len(events))
	controlExclusions, issues := recorderControlClickExclusions(events)
	startPointerExclusions := recorderCaptureStartPointerExclusions(events)
	segments := map[string]*recorderMouseSegment{}
	lastClicked := map[string]recorderRawEvent{}
	pressedKeys := map[uint16][]recorderRawEvent{}
	eventSegments := recorderCaptureSegmentIndexes(events)
	eventsByID := make(map[string]recorderRawEvent, len(events))
	for _, event := range events {
		eventsByID[event.EventID] = event
	}
	inputContextsByEventID := recorderInputContextsByEventID(inputContexts)
	textEditByFirstEvent := make(map[string]recorderTextEdit, len(textEdits))
	textEditByEvent := make(map[string]string)
	for _, edit := range textEdits {
		if len(edit.SourceEventIDs) == 0 {
			continue
		}
		textEditByFirstEvent[edit.SourceEventIDs[0]] = edit
		for _, eventID := range edit.SourceEventIDs {
			textEditByEvent[eventID] = edit.ID
		}
	}
	typedRawcodes := map[int]map[uint16]bool{}
	for _, event := range events {
		if event.LibraryEvent == "KEY_TYPED" && event.Rawcode != nil {
			segment := eventSegments[event.EventID]
			if typedRawcodes[segment] == nil {
				typedRawcodes[segment] = map[uint16]bool{}
			}
			typedRawcodes[segment][*event.Rawcode] = true
		}
	}
	var text recorderTextGroup
	flushText := func() {
		if len(text.events) == 0 {
			return
		}
		id := fmt.Sprintf("a%04d", len(actions)+1)
		first, last := text.events[0], text.events[len(text.events)-1]
		eventIDs := make([]string, 0, len(text.events))
		for _, event := range text.events {
			eventIDs = append(eventIDs, event.EventID)
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "consumed", ActionID: id, Reason: "basic text source"}
		}
		actions = append(actions, recorderAction{
			ID: id, Kind: "text", Source: recorderActionSource{EventIDs: eventIDs, Basis: "libuiohook KEY_TYPED basic-latin code units"},
			Timing: recorderTiming(first, last), Position: nil,
			Args:     recorderActionArguments{Text: text.text.String(), EditSemantics: "insert-at-current-focus"},
			Strategy: "keyboard.type", Review: recorderActionReview{Required: false, Status: "not-required"},
		})
		text = recorderTextGroup{}
	}
	wheelEvents := make([]recorderRawEvent, 0)
	flushWheel := func() {
		if len(wheelEvents) == 0 {
			return
		}
		action := recorderBuildWheelAction(wheelEvents, len(actions)+1)
		if action == nil {
			for _, event := range wheelEvents {
				issues = appendIssue(issues, recorderIssue{Code: "wheel-invalid", Severity: "error", Message: "wheel burst cannot be represented safely", EventID: event.EventID})
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "wheel burst is invalid"}
			}
			wheelEvents = wheelEvents[:0]
			return
		}
		actions = append(actions, *action)
		for _, event := range wheelEvents {
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "consumed", ActionID: action.ID, Reason: "wheel delta in a contiguous same-axis burst"}
		}
		wheelEvents = wheelEvents[:0]
	}
	finalizeReleased := func(skipButton string) {
		buttons := make([]string, 0, len(segments))
		for button, segment := range segments {
			if button != skipButton && segment != nil && segment.press != nil && segment.release != nil {
				buttons = append(buttons, button)
			}
		}
		sort.SliceStable(buttons, func(left, right int) bool {
			return recorderNativeStringValue(segments[buttons[left]].release.Sequence) < recorderNativeStringValue(segments[buttons[right]].release.Sequence)
		})
		for _, button := range buttons {
			segment := segments[button]
			if len(segment.dragged) > 0 {
				action := recorderBuildJitterClickAction(segment, len(actions)+1)
				if action == nil {
					action = recorderBuildDragAction(segment, len(actions)+1, inputContextsByEventID)
				}
				if action != nil {
					actions = append(actions, *action)
					for _, eventID := range action.Source.EventIDs {
						reason := "bounded pointer-jitter evidence for click"
						kind := "evidence"
						if action.Kind == "drag" {
							reason = "recorded straight drag path evidence"
							if action.Source.Basis == recorderTextSelectionDragBasis {
								reason = "recorded natural near-linear text-selection path evidence"
							}
						}
						if eventID == segment.release.EventID {
							reason, kind = "authoritative release for bounded pointer-jitter click", "consumed"
							if action.Kind == "drag" {
								reason = "authoritative release for straight drag"
								if action.Source.Basis == recorderTextSelectionDragBasis {
									reason = "authoritative release for natural near-linear text selection"
								}
							}
						}
						disposition[eventID] = recorderEventDisposition{EventID: eventID, Disposition: kind, ActionID: action.ID, Reason: reason}
					}
				} else {
					issues = appendIssue(issues, recorderIssue{Code: "drag-unsupported", Severity: "error", Message: "drag path is outside the verified straight-line basic subset", EventID: segment.dragged[0].EventID})
					disposition[segment.press.EventID] = recorderEventDisposition{EventID: segment.press.EventID, Disposition: "pending", Reason: "part of unsupported drag"}
					disposition[segment.release.EventID] = recorderEventDisposition{EventID: segment.release.EventID, Disposition: "pending", Reason: "part of unsupported drag"}
				}
			}
			delete(segments, button)
		}
	}
	for index := range events {
		event := events[index]
		var priorClicked *recorderRawEvent
		if event.LibraryEvent == "MOUSE_CLICKED" {
			if prior, ok := lastClicked[event.Button]; ok {
				copy := prior
				priorClicked = &copy
			}
			lastClicked[event.Button] = event
		}
		if _, exists := disposition[event.EventID]; !exists {
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "not classified"}
		}
		if event.LibraryEvent != "MOUSE_WHEEL" {
			flushWheel()
		}
		if _, covered := textEditByEvent[event.EventID]; covered {
			flushText()
			if edit, first := textEditByFirstEvent[event.EventID]; first {
				id := fmt.Sprintf("a%04d", len(actions)+1)
				firstEvent, lastEvent := eventsByID[edit.SourceEventIDs[0]], eventsByID[edit.SourceEventIDs[len(edit.SourceEventIDs)-1]]
				action := recorderAction{
					ID: id, Kind: "text-edit", Source: recorderActionSource{EventIDs: append([]string(nil), edit.SourceEventIDs...), Basis: recorderTextEditBasis},
					Timing:   recorderTiming(firstEvent, lastEvent),
					Target:   &recorderActionTarget{Kind: "editable", Resolution: "application-identity+window-title+accessibility-selector", Window: recorderCloneWindowSnapshot(edit.Window), SemanticStatus: "verified", Editable: recorderCloneElementDescriptor(edit.Element)},
					Args:     recorderActionArguments{EditSemantics: "replace-value-range", TextEdit: &recorderTextActionArguments{Before: edit.Before, Patch: edit.Patch, After: edit.After}},
					Strategy: "accessibility.setValue", Review: recorderActionReview{Required: false, Status: "not-required"},
				}
				actions = append(actions, action)
				for sourceIndex, eventID := range edit.SourceEventIDs {
					kind, reason := "evidence", "keyboard evidence covered by verified focused value transition"
					if sourceIndex == 0 {
						kind, reason = "consumed", "authoritative source boundary for verified focused value transition"
					}
					disposition[eventID] = recorderEventDisposition{EventID: eventID, Disposition: kind, ActionID: id, Reason: reason}
				}
				if recorderTextEditHasAmbiguousIMEBoundary(edit, eventsByID) {
					issues = appendIssue(issues, recorderIssue{Code: "ime-boundary-ambiguous", Severity: "error", Message: "a non-ASCII text commit shares Enter or Tab evidence, so Recorder cannot prove that replaying only the value edit preserves the key's application side effect", EventID: event.EventID})
				}
			}
			continue
		}
		if reason, excluded := controlExclusions[event.EventID]; excluded {
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: reason}
			continue
		}
		if reason, excluded := startPointerExclusions[event.EventID]; excluded {
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: reason}
			continue
		}
		skipReleasedButton := ""
		if event.LibraryEvent == "MOUSE_CLICKED" {
			skipReleasedButton = event.Button
		}
		finalizeReleased(skipReleasedButton)
		switch event.LibraryEvent {
		case "RECORDER_PAUSED":
			flushText()
			for _, mouse := range segments {
				if mouse != nil && mouse.press != nil && mouse.release == nil {
					issues = appendIssue(issues, recorderIssue{Code: "input-open-at-pause", Severity: "error", Message: "a mouse press crossed an explicit pause boundary", EventID: mouse.press.EventID})
					disposition[mouse.press.EventID] = recorderEventDisposition{EventID: mouse.press.EventID, Disposition: "pending", Reason: "mouse press crossed a pause boundary"}
				}
			}
			for _, presses := range pressedKeys {
				for _, pressed := range presses {
					issues = appendIssue(issues, recorderIssue{Code: "input-open-at-pause", Severity: "error", Message: "a key press crossed an explicit pause boundary", EventID: pressed.EventID})
					disposition[pressed.EventID] = recorderEventDisposition{EventID: pressed.EventID, Disposition: "pending", Reason: "key press crossed a pause boundary"}
				}
			}
			segments = map[string]*recorderMouseSegment{}
			pressedKeys = map[uint16][]recorderRawEvent{}
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: "explicit recording pause boundary"}
		case "RECORDER_RESUMED":
			flushText()
			segments = map[string]*recorderMouseSegment{}
			pressedKeys = map[uint16][]recorderRawEvent{}
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: "explicit recording resume boundary"}
		case "MOUSE_PRESSED":
			flushText()
			if prior := segments[event.Button]; prior != nil && prior.release == nil {
				issues = appendIssue(issues, recorderIssue{Code: "unpaired-mouse-press", Severity: "error", Message: "a mouse press was replaced before its release", EventID: prior.press.EventID})
			}
			copy := event
			segments[event.Button] = &recorderMouseSegment{button: event.Button, press: &copy}
		case "MOUSE_DRAGGED":
			flushText()
			segment, ambiguous := recorderMotionSegment(segments, event)
			if segment == nil {
				code, message := "drag-without-press", "drag input has no matching press"
				if ambiguous {
					code, message = "ambiguous-button-motion", "drag input cannot be associated with one held mouse button"
				}
				issues = appendIssue(issues, recorderIssue{Code: code, Severity: "error", Message: message, EventID: event.EventID})
			} else {
				segment.motion = append(segment.motion, event)
				segment.dragged = append(segment.dragged, event)
			}
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "drag generation is unsupported"}
		case "MOUSE_MOVED":
			if segment, ambiguous := recorderMotionSegment(segments, event); segment != nil {
				segment.motion = append(segment.motion, event)
				if event.ModifierMask&((1<<8)|(1<<9)|(1<<10)|(1<<11)|(1<<12)) != 0 {
					segment.dragged = append(segment.dragged, event)
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "button-held motion is not a plain click"}
					break
				}
			} else if ambiguous {
				issues = appendIssue(issues, recorderIssue{Code: "ambiguous-button-motion", Severity: "error", Message: "motion cannot be associated with one held mouse button", EventID: event.EventID})
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "ambiguous held-button motion"}
				break
			}
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: "sampled movement is observation-only"}
		case "MOUSE_RELEASED":
			flushText()
			segment := segments[event.Button]
			if segment == nil || segment.press == nil {
				issues = appendIssue(issues, recorderIssue{Code: "release-without-press", Severity: "error", Message: "mouse release has no matching press", EventID: event.EventID})
			} else {
				copy := event
				segment.release = &copy
			}
		case "MOUSE_CLICKED":
			flushText()
			segment := segments[event.Button]
			action, eventIssues := recorderBuildClickAction(event, segment, priorClicked, len(actions)+1)
			issues = appendIssues(issues, eventIssues)
			if action != nil {
				actions = append(actions, *action)
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "consumed", ActionID: action.ID, Reason: "authoritative CLICKED event"}
				if segment != nil && segment.press != nil {
					disposition[segment.press.EventID] = recorderEventDisposition{EventID: segment.press.EventID, Disposition: "evidence", ActionID: action.ID, Reason: "press evidence for click"}
				}
				if segment != nil && segment.release != nil {
					disposition[segment.release.EventID] = recorderEventDisposition{EventID: segment.release.EventID, Disposition: "evidence", ActionID: action.ID, Reason: "release evidence for click"}
				}
			} else {
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "click is outside the basic supported subset"}
			}
			delete(segments, event.Button)
		case "MOUSE_WHEEL":
			flushText()
			if _, _, ok := recorderWheelDelta(event); !ok {
				flushWheel()
				code, message := "wheel-invalid", "wheel input is missing a supported axis, non-zero delta, or verified coordinate"
				if event.ModifierMask&((1<<13)-1) != 0 {
					code, message = "wheel-modified-unsupported", "wheel input with a held modifier or mouse button cannot be replayed safely"
				}
				issues = appendIssue(issues, recorderIssue{Code: code, Severity: "error", Message: message, EventID: event.EventID})
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: message}
				continue
			}
			if !recorderWheelEventsCanGroup(wheelEvents, event) {
				flushWheel()
			}
			wheelEvents = append(wheelEvents, event)
		case "KEY_TYPED":
			char, ok := recorderBasicCharacter(event)
			native := recorderNativeTimeValue(event)
			if !ok || recorderHasControlModifier(event.ModifierMask) {
				flushText()
				code := "typed-text-unsupported"
				message := "KEY_TYPED does not provide a supported basic-latin insertion"
				if event.Keychar != nil && *event.Keychar == 0xffff {
					code, message = "composition-unsupported", "composition/dead-key input is not a reliable committed text source"
				}
				issues = appendIssue(issues, recorderIssue{Code: code, Severity: "error", Message: message, EventID: event.EventID})
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: message}
				continue
			}
			if len(text.events) > 0 && (native < text.lastNative || native-text.lastNative > 1000 || text.text.Len()+len(char) > recorderMaxTextActionRunes) {
				flushText()
			}
			if len(text.events) == 0 {
				text.firstNative = native
			}
			text.lastNative = native
			text.events = append(text.events, event)
			text.text.WriteString(char)
		case "KEY_PRESSED", "KEY_RELEASED":
			if event.Keycode == nil {
				issues = appendIssue(issues, recorderIssue{Code: "keycode-missing", Severity: "error", Message: "physical keyboard event is missing keycode", EventID: event.EventID})
				continue
			}
			if recorderIsModifierKey(*event.Keycode) {
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "evidence", Reason: "modifier state evidence only"}
			} else if recorderHasControlModifier(event.ModifierMask) {
				flushText()
				if event.LibraryEvent == "KEY_PRESSED" {
					pressedKeys[*event.Keycode] = append(pressedKeys[*event.Keycode], event)
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "shortcut press awaiting release"}
					continue
				}
				presses := pressedKeys[*event.Keycode]
				delete(pressedKeys, *event.Keycode)
				name, supported := recorderKeyName(*event.Keycode)
				if len(presses) == 0 || !supported || len(presses) > recorderMaximumKeyRepeatCount {
					issues = appendIssue(issues, recorderIssue{Code: "shortcut-unsupported", Severity: "error", Message: "modifier shortcut has no matching supported primary-key press", EventID: event.EventID})
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "unsupported shortcut release"}
					continue
				}
				press := presses[0]
				id := fmt.Sprintf("a%04d", len(actions)+1)
				keys := recorderShortcutKeys(press.ModifierMask|event.ModifierMask, name)
				if !recorderRepeatedKeyPressesMatchKeys(presses, keys) {
					issues = appendIssue(issues, recorderIssue{Code: "physical-key-modifiers-changed", Severity: "error", Message: "repeated primary-key presses do not share one stable modifier chord", EventID: event.EventID})
					for _, item := range presses {
						disposition[item.EventID] = recorderEventDisposition{EventID: item.EventID, Disposition: "pending", Reason: "repeated shortcut modifiers changed before release"}
					}
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "repeated shortcut modifiers changed before release"}
					continue
				}
				eventIDs := make([]string, 0, len(presses)+1)
				for _, item := range presses {
					eventIDs = append(eventIDs, item.EventID)
				}
				eventIDs = append(eventIDs, event.EventID)
				args := recorderActionArguments{Keys: keys}
				if len(presses) > 1 {
					args.RepeatCount = len(presses)
				}
				actions = append(actions, recorderAction{
					ID: id, Kind: "shortcut", Source: recorderActionSource{EventIDs: eventIDs, Basis: recorderShortcutBasis},
					Timing: recorderTiming(press, event), Args: args, Strategy: "keyboard.combination",
					Review: recorderActionReview{Required: false, Status: "not-required"},
				})
				for pressIndex, item := range presses {
					kind, reason := "evidence", "repeated primary shortcut press"
					if pressIndex == 0 {
						kind, reason = "consumed", "primary shortcut press"
					}
					disposition[item.EventID] = recorderEventDisposition{EventID: item.EventID, Disposition: kind, ActionID: id, Reason: reason}
				}
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "evidence", ActionID: id, Reason: "primary shortcut release"}
			} else if event.Rawcode != nil && typedRawcodes[eventSegments[event.EventID]][*event.Rawcode] {
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "evidence", Reason: "physical key event is not replayed in addition to text"}
			} else {
				flushText()
				if event.LibraryEvent == "KEY_PRESSED" {
					pressedKeys[*event.Keycode] = append(pressedKeys[*event.Keycode], event)
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "physical key press awaiting release"}
					continue
				}
				presses := pressedKeys[*event.Keycode]
				delete(pressedKeys, *event.Keycode)
				name, supported := recorderKeyName(*event.Keycode)
				if len(presses) == 0 || len(presses) > recorderMaximumKeyRepeatCount || !supported || !recorderIsReplayableSpecialKey(name) {
					issues = appendIssue(issues, recorderIssue{Code: "physical-key-unsupported", Severity: "error", Message: "physical key without supported text or special-key semantics cannot be generated", EventID: event.EventID})
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "physical key generation is unsupported"}
					continue
				}
				press := presses[0]
				id := fmt.Sprintf("a%04d", len(actions)+1)
				kind, strategy, args := "key", "keyboard.press", recorderActionArguments{Key: name}
				basis := recorderSpecialKeyBasis
				if press.ModifierMask&((1<<0)|(1<<4)) != 0 {
					kind, strategy, args, basis = "shortcut", "keyboard.combination", recorderActionArguments{Keys: recorderShortcutKeys(press.ModifierMask|event.ModifierMask, name)}, recorderShortcutBasis
				}
				expectedKeys := []string{name}
				if kind == "shortcut" {
					expectedKeys = args.Keys
				}
				if !recorderRepeatedKeyPressesMatchKeys(presses, expectedKeys) {
					issues = appendIssue(issues, recorderIssue{Code: "physical-key-modifiers-changed", Severity: "error", Message: "repeated primary-key presses do not share one stable modifier chord", EventID: event.EventID})
					for _, item := range presses {
						disposition[item.EventID] = recorderEventDisposition{EventID: item.EventID, Disposition: "pending", Reason: "repeated key modifiers changed before release"}
					}
					disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "repeated key modifiers changed before release"}
					continue
				}
				if len(presses) > 1 {
					args.RepeatCount = len(presses)
				}
				eventIDs := make([]string, 0, len(presses)+1)
				for _, item := range presses {
					eventIDs = append(eventIDs, item.EventID)
				}
				eventIDs = append(eventIDs, event.EventID)
				actions = append(actions, recorderAction{
					ID: id, Kind: kind, Source: recorderActionSource{EventIDs: eventIDs, Basis: basis},
					Timing: recorderTiming(press, event), Args: args, Strategy: strategy,
					Review: recorderActionReview{Required: false, Status: "not-required"},
				})
				for pressIndex, item := range presses {
					kind, reason := "evidence", "repeated physical key press"
					if pressIndex == 0 {
						kind, reason = "consumed", "physical key press"
					}
					disposition[item.EventID] = recorderEventDisposition{EventID: item.EventID, Disposition: kind, ActionID: id, Reason: reason}
				}
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "evidence", ActionID: id, Reason: "physical key release"}
			}
			if event.Keycode != nil {
				if event.LibraryEvent == "KEY_PRESSED" {
					pressedKeys[*event.Keycode] = append(pressedKeys[*event.Keycode], event)
				} else {
					delete(pressedKeys, *event.Keycode)
				}
			}
		default:
			flushText()
			issues = appendIssue(issues, recorderIssue{Code: "unknown-library-event", Severity: "error", Message: "unknown libuiohook event kind", EventID: event.EventID})
		}
	}
	flushWheel()
	flushText()
	finalizeReleased("")
	for _, segment := range segments {
		if segment.press != nil && segment.release == nil {
			issues = appendIssue(issues, recorderIssue{Code: "missing-release-at-stop", Severity: "error", Message: "recording stopped before a matching mouse release", EventID: segment.press.EventID})
			disposition[segment.press.EventID] = recorderEventDisposition{EventID: segment.press.EventID, Disposition: "pending", Reason: "missing release at recording boundary"}
		}
	}
	for _, presses := range pressedKeys {
		for _, pressed := range presses {
			issues = appendIssue(issues, recorderIssue{Code: "missing-key-release-at-stop", Severity: "error", Message: "recording stopped before a matching key release", EventID: pressed.EventID})
			disposition[pressed.EventID] = recorderEventDisposition{EventID: pressed.EventID, Disposition: "pending", Reason: "missing key release at recording boundary"}
		}
	}
	recorderAssociateKeyboardEvidence(events, actions, disposition, eventSegments)
	// Rebind every action-linked disposition from the stable source sequence,
	// including evidence rows and events with equal native timestamps.
	sourceToAction := map[string]string{}
	for _, action := range actions {
		for _, eventID := range action.Source.EventIDs {
			sourceToAction[eventID] = action.ID
		}
	}
	for eventID, item := range disposition {
		if actionID, ok := sourceToAction[eventID]; ok && (item.Disposition == "consumed" || item.Disposition == "evidence") {
			item.ActionID = actionID
			disposition[eventID] = item
		}
	}
	ordered := make([]recorderEventDisposition, 0, len(events))
	for _, event := range events {
		item := disposition[event.EventID]
		if item.Disposition == "pending" {
			issues = appendIssue(issues, recorderIssue{Code: "unresolved-event", Severity: "error", Message: "an input event has no supported action or explicit exclusion", EventID: event.EventID})
			item.Disposition = "omitted"
			item.ActionID = ""
		}
		if item.Disposition == "evidence" && item.ActionID == "" {
			issues = appendIssue(issues, recorderIssue{Code: "unassociated-key-evidence", Severity: "error", Message: "keyboard state evidence is not associated with a supported text action", EventID: event.EventID})
			item.Disposition = "omitted"
			item.ActionID = ""
		}
		ordered = append(ordered, item)
	}
	if len(actions) == 0 {
		issues = appendIssue(issues, recorderIssue{Code: "no-supported-actions", Severity: "warning", Message: "the recording contains no action in the basic supported subset"})
	}
	return actions, ordered, issues
}

func recorderAssociateKeyboardEvidence(events []recorderRawEvent, actions []recorderAction, disposition map[string]recorderEventDisposition, eventSegments map[string]int) {
	eventByID := make(map[string]recorderRawEvent, len(events))
	typedRawcodes := make([]map[uint16]bool, len(actions))
	modifierMasks := make([]uint16, len(actions))
	for _, event := range events {
		eventByID[event.EventID] = event
	}
	for index := range actions {
		if actions[index].Kind != "text" && actions[index].Kind != "text-edit" && actions[index].Kind != "shortcut" {
			continue
		}
		typedRawcodes[index] = map[uint16]bool{}
		for _, eventID := range actions[index].Source.EventIDs {
			if source, ok := eventByID[eventID]; ok {
				modifierMasks[index] |= source.ModifierMask
				if source.Rawcode != nil && (source.LibraryEvent == "KEY_TYPED" || actions[index].Kind == "text-edit") {
					typedRawcodes[index][*source.Rawcode] = true
				}
			}
		}
	}
	for _, event := range events {
		item := disposition[event.EventID]
		if item.Disposition != "evidence" || item.ActionID != "" || (event.LibraryEvent != "KEY_PRESSED" && event.LibraryEvent != "KEY_RELEASED") {
			continue
		}
		best, bestGap := -1, uint64(1001)
		eventTime := recorderNativeTimeValue(event)
		for index := range actions {
			if actions[index].Kind != "text" && actions[index].Kind != "text-edit" && actions[index].Kind != "shortcut" {
				continue
			}
			if len(actions[index].Source.EventIDs) == 0 || eventSegments[actions[index].Source.EventIDs[0]] != eventSegments[event.EventID] {
				continue
			}
			matchesRawcode := actions[index].Kind != "shortcut" && event.Rawcode != nil && typedRawcodes[index][*event.Rawcode]
			matchesModifier := false
			if event.Keycode != nil && recorderIsModifierKey(*event.Keycode) {
				name, mask, ok := recorderModifierKey(*event.Keycode)
				if ok {
					matchesModifier = modifierMasks[index]&mask != 0
					if actions[index].Kind == "shortcut" {
						matchesModifier = recorderStringSliceContains(actions[index].Args.Keys, name)
					}
				}
			}
			if !matchesRawcode && !matchesModifier {
				continue
			}
			start := recorderActionTimeMilliseconds(actions[index].Timing.NativeStart, actions[index].Timing.NativeUnit)
			end := recorderActionTimeMilliseconds(actions[index].Timing.NativeEnd, actions[index].Timing.NativeUnit)
			var gap uint64
			if eventTime < start {
				gap = start - eventTime
			} else if eventTime > end {
				gap = eventTime - end
			}
			if gap < bestGap {
				best, bestGap = index, gap
			}
		}
		if best < 0 || bestGap > 1000 {
			continue
		}
		item.ActionID = actions[best].ID
		disposition[event.EventID] = item
		actions[best].Source.EventIDs = append(actions[best].Source.EventIDs, event.EventID)
	}
	for index := range actions {
		if actions[index].Kind != "text" && actions[index].Kind != "text-edit" && actions[index].Kind != "shortcut" {
			continue
		}
		sort.SliceStable(actions[index].Source.EventIDs, func(left, right int) bool {
			return recorderNativeStringValue(eventByID[actions[index].Source.EventIDs[left]].Sequence) < recorderNativeStringValue(eventByID[actions[index].Source.EventIDs[right]].Sequence)
		})
		first := eventByID[actions[index].Source.EventIDs[0]]
		last := eventByID[actions[index].Source.EventIDs[len(actions[index].Source.EventIDs)-1]]
		actions[index].Timing = recorderTiming(first, last)
	}
}

func recorderModifierKey(code uint16) (string, uint16, bool) {
	switch code {
	case 0x002a:
		return "Shift", 1 << 0, true
	case 0x0036:
		return "Shift", 1 << 4, true
	case 0x001d:
		return "Control", 1 << 1, true
	case 0x0e1d:
		return "Control", 1 << 5, true
	case 0x0e5b:
		return "Meta", 1 << 2, true
	case 0x0e5c:
		return "Meta", 1 << 6, true
	case 0x0038:
		return "Alt", 1 << 3, true
	case 0x0e38:
		return "Alt", 1 << 7, true
	default:
		return "", 0, false
	}
}

func recorderStringSliceContains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func recorderValidShortcutKeys(keys []string) bool {
	if len(keys) < 2 || len(keys) > 5 {
		return false
	}
	seen := map[string]bool{}
	for _, key := range keys[:len(keys)-1] {
		if key != "Control" && key != "Meta" && key != "Alt" && key != "Shift" || seen[key] {
			return false
		}
		seen[key] = true
	}
	primary := keys[len(keys)-1]
	return primary != "" && !seen[primary] && primary != "Control" && primary != "Meta" && primary != "Alt" && primary != "Shift"
}

func recorderEffectiveKeyRepeatCount(value int) (int, bool) {
	if value == 0 {
		return 1, true
	}
	if value < 2 || value > recorderMaximumKeyRepeatCount {
		return 0, false
	}
	return value, true
}

func recorderRepeatedKeyPressesMatchKeys(presses []recorderRawEvent, keys []string) bool {
	if len(presses) == 0 || len(keys) == 0 {
		return false
	}
	primary := keys[len(keys)-1]
	for _, press := range presses {
		if press.LibraryEvent != "KEY_PRESSED" || !reflect.DeepEqual(recorderShortcutKeys(press.ModifierMask, primary), keys) {
			return false
		}
	}
	return true
}

func recorderValidPhysicalKeySources(events []recorderRawEvent, primary string, expectedModifiers []string, repeatCount int) bool {
	expectedPresses, ok := recorderEffectiveKeyRepeatCount(repeatCount)
	if !ok {
		return false
	}
	expectedKeys := append(append([]string(nil), expectedModifiers...), primary)
	expectedModifier := make(map[string]bool, len(expectedModifiers))
	for _, modifier := range expectedModifiers {
		expectedModifier[modifier] = true
	}
	primaryPressed, primaryReleased := 0, 0
	modifierPressed := map[string]int{}
	modifierReleased := map[string]int{}
	for _, event := range events {
		if event.Keycode == nil || (event.LibraryEvent != "KEY_PRESSED" && event.LibraryEvent != "KEY_RELEASED") {
			return false
		}
		if modifier, _, ok := recorderModifierKey(*event.Keycode); ok {
			if !expectedModifier[modifier] {
				return false
			}
			if event.LibraryEvent == "KEY_PRESSED" {
				modifierPressed[modifier]++
			} else {
				modifierReleased[modifier]++
			}
			continue
		}
		name, ok := recorderKeyName(*event.Keycode)
		if !ok || name != primary {
			return false
		}
		if event.LibraryEvent == "KEY_PRESSED" {
			if !reflect.DeepEqual(recorderShortcutKeys(event.ModifierMask, primary), expectedKeys) {
				return false
			}
			primaryPressed++
		} else {
			releaseKeys := recorderShortcutKeys(event.ModifierMask, primary)
			for _, modifier := range releaseKeys[:len(releaseKeys)-1] {
				if !expectedModifier[modifier] {
					return false
				}
			}
			primaryReleased++
		}
	}
	if primaryPressed != expectedPresses || primaryReleased != 1 {
		return false
	}
	for _, modifier := range expectedModifiers {
		if modifierPressed[modifier] != 1 || modifierReleased[modifier] != 1 {
			return false
		}
	}
	return len(modifierPressed) == len(expectedModifiers) && len(modifierReleased) == len(expectedModifiers)
}

func recorderBuildClickAction(clicked recorderRawEvent, segment *recorderMouseSegment, priorClicked *recorderRawEvent, ordinal int) (*recorderAction, []recorderIssue) {
	issues := make([]recorderIssue, 0)
	fail := func(code, message string) {
		issues = appendIssue(issues, recorderIssue{Code: code, Severity: "error", Message: message, EventID: clicked.EventID})
	}
	if clicked.Button != "left" {
		fail("mouse-button-unsupported", "basic generation only supports the left mouse button")
	}
	if clicked.Clicks == 0 {
		fail("click-count-invalid", "CLICKED has no positive native click-series count")
	} else if recorderContinuesSpatialMultiClick(priorClicked, clicked) {
		fail("click-count-unsupported", "a spatial double-click or multi-click sequence is not downgraded to independent clicks")
	}
	if clicked.ModifierMask&((1<<1)|(1<<2)|(1<<3)|(1<<5)|(1<<6)|(1<<7)) != 0 {
		fail("modified-click-unsupported", "control/meta/alt click is not downgraded to a plain click")
	}
	if clicked.X == nil || clicked.Y == nil || !clicked.CoordinateVerified || clicked.CoordinateSpace != "screen-logical" || clicked.DisplayRef == "" {
		fail("coordinate-unverified", "click has no verified screen-logical coordinate")
	}
	if segment == nil || segment.press == nil {
		fail("click-missing-press", "CLICKED has no matching press evidence")
	}
	if segment == nil || segment.release == nil {
		fail("click-missing-release", "CLICKED has no matching release evidence")
	}
	if segment != nil && segment.press != nil && segment.release != nil &&
		(segment.press.Clicks != clicked.Clicks || segment.release.Clicks != clicked.Clicks) {
		fail("click-count-inconsistent", "press, release, and CLICKED do not share one native click-series count")
	}
	if segment != nil && len(segment.dragged) > 0 {
		fail("drag-not-click", "a dragged segment is not downgraded to a click")
	}
	if segment != nil && segment.press != nil && segment.release != nil && segment.press.X != nil && segment.press.Y != nil && clicked.X != nil && clicked.Y != nil {
		points := append([]recorderRawEvent(nil), segment.motion...)
		points = append(points, *segment.release)
		for _, point := range points {
			if point.X != nil && point.Y != nil && recorderPointDistanceSquared(*segment.press.X, *segment.press.Y, *point.X, *point.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
				fail("motion-path-not-click", "pointer motion exceeded the basic click jitter boundary and is not downgraded to a click")
				break
			}
		}
		if recorderPointDistanceSquared(*segment.press.X, *segment.press.Y, *clicked.X, *clicked.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
			fail("click-path-inconsistent", "CLICKED coordinates do not match the associated press within the basic jitter boundary")
		}
	}
	if segment != nil && segment.press != nil && segment.release != nil {
		start, end := recorderNativeTimeValue(*segment.press), recorderNativeTimeValue(*segment.release)
		if end < start || end-start > 2000 {
			fail("long-press-unsupported", "long or invalid press timing is outside the basic click subset")
		}
	}
	if len(issues) > 0 {
		return nil, issues
	}
	source := []string{segment.press.EventID, segment.release.EventID, clicked.EventID}
	return &recorderAction{
		ID: fmt.Sprintf("a%04d", ordinal), Kind: "click",
		Source:   recorderActionSource{EventIDs: source, Basis: recorderClickedBasis},
		Timing:   recorderTiming(*segment.press, clicked),
		Position: &recorderActionPosition{X: *clicked.X, Y: *clicked.Y, Space: "screen-logical", DisplayRef: clicked.DisplayRef, Verified: true},
		Args:     recorderActionArguments{Button: "left", ClickCount: 1}, Strategy: "mouse.click",
		Review: recorderActionReview{Required: false, Status: "not-required"},
	}, issues
}

// libuiohook's click count is a time/button series counter, not the number of
// physical clicks represented by one CLICKED event. In particular, its macOS,
// Windows, and X11 backends increment the counter without comparing pointer
// coordinates, so two quick clicks on different controls can arrive as counts
// 1 and 2. Every complete press/release/CLICKED envelope still represents one
// physical click. Only a continued series at the same point is treated as an
// intentional multi-click and kept outside the basic generation subset.
func recorderContinuesSpatialMultiClick(prior *recorderRawEvent, clicked recorderRawEvent) bool {
	if prior == nil || clicked.Clicks <= 1 || prior.Clicks+1 != clicked.Clicks ||
		prior.Button != clicked.Button || prior.X == nil || prior.Y == nil || clicked.X == nil || clicked.Y == nil ||
		!prior.CoordinateVerified || !clicked.CoordinateVerified || prior.CoordinateSpace != "screen-logical" ||
		clicked.CoordinateSpace != "screen-logical" || prior.DisplayRef == "" || prior.DisplayRef != clicked.DisplayRef {
		return false
	}
	return recorderPointDistanceSquared(*prior.X, *prior.Y, *clicked.X, *clicked.Y) <= recorderClickJitterPixels*recorderClickJitterPixels
}

func recorderBuildJitterClickAction(segment *recorderMouseSegment, ordinal int) *recorderAction {
	if segment == nil || segment.press == nil || segment.release == nil || segment.button != "left" || len(segment.dragged) == 0 {
		return nil
	}
	press, release := *segment.press, *segment.release
	if press.Button != "left" || release.Button != "left" || press.Clicks != 1 || release.Clicks != 1 ||
		press.X == nil || press.Y == nil || release.X == nil || release.Y == nil ||
		!press.CoordinateVerified || !release.CoordinateVerified || press.CoordinateSpace != "screen-logical" ||
		release.CoordinateSpace != "screen-logical" || press.DisplayRef == "" || release.DisplayRef != press.DisplayRef ||
		recorderHasControlModifier(press.ModifierMask) || recorderHasControlModifier(release.ModifierMask) {
		return nil
	}
	start, end := recorderNativeTimeValue(press), recorderNativeTimeValue(release)
	if end < start || end-start > 2000 {
		return nil
	}
	sourceEvents := make([]recorderRawEvent, 0, len(segment.motion)+2)
	sourceEvents = append(sourceEvents, press)
	for _, motion := range segment.motion {
		if motion.X == nil || motion.Y == nil || !motion.CoordinateVerified || motion.CoordinateSpace != "screen-logical" ||
			motion.DisplayRef != press.DisplayRef || recorderHasControlModifier(motion.ModifierMask) ||
			recorderPointDistanceSquared(*press.X, *press.Y, *motion.X, *motion.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
			return nil
		}
		sourceEvents = append(sourceEvents, motion)
	}
	if recorderPointDistanceSquared(*press.X, *press.Y, *release.X, *release.Y) > recorderClickJitterPixels*recorderClickJitterPixels {
		return nil
	}
	sourceEvents = append(sourceEvents, release)
	eventIDs := make([]string, 0, len(sourceEvents))
	for _, event := range sourceEvents {
		eventIDs = append(eventIDs, event.EventID)
	}
	return &recorderAction{
		ID: fmt.Sprintf("a%04d", ordinal), Kind: "click",
		Source:   recorderActionSource{EventIDs: eventIDs, Basis: recorderJitterClickBasis},
		Timing:   recorderTiming(press, release),
		Position: &recorderActionPosition{X: *release.X, Y: *release.Y, Space: "screen-logical", DisplayRef: release.DisplayRef, Verified: true},
		Args:     recorderActionArguments{Button: "left", ClickCount: 1}, Strategy: "mouse.click",
		Review: recorderActionReview{Required: false, Status: "not-required"},
	}
}

func recorderBuildDragAction(segment *recorderMouseSegment, ordinal int, contexts map[string]recorderInputContext) *recorderAction {
	if segment == nil || segment.press == nil || segment.release == nil || segment.button != "left" || len(segment.dragged) == 0 {
		return nil
	}
	press, release := *segment.press, *segment.release
	if press.Button != "left" || release.Button != "left" || !recorderValidDragReleaseClickCount(press.Clicks, release.Clicks) ||
		press.X == nil || press.Y == nil || release.X == nil || release.Y == nil ||
		!press.CoordinateVerified || !release.CoordinateVerified || press.CoordinateSpace != "screen-logical" ||
		release.CoordinateSpace != "screen-logical" || press.DisplayRef == "" || release.DisplayRef != press.DisplayRef ||
		recorderHasControlModifier(press.ModifierMask) || recorderHasControlModifier(release.ModifierMask) ||
		recorderPointDistanceSquared(*press.X, *press.Y, *release.X, *release.Y) <= recorderClickJitterPixels*recorderClickJitterPixels {
		return nil
	}
	start, end := recorderNativeTimeValue(press), recorderNativeTimeValue(release)
	if end < start || end-start > recorderMaximumDragDurationMS {
		return nil
	}
	lineLength := math.Sqrt(float64(recorderPointDistanceSquared(*press.X, *press.Y, *release.X, *release.Y)))
	sourceEvents, valid := recorderVerifiedDragPath(segment, press, release, float64(recorderDragLineTolerancePixels), 0)
	basis := recorderDragBasis
	if !valid {
		pressContext, pressOK := contexts[press.EventID]
		releaseContext, releaseOK := contexts[release.EventID]
		if !pressOK || !releaseOK || !recorderSameEditableInput(&pressContext, &releaseContext) {
			return nil
		}
		tolerance := math.Max(float64(recorderDragLineTolerancePixels), lineLength*recorderTextSelectionDragLineToleranceRatio)
		tolerance = math.Min(tolerance, float64(recorderTextSelectionDragMaximumLineTolerancePixels))
		sourceEvents, valid = recorderVerifiedDragPath(segment, press, release, tolerance, recorderTextSelectionDragMaximumPathRatio)
		if !valid {
			return nil
		}
		basis = recorderTextSelectionDragBasis
	}
	eventIDs := make([]string, 0, len(sourceEvents))
	for _, event := range sourceEvents {
		eventIDs = append(eventIDs, event.EventID)
	}
	steps := len(segment.motion)
	if steps < 2 {
		steps = 2
	}
	if steps > recorderMaximumDragSteps {
		steps = recorderMaximumDragSteps
	}
	return &recorderAction{
		ID: fmt.Sprintf("a%04d", ordinal), Kind: "drag",
		Source:      recorderActionSource{EventIDs: eventIDs, Basis: basis},
		Timing:      recorderTiming(press, release),
		Position:    &recorderActionPosition{X: *press.X, Y: *press.Y, Space: "screen-logical", DisplayRef: press.DisplayRef, Verified: true},
		Destination: &recorderActionPosition{X: *release.X, Y: *release.Y, Space: "screen-logical", DisplayRef: release.DisplayRef, Verified: true},
		Args:        recorderActionArguments{Button: "left", Steps: steps}, Strategy: "mouse.drag",
		Review: recorderActionReview{Required: false, Status: "not-required"},
	}
}

// Darwin reports the press-side click-series count for a drag, but a drag
// release that does not become MOUSE_CLICKED can legitimately carry the
// libuiohook zero/default. Accept only that documented absence or the exact
// press count. A positive conflicting release count remains invalid, and the
// raw press/release events stay in the action source for strict regeneration.
func recorderValidDragReleaseClickCount(press, release uint16) bool {
	return press > 0 && (release == 0 || release == press)
}

func recorderVerifiedDragPath(segment *recorderMouseSegment, press, release recorderRawEvent, lineTolerance, maximumPathRatio float64) ([]recorderRawEvent, bool) {
	if press.X == nil || press.Y == nil || release.X == nil || release.Y == nil || lineTolerance < 0 {
		return nil, false
	}
	lineLength := math.Sqrt(float64(recorderPointDistanceSquared(*press.X, *press.Y, *release.X, *release.Y)))
	if lineLength == 0 {
		return nil, false
	}
	sourceEvents := make([]recorderRawEvent, 0, len(segment.motion)+2)
	sourceEvents = append(sourceEvents, press)
	priorProgress := 0.0
	progressTolerance := float64(recorderDragLineTolerancePixels) / lineLength
	pathLength := 0.0
	priorX, priorY := *press.X, *press.Y
	for _, motion := range segment.motion {
		if (motion.LibraryEvent != "MOUSE_DRAGGED" && motion.LibraryEvent != "MOUSE_MOVED") ||
			(motion.Button != "" && motion.Button != "none" && motion.Button != "left") ||
			(motion.Clicks != 0 && motion.Clicks != press.Clicks) || motion.X == nil || motion.Y == nil ||
			!motion.CoordinateVerified || motion.CoordinateSpace != "screen-logical" || motion.DisplayRef != press.DisplayRef ||
			recorderHasControlModifier(motion.ModifierMask) {
			return nil, false
		}
		progress, distanceSquared := recorderPointSegmentProgressAndDistanceSquared(*motion.X, *motion.Y, *press.X, *press.Y, *release.X, *release.Y)
		if distanceSquared > lineTolerance*lineTolerance || progress < -progressTolerance || progress > 1+progressTolerance || progress+progressTolerance < priorProgress {
			return nil, false
		}
		if progress > priorProgress {
			priorProgress = progress
		}
		pathLength += math.Hypot(float64(*motion.X-priorX), float64(*motion.Y-priorY))
		priorX, priorY = *motion.X, *motion.Y
		sourceEvents = append(sourceEvents, motion)
	}
	pathLength += math.Hypot(float64(*release.X-priorX), float64(*release.Y-priorY))
	if maximumPathRatio > 0 && pathLength > lineLength*maximumPathRatio {
		return nil, false
	}
	sourceEvents = append(sourceEvents, release)
	return sourceEvents, true
}

func recorderInputContextsByEventID(contexts []recorderInputContext) map[string]recorderInputContext {
	result := make(map[string]recorderInputContext, len(contexts))
	for _, context := range contexts {
		result[context.EventID] = context
	}
	return result
}

func recorderPointSegmentProgressAndDistanceSquared(x, y, startX, startY, endX, endY int) (float64, float64) {
	dx, dy := float64(endX-startX), float64(endY-startY)
	lengthSquared := dx*dx + dy*dy
	if lengthSquared == 0 {
		return 0, math.Inf(1)
	}
	progress := (float64(x-startX)*dx + float64(y-startY)*dy) / lengthSquared
	projectedX := float64(startX) + progress*dx
	projectedY := float64(startY) + progress*dy
	distanceX, distanceY := float64(x)-projectedX, float64(y)-projectedY
	return progress, distanceX*distanceX + distanceY*distanceY
}

func recorderEnrichActionsWithWindowContext(actions []recorderAction, manifest recorderManifest, events []recorderRawEvent) ([]recorderAction, []recorderIssue) {
	issues := make([]recorderIssue, 0)
	contexts := make(map[string]recorderInputContext, len(manifest.InputContexts))
	for _, context := range manifest.InputContexts {
		contexts[context.EventID] = context
	}
	eventsByID := make(map[string]recorderRawEvent, len(events))
	for _, event := range events {
		eventsByID[event.EventID] = event
	}
	legacy := manifest.FormatVersion == recorderLegacyRecordingFormatVersion
	for index := range actions {
		action := &actions[index]
		if action.Kind == "text-edit" {
			continue
		}
		var context *recorderInputContext
		contextEventID := ""
		if action.Kind == "click" || action.Kind == "drag" {
			for _, eventID := range action.Source.EventIDs {
				if eventsByID[eventID].LibraryEvent == "MOUSE_RELEASED" {
					contextEventID = eventID
					break
				}
			}
		} else if action.Kind == "wheel" {
			for _, eventID := range action.Source.EventIDs {
				if eventsByID[eventID].LibraryEvent == "MOUSE_WHEEL" {
					contextEventID = eventID
					break
				}
			}
		} else if action.Kind == "text" || action.Kind == "shortcut" || action.Kind == "key" {
			for _, eventID := range action.Source.EventIDs {
				if _, ok := contexts[eventID]; ok {
					contextEventID = eventID
					break
				}
			}
		}
		if item, ok := contexts[contextEventID]; ok {
			copy := item
			context = &copy
		}
		displayFallback := action.Kind == "wheel" && (context == nil || context.Status == "unverified")
		displayFallback = displayFallback || ((action.Kind == "click" || action.Kind == "drag") && context != nil && context.Status == "unverified" &&
			context.Reason == "pointer release is outside the resolved active window")
		if displayFallback && action.Position != nil {
			var display *DisplayInfo
			for _, candidate := range manifest.Displays {
				if candidate.ID == action.Position.DisplayRef {
					copy := candidate
					display = &copy
					break
				}
			}
			position := recorderDisplayRelativePosition(action.Position, display)
			destination := recorderDisplayRelativePosition(action.Destination, display)
			if display != nil && position != nil && (action.Kind != "drag" || destination != nil) {
				action.Target = &recorderActionTarget{
					Kind: "display", Resolution: "display-id+hardware-id", Display: display,
					SemanticStatus: "not-applicable",
				}
				if action.Kind == "drag" {
					action.Target.Pointer = recorderBuildPointerEvidence(*action, contexts)
				}
				action.Position.Display = position
				if action.Destination != nil {
					action.Destination.Display = destination
				}
				continue
			}
		}
		if context == nil || context.Status != "verified" || context.Window == nil {
			code, severity, message := "window-context-missing", "error", "the action has no verified application/window context"
			if context != nil && context.Reason != "" {
				code, message = "window-context-unverified", context.Reason
			}
			if legacy {
				code, severity, message = "legacy-screen-only", "warning", "legacy v1 recording has only fixed screen coordinates and must be recorded again for movable-window replay"
			}
			issues = appendIssue(issues, recorderIssue{Code: code, Severity: severity, Message: message, EventID: contextEventID})
			continue
		}
		snapshot := *context.Window
		action.Target = &recorderActionTarget{
			Kind: "window", Resolution: "application-identity+window-title", Window: &snapshot,
			SemanticStatus: context.SemanticStatus, SemanticReason: context.SemanticReason, Element: context.Element,
		}
		if action.Kind == "drag" {
			action.Target.SemanticStatus = "not-applicable"
			action.Target.SemanticReason = ""
			action.Target.Element = nil
			action.Target.Pointer = recorderBuildPointerEvidence(*action, contexts)
		} else if action.Kind == "wheel" {
			action.Target.SemanticStatus = "not-applicable"
			action.Target.SemanticReason = ""
			action.Target.Element = nil
		}
		if (action.Kind != "click" && action.Kind != "drag" && action.Kind != "wheel") || action.Position == nil {
			continue
		}
		position := recorderWindowRelativePosition(action.Position, snapshot.Bounds)
		destination := recorderWindowRelativePosition(action.Destination, snapshot.Bounds)
		if position == nil || (action.Kind == "drag" && destination == nil) {
			issues = appendIssue(issues, recorderIssue{Code: "window-relative-coordinate-invalid", Severity: "error", Message: "pointer action is outside its verified window bounds", EventID: contextEventID})
			continue
		}
		action.Position.Window = position
		if action.Destination != nil {
			action.Destination.Window = destination
		}
	}
	return actions, issues
}

func recorderPointInsideDisplay(x, y int, display DisplayInfo) bool {
	return display.Width > 0 && display.Height > 0 && x >= display.X && x < display.X+display.Width && y >= display.Y && y < display.Y+display.Height
}

func recorderBuildPointerEvidence(action recorderAction, contexts map[string]recorderInputContext) *recorderPointerEvidence {
	var pressContext, releaseContext *recorderInputContext
	for _, eventID := range action.Source.EventIDs {
		context, ok := contexts[eventID]
		if !ok {
			continue
		}
		copy := context
		switch context.Phase {
		case "pressed":
			pressContext = &copy
		case "", "released":
			releaseContext = &copy
		}
	}
	evidence := &recorderPointerEvidence{
		Classification: "drag",
		Press:          recorderPointerEndpoint(pressContext, "pressed"),
		Release:        recorderPointerEndpoint(releaseContext, "released"),
	}
	if recorderSameEditableInput(pressContext, releaseContext) {
		evidence.Classification = "text-selection"
	}
	return evidence
}

func recorderPointerEndpoint(context *recorderInputContext, phase string) *recorderPointerEndpointEvidence {
	if context == nil {
		return nil
	}
	var window *recorderWindowSnapshot
	if context.Window != nil {
		snapshot := *context.Window
		window = &snapshot
	}
	return &recorderPointerEndpointEvidence{
		EventID: context.EventID, Phase: phase, Status: context.Status, Reason: context.Reason,
		Window: window, SemanticStatus: context.SemanticStatus, SemanticReason: context.SemanticReason, Element: context.Element,
	}
}

func recorderSameEditableInput(press, release *recorderInputContext) bool {
	if press == nil || release == nil || press.Status != "verified" || release.Status != "verified" || press.Window == nil || release.Window == nil ||
		press.SemanticStatus != "verified" || release.SemanticStatus != "verified" ||
		!recorderSameRecordedWindow(press.Window, release.Window) ||
		press.Element == nil || release.Element == nil {
		return false
	}
	return recorderSameEditableElement(press.Element, release.Element)
}

func recorderSameRecordedWindow(left, right *recorderWindowSnapshot) bool {
	return left != nil && right != nil && left.ID == right.ID && left.Title == right.Title &&
		left.Application.IdentityKind == right.Application.IdentityKind &&
		left.Application.IdentityValue == right.Application.IdentityValue
}

func recorderSameEditableElement(press, release *recorderElementSnapshot) bool {
	if press == nil || release == nil || press.Role != "textField" || release.Role != "textField" || !press.ValueSettable || !release.ValueSettable {
		return false
	}
	if press.Identifier != "" && release.Identifier != "" {
		return press.Identifier == release.Identifier && press.NativeRole == release.NativeRole
	}
	return press.NativeRole == release.NativeRole && press.Bounds == release.Bounds
}

func recorderWindowRelativePosition(position *recorderActionPosition, bounds recorderWindowBounds) *recorderWindowPosition {
	if position == nil || !recorderPointInsideWindow(position.X, position.Y, bounds) {
		return nil
	}
	offsetX, offsetY := position.X-bounds.X, position.Y-bounds.Y
	return &recorderWindowPosition{
		Anchor: "top-left", OffsetX: offsetX, OffsetY: offsetY,
		XRatio: float64(offsetX) / float64(bounds.Width), YRatio: float64(offsetY) / float64(bounds.Height),
		Space: "window-logical", Verified: true,
	}
}

func recorderDisplayRelativePosition(position *recorderActionPosition, display *DisplayInfo) *recorderDisplayPosition {
	if position == nil || display == nil || !recorderPointInsideDisplay(position.X, position.Y, *display) {
		return nil
	}
	offsetX, offsetY := position.X-display.X, position.Y-display.Y
	return &recorderDisplayPosition{
		Anchor: "top-left", OffsetX: offsetX, OffsetY: offsetY,
		XRatio: float64(offsetX) / float64(display.Width), YRatio: float64(offsetY) / float64(display.Height),
		Space: "display-logical", Verified: true,
	}
}

func recorderValidateActionTarget(action recorderAction) error {
	if action.Target == nil {
		return fmt.Errorf("verified action target is missing")
	}
	if action.Target.Kind == "editable" {
		if action.Kind != "text-edit" || action.Target.Resolution != "application-identity+window-title+accessibility-selector" || action.Target.Window == nil || action.Target.Display != nil || action.Target.Element != nil || action.Target.Pointer != nil || action.Target.SemanticStatus != "verified" || action.Target.SemanticReason != "" || action.Target.Editable == nil {
			return fmt.Errorf("verified editable target is incomplete")
		}
		if err := recorderValidateWindowSnapshot(action.Target.Window); err != nil {
			return err
		}
		element := action.Target.Editable
		if err := recorderValidateEditableDescriptor(*element); err != nil {
			return fmt.Errorf("verified editable target is invalid")
		}
		return nil
	}
	if action.Target.Kind == "display" {
		if (action.Kind != "click" && action.Kind != "drag" && action.Kind != "wheel") || action.Target.Resolution != "display-id+hardware-id" || action.Target.Window != nil ||
			action.Target.Display == nil || action.Target.SemanticStatus != "not-applicable" ||
			action.Target.SemanticReason != "" || action.Target.Element != nil || action.Target.Editable != nil || action.Position == nil ||
			((action.Kind == "click" || action.Kind == "wheel") && (action.Destination != nil || action.Target.Pointer != nil)) ||
			(action.Kind == "drag" && (action.Destination == nil || recorderValidatePointerEvidence(action.Target.Pointer) != nil)) {
			return fmt.Errorf("verified display target is incomplete")
		}
		display := action.Target.Display
		if display.Index < 1 || strings.TrimSpace(display.ID) == "" || len(display.ID) > 512 || len(display.HardwareID) > 512 || display.Width <= 0 || display.Height <= 0 ||
			display.PixelWidth <= 0 || display.PixelHeight <= 0 || math.IsNaN(display.Scale) || math.IsInf(display.Scale, 0) || display.Scale <= 0 {
			return fmt.Errorf("verified display target is invalid")
		}
		if err := recorderValidateDisplayActionPosition(action.Position, display); err != nil {
			return err
		}
		if action.Destination != nil {
			if err := recorderValidateDisplayActionPosition(action.Destination, display); err != nil {
				return err
			}
		}
		return nil
	}
	if action.Target.Kind != "window" || action.Target.Resolution != "application-identity+window-title" || action.Target.Window == nil || action.Target.Display != nil || action.Target.Editable != nil {
		return fmt.Errorf("verified window target is missing")
	}
	if err := recorderValidateWindowSnapshot(action.Target.Window); err != nil {
		return err
	}
	if action.Kind != "click" && action.Kind != "drag" && action.Kind != "wheel" {
		if action.Target.SemanticStatus != "not-applicable" || action.Target.SemanticReason != "" || action.Target.Element != nil || action.Target.Pointer != nil {
			return fmt.Errorf("non-pointer action has invalid semantic target evidence")
		}
		return nil
	}
	if action.Kind == "drag" {
		if action.Target.SemanticStatus != "not-applicable" || action.Target.SemanticReason != "" || action.Target.Element != nil || action.Destination == nil || recorderValidatePointerEvidence(action.Target.Pointer) != nil {
			return fmt.Errorf("drag target evidence is invalid")
		}
		if !recorderSameRecordedWindow(action.Target.Pointer.Release.Window, action.Target.Window) ||
			(action.Target.Pointer.Press != nil && action.Target.Pointer.Press.Status == "verified" && !recorderSameRecordedWindow(action.Target.Pointer.Press.Window, action.Target.Window)) {
			return fmt.Errorf("drag endpoint windows disagree with the action window")
		}
	} else if action.Destination != nil {
		return fmt.Errorf("non-drag pointer target has an unexpected destination")
	}
	if action.Kind == "wheel" && (action.Target.SemanticStatus != "not-applicable" || action.Target.SemanticReason != "" || action.Target.Element != nil || action.Target.Pointer != nil) {
		return fmt.Errorf("wheel target has invalid semantic evidence")
	}
	if action.Kind == "click" {
		if action.Target.Pointer != nil {
			return fmt.Errorf("click target has unexpected drag evidence")
		}
		switch action.Target.SemanticStatus {
		case "verified":
			if action.Target.SemanticReason != "" || action.Target.Element == nil {
				return fmt.Errorf("verified semantic target evidence is incomplete")
			}
		case "unavailable":
			if strings.TrimSpace(action.Target.SemanticReason) == "" || action.Target.Element != nil {
				return fmt.Errorf("unavailable semantic target evidence is incomplete")
			}
		case "not-requested":
			if action.Target.SemanticReason != "" || action.Target.Element != nil {
				return fmt.Errorf("unrequested semantic target evidence is invalid")
			}
		default:
			return fmt.Errorf("click semantic target status is invalid")
		}
	}
	if err := recorderValidateWindowActionPosition(action.Position, action.Target.Window.Bounds); err != nil {
		return err
	}
	if action.Destination != nil {
		if err := recorderValidateWindowActionPosition(action.Destination, action.Target.Window.Bounds); err != nil {
			return err
		}
	}
	if action.Kind == "click" && action.Target.Element != nil {
		if err := recorderValidateElementSnapshot(action.Target.Element); err != nil {
			return err
		}
		element := action.Target.Element
		if element.Bounds.X+element.Point.OffsetX != action.Position.X || element.Bounds.Y+element.Point.OffsetY != action.Position.Y {
			return fmt.Errorf("element-relative and click positions disagree")
		}
	}
	return nil
}

func recorderValidatePointerEvidence(evidence *recorderPointerEvidence) error {
	if evidence == nil || evidence.Release == nil || (evidence.Classification != "drag" && evidence.Classification != "text-selection") {
		return fmt.Errorf("drag endpoint evidence is incomplete")
	}
	validateEndpoint := func(endpoint *recorderPointerEndpointEvidence, phase string) error {
		if endpoint == nil {
			return nil
		}
		if !recorderIDPattern.MatchString(endpoint.EventID) || endpoint.Phase != phase || (endpoint.Status != "verified" && endpoint.Status != "unverified") {
			return fmt.Errorf("drag endpoint identity is invalid")
		}
		if endpoint.Status == "unverified" {
			if strings.TrimSpace(endpoint.Reason) == "" || endpoint.SemanticStatus != "not-applicable" || endpoint.SemanticReason != "" || endpoint.Element != nil ||
				(endpoint.Window != nil && recorderValidateWindowSnapshot(endpoint.Window) != nil) {
				return fmt.Errorf("unverified drag endpoint is incomplete")
			}
			return nil
		}
		if endpoint.Reason != "" || recorderValidateWindowSnapshot(endpoint.Window) != nil {
			return fmt.Errorf("verified drag endpoint has a reason")
		}
		switch endpoint.SemanticStatus {
		case "verified":
			if endpoint.SemanticReason != "" || recorderValidateElementSnapshot(endpoint.Element) != nil {
				return fmt.Errorf("verified drag endpoint semantics are invalid")
			}
		case "unavailable":
			if strings.TrimSpace(endpoint.SemanticReason) == "" || endpoint.Element != nil {
				return fmt.Errorf("unavailable drag endpoint semantics are invalid")
			}
		case "not-requested":
			if endpoint.SemanticReason != "" || endpoint.Element != nil {
				return fmt.Errorf("unrequested drag endpoint semantics are invalid")
			}
		default:
			return fmt.Errorf("drag endpoint semantic status is invalid")
		}
		return nil
	}
	if err := validateEndpoint(evidence.Press, "pressed"); err != nil {
		return err
	}
	if err := validateEndpoint(evidence.Release, "released"); err != nil {
		return err
	}
	if evidence.Classification == "text-selection" {
		if evidence.Press == nil || evidence.Press.Status != "verified" || evidence.Release.Status != "verified" ||
			evidence.Press.Element == nil || evidence.Release.Element == nil || !recorderSameRecordedWindow(evidence.Press.Window, evidence.Release.Window) ||
			!recorderSameEditableElement(evidence.Press.Element, evidence.Release.Element) {
			return fmt.Errorf("text-selection classification lacks matching editable endpoints")
		}
	}
	return nil
}

func recorderValidateWindowActionPosition(absolute *recorderActionPosition, bounds recorderWindowBounds) error {
	if absolute == nil || absolute.Window == nil || absolute.Display != nil {
		return fmt.Errorf("window-relative click position is missing")
	}
	position := absolute.Window
	if position.Anchor != "top-left" || position.Space != "window-logical" || !position.Verified || position.OffsetX < 0 || position.OffsetX >= bounds.Width || position.OffsetY < 0 || position.OffsetY >= bounds.Height || math.IsNaN(position.XRatio) || math.IsInf(position.XRatio, 0) || math.IsNaN(position.YRatio) || math.IsInf(position.YRatio, 0) || position.XRatio < 0 || position.XRatio >= 1 || position.YRatio < 0 || position.YRatio >= 1 {
		return fmt.Errorf("window-relative pointer position is invalid")
	}
	if absolute.X != bounds.X+position.OffsetX || absolute.Y != bounds.Y+position.OffsetY || math.Abs(position.XRatio-float64(position.OffsetX)/float64(bounds.Width)) > 1e-12 || math.Abs(position.YRatio-float64(position.OffsetY)/float64(bounds.Height)) > 1e-12 {
		return fmt.Errorf("absolute and window-relative positions disagree")
	}
	return nil
}

func recorderValidateDisplayActionPosition(absolute *recorderActionPosition, display *DisplayInfo) error {
	if absolute == nil || absolute.Window != nil || absolute.Display == nil || display == nil {
		return fmt.Errorf("display-relative pointer position is missing")
	}
	position := absolute.Display
	if absolute.DisplayRef != display.ID || position.Anchor != "top-left" || position.Space != "display-logical" ||
		!position.Verified || position.OffsetX < 0 || position.OffsetX >= display.Width || position.OffsetY < 0 || position.OffsetY >= display.Height ||
		math.IsNaN(position.XRatio) || math.IsInf(position.XRatio, 0) || math.IsNaN(position.YRatio) || math.IsInf(position.YRatio, 0) ||
		position.XRatio < 0 || position.XRatio >= 1 || position.YRatio < 0 || position.YRatio >= 1 {
		return fmt.Errorf("display-relative pointer position is invalid")
	}
	if absolute.X != display.X+position.OffsetX || absolute.Y != display.Y+position.OffsetY ||
		math.Abs(position.XRatio-float64(position.OffsetX)/float64(display.Width)) > 1e-12 ||
		math.Abs(position.YRatio-float64(position.OffsetY)/float64(display.Height)) > 1e-12 {
		return fmt.Errorf("absolute and display-relative positions disagree")
	}
	return nil
}

func recorderPointDistanceSquared(x1, y1, x2, y2 int) int {
	dx, dy := x2-x1, y2-y1
	return dx*dx + dy*dy
}

func recorderPressedSegment(segments map[string]*recorderMouseSegment) *recorderMouseSegment {
	for _, segment := range segments {
		if segment.press != nil && segment.release == nil {
			return segment
		}
	}
	return nil
}

func recorderTiming(first, last recorderRawEvent) recorderActionTiming {
	return recorderActionTiming{SequenceStart: first.Sequence, SequenceEnd: last.Sequence, NativeStart: first.NativeTime, NativeEnd: last.NativeTime, NativeUnit: first.NativeUnit}
}

func recorderBasicCharacter(event recorderRawEvent) (string, bool) {
	if event.Keychar == nil {
		return "", false
	}
	value := rune(*event.Keychar)
	if value < 0x20 || value > 0x7e {
		return "", false
	}
	return string(value), true
}

func recorderRawEventHasGap(event recorderRawEvent, gap string) bool {
	for _, candidate := range event.Gaps {
		if candidate == gap {
			return true
		}
	}
	return false
}

func recorderHasControlModifier(mask uint16) bool {
	return mask&((1<<1)|(1<<2)|(1<<3)|(1<<5)|(1<<6)|(1<<7)) != 0
}

func recorderIsModifierKey(code uint16) bool {
	switch code {
	case 0x002a, 0x0036, 0x001d, 0x0e1d, 0x0e5b, 0x0e5c, 0x0038, 0x0e38:
		return true
	}
	return false
}

func recorderIsReplayableSpecialKey(name string) bool {
	switch name {
	case "Escape", "Tab", "Enter", "Backspace", "Delete", "Home", "End", "PageUp", "PageDown", "ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown":
		return true
	}
	return strings.HasPrefix(name, "F")
}

func recorderNativeTimeValue(event recorderRawEvent) uint64 {
	value := recorderNativeStringValue(event.NativeTime)
	if event.NativeUnit == "nanoseconds" {
		return value / uint64(time.Millisecond)
	}
	return value
}
func recorderActionTimeMilliseconds(value, unit string) uint64 {
	parsed := recorderNativeStringValue(value)
	if unit == "nanoseconds" {
		return parsed / uint64(time.Millisecond)
	}
	return parsed
}
func recorderNativeStringValue(value string) uint64 {
	parsed, _ := strconv.ParseUint(value, 10, 64)
	return parsed
}

func appendIssue(issues []recorderIssue, issue recorderIssue) []recorderIssue {
	for _, existing := range issues {
		if existing.Code == issue.Code && existing.EventID == issue.EventID {
			return issues
		}
	}
	return append(issues, issue)
}
func appendIssues(target, values []recorderIssue) []recorderIssue {
	for _, issue := range values {
		target = appendIssue(target, issue)
	}
	return target
}

func recorderIssueAllowsPartial(code string) bool {
	switch code {
	case "action-target-invalid",
		"ambiguous-button-motion",
		"click-count-inconsistent",
		"click-count-invalid",
		"click-count-unsupported",
		"click-missing-press",
		"click-missing-release",
		"composition-unsupported",
		"coordinate-unverified",
		"drag-not-click",
		"drag-unsupported",
		"ime-boundary-ambiguous",
		"input-open-at-pause",
		"key-release-not-observed-at-stop",
		"key-still-pressed-at-stop",
		"keycode-missing",
		"legacy-screen-only",
		"long-press-unsupported",
		"maximum-duration",
		"missing-key-release-at-stop",
		"missing-release-at-stop",
		"modified-click-unsupported",
		"motion-path-not-click",
		"mouse-button-unsupported",
		"physical-key-modifiers-changed",
		"physical-key-unsupported",
		"release-without-press",
		"shortcut-unsupported",
		"text-edit-too-large",
		"text-tracker-overflow",
		"typed-text-unsupported",
		"unassociated-key-evidence",
		"unknown-library-event",
		"unpaired-mouse-press",
		"unresolved-event",
		"wheel-invalid",
		"wheel-modified-unsupported",
		"window-context-missing",
		"window-context-overflow",
		"window-context-unverified",
		"window-relative-coordinate-invalid":
		return true
	default:
		return false
	}
}

func recorderManifestFailureAllowsPartial(manifest recorderManifest) bool {
	if manifest.State != "failed" || manifest.Storage.State != "saved" {
		return false
	}
	sawMaximumDuration := false
	for _, issue := range manifest.Issues {
		if issue.Severity != "error" {
			continue
		}
		if !recorderIssueAllowsPartial(issue.Code) {
			return false
		}
		if issue.Code == "maximum-duration" {
			sawMaximumDuration = true
		}
	}
	return sawMaximumDuration
}

func recorderFinalizePartialActions(actions []recorderAction, dispositions []recorderEventDisposition, issues []recorderIssue) ([]recorderAction, []recorderEventDisposition, []recorderIssue) {
	unsafeEvents := make(map[string]bool)
	dropKeyboardActions := false
	for index := range issues {
		if !recorderIssueAllowsPartial(issues[index].Code) {
			continue
		}
		if issues[index].Severity == "error" {
			issues[index].Severity = "warning"
		}
		if issues[index].EventID != "" {
			unsafeEvents[issues[index].EventID] = true
		}
		if issues[index].Code == "text-tracker-overflow" {
			dropKeyboardActions = true
		}
	}

	omittedActions := make(map[string]bool)
	renamedActions := make(map[string]string)
	safeActions := make([]recorderAction, 0, len(actions))
	for _, action := range actions {
		unsafe := recorderValidateActionTarget(action) != nil
		if dropKeyboardActions && (action.Kind == "text" || action.Kind == "text-edit" || action.Kind == "shortcut" || action.Kind == "key") {
			unsafe = true
		}
		for _, eventID := range action.Source.EventIDs {
			if unsafeEvents[eventID] {
				unsafe = true
				break
			}
		}
		if unsafe {
			omittedActions[action.ID] = true
			if recorderValidateActionTarget(action) != nil {
				eventID := ""
				if len(action.Source.EventIDs) > 0 {
					eventID = action.Source.EventIDs[0]
				}
				issues = appendIssue(issues, recorderIssue{Code: "action-target-invalid", Severity: "warning", Message: "the action has no complete verified replay target and was omitted", EventID: eventID})
			}
			continue
		}
		oldID := action.ID
		action.ID = fmt.Sprintf("a%04d", len(safeActions)+1)
		renamedActions[oldID] = action.ID
		safeActions = append(safeActions, action)
	}

	for index := range dispositions {
		item := &dispositions[index]
		if omittedActions[item.ActionID] {
			item.Disposition = "omitted"
			item.ActionID = ""
			item.Reason = "action omitted because it is outside the verified replay subset"
			continue
		}
		if renamed, ok := renamedActions[item.ActionID]; ok {
			item.ActionID = renamed
		}
	}
	if len(safeActions) == 0 {
		issues = appendIssue(issues, recorderIssue{Code: "no-supported-actions", Severity: "warning", Message: "the recording contains no action in the basic supported subset"})
	}
	return safeActions, dispositions, issues
}

func recorderReadiness(issues []recorderIssue) string {
	for _, issue := range issues {
		if issue.Severity == "error" {
			return "blocked"
		}
	}
	if len(issues) > 0 {
		return "needs-review"
	}
	return "ready"
}

func recorderSaveActionsRevision(recordingDir string, actions *recorderActions) (string, int, error) {
	for revision := 1; revision <= 100; revision++ {
		name := "actions.json"
		if revision > 1 {
			name = fmt.Sprintf("actions.r%03d.json", revision)
		}
		path := filepath.Join(recordingDir, name)
		actions.Revision = revision
		actions.RevisionReason = recorderInitialRevisionReason
		if revision > 1 {
			actions.RevisionReason = recorderRebuildRevisionReason
		}
		actions.RevisionBasis = recorderRevisionBasis
		if existing, err := recorderReadRegular(path, recorderMaxActionsBytes); err == nil {
			var prior recorderActions
			if recorderDecodeStrict(existing, &prior) == nil && reflect.DeepEqual(prior, *actions) {
				return path, revision, nil
			}
			continue
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", 0, err
		}
		payload, err := json.MarshalIndent(actions, "", "  ")
		if err != nil {
			return "", 0, err
		}
		payload = append(payload, '\n')
		if err := recorderWriteExclusive(path, payload, 0600); err != nil {
			if errors.Is(err, os.ErrExist) {
				continue
			}
			return "", 0, err
		}
		return path, revision, nil
	}
	return "", 0, fmt.Errorf("actions revision limit exceeded")
}

func (r *RecorderRuntime) generateBasicScript(input, outputFile string, timing recorderGenerationTiming, pointerMotion string) (recorderScriptResult, error) {
	const operation = "Recorder.generateScript"
	actionsPath, recordingDir, err := r.resolveActionsFile(input, operation)
	if err != nil {
		return recorderScriptResult{}, err
	}
	payload, err := recorderReadRegular(actionsPath, recorderMaxActionsBytes)
	if err != nil {
		return recorderScriptResult{}, recorderWrapFileError(operation, "actions file", err)
	}
	actionsHash := recorderSHA256(payload)
	var actions recorderActions
	if err := recorderDecodeStrict(payload, &actions); err != nil {
		return recorderScriptResult{}, recorderError(RecorderInvalidRecording, operation, "actions file does not match the fixed schema", err)
	}
	var rawEvents []recorderRawEvent
	if err := recorderValidateActions(actions, actionsPath, recordingDir, &rawEvents); err != nil {
		return recorderScriptResult{}, err
	}
	if actions.Readiness == "blocked" {
		return recorderScriptResult{}, recorderError(RecorderGenerationBlocked, operation, "actions package integrity does not permit generation", nil)
	}
	generatedDir := filepath.Join(recordingDir, "generated")
	if err := os.MkdirAll(generatedDir, 0700); err != nil {
		return recorderScriptResult{}, recorderError(RecorderStorageFailed, operation, "could not create generated directory", err)
	}
	if err := recorderRejectSymlinkPath(recordingDir, generatedDir); err != nil {
		return recorderScriptResult{}, recorderError(RecorderInvalidArgument, operation, "generated directory contains a symbolic link", err)
	}
	scriptPath := filepath.Join(generatedDir, "basic.recipe.js")
	if outputFile != "" {
		scriptPath = outputFile
		if !filepath.IsAbs(scriptPath) {
			scriptPath = filepath.Join(generatedDir, scriptPath)
		}
		scriptPath, err = filepath.Abs(filepath.Clean(scriptPath))
		if err != nil || !recorderPathWithin(generatedDir, scriptPath) || strings.ToLower(filepath.Ext(scriptPath)) != ".js" {
			return recorderScriptResult{}, recorderError(RecorderInvalidArgument, operation, "outputFile must be a .js file within the recording generated directory", err)
		}
	}
	base := strings.TrimSuffix(filepath.Base(scriptPath), filepath.Ext(scriptPath))
	candidatePath := filepath.Join(generatedDir, strings.TrimSuffix(base, ".recipe")+".candidate.json")
	if _, err := os.Lstat(scriptPath); err == nil {
		return recorderScriptResult{}, recorderError(RecorderWouldOverwrite, operation, "script output already exists", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		return recorderScriptResult{}, recorderWrapFileError(operation, "script output", err)
	}
	if _, err := os.Lstat(candidatePath); err == nil {
		return recorderScriptResult{}, recorderError(RecorderWouldOverwrite, operation, "candidate output already exists", nil)
	} else if !errors.Is(err, os.ErrNotExist) {
		return recorderScriptResult{}, recorderWrapFileError(operation, "candidate output", err)
	}
	script, mappings, constraints, err := recorderGenerateBasicSource(actions, rawEvents, timing, pointerMotion)
	if err != nil {
		return recorderScriptResult{}, err
	}
	scriptHash := recorderSHA256(script)
	candidate := recorderCandidate{
		FormatVersion: recorderCandidateFormatVersion, RecordingID: actions.RecordingID,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Mode: "basic",
		Actions: recorderCandidateActionsRef{File: actionsPath, SHA256: actionsHash, Revision: actions.Revision},
		Script:  recorderCandidateScriptRef{File: scriptPath, SHA256: scriptHash},
		Timing:  timing, PointerMotion: pointerMotion,
		Constraints: constraints, Mappings: mappings, Verification: "not-run",
	}
	candidateBytes, err := json.MarshalIndent(candidate, "", "  ")
	if err != nil {
		return recorderScriptResult{}, err
	}
	candidateBytes = append(candidateBytes, '\n')
	if err := recorderWriteExclusive(scriptPath, script, 0600); err != nil {
		if errors.Is(err, os.ErrExist) {
			return recorderScriptResult{}, recorderError(RecorderWouldOverwrite, operation, "script output already exists", err)
		}
		return recorderScriptResult{}, recorderError(RecorderStorageFailed, operation, "could not save generated script", err)
	}
	if err := recorderWriteExclusive(candidatePath, candidateBytes, 0600); err != nil {
		_ = os.Remove(scriptPath)
		if errors.Is(err, os.ErrExist) {
			return recorderScriptResult{}, recorderError(RecorderWouldOverwrite, operation, "candidate output already exists", err)
		}
		return recorderScriptResult{}, recorderError(RecorderStorageFailed, operation, "could not save candidate metadata", err)
	}
	return recorderScriptResult{ScriptFile: scriptPath, CandidateFile: candidatePath, ActionsSHA256: actionsHash, ScriptSHA256: scriptHash, Constraints: constraints, Verification: "not-run", Timing: timing, PointerMotion: pointerMotion}, nil
}

func recorderValidateActions(actions recorderActions, actionsPath, recordingDir string, validatedRaw *[]recorderRawEvent) error {
	const operation = "Recorder.generateScript"
	if actions.FormatVersion != recorderActionsFormatVersion || !recorderIDPattern.MatchString(actions.RecordingID) || actions.RecordingID != filepath.Base(recordingDir) || actions.Revision < 1 {
		return recorderError(RecorderInvalidRecording, operation, "actions identity, revision, or version is invalid", nil)
	}
	if len(actions.Actions) > recorderMaxActions || (actions.Readiness != "ready" && actions.Readiness != "needs-review" && actions.Readiness != "blocked") {
		return recorderError(RecorderInvalidRecording, operation, "actions limits or readiness are invalid", nil)
	}
	if (actions.Readiness == "ready" && (len(actions.Actions) == 0 || len(actions.Issues) != 0)) ||
		(actions.Readiness == "needs-review" && len(actions.Issues) == 0) {
		return recorderError(RecorderInvalidRecording, operation, "actions readiness does not match its actions and issues", nil)
	}
	expectedName := "actions.json"
	if actions.Revision > 1 && actions.Revision <= 999 {
		expectedName = fmt.Sprintf("actions.r%03d.json", actions.Revision)
	}
	if actions.Revision > 999 || filepath.Base(actionsPath) != expectedName {
		return recorderError(RecorderInvalidRecording, operation, "actions revision does not match its filename", nil)
	}
	expectedReason := recorderInitialRevisionReason
	if actions.Revision > 1 {
		expectedReason = recorderRebuildRevisionReason
	}
	if actions.RevisionReason != expectedReason || actions.RevisionBasis != recorderRevisionBasis {
		return recorderError(RecorderInvalidRecording, operation, "actions revision reason or basis is invalid", nil)
	}
	if actions.Environment.Platform != "darwin" && actions.Environment.Platform != "windows" && actions.Environment.Platform != "linux" {
		return recorderError(RecorderInvalidRecording, operation, "actions platform is invalid", nil)
	}
	if actions.Environment.CoordinateSpace != "screen-logical" || actions.Environment.Within.ProcessID == 0 || strings.TrimSpace(actions.Environment.Within.Title) == "" || len(actions.Environment.Within.Title) > 512 {
		return recorderError(RecorderInvalidRecording, operation, "actions environment is incomplete", nil)
	}
	if actions.Environment.InitialWindow != nil {
		if err := recorderValidateWindowSnapshot(actions.Environment.InitialWindow); err != nil {
			return recorderError(RecorderInvalidRecording, operation, "actions initial window snapshot is invalid", err)
		}
	}
	rawPath := filepath.Join(recordingDir, filepath.FromSlash(actions.Raw.File))
	if actions.Raw.File != "raw/events.ndjson" || !recorderPathWithin(recordingDir, rawPath) || len(actions.Raw.SHA256) != 64 || actions.Raw.Bytes < 0 {
		return recorderError(RecorderInvalidRecording, operation, "actions raw reference is invalid", nil)
	}
	rawBytes, err := recorderReadRegular(rawPath, recorderMaxRawBytes)
	if err != nil || int64(len(rawBytes)) != actions.Raw.Bytes || recorderSHA256(rawBytes) != actions.Raw.SHA256 {
		return recorderError(RecorderInvalidRecording, operation, "actions raw reference no longer matches the recorded bytes", err)
	}
	if actions.Readiness == "blocked" {
		return recorderError(RecorderGenerationBlocked, operation, "actions package integrity does not permit basic generation", nil)
	}
	rawEvents, rawIssues, err := recorderParseRawEvents(rawBytes, false)
	if err != nil {
		return recorderError(RecorderInvalidRecording, operation, "actions raw reference is not a complete valid event stream", err)
	}
	if validatedRaw != nil {
		*validatedRaw = append((*validatedRaw)[:0], rawEvents...)
	}
	manifestBytes, err := recorderReadRegular(filepath.Join(recordingDir, "manifest.json"), recorderMaxActionsBytes)
	if err != nil {
		return recorderWrapFileError(operation, "manifest.json", err)
	}
	var manifest recorderManifest
	if err := recorderDecodeStrict(manifestBytes, &manifest); err != nil {
		return recorderError(RecorderInvalidRecording, operation, "manifest.json does not match the Recorder recording schema", err)
	}
	terminal, err := recorderValidateManifestStructure(manifest)
	if err != nil || manifest.FormatVersion != recorderRecordingFormatVersion || !terminal ||
		(manifest.State != "stopped" && !recorderManifestFailureAllowsPartial(manifest)) ||
		manifest.Storage.State != "saved" || manifest.RecordingID != actions.RecordingID {
		return recorderError(RecorderInvalidRecording, operation, "actions do not reference a complete saved recording manifest", err)
	}
	if err := recorderValidateManifestRawFacts(manifest, rawBytes, rawEvents, terminal); err != nil {
		return recorderError(RecorderInvalidRecording, operation, "actions raw bytes do not match the terminal manifest", err)
	}
	if manifest.Capture.Platform != actions.Environment.Platform || manifest.Capture.CoordinateSpace != actions.Environment.CoordinateSpace || manifest.Within != actions.Environment.Within || !reflect.DeepEqual(manifest.InitialWindow, actions.Environment.InitialWindow) {
		return recorderError(RecorderInvalidRecording, operation, "actions environment does not match the terminal manifest", nil)
	}
	rawByID := make(map[string]recorderRawEvent, len(rawEvents))
	for _, event := range rawEvents {
		rawByID[event.EventID] = event
	}
	expectedIssues := append(make([]recorderIssue, 0), rawIssues...)
	for _, issue := range manifest.Issues {
		if issue.Severity == "error" {
			expectedIssues = appendIssue(expectedIssues, issue)
		}
	}
	expectedActions, expectedDisposition, groupingIssues := recorderBuildActionListWithContexts(rawEvents, manifest.TextEdits, manifest.InputContexts)
	expectedActions, contextIssues := recorderEnrichActionsWithWindowContext(expectedActions, manifest, rawEvents)
	expectedIssues = appendIssues(expectedIssues, groupingIssues)
	expectedIssues = appendIssues(expectedIssues, contextIssues)
	expectedActions, expectedDisposition, expectedIssues = recorderFinalizePartialActions(expectedActions, expectedDisposition, expectedIssues)
	expectedReadiness := recorderReadiness(expectedIssues)
	if actions.Readiness != expectedReadiness || !reflect.DeepEqual(actions.Issues, expectedIssues) || !reflect.DeepEqual(actions.Actions, expectedActions) || !reflect.DeepEqual(actions.EventDisposition, expectedDisposition) {
		return recorderError(RecorderInvalidRecording, operation, "actions do not match the deterministic grouping of their fixed raw bytes", nil)
	}
	eventDisposition := map[string]recorderEventDisposition{}
	for _, item := range actions.EventDisposition {
		if !recorderIDPattern.MatchString(item.EventID) || (item.Disposition != "consumed" && item.Disposition != "evidence" && item.Disposition != "excluded" && item.Disposition != "omitted") || item.Reason == "" || len(item.Reason) > 1024 {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition contains invalid data", nil)
		}
		if _, exists := rawByID[item.EventID]; !exists {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition references an event outside the fixed raw bytes", nil)
		}
		if _, duplicate := eventDisposition[item.EventID]; duplicate {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition contains a duplicate event", nil)
		}
		eventDisposition[item.EventID] = item
		if item.ActionID != "" && !recorderIDPattern.MatchString(item.ActionID) {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition contains an invalid action reference", nil)
		}
		if (item.Disposition == "consumed" || item.Disposition == "evidence") != (item.ActionID != "") {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition action linkage is incomplete", nil)
		}
	}
	if len(eventDisposition) != len(rawEvents) {
		return recorderError(RecorderInvalidRecording, operation, "eventDisposition does not account for every fixed raw event", nil)
	}
	seenActions := map[string]bool{}
	var priorSequence uint64
	for index, action := range actions.Actions {
		if !recorderIDPattern.MatchString(action.ID) || seenActions[action.ID] {
			return recorderError(RecorderInvalidRecording, operation, "action IDs must be unique safe identifiers", nil)
		}
		seenActions[action.ID] = true
		sequence, err := strconv.ParseUint(action.Timing.SequenceStart, 10, 64)
		if err != nil || (index > 0 && sequence <= priorSequence) {
			return recorderError(RecorderInvalidRecording, operation, "actions are not in strict source sequence order", err)
		}
		priorSequence = sequence
		sequenceEnd, endErr := strconv.ParseUint(action.Timing.SequenceEnd, 10, 64)
		nativeStart, nativeStartErr := strconv.ParseUint(action.Timing.NativeStart, 10, 64)
		nativeEnd, nativeEndErr := strconv.ParseUint(action.Timing.NativeEnd, 10, 64)
		if endErr != nil || sequenceEnd < sequence || nativeStartErr != nil || nativeEndErr != nil || nativeEnd < nativeStart || (action.Timing.NativeUnit != "milliseconds" && action.Timing.NativeUnit != "nanoseconds") {
			return recorderError(RecorderInvalidRecording, operation, "action timing is invalid", nil)
		}
		if action.Review.Required || action.Review.Status != "not-required" {
			return recorderError(RecorderGenerationBlocked, operation, "an action requires semantic review", nil)
		}
		if len(action.Source.EventIDs) == 0 {
			return recorderError(RecorderInvalidRecording, operation, "action source has no event IDs", nil)
		}
		seenSource := map[string]bool{}
		sourceEvents := make([]recorderRawEvent, 0, len(action.Source.EventIDs))
		var priorSourceSequence uint64
		for _, eventID := range action.Source.EventIDs {
			disposition, exists := eventDisposition[eventID]
			event, rawExists := rawByID[eventID]
			if !recorderIDPattern.MatchString(eventID) || !exists || !rawExists || disposition.ActionID != action.ID || (disposition.Disposition != "consumed" && disposition.Disposition != "evidence") || seenSource[eventID] {
				return recorderError(RecorderInvalidRecording, operation, "action has a dangling or ambiguous event reference", nil)
			}
			sourceSequence := recorderNativeStringValue(event.Sequence)
			if len(sourceEvents) > 0 && sourceSequence <= priorSourceSequence {
				return recorderError(RecorderInvalidRecording, operation, "action source events are not in source sequence order", nil)
			}
			priorSourceSequence = sourceSequence
			seenSource[eventID] = true
			sourceEvents = append(sourceEvents, event)
		}
		expectedTiming := recorderTiming(sourceEvents[0], sourceEvents[len(sourceEvents)-1])
		if action.Timing != expectedTiming {
			return recorderError(RecorderInvalidRecording, operation, "action timing does not match its fixed source events", nil)
		}
		if action.Args.RepeatCount != 0 && action.Kind != "shortcut" && action.Kind != "key" {
			return recorderError(RecorderInvalidRecording, operation, "repeatCount is only valid for physical key actions", nil)
		}
		switch action.Kind {
		case "click":
			if (action.Source.Basis != recorderClickedBasis && action.Source.Basis != recorderJitterClickBasis) || action.Position == nil || action.Destination != nil || action.Position.X < math.MinInt16 || action.Position.X > math.MaxInt16 || action.Position.Y < math.MinInt16 || action.Position.Y > math.MaxInt16 || !action.Position.Verified || action.Position.Space != "screen-logical" || action.Position.DisplayRef == "" || len(action.Position.DisplayRef) > 512 || action.Args.Button != "left" || action.Args.ClickCount != 1 || action.Args.Steps != 0 || action.Args.Text != "" || action.Args.EditSemantics != "" || action.Args.Key != "" || len(action.Args.Keys) != 0 || action.Args.TextEdit != nil || action.Strategy != "mouse.click" || recorderValidateActionTarget(action) != nil {
				return recorderError(RecorderInvalidRecording, operation, "click action is outside the whitelisted basic schema", nil)
			}
			var pressed, released, clicked, dragged int
			for _, event := range sourceEvents {
				switch event.LibraryEvent {
				case "MOUSE_PRESSED":
					pressed++
				case "MOUSE_RELEASED":
					released++
				case "MOUSE_CLICKED":
					clicked++
					if event.X == nil || event.Y == nil || *event.X != action.Position.X || *event.Y != action.Position.Y || event.DisplayRef != action.Position.DisplayRef || !event.CoordinateVerified {
						return recorderError(RecorderInvalidRecording, operation, "click action position does not match its CLICKED source", nil)
					}
				case "MOUSE_DRAGGED", "MOUSE_MOVED":
					dragged++
				default:
					return recorderError(RecorderInvalidRecording, operation, "click action contains a non-click source event", nil)
				}
			}
			if action.Source.Basis == recorderClickedBasis {
				if pressed != 1 || released != 1 || clicked != 1 || dragged != 0 || len(sourceEvents) != 3 {
					return recorderError(RecorderInvalidRecording, operation, "CLICKED action source boundary is incomplete", nil)
				}
			} else {
				segment := &recorderMouseSegment{button: "left", press: &sourceEvents[0], release: &sourceEvents[len(sourceEvents)-1]}
				segment.motion = append(segment.motion, sourceEvents[1:len(sourceEvents)-1]...)
				for _, event := range segment.motion {
					if event.LibraryEvent == "MOUSE_DRAGGED" || event.ModifierMask&((1<<8)|(1<<9)|(1<<10)|(1<<11)|(1<<12)) != 0 {
						segment.dragged = append(segment.dragged, event)
					}
				}
				expected := recorderBuildJitterClickAction(segment, index+1)
				rawBackedAction := recorderRawBackedAction(action)
				if pressed != 1 || released != 1 || clicked != 0 || dragged == 0 || expected == nil || !reflect.DeepEqual(rawBackedAction, *expected) {
					return recorderError(RecorderInvalidRecording, operation, "bounded pointer-jitter click source is invalid", nil)
				}
			}
		case "drag":
			if (action.Source.Basis != recorderDragBasis && action.Source.Basis != recorderTextSelectionDragBasis) || action.Position == nil || action.Destination == nil || action.Position.X < math.MinInt16 || action.Position.X > math.MaxInt16 || action.Position.Y < math.MinInt16 || action.Position.Y > math.MaxInt16 || action.Destination.X < math.MinInt16 || action.Destination.X > math.MaxInt16 || action.Destination.Y < math.MinInt16 || action.Destination.Y > math.MaxInt16 || !action.Position.Verified || !action.Destination.Verified || action.Position.Space != "screen-logical" || action.Destination.Space != "screen-logical" || action.Position.DisplayRef == "" || action.Destination.DisplayRef != action.Position.DisplayRef || len(action.Position.DisplayRef) > 512 || action.Args.Button != "left" || action.Args.ClickCount != 0 || action.Args.Steps < 2 || action.Args.Steps > recorderMaximumDragSteps || action.Args.Text != "" || action.Args.EditSemantics != "" || action.Args.Key != "" || len(action.Args.Keys) != 0 || action.Args.TextEdit != nil || action.Strategy != "mouse.drag" || recorderValidateActionTarget(action) != nil || (action.Source.Basis == recorderTextSelectionDragBasis && action.Target.Pointer.Classification != "text-selection") {
				return recorderError(RecorderInvalidRecording, operation, "drag action is outside the whitelisted verified basic schema", nil)
			}
			var pressed, released, clicked, motion int
			for _, event := range sourceEvents {
				switch event.LibraryEvent {
				case "MOUSE_PRESSED":
					pressed++
				case "MOUSE_RELEASED":
					released++
				case "MOUSE_CLICKED":
					clicked++
				case "MOUSE_DRAGGED", "MOUSE_MOVED":
					motion++
				default:
					return recorderError(RecorderInvalidRecording, operation, "drag action contains a non-pointer source event", nil)
				}
			}
			segment := &recorderMouseSegment{button: "left", press: &sourceEvents[0], release: &sourceEvents[len(sourceEvents)-1]}
			segment.motion = append(segment.motion, sourceEvents[1:len(sourceEvents)-1]...)
			for _, event := range segment.motion {
				if event.LibraryEvent == "MOUSE_DRAGGED" || event.ModifierMask&((1<<8)|(1<<9)|(1<<10)|(1<<11)|(1<<12)) != 0 {
					segment.dragged = append(segment.dragged, event)
				}
			}
			expected := recorderBuildDragAction(segment, index+1, recorderInputContextsByEventID(manifest.InputContexts))
			if pressed != 1 || released != 1 || clicked != 0 || motion == 0 || expected == nil || !reflect.DeepEqual(recorderRawBackedAction(action), *expected) {
				return recorderError(RecorderInvalidRecording, operation, "verified drag source is invalid", nil)
			}
		case "wheel":
			oneAxis := (action.Args.DeltaX == 0) != (action.Args.DeltaY == 0)
			if action.Source.Basis != recorderWheelBasis || action.Position == nil || action.Destination != nil ||
				action.Position.X < math.MinInt16 || action.Position.X > math.MaxInt16 || action.Position.Y < math.MinInt16 || action.Position.Y > math.MaxInt16 ||
				!action.Position.Verified || action.Position.Space != "screen-logical" || action.Position.DisplayRef == "" || len(action.Position.DisplayRef) > 512 ||
				action.Args.Button != "" || action.Args.ClickCount != 0 || !oneAxis || action.Args.Steps < 1 || action.Args.Steps > recorderMaximumWheelSteps ||
				action.Args.DelayMS < 0 || action.Args.DelayMS > int(recorderWheelBurstGapMS) || action.Args.Text != "" || action.Args.EditSemantics != "" ||
				action.Args.Key != "" || len(action.Args.Keys) != 0 || action.Args.TextEdit != nil || action.Strategy != "mouse.wheel" || recorderValidateActionTarget(action) != nil {
				return recorderError(RecorderInvalidRecording, operation, "wheel action is outside the whitelisted same-axis burst schema", nil)
			}
			expected := recorderBuildWheelAction(sourceEvents, index+1)
			if expected == nil || !reflect.DeepEqual(recorderRawBackedAction(action), *expected) {
				return recorderError(RecorderInvalidRecording, operation, "wheel action does not match its fixed raw burst", nil)
			}
		case "text":
			if action.Source.Basis != "libuiohook KEY_TYPED basic-latin code units" || action.Position != nil || action.Destination != nil || action.Args.Text == "" || action.Args.EditSemantics != "insert-at-current-focus" || action.Args.Button != "" || action.Args.ClickCount != 0 || action.Args.Steps != 0 || action.Args.Key != "" || len(action.Args.Keys) != 0 || action.Args.TextEdit != nil || action.Strategy != "keyboard.type" || recorderValidateActionTarget(action) != nil {
				return recorderError(RecorderInvalidRecording, operation, "text action is outside the whitelisted basic schema", nil)
			}
			for _, char := range action.Args.Text {
				if char < 0x20 || char > 0x7e {
					return recorderError(RecorderInvalidRecording, operation, "text action contains unsupported characters", nil)
				}
			}
			var typed strings.Builder
			for _, event := range sourceEvents {
				switch event.LibraryEvent {
				case "KEY_TYPED":
					char, ok := recorderBasicCharacter(event)
					if !ok || recorderHasControlModifier(event.ModifierMask) {
						return recorderError(RecorderInvalidRecording, operation, "text action has an unsupported typed source", nil)
					}
					typed.WriteString(char)
				case "KEY_PRESSED", "KEY_RELEASED":
				default:
					return recorderError(RecorderInvalidRecording, operation, "text action contains a non-keyboard source event", nil)
				}
			}
			if typed.String() != action.Args.Text {
				return recorderError(RecorderInvalidRecording, operation, "text action does not match its KEY_TYPED sources", nil)
			}
		case "text-edit":
			if action.Source.Basis != recorderTextEditBasis || action.Position != nil || action.Destination != nil || action.Args.Button != "" || action.Args.ClickCount != 0 || action.Args.Steps != 0 || action.Args.Text != "" || action.Args.EditSemantics != "replace-value-range" || action.Args.Key != "" || len(action.Args.Keys) != 0 || action.Args.TextEdit == nil || action.Strategy != "accessibility.setValue" || recorderValidateActionTarget(action) != nil {
				return recorderError(RecorderInvalidRecording, operation, "text edit action is outside the verified focused-value schema", nil)
			}
			for _, event := range sourceEvents {
				if event.LibraryEvent != "KEY_PRESSED" && event.LibraryEvent != "KEY_RELEASED" && event.LibraryEvent != "KEY_TYPED" {
					return recorderError(RecorderInvalidRecording, operation, "text edit action contains a non-keyboard source event", nil)
				}
			}
		case "shortcut":
			if action.Source.Basis != recorderShortcutBasis || action.Position != nil || action.Destination != nil || action.Args.Button != "" || action.Args.ClickCount != 0 || action.Args.Steps != 0 || action.Args.Text != "" || action.Args.EditSemantics != "" || action.Args.Key != "" || len(action.Args.Keys) < 2 || len(action.Args.Keys) > 5 || action.Args.TextEdit != nil || action.Strategy != "keyboard.combination" || recorderValidateActionTarget(action) != nil || !recorderValidShortcutKeys(action.Args.Keys) {
				return recorderError(RecorderInvalidRecording, operation, "shortcut action is outside the whitelisted physical chord schema", nil)
			}
			if !recorderValidPhysicalKeySources(sourceEvents, action.Args.Keys[len(action.Args.Keys)-1], action.Args.Keys[:len(action.Args.Keys)-1], action.Args.RepeatCount) {
				return recorderError(RecorderInvalidRecording, operation, "shortcut action has invalid physical source evidence", nil)
			}
		case "key":
			if action.Source.Basis != recorderSpecialKeyBasis || action.Position != nil || action.Destination != nil || action.Args.Button != "" || action.Args.ClickCount != 0 || action.Args.Steps != 0 || action.Args.Text != "" || action.Args.EditSemantics != "" || action.Args.Key == "" || len(action.Args.Keys) != 0 || action.Args.TextEdit != nil || action.Strategy != "keyboard.press" || !recorderIsReplayableSpecialKey(action.Args.Key) || recorderValidateActionTarget(action) != nil || !recorderValidPhysicalKeySources(sourceEvents, action.Args.Key, nil, action.Args.RepeatCount) {
				return recorderError(RecorderInvalidRecording, operation, "special key action is outside the whitelisted physical key schema", nil)
			}
		default:
			return recorderError(RecorderGenerationBlocked, operation, "unknown action kind cannot be generated", nil)
		}
	}
	for _, item := range actions.EventDisposition {
		if item.ActionID != "" && !seenActions[item.ActionID] {
			return recorderError(RecorderInvalidRecording, operation, "eventDisposition has a dangling actionId", nil)
		}
	}
	_ = actionsPath
	return nil
}

func recorderRawBackedAction(action recorderAction) recorderAction {
	action.Target = nil
	stripProjection := func(position *recorderActionPosition) *recorderActionPosition {
		if position == nil {
			return nil
		}
		copy := *position
		copy.Window = nil
		copy.Display = nil
		return &copy
	}
	action.Position = stripProjection(action.Position)
	action.Destination = stripProjection(action.Destination)
	return action
}

const recorderGeneratedTextEditHelpers = `function __recorderRightRotate(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}
function __recorderSHA256(bytes) {
  const words = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const message = Array.from(bytes), bitLength = message.length * 8;
  message.push(0x80);
  while ((message.length % 64) !== 56) message.push(0);
  for (let index = 7; index >= 0; index -= 1) message.push((bitLength / Math.pow(2, index * 8)) & 0xff);
  const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const schedule = new Array(64);
  for (let offset = 0; offset < message.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) schedule[index] = ((message[offset+index*4]<<24)|(message[offset+index*4+1]<<16)|(message[offset+index*4+2]<<8)|message[offset+index*4+3]) >>> 0;
    for (let index = 16; index < 64; index += 1) {
      const a = __recorderRightRotate(schedule[index-15],7)^__recorderRightRotate(schedule[index-15],18)^(schedule[index-15]>>>3);
      const b = __recorderRightRotate(schedule[index-2],17)^__recorderRightRotate(schedule[index-2],19)^(schedule[index-2]>>>10);
      schedule[index] = (schedule[index-16]+a+schedule[index-7]+b) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1=__recorderRightRotate(e,6)^__recorderRightRotate(e,11)^__recorderRightRotate(e,25), choose=(e&f)^(~e&g);
      const t1=(h+s1+choose+words[index]+schedule[index])>>>0, s0=__recorderRightRotate(a,2)^__recorderRightRotate(a,13)^__recorderRightRotate(a,22), majority=(a&b)^(a&c)^(b&c), t2=(s0+majority)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    hash[0]=(hash[0]+a)>>>0; hash[1]=(hash[1]+b)>>>0; hash[2]=(hash[2]+c)>>>0; hash[3]=(hash[3]+d)>>>0;
    hash[4]=(hash[4]+e)>>>0; hash[5]=(hash[5]+f)>>>0; hash[6]=(hash[6]+g)>>>0; hash[7]=(hash[7]+h)>>>0;
  }
  return hash.map(part => part.toString(16).padStart(8,"0")).join("");
}
function __recorderUTF16SHA256(value) {
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index += 1) { const unit = value.charCodeAt(index); bytes[index*2] = unit & 0xff; bytes[index*2+1] = unit >>> 8; }
  return __recorderSHA256(bytes);
}
async function __recorderApplyTextEdit(win, selector, edit) {
  const ref = await Accessibility.find(selector, { within: win, maxDepth: 32, maxNodes: 5000 });
  if (!ref) throw new Error("Recorder candidate editable target was not found");
  try {
    const read = await Accessibility.read(ref, { properties: ["value", "focused"] });
    const current = read && read.properties && read.properties.value;
    if (!read || !read.properties || read.properties.focused !== true) throw new Error("Recorder candidate editable target is not focused");
    if (typeof current !== "string" || current.length !== edit.before.utf16Units || __recorderUTF16SHA256(current) !== edit.before.sha256) throw new Error("Recorder candidate editable value precondition mismatch");
    const patch = edit.patch;
    if (patch.start < 0 || patch.deleteCount < 0 || patch.start + patch.deleteCount > current.length) throw new Error("Recorder candidate text patch boundary is invalid");
    const next = current.slice(0, patch.start) + patch.insertText + current.slice(patch.start + patch.deleteCount);
    if (next.length !== edit.after.utf16Units || __recorderUTF16SHA256(next) !== edit.after.sha256) throw new Error("Recorder candidate text patch integrity mismatch");
    const performed = await Accessibility.perform(ref, { action: "setValue", value: next });
    if (!performed || (performed.actionState !== "acknowledged" && performed.actionState !== "not_needed")) throw new Error("Recorder candidate text edit was not acknowledged");
    const verified = await Accessibility.read(ref, { properties: ["value", "focused"] });
    const actual = verified && verified.properties && verified.properties.value;
    if (!verified || !verified.properties || verified.properties.focused !== true || typeof actual !== "string" || actual.length !== edit.after.utf16Units || __recorderUTF16SHA256(actual) !== edit.after.sha256) throw new Error("Recorder candidate text edit postcondition mismatch");
  } finally {
    await Accessibility.release(ref);
  }
}
`

func recorderGenerateBasicSource(actions recorderActions, rawEvents []recorderRawEvent, timing recorderGenerationTiming, pointerMotion string) ([]byte, []recorderCandidateMapping, []string, error) {
	if pointerMotion != recorderDefaultPointerMotion && pointerMotion != recorderSmoothPointerMotion {
		return nil, nil, nil, recorderError(RecorderInvalidArgument, "Recorder.generateScript", "pointer motion policy is invalid", nil)
	}
	platform, err := json.Marshal(actions.Environment.Platform)
	if err != nil {
		return nil, nil, nil, err
	}
	hasDisplayTarget, hasTextEdit := false, false
	omittedEvents := 0
	for _, item := range actions.EventDisposition {
		if item.Disposition == "omitted" {
			omittedEvents++
		}
	}
	for _, action := range actions.Actions {
		if action.Target != nil && action.Target.Kind == "display" {
			hasDisplayTarget = true
		}
		if action.Kind == "text-edit" {
			hasTextEdit = true
		}
	}
	var builder strings.Builder
	line := 1
	write := func(value string) {
		builder.WriteString(value)
		line += strings.Count(value, "\n")
	}
	write("// Generated deterministically by Recorder.generateScript(mode: \"basic\").\n")
	write("// It resolves a fresh window or display for every action and has not been verified.\n")
	write(fmt.Sprintf("// Pointer motion: %s; smooth transit is synthetic and does not reproduce recorded hover paths.\n", pointerMotion))
	write("const __recorderPlatform = System.getPlatformInfo();\n")
	write(fmt.Sprintf("if (!__recorderPlatform || __recorderPlatform.os !== %s) throw new Error(\"Recorder candidate platform mismatch\");\n", platform))
	if actions.Readiness == "needs-review" {
		write(fmt.Sprintf("console.warn(\"[Recorder partial candidate] readiness=needs-review; omitted raw events=%d; inspect the pinned actions issues before qualification.\");\n", omittedEvents))
	}
	write("async function __recorderResolveWindow(target) {\n")
	write("  let identity;\n")
	write("  switch (target.application.identityKind) {\n")
	write("    case \"executable-path\": identity = { exePath: target.application.identityValue }; break;\n")
	write("    case \"executable-name\": identity = { exeName: target.application.identityValue }; break;\n")
	write("    default: throw new Error(\"Unsupported Recorder application identity kind\");\n")
	write("  }\n")
	write("  try { return await window.get({ ...identity, title: target.title }); }\n")
	write("  catch (error) { if (!error || error.code !== \"NOT_FOUND\" || error.cause !== undefined) throw error; }\n")
	write("  return await window.get(identity);\n")
	write("}\n")
	if hasDisplayTarget {
		write("function __recorderResolveDisplay(target) {\n")
		write("  const rows = Screen.getDisplays();\n")
		write("  const idMatches = rows.filter(row => String(row.id || \"\") === target.id);\n")
		write("  const hardwareMatches = target.hardwareId ? rows.filter(row => String(row.hardwareId || \"\") === target.hardwareId) : [];\n")
		write("  const matches = idMatches.length === 1 ? idMatches : (hardwareMatches.length === 1 ? hardwareMatches : []);\n")
		write("  if (matches.length !== 1) throw new Error(\"Recorder candidate could not resolve one current target display\");\n")
		write("  const row = matches[0];\n")
		write("  if (![row.x, row.y, row.width, row.height].every(Number.isFinite) || row.width <= 0 || row.height <= 0) throw new Error(\"Recorder candidate resolved invalid display bounds\");\n")
		write("  return row;\n")
		write("}\n")
	}
	write("async function __recorderRequireResolvedActiveWindow(expected) {\n")
	write("  const active = await window.getActiveWindow();\n")
	write("  const sameCurrentWindow = String(active.id || \"\") !== \"\" && String(expected.id || \"\") !== \"\" ? String(active.id) === String(expected.id) : Number(active.pid) === Number(expected.pid) && String(active.title || \"\") === String(expected.title || \"\");\n")
	write("  if (!sameCurrentWindow) throw new Error(\"Recorder candidate active window mismatch\");\n")
	write("  return expected;\n")
	write("}\n")
	write("async function __recorderRequireActiveWindow(target) {\n")
	write("  return await __recorderRequireResolvedActiveWindow(await __recorderResolveWindow(target));\n")
	write("}\n")
	if hasTextEdit {
		write(recorderGeneratedTextEditHelpers)
	}
	write("function __recorderPoint(row, position, targetKind) {\n")
	write("  const point = Geometry.pointOffset(row, position.offsetX, position.offsetY);\n")
	write("  if (!Geometry.contains(Geometry.rect(row), point)) throw new Error(\"Recorder candidate relative point is outside current \" + targetKind + \" bounds\");\n")
	write("  return point;\n")
	write("}\n")
	write("function __recorderRequirePointer(point, actionId, phase) {\n")
	write("  const actual = mouse.getPos();\n")
	write("  if (!actual || Math.abs(Number(actual.x) - Number(point.x)) > 2 || Math.abs(Number(actual.y) - Number(point.y)) > 2) throw new Error(\"Recorder candidate pointer position mismatch for \" + actionId + \" \" + phase);\n")
	write("  console.log(\"[Recorder candidate input] \" + JSON.stringify({ actionId, phase, point: { x: Number(actual.x), y: Number(actual.y) } }));\n")
	write("}\n")
	windowTargetJSON := func(action recorderAction) ([]byte, error) {
		if action.Target == nil || action.Target.Window == nil {
			return nil, fmt.Errorf("action window target is missing")
		}
		return json.Marshal(map[string]any{
			"title": action.Target.Window.Title,
			"application": map[string]string{
				"identityKind":  action.Target.Window.Application.IdentityKind,
				"identityValue": action.Target.Window.Application.IdentityValue,
			},
		})
	}
	mappings := make([]recorderCandidateMapping, 0, len(actions.Actions))
	for index, action := range actions.Actions {
		if index > 0 {
			previous := actions.Actions[index-1]
			previousEnd := recorderActionTimeMilliseconds(previous.Timing.NativeEnd, previous.Timing.NativeUnit)
			currentStart := recorderActionTimeMilliseconds(action.Timing.NativeStart, action.Timing.NativeUnit)
			previousSequence := recorderNativeStringValue(previous.Timing.SequenceEnd)
			currentSequence := recorderNativeStringValue(action.Timing.SequenceStart)
			if !recorderHasPauseBoundary(rawEvents, previousSequence, currentSequence) {
				var recordedGap uint64
				if currentStart > previousEnd {
					recordedGap = currentStart - previousEnd
				}
				effectiveDelay := uint64(math.Round(float64(recordedGap) / timing.SpeedMultiplier))
				if effectiveDelay < timing.MinimumDelayMS {
					effectiveDelay = timing.MinimumDelayMS
				}
				if effectiveDelay > timing.MaximumDelayMS {
					effectiveDelay = timing.MaximumDelayMS
				}
				if effectiveDelay > 0 {
					write(fmt.Sprintf("await sleep(%d); // recorded gap: %dms\n", effectiveDelay, recordedGap))
				}
			}
		}
		switch action.Kind {
		case "click":
			if action.Target.Kind == "display" {
				hardwareID := action.Target.Display.HardwareID
				if strings.HasPrefix(strings.ToLower(hardwareID), "unknown") {
					hardwareID = ""
				}
				target, targetErr := json.Marshal(map[string]string{
					"id": action.Target.Display.ID, "hardwareId": hardwareID,
				})
				position, positionErr := json.Marshal(action.Position.Display)
				if targetErr != nil || positionErr != nil {
					return nil, nil, nil, errors.Join(targetErr, positionErr)
				}
				write(fmt.Sprintf("const __recorderDisplay%d = __recorderResolveDisplay(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderPoint%d = __recorderPoint(__recorderDisplay%d, %s, \"display\");\n", index+1, index+1, position))
			} else {
				target, targetErr := windowTargetJSON(action)
				position, positionErr := json.Marshal(action.Position.Window)
				if targetErr != nil || positionErr != nil {
					return nil, nil, nil, errors.Join(targetErr, positionErr)
				}
				write(fmt.Sprintf("const __recorderWindow%d = await __recorderResolveWindow(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderPoint%d = __recorderPoint(__recorderWindow%d, %s, \"window\");\n", index+1, index+1, position))
			}
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			if pointerMotion == recorderSmoothPointerMotion {
				write(fmt.Sprintf("await mouse.move(__recorderPoint%d.x, __recorderPoint%d.y, { steps: %d });\n", index+1, index+1, recorderSmoothPointerMotionSteps))
				write(fmt.Sprintf("__recorderRequirePointer(__recorderPoint%d, %q, \"click-position-confirmed\");\n", index+1, action.ID))
			}
			write(fmt.Sprintf("await mouse.clickPoint(__recorderPoint%d, { button: \"left\", clickCount: 1 });\n", index+1))
		case "drag":
			if action.Target.Kind == "display" {
				hardwareID := action.Target.Display.HardwareID
				if strings.HasPrefix(strings.ToLower(hardwareID), "unknown") {
					hardwareID = ""
				}
				target, targetErr := json.Marshal(map[string]string{
					"id": action.Target.Display.ID, "hardwareId": hardwareID,
				})
				start, startErr := json.Marshal(action.Position.Display)
				end, endErr := json.Marshal(action.Destination.Display)
				if targetErr != nil || startErr != nil || endErr != nil {
					return nil, nil, nil, errors.Join(targetErr, startErr, endErr)
				}
				write(fmt.Sprintf("const __recorderDisplay%d = __recorderResolveDisplay(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderDragStart%d = __recorderPoint(__recorderDisplay%d, %s, \"display\");\n", index+1, index+1, start))
				write(fmt.Sprintf("const __recorderDragEnd%d = __recorderPoint(__recorderDisplay%d, %s, \"display\");\n", index+1, index+1, end))
			} else {
				target, targetErr := windowTargetJSON(action)
				start, startErr := json.Marshal(action.Position.Window)
				end, endErr := json.Marshal(action.Destination.Window)
				if targetErr != nil || startErr != nil || endErr != nil {
					return nil, nil, nil, errors.Join(targetErr, startErr, endErr)
				}
				write(fmt.Sprintf("const __recorderWindow%d = await __recorderResolveWindow(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderDragStart%d = __recorderPoint(__recorderWindow%d, %s, \"window\");\n", index+1, index+1, start))
				write(fmt.Sprintf("const __recorderDragEnd%d = __recorderPoint(__recorderWindow%d, %s, \"window\");\n", index+1, index+1, end))
			}
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			if pointerMotion == recorderSmoothPointerMotion {
				write(fmt.Sprintf("await mouse.move(__recorderDragStart%d.x, __recorderDragStart%d.y, { steps: %d });\n", index+1, index+1, recorderSmoothPointerMotionSteps))
			} else {
				write(fmt.Sprintf("await mouse.move(__recorderDragStart%d.x, __recorderDragStart%d.y);\n", index+1, index+1))
			}
			write(fmt.Sprintf("__recorderRequirePointer(__recorderDragStart%d, %q, \"start-position-confirmed\");\n", index+1, action.ID))
			write("await mouse.down({ button: \"left\" });\n")
			write(fmt.Sprintf("console.log(\"[Recorder candidate input] \" + JSON.stringify({ actionId: %q, phase: \"button-down-returned\" }));\n", action.ID))
			write("try {\n")
			if action.Target.Kind == "window" {
				write(fmt.Sprintf("  await __recorderRequireResolvedActiveWindow(__recorderWindow%d);\n", index+1))
				write(fmt.Sprintf("  console.log(\"[Recorder candidate input] \" + JSON.stringify({ actionId: %q, phase: \"active-window-confirmed\" }));\n", action.ID))
			}
			write(fmt.Sprintf("  await mouse.move(__recorderDragEnd%d.x, __recorderDragEnd%d.y, { steps: %d });\n", index+1, index+1, action.Args.Steps))
			write(fmt.Sprintf("  __recorderRequirePointer(__recorderDragEnd%d, %q, \"end-position-confirmed\");\n", index+1, action.ID))
			write("} finally {\n")
			write("  await mouse.up({ button: \"left\" });\n")
			write(fmt.Sprintf("  console.log(\"[Recorder candidate input] \" + JSON.stringify({ actionId: %q, phase: \"button-up-returned\" }));\n", action.ID))
			write("}\n")
		case "wheel":
			if action.Target.Kind == "display" {
				hardwareID := action.Target.Display.HardwareID
				if strings.HasPrefix(strings.ToLower(hardwareID), "unknown") {
					hardwareID = ""
				}
				target, targetErr := json.Marshal(map[string]string{
					"id": action.Target.Display.ID, "hardwareId": hardwareID,
				})
				position, positionErr := json.Marshal(action.Position.Display)
				if targetErr != nil || positionErr != nil {
					return nil, nil, nil, errors.Join(targetErr, positionErr)
				}
				write(fmt.Sprintf("const __recorderDisplay%d = __recorderResolveDisplay(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderWheelPoint%d = __recorderPoint(__recorderDisplay%d, %s, \"display\");\n", index+1, index+1, position))
			} else {
				target, targetErr := windowTargetJSON(action)
				position, positionErr := json.Marshal(action.Position.Window)
				if targetErr != nil || positionErr != nil {
					return nil, nil, nil, errors.Join(targetErr, positionErr)
				}
				write(fmt.Sprintf("const __recorderWindow%d = await __recorderResolveWindow(%s);\n", index+1, target))
				write(fmt.Sprintf("const __recorderWheelPoint%d = __recorderPoint(__recorderWindow%d, %s, \"window\");\n", index+1, index+1, position))
			}
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			if pointerMotion == recorderSmoothPointerMotion {
				write(fmt.Sprintf("await mouse.move(__recorderWheelPoint%d.x, __recorderWheelPoint%d.y, { steps: %d });\n", index+1, index+1, recorderSmoothPointerMotionSteps))
				write(fmt.Sprintf("__recorderRequirePointer(__recorderWheelPoint%d, %q, \"wheel-position-confirmed\");\n", index+1, action.ID))
			} else {
				write(fmt.Sprintf("await mouse.move(__recorderWheelPoint%d.x, __recorderWheelPoint%d.y);\n", index+1, index+1))
			}
			write(fmt.Sprintf("await mouse.wheel({ deltaX: %d, deltaY: %d, steps: %d, delay: %d });\n", action.Args.DeltaX, action.Args.DeltaY, action.Args.Steps, action.Args.DelayMS))
		case "text":
			target, targetErr := windowTargetJSON(action)
			if targetErr != nil {
				return nil, nil, nil, targetErr
			}
			text, err := json.Marshal(action.Args.Text)
			if err != nil {
				return nil, nil, nil, err
			}
			write(fmt.Sprintf("const __recorderText%d = %s; // Low-level text fallback; this may be IME phonetic input rather than the committed result.\n", index+1, text))
			write(fmt.Sprintf("await __recorderRequireActiveWindow(%s);\n", target))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			write(fmt.Sprintf("await keyboard.type(__recorderText%d);\n", index+1))
		case "text-edit":
			target, targetErr := windowTargetJSON(action)
			if targetErr != nil || action.Target.Editable == nil || action.Args.TextEdit == nil {
				return nil, nil, nil, errors.Join(targetErr, fmt.Errorf("text edit target or arguments are missing"))
			}
			selectorValue := map[string]string{"role": action.Target.Editable.Role}
			if action.Target.Editable.Identifier != "" {
				selectorValue["identifier"] = action.Target.Editable.Identifier
			} else if action.Target.Editable.Name != "" {
				selectorValue["name"] = action.Target.Editable.Name
			}
			selector, selectorErr := json.Marshal(selectorValue)
			edit, editErr := json.Marshal(action.Args.TextEdit)
			if selectorErr != nil || editErr != nil {
				return nil, nil, nil, errors.Join(selectorErr, editErr)
			}
			write(fmt.Sprintf("const __recorderTextWindow%d = await __recorderRequireActiveWindow(%s);\n", index+1, target))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			write(fmt.Sprintf("await __recorderApplyTextEdit(__recorderTextWindow%d, %s, %s);\n", index+1, selector, edit))
		case "shortcut":
			target, targetErr := windowTargetJSON(action)
			keys, keysErr := json.Marshal(action.Args.Keys)
			if targetErr != nil || keysErr != nil {
				return nil, nil, nil, errors.Join(targetErr, keysErr)
			}
			write(fmt.Sprintf("await __recorderRequireActiveWindow(%s);\n", target))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			repeatCount, _ := recorderEffectiveKeyRepeatCount(action.Args.RepeatCount)
			if repeatCount == 1 {
				write(fmt.Sprintf("await keyboard.combination(...%s);\n", keys))
			} else {
				write(fmt.Sprintf("for (let __recorderRepeat%d = 0; __recorderRepeat%d < %d; __recorderRepeat%d += 1) {\n", index+1, index+1, repeatCount, index+1))
				write(fmt.Sprintf("  await keyboard.combination(...%s);\n", keys))
				write("}\n")
			}
		case "key":
			target, targetErr := windowTargetJSON(action)
			key, keyErr := json.Marshal(action.Args.Key)
			if targetErr != nil || keyErr != nil {
				return nil, nil, nil, errors.Join(targetErr, keyErr)
			}
			write(fmt.Sprintf("await __recorderRequireActiveWindow(%s);\n", target))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			repeatCount, _ := recorderEffectiveKeyRepeatCount(action.Args.RepeatCount)
			if repeatCount == 1 {
				write(fmt.Sprintf("await keyboard.press(%s);\n", key))
			} else {
				write(fmt.Sprintf("for (let __recorderRepeat%d = 0; __recorderRepeat%d < %d; __recorderRepeat%d += 1) {\n", index+1, index+1, repeatCount, index+1))
				write(fmt.Sprintf("  await keyboard.press(%s);\n", key))
				write("}\n")
			}
		default:
			return nil, nil, nil, recorderError(RecorderGenerationBlocked, "Recorder.generateScript", "unsupported action kind", nil)
		}
	}
	constraints := []string{
		"verification is not-run until the generated file is executed separately and its outcome is independently checked",
		"the recorded OS must match before input",
		"each action uses window.get with recorded executable path/name and exact title; only a missing match permits unique executable-only fallback",
		"desktop-level clicks resolve exactly one current display by recorded display ID or unique hardware identity before input",
		"recorded process IDs and native window handles are provenance only and are not reused as cross-execution identity",
		"the operator must restore the intended starting desktop and application state before execution",
		"clicks use Geometry.pointOffset and Geometry.contains with recorded top-left window offsets against fresh bounds, so window translation is supported; normalized ratios are retained for review but resizing is not guessed",
		"desktop-level clicks use recorded top-left display offsets against fresh bounds and require the operator to restore the intended desktop chrome state",
		"straight left-button drags resolve and bounds-check both endpoints, confirm the pointer reached each endpoint, verify window targets became active after button-down, preserve a bounded motion sample count, and always release the button in finally",
		"generated drag trace lines prove only resolved input-call boundaries and pointer observations, never target business success",
		"wheel bursts move to a bounds-checked recorded window/display-relative point before input, preserve signed horizontal or vertical total delta, and replay at most 100 equal steps",
		fmt.Sprintf("pointer motion policy is %s; smooth transit is a fixed 60-step synthetic pre-action move, not a recorded hover path", pointerMotion),
		"shortcuts and special keys require the recorded application/window to be active immediately before physical replay",
		"repeated physical key presses are collapsed into a bounded repeatCount and replayed sequentially",
		"verified focused text edits require a unique Accessibility textField and exact UTF-16LE SHA-256 precondition; setValue is followed by an exact hash postcondition and is never retried",
		"low-level Basic Latin text is emitted as an editable script variable when no focused final value is available; under an input method it may be phonetic input rather than the committed result and must be reviewed or parameterized before production qualification",
		"text content is present only when captureKeyboard and keyboardContent=non-sensitive-test were explicitly recorded; secure fields are never read",
		fmt.Sprintf("each non-pause inter-action raw gap is divided by speedMultiplier %.6g and clamped to %d..%d milliseconds", timing.SpeedMultiplier, timing.MinimumDelayMS, timing.MaximumDelayMS),
		"time between explicit Recorder pause and resume boundaries is not replayed",
		"the candidate does not infer business intent, target identity, retries, OCR, or postconditions",
	}
	if actions.Readiness == "needs-review" {
		constraints = append(constraints, fmt.Sprintf("partial candidate: %d raw event(s) were omitted; inspect the pinned actions issues and repair or re-record before claiming complete behavior", omittedEvents))
	}
	return []byte(builder.String()), mappings, constraints, nil
}

func (r *RecorderRuntime) resolveRecordingDir(input, operation string) (string, error) {
	root, err := filepath.Abs(filepath.Join(r.workDir, ".runtime", "recordings"))
	if err != nil {
		return "", recorderError(RecorderInvalidArgument, operation, "could not normalize recording root", err)
	}
	path := input
	if !filepath.IsAbs(path) {
		path = filepath.Join(r.workDir, path)
	}
	path, err = filepath.Abs(filepath.Clean(path))
	if err != nil || !recorderPathWithin(root, path) {
		return "", recorderError(RecorderInvalidArgument, operation, "recordingDir must stay within .runtime/recordings", err)
	}
	if err := recorderRejectSymlinkPath(root, path); err != nil {
		return "", recorderError(RecorderInvalidArgument, operation, "recordingDir contains a symbolic link", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", recorderWrapFileError(operation, "recordingDir", err)
	}
	if !info.IsDir() {
		return "", recorderError(RecorderInvalidArgument, operation, "recordingDir must be a directory", nil)
	}
	return path, nil
}

func (r *RecorderRuntime) resolveActionsFile(input, operation string) (string, string, error) {
	path := input
	if !filepath.IsAbs(path) {
		path = filepath.Join(r.workDir, path)
	}
	path, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", "", recorderError(RecorderInvalidArgument, operation, "actionsFile could not be normalized", err)
	}
	recordingDir := filepath.Dir(path)
	resolvedDir, err := r.resolveRecordingDir(recordingDir, operation)
	if err != nil {
		return "", "", err
	}
	name := filepath.Base(path)
	if name != "actions.json" && !regexp.MustCompile(`^actions\.r[0-9]{3}\.json$`).MatchString(name) {
		return "", "", recorderError(RecorderInvalidArgument, operation, "actionsFile must be a Recorder actions.json revision in the recording directory", nil)
	}
	if err := recorderRejectSymlinkPath(resolvedDir, path); err != nil {
		return "", "", recorderError(RecorderInvalidArgument, operation, "actionsFile is a symbolic link", err)
	}
	return path, resolvedDir, nil
}

func recorderReadRegular(path string, limit int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("not a regular non-symlink file")
	}
	if info.Size() > limit {
		return nil, fmt.Errorf("file exceeds %d bytes", limit)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	payload, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(payload)) > limit {
		return nil, fmt.Errorf("file exceeds %d bytes", limit)
	}
	return payload, nil
}

func recorderDecodeStrict(payload []byte, output any) error {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(output); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return fmt.Errorf("trailing JSON value")
	}
	return nil
}

func recorderSHA256(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func recorderWriteExclusive(path string, payload []byte, mode os.FileMode) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(path)
		}
	}()
	if _, err := file.Write(payload); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := recorderSyncDirectory(filepath.Dir(path)); err != nil {
		return err
	}
	committed = true
	return nil
}

func recorderWrapFileError(operation, label string, err error) error {
	if errors.Is(err, os.ErrNotExist) {
		return recorderError(RecorderNotFound, operation, label+" was not found", err)
	}
	return recorderError(RecorderStorageFailed, operation, "could not read "+label, err)
}
