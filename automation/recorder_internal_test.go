package automation

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type recorderMemoryBackend struct {
	mu         sync.Mutex
	sink       func(RecorderInputEvent)
	startErr   error
	stopErr    error
	startCalls int
	stopCalls  int
	waitCalls  int
	emitLate   bool
	active     atomic.Bool
}

func (b *recorderMemoryBackend) Capabilities() RecorderBackendCapabilities {
	return RecorderBackendCapabilities{Supported: true, Platform: "darwin", Backend: "memory", Permission: "not-required", CoordinateSpace: "screen-logical"}
}
func (b *recorderMemoryBackend) Start(_ context.Context, sink func(RecorderInputEvent), _ func(error)) error {
	b.mu.Lock()
	b.startCalls++
	b.sink = sink
	b.mu.Unlock()
	if b.startErr != nil {
		return b.startErr
	}
	b.active.Store(true)
	sink(RecorderInputEvent{Type: recorderEventHookEnabled})
	return nil
}
func (b *recorderMemoryBackend) Stop(context.Context) error {
	b.mu.Lock()
	b.stopCalls++
	sink := b.sink
	b.mu.Unlock()
	if b.emitLate && sink != nil {
		sink(RecorderInputEvent{Type: recorderEventMouseClicked, Button: 1, Clicks: 1, X: 10, Y: 10})
	}
	b.active.Store(false)
	return b.stopErr
}
func (b *recorderMemoryBackend) Wait() { b.mu.Lock(); b.waitCalls++; b.mu.Unlock() }
func (b *recorderMemoryBackend) ResourceCount() int {
	if b.active.Load() {
		return 1
	}
	return 0
}
func (b *recorderMemoryBackend) Emit(event RecorderInputEvent) {
	b.mu.Lock()
	sink := b.sink
	b.mu.Unlock()
	if sink != nil {
		sink(event)
	}
}

