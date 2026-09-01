package mcpserver

import (
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/recorder"
)

type recordingRuntime struct{ *fakeRuntime }

func (r *recordingRuntime) Screenshot(args map[string]any) (any, error) {
	path, _ := args["path"].(string)
	if path != "" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(path, []byte("not-a-real-png-unit-fixture"), 0o644); err != nil {
			return nil, err
		}
	}
	return path, nil
}

func TestRecorderMCPActionTraceDistillAndCompile(t *testing.T) {
	manager, err := recorder.NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	fake := &recordingRuntime{fakeRuntime: &fakeRuntime{activeWindowResult: map[string]any{
		"title": "Calculator", "pid": float64(42), "exePath": "/System/Applications/Calculator.app",
		"x": float64(100), "y": float64(80), "width": float64(232), "height": float64(321), "isForeground": true,
	}}}
	srv := NewServerWithRecorder(fake, manager)
	started := callToolPayload(t, srv, "tm_recorder_start", map[string]any{
		"goal": "calculate 1", "executionId": "exec-mcp", "observationPolicy": "standard",
	})
	sessionID, _ := started["recordingSessionId"].(string)
	if sessionID == "" {
		t.Fatalf("missing recordingSessionId: %#v", started)
	}
	action := callToolPayload(t, srv, "tm_click", map[string]any{
		"x": 128.0, "y": 329.0, "expectedWindowTitle": "Calculator", "recordingSessionId": sessionID,
		"targetKey": "one", "targetLabel": "1", "targetRole": "AXButton", "windowRelative": map[string]any{"x": 28.0, "y": 249.0},
		"recorderHint": map[string]any{
			"goal": "calculate 1", "subgoal": "enter digit", "intent": "click 1", "targetDescription": "Calculator digit 1",
			"risk": "low", "expectedPostconditions": []any{map[string]any{"kind": "displayEquals", "value": "1"}},
		},
	})
	recorderResult, _ := action["recorder"].(map[string]any)
	actionID, _ := recorderResult["actionId"].(string)
	if actionID == "" || fake.lastClickArgs == nil {
		t.Fatalf("recorded click did not execute: action=%#v fake=%#v", action, fake.fakeRuntime)
	}
	callToolPayload(t, srv, "tm_recorder_verify", map[string]any{
		"recordingSessionId": sessionID, "executionId": "exec-mcp", "actionId": actionID,
		"verification": map[string]any{"status": "pass", "postconditions": []any{map[string]any{"kind": "displayEquals", "value": "1"}}, "actual": map[string]any{"display": "1"}},
	})
	callToolPayload(t, srv, "tm_recorder_stop", map[string]any{"recordingSessionId": sessionID})
	distilled := callToolPayload(t, srv, "tm_recorder_distill", map[string]any{"recordingSessionId": sessionID})
	report, _ := distilled["report"].(recorder.DistillReport)
	if report.FlowStepCount != 1 {
		t.Fatalf("unexpected distillation: %#v", distilled)
	}
	compiled := callToolPayload(t, srv, "tm_recorder_compile", map[string]any{"recordingSessionId": sessionID})
	if compiled["usesAI"] != false || compiled["mode"] != "deterministic" {
		t.Fatalf("unexpected compile result: %#v", compiled)
	}
	status, err := manager.Status(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	if status.InternalCount != 2 || status.InternalRecursion != 0 {
		t.Fatalf("unexpected internal observation counters: %#v", status)
	}
	events, err := manager.Store().LoadEvents(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.Internal && event.ParentActionID != actionID {
			t.Fatalf("internal observation lost parent action: %#v", event)
		}
	}
}

func TestRecordedWrongWindowGuardStopsBeforeClick(t *testing.T) {
	manager, _ := recorder.NewManager(t.TempDir())
	fake := &recordingRuntime{fakeRuntime: &fakeRuntime{activeWindowResult: map[string]any{"title": "Notes", "pid": float64(9), "isForeground": true}}}
	srv := NewServerWithRecorder(fake, manager)
	started := callToolPayload(t, srv, "tm_recorder_start", map[string]any{"goal": "guard", "observationPolicy": "standard"})
	sessionID := started["recordingSessionId"].(string)
	payload := callToolPayload(t, srv, "tm_click", map[string]any{
		"x": 10.0, "y": 10.0, "expectedWindowTitle": "Calculator", "recordingSessionId": sessionID,
	})
	if payload["ok"] != false || fake.lastClickArgs != nil {
		t.Fatalf("wrong-window action was not blocked: payload=%#v click=%#v", payload, fake.lastClickArgs)
	}
}
