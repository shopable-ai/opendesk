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
	recorderActionsFormatVersion   = "opendesk.recorder.actions/v2"
	recorderCandidateFormatVersion = "opendesk.recorder.basic-candidate/v3"
	recorderMaxRawBytes            = 16 * 1024 * 1024
	recorderMaxActionsBytes        = 8 * 1024 * 1024
	recorderMaxRawEvents           = 100000
	recorderMaxRawLineBytes        = 256 * 1024
	recorderMaxActions             = 10000
	recorderMaxTextActionRunes     = 4096
	recorderDefaultMinimumDelayMS  = uint64(500)
	recorderDefaultMaximumDelayMS  = uint64(30000)
	recorderMaximumTimingDelayMS   = uint64(1800000)
	recorderMinimumSpeedMultiplier = 0.1
	recorderMaximumSpeedMultiplier = 100.0
	recorderClickJitterPixels      = 4
	recorderClickedBasis           = "libuiohook CLICKED associated with PRESSED and RELEASED"
	recorderJitterClickBasis       = "libuiohook press/release with bounded drag jitter and no CLICKED event"
	recorderInitialRevisionReason  = "initial deterministic build from fixed raw bytes"
	recorderRebuildRevisionReason  = "prior actions revision had different bytes; rebuilt from fixed raw without overwriting it"
	recorderRevisionBasis          = "Recorder.buildActions/opendesk.recorder.actions-v2"
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
	X          int                     `json:"x"`
	Y          int                     `json:"y"`
	Space      string                  `json:"space"`
	DisplayRef string                  `json:"displayRef"`
	Verified   bool                    `json:"verified"`
	Window     *recorderWindowPosition `json:"window,omitempty"`
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

type recorderActionTarget struct {
	Kind           string                   `json:"kind"`
	Resolution     string                   `json:"resolution"`
	Window         recorderWindowSnapshot   `json:"window"`
	SemanticStatus string                   `json:"semanticStatus"`
	SemanticReason string                   `json:"semanticReason,omitempty"`
	Element        *recorderElementSnapshot `json:"element,omitempty"`
}

type recorderActionArguments struct {
	Button        string `json:"button,omitempty"`
	ClickCount    int    `json:"clickCount,omitempty"`
	Text          string `json:"text,omitempty"`
	EditSemantics string `json:"editSemantics,omitempty"`
}

type recorderActionReview struct {
	Required bool   `json:"required"`
	Status   string `json:"status"`
}

type recorderAction struct {
	ID       string                  `json:"id"`
	Kind     string                  `json:"kind"`
	Source   recorderActionSource    `json:"source"`
	Timing   recorderActionTiming    `json:"timing"`
	Position *recorderActionPosition `json:"position"`
	Target   *recorderActionTarget   `json:"target,omitempty"`
	Args     recorderActionArguments `json:"args"`
	Strategy string                  `json:"strategy"`
	Review   recorderActionReview    `json:"review"`
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
}

