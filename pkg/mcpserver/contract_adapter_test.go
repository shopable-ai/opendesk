package mcpserver

import (
	"errors"
	"opendesk/automation"
	"testing"
	"time"
)

func TestFindTargetNormalizesRuntimeOCRLineShape(t *testing.T) {
	fake := &fakeRuntime{ocrResult: map[string]any{
		"text": "7",
		"lines": []automation.VisionLine{{
			Text:       "7",
			Confidence: 0.98,
			BBox:       automation.VisionBBox{X: 10, Y: 20, Width: 30, Height: 40},
		}},
	}}

	payload := callToolPayload(t, NewServer(fake), "tm_find_target", map[string]any{
		"target_text": "7",
		"strategy":    "ocr",
	})
	candidate := mustMapField(t, payload, "bestCandidate")
	assertCandidateGeometry(t, candidate, 10, 20, 30, 40, 25, 40)
	if candidate["source"] != "ocr_line" || candidate["confidence"] != 0.98 {
		t.Fatalf("expected OCR source/confidence from runtime shape, got %#v", candidate)
	}
}

func TestFindTargetNormalizesRuntimeDetectUIShape(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{
		"elements": []map[string]any{{
			"role":       "button",
			"text":       "7",
			"bbox":       automation.VisionBBox{X: 100, Y: 200, Width: 50, Height: 60},
			"score":      0.97,
			"clickPoint": map[string]int{"x": 125, "y": 230},
		}},
	}}

	payload := callToolPayload(t, NewServer(fake), "tm_find_target", map[string]any{
		"target_text": "7",
		"strategy":    "detect_ui",
	})
	candidate := mustMapField(t, payload, "bestCandidate")
	assertCandidateGeometry(t, candidate, 100, 200, 50, 60, 125, 230)
	if candidate["source"] != "detect_ui" || candidate["confidence"] != 0.97 {
		t.Fatalf("expected detect-ui source/score from runtime shape, got %#v", candidate)
	}
}

func TestFindTargetNormalizesRuntimeLayoutShape(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{
		"regions": []map[string]any{{
			"id":         "region_07",
			"role":       "layout_region",
			"label":      "Region 07",
			"bbox":       map[string]any{"x": 40, "y": 80, "width": 100, "height": 120},
			"center":     map[string]any{"x": 90, "y": 140},
			"confidence": 0.88,
		}},
	}}

	payload := callToolPayload(t, NewServer(fake), "tm_find_target", map[string]any{
		"target_text": "Region 07",
		"strategy":    "layout",
	})
	candidate := mustMapField(t, payload, "bestCandidate")
	assertCandidateGeometry(t, candidate, 40, 80, 100, 120, 90, 140)
	if candidate["source"] != "layout" || candidate["regionId"] != "region_07" {
		t.Fatalf("expected layout source/region id from runtime shape, got %#v", candidate)
	}
}

func TestPreviewAdaptersUseRuntimeGeometryWithoutExecuting(t *testing.T) {
	t.Run("detect ui", func(t *testing.T) {
		fake := &fakeRuntime{detectUIResult: map[string]any{
			"elements": []map[string]any{{
				"text":       "7",
				"bbox":       automation.VisionBBox{X: 100, Y: 200, Width: 50, Height: 60},
				"score":      0.97,
				"clickPoint": map[string]int{"x": 125, "y": 230},
			}},
		}}
		payload := callToolPayload(t, NewServer(fake), "tm_click_text", map[string]any{
			"target_text": "7",
			"previewOnly": true,
		})
		if payload["executed"] != false || payload["previewOnly"] != true {
			t.Fatalf("expected safe detect-ui preview, got %#v", payload)
		}
		if fake.lastClickArgs != nil {
			t.Fatalf("preview unexpectedly executed a click: %#v", fake.lastClickArgs)
		}
	})

	t.Run("layout", func(t *testing.T) {
		fake := &fakeRuntime{analyzeLayoutResult: map[string]any{
			"regions": []map[string]any{{
				"id":     "region_07",
				"label":  "Region 07",
				"bbox":   map[string]any{"x": 40, "y": 80, "width": 100, "height": 120},
				"center": map[string]any{"x": 90, "y": 140},
			}},
		}}
		payload := callToolPayload(t, NewServer(fake), "tm_click_region", map[string]any{
			"regionId":    "region_07",
			"previewOnly": true,
		})
		if payload["executed"] != false || payload["previewOnly"] != true {
			t.Fatalf("expected safe layout preview, got %#v", payload)
		}
		if fake.lastClickArgs != nil {
			t.Fatalf("preview unexpectedly executed a click: %#v", fake.lastClickArgs)
		}
	})
}

