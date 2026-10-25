package mcpserver

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func policyCall(t *testing.T, server *Server, name string, args map[string]any) Response {
	t.Helper()
	return server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: mustRawMap(t, map[string]any{"name": name, "arguments": args})})
}

func TestPolicyVersionNegotiationAndAnnotationCompatibility(t *testing.T) {
	for requested, expected := range map[string]string{
		"2024-11-05": "2024-11-05", "2025-06-18": "2025-06-18",
		"2025-11-25": "2025-11-25", "2025-03-26": LatestProtocolVersion,
		"2026-07-28": LatestProtocolVersion, "unknown": LatestProtocolVersion,
	} {
		t.Run(requested, func(t *testing.T) {
			server := NewServer(&fakeRuntime{})
			response := server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "initialize", Params: mustRawMap(t, map[string]any{"protocolVersion": requested})})
			if response.Error != nil || mustMapResult(t, response.Result)["protocolVersion"] != expected {
				t.Fatalf("negotiation: %+v", response)
			}
			response = server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`2`), Method: "tools/list"})
			for _, raw := range mustMapResult(t, response.Result)["tools"].([]any) {
				tool := raw.(map[string]any)
				_, present := tool["annotations"]
				if present != (expected != "2024-11-05") {
					t.Fatalf("incompatible annotations: %#v", tool)
				}
			}
		})
	}
	for _, params := range []string{`{}`, `{"protocolVersion":true}`, `null`, `[]`} {
		response := NewServer(nil).Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "initialize", Params: json.RawMessage(params)})
		if response.Error == nil || response.Error.Code != ErrCodeInvalidParams {
			t.Fatalf("invalid initialize accepted: %s", params)
		}
	}
}

func TestPolicyAnnotationsDescribeFullModeEffects(t *testing.T) {
	server := NewServer(nil)
	for name, tool := range server.tools {
		encoded, err := json.Marshal(tool)
		if err != nil {
			t.Fatal(err)
		}
		var row map[string]any
		if err := json.Unmarshal(encoded, &row); err != nil {
			t.Fatal(err)
		}
		annotations, ok := row["annotations"].(map[string]any)
		if !ok || len(annotations) != 4 {
			t.Fatalf("incomplete annotations for %s: %s", name, encoded)
		}
	}
	for _, name := range []string{"tm_screenshot", "tm_inspect_desktop", "tm_annotate_regions", "tm_capture_and_annotate", "tm_click", "tm_type", "tm_recorder_status", "tm_browser_act"} {
		if server.tools[name].Annotations.ReadOnlyHint {
			t.Fatalf("writable tool marked read-only: %s", name)
		}
	}
	for _, name := range []string{"tm_status", "tm_list_windows", "tm_analyze_layout", "tm_ocr", "tm_browser_read"} {
		if !server.tools[name].Annotations.ReadOnlyHint {
			t.Fatalf("read tool missing hint: %s", name)
		}
	}
	if !server.tools["tm_ocr"].Annotations.OpenWorldHint || !server.tools["tm_click"].Annotations.DestructiveHint {
		t.Fatal("provider/UI risk hidden")
	}
}

func TestPolicyReadOnlyListAndCallFailClosed(t *testing.T) {
	server := NewServerWithOptions(nil, ServerOptions{ReadOnly: true})
	response := server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/list"})
	tools := mustMapResult(t, response.Result)["tools"].([]any)
	want := map[string]bool{"tm_status": true, "tm_permissions": true, "tm_list_windows": true, "tm_get_active_window": true, "tm_list_displays": true, "tm_wait_for_window": true, "tm_screenshot": true}
	if len(tools) != len(want) {
		t.Fatalf("unexpected tool surface: %#v", tools)
	}
	for _, raw := range tools {
		tool := raw.(map[string]any)
		if !want[tool["name"].(string)] || tool["annotations"].(map[string]any)["readOnlyHint"] != true {
			t.Fatalf("unexpected read-only tool: %#v", tool)
		}
	}
	// Require the policy denial message, rather than argument validation errors.
	// A nil runtime also catches any accidental dispatch.
	for _, tool := range append(builtinTools(), browserTools()...) {
		if want[tool.Name] {
			continue
		}
		response := policyCall(t, server, tool.Name, map[string]any{})
		if response.Error == nil || response.Error.Message != "tool not found" {
			t.Fatalf("blocked tool accepted: %s: %+v", tool.Name, response)
		}
	}
	// Metadata tampering cannot authorize a new tool.
	server.tools["future_tool"] = Tool{Name: "future_tool", Annotations: &ToolAnnotations{ReadOnlyHint: true}}
	if policyCall(t, server, "future_tool", nil).Error == nil {
		t.Fatal("annotations bypassed policy")
	}
}