func (r recorderScriptResult) jsValue() map[string]any {
	return map[string]any{
		"scriptFile": r.ScriptFile, "candidateFile": r.CandidateFile,
		"actionsSha256": r.ActionsSHA256, "scriptSha256": r.ScriptSHA256,
		"constraints": append([]string(nil), r.Constraints...), "verification": r.Verification,
		"timing": r.Timing.jsValue(),
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
	mode, outputFile := "basic", ""
	timing := recorderDefaultGenerationTiming()
	if err == nil && len(call.Arguments) > 1 && !goja.IsUndefined(call.Argument(1)) && !goja.IsNull(call.Argument(1)) {
		object := call.Argument(1).ToObject(r.runtime)
		if object == nil || object.ClassName() != "Object" {
			err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "options must be an object", nil)
		} else if unknownErr := recorderRejectUnknownKeys(object, map[string]bool{"mode": true, "outputFile": true, "timing": true}); unknownErr != nil {
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
		}
	}
	if err == nil {
		err = recorderNoExtraArguments(call, 2, "Recorder.generateScript")
	}
	if err == nil && mode != "basic" {
		err = recorderError(RecorderInvalidArgument, "Recorder.generateScript", "mode must be \"basic\"", nil)
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
	r.startWorker(func() (any, error) { return r.generateBasicScript(actionsFile, outputFile, timing) }, func(result any, err error) {
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
	if manifest.State != "stopped" || manifest.Storage.State != "saved" {
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
	produced, dispositions, issues := recorderBuildActionList(events)
	produced, contextIssues := recorderEnrichActionsWithWindowContext(produced, manifest, events)
	actions.Actions = produced
	actions.EventDisposition = dispositions
	actions.Issues = appendIssues(actions.Issues, issues)
	actions.Issues = appendIssues(actions.Issues, contextIssues)
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
	seenContexts := map[string]bool{}
	for _, context := range manifest.InputContexts {
		if !recorderIDPattern.MatchString(context.EventID) || seenContexts[context.EventID] || (context.Kind != "pointer" && context.Kind != "keyboard") || (context.Status != "verified" && context.Status != "unverified") || context.ResolutionDelayMS < 0 {
			return fmt.Errorf("input window context is invalid for event %s", context.EventID)
		}
		seenContexts[context.EventID] = true
		event, ok := eventsByID[context.EventID]
		if !ok || (context.Kind == "pointer" && event.LibraryEvent != "MOUSE_RELEASED") || (context.Kind == "keyboard" && event.LibraryEvent != "KEY_TYPED") {
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
	return nil
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
	if snapshot == nil || snapshot.Source != "accessibility" || (snapshot.Resolution != "point-hit" && snapshot.Resolution != "nearest-actionable-ancestor") || strings.TrimSpace(snapshot.Role) == "" || snapshot.Bounds.Width <= 0 || snapshot.Bounds.Height <= 0 || !recorderPointInsideWindow(snapshot.Bounds.X+snapshot.Point.OffsetX, snapshot.Bounds.Y+snapshot.Point.OffsetY, snapshot.Bounds) {
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
		Role: snapshot.Role, NativeRole: snapshot.NativeRole, Name: snapshot.Name, Identifier: snapshot.Identifier,
		NativeActions: snapshot.NativeActions, Bounds: snapshot.Bounds,
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
	if _, err := time.Parse(time.RFC3339Nano, snapshot.ObservedAt); err != nil {
		return fmt.Errorf("element observedAt is invalid")
	}
	if math.IsNaN(snapshot.Point.XRatio) || math.IsInf(snapshot.Point.XRatio, 0) || math.IsNaN(snapshot.Point.YRatio) || math.IsInf(snapshot.Point.YRatio, 0) || snapshot.Point.XRatio < 0 || snapshot.Point.XRatio >= 1 || snapshot.Point.YRatio < 0 || snapshot.Point.YRatio >= 1 || math.Abs(snapshot.Point.XRatio-float64(snapshot.Point.OffsetX)/float64(snapshot.Bounds.Width)) > 1e-12 || math.Abs(snapshot.Point.YRatio-float64(snapshot.Point.OffsetY)/float64(snapshot.Bounds.Height)) > 1e-12 {
		return fmt.Errorf("element-relative point is invalid")
	}
	return nil
}

func recorderValidateElementDescriptor(descriptor recorderElementDescriptor) error {
	if strings.TrimSpace(descriptor.Role) == "" || len(descriptor.Role) > 128 || len(descriptor.NativeRole) > 128 || len(descriptor.Name) > 1024 || len(descriptor.Identifier) > 512 || descriptor.NativeActions == nil || len(descriptor.NativeActions) > 32 || descriptor.Bounds.Width <= 0 || descriptor.Bounds.Height <= 0 {
		return fmt.Errorf("element descriptor is invalid")
	}
	for _, action := range descriptor.NativeActions {
		if strings.TrimSpace(action) == "" || len(action) > 128 {
			return fmt.Errorf("element native action is invalid")
		}
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

func recorderValidControlClickEnvelope(events []recorderRawEvent) bool {
	if len(events) < 2 || events[0].LibraryEvent != "MOUSE_PRESSED" || events[0].Button != "left" || events[0].Clicks != 1 {
		return false
	}
	first := events[0]
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
			if index != 0 || event.Button != "left" || event.Clicks != 1 || recorderHasControlModifier(event.ModifierMask) {
				return false
			}
		case "MOUSE_RELEASED":
			released++
			if event.Button != "left" || event.Clicks != 1 || recorderHasControlModifier(event.ModifierMask) {
				return false
			}
		case "MOUSE_CLICKED":
			clicked++
			if index != len(events)-1 || event.Button != "left" || event.Clicks != 1 || recorderHasControlModifier(event.ModifierMask) {
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
			if receivedErr == nil && delta <= 1500*time.Millisecond && recorderValidControlClickEnvelope(candidate) {
				return append([]recorderRawEvent(nil), candidate...)
			}
		}
	}
	return nil
}

func recorderControlClickReferences(event recorderRawEvent) ([]string, error) {
	if event.LibraryEvent != "RECORDER_CONTROL_CLICK" || event.Source != "recorder" {
		return nil, fmt.Errorf("not a Recorder control-click boundary")
	}
	if len(event.Metadata) != 4 || event.Metadata["windowId"] == "" || event.Metadata["targetId"] == "" || event.Metadata["uiTimestamp"] == "" || event.Metadata["triggerEventIds"] == "" {
		return nil, fmt.Errorf("control-click metadata is incomplete")
	}
	for key := range event.Metadata {
		if key != "windowId" && key != "targetId" && key != "uiTimestamp" && key != "triggerEventIds" {
			return nil, fmt.Errorf("control-click metadata contains an unknown field")
		}
	}
	if !recorderIDPattern.MatchString(event.Metadata["windowId"]) || !recorderIDPattern.MatchString(event.Metadata["targetId"]) {
		return nil, fmt.Errorf("control-click identity is invalid")
	}
	uiTimestamp, err := time.Parse(time.RFC3339Nano, event.Metadata["uiTimestamp"])
	if err != nil {
		return nil, fmt.Errorf("control-click timestamp is invalid")
	}
	boundaryTimestamp, err := time.Parse(time.RFC3339Nano, event.ReceivedAt)
	if err != nil || uiTimestamp.After(boundaryTimestamp.Add(time.Second)) || boundaryTimestamp.Sub(uiTimestamp) > 5*time.Second {
		return nil, fmt.Errorf("control-click timestamp is outside the boundary window")
	}
	var eventIDs []string
	if err := json.Unmarshal([]byte(event.Metadata["triggerEventIds"]), &eventIDs); err != nil || eventIDs == nil || len(eventIDs) > 64 {
		return nil, fmt.Errorf("control-click event references are invalid")
	}
	seen := map[string]bool{}
	for _, eventID := range eventIDs {
		if !recorderIDPattern.MatchString(eventID) || seen[eventID] {
			return nil, fmt.Errorf("control-click event references are invalid")
		}
		seen[eventID] = true
	}
	return eventIDs, nil
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
		references, err := recorderControlClickReferences(event)
		if err != nil {
			issues = appendIssue(issues, recorderIssue{Code: "control-click-boundary-invalid", Severity: "error", Message: err.Error(), EventID: event.EventID})
			continue
		}
		if len(references) == 0 {
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
			uiTimestamp, _ := time.Parse(time.RFC3339Nano, event.Metadata["uiTimestamp"])
			lastTimestamp, timestampErr := time.Parse(time.RFC3339Nano, group[len(group)-1].ReceivedAt)
			delta := uiTimestamp.Sub(lastTimestamp)
			if delta < 0 {
				delta = -delta
			}
			if timestampErr != nil || delta > 1500*time.Millisecond {
				valid = false
			}
		}
		if !valid || !recorderValidControlClickEnvelope(group) {
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
	actions := make([]recorderAction, 0)
	disposition := make(map[string]recorderEventDisposition, len(events))
	controlExclusions, issues := recorderControlClickExclusions(events)
	segments := map[string]*recorderMouseSegment{}
	pressedKeys := map[uint16]recorderRawEvent{}
	eventSegments := recorderCaptureSegmentIndexes(events)
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
				if action != nil {
					actions = append(actions, *action)
					for _, eventID := range action.Source.EventIDs {
						reason := "bounded pointer-jitter evidence for click"
						kind := "evidence"
						if eventID == segment.release.EventID {
							reason, kind = "authoritative release for bounded pointer-jitter click", "consumed"
						}
						disposition[eventID] = recorderEventDisposition{EventID: eventID, Disposition: kind, ActionID: action.ID, Reason: reason}
					}
				} else {
					issues = appendIssue(issues, recorderIssue{Code: "drag-unsupported", Severity: "error", Message: "drag path exceeded the bounded click-jitter envelope and basic generation does not support dragging", EventID: segment.dragged[0].EventID})
					disposition[segment.press.EventID] = recorderEventDisposition{EventID: segment.press.EventID, Disposition: "pending", Reason: "part of unsupported drag"}
					disposition[segment.release.EventID] = recorderEventDisposition{EventID: segment.release.EventID, Disposition: "pending", Reason: "part of unsupported drag"}
				}
			}
			delete(segments, button)
		}
	}
	for index := range events {
		event := events[index]
		if _, exists := disposition[event.EventID]; !exists {
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "not classified"}
		}
		if reason, excluded := controlExclusions[event.EventID]; excluded {
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
			for _, pressed := range pressedKeys {
				issues = appendIssue(issues, recorderIssue{Code: "input-open-at-pause", Severity: "error", Message: "a key press crossed an explicit pause boundary", EventID: pressed.EventID})
				disposition[pressed.EventID] = recorderEventDisposition{EventID: pressed.EventID, Disposition: "pending", Reason: "key press crossed a pause boundary"}
			}
			segments = map[string]*recorderMouseSegment{}
			pressedKeys = map[uint16]recorderRawEvent{}
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "excluded", Reason: "explicit recording pause boundary"}
		case "RECORDER_RESUMED":
			flushText()
			segments = map[string]*recorderMouseSegment{}
			pressedKeys = map[uint16]recorderRawEvent{}
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
			action, eventIssues := recorderBuildClickAction(event, segment, len(actions)+1)
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
			issues = appendIssue(issues, recorderIssue{Code: "wheel-unsupported", Severity: "error", Message: "basic generation does not support wheel input", EventID: event.EventID})
			disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "wheel generation is unsupported"}
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
				if recorderHasControlModifier(event.ModifierMask) && event.ModifierMask&((1<<0)|(1<<4)) == 0 {
					issues = appendIssue(issues, recorderIssue{Code: "control-combination-unsupported", Severity: "error", Message: "control/meta/alt keyboard combinations are not generated in basic mode", EventID: event.EventID})
				}
			} else if event.Rawcode != nil && typedRawcodes[eventSegments[event.EventID]][*event.Rawcode] {
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "evidence", Reason: "physical key event is not replayed in addition to text"}
			} else {
				flushText()
				issues = appendIssue(issues, recorderIssue{Code: "physical-key-unsupported", Severity: "error", Message: "physical key without a supported KEY_TYPED source cannot be generated", EventID: event.EventID})
				disposition[event.EventID] = recorderEventDisposition{EventID: event.EventID, Disposition: "pending", Reason: "physical key generation is unsupported"}
			}
			if event.Keycode != nil {
				if event.LibraryEvent == "KEY_PRESSED" {
					pressedKeys[*event.Keycode] = event
				} else {
					delete(pressedKeys, *event.Keycode)
				}
			}
		default:
			flushText()
			issues = appendIssue(issues, recorderIssue{Code: "unknown-library-event", Severity: "error", Message: "unknown libuiohook event kind", EventID: event.EventID})
		}
	}
	flushText()
	finalizeReleased("")
	for _, segment := range segments {
		if segment.press != nil && segment.release == nil {
			issues = appendIssue(issues, recorderIssue{Code: "missing-release-at-stop", Severity: "error", Message: "recording stopped before a matching mouse release", EventID: segment.press.EventID})
			disposition[segment.press.EventID] = recorderEventDisposition{EventID: segment.press.EventID, Disposition: "pending", Reason: "missing release at recording boundary"}
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
		}
		if item.Disposition == "evidence" && item.ActionID == "" {
			issues = appendIssue(issues, recorderIssue{Code: "unassociated-key-evidence", Severity: "error", Message: "keyboard state evidence is not associated with a supported text action", EventID: event.EventID})
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
	for _, event := range events {
		eventByID[event.EventID] = event
	}
	for index := range actions {
		if actions[index].Kind != "text" {
			continue
		}
		typedRawcodes[index] = map[uint16]bool{}
		for _, eventID := range actions[index].Source.EventIDs {
			if source, ok := eventByID[eventID]; ok && source.LibraryEvent == "KEY_TYPED" && source.Rawcode != nil {
				typedRawcodes[index][*source.Rawcode] = true
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
			if actions[index].Kind != "text" {
				continue
			}
			if len(actions[index].Source.EventIDs) == 0 || eventSegments[actions[index].Source.EventIDs[0]] != eventSegments[event.EventID] {
				continue
			}
			matchesRawcode := event.Rawcode != nil && typedRawcodes[index][*event.Rawcode]
			matchesModifier := event.Keycode != nil && recorderIsModifierKey(*event.Keycode) && !recorderHasControlModifier(event.ModifierMask)
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
		if actions[index].Kind != "text" {
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

func recorderBuildClickAction(clicked recorderRawEvent, segment *recorderMouseSegment, ordinal int) (*recorderAction, []recorderIssue) {
	issues := make([]recorderIssue, 0)
	fail := func(code, message string) {
		issues = appendIssue(issues, recorderIssue{Code: code, Severity: "error", Message: message, EventID: clicked.EventID})
	}
	if clicked.Button != "left" {
		fail("mouse-button-unsupported", "basic generation only supports the left mouse button")
	}
	if clicked.Clicks != 1 {
		fail("click-count-unsupported", "double-click and multi-click input is not downgraded to a single click")
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
		var context *recorderInputContext
		contextEventID := ""
		if action.Kind == "click" {
			for _, eventID := range action.Source.EventIDs {
				if eventsByID[eventID].LibraryEvent == "MOUSE_RELEASED" {
					contextEventID = eventID
					break
				}
			}
		} else if action.Kind == "text" {
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
			Kind: "window", Resolution: "application-identity+window-title", Window: snapshot,
			SemanticStatus: context.SemanticStatus, SemanticReason: context.SemanticReason, Element: context.Element,
		}
		if action.Kind != "click" || action.Position == nil {
			continue
		}
		x, y := action.Position.X, action.Position.Y
		if !recorderPointInsideWindow(x, y, snapshot.Bounds) {
			issues = appendIssue(issues, recorderIssue{Code: "window-relative-coordinate-invalid", Severity: "error", Message: "click point is outside its verified window bounds", EventID: contextEventID})
			continue
		}
		offsetX, offsetY := x-snapshot.Bounds.X, y-snapshot.Bounds.Y
		action.Position.Window = &recorderWindowPosition{
			Anchor: "top-left", OffsetX: offsetX, OffsetY: offsetY,
			XRatio: float64(offsetX) / float64(snapshot.Bounds.Width),
			YRatio: float64(offsetY) / float64(snapshot.Bounds.Height),
			Space:  "window-logical", Verified: true,
		}
	}
	return actions, issues
}

func recorderValidateActionWindowTarget(action recorderAction) error {
	if action.Target == nil || action.Target.Kind != "window" || action.Target.Resolution != "application-identity+window-title" {
		return fmt.Errorf("verified window target is missing")
	}
	if err := recorderValidateWindowSnapshot(&action.Target.Window); err != nil {
		return err
	}
	if action.Kind != "click" {
		if action.Target.SemanticStatus != "not-applicable" || action.Target.SemanticReason != "" || action.Target.Element != nil {
			return fmt.Errorf("non-pointer action has invalid semantic target evidence")
		}
		return nil
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
	if action.Position == nil || action.Position.Window == nil {
		return fmt.Errorf("window-relative click position is missing")
	}
	position := action.Position.Window
	bounds := action.Target.Window.Bounds
	if position.Anchor != "top-left" || position.Space != "window-logical" || !position.Verified || position.OffsetX < 0 || position.OffsetX >= bounds.Width || position.OffsetY < 0 || position.OffsetY >= bounds.Height || math.IsNaN(position.XRatio) || math.IsInf(position.XRatio, 0) || math.IsNaN(position.YRatio) || math.IsInf(position.YRatio, 0) || position.XRatio < 0 || position.XRatio >= 1 || position.YRatio < 0 || position.YRatio >= 1 {
		return fmt.Errorf("window-relative click position is invalid")
	}
	if action.Position.X != bounds.X+position.OffsetX || action.Position.Y != bounds.Y+position.OffsetY || math.Abs(position.XRatio-float64(position.OffsetX)/float64(bounds.Width)) > 1e-12 || math.Abs(position.YRatio-float64(position.OffsetY)/float64(bounds.Height)) > 1e-12 {
		return fmt.Errorf("absolute and window-relative positions disagree")
	}
	if action.Target.Element != nil {
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

func recorderHasControlModifier(mask uint16) bool {
	return mask&((1<<1)|(1<<2)|(1<<3)|(1<<5)|(1<<6)|(1<<7)) != 0
}

func recorderIsModifierKey(code uint16) bool {
	switch code {
	case 0x002a, 0x0036, 0x001d, 0xe01d, 0xe05b, 0xe05c, 0x0038, 0xe038:
		return true
	}
	return false
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

func (r *RecorderRuntime) generateBasicScript(input, outputFile string, timing recorderGenerationTiming) (recorderScriptResult, error) {
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
	if actions.Readiness != "ready" {
		return recorderScriptResult{}, recorderError(RecorderGenerationBlocked, operation, "actions readiness is not ready; resolve its issues in a new actions revision", nil)
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
	script, mappings, constraints, err := recorderGenerateBasicSource(actions, rawEvents, timing)
	if err != nil {
		return recorderScriptResult{}, err
	}
	scriptHash := recorderSHA256(script)
	candidate := recorderCandidate{
		FormatVersion: recorderCandidateFormatVersion, RecordingID: actions.RecordingID,
		CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Mode: "basic",
		Actions:     recorderCandidateActionsRef{File: actionsPath, SHA256: actionsHash, Revision: actions.Revision},
		Script:      recorderCandidateScriptRef{File: scriptPath, SHA256: scriptHash},
		Timing:      timing,
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
	return recorderScriptResult{ScriptFile: scriptPath, CandidateFile: candidatePath, ActionsSHA256: actionsHash, ScriptSHA256: scriptHash, Constraints: constraints, Verification: "not-run", Timing: timing}, nil
}

func recorderValidateActions(actions recorderActions, actionsPath, recordingDir string, validatedRaw *[]recorderRawEvent) error {
	const operation = "Recorder.generateScript"
	if actions.FormatVersion != recorderActionsFormatVersion || !recorderIDPattern.MatchString(actions.RecordingID) || actions.RecordingID != filepath.Base(recordingDir) || actions.Revision < 1 {
		return recorderError(RecorderInvalidRecording, operation, "actions identity, revision, or version is invalid", nil)
	}
	if len(actions.Actions) > recorderMaxActions || actions.Readiness == "" || (actions.Readiness == "ready" && len(actions.Actions) == 0) {
		return recorderError(RecorderInvalidRecording, operation, "actions limits or readiness are invalid", nil)
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
	if actions.Readiness != "ready" || len(actions.Issues) != 0 {
		return recorderError(RecorderGenerationBlocked, operation, "actions readiness and issues do not permit basic generation", nil)
	}
	rawEvents, rawIssues, err := recorderParseRawEvents(rawBytes, false)
	if err != nil || len(rawIssues) != 0 {
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
	if err != nil || manifest.FormatVersion != recorderRecordingFormatVersion || !terminal || manifest.State != "stopped" || manifest.Storage.State != "saved" || manifest.RecordingID != actions.RecordingID {
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
	expectedActions, expectedDisposition, expectedIssues := recorderBuildActionList(rawEvents)
	expectedActions, contextIssues := recorderEnrichActionsWithWindowContext(expectedActions, manifest, rawEvents)
	expectedIssues = appendIssues(expectedIssues, contextIssues)
	if len(expectedIssues) != 0 || !reflect.DeepEqual(actions.Actions, expectedActions) || !reflect.DeepEqual(actions.EventDisposition, expectedDisposition) {
		return recorderError(RecorderInvalidRecording, operation, "actions do not match the deterministic grouping of their fixed raw bytes", nil)
	}
	eventDisposition := map[string]recorderEventDisposition{}
	for _, item := range actions.EventDisposition {
		if !recorderIDPattern.MatchString(item.EventID) || (item.Disposition != "consumed" && item.Disposition != "evidence" && item.Disposition != "excluded") || item.Reason == "" || len(item.Reason) > 1024 {
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
			if !recorderIDPattern.MatchString(eventID) || !exists || !rawExists || disposition.ActionID != action.ID || disposition.Disposition == "excluded" || seenSource[eventID] {
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
		switch action.Kind {
		case "click":
			if (action.Source.Basis != recorderClickedBasis && action.Source.Basis != recorderJitterClickBasis) || action.Position == nil || action.Position.X < math.MinInt16 || action.Position.X > math.MaxInt16 || action.Position.Y < math.MinInt16 || action.Position.Y > math.MaxInt16 || !action.Position.Verified || action.Position.Space != "screen-logical" || action.Position.DisplayRef == "" || len(action.Position.DisplayRef) > 512 || action.Args.Button != "left" || action.Args.ClickCount != 1 || action.Args.Text != "" || action.Args.EditSemantics != "" || action.Strategy != "mouse.click" || recorderValidateActionWindowTarget(action) != nil {
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
				if pressed != 1 || released != 1 || clicked != 0 || dragged == 0 || expected == nil || !reflect.DeepEqual(action, *expected) {
					return recorderError(RecorderInvalidRecording, operation, "bounded pointer-jitter click source is invalid", nil)
				}
			}
		case "text":
			if action.Source.Basis != "libuiohook KEY_TYPED basic-latin code units" || action.Position != nil || action.Args.Text == "" || action.Args.EditSemantics != "insert-at-current-focus" || action.Args.Button != "" || action.Args.ClickCount != 0 || action.Strategy != "keyboard.type" || recorderValidateActionWindowTarget(action) != nil {
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

func recorderGenerateBasicSource(actions recorderActions, rawEvents []recorderRawEvent, timing recorderGenerationTiming) ([]byte, []recorderCandidateMapping, []string, error) {
	platform, err := json.Marshal(actions.Environment.Platform)
	if err != nil {
		return nil, nil, nil, err
	}
	var builder strings.Builder
	line := 1
	write := func(value string) {
		builder.WriteString(value)
		line += strings.Count(value, "\n")
	}
	write("// Generated deterministically by Recorder.generateScript(mode: \"basic\").\n")
	write("// It resolves a fresh window for every action and has not been verified.\n")
	write("const __recorderPlatform = System.getPlatformInfo();\n")
	write(fmt.Sprintf("if (!__recorderPlatform || __recorderPlatform.os !== %s) throw new Error(\"Recorder candidate platform mismatch\");\n", platform))
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
	write("async function __recorderRequireActiveWindow(target) {\n")
	write("  const expected = await __recorderResolveWindow(target);\n")
	write("  const active = await window.getActiveWindow();\n")
	write("  const sameCurrentWindow = String(active.id || \"\") !== \"\" && String(expected.id || \"\") !== \"\" ? String(active.id) === String(expected.id) : Number(active.pid) === Number(expected.pid) && String(active.title || \"\") === String(expected.title || \"\");\n")
	write("  if (!sameCurrentWindow) throw new Error(\"Recorder candidate active text window mismatch\");\n")
	write("}\n")
	write("function __recorderRelativePoint(row, position) {\n")
	write("  if (position.offsetX < 0 || position.offsetY < 0 || position.offsetX >= row.width || position.offsetY >= row.height) throw new Error(\"Recorder candidate relative point is outside current window bounds\");\n")
	write("  return {x: row.x + position.offsetX, y: row.y + position.offsetY};\n")
	write("}\n")
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
		// The executable source only needs reusable resolution fields. Keep
		// recording-time PID/window IDs, handles, indices, bounds and timestamps
		// in actions/candidate provenance so they cannot accidentally become a
		// cross-execution replay condition.
		target, targetErr := json.Marshal(struct {
			Title       string `json:"title"`
			Application struct {
				IdentityKind  string `json:"identityKind"`
				IdentityValue string `json:"identityValue"`
			} `json:"application"`
		}{
			Title: action.Target.Window.Title,
			Application: struct {
				IdentityKind  string `json:"identityKind"`
				IdentityValue string `json:"identityValue"`
			}{
				IdentityKind:  action.Target.Window.Application.IdentityKind,
				IdentityValue: action.Target.Window.Application.IdentityValue,
			},
		})
		if targetErr != nil {
			return nil, nil, nil, targetErr
		}
		switch action.Kind {
		case "click":
			position, positionErr := json.Marshal(action.Position.Window)
			if positionErr != nil {
				return nil, nil, nil, positionErr
			}
			write(fmt.Sprintf("const __recorderWindow%d = await __recorderResolveWindow(%s);\n", index+1, target))
			write(fmt.Sprintf("const __recorderPoint%d = __recorderRelativePoint(__recorderWindow%d, %s);\n", index+1, index+1, position))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			write(fmt.Sprintf("await mouse.click(__recorderPoint%d.x, __recorderPoint%d.y, { button: \"left\", clickCount: 1 });\n", index+1, index+1))
		case "text":
			text, err := json.Marshal(action.Args.Text)
			if err != nil {
				return nil, nil, nil, err
			}
			write(fmt.Sprintf("await __recorderRequireActiveWindow(%s);\n", target))
			mappings = append(mappings, recorderCandidateMapping{ActionID: action.ID, Line: line})
			write(fmt.Sprintf("await keyboard.type(%s);\n", text))
		default:
			return nil, nil, nil, recorderError(RecorderGenerationBlocked, "Recorder.generateScript", "unsupported action kind", nil)
		}
	}
	constraints := []string{
		"verification is not-run until the generated file is executed separately and its outcome is independently checked",
		"the recorded OS must match before input",
		"each action uses window.get with recorded executable path/name and exact title; only a missing match permits unique executable-only fallback",
		"recorded process IDs and native window handles are provenance only and are not reused as cross-execution identity",
		"the operator must restore the intended starting desktop and application state before execution",
		"clicks use recorded top-left window offsets against fresh bounds, so window translation is supported; normalized ratios are retained for review but resizing is not guessed",
		fmt.Sprintf("each non-pause inter-action raw gap is divided by speedMultiplier %.6g and clamped to %d..%d milliseconds", timing.SpeedMultiplier, timing.MinimumDelayMS, timing.MaximumDelayMS),
		"time between explicit Recorder pause and resume boundaries is not replayed",
		"the candidate does not infer business intent, target identity, retries, OCR, or postconditions",
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