func TestScreenshotSchemaMatchesRuntimeContractAndForwardsOptions(t *testing.T) {
	var screenshot Tool
	for _, tool := range builtinTools() {
		if tool.Name == "tm_screenshot" {
			screenshot = tool
			break
		}
	}
	if screenshot.Name == "" {
		t.Fatal("tm_screenshot is not registered")
	}
	properties := screenshot.InputSchema["properties"].(map[string]any)
	assertStringSet(t, properties["target"].(map[string]any)["enum"].([]string), []string{"screen", "activeWindow"})
	assertStringSet(t, properties["returnType"].(map[string]any)["enum"].([]string), []string{"base64", "bytes", "path", "object", "none"})

	fake := &fakeRuntime{screenshotResult: map[string]any{"path": "/tmp/shot.png"}}
	payload := callToolPayload(t, NewServer(fake), "tm_screenshot", map[string]any{
		"target":     "activeWindow",
		"returnType": "path",
		"path":       "/tmp/shot.png",
	})
	if payload["path"] != "/tmp/shot.png" {
		t.Fatalf("unexpected screenshot payload: %#v", payload)
	}
	if fake.lastScreenshotOpts["target"] != "activeWindow" || fake.lastScreenshotOpts["returnType"] != "path" {
		t.Fatalf("expected screenshot options to reach runtime unchanged, got %#v", fake.lastScreenshotOpts)
	}
}

func TestEveryGuardBlockDeclaresExecutedFalse(t *testing.T) {
	srv := NewServer(&fakeRuntime{activeWindowResult: map[string]any{"title": "TextEdit"}})
	windowGuard, guarded, err := srv.guardExpectedWindow(map[string]any{"expectedWindowTitle": "Calculator"})
	if err != nil || !guarded {
		t.Fatalf("expected window guard, guarded=%v err=%v", guarded, err)
	}

	_, revalidationGuard, err := NewServer(&fakeRuntime{ocrResult: map[string]any{}}).revalidateCandidate(
		map[string]any{"strategy": "ocr"},
		map[string]any{"text": "7"},
	)
	if err != nil {
		t.Fatalf("revalidation returned error: %v", err)
	}

	guards := []map[string]any{
		windowGuard,
		guardExpectedTargetText(map[string]any{"expectedTargetText": "7"}, map[string]any{"text": "8"}),
		guardCandidateFreshness(map[string]any{"capturedAt": "not-a-time", "staleAfterMs": 1}),
		guardCandidateFreshness(map[string]any{"capturedAt": time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano), "staleAfterMs": 1}),
		guardCandidateAmbiguity(map[string]any{}, map[string]any{"ambiguous": true}),
		revalidationGuard,
		externalBlockerPayload("ocr", "ocr", errors.New("PADDLE_OCR_ENDPOINT is required for paddle provider")),
	}
	for _, guard := range guards {
		if guard == nil || guard["guard"] == nil {
			t.Fatalf("expected guard payload, got %#v", guard)
		}
		if executed, exists := guard["executed"]; !exists || executed != false {
			t.Fatalf("guard %v must declare executed=false, got %#v", guard["guard"], guard)
		}
	}
}

