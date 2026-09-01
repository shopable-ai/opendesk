package mcpserver

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeRuntime struct {
	statusResult          map[string]any
	statusErr             error
	permissionsResult     map[string]any
	permissionsErr        error
	windowsResult         []map[string]any
	windowsResults        [][]map[string]any
	windowsErr            error
	activeWindowResult    map[string]any
	activeWindowResults   []map[string]any
	activeWindowErr       error
	focusWindowErr        error
	permissionFlowResult  map[string]any
	permissionFlowErr     error
	displaysResult        []map[string]any
	displaysErr           error
	screenshotResult      any
	screenshotErr         error
	ocrResult             map[string]any
	ocrErr                error
	detectUIResult        map[string]any
	detectUIErr           error
	analyzeLayoutResult   map[string]any
	analyzeLayoutErr      error
	annotateRegionsResult map[string]any
	annotateRegionsErr    error
	clickErr              error
	typeErr               error
	pressKeyErr           error
	scrollErr             error
	lastScreenshotOpts    map[string]any
	lastOCRArgs           map[string]any
	lastDetectUIArgs      map[string]any
	lastAnalyzeArgs       map[string]any
	lastAnnotateArgs      map[string]any
	lastClickArgs         map[string]any
	lastTypeArgs          map[string]any
	lastPressKey          string
	lastMoveArgs          map[string]any
	lastScrollArgs        map[string]any
	lastFocusWindow       string
	lastPermissionArgs    map[string]any
	listWindowsCalls      int
	getActiveWindowCalls  int
	ocrCalls              int
	detectUICalls         int
	analyzeLayoutCalls    int
	events                []string
}

func (f *fakeRuntime) Status() (map[string]any, error) { return f.statusResult, f.statusErr }
func (f *fakeRuntime) Permissions() (map[string]any, error) {
	return f.permissionsResult, f.permissionsErr
}
func (f *fakeRuntime) ListWindows() ([]map[string]any, error) {
	f.listWindowsCalls++
	if len(f.windowsResults) > 0 {
		idx := f.listWindowsCalls - 1
		if idx >= len(f.windowsResults) {
			idx = len(f.windowsResults) - 1
		}
		return f.windowsResults[idx], f.windowsErr
	}
	return f.windowsResult, f.windowsErr
}
func (f *fakeRuntime) GetActiveWindow() (map[string]any, error) {
	f.events = append(f.events, "get_active_window")
	f.getActiveWindowCalls++
	if len(f.activeWindowResults) > 0 {
		idx := f.getActiveWindowCalls - 1
		if idx >= len(f.activeWindowResults) {
			idx = len(f.activeWindowResults) - 1
		}
		return f.activeWindowResults[idx], f.activeWindowErr
	}
	return f.activeWindowResult, f.activeWindowErr
}
func (f *fakeRuntime) FocusWindow(title string) error {
	f.events = append(f.events, "focus_window")
	f.lastFocusWindow = title
	return f.focusWindowErr
}
func (f *fakeRuntime) RequestPermissions(args map[string]any) (map[string]any, error) {
	f.lastPermissionArgs = args
	return f.permissionFlowResult, f.permissionFlowErr
}
func (f *fakeRuntime) GetDisplays() ([]map[string]any, error) { return f.displaysResult, f.displaysErr }
func (f *fakeRuntime) Screenshot(args map[string]any) (any, error) {
	f.lastScreenshotOpts = args
	return f.screenshotResult, f.screenshotErr
}
func (f *fakeRuntime) OCR(args map[string]any) (map[string]any, error) {
	f.lastOCRArgs = args
	f.ocrCalls++
	if rawRows, ok := args["_test_ocr_sequence"].([]any); ok && len(rawRows) > 0 {
		idx := f.ocrCalls - 1
		if idx >= len(rawRows) {
			idx = len(rawRows) - 1
		}
		if row, ok := rawRows[idx].(map[string]any); ok {
			return row, f.ocrErr
		}
	}
	if rows, ok := args["_test_ocr_sequence"].([]map[string]any); ok && len(rows) > 0 {
		idx := f.ocrCalls - 1
		if idx >= len(rows) {
			idx = len(rows) - 1
		}
		return rows[idx], f.ocrErr
	}
	return f.ocrResult, f.ocrErr
}
func (f *fakeRuntime) DetectUI(args map[string]any) (map[string]any, error) {
	f.lastDetectUIArgs = args
	f.detectUICalls++
	return f.detectUIResult, f.detectUIErr
}
func (f *fakeRuntime) AnalyzeLayout(args map[string]any) (map[string]any, error) {
	f.lastAnalyzeArgs = args
	f.analyzeLayoutCalls++
	return f.analyzeLayoutResult, f.analyzeLayoutErr
}
func (f *fakeRuntime) AnnotateRegions(args map[string]any) (map[string]any, error) {
	f.lastAnnotateArgs = args
	return f.annotateRegionsResult, f.annotateRegionsErr
}
func (f *fakeRuntime) Click(args map[string]any) error { f.lastClickArgs = args; return f.clickErr }
func (f *fakeRuntime) Type(args map[string]any) error {
	f.events = append(f.events, "type")
	f.lastTypeArgs = args
	return f.typeErr
}
func (f *fakeRuntime) PressKey(key string) error {
	f.events = append(f.events, "press_key")
	f.lastPressKey = key
	return f.pressKeyErr
}
func (f *fakeRuntime) Move(args map[string]any) error {
	f.events = append(f.events, "move")
	f.lastMoveArgs = args
	return nil
}
func (f *fakeRuntime) Scroll(args map[string]any) error {
	f.events = append(f.events, "scroll")
	f.lastScrollArgs = args
	return f.scrollErr
}

func TestInitializeReturnsServerInfoAndCapabilities(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "initialize", Params: mustRawMap(t, map[string]any{"protocolVersion": ProtocolVersion})})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	result := mustMapResult(t, resp.Result)
	if result["protocolVersion"] != ProtocolVersion {
		t.Fatalf("unexpected protocolVersion: %#v", result["protocolVersion"])
	}
	caps, ok := result["capabilities"].(map[string]any)
	if !ok {
		t.Fatalf("expected capabilities map, got %#v", result["capabilities"])
	}
	if _, ok := caps["tools"]; !ok {
		t.Fatalf("expected tools capability, got %#v", caps)
	}
}

func TestToolsListIncludesCorePeekabooStyleCapabilities(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`2`), Method: "tools/list"})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	result := mustMapResult(t, resp.Result)
	tools, ok := result["tools"].([]any)
	if !ok {
		t.Fatalf("expected tools array, got %#v", result["tools"])
	}
	if len(tools) < 8 {
		t.Fatalf("expected multiple tools, got %d", len(tools))
	}
	assertToolPresent(t, tools, "tm_screenshot")
	assertToolPresent(t, tools, "tm_permissions")
	assertToolPresent(t, tools, "tm_list_windows")
	assertToolPresent(t, tools, "tm_get_active_window")
	assertToolPresent(t, tools, "tm_focus_window")
	assertToolPresent(t, tools, "tm_wait_for_window")
	assertToolPresent(t, tools, "tm_focus_and_type")
	assertToolPresent(t, tools, "tm_inspect_desktop")
	assertToolPresent(t, tools, "tm_find_target")
	assertToolPresent(t, tools, "tm_act_on_target")
	assertToolPresent(t, tools, "tm_click_region")
	assertToolPresent(t, tools, "tm_click_text")
}

func TestToolsListDoesNotExposeNativeExtensionRegistryOrExecution(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`20`), Method: "tools/list"})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	encoded, err := json.Marshal(resp.Result)
	if err != nil {
		t.Fatal(err)
	}
	lower := strings.ToLower(string(encoded))
	for _, forbidden := range []string{"nativeextensions", "nativeextension", "native_extension", "executable"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("MCP tool list exposed Native Extension capability %q: %s", forbidden, encoded)
		}
	}
}