func TestRecorderSessionReadyStopDrainIdempotenceAndReuse(t *testing.T) {
	workDir := t.TempDir()
	backend := &recorderMemoryBackend{emitLate: true}
	owner := recorderTestOwner(workDir, backend)
	options := recorderTestStartOptions()
	options.Evidence = "target-semantics"
	options.ControlKeycodes[0x43] = true
	session, err := owner.startSession(options)
	if err != nil {
		t.Fatal(err)
	}
	owner.mu.Lock()
	owner.session = session
	owner.mu.Unlock()
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseMoved, NativeTime: 995, X: 5, Y: 5})
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 10, Y: 20})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseMoved, NativeTime: 1005, X: 11, Y: 20})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 10, Y: 20})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseClicked, NativeTime: 1010, Button: 1, Clicks: 1, X: 10, Y: 20})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseMoved, NativeTime: 1015, X: 12, Y: 20})
	paused, err := session.pause()
	if err != nil || !paused.Changed || paused.CaptureState != "paused" {
		t.Fatalf("pause=%#v error=%v", paused, err)
	}
	duplicatePause, err := session.pause()
	if err != nil || duplicatePause.Changed || duplicatePause.TransitionSequence != paused.TransitionSequence {
		t.Fatalf("duplicate pause=%#v error=%v", duplicatePause, err)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventKeyTyped, NativeTime: 1020, Keychar: 'x'})
	resumed, err := session.resume()
	if err != nil || !resumed.Changed || resumed.CaptureState != "recording" {
		t.Fatalf("resume=%#v error=%v", resumed, err)
	}
	duplicateResume, done, err := session.resumeNoop()
	if err != nil || !done || duplicateResume.Changed || duplicateResume.TransitionSequence != resumed.TransitionSequence {
		t.Fatalf("duplicate resume=%#v done=%t error=%v", duplicateResume, done, err)
	}
	session.finishAsync(nil)
	session.finishAsync(errors.New("second stop must not replace the first"))
	select {
	case <-session.done:
	case <-time.After(3 * time.Second):
		t.Fatal("session stop did not finish")
	}
	if session.stopErr != nil {
		t.Fatalf("stop error=%v", session.stopErr)
	}
	if backend.stopCalls != 1 || backend.waitCalls != 1 {
		t.Fatalf("backend stop/wait=%d/%d", backend.stopCalls, backend.waitCalls)
	}
	counts := session.countSnapshot()
	if counts["accepted"] != 6 || counts["persisted"] != 6 || counts["filtered"] != 3 || counts["paused"] != 1 || counts["late"] != 1 || counts["dropped"] != 0 {
		t.Fatalf("counts=%v", counts)
	}
	raw, err := os.ReadFile(session.writer.rawPath)
	if err != nil {
		t.Fatal(err)
	}
	if lines := strings.Count(string(raw), "\n"); lines != 6 || strings.Count(string(raw), `"libraryEvent":"MOUSE_MOVED"`) != 1 || strings.Contains(string(raw), `"keychar":120`) || !strings.Contains(string(raw), `"libraryEvent":"RECORDER_PAUSED"`) || !strings.Contains(string(raw), `"libraryEvent":"RECORDER_RESUMED"`) {
		t.Fatalf("raw line count=%d\n%s", lines, raw)
	}
	var manifest recorderManifest
	manifestBytes, err := os.ReadFile(session.writer.manifestPath)
	if err != nil || recorderDecodeStrict(manifestBytes, &manifest) != nil {
		t.Fatalf("manifest read/decode: %v", err)
	}
	if manifest.State != "stopped" || manifest.Storage.State != "saved" || manifest.Counts.Persisted != 6 || manifest.Counts.Filtered != 3 || manifest.Counts.Paused != 1 || manifest.Counts.Late != 1 || len(manifest.InputContexts) != 1 || manifest.InputContexts[0].Status != "verified" {
		t.Fatalf("terminal manifest=%#v", manifest)
	}
	if !strings.Contains(string(manifestBytes), `"issues": []`) {
		t.Fatalf("terminal manifest must use a stable empty issues array: %s", manifestBytes)
	}
	if len(manifest.Capture.ControlKeycodes) != 1 || manifest.Capture.ControlKeycodes[0] != 0x43 {
		t.Fatalf("control key provenance=%#v", manifest.Capture.ControlKeycodes)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 1 {
		t.Fatalf("window-relative actions=%#v error=%v", built, err)
	}
	var actions recorderActions
	actionsBytes, readErr := os.ReadFile(built.ActionsFile)
	if readErr != nil || recorderDecodeStrict(actionsBytes, &actions) != nil || actions.Actions[0].Target == nil || actions.Actions[0].Target.SemanticStatus != "verified" || actions.Actions[0].Target.Element == nil || actions.Actions[0].Target.Element.Name != "Save" || actions.Actions[0].Position.Window == nil || actions.Actions[0].Position.Window.OffsetX != 10 || actions.Actions[0].Position.Window.OffsetY != 20 {
		t.Fatalf("window-relative action decode=%v action=%#v", readErr, actions.Actions)
	}
	workers, pending, sessions, leases, writers := owner.ResourceCounts()
	if workers != 0 || pending != 0 || sessions != 0 || leases != 0 || writers != 0 {
		t.Fatalf("resources=%d/%d/%d/%d/%d", workers, pending, sessions, leases, writers)
	}

	// A clean stop releases the owner for a later session in the same process.
	nextBackend := &recorderMemoryBackend{}
	owner.backendFactory = func() RecorderInputBackend { return nextBackend }
	next, err := owner.startSession(options)
	if err != nil {
		t.Fatalf("next start: %v", err)
	}
	next.finishAsync(nil)
	<-next.done
	if nextBackend.startCalls != 1 || nextBackend.stopCalls != 1 {
		t.Fatalf("next backend calls=%d/%d", nextBackend.startCalls, nextBackend.stopCalls)
	}
}