func TestRawActionsFocusFailureReturnsGuardWithoutExecuting(t *testing.T) {
	tests := []struct {
		name string
		tool string
		args map[string]any
	}{
		{name: "type", tool: "tm_type", args: map[string]any{"text": "guard-token"}},
		{name: "press key", tool: "tm_press_key", args: map[string]any{"key": "Backspace"}},
		{name: "scroll", tool: "tm_scroll", args: map[string]any{"deltaY": 9, "steps": 3, "x": 120, "y": 240}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.args["expectedWindowTitle"] = "Runtime API Test Lab"
			tt.args["focusExpectedWindow"] = true
			fake := &fakeRuntime{focusWindowErr: errors.New("focus timed out")}
			payload := callToolPayload(t, NewServer(fake), tt.tool, tt.args)
			if payload["ok"] != false || payload["executed"] != false || payload["guard"] != "expectedWindowTitle" {
				t.Fatalf("expected structured focus guard, got %#v", payload)
			}
			if payload["focusedExpectedWindow"] != false || payload["focusError"] != "focus timed out" {
				t.Fatalf("expected failed focus evidence, got %#v", payload)
			}
			assertNoRawAction(t, fake)
			if len(fake.events) != 1 || fake.events[0] != "focus_window" {
				t.Fatalf("expected only focus attempt, got %#v", fake.events)
			}
		})
	}
}

func TestRawActionsVerifyExactActiveWindowAfterFocus(t *testing.T) {
	tests := []struct {
		name string
		tool string
		args map[string]any
	}{
		{name: "type", tool: "tm_type", args: map[string]any{"text": "guard-token"}},
		{name: "press key", tool: "tm_press_key", args: map[string]any{"key": "Backspace"}},
		{name: "scroll", tool: "tm_scroll", args: map[string]any{"deltaY": 9, "steps": 3, "x": 120, "y": 240}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.args["expectedWindowTitle"] = "Runtime API Test Lab"
			tt.args["focusExpectedWindow"] = true
			fake := &fakeRuntime{activeWindowResult: map[string]any{"title": "Codex"}}
			payload := callToolPayload(t, NewServer(fake), tt.tool, tt.args)
			if payload["ok"] != false || payload["executed"] != false || payload["guard"] != "expectedWindowTitle" {
				t.Fatalf("expected exact-title guard, got %#v", payload)
			}
			if payload["expectedWindowTitle"] != "Runtime API Test Lab" || payload["actualWindowTitle"] != "Codex" || payload["focusedExpectedWindow"] != true {
				t.Fatalf("expected post-focus identity evidence, got %#v", payload)
			}
			assertNoRawAction(t, fake)
			if len(fake.events) != 2 || fake.events[0] != "focus_window" || fake.events[1] != "get_active_window" {
				t.Fatalf("expected focus then exact-title check, got %#v", fake.events)
			}
		})
	}
}

func TestRawActionsAtomicallyFocusVerifyAndExecute(t *testing.T) {
	tests := []struct {
		name       string
		tool       string
		args       map[string]any
		wantEvents []string
		assertCall func(*testing.T, *fakeRuntime)
	}{
		{
			name:       "type",
			tool:       "tm_type",
			args:       map[string]any{"text": "guard-token"},
			wantEvents: []string{"focus_window", "get_active_window", "type"},
			assertCall: func(t *testing.T, fake *fakeRuntime) {
				if fake.lastTypeArgs == nil || fake.lastTypeArgs["text"] != "guard-token" {
					t.Fatalf("type was not dispatched: %#v", fake.lastTypeArgs)
				}
			},
		},
		{
			name:       "press key",
			tool:       "tm_press_key",
			args:       map[string]any{"key": "Backspace"},
			wantEvents: []string{"focus_window", "get_active_window", "press_key"},
			assertCall: func(t *testing.T, fake *fakeRuntime) {
				if fake.lastPressKey != "Backspace" {
					t.Fatalf("key was not dispatched: %q", fake.lastPressKey)
				}
			},
		},
		{
			name:       "scroll",
			tool:       "tm_scroll",
			args:       map[string]any{"deltaY": 9, "steps": 3, "x": 120, "y": 240},
			wantEvents: []string{"focus_window", "get_active_window", "move", "scroll"},
			assertCall: func(t *testing.T, fake *fakeRuntime) {
				if fake.lastMoveArgs == nil || fake.lastMoveArgs["x"] != float64(120) || fake.lastMoveArgs["y"] != float64(240) {
					t.Fatalf("pointer move was not dispatched: %#v", fake.lastMoveArgs)
				}
				if fake.lastScrollArgs == nil || fake.lastScrollArgs["deltaY"] != 9 {
					t.Fatalf("scroll was not dispatched: %#v", fake.lastScrollArgs)
				}
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.args["expectedWindowTitle"] = "Runtime API Test Lab"
			tt.args["focusExpectedWindow"] = true
			fake := &fakeRuntime{activeWindowResult: map[string]any{"title": "Runtime API Test Lab"}}
			payload := callToolPayload(t, NewServer(fake), tt.tool, tt.args)
			if payload["ok"] != true || payload["executed"] != true || payload["focusedExpectedWindow"] != true {
				t.Fatalf("expected explicit successful execution evidence, got %#v", payload)
			}
			if len(fake.events) != len(tt.wantEvents) {
				t.Fatalf("unexpected event sequence: got %#v want %#v", fake.events, tt.wantEvents)
			}
			for i, want := range tt.wantEvents {
				if fake.events[i] != want {
					t.Fatalf("unexpected event sequence: got %#v want %#v", fake.events, tt.wantEvents)
				}
			}
			tt.assertCall(t, fake)
		})
	}
}

