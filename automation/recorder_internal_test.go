package automation

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"math"
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
	mu                sync.Mutex
	sink              func(RecorderInputEvent)
	startErr          error
	stopErr           error
	startCalls        int
	stopCalls         int
	waitCalls         int
	emitLate          bool
	active            atomic.Bool
	keyStateAvailable bool
	pressedRawcodes   map[uint16]bool
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
func (b *recorderMemoryBackend) keyPressedAtStop(rawcode uint16) (bool, bool) {
	if !b.keyStateAvailable {
		return false, false
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.pressedRawcodes[rawcode], true
}
func (b *recorderMemoryBackend) Emit(event RecorderInputEvent) {
	b.mu.Lock()
	sink := b.sink
	b.mu.Unlock()
	if sink != nil {
		sink(event)
	}
}

func TestRecorderReleaseOwnedCoversEveryAcquiredReferenceExactlyOnce(t *testing.T) {
	cases := []struct {
		name     string
		acquired []string
	}{
		{name: "normal-return", acquired: []string{"hit", "window"}},
		{name: "multi-level-parent-chain", acquired: []string{"hit", "parent-1", "parent-2", "window"}},
		{name: "mid-chain-property-error", acquired: []string{"hit", "parent-1"}},
		{name: "pid-or-window-mismatch", acquired: []string{"hit", "foreign-parent"}},
		{name: "secure-field-rejection", acquired: []string{"hit"}},
		{name: "context-cancel", acquired: []string{"hit", "parent-1"}},
		{name: "traversal-limit", acquired: []string{"hit", "parent-1", "parent-2", "parent-3"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			counts := map[string]int{}
			recorderReleaseOwned(test.acquired, func(resource string) { counts[resource]++ })
			if len(counts) != len(test.acquired) {
				t.Fatalf("released identities=%v acquired=%v", counts, test.acquired)
			}
			for _, resource := range test.acquired {
				if counts[resource] != 1 {
					t.Fatalf("resource %q release count=%d", resource, counts[resource])
				}
			}
		})
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
	backend.Emit(RecorderInputEvent{Type: recorderEventKeyTyped, NativeTime: 1020, Keychar: 'x', TextInputSource: 1})
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
	if manifest.State != "stopped" || manifest.Storage.State != "saved" || manifest.Counts.Persisted != 6 || manifest.Counts.Filtered != 3 || manifest.Counts.Paused != 1 || manifest.Counts.Late != 1 || len(manifest.InputContexts) != 2 || manifest.InputContexts[0].Status != "verified" || manifest.InputContexts[0].Phase != "pressed" || manifest.InputContexts[1].Status != "verified" || manifest.InputContexts[1].Phase != "released" {
		t.Fatalf("terminal manifest=%#v", manifest)
	}
	for _, inputContext := range manifest.InputContexts {
		if inputContext.Element == nil || inputContext.Element.Enabled == nil || !*inputContext.Element.Enabled || inputContext.Element.Focused == nil || *inputContext.Element.Focused || inputContext.Element.ValueSettable {
			t.Fatalf("pointer endpoint traits=%#v", inputContext)
		}
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

func TestRecorderSessionPersistsAuditableUnmatchedKeyStateAtStop(t *testing.T) {
	for _, test := range []struct {
		name      string
		pressed   bool
		state     string
		issueCode string
	}{
		{name: "release-not-observed", pressed: false, state: "released", issueCode: "key-release-not-observed-at-stop"},
		{name: "still-physically-held", pressed: true, state: "pressed", issueCode: "key-still-pressed-at-stop"},
	} {
		t.Run(test.name, func(t *testing.T) {
			backend := &recorderMemoryBackend{
				keyStateAvailable: true,
				pressedRawcodes:   map[uint16]bool{0: test.pressed},
			}
			owner := recorderTestOwner(t.TempDir(), backend)
			options := recorderTestStartOptions()
			options.CaptureKeyboard = true
			options.KeyboardContent = "non-sensitive-test"
			session, err := owner.startSession(options)
			if err != nil {
				t.Fatal(err)
			}
			backend.Emit(RecorderInputEvent{Type: recorderEventKeyPressed, NativeTime: 1000, Keycode: 0x001e, Rawcode: 0})
			session.finishAsync(nil)
			<-session.done
			if session.stopErr != nil {
				t.Fatalf("stop error=%v", session.stopErr)
			}
			manifestBytes, err := os.ReadFile(session.writer.manifestPath)
			if err != nil {
				t.Fatal(err)
			}
			var manifest recorderManifest
			if err := recorderDecodeStrict(manifestBytes, &manifest); err != nil {
				t.Fatal(err)
			}
			if len(manifest.KeyStatesAtStop) != 1 || manifest.KeyStatesAtStop[0].State != test.state || manifest.KeyStatesAtStop[0].PressEventID != "e000000000002" || !recorderHasIssue(manifest.Issues, test.issueCode) {
				t.Fatalf("stop key-state evidence=%#v issues=%#v", manifest.KeyStatesAtStop, manifest.Issues)
			}
			rawBytes, err := os.ReadFile(session.writer.rawPath)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(rawBytes), `"libraryEvent":"KEY_RELEASED"`) {
				t.Fatalf("Recorder synthesized a key release: %s", rawBytes)
			}
			built, err := owner.buildActionsFile(session.writer.recordingDir)
			if err != nil || built.Readiness != "needs-review" || built.ActionCount != 0 || !recorderHasIssue(built.Issues, test.issueCode) || !recorderHasIssue(built.Issues, "missing-key-release-at-stop") {
				t.Fatalf("unmatched key must be omitted without blocking a partial candidate: result=%#v error=%v", built, err)
			}
			for _, issue := range built.Issues {
				if issue.Severity == "error" {
					t.Fatalf("action-local key issue remained package-blocking: %#v", built.Issues)
				}
			}
		})
	}
}

func TestRecorderPartialFinalizationSeparatesActionLocalAndPackageIntegrityIssues(t *testing.T) {
	for _, code := range []string{
		"action-target-invalid",
		"text-edit-too-large",
		"window-context-overflow",
		"text-tracker-overflow",
		"maximum-duration",
	} {
		if !recorderIssueAllowsPartial(code) {
			t.Fatalf("known action-local issue %q must permit a partial candidate", code)
		}
	}
	for _, code := range []string{
		"recording-loss",
		"terminal-manifest-missing",
		"control-click-boundary-invalid",
		"future-unknown-integrity-error",
	} {
		if recorderIssueAllowsPartial(code) {
			t.Fatalf("package-integrity or unknown issue %q must remain hard", code)
		}
	}
	controlledStop := recorderManifest{
		State:  "failed",
		Issues: []recorderIssue{{Code: "maximum-duration", Severity: "error", Message: "configured limit reached"}},
	}
	controlledStop.Storage.State = "saved"
	if !recorderManifestFailureAllowsPartial(controlledStop) {
		t.Fatal("a reliably saved maximum-duration terminal package must permit partial generation")
	}
	controlledStop.Issues = append(controlledStop.Issues, recorderIssue{Code: "backend-interrupted", Severity: "error", Message: "backend failed"})
	if recorderManifestFailureAllowsPartial(controlledStop) {
		t.Fatal("a maximum-duration issue must not mask a hard terminal failure")
	}

	window, err := recorderSnapshotWindow(recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	action := func(id, eventID, sequence string) recorderAction {
		return recorderAction{
			ID: id, Kind: "key",
			Source: recorderActionSource{EventIDs: []string{eventID}, Basis: recorderSpecialKeyBasis},
			Timing: recorderActionTiming{SequenceStart: sequence, SequenceEnd: sequence, NativeStart: sequence, NativeEnd: sequence, NativeUnit: "milliseconds"},
			Target: &recorderActionTarget{
				Kind: "window", Resolution: "application-identity+window-title", Window: window,
				SemanticStatus: "not-applicable",
			},
			Args: recorderActionArguments{Key: "Enter"}, Strategy: "keyboard.press",
			Review: recorderActionReview{Required: false, Status: "not-required"},
		}
	}
	actions := []recorderAction{
		action("a0001", "e000000000001", "1"),
		action("a0002", "e000000000002", "2"),
		action("a0003", "e000000000003", "3"),
	}
	dispositions := []recorderEventDisposition{
		{EventID: "e000000000001", Disposition: "consumed", ActionID: "a0001", Reason: "fixture action"},
		{EventID: "e000000000002", Disposition: "consumed", ActionID: "a0002", Reason: "fixture action"},
		{EventID: "e000000000003", Disposition: "consumed", ActionID: "a0003", Reason: "fixture action"},
	}
	issues := []recorderIssue{{
		Code: "window-context-overflow", Severity: "error",
		Message: "the action context could not be retained", EventID: "e000000000002",
	}}

	partialActions, partialDispositions, partialIssues := recorderFinalizePartialActions(actions, dispositions, issues)
	if readiness := recorderReadiness(partialIssues); readiness != "needs-review" {
		t.Fatalf("action-local issue readiness=%q issues=%#v", readiness, partialIssues)
	}
	if len(partialActions) != 2 || partialActions[0].ID != "a0001" || partialActions[1].ID != "a0002" || partialActions[1].Source.EventIDs[0] != "e000000000003" {
		t.Fatalf("safe actions were not retained and densely renumbered: %#v", partialActions)
	}
	if partialDispositions[0].ActionID != "a0001" || partialDispositions[1].Disposition != "omitted" || partialDispositions[1].ActionID != "" || partialDispositions[2].ActionID != "a0002" {
		t.Fatalf("action quarantine did not repair disposition linkage: %#v", partialDispositions)
	}
	if len(partialIssues) != 1 || partialIssues[0].Severity != "warning" {
		t.Fatalf("action-local issue was not retained as a warning: %#v", partialIssues)
	}

	_, _, hardIssues := recorderFinalizePartialActions(actions, dispositions, []recorderIssue{{
		Code: "recording-loss", Severity: "error", Message: "one or more events were lost",
	}})
	if readiness := recorderReadiness(hardIssues); readiness != "blocked" {
		t.Fatalf("package-integrity error readiness=%q issues=%#v", readiness, hardIssues)
	}
	_, _, unknownIssues := recorderFinalizePartialActions(actions, dispositions, []recorderIssue{{
		Code: "future-unknown-integrity-error", Severity: "error", Message: "unknown failure",
	}})
	if readiness := recorderReadiness(unknownIssues); readiness != "blocked" {
		t.Fatalf("unknown error must default hard: readiness=%q issues=%#v", readiness, unknownIssues)
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

func TestRecorderDesktopChromeClickUsesVerifiedDisplayTarget(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	owner.windowProbe = func() (*WindowInfo, error) {
		active := recorderTestWindow(42, "Recorder Fixture", "Recorder.app")
		active.Height = 300
		return active, nil
	}
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 100, Y: 550})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 100, Y: 550})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseClicked, NativeTime: 1010, Button: 1, Clicks: 1, X: 100, Y: 550})
	session.finishAsync(nil)
	<-session.done
	if session.stopErr != nil {
		t.Fatalf("stop error=%v", session.stopErr)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 1 || len(built.Issues) != 0 {
		t.Fatalf("desktop-level click actions=%#v error=%v", built, err)
	}
	var actions recorderActions
	actionsBytes, readErr := os.ReadFile(built.ActionsFile)
	if readErr != nil || recorderDecodeStrict(actionsBytes, &actions) != nil || len(actions.Actions) != 1 {
		t.Fatalf("desktop-level action decode=%v actions=%#v", readErr, actions.Actions)
	}
	action := actions.Actions[0]
	if action.Target == nil || action.Target.Kind != "display" || action.Target.Display == nil || action.Target.Display.ID != "display-1" ||
		action.Target.Window != nil || action.Position == nil || action.Position.Display == nil || action.Position.Display.OffsetX != 100 ||
		action.Position.Display.OffsetY != 550 || action.Position.Window != nil {
		t.Fatalf("desktop-level action did not preserve a display-relative target: %#v", action)
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
	generated, err := owner.generateBasicScript(built.ActionsFile, "", recorderDefaultGenerationTiming(), recorderDefaultPointerMotion)
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
	dragRelease.Clicks = 0
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{press, dragged, dragRelease})
	if len(actions) != 1 || len(issues) != 0 || actions[0].Kind != "drag" || actions[0].Strategy != "mouse.drag" || actions[0].Position == nil || actions[0].Destination == nil || actions[0].Position.X != 10 || actions[0].Destination.X != 40 || actions[0].Args.Steps != 2 {
		t.Fatalf("straight drag=%#v issues=%#v", actions, issues)
	}
	conflictingRelease := dragRelease
	conflictingRelease.Clicks = 2
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{press, dragged, conflictingRelease})
	if len(actions) != 0 || !recorderHasIssue(issues, "drag-unsupported") {
		t.Fatalf("positive conflicting drag release count must remain unsupported: actions=%#v issues=%#v", actions, issues)
	}
	curved := recorderTestMouseEventAt(2, "MOUSE_DRAGGED", 1005, 1<<8, 40, 80)
	curved.Button = "none"
	curvedRelease := recorderTestMouseEventAt(3, "MOUSE_RELEASED", 1010, 0, 80, 20)
	for _, test := range []struct {
		name   string
		events []recorderRawEvent
		issue  string
	}{
		{name: "curved-drag", events: []recorderRawEvent{press, curved, curvedRelease}, issue: "drag-unsupported"},
		{name: "inconsistent-click-count", events: []recorderRawEvent{press, release, recorderTestMouseEventWithClicks(3, "MOUSE_CLICKED", 1010, 0, 2)}, issue: "click-count-inconsistent"},
		{name: "zero-click-count", events: []recorderRawEvent{recorderTestMouseEventWithClicks(1, "MOUSE_PRESSED", 1000, 0, 0), recorderTestMouseEventWithClicks(2, "MOUSE_RELEASED", 1010, 0, 0), recorderTestMouseEventWithClicks(3, "MOUSE_CLICKED", 1010, 0, 0)}, issue: "click-count-invalid"},
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

	secondPress := recorderTestMouseEventWithClicks(4, "MOUSE_PRESSED", 1200, 0, 2)
	secondRelease := recorderTestMouseEventWithClicks(5, "MOUSE_RELEASED", 1210, 0, 2)
	secondClicked := recorderTestMouseEventWithClicks(6, "MOUSE_CLICKED", 1210, 0, 2)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{press, release, clicked, secondPress, secondRelease, secondClicked})
	if len(actions) != 1 || !recorderHasIssue(issues, "click-count-unsupported") {
		t.Fatalf("spatial double click must remain an explicit local issue: actions=%#v issues=%#v", actions, issues)
	}

	secondPress = recorderTestMouseEventAt(4, "MOUSE_PRESSED", 1200, 0, 70, 80)
	secondRelease = recorderTestMouseEventAt(5, "MOUSE_RELEASED", 1210, 0, 70, 80)
	secondClicked = recorderTestMouseEventAt(6, "MOUSE_CLICKED", 1210, 0, 70, 80)
	secondPress.Clicks, secondRelease.Clicks, secondClicked.Clicks = 2, 2, 2
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{press, release, clicked, secondPress, secondRelease, secondClicked})
	if len(actions) != 2 || len(issues) != 0 || actions[1].Args.ClickCount != 1 || actions[1].Position.X != 70 {
		t.Fatalf("cross-position click-series count must preserve two physical clicks: actions=%#v issues=%#v", actions, issues)
	}

	prefixPress := recorderTestMouseEventWithClicks(1, "MOUSE_PRESSED", 1000, 0, 2)
	prefixRelease := recorderTestMouseEventWithClicks(2, "MOUSE_RELEASED", 1010, 0, 2)
	prefixClicked := recorderTestMouseEventWithClicks(3, "MOUSE_CLICKED", 1010, 0, 2)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{prefixPress, prefixRelease, prefixClicked})
	if len(actions) != 1 || len(issues) != 0 || actions[0].Args.ClickCount != 1 {
		t.Fatalf("capture-start click-series suffix must preserve one physical click: actions=%#v issues=%#v", actions, issues)
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

func TestRecorderActionGroupingExcludesOnlyCaptureStartPointerEnvelope(t *testing.T) {
	startDragA := recorderTestMouseEventAt(2, "MOUSE_DRAGGED", 1000, 1<<8, 100, 100)
	startDragA.Button, startDragA.Clicks = "none", 0
	startDragB := recorderTestMouseEventAt(3, "MOUSE_DRAGGED", 1010, 1<<8, 120, 110)
	startDragB.Button, startDragB.Clicks = "none", 0
	startRelease := recorderTestMouseEventAt(4, "MOUSE_RELEASED", 1020, 0, 120, 110)
	startRelease.Clicks = 0
	press := recorderTestMouseEventAt(5, "MOUSE_PRESSED", 1100, 0, 20, 30)
	release := recorderTestMouseEventAt(6, "MOUSE_RELEASED", 1110, 0, 20, 30)
	clicked := recorderTestMouseEventAt(7, "MOUSE_CLICKED", 1110, 0, 20, 30)

	actions, dispositions, issues := recorderBuildActionList([]recorderRawEvent{startDragA, startDragB, startRelease, press, release, clicked})
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "click" {
		t.Fatalf("capture-start pointer tail must not block later complete actions: actions=%#v issues=%#v", actions, issues)
	}
	for index := 0; index < 3; index++ {
		if dispositions[index].Disposition != "excluded" || dispositions[index].Reason != "capture-start partial pointer envelope" {
			t.Fatalf("capture-start disposition[%d]=%#v", index, dispositions[index])
		}
	}

	t.Run("release-and-click-tail", func(t *testing.T) {
		orphanRelease := recorderTestMouseEventAt(1, "MOUSE_RELEASED", 1000, 0, 80, 90)
		orphanClicked := recorderTestMouseEventAt(2, "MOUSE_CLICKED", 1000, 0, 80, 90)
		actions, dispositions, issues := recorderBuildActionList([]recorderRawEvent{orphanRelease, orphanClicked, press, release, clicked})
		if len(issues) != 0 || len(actions) != 1 || dispositions[0].Disposition != "excluded" || dispositions[1].Disposition != "excluded" {
			t.Fatalf("release/click capture tail: actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
		}
	})

	t.Run("missing-neutral-release", func(t *testing.T) {
		actions, _, issues := recorderBuildActionList([]recorderRawEvent{startDragA, press, release, clicked})
		if len(actions) != 1 || !recorderHasIssue(issues, "drag-without-press") {
			t.Fatalf("unterminated capture-start tail must remain an explicit local issue: actions=%#v issues=%#v", actions, issues)
		}
	})

	t.Run("mid-session-orphan", func(t *testing.T) {
		orphanRelease := recorderTestMouseEventAt(10, "MOUSE_RELEASED", 1200, 0, 200, 200)
		actions, _, issues := recorderBuildActionList([]recorderRawEvent{press, release, clicked, startDragA, orphanRelease})
		if len(actions) != 1 || !recorderHasIssue(issues, "drag-without-press") || !recorderHasIssue(issues, "release-without-press") {
			t.Fatalf("mid-session orphan must remain an explicit local issue: actions=%#v issues=%#v", actions, issues)
		}
	})

	t.Run("ambiguous-held-buttons", func(t *testing.T) {
		ambiguous := startDragA
		ambiguous.ModifierMask = (1 << 8) | (1 << 9)
		actions, _, issues := recorderBuildActionList([]recorderRawEvent{ambiguous, startRelease, press, release, clicked})
		if len(actions) != 1 || !recorderHasIssue(issues, "drag-without-press") {
			t.Fatalf("ambiguous capture-start pointer state must remain an explicit local issue: actions=%#v issues=%#v", actions, issues)
		}
	})
}

func TestRecorderDragEndpointEvidenceKeepsWindowAndEditableTraits(t *testing.T) {
	observed := time.Now().UTC()
	window, err := recorderSnapshotWindow(recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), observed)
	if err != nil {
		t.Fatal(err)
	}
	enabled, focused := true, true
	descriptor := recorderElementDescriptor{
		Role: "textField", NativeRole: "AXTextField", Subrole: "AXSearchField", Name: "Search", Identifier: "search-input",
		Enabled: &enabled, Focused: &focused, ValueSettable: true, NativeActions: []string{}, Bounds: recorderWindowBounds{X: 100, Y: 100, Width: 300, Height: 40},
	}
	element := &recorderElementSnapshot{
		Source: "accessibility", Resolution: "point-hit", Role: descriptor.Role, NativeRole: descriptor.NativeRole, Subrole: descriptor.Subrole,
		Name: descriptor.Name, Identifier: descriptor.Identifier, Enabled: descriptor.Enabled, Focused: descriptor.Focused, ValueSettable: descriptor.ValueSettable,
		NativeActions: []string{}, Bounds: descriptor.Bounds, Hit: descriptor, Ancestors: []recorderElementDescriptor{},
		Point: recorderElementPoint{OffsetX: 20, OffsetY: 20, XRatio: 1.0 / 15.0, YRatio: 0.5}, ObservedAt: observed.Format(time.RFC3339Nano),
	}
	press := recorderInputContext{EventID: "e000000000001", Kind: "pointer", Phase: "pressed", Status: "verified", Window: window, Element: element, SemanticStatus: "verified"}
	release := recorderInputContext{EventID: "e000000000004", Kind: "pointer", Phase: "released", Status: "verified", Window: window, Element: element, SemanticStatus: "verified"}
	action := recorderAction{Kind: "drag", Source: recorderActionSource{EventIDs: []string{press.EventID, "e000000000002", "e000000000003", release.EventID}}}
	evidence := recorderBuildPointerEvidence(action, map[string]recorderInputContext{press.EventID: press, release.EventID: release})
	if evidence.Classification != "text-selection" || evidence.Press == nil || evidence.Release == nil ||
		evidence.Press.Window == nil || evidence.Release.Window == nil || evidence.Press.Window.ID != window.ID || evidence.Release.Window.ID != window.ID ||
		evidence.Press.Element == nil || evidence.Press.Element.Subrole != "AXSearchField" || !evidence.Release.Element.ValueSettable || recorderValidatePointerEvidence(evidence) != nil {
		t.Fatalf("drag endpoint evidence=%#v", evidence)
	}

	otherWindow := *window
	otherWindow.ID = "window-other"
	release.Window = &otherWindow
	evidence = recorderBuildPointerEvidence(action, map[string]recorderInputContext{press.EventID: press, release.EventID: release})
	if evidence.Classification != "drag" {
		t.Fatalf("cross-window editable endpoints must not be classified as text selection: %#v", evidence)
	}
}

func TestRecorderGeneratedDragKeepsOrderedAuditableInputBoundaries(t *testing.T) {
	window, err := recorderSnapshotWindow(recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	position := func(x int) *recorderActionPosition {
		return &recorderActionPosition{
			X: x, Y: 200, Space: "screen-logical", DisplayRef: "display-1", Verified: true,
			Window: &recorderWindowPosition{Anchor: "top-left", OffsetX: x, OffsetY: 200, Space: "window-logical", Verified: true},
		}
	}
	action := recorderAction{
		ID: "a0001", Kind: "drag", Position: position(300), Destination: position(240),
		Target: &recorderActionTarget{Kind: "window", Window: window},
		Args:   recorderActionArguments{Button: "left", Steps: 37},
	}
	source, _, constraints, err := recorderGenerateBasicSource(
		recorderActions{Environment: recorderActionEnvironment{Platform: "darwin"}, Actions: []recorderAction{action}},
		nil,
		recorderGenerationTiming{MinimumDelayMS: 0, MaximumDelayMS: 1, SpeedMultiplier: 1},
		recorderDefaultPointerMotion,
	)
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	ordered := []string{
		`start-position-confirmed`,
		`await mouse.down({ button: "left" })`,
		`button-down-returned`,
		`await __recorderRequireResolvedActiveWindow(__recorderWindow1)`,
		`active-window-confirmed`,
		`await mouse.move(__recorderDragEnd1.x, __recorderDragEnd1.y, { steps: 37 })`,
		`end-position-confirmed`,
		`await mouse.up({ button: "left" })`,
		`button-up-returned`,
	}
	previous := -1
	for _, fragment := range ordered {
		index := strings.Index(text, fragment)
		if index <= previous {
			t.Fatalf("generated drag boundary %q is missing or out of order:\n%s", fragment, text)
		}
		previous = index
	}
	if !strings.Contains(strings.Join(constraints, "\n"), "never target business success") {
		t.Fatalf("generated drag constraints overstate trace evidence: %#v", constraints)
	}
}

func TestRecorderSmoothPointerBudgetUsesDistanceAndAvailableGap(t *testing.T) {
	point := func(x, y int) *recorderActionPosition {
		return &recorderActionPosition{X: x, Y: y, Space: "screen-logical", Verified: true}
	}

	short := recorderSmoothPointerBudget(point(20, 30), point(40, 50), 500, true)
	if !short.DistanceKnown || math.Abs(short.Distance-math.Hypot(20, 20)) > 0.001 || short.DurationMS != 300 || short.ResidualDelayMS != 200 {
		t.Fatalf("short smooth pointer budget = %#v", short)
	}

	long := recorderSmoothPointerBudget(point(0, 0), point(2400, 0), 3000, true)
	if long.DurationMS != 1200 || long.ResidualDelayMS != 1800 {
		t.Fatalf("long smooth pointer budget = %#v", long)
	}

	constrained := recorderSmoothPointerBudget(point(0, 0), point(2400, 0), 180, true)
	if constrained.DurationMS != 180 || constrained.ResidualDelayMS != 0 {
		t.Fatalf("gap-constrained smooth pointer budget = %#v", constrained)
	}

	initial := recorderSmoothPointerBudget(nil, point(40, 50), 0, false)
	if initial.DistanceKnown || initial.DurationMS != 320 || initial.ResidualDelayMS != 0 {
		t.Fatalf("initial smooth pointer budget = %#v", initial)
	}

	zeroGap := recorderSmoothPointerBudget(point(20, 30), point(40, 50), 0, true)
	if zeroGap.DurationMS != 1 || zeroGap.ResidualDelayMS != 0 {
		t.Fatalf("zero-gap smooth pointer budget = %#v", zeroGap)
	}
}

func TestRecorderNaturalTextSelectionRequiresMatchingEditableEndpoints(t *testing.T) {
	observed := time.Now().UTC()
	window, err := recorderSnapshotWindow(recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), observed)
	if err != nil {
		t.Fatal(err)
	}
	window.Bounds = recorderWindowBounds{X: 0, Y: 0, Width: 1600, Height: 1000}
	enabled, focused := true, true
	textDescriptor := recorderElementDescriptor{
		Role: "textField", NativeRole: "AXTextArea", Name: "Message", Identifier: "message-input",
		Enabled: &enabled, Focused: &focused, ValueSettable: true, NativeActions: []string{},
		Bounds: recorderWindowBounds{X: 900, Y: 680, Width: 400, Height: 100},
	}
	textElement := func() *recorderElementSnapshot {
		return &recorderElementSnapshot{
			Source: "accessibility", Resolution: "focused-input-fallback", Role: textDescriptor.Role, NativeRole: textDescriptor.NativeRole,
			Name: textDescriptor.Name, Identifier: textDescriptor.Identifier, Enabled: textDescriptor.Enabled, Focused: textDescriptor.Focused,
			ValueSettable: textDescriptor.ValueSettable, NativeActions: []string{}, Bounds: textDescriptor.Bounds, Hit: textDescriptor,
			Ancestors: []recorderElementDescriptor{}, Point: recorderElementPoint{OffsetX: 20, OffsetY: 20, XRatio: 0.05, YRatio: 0.2},
			ObservedAt: observed.Format(time.RFC3339Nano),
		}
	}
	press := recorderTestMouseEventAt(1, "MOUSE_PRESSED", 1000, 1<<8, 1210, 723)
	coordinates := [][2]int{{1208, 723}, {1177, 719}, {1138, 714}, {1084, 709}, {1048, 709}, {1040, 712}, {1023, 719}, {1000, 723}}
	events := []recorderRawEvent{press}
	for index, point := range coordinates {
		motion := recorderTestMouseEventAt(index+2, "MOUSE_DRAGGED", uint64(1010+index*10), 1<<8, point[0], point[1])
		motion.Button = "none"
		events = append(events, motion)
	}
	release := recorderTestMouseEventAt(len(events)+1, "MOUSE_RELEASED", 1100, 0, 992, 723)
	// macOS leaves click count at its zero/default for a drag release that does
	// not become a CLICKED event. The raw release remains authoritative.
	release.Clicks = 0
	events = append(events, release)
	pressContext := recorderInputContext{EventID: press.EventID, Kind: "pointer", Phase: "pressed", Status: "verified", Window: window, Element: textElement(), SemanticStatus: "verified"}
	releaseContext := recorderInputContext{EventID: release.EventID, Kind: "pointer", Phase: "released", Status: "verified", Window: window, Element: textElement(), SemanticStatus: "verified"}

	build := func(contexts []recorderInputContext, input []recorderRawEvent) ([]recorderAction, []recorderIssue) {
		actions, _, issues := recorderBuildActionListWithContexts(input, nil, contexts)
		return actions, issues
	}
	actions, issues := build([]recorderInputContext{pressContext, releaseContext}, events)
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "drag" || actions[0].Source.Basis != recorderTextSelectionDragBasis {
		t.Fatalf("natural text selection actions=%#v issues=%#v", actions, issues)
	}

	for _, test := range []struct {
		name     string
		contexts []recorderInputContext
		events   []recorderRawEvent
	}{
		{name: "missing-traits", contexts: []recorderInputContext{{EventID: press.EventID, Kind: "pointer", Phase: "pressed", Status: "verified", Window: window, SemanticStatus: "unavailable", SemanticReason: "no target"}, {EventID: release.EventID, Kind: "pointer", Phase: "released", Status: "verified", Window: window, SemanticStatus: "unavailable", SemanticReason: "no target"}}, events: events},
		{name: "non-text-field", contexts: func() []recorderInputContext {
			buttonPress, buttonRelease := pressContext, releaseContext
			buttonPress.Element, buttonRelease.Element = textElement(), textElement()
			buttonPress.Element.Role, buttonRelease.Element.Role = "button", "button"
			buttonPress.Element.NativeRole, buttonRelease.Element.NativeRole = "AXButton", "AXButton"
			buttonPress.Element.ValueSettable, buttonRelease.Element.ValueSettable = false, false
			return []recorderInputContext{buttonPress, buttonRelease}
		}(), events: events},
		{name: "different-window", contexts: func() []recorderInputContext {
			otherRelease := releaseContext
			otherWindow := *window
			otherWindow.ID = "window-other"
			otherRelease.Window = &otherWindow
			return []recorderInputContext{pressContext, otherRelease}
		}(), events: events},
		{name: "curved", contexts: []recorderInputContext{pressContext, releaseContext}, events: func() []recorderRawEvent {
			curved := append([]recorderRawEvent(nil), events...)
			y := 660
			curved[len(curved)/2].Y = &y
			return curved
		}()},
		{name: "clear-backtrack", contexts: []recorderInputContext{pressContext, releaseContext}, events: func() []recorderRawEvent {
			backtrack := append([]recorderRawEvent(nil), events...)
			x := 1195
			backtrack[3].X = &x
			return backtrack
		}()},
	} {
		t.Run(test.name, func(t *testing.T) {
			actions, issues := build(test.contexts, test.events)
			if len(actions) != 0 || !recorderHasIssue(issues, "drag-unsupported") {
				t.Fatalf("actions=%#v issues=%#v", actions, issues)
			}
		})
	}

	payload, err := json.Marshal([]recorderInputContext{pressContext, releaseContext})
	if err != nil {
		t.Fatal(err)
	}
	text := string(payload)
	if strings.Contains(text, `"value":`) || strings.Contains(text, `"selectedText":`) || strings.Contains(text, `"selection":`) {
		t.Fatalf("pointer endpoint evidence leaked content: %s", text)
	}
}

func TestRecorderSessionControlClickBoundaryCapturesProductionTail(t *testing.T) {
	backend := &recorderMemoryBackend{}
	session, err := recorderTestOwner(t.TempDir(), backend).startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	// libuiohook may carry a time/button click-series count from input that
	// happened before capture or at a different point. The complete current
	// control envelope remains matchable when all three events agree.
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 2, X: 300, Y: 400})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseDragged, NativeTime: 1005, Button: 0, Clicks: 0, Mask: 1 << 8, X: 301, Y: 400})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 2, X: 301, Y: 400})
	result, err := session.excludeControlClick("recorder-window", "stop", time.Now().UTC(), recorderControlBounds{X: 290, Y: 390, Width: 40, Height: 40})
	if err != nil || !result.Changed || len(result.EventIDs) != 3 {
		t.Fatalf("control-click result=%#v error=%v", result, err)
	}
	if result.MatchStatus != "matched" {
		t.Fatalf("control-click match status=%q", result.MatchStatus)
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

func TestRecorderSessionControlClickDoesNotExcludeRecentTargetOutsideControlBounds(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	session, err := owner.startSession(recorderTestStartOptions())
	if err != nil {
		t.Fatal(err)
	}
	backend.Emit(RecorderInputEvent{Type: recorderEventMousePressed, NativeTime: 1000, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseReleased, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	backend.Emit(RecorderInputEvent{Type: recorderEventMouseClicked, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})

	result, err := session.excludeControlClick("recorder-window", "stop", time.Now().UTC(), recorderControlBounds{X: 300, Y: 400, Width: 40, Height: 40})
	if err != nil || !result.Changed || result.MatchStatus != "not-observed" || len(result.EventIDs) != 0 {
		t.Fatalf("control-click result=%#v error=%v", result, err)
	}
	session.finishAsync(nil)
	<-session.done
	if session.stopErr != nil {
		t.Fatalf("stop error=%v", session.stopErr)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 1 || len(built.Issues) != 0 {
		t.Fatalf("cross-application target click was not preserved: result=%#v error=%v", built, err)
	}
}

func TestRecorderNormalizesTextInputSourceWithoutPersistingInputMethodIdentity(t *testing.T) {
	session := &recorderSession{}
	for _, test := range []struct {
		name       string
		source     uint8
		wantSource string
		wantGap    bool
	}{
		{name: "direct layout", source: 1, wantSource: "keyboard-layout"},
		{name: "input method", source: 2, wantSource: "input-method", wantGap: true},
		{name: "unknown", source: 0, wantSource: "unknown", wantGap: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			event := session.normalizeEvent(1, RecorderInputEvent{Type: recorderEventKeyTyped, NativeTime: 1000, Rawcode: 8, Keychar: 'c', TextInputSource: test.source})
			if event.TextInputSource != test.wantSource || recorderRawEventHasGap(event, "key-typed-is-not-an-ime-commit") != test.wantGap {
				t.Fatalf("normalized text event=%#v", event)
			}
			if event.Metadata != nil {
				t.Fatalf("text input source identity must not be persisted: %#v", event.Metadata)
			}
		})
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
	typed.TextInputSource = "input-method"
	typed.Gaps = []string{"key-typed-is-not-an-ime-commit"}
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{pressed, typed, released})
	if len(actions) != 1 || actions[0].Kind != "text" || actions[0].Args.Text != "a" || len(issues) != 0 {
		t.Fatalf("IME low-level text must remain a generatable fallback: actions=%#v issues=%#v", actions, issues)
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

func TestRecorderKeyboardShortcutsSpecialKeysAndVerifiedTextEdits(t *testing.T) {
	keyboardEvent := func(sequence int, kind string, code, rawcode, mask uint16) recorderRawEvent {
		event := recorderTestRawEvent(sequence, kind)
		undefined := uint16(0xffff)
		event.Keycode, event.Rawcode, event.Keychar = &code, &rawcode, &undefined
		event.ModifierMask = mask
		event.Modifiers = recorderModifiers(mask)
		return event
	}
	metaPress := keyboardEvent(1, "KEY_PRESSED", 0x0e5b, 0, 1<<2)
	cPress := keyboardEvent(2, "KEY_PRESSED", 0x002e, 8, 1<<2)
	cRelease := keyboardEvent(3, "KEY_RELEASED", 0x002e, 8, 1<<2)
	metaRelease := keyboardEvent(4, "KEY_RELEASED", 0x0e5b, 0, 0)
	actions, dispositions, issues := recorderBuildActionList([]recorderRawEvent{metaPress, cPress, cRelease, metaRelease})
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "shortcut" || actions[0].Strategy != "keyboard.combination" || !reflect.DeepEqual(actions[0].Args.Keys, []string{"Meta", "C"}) || !reflect.DeepEqual(actions[0].Source.EventIDs, []string{metaPress.EventID, cPress.EventID, cRelease.EventID, metaRelease.EventID}) {
		t.Fatalf("shortcut actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}
	for _, item := range dispositions {
		if item.ActionID != actions[0].ID || (item.Disposition != "consumed" && item.Disposition != "evidence") {
			t.Fatalf("shortcut disposition=%#v", dispositions)
		}
	}

	repeatedMetaPress := keyboardEvent(1, "KEY_PRESSED", 0x0e5b, 0, 1<<2)
	repeatedCPress1 := keyboardEvent(2, "KEY_PRESSED", 0x002e, 8, 1<<2)
	repeatedCPress2 := keyboardEvent(3, "KEY_PRESSED", 0x002e, 8, 1<<2)
	repeatedCPress3 := keyboardEvent(4, "KEY_PRESSED", 0x002e, 8, 1<<2)
	repeatedCRelease := keyboardEvent(5, "KEY_RELEASED", 0x002e, 8, 1<<2)
	repeatedMetaRelease := keyboardEvent(6, "KEY_RELEASED", 0x0e5b, 0, 0)
	repeatedShortcutEvents := []recorderRawEvent{repeatedMetaPress, repeatedCPress1, repeatedCPress2, repeatedCPress3, repeatedCRelease, repeatedMetaRelease}
	actions, dispositions, issues = recorderBuildActionList(repeatedShortcutEvents)
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "shortcut" || actions[0].Args.RepeatCount != 3 || !reflect.DeepEqual(actions[0].Args.Keys, []string{"Meta", "C"}) || !reflect.DeepEqual(actions[0].Source.EventIDs, []string{repeatedMetaPress.EventID, repeatedCPress1.EventID, repeatedCPress2.EventID, repeatedCPress3.EventID, repeatedCRelease.EventID, repeatedMetaRelease.EventID}) {
		t.Fatalf("repeated shortcut actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}
	if !recorderValidPhysicalKeySources(repeatedShortcutEvents, "C", []string{"Meta"}, 3) || recorderValidPhysicalKeySources(repeatedShortcutEvents, "C", []string{"Control"}, 3) || recorderValidPhysicalKeySources(repeatedShortcutEvents, "C", []string{"Meta"}, 2) {
		t.Fatal("strict repeated shortcut source validation did not preserve key, modifier, and count")
	}

	driftMetaPress := keyboardEvent(1, "KEY_PRESSED", 0x0e5b, 0, 1<<2)
	driftCPress1 := keyboardEvent(2, "KEY_PRESSED", 0x002e, 8, 1<<2)
	driftCPress2 := keyboardEvent(3, "KEY_PRESSED", 0x002e, 8, (1<<2)|(1<<0))
	driftCRelease := keyboardEvent(4, "KEY_RELEASED", 0x002e, 8, 1<<2)
	driftMetaRelease := keyboardEvent(5, "KEY_RELEASED", 0x0e5b, 0, 0)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{driftMetaPress, driftCPress1, driftCPress2, driftCRelease, driftMetaRelease})
	if len(actions) != 0 || !recorderHasIssue(issues, "physical-key-modifiers-changed") {
		t.Fatalf("modifier drift actions=%#v issues=%#v", actions, issues)
	}

	enterPress := keyboardEvent(1, "KEY_PRESSED", 0x001c, 0x24, 0)
	enterRelease := keyboardEvent(2, "KEY_RELEASED", 0x001c, 0x24, 0)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{enterPress, enterRelease})
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "key" || actions[0].Args.Key != "Enter" || actions[0].Strategy != "keyboard.press" {
		t.Fatalf("special-key actions=%#v issues=%#v", actions, issues)
	}

	backspacePress1 := keyboardEvent(1, "KEY_PRESSED", 0x000e, 0x33, 0)
	backspacePress2 := keyboardEvent(2, "KEY_PRESSED", 0x000e, 0x33, 0)
	backspacePress3 := keyboardEvent(3, "KEY_PRESSED", 0x000e, 0x33, 0)
	backspaceRelease := keyboardEvent(4, "KEY_RELEASED", 0x000e, 0x33, 0)
	actions, dispositions, issues = recorderBuildActionList([]recorderRawEvent{backspacePress1, backspacePress2, backspacePress3, backspaceRelease})
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "key" || actions[0].Args.Key != "Backspace" || actions[0].Args.RepeatCount != 3 || !reflect.DeepEqual(actions[0].Source.EventIDs, []string{backspacePress1.EventID, backspacePress2.EventID, backspacePress3.EventID, backspaceRelease.EventID}) {
		t.Fatalf("repeated special-key actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}
	for _, item := range dispositions {
		if item.ActionID != actions[0].ID || (item.Disposition != "consumed" && item.Disposition != "evidence") {
			t.Fatalf("repeated special-key disposition=%#v", dispositions)
		}
	}

	overLimit := make([]recorderRawEvent, 0, recorderMaximumKeyRepeatCount+2)
	for sequence := 1; sequence <= recorderMaximumKeyRepeatCount+1; sequence++ {
		overLimit = append(overLimit, keyboardEvent(sequence, "KEY_PRESSED", 0x000e, 0x33, 0))
	}
	overLimit = append(overLimit, keyboardEvent(recorderMaximumKeyRepeatCount+2, "KEY_RELEASED", 0x000e, 0x33, 0))
	actions, _, issues = recorderBuildActionList(overLimit)
	if len(actions) != 0 || !recorderHasIssue(issues, "physical-key-unsupported") {
		t.Fatalf("over-limit key repeat actions=%#v issues=%#v", actions, issues)
	}

	keypadEnterPress := keyboardEvent(1, "KEY_PRESSED", 0x0e1c, 76, 0)
	keypadEnterRelease := keyboardEvent(2, "KEY_RELEASED", 0x0e1c, 76, 0)
	actions, _, issues = recorderBuildActionList([]recorderRawEvent{keypadEnterPress, keypadEnterRelease})
	if len(issues) != 0 || len(actions) != 1 || actions[0].Kind != "key" || actions[0].Args.Key != "Enter" || actions[0].Strategy != "keyboard.press" {
		t.Fatalf("numeric-keypad Enter actions=%#v issues=%#v", actions, issues)
	}

	before, after := "prefix🙂suffix", "prefix世界🙂suffix"
	patch := recorderBuildTextPatch(before, after)
	if applied, ok := recorderApplyTextPatch(before, patch); !ok || applied != after || patch.Unit != "utf16-code-unit" || patch.Start != 6 {
		t.Fatalf("unicode patch=%#v applied=%q ok=%t", patch, applied, ok)
	}
	focused := true
	window, err := recorderSnapshotWindow(recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), time.Now().UTC())
	if err != nil {
		t.Fatal(err)
	}
	edit := recorderTextEdit{
		ID: "t0001", Status: "verified", SourceEventIDs: []string{enterPress.EventID, enterRelease.EventID}, Window: window,
		Element: recorderElementDescriptor{Role: "textField", NativeRole: "AXTextField", Name: "Editor", Identifier: "editor", Focused: &focused, ValueSettable: true, NativeActions: []string{}, Bounds: recorderWindowBounds{X: 10, Y: 10, Width: 300, Height: 40}},
		Before:  recorderFingerprintText(before), Patch: patch, After: recorderFingerprintText(after), ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	actions, dispositions, issues = recorderBuildActionListWithTextEdits([]recorderRawEvent{enterPress, enterRelease}, []recorderTextEdit{edit})
	if len(actions) != 1 || actions[0].Kind != "text-edit" || actions[0].Strategy != "accessibility.setValue" || actions[0].Args.TextEdit == nil || actions[0].Target == nil || actions[0].Target.Editable == nil || !recorderHasIssue(issues, "ime-boundary-ambiguous") {
		t.Fatalf("verified text edit actions=%#v dispositions=%#v issues=%#v", actions, dispositions, issues)
	}

	plainPress := keyboardEvent(1, "KEY_PRESSED", 0x001e, 0, 0)
	plainRelease := keyboardEvent(2, "KEY_RELEASED", 0x001e, 0, 0)
	edit.SourceEventIDs = []string{plainPress.EventID, plainRelease.EventID}
	actions, _, issues = recorderBuildActionListWithTextEdits([]recorderRawEvent{plainPress, plainRelease}, []recorderTextEdit{edit})
	if len(issues) != 0 || len(actions) != 1 {
		t.Fatalf("unambiguous text edit actions=%#v issues=%#v", actions, issues)
	}
	if err := recorderValidateActionTarget(actions[0]); err != nil {
		t.Fatalf("unambiguous text edit target=%#v error=%v", actions[0].Target, err)
	}
	source, _, constraints, err := recorderGenerateBasicSource(recorderActions{Environment: recorderActionEnvironment{Platform: "darwin"}, Actions: actions}, []recorderRawEvent{plainPress, plainRelease}, recorderGenerationTiming{MinimumDelayMS: 0, MaximumDelayMS: 1, SpeedMultiplier: 1}, recorderDefaultPointerMotion)
	if err != nil || !strings.Contains(string(source), "await __recorderApplyTextEdit") || !strings.Contains(string(source), "editable value precondition mismatch") || !strings.Contains(string(source), "Accessibility.perform(ref, { action: \"setValue\"") || !strings.Contains(strings.Join(constraints, "\n"), "UTF-16LE SHA-256") {
		t.Fatalf("text edit source error=%v\n%s\nconstraints=%#v", err, source, constraints)
	}
}

func TestRecorderTextTrackerCapturesFinalASCIIAndUnicodeValuePatches(t *testing.T) {
	backend := &recorderMemoryBackend{}
	owner := recorderTestOwner(t.TempDir(), backend)
	var valueMu sync.Mutex
	value := "private-context"
	focused := true
	owner.textProbe = func(_ context.Context, _ *WindowInfo, window *recorderWindowSnapshot) (*recorderTextFieldSample, error) {
		valueMu.Lock()
		current := value
		valueMu.Unlock()
		return &recorderTextFieldSample{
			ObservedAt: time.Now().UTC(), Window: recorderCloneWindowSnapshot(window), Value: current,
			Element: recorderElementDescriptor{
				Role: "textField", NativeRole: "AXTextArea", Name: "Editor", Identifier: "editor",
				Focused: &focused, ValueSettable: true, NativeActions: []string{},
			},
		}, nil
	}
	options := recorderTestStartOptions()
	options.CaptureKeyboard = true
	options.KeyboardContent = "non-sensitive-test"
	session, err := owner.startSession(options)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(2 * recorderTextSampleInterval)

	emitEdit := func(native uint64, keycode, rawcode, keychar uint16, next string) {
		backend.Emit(RecorderInputEvent{Type: recorderEventKeyPressed, NativeTime: native, Keycode: keycode, Rawcode: rawcode, Keychar: 0xffff})
		valueMu.Lock()
		value = next
		valueMu.Unlock()
		backend.Emit(RecorderInputEvent{Type: recorderEventKeyTyped, NativeTime: native, Rawcode: rawcode, Keychar: keychar, TextInputSource: 2})
		backend.Emit(RecorderInputEvent{Type: recorderEventKeyReleased, NativeTime: native + 1, Keycode: keycode, Rawcode: rawcode, Keychar: 0xffff})
	}
	emitEdit(1000, 0x001e, 0, 'a', "private-contexta")
	time.Sleep(2 * recorderTextSettleInterval)
	emitEdit(2000, 0x0030, 11, 'b', "private-contextazh")
	time.Sleep(recorderTextSettleInterval / 3)
	emitEdit(2100, 0x002e, 8, 'c', "private-contexta中文")
	time.Sleep(2 * recorderTextSettleInterval)

	session.finishAsync(nil)
	<-session.done
	if session.stopErr != nil {
		t.Fatalf("stop error=%v", session.stopErr)
	}
	manifestBytes, err := os.ReadFile(session.writer.manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest recorderManifest
	if err := recorderDecodeStrict(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.TextEdits) != 2 || manifest.TextEdits[0].Patch.InsertText != "a" || manifest.TextEdits[1].Patch.InsertText != "中文" || len(manifest.TextEdits[1].SourceEventIDs) != 6 {
		t.Fatalf("final text edits=%#v", manifest.TextEdits)
	}
	if manifest.TextEdits[0].Element.Bounds.Width != 0 || recorderValidateEditableDescriptor(manifest.TextEdits[0].Element) != nil {
		t.Fatalf("bounds-free focused editable descriptor was not preserved: %#v", manifest.TextEdits[0].Element)
	}
	if strings.Contains(string(manifestBytes), "private-context") {
		t.Fatalf("manifest leaked unchanged text context: %s", manifestBytes)
	}
	built, err := owner.buildActionsFile(session.writer.recordingDir)
	if err != nil || built.Readiness != "ready" || built.ActionCount != 2 || len(built.Issues) != 0 {
		t.Fatalf("text actions=%#v error=%v", built, err)
	}
}

func TestRecorderTextSampleBeforeSurvivesAnAXPollCrossingTheInputBoundary(t *testing.T) {
	eventAt := time.Now().UTC()
	baseline := recorderTextFieldSample{ObservedAt: eventAt.Add(-50 * time.Millisecond), Value: "Ada"}
	crossing := recorderTextFieldSample{ObservedAt: eventAt.Add(10 * time.Millisecond), Value: "Adax"}

	got, ok := recorderTextSampleBefore([]recorderTextFieldSample{baseline, crossing}, eventAt)
	if !ok || got.Value != baseline.Value || !got.ObservedAt.Equal(baseline.ObservedAt) {
		t.Fatalf("selected sample=%#v ok=%t, want pre-input baseline=%#v", got, ok, baseline)
	}

	stale := recorderTextFieldSample{ObservedAt: eventAt.Add(-recorderTextSampleFreshness - time.Millisecond), Value: "stale"}
	if got, ok := recorderTextSampleBefore([]recorderTextFieldSample{stale, crossing}, eventAt); ok {
		t.Fatalf("selected stale/crossing sample=%#v", got)
	}
}

func TestRecorderResourceCountsDoesNotClearStarting(t *testing.T) {
	owner := recorderTestOwner(t.TempDir(), nil)
	owner.starting = true
	owner.ResourceCounts()
	if !owner.starting {
		t.Fatal("ResourceCounts cleared starting state")
	}
}

func recorderTestOwner(workDir string, backend RecorderInputBackend) *RecorderRuntime {
	return &RecorderRuntime{
		context: context.Background(), workDir: workDir, executionID: "test-execution",
		backendFactory: func() RecorderInputBackend { return backend },
		windowProbe:    func() (*WindowInfo, error) { return recorderTestWindow(42, "Recorder Fixture", "Recorder.app"), nil },
		targetProbe: func(_ context.Context, _ *WindowInfo, point recorderTargetPoint) (*recorderElementSnapshot, error) {
			x, y := point.X, point.Y
			enabled, focused := true, false
			descriptor := recorderElementDescriptor{Role: "button", NativeRole: "AXButton", Name: "Save", Identifier: "save-button", Enabled: &enabled, Focused: &focused, NativeActions: []string{"AXPress"}, Bounds: recorderWindowBounds{X: x - 5, Y: y - 5, Width: 20, Height: 20}}
			return &recorderElementSnapshot{
				Source: "accessibility", Resolution: "point-hit", Role: "button", NativeRole: "AXButton", Name: "Save", Identifier: "save-button",
				Enabled: &enabled, Focused: &focused,
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
	event := recorderRawEvent{FormatVersion: recorderRawEventFormatVersion, EventID: "e" + leftPadRecorder(sequence), Sequence: itoaRecorder(sequence), LibraryEvent: kind, NativeTime: itoaRecorder(1000 + sequence*10), NativeClock: "fixture", NativeUnit: "milliseconds", ReceivedAt: time.Now().UTC().Format(time.RFC3339Nano), Modifiers: []string{}, Source: "unknown", ScopeRef: "within:fixture"}
	if kind == "KEY_TYPED" {
		event.TextInputSource = "keyboard-layout"
	}
	return event
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