func TestRecorderInitialWindowChangeDoesNotStopOrBlockDesktopCapture(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	owner.windowProbe = func() (*WindowInfo, error) {
		return recorderTestWindow(99, "Another Application", "Other.app"), nil
	}
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatalf("initial window change blocked start: %v", err)
	}
	if session.status()["captureState"] != "recording" || !recorderHasIssue(session.issues, "initial-window-changed") {
		t.Fatalf("status=%#v issues=%#v", session.status(), session.issues)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseClicked, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	if session.status()["captureState"] != "recording" {
		t.Fatalf("desktop input unexpectedly stopped capture: %#v", session.status())
	}
	session.finishAsync(nil)
	<-session.done
	if session.stopErr != nil || session.result.CaptureState != "stopped" || session.result.StorageState != "saved" {
		t.Fatalf("stop error=%v result=%#v", session.stopErr, session.result)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 1 {
		t.Fatalf("desktop recording did not remain buildable: result=%#v error=%v", built, err)
	}
}

func TestRecorderUnavailableInitialWindowDoesNotBlockActionReplay(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	probeCalls := 0
	owner.windowProbe = func() (*WindowInfo, error) {
		probeCalls++
		if probeCalls == 1 {
			return nil, errors.New("initial foreground query unavailable")
		}
		return recorderTestWindow(77, "Current Action Window", "Action.app"), nil
	}
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatalf("unavailable initial window blocked start: %v", err)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseClicked, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	session.finishAsync(nil)
	<-session.done
	if session.result.CaptureState != "stopped" || session.result.StorageState != "saved" || !recorderHasIssue(session.issues, "initial-window-unverified") {
		t.Fatalf("result=%#v issues=%#v", session.result, session.issues)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 1 {
		t.Fatalf("action context did not replace unavailable initial context: result=%#v error=%v", built, err)
	}
	generated, err := owner.generateBasicScript(built.ActionsFile, "", recorderDefaultGenerationTiming())
	if err != nil || generated.ScriptFile == "" {
		t.Fatalf("unavailable initial context blocked generation: result=%#v error=%v", generated, err)
	}
}

func TestRecorderSessionQueueOverflowAndCancellationFailClosed(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	session := &recorderSession{context: ctx, cancel: cancel, events: make(chan recorderRawEvent, 1), done: make(chan struct{}), heldMouseButtons: map[string]bool{}}
	session.accepting.Store(true)
	session.captureState.Store("recording")
	session.storageState.Store("open")
	// Prevent the intentionally incomplete unit seam from starting finalization;
	// this test isolates the callback/overflow path.
	session.stopOnce.Do(func() {})
	session.receiveNativeEvent(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 100, Button: 1, X: 1, Y: 1})
	session.receiveNativeEvent(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 200, Button: 1, X: 1, Y: 1})
	if session.counts.Accepted.Load() != 1 || session.counts.Dropped.Load() != 1 {
		t.Fatalf("queue counts=%v", session.countSnapshot())
	}
	if session.overflowSeq.Load() != 2 || len(session.issues) != 0 {
		t.Fatalf("overflow sequence=%d callback issues=%#v", session.overflowSeq.Load(), session.issues)
	}

	workDir := t.TempDir()
	ownerContext, ownerCancel := context.WithCancel(context.Background())
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(workDir, backend)
	owner.context = ownerContext
	active, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	owner.mu.Lock()
	owner.session = active
	owner.mu.Unlock()
	ownerCancel()
	select {
	case <-active.done:
	case <-time.After(3 * time.Second):
		t.Fatal("execution cancellation did not stop Recorder")
	}
	if active.result.CaptureState != "failed" || backend.stopCalls != 1 || backend.active.Load() {
		t.Fatalf("cancel result=%#v backend=%#v", active.result, backend)
	}
}