func TestToolsCallCannotEnableNativeExtensionExecution(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "must-not-start")
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{
		JSONRPC: "2.0", ID: json.RawMessage(`23`), Method: "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name": "NativeExtensions.goBasic.hello",
			"arguments": map[string]any{
				"enableNativeExtensions": true,
				"nativeExtensionRoots":   []string{filepath.Dir(marker)},
				"executable":             marker,
				"extension":              "com.attacker.plugin",
				"wireMethod":             "attack",
				"protocol":               "attacker-protocol",
				"version":                999,
				"discoveryRoot":          filepath.Dir(marker),
			},
		}),
	})
	if resp.Error == nil || resp.Error.Message != "tool not found" {
		t.Fatalf("MCP accepted Native Extension execution: %#v", resp)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("MCP created or started the malicious executable marker: %v", err)
	}
}

func TestToolsListSchemasExposeRequiredFieldsAndEnums(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`21`), Method: "tools/list"})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	result := mustMapResult(t, resp.Result)
	tools, ok := result["tools"].([]any)
	if !ok {
		t.Fatalf("expected tools array, got %#v", result["tools"])
	}
	waitTool := mustToolByName(t, tools, "tm_wait_for_window")
	required := mustStringSliceField(t, waitTool["inputSchema"], "required")
	if !containsString(required, "title") {
		t.Fatalf("expected tm_wait_for_window required fields to include title, got %#v", required)
	}
	props := mustMapField(t, waitTool["inputSchema"], "properties")
	matchMode := mustMapField(t, props, "matchMode")
	if !containsString(mustStringSliceField(t, matchMode, "enum"), "contains") {
		t.Fatalf("expected tm_wait_for_window matchMode enum, got %#v", matchMode)
	}
	clickRegion := mustToolByName(t, tools, "tm_click_region")
	crProps := mustMapField(t, clickRegion["inputSchema"], "properties")
	button := mustMapField(t, crProps, "button")
	if !containsString(mustStringSliceField(t, button, "enum"), "right") {
		t.Fatalf("expected tm_click_region button enum, got %#v", button)
	}
	findTarget := mustToolByName(t, tools, "tm_find_target")
	ftProps := mustMapField(t, findTarget["inputSchema"], "properties")
	strategy := mustMapField(t, ftProps, "strategy")
	if !containsString(mustStringSliceField(t, strategy, "enum"), "layout") {
		t.Fatalf("expected tm_find_target strategy enum, got %#v", strategy)
	}
	if _, ok := ftProps["staleAfterMs"]; !ok {
		t.Fatalf("expected tm_find_target staleAfterMs schema, got %#v", ftProps)
	}
	actOnTarget := mustToolByName(t, tools, "tm_act_on_target")
	aotRequired := mustStringSliceField(t, actOnTarget["inputSchema"], "required")
	if !containsString(aotRequired, "target") || !containsString(aotRequired, "action") {
		t.Fatalf("expected tm_act_on_target required fields, got %#v", aotRequired)
	}
	aotProps := mustMapField(t, actOnTarget["inputSchema"], "properties")
	action := mustMapField(t, aotProps, "action")
	if !containsString(mustStringSliceField(t, action, "enum"), "focus") {
		t.Fatalf("expected tm_act_on_target action enum, got %#v", action)
	}
	if _, ok := aotProps["allowAmbiguous"]; !ok {
		t.Fatalf("expected tm_act_on_target allowAmbiguous schema, got %#v", aotProps)
	}
	focusExpected := mustMapField(t, aotProps, "focusExpectedWindow")
	if focusExpected["type"] != "boolean" {
		t.Fatalf("expected tm_act_on_target focusExpectedWindow boolean schema, got %#v", focusExpected)
	}
	target := mustMapField(t, aotProps, "target")
	targetProps := mustMapField(t, target, "properties")
	if _, ok := targetProps["clickPoint"]; !ok {
		t.Fatalf("expected tm_act_on_target target schema to expose clickPoint, got %#v", targetProps)
	}
	if _, ok := targetProps["capturedAt"]; !ok {
		t.Fatalf("expected tm_act_on_target target schema to expose capturedAt, got %#v", targetProps)
	}
	if _, ok := targetProps["ambiguous"]; !ok {
		t.Fatalf("expected tm_act_on_target target schema to expose ambiguous, got %#v", targetProps)
	}
	clickText := mustToolByName(t, tools, "tm_click_text")
	ctProps := mustMapField(t, clickText["inputSchema"], "properties")
	if _, ok := ctProps["dryRun"]; !ok {
		t.Fatalf("expected tm_click_text dryRun schema, got %#v", ctProps)
	}
	if _, ok := ctProps["expectedTargetText"]; !ok {
		t.Fatalf("expected tm_click_text expectedTargetText schema, got %#v", ctProps)
	}
	clickRegion = mustToolByName(t, tools, "tm_click_region")
	crProps = mustMapField(t, clickRegion["inputSchema"], "properties")
	if _, ok := crProps["previewOnly"]; !ok {
		t.Fatalf("expected tm_click_region previewOnly schema, got %#v", crProps)
	}
	for _, name := range []string{"tm_type", "tm_press_key", "tm_scroll"} {
		tool := mustToolByName(t, tools, name)
		properties := mustMapField(t, tool["inputSchema"], "properties")
		if mustMapField(t, properties, "expectedWindowTitle")["type"] != "string" {
			t.Fatalf("expected %s expectedWindowTitle string schema, got %#v", name, properties)
		}
		if mustMapField(t, properties, "focusExpectedWindow")["type"] != "boolean" {
			t.Fatalf("expected %s focusExpectedWindow boolean schema, got %#v", name, properties)
		}
	}
	scroll := mustToolByName(t, tools, "tm_scroll")
	scrollProps := mustMapField(t, scroll["inputSchema"], "properties")
	if mustMapField(t, scrollProps, "x")["type"] != "number" || mustMapField(t, scrollProps, "y")["type"] != "number" {
		t.Fatalf("expected tm_scroll numeric x/y schemas, got %#v", scrollProps)
	}
}

func TestToolsListWindowToolDescriptionsMarkLowLevelMetadataAsNonStableContract(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`22`), Method: "tools/list"})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	result := mustMapResult(t, resp.Result)
	tools, ok := result["tools"].([]any)
	if !ok {
		t.Fatalf("expected tools array, got %#v", result["tools"])
	}
	listWindows := mustToolByName(t, tools, "tm_list_windows")
	if !strings.Contains(listWindows["description"].(string), "metadata") {
		t.Fatalf("expected tm_list_windows description to mention metadata boundary, got %#v", listWindows["description"])
	}
	activeWindow := mustToolByName(t, tools, "tm_get_active_window")
	if !strings.Contains(activeWindow["description"].(string), "metadata") {
		t.Fatalf("expected tm_get_active_window description to mention metadata boundary, got %#v", activeWindow["description"])
	}
}

