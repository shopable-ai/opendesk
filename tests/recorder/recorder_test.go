package recorder_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	. "opendesk/pkg/recorder"
)

func TestConcurrentSessionsStayIsolatedAndStopRejectsWrites(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	left, err := manager.Start(StartOptions{SessionID: "rec-left", ExecutionID: "exec-left", Goal: "left", Source: "mcp"})
	if err != nil {
		t.Fatal(err)
	}
	right, err := manager.Start(StartOptions{SessionID: "rec-right", ExecutionID: "exec-right", Goal: "right", Source: "js"})
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	for index, id := range []string{left.SessionID, right.SessionID} {
		wg.Add(1)
		go func(sessionID string, x int) {
			defer wg.Done()
			span, beginErr := manager.Before(sessionID, "", "", ActionRequest{Name: "click", Arguments: map[string]any{"x": x, "y": x}}, ActionHint{Intent: "click"}, Observation{})
			if beginErr != nil {
				t.Errorf("before: %v", beginErr)
				return
			}
			if endErr := manager.After(span, ActionResult{OK: true}, Observation{}, Verification{Status: "pass"}); endErr != nil {
				t.Errorf("after: %v", endErr)
			}
		}(id, index+1)
	}
	wg.Wait()

	leftEvents, err := manager.Store().LoadEvents(left.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	rightEvents, err := manager.Store().LoadEvents(right.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range leftEvents {
		if event.SessionID != left.SessionID {
			t.Fatalf("left trace contains event from %s", event.SessionID)
		}
	}
	for _, event := range rightEvents {
		if event.SessionID != right.SessionID {
			t.Fatalf("right trace contains event from %s", event.SessionID)
		}
	}
	if _, err := manager.Stop(left.SessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Before(left.SessionID, "", "", ActionRequest{Name: "click"}, ActionHint{}, Observation{}); !errors.Is(err, ErrSessionStopped) {
		t.Fatalf("expected stopped error, got %v", err)
	}
}

func TestStoreRecoversDamagedTail(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.PrepareSession("rec-recover"); err != nil {
		t.Fatal(err)
	}
	event := TraceEvent{SchemaVersion: SchemaVersion, EventID: "event-1", EventType: "annotation", SessionID: "rec-recover", Sequence: 1}
	if err := store.AppendEvent("rec-recover", event); err != nil {
		t.Fatal(err)
	}
	path, err := store.ArtifactPath("rec-recover", "raw/events.ndjson")
	if err != nil {
		t.Fatal(err)
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.WriteString(`{"partial":`)
	_ = file.Close()
	events, err := store.LoadEvents("rec-recover")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 || events[0].EventID != "event-1" {
		t.Fatalf("unexpected recovered events: %#v", events)
	}
}

func TestPrivacyRedactsSecretsRecursively(t *testing.T) {
	arguments, count := RedactArguments(map[string]any{
		"text":     "visible",
		"apiToken": "do-not-store",
		"nested":   map[string]any{"password": "also-secret", "name": "safe"},
		"payload":  "classified",
	}, []VariableHint{{Argument: "payload", Classification: "secret"}})
	encoded := strings.TrimSpace(toJSON(arguments))
	for _, secret := range []string{"do-not-store", "also-secret", "classified"} {
		if strings.Contains(encoded, secret) {
			t.Fatalf("secret leaked: %s", encoded)
		}
	}
	if count != 2 {
		t.Fatalf("top-level redaction count=%d, want 2", count)
	}
}

func TestInternalObservationRecursionIsBlocked(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := manager.Start(StartOptions{Goal: "guard", Source: "mcp"})
	if err != nil {
		t.Fatal(err)
	}
	release, err := manager.EnterInternal(manifest.SessionID, "act-1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.EnterInternal(manifest.SessionID, "act-1"); !errors.Is(err, ErrInternalRecursion) {
		t.Fatalf("expected recursion guard, got %v", err)
	}
	release()
	status, _ := manager.Status(manifest.SessionID)
	if status.InternalRecursion != 1 {
		t.Fatalf("recursion evidence=%d, want 1", status.InternalRecursion)
	}
}

func TestDistillMergesTypingDropsObservationAndKeepsSourceIDs(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := manager.Start(StartOptions{Goal: "fill benchmark", Source: "js"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.RecordInternal(manifest.SessionID, "exec", "act-none", "screenshot", Observation{}); err != nil {
		t.Fatal(err)
	}
	for _, text := range []string{"open", "desk"} {
		span, err := manager.Before(manifest.SessionID, "exec", "js", ActionRequest{Name: "type", Arguments: map[string]any{"text": text}}, ActionHint{Intent: "fill token", TargetDescription: "token", ExpectedPostconditions: []Postcondition{{Kind: "dom.valueEquals", Value: map[string]any{"selector": "#token", "expected": "opendesk"}}}, Risk: "low"}, Observation{})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.After(span, ActionResult{OK: true}, Observation{}, Verification{Status: "pass"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := manager.Stop(manifest.SessionID); err != nil {
		t.Fatal(err)
	}
	flow, report, err := manager.Distill(manifest.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if len(flow.Steps) != 1 || len(flow.Steps[0].SourceActionIDs) != 2 || flow.Steps[0].Action.Arguments["text"] != "opendesk" {
		t.Fatalf("unexpected distilled flow: %#v", flow)
	}
	if report.MergedActions != 1 || report.RemovedObservations == 0 {
		t.Fatalf("unexpected report: %#v", report)
	}
}

func TestDistillCollapsesCumulativeDOMFillEvents(t *testing.T) {
	manager, _ := NewManager(t.TempDir())
	manifest, _ := manager.Start(StartOptions{Goal: "fill DOM", Source: "mcp"})
	for _, value := range []string{"r", "re", "rec"} {
		span, err := manager.Before(manifest.SessionID, "exec", "mcp", ActionRequest{Name: "dom.fill", Arguments: map[string]any{"selector": "#token", "value": value}}, ActionHint{Intent: "fill", TargetDescription: "token", ExpectedPostconditions: []Postcondition{{Kind: "dom.valueEquals", Value: map[string]any{"selector": "#token", "expected": value}}}}, Observation{})
		if err != nil {
			t.Fatal(err)
		}
		if err := manager.After(span, ActionResult{OK: true}, Observation{}, Verification{Status: "pass"}); err != nil {
			t.Fatal(err)
		}
	}
	_, _ = manager.Stop(manifest.SessionID)
	flow, report, err := manager.Distill(manifest.SessionID)
	if err != nil {
		t.Fatal(err)
	}
	if len(flow.Steps) != 1 || flow.Steps[0].Action.Arguments["value"] != "rec" || len(flow.Steps[0].SourceActionIDs) != 3 || report.MergedActions != 2 {
		t.Fatalf("cumulative DOM fills were not collapsed: flow=%#v report=%#v", flow, report)
	}
}

func TestCompilerIsDeterministicAndContainsNoAICall(t *testing.T) {
	manager, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manifest, _ := manager.Start(StartOptions{Goal: "click", Source: "mcp"})
	_, _ = manager.Stop(manifest.SessionID)
	flow := Flow{SchemaVersion: SchemaVersion, FlowID: "flow-1", SessionID: manifest.SessionID, Goal: "click", Mode: "deterministic", Steps: []FlowStep{{
		StepID: "step-001", SourceActionIDs: []string{"act-1"}, Intent: "click", Target: "button",
		Locators:               []LocatorCandidate{{Kind: "role+name", Role: "AXButton", Name: "1"}},
		Action:                 ActionRequest{Name: "click", Arguments: map[string]any{"targetKey": "one", "acceptedLabels": []any{"1"}}},
		ExpectedPostconditions: []Postcondition{{Kind: "displayEquals", Value: "1"}}, Verification: Verification{Status: "pass"}, Risk: "low",
	}}}
	path, err := manager.Compile(manifest.SessionID, flow, CompileOptions{})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	script := string(data)
	if GeneratedJavaScriptUsesAI(script) {
		t.Fatal("generated script contains an AI call")
	}
	for _, required := range []string{"const STEPS", "async function main()", "mouse.clickForPID", "sourceActionIds", "waitForDOMPostcondition", "F6: DOM postcondition failed"} {
		if !strings.Contains(script, required) {
			t.Fatalf("generated script missing %q", required)
		}
	}
	if filepath.Base(path) != "flow.js" {
		t.Fatalf("unexpected path %s", path)
	}
}

type replayFake struct {
	resolveErr error
	executed   int
}

func (f *replayFake) CheckPreconditions(context.Context, FlowStep) error { return nil }
func (f *replayFake) ResolveTarget(context.Context, FlowStep) (any, error) {
	if f.resolveErr != nil {
		return nil, f.resolveErr
	}
	return struct{}{}, nil
}
func (f *replayFake) Execute(context.Context, FlowStep, any) error { f.executed++; return nil }
func (f *replayFake) Verify(context.Context, FlowStep) error       { return nil }

func TestReplayStopsBeforeActionOnAmbiguousTarget(t *testing.T) {
	driver := &replayFake{resolveErr: errors.New("ambiguous candidates")}
	flow := Flow{FlowID: "flow", Mode: "deterministic", Steps: []FlowStep{{StepID: "one", Action: ActionRequest{Name: "click"}}, {StepID: "two", Action: ActionRequest{Name: "click"}}}}
	report := Replay(context.Background(), flow, driver)
	if report.Status != "failed" || len(report.Steps) != 1 || report.Steps[0].FailureClass != "F4" || driver.executed != 0 {
		t.Fatalf("unsafe replay report: %#v executed=%d", report, driver.executed)
	}
}

func toJSON(value any) string {
	data, _ := jsonMarshal(value)
	return string(data)
}

var jsonMarshal = func(value any) ([]byte, error) {
	return json.Marshal(value)
}