func TestRawActionsFailClosedWhenFocusTitleOrScrollPointIsIncomplete(t *testing.T) {
	fake := &fakeRuntime{}
	payload := callToolPayload(t, NewServer(fake), "tm_type", map[string]any{
		"text":                "guard-token",
		"focusExpectedWindow": true,
	})
	if payload["ok"] != false || payload["executed"] != false || payload["guard"] != "expectedWindowTitle" {
		t.Fatalf("expected missing focus title to fail closed, got %#v", payload)
	}
	assertNoRawAction(t, fake)
	if len(fake.events) != 0 {
		t.Fatalf("missing focus title must not touch desktop runtime, got %#v", fake.events)
	}

	fake = &fakeRuntime{}
	_, err := NewServer(fake).callTool("tm_scroll", map[string]any{"deltaY": 9, "x": 120})
	if err == nil || err.Error() != "x and y must be provided together" {
		t.Fatalf("expected incomplete scroll point error, got %v", err)
	}
	assertNoRawAction(t, fake)
	if len(fake.events) != 0 {
		t.Fatalf("incomplete scroll point must be rejected before focus/action, got %#v", fake.events)
	}
}

func assertNoRawAction(t *testing.T, fake *fakeRuntime) {
	t.Helper()
	if fake.lastTypeArgs != nil || fake.lastPressKey != "" || fake.lastMoveArgs != nil || fake.lastScrollArgs != nil {
		t.Fatalf("raw desktop action unexpectedly executed: type=%#v key=%q move=%#v scroll=%#v", fake.lastTypeArgs, fake.lastPressKey, fake.lastMoveArgs, fake.lastScrollArgs)
	}
}

func callToolPayload(t *testing.T, srv *Server, name string, arguments map[string]any) map[string]any {
	t.Helper()
	payload, err := srv.callTool(name, arguments)
	if err != nil {
		t.Fatalf("callTool(%s) returned error: %v", name, err)
	}
	return payload
}

func assertCandidateGeometry(t *testing.T, candidate map[string]any, x, y, width, height, clickX, clickY float64) {
	t.Helper()
	bounds := mustMapField(t, candidate, "bounds")
	clickPoint := mustMapField(t, candidate, "clickPoint")
	if bounds["x"] != x || bounds["y"] != y || bounds["width"] != width || bounds["height"] != height {
		t.Fatalf("unexpected candidate bounds: %#v", candidate)
	}
	if clickPoint["x"] != clickX || clickPoint["y"] != clickY {
		t.Fatalf("unexpected candidate click point: %#v", candidate)
	}
}

func assertStringSet(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("unexpected values: got=%v want=%v", got, want)
	}
	for _, value := range want {
		if !containsString(got, value) {
			t.Fatalf("missing %q in %v", value, got)
		}
	}
}