func TestPolicyReadOnlyScreenshotRejectsFileWritesAndAliases(t *testing.T) {
	fake := &fakeRuntime{screenshotResult: "base64-image"}
	server := NewServerWithOptions(fake, ServerOptions{ReadOnly: true})
	for _, args := range []map[string]any{
		{"path": "/must-not-write", "returnType": "base64"}, {"path": ""},
		{"Path": "/must-not-write"}, {"outputPath": "/must-not-write"},
		{"returnType": "path"}, {"returnType": "object"}, {"ReturnType": "object"},
		{"return_type": "path"}, {"returntype": "object"},
		{"recordingSessionId": "session"}, {"options": map[string]any{"path": "/must-not-write"}},
	} {
		if response := policyCall(t, server, "tm_screenshot", args); response.Error == nil {
			t.Fatalf("unsafe args accepted: %#v", args)
		}
		if fake.lastScreenshotOpts != nil {
			t.Fatal("unsafe screenshot reached runtime")
		}
	}
	if response := policyCall(t, server, "tm_screenshot", map[string]any{}); response.Error != nil {
		t.Fatal(response.Error)
	}
	if fake.lastScreenshotOpts["returnType"] != "base64" {
		t.Fatalf("screenshot not in memory: %#v", fake.lastScreenshotOpts)
	}
	for _, representation := range []string{"base64", "bytes", "none"} {
		if response := policyCall(t, server, "tm_screenshot", map[string]any{"returnType": representation}); response.Error != nil {
			t.Fatalf("safe screenshot representation rejected: %s: %+v", representation, response)
		}
	}
	// Constructing a read-only server must not narrow another full-mode server.
	full := NewServer(fake)
	if response := policyCall(t, full, "tm_screenshot", map[string]any{"path": "/fake-only", "returnType": "object"}); response.Error != nil {
		t.Fatal(response.Error)
	}
}

func TestPolicyReadOnlyQueriesRemainUsable(t *testing.T) {
	fake := &fakeRuntime{
		statusResult:       map[string]any{"status": "ok"},
		permissionsResult:  map[string]any{"ok": true},
		activeWindowResult: map[string]any{"title": "Fixture"},
		windowsResult:      []map[string]any{{"title": "Fixture"}},
		displaysResult:     []map[string]any{{"width": 800}},
	}
	server := NewServerWithOptions(fake, ServerOptions{ReadOnly: true})
	for _, name := range []string{"tm_status", "tm_permissions", "tm_list_windows", "tm_get_active_window", "tm_list_displays", "tm_wait_for_window"} {
		args := map[string]any{}
		if name == "tm_wait_for_window" {
			args["title"] = "Fixture"
		}
		response := policyCall(t, server, name, args)
		if response.Error != nil || mustMapResult(t, response.Result)["isError"] == true {
			t.Fatalf("read-only query failed: %s: %+v", name, response)
		}
	}
	if fake.lastFocusWindow != "" || fake.lastClickArgs != nil || fake.lastTypeArgs != nil || fake.lastScreenshotOpts != nil {
		t.Fatal("metadata query invoked an action or capture")
	}
}

func TestPolicyInvalidIDsAndNotificationsCannotDispatch(t *testing.T) {
	params := json.RawMessage(`{"name":"tm_click","arguments":{"x":1,"y":2}}`)
	for _, id := range []string{`null`, `true`, `false`, `{}`, `[]`, `1.5`, `1e-999999999`, `1.0000000000000001`, `"broken`, `1 2`} {
		response := NewServer(nil).Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(id), Method: "tools/call", Params: params})
		if response.Error == nil || response.Error.Code != ErrCodeInvalidRequest || string(response.ID) != "null" {
			t.Fatalf("invalid ID %s: %+v", id, response)
		}
	}
	for _, id := range []string{`0`, `-2`, `""`, `"request"`, `9007199254740993`, `1.0`, `1e2`, `1e999999999`, `0e-999999999`, `1200e-2`, `1.25e+2`} {
		response := NewServer(nil).Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(id), Method: "ping"})
		if response.Error != nil || string(response.ID) != id {
			t.Fatalf("valid ID %s: %+v", id, response)
		}
	}
	for _, method := range []string{"tools/call", "initialize", "notifications/unknown", "notifications/initialized"} {
		response := NewServer(nil).Handle(Request{JSONRPC: "2.0", Method: method, Params: params})
		if response.JSONRPC != "" {
			t.Fatalf("notification produced response: %+v", response)
		}
	}
	var output bytes.Buffer
	input := `{"jsonrpc":"2.0","method":"tools/call","params":` + string(params) + "}\n" +
		`{"jsonrpc":"2.0","method":"notifications/unknown"}` + "\n" +
		`{"jsonrpc":"2.0","id":true,"method":"tools/call","params":` + string(params) + "}\n" +
		`{"jsonrpc":"2.0","id":"alive","method":"ping"}` + "\n"
	if err := NewServer(nil).ServeStream(strings.NewReader(input), &output); err != nil {
		t.Fatal(err)
	}
	if lines := strings.Split(strings.TrimSpace(output.String()), "\n"); len(lines) != 2 || !strings.Contains(lines[0], `"id":null`) || !strings.Contains(lines[1], `"id":"alive"`) {
		t.Fatalf("unexpected stream output: %s", output.String())
	}
}

func TestPolicyExecutionErrorsUseMCPResult(t *testing.T) {
	for _, fake := range []*fakeRuntime{
		{statusErr: errors.New("runtime unavailable")},
		{statusResult: map[string]any{"ok": false, "reason": "blocked"}},
		{statusResult: map[string]any{"error": map[string]any{"code": "BLOCKED"}}},
	} {
		response := policyCall(t, NewServer(fake), "tm_status", nil)
		if response.Error != nil {
			t.Fatalf("execution failure became protocol error: %+v", response)
		}
		result := mustMapResult(t, response.Result)
		if result["isError"] != true || len(mustCallContent(t, result)) != 1 {
			t.Fatalf("failure missing MCP isError: %#v", result)
		}
	}
	if response := policyCall(t, NewServer(nil), "tm_click", map[string]any{}); response.Error == nil || response.Error.Code != ErrCodeInvalidParams {
		t.Fatalf("malformed call must remain protocol error: %+v", response)
	}
}