func TestRecorderUnpublishedStartResultIsFinalized(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	owner.startWorker(func() (any, error) { return session, nil }, func(any, error) {
		t.Error("an unavailable EventLoop must not publish the session")
	})
	owner.wg.Wait()
	select {
	case <-session.done:
	case <-time.After(3 * time.Second):
		t.Fatal("unpublished session was not finalized")
	}
	if backend.active.Load() || backend.stopCalls != 1 || session.result.CaptureState != "failed" {
		t.Fatalf("backend active=%t stopCalls=%d result=%#v", backend.active.Load(), backend.stopCalls, session.result)
	}
}

func TestRecorderWriterFaultInjectionAndTerminalManifestFailure(t *testing.T) {
	tests := []struct {
		name      string
		configure func(*recorderFaultFile)
	}{
		{name: "write-or-flush", configure: func(file *recorderFaultFile) { file.writeErr = errors.New("write failed") }},
		{name: "sync", configure: func(file *recorderFaultFile) { file.syncErr = errors.New("sync failed") }},
		{name: "close", configure: func(file *recorderFaultFile) { file.closeErr = errors.New("close failed") }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "events.ndjson")
			base, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				t.Fatal(err)
			}
			fault := &recorderFaultFile{file: base}
			test.configure(fault)
			writer := &recorderWriter{rawPath: path, file: fault, buffer: bufio.NewWriterSize(fault, 64*1024)}
			events := make(chan recorderRawEvent, 1)
			events <- recorderTestRawEvent(1, "MOUSE_MOVED")
			close(events)
			var persisted atomic.Uint64
			result := writer.consume(events, &persisted)
			if result.Err == nil || result.State == "saved" {
				t.Fatalf("result=%#v", result)
			}
			if test.name == "write-or-flush" && persisted.Load() != 0 {
				t.Fatalf("persisted=%d", persisted.Load())
			}
		})
	}

	writer := &recorderWriter{manifestPath: filepath.Join(t.TempDir(), "manifest.json"), writeManifest: func(string, any) error { return errors.New("manifest failed") }}
	if err := writer.finishManifest(recorderManifestFinal{}); err == nil {
		t.Fatal("expected terminal manifest failure")
	}
}

func TestRecorderStopReturnsTerminalManifestFailureIssue(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	session.writer.writeManifest = func(string, any) error { return errors.New("terminal manifest failed") }
	session.finishAsync(nil)
	<-session.done
	if session.stopErr == nil || session.result.StorageState != "failed" || !recorderHasIssue(session.result.Issues, "manifest-finalize-failed") {
		t.Fatalf("stopErr=%v result=%#v", session.stopErr, session.result)
	}
}

func TestRecorderRawPrefixRecoveryRequiresPartialPackage(t *testing.T) {
	event := recorderTestRawEvent(1, "KEY_TYPED")
	keychar := uint16('a')
	event.Keychar = &keychar
	payload, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	payload = append(append(payload, '\n'), []byte(`{"formatVersion":`)...)
	if _, _, err := recorderParseRawEvents(payload, false); err == nil {
		t.Fatal("terminal package accepted a damaged raw tail")
	}
	events, issues, err := recorderParseRawEvents(payload, true)
	if err != nil || len(events) != 1 || !recorderHasIssue(issues, "raw-tail-damaged") {
		t.Fatalf("events=%#v issues=%#v err=%v", events, issues, err)
	}
}

type recorderFaultFile struct {
	file     *os.File
	writeErr error
	syncErr  error
	closeErr error
}

func (f *recorderFaultFile) Write(payload []byte) (int, error) {
	if f.writeErr != nil {
		return 0, f.writeErr
	}
	return f.file.Write(payload)
}
func (f *recorderFaultFile) Sync() error {
	if f.syncErr != nil {
		return f.syncErr
	}
	return f.file.Sync()
}
func (f *recorderFaultFile) Close() error { err := f.file.Close(); return errors.Join(err, f.closeErr) }