func TestToolsCallScreenshotDelegatesToRuntime(t *testing.T) {
	fake := &fakeRuntime{screenshotResult: map[string]any{"path": "/tmp/shot.png", "backend": "robotgo"}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`3`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_screenshot",
			"arguments": map[string]any{"path": "/tmp/shot.png", "target": "screen"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastScreenshotOpts["path"] != "/tmp/shot.png" {
		t.Fatalf("expected screenshot args to be forwarded, got %#v", fake.lastScreenshotOpts)
	}
	result := mustMapResult(t, resp.Result)
	content := mustCallContent(t, result)
	payload := mustJSONTextPayload(t, content)
	if payload["path"] != "/tmp/shot.png" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestToolsCallClickReturnsStructuredAck(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click",
			"arguments": map[string]any{"x": 12, "y": 34},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastClickArgs["x"].(float64) != 12 || fake.lastClickArgs["y"].(float64) != 34 {
		t.Fatalf("unexpected click args: %#v", fake.lastClickArgs)
	}
	result := mustMapResult(t, resp.Result)
	payload := mustJSONTextPayload(t, mustCallContent(t, result))
	if payload["ok"] != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
}

func TestToolsCallClickRejectsWhenExpectedWindowTitleDoesNotMatch(t *testing.T) {
	fake := &fakeRuntime{activeWindowResult: map[string]any{"title": "Slack"}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`401`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click",
			"arguments": map[string]any{"x": 12, "y": 34, "expectedWindowTitle": "WeChat"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false {
		t.Fatalf("expected guarded click to return ok=false, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute when window guard fails, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallFocusWindowDelegatesToRuntime(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`41`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_focus_window",
			"arguments": map[string]any{"title": "WeChat"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastFocusWindow != "WeChat" {
		t.Fatalf("expected focus title to be forwarded, got %#v", fake.lastFocusWindow)
	}
}

func TestToolsCallClickTextChainsDetectAndClick(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`42`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_text",
			"arguments": map[string]any{"target_text": "发送", "button": "right"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastClickArgs["x"].(float64) != 88 || fake.lastClickArgs["y"].(float64) != 44 {
		t.Fatalf("unexpected click_text forwarded coords: %#v", fake.lastClickArgs)
	}
	if fake.lastClickArgs["button"].(string) != "right" {
		t.Fatalf("unexpected click_text button: %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickTextDryRunReturnsPlanWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4201`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_text",
			"arguments": map[string]any{"target_text": "发送", "dryRun": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["dryRun"] != true {
		t.Fatalf("unexpected dry-run payload: %#v", payload)
	}
	if _, hasPreviewOnly := payload["previewOnly"]; hasPreviewOnly {
		t.Fatalf("expected dryRun payload not to set previewOnly, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute during dryRun, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickTextPreviewOnlyReturnsPreviewFlagWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`42015`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_text",
			"arguments": map[string]any{"target_text": "发送", "previewOnly": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["previewOnly"] != true {
		t.Fatalf("unexpected preview payload: %#v", payload)
	}
	if _, hasDryRun := payload["dryRun"]; hasDryRun {
		t.Fatalf("expected previewOnly payload not to set dryRun, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute during previewOnly, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickTextReturnsOkFalseWhenExpectedTargetTextDoesNotMatch(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "取消", "clickPoint": map[string]any{"x": float64(20), "y": float64(10)}}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4202`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_text",
			"arguments": map[string]any{"target_text": "发送", "expectedTargetText": "发送"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false {
		t.Fatalf("expected ok=false payload, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute when expectedTargetText mismatches, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallWaitForTextUsesOCRAndReturnsMatch(t *testing.T) {
	fake := &fakeRuntime{ocrResult: map[string]any{"text": "发送", "lines": []any{map[string]any{"text": "发送"}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`43`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_wait_for_text",
			"arguments": map[string]any{"target_text": "发送", "imagePath": "/tmp/shot.png", "timeoutMs": float64(1)},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastOCRArgs["imagePath"] != "/tmp/shot.png" {
		t.Fatalf("expected OCR to receive imagePath, got %#v", fake.lastOCRArgs)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["matchedText"] != "发送" {
		t.Fatalf("unexpected wait_for_text payload: %#v", payload)
	}
}

func TestToolsCallWaitForTextPollsUntilMatchAndReturnsAttempts(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	sequence := []map[string]any{
		{"text": "加载中", "lines": []any{map[string]any{"text": "加载中"}}},
		{"text": "发送", "lines": []any{map[string]any{"text": "发送"}}},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`431`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_wait_for_text",
			"arguments": map[string]any{"target_text": "发送", "timeoutMs": float64(25), "intervalMs": float64(0), "_test_ocr_sequence": sequence},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["matchedText"] != "发送" {
		t.Fatalf("unexpected wait_for_text payload: %#v", payload)
	}
	if payload["attempts"].(float64) < 2 {
		t.Fatalf("expected at least 2 attempts, got %#v", payload)
	}
	if _, ok := payload["elapsedMs"]; !ok {
		t.Fatalf("expected elapsedMs in payload, got %#v", payload)
	}
}

func TestToolsCallWaitForWindowPollsUntilTitleMatches(t *testing.T) {
	fake := &fakeRuntime{windowsResults: [][]map[string]any{
		{{"title": "Terminal"}},
		{{"title": "Slack"}, {"title": "WeChat"}},
	}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`45`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_wait_for_window",
			"arguments": map[string]any{"title": "Chat", "matchMode": "contains", "timeoutMs": float64(25), "intervalMs": float64(0)},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	match := mustMapField(t, payload, "window")
	if match["title"] != "WeChat" {
		t.Fatalf("unexpected matched window: %#v", payload)
	}
	if payload["attempts"].(float64) < 2 {
		t.Fatalf("expected polling attempts, got %#v", payload)
	}
}

func TestToolsCallFocusAndTypeChainsFocusThenType(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`46`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_focus_and_type",
			"arguments": map[string]any{"title": "WeChat", "text": "hello", "pressEnter": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastFocusWindow != "WeChat" {
		t.Fatalf("expected focus title to be forwarded, got %#v", fake.lastFocusWindow)
	}
	if fake.lastTypeArgs["text"] != "hello" || fake.lastTypeArgs["pressEnter"] != true {
		t.Fatalf("expected type args to be forwarded, got %#v", fake.lastTypeArgs)
	}
}

func TestToolsCallClickRegionFindsRegionCenterAndClicks(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []any{
		map[string]any{"id": "r1", "bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)}},
	}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`47`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_region",
			"arguments": map[string]any{"imagePath": "/tmp/layout.png", "regionId": "r1", "button": "right"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastAnalyzeArgs["imagePath"] != "/tmp/layout.png" {
		t.Fatalf("expected analyze_layout to receive imagePath, got %#v", fake.lastAnalyzeArgs)
	}
	if fake.lastClickArgs["x"].(float64) != 50 || fake.lastClickArgs["y"].(float64) != 40 {
		t.Fatalf("expected click center point, got %#v", fake.lastClickArgs)
	}
	if fake.lastClickArgs["button"] != "right" {
		t.Fatalf("expected forwarded button, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickRegionPreviewOnlyReturnsPlanWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []any{
		map[string]any{"id": "r1", "label": "发送区", "bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)}},
	}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4701`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_region",
			"arguments": map[string]any{"imagePath": "/tmp/layout.png", "regionId": "r1", "previewOnly": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["previewOnly"] != true {
		t.Fatalf("unexpected preview payload: %#v", payload)
	}
	if _, hasDryRun := payload["dryRun"]; hasDryRun {
		t.Fatalf("expected previewOnly payload not to set dryRun, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute during previewOnly, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickRegionDryRunReturnsDryRunFlagWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []any{
		map[string]any{"id": "r1", "label": "发送区", "bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)}},
	}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`47015`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_region",
			"arguments": map[string]any{"imagePath": "/tmp/layout.png", "regionId": "r1", "dryRun": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["dryRun"] != true {
		t.Fatalf("unexpected dry-run payload: %#v", payload)
	}
	if _, hasPreviewOnly := payload["previewOnly"]; hasPreviewOnly {
		t.Fatalf("expected dryRun payload not to set previewOnly, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute during dryRun, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallClickRegionReturnsOkFalseWhenExpectedTargetTextDoesNotMatch(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []any{
		map[string]any{"id": "r1", "label": "取消区", "bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)}},
	}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4702`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_click_region",
			"arguments": map[string]any{"imagePath": "/tmp/layout.png", "regionId": "r1", "expectedTargetText": "发送"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false {
		t.Fatalf("expected ok=false payload, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute on text guard mismatch, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallInspectDesktopAggregatesCoreSignals(t *testing.T) {
	fake := &fakeRuntime{
		statusResult:       map[string]any{"status": "ok", "vision": "enabled"},
		permissionsResult:  map[string]any{"screenRecording": true},
		activeWindowResult: map[string]any{"title": "WeChat"},
		displaysResult:     []map[string]any{{"id": 1}},
		screenshotResult:   map[string]any{"path": "/tmp/inspect.png"},
	}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`402`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_inspect_desktop",
			"arguments": map[string]any{"captureScreenshot": true, "path": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if mustMapField(t, payload, "status")["status"] != "ok" {
		t.Fatalf("unexpected inspect status payload: %#v", payload)
	}
	if mustMapField(t, payload, "activeWindow")["title"] != "WeChat" {
		t.Fatalf("unexpected activeWindow payload: %#v", payload)
	}
	if fake.lastScreenshotOpts["path"] != "/tmp/inspect.png" {
		t.Fatalf("expected inspect_desktop screenshot args to be forwarded, got %#v", fake.lastScreenshotOpts)
	}
}

func TestToolsCallFindTargetReturnsOCRAndLayoutCandidates(t *testing.T) {
	fake := &fakeRuntime{
		ocrResult: map[string]any{"text": "发送", "lines": []any{map[string]any{"text": "发送"}}},
		detectUIResult: map[string]any{"elements": []any{
			map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}},
		}},
		analyzeLayoutResult: map[string]any{"regions": []any{
			map[string]any{"id": "r1", "label": "发送区", "bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)}},
		}},
	}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`403`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "imagePath": "/tmp/shot.png", "includeLayout": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true {
		t.Fatalf("expected ok payload, got %#v", payload)
	}
	if mustMapField(t, payload, "ocr")["text"] != "发送" {
		t.Fatalf("unexpected OCR payload: %#v", payload)
	}
	detect := mustMapField(t, payload, "detectUI")
	if len(detect["elements"].([]any)) == 0 {
		t.Fatalf("expected detectUI elements, got %#v", payload)
	}
	layout := mustMapField(t, payload, "layout")
	if len(layout["regions"].([]any)) == 0 {
		t.Fatalf("expected layout regions, got %#v", payload)
	}
	candidates, ok := payload["candidates"].([]any)
	if !ok || len(candidates) < 2 {
		t.Fatalf("expected standardized candidates, got %#v", payload)
	}
	first, ok := candidates[0].(map[string]any)
	if !ok {
		t.Fatalf("expected candidate map, got %#v", candidates[0])
	}
	if first["source"] == nil || first["clickPoint"] == nil || first["bounds"] == nil {
		t.Fatalf("expected normalized candidate fields, got %#v", first)
	}
}

func TestToolsCallFindTargetRanksCandidatesAndIncludesOCRLineCandidates(t *testing.T) {
	fake := &fakeRuntime{
		ocrResult: map[string]any{"text": "发送\n发送到文件助手", "lines": []any{
			map[string]any{"text": "发送到文件助手", "confidence": float64(0.55), "bounds": map[string]any{"x": float64(5), "y": float64(50), "width": float64(110), "height": float64(18)}},
			map[string]any{"text": "发送", "confidence": float64(0.91), "bounds": map[string]any{"x": float64(70), "y": float64(30), "width": float64(42), "height": float64(16)}},
		}},
		detectUIResult: map[string]any{"elements": []any{
			map[string]any{"text": "发送到文件助手", "confidence": float64(0.60), "clickPoint": map[string]any{"x": float64(60), "y": float64(59)}},
			map[string]any{"text": "发送", "confidence": float64(0.97), "clickPoint": map[string]any{"x": float64(90), "y": float64(38)}},
		}},
	}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4035`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "hybrid"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	candidates, ok := payload["candidates"].([]any)
	if !ok || len(candidates) < 4 {
		t.Fatalf("expected detect-ui and OCR candidates, got %#v", payload)
	}
	first := mustCandidate(t, candidates[0])
	if first["text"] != "发送" || first["source"] != "detect_ui" {
		t.Fatalf("expected best exact detect_ui candidate first, got %#v", first)
	}
	last := mustCandidate(t, candidates[len(candidates)-1])
	if last["source"] != "ocr_line" {
		t.Fatalf("expected OCR line candidates to be normalized into the unified model, got %#v", candidates)
	}
	if payload["bestCandidate"] == nil {
		t.Fatalf("expected bestCandidate summary, got %#v", payload)
	}
}

func TestToolsCallFindTargetReportsAmbiguityWhenTopCandidatesAreSimilar(t *testing.T) {
	fake := &fakeRuntime{
		ocrResult: map[string]any{"text": "发送 发送"},
		detectUIResult: map[string]any{"elements": []any{
			map[string]any{"text": "发送", "confidence": float64(0.92), "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}},
			map[string]any{"text": "发送", "confidence": float64(0.91), "clickPoint": map[string]any{"x": float64(130), "y": float64(44)}},
		}},
	}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4036`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ambiguous"] != true {
		t.Fatalf("expected ambiguity signal, got %#v", payload)
	}
	if payload["ambiguityReason"] == nil {
		t.Fatalf("expected ambiguity reason, got %#v", payload)
	}
	ambiguityCandidates, ok := payload["ambiguityCandidates"].([]any)
	if !ok || len(ambiguityCandidates) < 2 {
		t.Fatalf("expected ambiguityCandidates, got %#v", payload)
	}
}

func TestToolsCallFindTargetReturnsStructuredExternalBlockerForDetectUIProviderFailure(t *testing.T) {
	fake := &fakeRuntime{detectUIErr: errors.New("detect_ui failed: PADDLE_OCR_ENDPOINT is required for paddle provider")}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4036.1`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "detect_ui", "imagePath": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "externalBlocker" {
		t.Fatalf("expected structured external-blocker payload, got %#v", payload)
	}
	if payload["action"] != "find_target" {
		t.Fatalf("expected action=find_target, got %#v", payload)
	}
	if payload["failedStep"] != "detect_ui" || payload["rootCause"] != "PADDLE_OCR_ENDPOINT is required for paddle provider" {
		t.Fatalf("expected failedStep/rootCause, got %#v", payload)
	}
	if payload["externalBlocker"] != true || payload["remediationHint"] == nil || payload["hostHint"] == nil {
		t.Fatalf("expected structured blocker metadata, got %#v", payload)
	}
	if payload["blockerType"] != "provider_missing" || payload["recoverable"] != true || payload["retryRecommended"] != false || payload["requiresHumanConfig"] != true {
		t.Fatalf("expected standardized blocker routing fields, got %#v", payload)
	}
}

func TestToolsCallFindTargetReturnsStructuredExternalBlockerForHybridOCRFailure(t *testing.T) {
	fake := &fakeRuntime{ocrErr: errors.New("ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider")}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4036.2`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "hybrid", "imagePath": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "externalBlocker" {
		t.Fatalf("expected structured external-blocker payload, got %#v", payload)
	}
	if payload["action"] != "find_target" {
		t.Fatalf("expected action=find_target, got %#v", payload)
	}
	if payload["failedStep"] != "ocr" || payload["rootCause"] != "PADDLE_OCR_ENDPOINT is required for paddle provider" {
		t.Fatalf("expected OCR root cause to be preserved, got %#v", payload)
	}
}

func TestToolsCallOCRReturnsStructuredExternalBlockerForProviderFailure(t *testing.T) {
	fake := &fakeRuntime{ocrErr: errors.New("ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider")}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4036.3`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_ocr",
			"arguments": map[string]any{"imagePath": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "externalBlocker" {
		t.Fatalf("expected structured external-blocker payload, got %#v", payload)
	}
	if payload["action"] != "ocr" || payload["failedStep"] != "ocr" {
		t.Fatalf("expected direct OCR blocker payload, got %#v", payload)
	}
	if payload["rootCause"] != "PADDLE_OCR_ENDPOINT is required for paddle provider" || payload["wrappedError"] != "ocr failed: PADDLE_OCR_ENDPOINT is required for paddle provider" {
		t.Fatalf("expected OCR cause fields to be preserved, got %#v", payload)
	}
	if payload["blockerType"] != "provider_missing" || payload["recoverable"] != true || payload["retryRecommended"] != false || payload["requiresHumanConfig"] != true {
		t.Fatalf("expected standardized blocker routing fields, got %#v", payload)
	}
	if payload["provider"] != "paddle" || payload["missingConfigKey"] != "PADDLE_OCR_ENDPOINT" {
		t.Fatalf("expected provider-specific remediation fields, got %#v", payload)
	}
}

func TestToolsCallDetectUIReturnsStructuredExternalBlockerForProviderFailure(t *testing.T) {
	fake := &fakeRuntime{detectUIErr: errors.New("detect_ui failed: PADDLE_OCR_ENDPOINT is required for paddle provider")}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4036.4`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_detect_ui",
			"arguments": map[string]any{"imagePath": "/tmp/inspect.png", "target_text": "ready"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "externalBlocker" {
		t.Fatalf("expected structured external-blocker payload, got %#v", payload)
	}
	if payload["action"] != "detect_ui" || payload["failedStep"] != "detect_ui" {
		t.Fatalf("expected direct detect_ui blocker payload, got %#v", payload)
	}
	if payload["rootCause"] != "PADDLE_OCR_ENDPOINT is required for paddle provider" || payload["wrappedError"] != "detect_ui failed: PADDLE_OCR_ENDPOINT is required for paddle provider" {
		t.Fatalf("expected detect_ui cause fields to be preserved, got %#v", payload)
	}
	if payload["provider"] != "paddle" || payload["missingConfigKey"] != "PADDLE_OCR_ENDPOINT" {
		t.Fatalf("expected provider-specific remediation fields, got %#v", payload)
	}
}

func TestToolsCallActOnTargetReturnsOkFalseWhenCandidateIsStale(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{}}}
	srv := NewServer(fake)
	target := map[string]any{
		"source":       "detect_ui",
		"text":         "发送",
		"clickPoint":   map[string]any{"x": float64(88), "y": float64(44)},
		"capturedAt":   "2026-01-01T00:00:00Z",
		"staleAfterMs": float64(1),
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4037`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "revalidationFailed" {
		t.Fatalf("expected revalidation failure payload for stale target, got %#v", payload)
	}
	if payload["revalidation"] == nil {
		t.Fatalf("expected revalidation evidence, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected stale target not to execute, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetRevalidatesStaleCandidateBeforeBlocking(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}}}}
	srv := NewServer(fake)
	target := map[string]any{
		"source":       "detect_ui",
		"text":         "发送",
		"clickPoint":   map[string]any{"x": float64(11), "y": float64(22)},
		"capturedAt":   "2000-01-01T00:00:00Z",
		"staleAfterMs": 1,
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4037.1`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "previewOnly": true, "imagePath": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["previewOnly"] != true {
		t.Fatalf("expected preview plan after successful revalidation, got %#v", payload)
	}
	click, ok := payload["click"].(map[string]any)
	if !ok || click["x"] != float64(88) || click["y"] != float64(44) {
		t.Fatalf("expected click plan to use revalidated candidate, got %#v", payload)
	}
	if fake.detectUICalls != 1 {
		t.Fatalf("expected one detect_ui call for revalidation, got %d", fake.detectUICalls)
	}
	if fake.lastDetectUIArgs["target_text"] != "发送" || fake.lastDetectUIArgs["imagePath"] != "/tmp/inspect.png" {
		t.Fatalf("expected revalidation args to include target_text and imagePath, got %#v", fake.lastDetectUIArgs)
	}
	if _, exists := fake.lastDetectUIArgs["staleAfterMs"]; exists {
		t.Fatalf("expected staleAfterMs to be omitted during revalidation, got %#v", fake.lastDetectUIArgs)
	}
}

func TestToolsCallActOnTargetReturnsStructuredRevalidationFailure(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{}}}
	srv := NewServer(fake)
	target := map[string]any{
		"source":       "detect_ui",
		"text":         "发送",
		"clickPoint":   map[string]any{"x": float64(11), "y": float64(22)},
		"capturedAt":   "2000-01-01T00:00:00Z",
		"staleAfterMs": 1,
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4037.2`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "imagePath": "/tmp/inspect.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "revalidationFailed" {
		t.Fatalf("expected structured revalidation failure, got %#v", payload)
	}
	if payload["hostHint"] == nil || payload["revalidation"] == nil {
		t.Fatalf("expected hostHint and revalidation evidence, got %#v", payload)
	}
}

func TestToolsCallActOnTargetBlocksAmbiguousCandidateUnlessExplicitlyAllowed(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "detect_ui",
		"text":       "发送",
		"clickPoint": map[string]any{"x": float64(88), "y": float64(44)},
		"ambiguous":  true,
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4038`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["guard"] != "ambiguousTarget" {
		t.Fatalf("expected ambiguous-target guard payload, got %#v", payload)
	}
	if payload["reason"] == nil || payload["hostHint"] == nil {
		t.Fatalf("expected ambiguity payload to include reason and hostHint, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected ambiguous target not to execute, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetDryRunReturnsPlanWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "detect_ui",
		"text":       "发送",
		"clickPoint": map[string]any{"x": float64(88), "y": float64(44)},
		"bounds":     map[string]any{"x": float64(60), "y": float64(30), "width": float64(40), "height": float64(20)},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4031`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "button": "right", "dryRun": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["dryRun"] != true {
		t.Fatalf("unexpected act_on_target dry-run payload: %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute on dry run, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetCanAtomicallyFocusExpectedWindowBeforePreview(t *testing.T) {
	fake := &fakeRuntime{activeWindowResult: map[string]any{"title": "Calculator"}}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "codex-visual-confirmed",
		"text":       "7",
		"clickPoint": map[string]any{"x": float64(1549), "y": float64(238)},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`40310`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name": "tm_act_on_target",
			"arguments": map[string]any{
				"target":              target,
				"action":              "click",
				"expectedWindowTitle": "Calculator",
				"expectedTargetText":  "7",
				"focusExpectedWindow": true,
				"previewOnly":         true,
			},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["previewOnly"] != true || payload["focusedExpectedWindow"] != true {
		t.Fatalf("unexpected atomic focus preview payload: %#v", payload)
	}
	if fake.lastFocusWindow != "Calculator" || fake.getActiveWindowCalls != 1 {
		t.Fatalf("expected focus then active-window guard, focus=%q activeCalls=%d", fake.lastFocusWindow, fake.getActiveWindowCalls)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("preview must not click, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetFocusExpectedWindowFailureReturnsGuardWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{focusWindowErr: errors.New("focus_window timed out")}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "codex-visual-confirmed",
		"text":       "7",
		"clickPoint": map[string]any{"x": float64(1549), "y": float64(238)},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`40311`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name": "tm_act_on_target",
			"arguments": map[string]any{
				"target":              target,
				"action":              "click",
				"expectedWindowTitle": "Missing Calculator",
				"expectedTargetText":  "7",
				"focusExpectedWindow": true,
			},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected focus failure to be a guard result, got tool error %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false || payload["executed"] != false || payload["guard"] != "expectedWindowTitle" {
		t.Fatalf("unexpected focus failure guard payload: %#v", payload)
	}
	if payload["expectedWindowTitle"] != "Missing Calculator" || payload["focusedExpectedWindow"] != false {
		t.Fatalf("expected failed focus identity in guard payload, got %#v", payload)
	}
	if payload["focusError"] != "focus_window timed out" {
		t.Fatalf("expected structured focus error evidence, got %#v", payload)
	}
	if fake.lastFocusWindow != "Missing Calculator" || fake.getActiveWindowCalls != 0 {
		t.Fatalf("expected one failed focus and no remaining guards, focus=%q activeCalls=%d", fake.lastFocusWindow, fake.getActiveWindowCalls)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("focus guard failure must not click, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetReturnsOkFalseWhenExpectedWindowTitleDoesNotMatch(t *testing.T) {
	fake := &fakeRuntime{activeWindowResult: map[string]any{"title": "Slack"}}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "layout",
		"label":      "发送区",
		"clickPoint": map[string]any{"x": float64(88), "y": float64(44)},
		"bounds":     map[string]any{"x": float64(60), "y": float64(30), "width": float64(40), "height": float64(20)},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4032`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "expectedWindowTitle": "WeChat"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != false {
		t.Fatalf("expected ok=false payload, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected click not to execute when window guard fails, got %#v", fake.lastClickArgs)
	}
}

func TestToolsCallActOnTargetTypeAndFocusExecuteThroughRuntime(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	target := map[string]any{"source": "window", "label": "WeChat", "text": "WeChat"}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4033`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "focus", "text": "hello", "pressEnter": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["action"] != "focus" {
		t.Fatalf("unexpected focus payload: %#v", payload)
	}
	if fake.lastFocusWindow != "WeChat" {
		t.Fatalf("expected focus to use target title, got %#v", fake.lastFocusWindow)
	}

	fake = &fakeRuntime{}
	srv = NewServer(fake)
	target = map[string]any{"source": "detect_ui", "text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}
	resp = srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4034`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "type", "text": "hello", "pressEnter": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload = mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["action"] != "type" {
		t.Fatalf("unexpected type payload: %#v", payload)
	}
	if fake.lastTypeArgs["text"] != "hello" || fake.lastTypeArgs["pressEnter"] != true {
		t.Fatalf("expected type args to be forwarded, got %#v", fake.lastTypeArgs)
	}
}

func TestToolsCallCaptureAndAnnotateChainsScreenshotAnalyzeAnnotate(t *testing.T) {
	fake := &fakeRuntime{
		screenshotResult:      map[string]any{"path": "/tmp/cap.png"},
		analyzeLayoutResult:   map[string]any{"regions": []any{map[string]any{"id": "r1"}}, "separators": []any{map[string]any{"orientation": "vertical"}}},
		annotateRegionsResult: map[string]any{"outputPath": "/tmp/annotated.png"},
	}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`44`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_capture_and_annotate",
			"arguments": map[string]any{"path": "/tmp/cap.png", "outputPath": "/tmp/annotated.png"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	if fake.lastScreenshotOpts["path"] != "/tmp/cap.png" {
		t.Fatalf("expected screenshot to receive path, got %#v", fake.lastScreenshotOpts)
	}
	if fake.lastAnalyzeArgs["imagePath"] != "/tmp/cap.png" {
		t.Fatalf("expected analyze to receive captured path, got %#v", fake.lastAnalyzeArgs)
	}
	if fake.lastAnnotateArgs["imagePath"] != "/tmp/cap.png" {
		t.Fatalf("expected annotate to receive captured path, got %#v", fake.lastAnnotateArgs)
	}
	if fake.lastAnnotateArgs["outputPath"] != "/tmp/annotated.png" {
		t.Fatalf("expected annotate outputPath to be forwarded, got %#v", fake.lastAnnotateArgs)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["capturePath"] != "/tmp/cap.png" {
		t.Fatalf("unexpected capture_and_annotate payload: %#v", payload)
	}
}

func TestUnknownToolReturnsJSONRPCError(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`5`),
		Method:  "tools/call",
		Params:  mustRawMap(t, map[string]any{"name": "tm_missing", "arguments": map[string]any{}}),
	})
	if resp.Error == nil {
		t.Fatal("expected error for unknown tool")
	}
	if resp.Error.Code != ErrCodeInvalidParams {
		t.Fatalf("unexpected error code: %#v", resp.Error)
	}
}

func TestHandleRejectsMissingJSONRPCVersion(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{ID: json.RawMessage(`"missing-version"`), Method: "ping"})
	if resp.Error == nil || resp.Error.Code != ErrCodeInvalidRequest {
		t.Fatalf("expected invalid request error, got %#v", resp)
	}
	if string(resp.ID) != `"missing-version"` {
		t.Fatalf("expected request id to be preserved, got %s", resp.ID)
	}
}

func TestHandleRejectsInitializedNotificationWithID(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	resp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`72`), Method: "notifications/initialized"})
	if resp.Error == nil || resp.Error.Code != ErrCodeInvalidRequest {
		t.Fatalf("expected invalid request error, got %#v", resp)
	}
	if string(resp.ID) != "72" {
		t.Fatalf("expected request id to be preserved, got %s", resp.ID)
	}
}

func TestToolsCallValidatesArgumentsAgainstAdvertisedSchema(t *testing.T) {
	tests := []struct {
		name       string
		tool       string
		arguments  map[string]any
		wantReason string
	}{
		{name: "missing required", tool: "tm_focus_window", arguments: map[string]any{}, wantReason: "arguments.title is required"},
		{name: "invalid enum", tool: "tm_click", arguments: map[string]any{"x": 1, "y": 2, "button": "invalid"}, wantReason: "arguments.button must be one of"},
		{name: "wrong type", tool: "tm_click", arguments: map[string]any{"x": "1", "y": 2}, wantReason: "arguments.x must be number"},
		{name: "non integer", tool: "tm_wait_for_window", arguments: map[string]any{"title": "Calculator", "timeoutMs": 1.5}, wantReason: "arguments.timeoutMs must be integer"},
		{name: "nested object type", tool: "tm_act_on_target", arguments: map[string]any{"target": "Calculator", "action": "focus"}, wantReason: "arguments.target must be object"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeRuntime{}
			srv := NewServer(fake)
			resp := srv.Handle(Request{
				JSONRPC: "2.0",
				ID:      json.RawMessage(`71`),
				Method:  "tools/call",
				Params: mustRawMap(t, map[string]any{
					"name":      tt.tool,
					"arguments": tt.arguments,
				}),
			})
			if resp.Error == nil || resp.Error.Code != ErrCodeInvalidParams {
				t.Fatalf("expected invalid params error, got %#v", resp)
			}
			if !strings.Contains(resp.Error.Message, tt.wantReason) {
				t.Fatalf("expected error containing %q, got %#v", tt.wantReason, resp.Error)
			}
			if fake.lastClickArgs != nil || fake.lastFocusWindow != "" {
				t.Fatalf("expected invalid arguments to be rejected before runtime dispatch: %#v", fake)
			}
		})
	}
}

func TestServeStreamProcessesJSONRPCLines(t *testing.T) {
	srv := NewServer(&fakeRuntime{statusResult: map[string]any{"status": "ok"}})
	input := strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"tm_status\",\"arguments\":{}}}\n")
	var output bytes.Buffer
	if err := srv.ServeStream(input, &output); err != nil {
		t.Fatalf("ServeStream returned error: %v", err)
	}
	var resp Response
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &resp); err != nil {
		t.Fatalf("unmarshal stream response: %v; output=%s", err, output.String())
	}
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["status"] != "ok" {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestServeStreamDoesNotRespondToNotifications(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	input := strings.NewReader(strings.Join([]string{
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","method":"notifications/unknown"}`,
	}, "\n") + "\n")
	var output bytes.Buffer
	if err := srv.ServeStream(input, &output); err != nil {
		t.Fatalf("ServeStream returned error: %v", err)
	}
	if output.Len() != 0 {
		t.Fatalf("expected notifications to produce no stdout, got %q", output.String())
	}
}

func TestServeStreamParseErrorIncludesNullID(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	var output bytes.Buffer
	if err := srv.ServeStream(strings.NewReader("not-json\n"), &output); err != nil {
		t.Fatalf("ServeStream returned error: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &response); err != nil {
		t.Fatalf("unmarshal parse error response: %v; output=%s", err, output.String())
	}
	id, exists := response["id"]
	if !exists || id != nil {
		t.Fatalf("expected explicit id:null, got %#v", response)
	}
	errorValue, ok := response["error"].(map[string]any)
	if !ok || errorValue["code"] != float64(ErrCodeParseError) {
		t.Fatalf("expected parse error response, got %#v", response)
	}
}

func TestServeStreamRejectsMissingJSONRPCVersion(t *testing.T) {
	srv := NewServer(&fakeRuntime{})
	var output bytes.Buffer
	if err := srv.ServeStream(strings.NewReader(`{"id":"missing-version","method":"ping"}`+"\n"), &output); err != nil {
		t.Fatalf("ServeStream returned error: %v", err)
	}
	var response Response
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &response); err != nil {
		t.Fatalf("unmarshal invalid request response: %v; output=%s", err, output.String())
	}
	if response.Error == nil || response.Error.Code != ErrCodeInvalidRequest {
		t.Fatalf("expected invalid request response, got %#v", response)
	}
	if string(response.ID) != `"missing-version"` {
		t.Fatalf("expected request id to be preserved, got %s", response.ID)
	}
}

func TestServeStreamSmokeInitializeListAndCall(t *testing.T) {
	srv := NewServer(&fakeRuntime{statusResult: map[string]any{"status": "ok"}, ocrResult: map[string]any{"text": "ready", "lines": []any{map[string]any{"text": "ready"}}}})
	input := strings.NewReader(strings.Join([]string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tm_status","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"tm_wait_for_text","arguments":{"target_text":"ready","timeoutMs":1}}}`,
	}, "\n") + "\n")
	var output bytes.Buffer
	if err := srv.ServeStream(input, &output); err != nil {
		t.Fatalf("ServeStream returned error: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 responses, got %d: %q", len(lines), output.String())
	}
	var initResp, listResp, statusResp, waitResp Response
	for i, target := range []*Response{&initResp, &listResp, &statusResp, &waitResp} {
		if err := json.Unmarshal([]byte(lines[i]), target); err != nil {
			t.Fatalf("unmarshal response %d: %v; line=%s", i, err, lines[i])
		}
		if target.Error != nil {
			t.Fatalf("unexpected response error at index %d: %#v", i, target.Error)
		}
	}
	if mustMapResult(t, initResp.Result)["protocolVersion"] != ProtocolVersion {
		t.Fatalf("unexpected initialize payload: %#v", mustMapResult(t, initResp.Result))
	}
	tools := mustMapResult(t, listResp.Result)["tools"].([]any)
	assertToolPresent(t, tools, "tm_status")
	assertToolPresent(t, tools, "tm_wait_for_text")
	if mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, statusResp.Result)))["status"] != "ok" {
		t.Fatalf("unexpected tm_status payload")
	}
	waitPayload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, waitResp.Result)))
	if waitPayload["ok"] != true || waitPayload["matchedText"] != "ready" {
		t.Fatalf("unexpected tm_wait_for_text payload: %#v", waitPayload)
	}
}

func TestToolsCallFindTargetStrategyOCRSkipsDetectUIAndLayout(t *testing.T) {
	fake := &fakeRuntime{ocrResult: map[string]any{"text": "发送", "lines": []any{map[string]any{"text": "发送"}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4041`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "ocr"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if fake.detectUICalls != 0 {
		t.Fatalf("expected detect_ui runtime to be skipped for strategy=ocr, got %d calls", fake.detectUICalls)
	}
	if fake.analyzeLayoutCalls != 0 {
		t.Fatalf("expected analyze_layout runtime to be skipped for strategy=ocr, got %d calls", fake.analyzeLayoutCalls)
	}
	if _, ok := payload["detectUI"]; ok {
		t.Fatalf("expected detectUI evidence to be omitted for strategy=ocr, got %#v", payload)
	}
	if _, ok := payload["layout"]; ok {
		t.Fatalf("expected layout evidence to be omitted for strategy=ocr, got %#v", payload)
	}
}

func TestToolsCallFindTargetStrategyLayoutSkipsOCRAndDetectUI(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []any{map[string]any{"id": "r1", "label": "发送区"}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4042`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "layout"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if fake.ocrCalls != 0 {
		t.Fatalf("expected OCR runtime to be skipped for strategy=layout, got %d calls", fake.ocrCalls)
	}
	if fake.detectUICalls != 0 {
		t.Fatalf("expected detect_ui runtime to be skipped for strategy=layout, got %d calls", fake.detectUICalls)
	}
	if _, ok := payload["ocr"]; ok {
		t.Fatalf("expected OCR evidence to be omitted for strategy=layout, got %#v", payload)
	}
	if _, ok := payload["detectUI"]; ok {
		t.Fatalf("expected detectUI evidence to be omitted for strategy=layout, got %#v", payload)
	}
	if _, ok := payload["layout"]; !ok {
		t.Fatalf("expected layout evidence for strategy=layout, got %#v", payload)
	}
}

func TestToolsCallFindTargetStrategyLayoutAcceptsTypedRegionSlices(t *testing.T) {
	fake := &fakeRuntime{analyzeLayoutResult: map[string]any{"regions": []map[string]any{{
		"id":     "r1",
		"label":  "Region 17",
		"bounds": map[string]any{"x": float64(10), "y": float64(20), "width": float64(80), "height": float64(40)},
	}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`40425`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "Region 17", "strategy": "layout", "staleAfterMs": 5000},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	candidates, ok := payload["candidates"].([]any)
	if !ok || len(candidates) == 0 {
		t.Fatalf("expected typed layout regions to produce candidates, got %#v", payload)
	}
	best := mustMapField(t, payload, "bestCandidate")
	if best["label"] != "Region 17" {
		t.Fatalf("unexpected bestCandidate: %#v", best)
	}
	if _, ok := best["staleAfterMs"]; !ok {
		t.Fatalf("expected freshness metadata on bestCandidate, got %#v", best)
	}
}

func TestToolsCallFindTargetStrategyDetectUISkipsOCRAndLayout(t *testing.T) {
	fake := &fakeRuntime{detectUIResult: map[string]any{"elements": []any{map[string]any{"text": "发送", "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}}}}}
	srv := NewServer(fake)
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`40421`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_find_target",
			"arguments": map[string]any{"target_text": "发送", "strategy": "detect_ui"},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if fake.ocrCalls != 0 {
		t.Fatalf("expected OCR runtime to be skipped for strategy=detect_ui, got %d calls", fake.ocrCalls)
	}
	if fake.analyzeLayoutCalls != 0 {
		t.Fatalf("expected analyze_layout runtime to be skipped for strategy=detect_ui, got %d calls", fake.analyzeLayoutCalls)
	}
	if _, ok := payload["ocr"]; ok {
		t.Fatalf("expected OCR evidence to be omitted for strategy=detect_ui, got %#v", payload)
	}
	if _, ok := payload["layout"]; ok {
		t.Fatalf("expected layout evidence to be omitted for strategy=detect_ui, got %#v", payload)
	}
	if _, ok := payload["detectUI"]; !ok {
		t.Fatalf("expected detectUI evidence for strategy=detect_ui, got %#v", payload)
	}
}

func TestToolsCallActOnTargetAllowsAmbiguousCandidateWhenExplicitlyAllowed(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "detect_ui",
		"text":       "发送",
		"clickPoint": map[string]any{"x": float64(88), "y": float64(44)},
		"ambiguous":  true,
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4043`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "allowAmbiguous": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != true {
		t.Fatalf("expected ambiguous candidate to execute when explicitly allowed, got %#v", payload)
	}
	if fake.lastClickArgs == nil {
		t.Fatalf("expected click execution when allowAmbiguous=true")
	}
}

func TestToolsCallActOnTargetPreviewOnlyReturnsPreviewFlagWithoutExecuting(t *testing.T) {
	fake := &fakeRuntime{}
	srv := NewServer(fake)
	target := map[string]any{
		"source":     "detect_ui",
		"text":       "发送",
		"clickPoint": map[string]any{"x": float64(88), "y": float64(44)},
	}
	resp := srv.Handle(Request{
		JSONRPC: "2.0",
		ID:      json.RawMessage(`4044`),
		Method:  "tools/call",
		Params: mustRawMap(t, map[string]any{
			"name":      "tm_act_on_target",
			"arguments": map[string]any{"target": target, "action": "click", "previewOnly": true},
		}),
	})
	if resp.Error != nil {
		t.Fatalf("expected no transport error, got %#v", resp.Error)
	}
	payload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, resp.Result)))
	if payload["ok"] != true || payload["executed"] != false || payload["previewOnly"] != true {
		t.Fatalf("expected previewOnly plan payload, got %#v", payload)
	}
	if _, ok := payload["dryRun"]; ok {
		t.Fatalf("expected previewOnly response to expose previewOnly instead of dryRun only, got %#v", payload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected previewOnly not to execute, got %#v", fake.lastClickArgs)
	}
}

func TestRecommendedInspectFindActChainProducesSafePlannedAction(t *testing.T) {
	fake := &fakeRuntime{
		statusResult:       map[string]any{"status": "ok"},
		permissionsResult:  map[string]any{"screenRecording": true},
		activeWindowResult: map[string]any{"title": "WeChat"},
		displaysResult:     []map[string]any{{"id": "main"}},
		screenshotResult:   map[string]any{"path": "/tmp/inspect.png"},
		ocrResult: map[string]any{"text": "发送", "lines": []any{
			map[string]any{"text": "发送", "confidence": float64(0.9), "bounds": map[string]any{"x": float64(10), "y": float64(10), "width": float64(40), "height": float64(18)}},
		}},
		detectUIResult: map[string]any{"elements": []any{
			map[string]any{"text": "发送", "confidence": float64(0.96), "clickPoint": map[string]any{"x": float64(88), "y": float64(44)}},
		}},
		analyzeLayoutResult: map[string]any{"regions": []any{
			map[string]any{"id": "r1", "label": "发送区", "bounds": map[string]any{"x": float64(60), "y": float64(30), "width": float64(40), "height": float64(20)}},
		}},
	}
	srv := NewServer(fake)

	inspectResp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`4045`), Method: "tools/call", Params: mustRawMap(t, map[string]any{"name": "tm_inspect_desktop", "arguments": map[string]any{"captureScreenshot": true, "path": "/tmp/inspect.png"}})})
	if inspectResp.Error != nil {
		t.Fatalf("inspect failed: %#v", inspectResp.Error)
	}
	inspectPayload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, inspectResp.Result)))
	if inspectPayload["ok"] != true || mustMapField(t, inspectPayload, "activeWindow")["title"] != "WeChat" {
		t.Fatalf("unexpected inspect payload: %#v", inspectPayload)
	}

	findResp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`4046`), Method: "tools/call", Params: mustRawMap(t, map[string]any{"name": "tm_find_target", "arguments": map[string]any{"target_text": "发送", "strategy": "hybrid", "staleAfterMs": 5000}})})
	if findResp.Error != nil {
		t.Fatalf("find failed: %#v", findResp.Error)
	}
	findPayload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, findResp.Result)))
	bestCandidate, ok := findPayload["bestCandidate"].(map[string]any)
	if !ok {
		t.Fatalf("expected bestCandidate from find_target, got %#v", findPayload)
	}
	if bestCandidate["capturedAt"] == nil || bestCandidate["staleAfterMs"] == nil {
		t.Fatalf("expected freshness metadata on bestCandidate, got %#v", bestCandidate)
	}

	actResp := srv.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`4047`), Method: "tools/call", Params: mustRawMap(t, map[string]any{"name": "tm_act_on_target", "arguments": map[string]any{"target": bestCandidate, "action": "click", "previewOnly": true, "expectedWindowTitle": "WeChat", "expectedTargetText": "发送"}})})
	if actResp.Error != nil {
		t.Fatalf("act failed: %#v", actResp.Error)
	}
	actPayload := mustJSONTextPayload(t, mustCallContent(t, mustMapResult(t, actResp.Result)))
	if actPayload["ok"] != true || actPayload["executed"] != false || actPayload["previewOnly"] != true {
		t.Fatalf("unexpected act payload: %#v", actPayload)
	}
	if fake.lastClickArgs != nil {
		t.Fatalf("expected recommended chain smoke to remain safe in previewOnly mode, got %#v", fake.lastClickArgs)
	}
}

func mustRawMap(t *testing.T, v map[string]any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal params: %v", err)
	}
	return data
}

func mustMapResult(t *testing.T, raw json.RawMessage) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	return result
}

func mustCallContent(t *testing.T, result map[string]any) []any {
	t.Helper()
	content, ok := result["content"].([]any)
	if !ok || len(content) == 0 {
		t.Fatalf("expected non-empty content, got %#v", result["content"])
	}
	return content
}

func mustJSONTextPayload(t *testing.T, content []any) map[string]any {
	t.Helper()
	entry, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected content object, got %#v", content[0])
	}
	text, ok := entry["text"].(string)
	if !ok {
		t.Fatalf("expected text content, got %#v", entry)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(text), &payload); err != nil {
		t.Fatalf("unmarshal text payload: %v; text=%s", err, text)
	}
	return payload
}

func assertToolPresent(t *testing.T, tools []any, name string) {
	t.Helper()
	for _, item := range tools {
		row, ok := item.(map[string]any)
		if ok && row["name"] == name {
			return
		}
	}
	t.Fatalf("tool %s not found in %#v", name, tools)
}

func mustToolByName(t *testing.T, tools []any, name string) map[string]any {
	t.Helper()
	for _, item := range tools {
		row, ok := item.(map[string]any)
		if ok && row["name"] == name {
			return row
		}
	}
	t.Fatalf("tool %s not found in %#v", name, tools)
	return nil
}

func mustMapField(t *testing.T, row any, key string) map[string]any {
	t.Helper()
	obj, ok := row.(map[string]any)
	if !ok {
		t.Fatalf("expected map for key %s, got %#v", key, row)
	}
	value, ok := obj[key].(map[string]any)
	if !ok {
		t.Fatalf("expected map field %s, got %#v", key, obj[key])
	}
	return value
}

func mustStringSliceField(t *testing.T, row any, key string) []string {
	t.Helper()
	obj, ok := row.(map[string]any)
	if !ok {
		t.Fatalf("expected map for key %s, got %#v", key, row)
	}
	values, ok := obj[key].([]any)
	if !ok {
		t.Fatalf("expected []any field %s, got %#v", key, obj[key])
	}
	out := make([]string, 0, len(values))
	for _, v := range values {
		s, ok := v.(string)
		if !ok {
			t.Fatalf("expected string in %s, got %#v", key, v)
		}
		out = append(out, s)
	}
	return out
}

func mustCandidate(t *testing.T, value any) map[string]any {
	t.Helper()
	candidate, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("expected candidate map, got %#v", value)
	}
	return candidate
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