func TestRecorderActionGroupingPreservesUnsupportedBoundaries(t *testing.T) {
	press := recorderTestMouseEvent(1, "MOUSE_PRESSED", 1000, 0)
	release := recorderTestMouseEvent(2, "MOUSE_RELEASED", 1010, 0)
	clicked := recorderTestMouseEvent(3, "MOUSE_CLICKED", 1010, 0)
	actions, dispositions, issues := recorderBuildActionList([]recorderRawEvent{press, release, clicked})
	if len(actions) != 1 || actions[0].Kind != "click" || len(issues) != 0 {
		t.Fatalf("basic click=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}

	dragged := recorderTestMouseEventAt(2, "MOUSE_DRAGGED", 1005, 1<<8, 40, 50)
	dragged.Button = "none"
	dragRelease := recorderTestMouseEventAt(3, "MOUSE_RELEASED", 1010, 0, 40, 50)
	for _, test := range []struct {
		name   string
		events []recorderRawEvent
		issue  string
	}{
		{name: "drag", events: []recorderRawEvent{press, dragged, dragRelease}, issue: "drag-unsupported"},
		{name: "double-click", events: []recorderRawEvent{press, release, recorderTestMouseEventWithClicks(3, "MOUSE_CLICKED", 1010, 0, 2)}, issue: "click-count-unsupported"},
		{name: "control-click", events: []recorderRawEvent{press, release, recorderTestMouseEvent(3, "MOUSE_CLICKED", 1010, 1<<1)}, issue: "modified-click-unsupported"},
		{name: "long-press", events: []recorderRawEvent{press, recorderTestMouseEvent(2, "MOUSE_RELEASED", 4001, 0), recorderTestMouseEvent(3, "MOUSE_CLICKED", 4001, 0)}, issue: "long-press-unsupported"},
		{name: "missing-release", events: []recorderRawEvent{press}, issue: "missing-release-at-stop"},
		{name: "move-out-and-back", events: []recorderRawEvent{press, recorderTestMouseEventAt(2, "MOUSE_MOVED", 1005, 1<<8, 80, 90), release, clicked}, issue: "drag-not-click"},
		{name: "unmarked-move-out-and-back", events: []recorderRawEvent{press, recorderTestMouseEventAt(2, "MOUSE_MOVED", 1005, 0, 80, 90), recorderTestMouseEventAt(3, "MOUSE_MOVED", 1006, 0, 10, 20), recorderTestMouseEvent(4, "MOUSE_RELEASED", 1010, 0), recorderTestMouseEvent(5, "MOUSE_CLICKED", 1010, 0)}, issue: "motion-path-not-click"},
		{name: "release-without-clicked", events: []recorderRawEvent{press, release}, issue: "unresolved-event"},
	} {
		t.Run(test.name, func(t *testing.T) {
			actions, _, issues := recorderBuildActionList(test.events)
			if len(actions) != 0 || !recorderHasIssue(issues, test.issue) {
				t.Fatalf("actions=%#v issues=%#v", actions, issues)
			}
		})
	}

	jitter := recorderTestMouseEvent(2, "MOUSE_MOVED", 1005, 0)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{press, jitter, release, clicked})
	if len(actions) != 1 || len(issues) != 0 {
		t.Fatalf("micro-jitter should preserve one click: actions=%#v issues=%#v", actions, issues)
	}

	productionJitter := recorderTestMouseEventAt(2, "MOUSE_DRAGGED", 1005, 1<<8, 11, 20)
	productionJitter.Button = "none"
	productionRelease := recorderTestMouseEventAt(3, "MOUSE_RELEASED", 1010, 0, 11, 20)
	actions, dispositions, issues = recorderBuildActionList([]recorderRawEvent{press, productionJitter, productionRelease})
	if len(actions) != 1 || len(issues) != 0 || actions[0].Source.Basis != recorderJitterClickBasis || actions[0].Position.X != 11 {
		t.Fatalf("production micro-drag should normalize to one click: actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}
}

func TestRecorderSessionControlClickBoundaryCapturesProductionTail(t *testing.T) {
	backend := &recorderMemoryBackend{}
	session, err := recorderTestOwner(t.TempDir(), backend).startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 300, Y: 400})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseDragged, NativeTime: 1005, Button: 0, Clicks: 0, Mask: 1 << 8, X: 301, Y: 400})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 301, Y: 400})
	result, err := session.excludeControlClick("recorder-window", "stop", time.Now().UTC())
	if err != nil || !result.Changed || len(result.EventIDs) != 3 {
		t.Fatalf("control-click result=%#v error=%v", result, err)
	}
	session.finishAsync(nil)
	<-session.done
	rawBytes, err := os.ReadFile(session.writer.rawPath)
	if err != nil {
		t.Fatal(err)
	}
	events, issues, err := recorderParseRawEvents(rawBytes, false)
	if err != nil || len(issues) != 0 || len(events) != 4 || events[3].LibraryEvent != "RECORDER_CONTROL_CLICK" {
		t.Fatalf("raw events=%#v issues=%#v error=%v", events, issues, err)
	}
	references, err := recorderControlClickReferences(events[3])
	if err != nil || !reflect.DeepEqual(references, result.EventIDs) {
		t.Fatalf("control references=%#v result=%#v error=%v", references, result.EventIDs, err)
	}
}

func TestRecorderTextGroupingDoesNotReplayPhysicalKeysAndBlocksComposition(t *testing.T) {
	keycode, rawcode, undefined, char := uint16(30), uint16(65), uint16(0xffff), uint16('a')
	pressed := recorderTestRawEvent(1, "KEY_PRESSED")
	pressed.Keycode, pressed.Rawcode, pressed.Keychar = &keycode, &rawcode, &undefined
	typed := recorderTestRawEvent(2, "KEY_TYPED")
	typed.Keycode, typed.Rawcode, typed.Keychar = new(uint16), &rawcode, &char
	released := recorderTestRawEvent(3, "KEY_RELEASED")
	released.Keycode, released.Rawcode, released.Keychar = &keycode, &rawcode, &undefined
	actions, dispositions, issues := recorderBuildActionList([]recorderRawEvent{pressed, typed, released})
	if len(actions) != 1 || actions[0].Kind != "text" || actions[0].Args.Text != "a" || len(issues) != 0 {
		t.Fatalf("actions=%#v issues=%#v", actions, issues)
	}
	if len(actions[0].Source.EventIDs) != 3 || actions[0].Timing.SequenceStart != "1" || actions[0].Timing.SequenceEnd != "3" {
		t.Fatalf("text evidence association=%#v", actions[0])
	}
	if dispositions[0].Disposition != "evidence" || dispositions[1].Disposition != "consumed" || dispositions[2].Disposition != "evidence" {
		t.Fatalf("dispositions=%#v", dispositions)
	}
	if dispositions[0].ActionID != actions[0].ID || dispositions[2].ActionID != actions[0].ID {
		t.Fatalf("physical key evidence is not linked: %#v", dispositions)
	}

	composition := typed
	composition.EventID = "e000000000004"
	composition.Sequence = "4"
	composition.Keychar = &undefined
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{composition})
	if len(actions) != 0 || !recorderHasIssue(issues, "composition-unsupported") {
		t.Fatalf("composition actions=%#v issues=%#v", actions, issues)
	}
}

func recorderTestOwner(workDir string, backend RecorderInputBackend) *RecorderRuntime {
	return &RecorderRuntime{
		context: context.Background(), workDir: workDir, executionID: "test-execution",
		backendFactory: func() RecorderInputBackend { return backend },
		windowProbe:    func() (*WindowInfo, error) { return recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), nil },
		targetProbe: func(_ context.Context, _ *WindowInfo, x, y int) (*recorderElementSnapshot, error) {
			descriptor := recorderElementDescriptor{Role: "button", NativeRole: "AXButton", Name: "Save", Identifier: "save-button", NativeActions: []string{"AXPress"}, Bounds: recorderWindowBounds{X: x - 5, Y: y - 5, Width: 20, Height: 20}}
			return &recorderElementSnapshot{
				Source: "accessibility", Resolution: "point-hit", Role: "button", NativeRole: "AXButton", Name: "Save", Identifier: "save-button",
				NativeActions: []string{"AXPress"}, Bounds: recorderWindowBounds{X: x - 5, Y: y - 5, Width: 20, Height: 20},
				Hit: descriptor, Ancestors: []recorderElementDescriptor{}, Point: recorderElementPoint{OffsetX: 5, OffsetY: 5, XRatio: 0.25, YRatio: 0.25}, ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
			}, nil
		},
		displayResolver: func() []DisplayInfo {
			return []DisplayInfo{{Index: 1, ID: "display-1", X: 0, Y: 0, Width: 800, Height: 600, PixelWidth: 800, PixelHeight: 600, Scale: 1}}
		},
	}
}

func recorderTestWindow(processID uint32, title, executableName string) *WindowInfo {
	return &WindowInfo{
		ID: "window-" + strconv.FormatUint(uint64(processID), 10), Title: title, ProcessID: processID,
		X: 0, Y: 0, Width: 800, Height: 600, ExeName: executableName, Handle: uint64(processID),
		IsForeground: true, HasFocus: true,
	}
}

func recorderTestStartOptions() recorderStartOptions {
	return recorderStartOptions{Within: recorderWithin{ProcessID: 42, Title: "Recorder Fixture"}, Evidence: "none", MaxDuration: time.Minute, ControlKeycodes: map[uint16]bool{}}
}

func recorderTestRawEvent(sequence int, kind string) recorderRawEvent {
	return recorderRawEvent{FormatVersion: recorderRawEventFormatVersion, EventID: "e" + leftPadRecorder(sequence), Sequence: itoaRecorder(sequence), LibraryEvent: kind, NativeTime: itoaRecorder(1000 + sequence*10), NativeClock: "fixture", NativeUnit: "milliseconds", ReceivedAt: time.Now().UTC().Format(time.RFC3339Nano), Modifiers: []string{}, Source: "unknown", ScopeRef: "within:fixture"}
}

func recorderTestMouseEvent(sequence int, kind string, native uint64, mask uint16) recorderRawEvent {
	event := recorderTestRawEvent(sequence, kind)
	event.NativeTime = strconvFormatUint(native)
	event.ModifierMask = mask
	x, y := 10, 20
	event.X, event.Y = &x, &y
	event.Button, event.Clicks = "left", 1
	event.CoordinateSpace, event.CoordinateVerified, event.DisplayRef = "screen-logical", true, "display-1"
	return event
}
func recorderTestMouseEventWithClicks(sequence int, kind string, native uint64, mask uint16, clicks uint16) recorderRawEvent {
	event := recorderTestMouseEvent(sequence, kind, native, mask)
	event.Clicks = clicks
	return event
}
func recorderTestMouseEventAt(sequence int, kind string, native uint64, mask uint16, x, y int) recorderRawEvent {
	event := recorderTestMouseEvent(sequence, kind, native, mask)
	event.X, event.Y = &x, &y
	return event
}
func recorderHasIssue(issues []recorderIssue, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}
func leftPadRecorder(value int) string {
	text := itoaRecorder(value)
	return strings.Repeat("0", 12-len(text)) + text
}
func itoaRecorder(value int) string         { return strconv.Itoa(value) }
func strconvFormatUint(value uint64) string { return strconv.FormatUint(value, 10) }
