package mcpserver

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"opendesk/pkg/recorder"
	"sort"
	"strings"
	"sync"
	"time"
)

const ProtocolVersion = "2024-11-05"

const (
	ErrCodeParseError     = -32700
	ErrCodeInvalidRequest = -32600
	ErrCodeMethodNotFound = -32601
	ErrCodeInvalidParams  = -32602
	ErrCodeInternal       = -32603
)

type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *ResponseError  `json:"error,omitempty"`
}

type ResponseError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema"`
}

type Runtime interface {
	Status() (map[string]any, error)
	Permissions() (map[string]any, error)
	ListWindows() ([]map[string]any, error)
	GetActiveWindow() (map[string]any, error)
	FocusWindow(title string) error
	RequestPermissions(args map[string]any) (map[string]any, error)
	GetDisplays() ([]map[string]any, error)
	Screenshot(args map[string]any) (any, error)
	OCR(args map[string]any) (map[string]any, error)
	DetectUI(args map[string]any) (map[string]any, error)
	AnalyzeLayout(args map[string]any) (map[string]any, error)
	AnnotateRegions(args map[string]any) (map[string]any, error)
	Click(args map[string]any) error
	Type(args map[string]any) error
	PressKey(key string) error
	Move(args map[string]any) error
	Scroll(args map[string]any) error
}

type Server struct {
	runtime      Runtime
	tools        map[string]Tool
	recorder     *recorder.Manager
	recorderOnce sync.Once
	recorderErr  error
}

func NewServer(runtime Runtime) *Server {
	s := &Server{runtime: runtime}
	s.tools = map[string]Tool{}
	for _, tool := range builtinTools() {
		s.tools[tool.Name] = tool
	}
	return s
}

func NewServerWithRecorder(runtime Runtime, manager *recorder.Manager) *Server {
	s := NewServer(runtime)
	s.recorder = manager
	return s
}

func (s *Server) Handle(req Request) Response {
	if req.JSONRPC != "2.0" {
		return s.errorResponse(req.ID, ErrCodeInvalidRequest, "jsonrpc must be 2.0", nil)
	}
	if strings.TrimSpace(req.Method) == "" {
		return s.errorResponse(req.ID, ErrCodeInvalidRequest, "method is required", nil)
	}

	switch req.Method {
	case "initialize":
		return s.handleInitialize(req)
	case "notifications/initialized":
		if len(req.ID) > 0 {
			return s.errorResponse(req.ID, ErrCodeInvalidRequest, "notifications/initialized must not include an id", nil)
		}
		return Response{}
	case "ping":
		return s.resultResponse(req.ID, map[string]any{})
	case "tools/list":
		return s.handleToolsList(req)
	case "tools/call":
		return s.handleToolsCall(req)
	default:
		return s.errorResponse(req.ID, ErrCodeMethodNotFound, "method not found", map[string]any{"method": req.Method})
	}
}

func (s *Server) ServeStream(in io.Reader, out io.Writer) error {
	scanner := bufio.NewScanner(in)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 2*1024*1024)
	encoder := json.NewEncoder(out)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var req Request
		raw := []byte(line)
		if !json.Valid(raw) {
			resp := s.errorResponse(json.RawMessage("null"), ErrCodeParseError, "invalid jsonrpc payload", nil)
			if encodeErr := encoder.Encode(resp); encodeErr != nil {
				return encodeErr
			}
			continue
		}
		if err := json.Unmarshal(raw, &req); err != nil {
			resp := s.errorResponse(json.RawMessage("null"), ErrCodeInvalidRequest, "invalid jsonrpc request", err.Error())
			if encodeErr := encoder.Encode(resp); encodeErr != nil {
				return encodeErr
			}
			continue
		}
		resp := s.Handle(req)
		if len(req.ID) == 0 && req.JSONRPC == "2.0" && strings.TrimSpace(req.Method) != "" {
			continue
		}
		if err := encoder.Encode(resp); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func (s *Server) handleInitialize(req Request) Response {
	result := map[string]any{
		"protocolVersion": ProtocolVersion,
		"serverInfo": map[string]any{
			"name":    "opendesk-mcp",
			"title":   "OpenDesk MCP Server",
			"version": "0.1.0",
		},
		"capabilities": map[string]any{
			"tools": map[string]any{},
		},
	}
	return s.resultResponse(req.ID, result)
}

func (s *Server) handleToolsList(req Request) Response {
	tools := make([]Tool, 0, len(s.tools))
	for _, name := range toolOrder() {
		if tool, ok := s.tools[name]; ok {
			tools = append(tools, tool)
		}
	}
	return s.resultResponse(req.ID, map[string]any{"tools": tools})
}

func (s *Server) handleToolsCall(req Request) Response {
	var params struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if len(req.Params) > 0 {
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return s.errorResponse(req.ID, ErrCodeInvalidParams, "invalid tools/call params", err.Error())
		}
	}
	if params.Name == "" {
		return s.errorResponse(req.ID, ErrCodeInvalidParams, "tool name is required", nil)
	}
	if params.Arguments == nil {
		params.Arguments = map[string]any{}
	}
	tool, ok := s.tools[params.Name]
	if !ok {
		return s.errorResponse(req.ID, ErrCodeInvalidParams, "tool not found", map[string]any{"name": params.Name})
	}
	if err := validateToolArguments(tool, params.Arguments); err != nil {
		return s.errorResponse(req.ID, ErrCodeInvalidParams, "invalid tool arguments: "+err.Error(), map[string]any{"name": params.Name, "reason": err.Error()})
	}

	payload, err := s.callTool(params.Name, params.Arguments)
	if err != nil {
		return s.errorResponse(req.ID, ErrCodeInternal, err.Error(), map[string]any{"name": params.Name})
	}
	return s.resultResponse(req.ID, map[string]any{
		"content": []map[string]any{{
			"type": "text",
			"text": mustJSONString(payload),
		}},
	})
}

func (s *Server) callTool(name string, args map[string]any) (map[string]any, error) {
	if strings.HasPrefix(name, "tm_recorder_") {
		return s.callRecorderTool(name, args)
	}
	if sessionID := serverStringArg(args, "recordingSessionId"); sessionID != "" && recordableTool(name) {
		return s.callRecordedTool(name, args, sessionID)
	}
	return s.callToolCore(name, args)
}

func (s *Server) callToolCore(name string, args map[string]any) (map[string]any, error) {
	switch name {
	case "tm_status":
		return s.runtime.Status()
	case "tm_permissions":
		return s.runtime.Permissions()
	case "tm_request_permissions":
		return s.runtime.RequestPermissions(args)
	case "tm_list_windows":
		rows, err := s.runtime.ListWindows()
		if err != nil {
			return nil, err
		}
		return map[string]any{"windows": rows, "count": len(rows)}, nil
	case "tm_get_active_window":
		return s.runtime.GetActiveWindow()
	case "tm_focus_window":
		title := serverStringArg(args, "title")
		if title == "" {
			return nil, fmt.Errorf("title is required")
		}
		if err := s.runtime.FocusWindow(title); err != nil {
			return nil, err
		}
		return ack("focus_window", map[string]any{"title": title}), nil
	case "tm_wait_for_window":
		title := serverStringArg(args, "title")
		if title == "" {
			return nil, fmt.Errorf("title is required")
		}
		return s.waitForWindow(args)
	case "tm_focus_and_type":
		title := serverStringArg(args, "title")
		if title == "" {
			return nil, fmt.Errorf("title is required")
		}
		if serverStringArg(args, "text") == "" {
			return nil, fmt.Errorf("text is required")
		}
		if err := s.runtime.FocusWindow(title); err != nil {
			return nil, err
		}
		if err := s.runtime.Type(args); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "action": "focus_and_type", "title": title, "arguments": args}, nil
	case "tm_inspect_desktop":
		return s.inspectDesktop(args)
	case "tm_find_target":
		return s.findTarget(args)
	case "tm_list_displays":
		rows, err := s.runtime.GetDisplays()
		if err != nil {
			return nil, err
		}
		return map[string]any{"displays": rows, "count": len(rows)}, nil
	case "tm_screenshot":
		result, err := s.runtime.Screenshot(args)
		if err != nil {
			return nil, err
		}
		return normalizeResultMap(result), nil
	case "tm_ocr":
		result, err := s.runtime.OCR(args)
		if err != nil {
			if blocker := externalBlockerPayload("ocr", "ocr", err); blocker != nil {
				blocker["action"] = "ocr"
				return blocker, nil
			}
			return nil, err
		}
		return result, nil
	case "tm_detect_ui":
		result, err := s.runtime.DetectUI(args)
		if err != nil {
			if blocker := externalBlockerPayload("detect_ui", "detect_ui", err); blocker != nil {
				blocker["action"] = "detect_ui"
				return blocker, nil
			}
			return nil, err
		}
		return result, nil
	case "tm_wait_for_text":
		if serverStringArg(args, "target_text") == "" {
			return nil, fmt.Errorf("target_text is required")
		}
		return s.waitForText(args)
	case "tm_click_text":
		return s.clickText(args)
	case "tm_click_region":
		return s.clickRegion(args)
	case "tm_act_on_target":
		return s.actOnTarget(args)
	case "tm_capture_and_annotate":
		screenshotResult, err := s.runtime.Screenshot(args)
		if err != nil {
			return nil, err
		}
		capture := normalizeResultMap(screenshotResult)
		imagePath := serverStringArg(capture, "path")
		if imagePath == "" {
			imagePath = serverStringArg(args, "path")
		}
		if imagePath == "" {
			return nil, fmt.Errorf("screenshot result missing path")
		}
		analyzeArgs := map[string]any{"imagePath": imagePath}
		layout, err := s.runtime.AnalyzeLayout(analyzeArgs)
		if err != nil {
			return nil, err
		}
		annotateArgs := map[string]any{
			"imagePath":  imagePath,
			"regions":    layout["regions"],
			"separators": layout["separators"],
			"outputPath": serverStringArg(args, "outputPath"),
			"title":      serverStringArg(args, "title"),
		}
		annotated, err := s.runtime.AnnotateRegions(annotateArgs)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"ok":          true,
			"capture":     capture,
			"capturePath": imagePath,
			"layout":      layout,
			"annotated":   annotated,
		}, nil
	case "tm_analyze_layout":
		return s.runtime.AnalyzeLayout(args)
	case "tm_annotate_regions":
		return s.runtime.AnnotateRegions(args)
	case "tm_click":
		if mismatch, guarded, err := s.guardExpectedWindow(args); err != nil {
			return nil, err
		} else if guarded && mismatch != nil {
			return mismatch, nil
		}
		if processID, hasProcessID := serverNumberArg(args, "processId"); hasProcessID {
			pidRuntime, ok := s.runtime.(interface{ ClickForPID(map[string]any) error })
			if !ok {
				return nil, fmt.Errorf("PID-scoped click is unavailable")
			}
			if processID <= 0 || math.Trunc(processID) != processID {
				return nil, fmt.Errorf("processId must be a positive integer")
			}
			if err := pidRuntime.ClickForPID(args); err != nil {
				return nil, err
			}
		} else if err := s.runtime.Click(args); err != nil {
			return nil, err
		}
		return ack("click", args), nil
	case "tm_type":
		focusedExpectedWindow, guard, err := s.prepareGuardedRawAction(args)
		if err != nil {
			return nil, err
		}
		if guard != nil {
			return guard, nil
		}
		if err := s.runtime.Type(args); err != nil {
			return nil, err
		}
		return rawActionAck("type", args, focusedExpectedWindow), nil
	case "tm_press_key":
		key := serverStringArg(args, "key")
		if key == "" {
			return nil, fmt.Errorf("key is required")
		}
		focusedExpectedWindow, guard, err := s.prepareGuardedRawAction(args)
		if err != nil {
			return nil, err
		}
		if guard != nil {
			return guard, nil
		}
		if err := s.runtime.PressKey(key); err != nil {
			return nil, err
		}
		return rawActionAck("press_key", args, focusedExpectedWindow), nil
	case "tm_scroll":
		x, hasX := serverNumberArg(args, "x")
		y, hasY := serverNumberArg(args, "y")
		if hasX != hasY {
			return nil, fmt.Errorf("x and y must be provided together")
		}
		focusedExpectedWindow, guard, err := s.prepareGuardedRawAction(args)
		if err != nil {
			return nil, err
		}
		if guard != nil {
			return guard, nil
		}
		if hasX {
			if err := s.runtime.Move(map[string]any{"x": x, "y": y}); err != nil {
				return nil, err
			}
		}
		if err := s.runtime.Scroll(args); err != nil {
			return nil, err
		}
		return rawActionAck("scroll", args, focusedExpectedWindow), nil
	default:
		return nil, fmt.Errorf("unsupported tool: %s", name)
	}
}

func (s *Server) resultResponse(id json.RawMessage, payload any) Response {
	data, err := json.Marshal(payload)
	if err != nil {
		return s.errorResponse(id, ErrCodeInternal, "failed to encode result", err.Error())
	}
	return Response{JSONRPC: "2.0", ID: id, Result: data}
}

func (s *Server) errorResponse(id json.RawMessage, code int, message string, data any) Response {
	if len(id) == 0 {
		id = json.RawMessage("null")
	}
	return Response{JSONRPC: "2.0", ID: id, Error: &ResponseError{Code: code, Message: message, Data: data}}
}

func validateToolArguments(tool Tool, args map[string]any) error {
	return validateObjectSchema("arguments", args, tool.InputSchema)
}

func validateObjectSchema(path string, value map[string]any, schema map[string]any) error {
	if required, ok := schema["required"].([]string); ok {
		for _, name := range required {
			if _, exists := value[name]; !exists {
				return fmt.Errorf("%s.%s is required", path, name)
			}
		}
	}

	properties, _ := schema["properties"].(map[string]any)
	names := make([]string, 0, len(properties))
	for name := range properties {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		item, exists := value[name]
		if !exists {
			continue
		}
		propertySchema, ok := properties[name].(map[string]any)
		if !ok {
			continue
		}
		if err := validateSchemaValue(path+"."+name, item, propertySchema); err != nil {
			return err
		}
	}
	return nil
}

func validateSchemaValue(path string, value any, schema map[string]any) error {
	typeName, _ := schema["type"].(string)
	if typeName != "" && !matchesSchemaType(value, typeName) {
		return fmt.Errorf("%s must be %s", path, typeName)
	}

	if allowed, ok := schema["enum"].([]string); ok {
		actual, isString := value.(string)
		if !isString || !containsSchemaString(allowed, actual) {
			return fmt.Errorf("%s must be one of %s", path, strings.Join(allowed, ", "))
		}
	}

	if typeName == "object" {
		if objectValue, ok := value.(map[string]any); ok {
			return validateObjectSchema(path, objectValue, schema)
		}
	}
	return nil
}

func matchesSchemaType(value any, typeName string) bool {
	switch typeName {
	case "string":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "number":
		switch value.(type) {
		case float64, float32, int, int32, int64, uint, uint32, uint64:
			return true
		default:
			return false
		}
	case "integer":
		switch number := value.(type) {
		case float64:
			return !math.IsNaN(number) && !math.IsInf(number, 0) && number == math.Trunc(number)
		case float32:
			return !math.IsNaN(float64(number)) && !math.IsInf(float64(number), 0) && number == float32(math.Trunc(float64(number)))
		case int, int32, int64, uint, uint32, uint64:
			return true
		default:
			return false
		}
	case "object":
		_, ok := value.(map[string]any)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	default:
		return true
	}
}

func containsSchemaString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func normalizeResultMap(v any) map[string]any {
	if v == nil {
		return map[string]any{"ok": true}
	}
	normalized := normalizeJSONCompatible(v)
	if row, ok := normalized.(map[string]any); ok {
		return row
	}
	return map[string]any{"ok": true, "result": normalized}
}

func normalizeJSONCompatible(v any) any {
	data, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var normalized any
	if err := json.Unmarshal(data, &normalized); err != nil {
		return v
	}
	return normalized
}

func jsonCompatibleMap(v any) map[string]any {
	row, _ := normalizeJSONCompatible(v).(map[string]any)
	return row
}

func jsonCompatibleMapSlice(v any) []map[string]any {
	rows, _ := normalizeJSONCompatible(v).([]any)
	out := make([]map[string]any, 0, len(rows))
	for _, item := range rows {
		if row, ok := item.(map[string]any); ok {
			out = append(out, row)
		}
	}
	return out
}

func (s *Server) waitForText(args map[string]any) (map[string]any, error) {
	target := serverStringArg(args, "target_text")
	timeout := durationArg(args, "timeoutMs", 1000)
	interval := durationArg(args, "intervalMs", 250)
	start := time.Now()
	attempts := 0
	var lastOCR map[string]any
	for {
		attempts++
		ocrResult, err := s.runtime.OCR(args)
		if err != nil {
			return nil, err
		}
		lastOCR = ocrResult
		matchedText, matched := detectMatchedText(ocrResult, target)
		elapsed := time.Since(start)
		if matched {
			return map[string]any{
				"ok":          true,
				"target":      target,
				"matchedText": matchedText,
				"ocr":         ocrResult,
				"attempts":    attempts,
				"elapsedMs":   elapsed.Milliseconds(),
			}, nil
		}
		if elapsed >= timeout {
			return map[string]any{
				"ok":          false,
				"target":      target,
				"matchedText": "",
				"ocr":         lastOCR,
				"attempts":    attempts,
				"elapsedMs":   elapsed.Milliseconds(),
			}, nil
		}
		if interval > 0 {
			time.Sleep(interval)
		}
	}
}

func (s *Server) waitForWindow(args map[string]any) (map[string]any, error) {
	title := serverStringArg(args, "title")
	matchMode := serverStringOrDefault(args, "matchMode", "contains")
	timeout := durationArg(args, "timeoutMs", 1500)
	interval := durationArg(args, "intervalMs", 250)
	start := time.Now()
	attempts := 0
	for {
		attempts++
		if active, err := s.runtime.GetActiveWindow(); err != nil {
			return nil, err
		} else if windowMatches(active, title, matchMode) {
			return map[string]any{"ok": true, "title": title, "matchMode": matchMode, "window": active, "attempts": attempts, "elapsedMs": time.Since(start).Milliseconds()}, nil
		}
		rows, err := s.runtime.ListWindows()
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if windowMatches(row, title, matchMode) {
				return map[string]any{"ok": true, "title": title, "matchMode": matchMode, "window": row, "attempts": attempts, "elapsedMs": time.Since(start).Milliseconds()}, nil
			}
		}
		if time.Since(start) >= timeout {
			return map[string]any{"ok": false, "title": title, "matchMode": matchMode, "attempts": attempts, "elapsedMs": time.Since(start).Milliseconds()}, nil
		}
		if interval > 0 {
			time.Sleep(interval)
		}
	}
}

func (s *Server) clickRegion(args map[string]any) (map[string]any, error) {
	layout, err := s.runtime.AnalyzeLayout(args)
	if err != nil {
		return nil, err
	}
	region, err := findRegion(layout, args)
	if err != nil {
		return nil, err
	}
	candidate := normalizeRegionCandidate(region)
	if mismatch := guardExpectedTargetText(args, candidate); mismatch != nil {
		return mismatch, nil
	}
	clickArgs, err := clickArgsFromCandidate(candidate, serverStringOrDefault(args, "button", "left"))
	if err != nil {
		return nil, err
	}
	if serverBoolArg(args, "dryRun") || serverBoolArg(args, "previewOnly") {
		plan := map[string]any{"ok": true, "action": "click_region", "region": region, "candidate": candidate, "click": clickArgs, "executed": false}
		if serverBoolArg(args, "previewOnly") {
			plan["previewOnly"] = true
		} else {
			plan["dryRun"] = true
		}
		return plan, nil
	}
	if err := s.runtime.Click(clickArgs); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "action": "click_region", "region": region, "candidate": candidate, "click": clickArgs, "executed": true}, nil
}

func (s *Server) clickText(args map[string]any) (map[string]any, error) {
	result, err := s.runtime.DetectUI(args)
	if err != nil {
		return nil, err
	}
	elements := detectUIElements(result)
	if len(elements) == 0 {
		return nil, fmt.Errorf("target text not found")
	}
	candidate := normalizeDetectCandidate(elements[0])
	if mismatch := guardExpectedTargetText(args, candidate); mismatch != nil {
		return mismatch, nil
	}
	clickArgs, err := clickArgsFromCandidate(candidate, serverStringOrDefault(args, "button", "left"))
	if err != nil {
		return nil, err
	}
	if serverBoolArg(args, "dryRun") || serverBoolArg(args, "previewOnly") {
		plan := map[string]any{"ok": true, "action": "click_text", "target": serverStringArg(args, "target_text"), "match": elements[0], "candidate": candidate, "click": clickArgs, "executed": false}
		if serverBoolArg(args, "previewOnly") {
			plan["previewOnly"] = true
		} else {
			plan["dryRun"] = true
		}
		return plan, nil
	}
	if err := s.runtime.Click(clickArgs); err != nil {
		return nil, err
	}
	return map[string]any{"ok": true, "action": "click_text", "target": serverStringArg(args, "target_text"), "match": elements[0], "candidate": candidate, "click": clickArgs, "executed": true}, nil
}

func (s *Server) actOnTarget(args map[string]any) (map[string]any, error) {
	action := serverStringArg(args, "action")
	if action == "" {
		return nil, fmt.Errorf("action is required")
	}
	target, ok := args["target"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("target is required")
	}
	focusedExpectedWindow := false
	if serverBoolArg(args, "focusExpectedWindow") {
		expected := serverStringArg(args, "expectedWindowTitle")
		if expected == "" {
			return nil, fmt.Errorf("expectedWindowTitle is required when focusExpectedWindow is true")
		}
		if err := s.runtime.FocusWindow(expected); err != nil {
			return map[string]any{
				"ok":                    false,
				"executed":              false,
				"guard":                 "expectedWindowTitle",
				"expectedWindowTitle":   expected,
				"focusedExpectedWindow": false,
				"reason":                "failed to focus expected window",
				"focusError":            err.Error(),
			}, nil
		}
		focusedExpectedWindow = true
	}
	if mismatch, guarded, err := s.guardExpectedWindow(args); err != nil {
		return nil, err
	} else if guarded && mismatch != nil {
		if focusedExpectedWindow {
			mismatch["focusedExpectedWindow"] = true
		}
		return mismatch, nil
	}
	candidate := normalizeTargetCandidate(target)
	if mismatch := guardCandidateFreshness(candidate); mismatch != nil {
		freshCandidate, revalidationGuard, err := s.revalidateCandidate(args, candidate)
		if err != nil {
			return nil, err
		}
		if revalidationGuard != nil {
			if focusedExpectedWindow {
				revalidationGuard["focusedExpectedWindow"] = true
			}
			return revalidationGuard, nil
		}
		candidate = normalizeTargetCandidate(freshCandidate)
		if secondMismatch := guardCandidateFreshness(candidate); secondMismatch != nil {
			if focusedExpectedWindow {
				mismatch["focusedExpectedWindow"] = true
			}
			return mismatch, nil
		}
	}
	if mismatch := guardCandidateAmbiguity(args, candidate); mismatch != nil {
		if focusedExpectedWindow {
			mismatch["focusedExpectedWindow"] = true
		}
		return mismatch, nil
	}
	if mismatch := guardExpectedTargetText(args, candidate); mismatch != nil {
		if focusedExpectedWindow {
			mismatch["focusedExpectedWindow"] = true
		}
		return mismatch, nil
	}
	plan := map[string]any{"ok": true, "action": action, "target": candidate, "executed": false}
	if focusedExpectedWindow {
		plan["focusedExpectedWindow"] = true
	}
	switch action {
	case "click":
		clickArgs, err := clickArgsFromCandidate(candidate, serverStringOrDefault(args, "button", "left"))
		if err != nil {
			return nil, err
		}
		plan["click"] = clickArgs
		if serverBoolArg(args, "dryRun") || serverBoolArg(args, "previewOnly") {
			if serverBoolArg(args, "previewOnly") {
				plan["previewOnly"] = true
			} else {
				plan["dryRun"] = true
			}
			return plan, nil
		}
		if err := s.runtime.Click(clickArgs); err != nil {
			return nil, err
		}
		plan["executed"] = true
		return plan, nil
	case "type":
		text := serverStringArg(args, "text")
		if text == "" {
			return nil, fmt.Errorf("text is required")
		}
		typeArgs := map[string]any{"text": text}
		if v, ok := args["pressEnter"]; ok {
			typeArgs["pressEnter"] = v
		}
		plan["type"] = typeArgs
		if serverBoolArg(args, "dryRun") || serverBoolArg(args, "previewOnly") {
			if serverBoolArg(args, "previewOnly") {
				plan["previewOnly"] = true
			} else {
				plan["dryRun"] = true
			}
			return plan, nil
		}
		if err := s.runtime.Type(typeArgs); err != nil {
			return nil, err
		}
		plan["executed"] = true
		return plan, nil
	case "focus":
		title := firstNonEmpty(serverStringArg(target, "title"), serverStringArg(target, "label"), serverStringArg(target, "text"))
		if title == "" {
			return nil, fmt.Errorf("target title/label/text is required for focus")
		}
		plan["focusTitle"] = title
		if serverBoolArg(args, "dryRun") || serverBoolArg(args, "previewOnly") {
			if serverBoolArg(args, "previewOnly") {
				plan["previewOnly"] = true
			} else {
				plan["dryRun"] = true
			}
			return plan, nil
		}
		if err := s.runtime.FocusWindow(title); err != nil {
			return nil, err
		}
		plan["executed"] = true
		return plan, nil
	default:
		return nil, fmt.Errorf("unsupported action: %s", action)
	}
}

func (s *Server) inspectDesktop(args map[string]any) (map[string]any, error) {
	status, err := s.runtime.Status()
	if err != nil {
		return nil, err
	}
	permissions, err := s.runtime.Permissions()
	if err != nil {
		return nil, err
	}
	activeWindow, err := s.runtime.GetActiveWindow()
	if err != nil {
		return nil, err
	}
	displays, err := s.runtime.GetDisplays()
	if err != nil {
		return nil, err
	}
	result := map[string]any{
		"ok":           true,
		"status":       status,
		"permissions":  permissions,
		"activeWindow": activeWindow,
		"displays":     displays,
		"displayCount": len(displays),
	}
	if serverBoolArg(args, "captureScreenshot") {
		screenshot, err := s.runtime.Screenshot(args)
		if err != nil {
			return nil, err
		}
		result["screenshot"] = normalizeResultMap(screenshot)
	}
	return result, nil
}

func (s *Server) findTarget(args map[string]any) (map[string]any, error) {
	strategy := serverStringOrDefault(args, "strategy", "hybrid")
	result := map[string]any{"ok": true, "target": serverStringArg(args, "target_text"), "strategy": strategy}
	var (
		ocr    map[string]any
		detect map[string]any
		layout map[string]any
		err    error
	)
	if strategy == "ocr" || strategy == "hybrid" {
		ocr, err = s.runtime.OCR(args)
		if err != nil {
			if blocker := externalBlockerPayload("ocr", strategy, err); blocker != nil {
				return blocker, nil
			}
			return nil, err
		}
		result["ocr"] = ocr
	}
	if strategy == "detect_ui" || strategy == "hybrid" {
		detect, err = s.runtime.DetectUI(args)
		if err != nil {
			if blocker := externalBlockerPayload("detect_ui", strategy, err); blocker != nil {
				return blocker, nil
			}
			return nil, err
		}
		result["detectUI"] = detect
	}
	if strategy == "layout" || serverBoolArg(args, "includeLayout") || strategy == "hybrid" {
		layout, err = s.runtime.AnalyzeLayout(args)
		if err != nil {
			if blocker := externalBlockerPayload("layout", strategy, err); blocker != nil {
				return blocker, nil
			}
			return nil, err
		}
		result["layout"] = layout
	}
	candidates := buildCandidates(args, ocr, detect, layout)
	bestCandidate, ambiguous, ambiguityReason, ambiguityCandidates := summarizeCandidates(candidates)
	result["candidates"] = candidates
	if bestCandidate != nil {
		result["bestCandidate"] = bestCandidate
	}
	if ambiguous {
		result["ambiguous"] = true
		result["ambiguityReason"] = ambiguityReason
		result["ambiguityCandidates"] = ambiguityCandidates
	}
	return result, nil
}

func (s *Server) guardExpectedWindow(args map[string]any) (map[string]any, bool, error) {
	expected := serverStringArg(args, "expectedWindowTitle")
	if expected == "" {
		return nil, false, nil
	}
	activeWindow, err := s.runtime.GetActiveWindow()
	if err != nil {
		return nil, true, err
	}
	actual := serverStringArg(activeWindow, "title")
	if actual == expected {
		return nil, true, nil
	}
	return map[string]any{
		"ok":                  false,
		"executed":            false,
		"guard":               "expectedWindowTitle",
		"expectedWindowTitle": expected,
		"actualWindowTitle":   actual,
		"activeWindow":        activeWindow,
	}, true, nil
}

func (s *Server) prepareGuardedRawAction(args map[string]any) (bool, map[string]any, error) {
	focusedExpectedWindow := false
	if serverBoolArg(args, "focusExpectedWindow") {
		expected := serverStringArg(args, "expectedWindowTitle")
		if expected == "" {
			return false, map[string]any{
				"ok":                    false,
				"executed":              false,
				"guard":                 "expectedWindowTitle",
				"expectedWindowTitle":   expected,
				"focusedExpectedWindow": false,
				"reason":                "expectedWindowTitle is required when focusExpectedWindow is true",
			}, nil
		}
		if err := s.runtime.FocusWindow(expected); err != nil {
			return false, map[string]any{
				"ok":                    false,
				"executed":              false,
				"guard":                 "expectedWindowTitle",
				"expectedWindowTitle":   expected,
				"focusedExpectedWindow": false,
				"reason":                "failed to focus expected window",
				"focusError":            err.Error(),
			}, nil
		}
		focusedExpectedWindow = true
	}
	mismatch, guarded, err := s.guardExpectedWindow(args)
	if err != nil {
		return focusedExpectedWindow, nil, err
	}
	if guarded && mismatch != nil {
		mismatch["focusedExpectedWindow"] = focusedExpectedWindow
		return focusedExpectedWindow, mismatch, nil
	}
	return focusedExpectedWindow, nil, nil
}

func guardExpectedTargetText(args map[string]any, candidate map[string]any) map[string]any {
	expected := serverStringArg(args, "expectedTargetText")
	if expected == "" {
		return nil
	}
	actual := firstNonEmpty(serverStringArg(candidate, "text"), serverStringArg(candidate, "label"))
	if strings.Contains(strings.TrimSpace(actual), strings.TrimSpace(expected)) {
		return nil
	}
	return map[string]any{
		"ok":                 false,
		"executed":           false,
		"guard":              "expectedTargetText",
		"expectedTargetText": expected,
		"actualTargetText":   actual,
		"candidate":          candidate,
	}
}

func detectUIElements(result map[string]any) []map[string]any {
	return jsonCompatibleMapSlice(result["elements"])
}

func buildCandidates(args, ocr, detect, layout map[string]any) []any {
	targetText := serverStringArg(args, "target_text")
	staleAfterMs, hasStaleAfter := serverNumberArg(args, "staleAfterMs")
	capturedAt := time.Now().UTC().Format(time.RFC3339Nano)
	candidates := make([]map[string]any, 0)
	for _, element := range detectUIElements(detect) {
		candidate := normalizeDetectCandidate(element)
		candidate["capturedAt"] = capturedAt
		if hasStaleAfter {
			candidate["staleAfterMs"] = staleAfterMs
		}
		candidate["matchScore"] = scoreCandidate(candidate, targetText)
		candidates = append(candidates, candidate)
	}
	if layout != nil {
		for _, region := range layoutRegions(layout) {
			candidate := normalizeRegionCandidate(region)
			candidate["capturedAt"] = capturedAt
			if hasStaleAfter {
				candidate["staleAfterMs"] = staleAfterMs
			}
			candidate["matchScore"] = scoreCandidate(candidate, targetText)
			candidates = append(candidates, candidate)
		}
	}
	for _, line := range ocrLineCandidates(ocr) {
		candidate := normalizeOCRCandidate(line)
		candidate["capturedAt"] = capturedAt
		if hasStaleAfter {
			candidate["staleAfterMs"] = staleAfterMs
		}
		candidate["matchScore"] = scoreCandidate(candidate, targetText)
		candidates = append(candidates, candidate)
	}
	if len(candidates) == 0 {
		if text := serverStringArg(ocr, "text"); text != "" {
			candidate := map[string]any{"source": "ocr", "text": text, "capturedAt": capturedAt, "matchScore": scoreTextMatch(text, targetText)}
			if hasStaleAfter {
				candidate["staleAfterMs"] = staleAfterMs
			}
			candidates = append(candidates, candidate)
		}
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return candidateScoreValue(candidates[i]) > candidateScoreValue(candidates[j])
	})
	out := make([]any, 0, len(candidates))
	for _, candidate := range candidates {
		out = append(out, candidate)
	}
	return out
}

func summarizeCandidates(candidates []any) (map[string]any, bool, string, []any) {
	if len(candidates) == 0 {
		return nil, false, "", nil
	}
	best, ok := candidates[0].(map[string]any)
	if !ok {
		return nil, false, "", nil
	}
	if len(candidates) < 2 {
		return best, false, "", nil
	}
	second, ok := candidates[1].(map[string]any)
	if !ok {
		return best, false, "", nil
	}
	bestScore := candidateScoreValue(best)
	secondScore := candidateScoreValue(second)
	bestText := strings.TrimSpace(firstNonEmpty(serverStringArg(best, "text"), serverStringArg(best, "label")))
	secondText := strings.TrimSpace(firstNonEmpty(serverStringArg(second, "text"), serverStringArg(second, "label")))
	if bestText != "" && bestText == secondText && bestScore-secondScore <= 0.05 {
		best["ambiguous"] = true
		second["ambiguous"] = true
		return best, true, "top candidates have similar scores for the same target text", []any{best, second}
	}
	return best, false, "", nil
}

func guardCandidateFreshness(candidate map[string]any) map[string]any {
	capturedAt := serverStringArg(candidate, "capturedAt")
	staleAfterMs, ok := serverNumberArg(candidate, "staleAfterMs")
	if capturedAt == "" || !ok || staleAfterMs <= 0 {
		return nil
	}
	ts, err := time.Parse(time.RFC3339Nano, capturedAt)
	if err != nil {
		if fallback, fallbackErr := time.Parse(time.RFC3339, capturedAt); fallbackErr == nil {
			ts = fallback
		} else {
			return map[string]any{"ok": false, "executed": false, "guard": "staleTarget", "reason": "candidate capturedAt is invalid", "candidate": candidate}
		}
	}
	ageMs := time.Since(ts).Milliseconds()
	if ageMs <= int64(staleAfterMs) {
		return nil
	}
	return map[string]any{"ok": false, "executed": false, "guard": "staleTarget", "ageMs": ageMs, "staleAfterMs": staleAfterMs, "candidate": candidate}
}

func guardCandidateAmbiguity(args, candidate map[string]any) map[string]any {
	if !serverBoolArg(candidate, "ambiguous") {
		return nil
	}
	if serverBoolArg(args, "allowAmbiguous") {
		return nil
	}
	reason := firstNonEmpty(serverStringArg(candidate, "ambiguityReason"), "candidate is marked ambiguous")
	hostHint := firstNonEmpty(serverStringArg(candidate, "hostHint"), "refresh target discovery or ask the host/user to disambiguate before acting")
	return map[string]any{
		"ok":        false,
		"executed":  false,
		"guard":     "ambiguousTarget",
		"reason":    reason,
		"hostHint":  hostHint,
		"candidate": candidate,
	}
}

func buildRevalidationArgs(args, candidate map[string]any) map[string]any {
	if candidate == nil {
		return nil
	}
	targetText := strings.TrimSpace(firstNonEmpty(serverStringArg(candidate, "text"), serverStringArg(candidate, "label")))
	if targetText == "" {
		return nil
	}
	revalidation := map[string]any{"target_text": targetText}
	if imagePath := serverStringArg(args, "imagePath"); imagePath != "" {
		revalidation["imagePath"] = imagePath
	}
	if image := serverStringArg(args, "image"); image != "" {
		revalidation["image"] = image
	}
	strategy := serverStringOrDefault(args, "strategy", "hybrid")
	revalidation["strategy"] = strategy
	if strategy == "layout" {
		revalidation["strategy"] = "hybrid"
	}
	return revalidation
}

func (s *Server) revalidateCandidate(args, candidate map[string]any) (map[string]any, map[string]any, error) {
	revalidationArgs := buildRevalidationArgs(args, candidate)
	if revalidationArgs == nil {
		return candidate, nil, nil
	}
	result, err := s.findTarget(revalidationArgs)
	if err != nil {
		return nil, nil, err
	}
	freshCandidate, _ := result["bestCandidate"].(map[string]any)
	if freshCandidate == nil {
		return nil, map[string]any{
			"ok":           false,
			"executed":     false,
			"guard":        "revalidationFailed",
			"reason":       "target could not be revalidated before action",
			"hostHint":     "run tm_inspect_desktop and tm_find_target again on the live screen before acting",
			"candidate":    candidate,
			"revalidation": result,
		}, nil
	}
	return freshCandidate, nil, nil
}

func externalBlockerPayload(step, strategy string, err error) map[string]any {
	if err == nil {
		return nil
	}
	message := strings.TrimSpace(err.Error())
	if !strings.Contains(message, "PADDLE_OCR_ENDPOINT is required for paddle provider") {
		return nil
	}
	remediationHint := "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, then rerun tm_inspect_desktop -> tm_find_target -> tm_act_on_target"
	hostHint := "do not treat layout region labels as real text/UI target discovery while OCR/detect-ui is blocked"
	switch {
	case step == "ocr" && strategy == "ocr":
		remediationHint = "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr with a fresh screenshot/imagePath, and only if that succeeds continue to tm_find_target -> tm_act_on_target"
		hostHint = "stop after this structured blocker; do not rerun tm_detect_ui/tm_find_target or treat layout region labels as real text/UI targets until OCR provider config is restored"
	case step == "detect_ui" && strategy == "detect_ui":
		remediationHint = "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr first, and only if tm_ocr succeeds continue to tm_detect_ui/tm_find_target -> tm_act_on_target"
		hostHint = "stop after this structured blocker; do not treat layout region labels as real text/UI targets or keep retrying detect_ui/hybrid until OCR provider config is restored"
	case strategy == "ocr" || strategy == "detect_ui" || strategy == "hybrid":
		remediationHint = "set PADDLE_OCR_ENDPOINT for the paddle OCR provider, rerun tm_ocr first, then rerun tm_inspect_desktop -> tm_find_target -> tm_act_on_target"
		hostHint = "do not treat layout region labels as real text/UI target discovery while OCR/detect-ui is blocked; after tm_ocr recovers, resume the real inspect -> find -> act loop"
	}
	return map[string]any{
		"ok":                  false,
		"executed":            false,
		"action":              "find_target",
		"guard":               "externalBlocker",
		"externalBlocker":     true,
		"blockerType":         "provider_missing",
		"provider":            "paddle",
		"missingConfigKey":    "PADDLE_OCR_ENDPOINT",
		"recoverable":         true,
		"retryRecommended":    false,
		"requiresHumanConfig": true,
		"failedStep":          step,
		"strategy":            strategy,
		"rootCause":           "PADDLE_OCR_ENDPOINT is required for paddle provider",
		"wrappedError":        message,
		"reason":              "required OCR provider is not configured on this host",
		"remediationHint":     remediationHint,
		"hostHint":            hostHint,
	}
}

func wrapRuntimeError(action string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s failed: %w", action, err)
}

func ocrLineCandidates(ocr map[string]any) []map[string]any {
	return jsonCompatibleMapSlice(ocr["lines"])
}

func layoutRegions(layout map[string]any) []map[string]any {
	return jsonCompatibleMapSlice(layout["regions"])
}

func normalizeOCRCandidate(line map[string]any) map[string]any {
	candidate := normalizeTargetCandidate(line)
	candidate["source"] = firstNonEmpty(serverStringArg(candidate, "source"), "ocr_line")
	if candidate["text"] == nil {
		candidate["text"] = serverStringArg(line, "text")
	}
	if candidate["bounds"] == nil {
		candidate["bounds"] = line["bounds"]
	}
	if candidate["clickPoint"] == nil {
		if bounds, ok := line["bounds"].(map[string]any); ok {
			x, y, err := centerPoint(bounds)
			if err == nil {
				candidate["clickPoint"] = map[string]any{"x": x, "y": y}
			}
		}
	}
	if candidate["confidence"] == nil {
		if value, ok := line["confidence"]; ok {
			candidate["confidence"] = value
		}
	}
	return candidate
}

func scoreCandidate(candidate map[string]any, target string) float64 {
	base := scoreTextMatch(firstNonEmpty(serverStringArg(candidate, "text"), serverStringArg(candidate, "label")), target)
	switch serverStringArg(candidate, "source") {
	case "detect_ui":
		base += 0.3
	case "layout":
		base += 0.1
	case "ocr_line":
		base += 0.05
	}
	if confidence, ok := serverNumberArg(candidate, "confidence"); ok {
		base += confidence
	}
	return base
}

func scoreTextMatch(actual, target string) float64 {
	actual = strings.TrimSpace(actual)
	target = strings.TrimSpace(target)
	if actual == "" || target == "" {
		return 0
	}
	if actual == target {
		return 2
	}
	if strings.Contains(actual, target) {
		return 1
	}
	return 0
}

func candidateScoreValue(candidate map[string]any) float64 {
	if score, ok := serverNumberArg(candidate, "matchScore"); ok {
		return score
	}
	return 0
}

func normalizeTargetCandidate(target map[string]any) map[string]any {
	target = jsonCompatibleMap(target)
	candidate := map[string]any{}
	for _, key := range []string{"source", "text", "label", "bounds", "clickPoint", "confidence", "regionId", "role", "title", "capturedAt", "staleAfterMs", "ambiguous", "matchScore"} {
		if value, ok := target[key]; ok {
			candidate[key] = value
		}
	}
	if candidate["bounds"] == nil {
		if bounds, ok := target["bbox"].(map[string]any); ok {
			candidate["bounds"] = bounds
		}
	}
	if candidate["clickPoint"] == nil {
		if clickPoint, ok := target["center"].(map[string]any); ok {
			candidate["clickPoint"] = clickPoint
		}
	}
	if candidate["clickPoint"] == nil {
		if bounds, ok := candidate["bounds"].(map[string]any); ok {
			x, y, err := centerPoint(bounds)
			if err == nil {
				candidate["clickPoint"] = map[string]any{"x": x, "y": y}
			}
		}
	}
	if candidate["confidence"] == nil {
		if score, ok := target["score"]; ok {
			candidate["confidence"] = score
		}
	}
	return candidate
}

func normalizeDetectCandidate(element map[string]any) map[string]any {
	candidate := normalizeTargetCandidate(element)
	candidate["source"] = firstNonEmpty(serverStringArg(candidate, "source"), "detect_ui")
	if candidate["text"] == nil {
		candidate["text"] = firstNonEmpty(serverStringArg(element, "text"), serverStringArg(element, "label"))
	}
	if candidate["clickPoint"] == nil {
		candidate["clickPoint"] = element["clickPoint"]
	}
	if candidate["bounds"] == nil {
		if bounds, ok := element["bounds"].(map[string]any); ok {
			candidate["bounds"] = bounds
		} else if clickPoint, ok := element["clickPoint"].(map[string]any); ok {
			candidate["bounds"] = map[string]any{"x": clickPoint["x"], "y": clickPoint["y"], "width": float64(0), "height": float64(0)}
		}
	}
	if candidate["confidence"] == nil {
		if value, ok := element["confidence"]; ok {
			candidate["confidence"] = value
		}
	}
	if candidate["role"] == nil {
		if value, ok := element["role"]; ok {
			candidate["role"] = value
		}
	}
	return candidate
}

func normalizeRegionCandidate(region map[string]any) map[string]any {
	candidate := normalizeTargetCandidate(region)
	candidate["source"] = firstNonEmpty(serverStringArg(candidate, "source"), "layout")
	if candidate["label"] == nil {
		candidate["label"] = serverStringArg(region, "label")
	}
	if candidate["text"] == nil {
		candidate["text"] = serverStringArg(region, "label")
	}
	if candidate["regionId"] == nil {
		candidate["regionId"] = serverStringArg(region, "id")
	}
	if candidate["role"] == nil {
		candidate["role"] = serverStringArg(region, "role")
	}
	if candidate["bounds"] == nil {
		candidate["bounds"] = region["bounds"]
	}
	if candidate["clickPoint"] == nil {
		if bounds, ok := region["bounds"].(map[string]any); ok {
			x, y, err := centerPoint(bounds)
			if err == nil {
				candidate["clickPoint"] = map[string]any{"x": x, "y": y}
			}
		}
	}
	if candidate["confidence"] == nil {
		if value, ok := region["confidence"]; ok {
			candidate["confidence"] = value
		}
	}
	return candidate
}

func clickArgsFromCandidate(candidate map[string]any, button string) (map[string]any, error) {
	clickPoint, ok := candidate["clickPoint"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("candidate clickPoint is required")
	}
	x, okX := serverNumberArg(clickPoint, "x")
	y, okY := serverNumberArg(clickPoint, "y")
	if !okX || !okY {
		return nil, fmt.Errorf("candidate clickPoint must include x and y")
	}
	return map[string]any{"x": x, "y": y, "button": button}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func serverNumberArg(args map[string]any, key string) (float64, bool) {
	if args == nil {
		return 0, false
	}
	switch v := args[key].(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	default:
		return 0, false
	}
}

func serverStringOrDefault(args map[string]any, key, fallback string) string {
	if args != nil {
		if v, ok := args[key].(string); ok && strings.TrimSpace(v) != "" {
			return v
		}
	}
	return fallback
}

func serverBoolArg(args map[string]any, key string) bool {
	if args == nil {
		return false
	}
	v, _ := args[key].(bool)
	return v
}

func ack(action string, args map[string]any) map[string]any {
	return map[string]any{"ok": true, "action": action, "arguments": args}
}

func rawActionAck(action string, args map[string]any, focusedExpectedWindow bool) map[string]any {
	return map[string]any{
		"ok":                    true,
		"action":                action,
		"arguments":             args,
		"executed":              true,
		"focusedExpectedWindow": focusedExpectedWindow,
	}
}

func mustJSONString(v any) string {
	data, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf(`{"ok":false,"error":%q}`, err.Error())
	}
	return string(data)
}

func serverStringArg(args map[string]any, key string) string {
	if args == nil {
		return ""
	}
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func detectMatchedText(ocrResult map[string]any, target string) (string, bool) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", false
	}
	if text, ok := ocrResult["text"].(string); ok && strings.Contains(text, target) {
		return target, true
	}
	for _, row := range ocrLineCandidates(ocrResult) {
		lineText, _ := row["text"].(string)
		if strings.Contains(strings.TrimSpace(lineText), target) {
			return lineText, true
		}
	}
	return "", false
}

func durationArg(args map[string]any, key string, fallbackMs int) time.Duration {
	if value, ok := serverNumberArg(args, key); ok && value >= 0 {
		return time.Duration(value) * time.Millisecond
	}
	return time.Duration(fallbackMs) * time.Millisecond
}

func windowMatches(window map[string]any, title, matchMode string) bool {
	candidate := strings.TrimSpace(serverStringArg(window, "title"))
	target := strings.TrimSpace(title)
	if candidate == "" || target == "" {
		return false
	}
	switch matchMode {
	case "exact":
		return candidate == target
	default:
		return strings.Contains(candidate, target)
	}
}

func findRegion(layout map[string]any, args map[string]any) (map[string]any, error) {
	regionID := serverStringArg(args, "regionId")
	role := serverStringArg(args, "role")
	label := serverStringArg(args, "label")
	for _, region := range layoutRegions(layout) {
		if regionID != "" && serverStringArg(region, "id") == regionID {
			return region, nil
		}
		if regionID == "" && role != "" && serverStringArg(region, "role") != role {
			continue
		}
		if regionID == "" && label != "" && !strings.Contains(serverStringArg(region, "label"), label) {
			continue
		}
		if regionID == "" && (role != "" || label != "") {
			return region, nil
		}
	}
	return nil, fmt.Errorf("matching region not found")
}

func centerPoint(bounds map[string]any) (float64, float64, error) {
	x, okX := serverNumberArg(bounds, "x")
	y, okY := serverNumberArg(bounds, "y")
	w, okW := serverNumberArg(bounds, "width")
	h, okH := serverNumberArg(bounds, "height")
	if !okX || !okY || !okW || !okH {
		return 0, 0, fmt.Errorf("region bounds must include x, y, width, height")
	}
	return x + w/2, y + h/2, nil
}

func toolOrder() []string {
	return []string{
		"tm_status",
		"tm_recorder_start",
		"tm_recorder_annotate",
		"tm_recorder_status",
		"tm_recorder_verify",
		"tm_recorder_stop",
		"tm_recorder_distill",
		"tm_recorder_compile",
		"tm_permissions",
		"tm_request_permissions",
		"tm_list_windows",
		"tm_get_active_window",
		"tm_focus_window",
		"tm_wait_for_window",
		"tm_focus_and_type",
		"tm_inspect_desktop",
		"tm_find_target",
		"tm_act_on_target",
		"tm_list_displays",
		"tm_screenshot",
		"tm_ocr",
		"tm_detect_ui",
		"tm_wait_for_text",
		"tm_click_text",
		"tm_capture_and_annotate",
		"tm_analyze_layout",
		"tm_annotate_regions",
		"tm_click_region",
		"tm_click",
		"tm_type",
		"tm_press_key",
		"tm_scroll",
	}
}

func builtinTools() []Tool {
	obj := func(properties map[string]any, required ...string) map[string]any {
		schema := map[string]any{"type": "object", "properties": properties, "additionalProperties": true}
		if len(required) > 0 {
			schema["required"] = required
		}
		return schema
	}
	tools := []Tool{
		{Name: "tm_status", Description: "Runtime health/status snapshot", InputSchema: obj(map[string]any{})},
		{Name: "tm_recorder_start", Description: "Start an explicit Agent-first Recorder session", InputSchema: obj(map[string]any{"goal": map[string]any{"type": "string", "description": "Business goal for this recording"}, "executionId": map[string]any{"type": "string", "description": "Optional host execution identity"}, "recordingSessionId": map[string]any{"type": "string", "description": "Optional caller-provided unique session id"}, "observationPolicy": map[string]any{"type": "string", "enum": []string{"minimal", "standard", "enriched"}, "description": "Observation policy; standard by default"}}, "goal")},
		{Name: "tm_recorder_annotate", Description: "Attach a structured Agent hint to an active Recorder session", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}, "executionId": map[string]any{"type": "string"}, "hint": recorderHintSchema(), "fields": map[string]any{"type": "object"}}, "recordingSessionId", "hint")},
		{Name: "tm_recorder_status", Description: "Return Recorder session status and artifact paths", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}}, "recordingSessionId")},
		{Name: "tm_recorder_verify", Description: "Attach evidence-backed verification to a recorded action", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}, "executionId": map[string]any{"type": "string"}, "actionId": map[string]any{"type": "string"}, "verification": map[string]any{"type": "object", "properties": map[string]any{"status": map[string]any{"type": "string", "enum": []string{"pass", "warn", "fail", "unknown"}}, "postconditions": map[string]any{"type": "array"}, "actual": map[string]any{"type": "object"}, "evidenceRefs": map[string]any{"type": "array"}, "failureClass": map[string]any{"type": "string"}, "message": map[string]any{"type": "string"}}, "required": []string{"status"}}}, "recordingSessionId", "actionId", "verification")},
		{Name: "tm_recorder_stop", Description: "Stop an active Recorder session without rewriting its raw trace", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}}, "recordingSessionId")},
		{Name: "tm_recorder_distill", Description: "Distill a stopped immutable raw trace into deterministic Flow IR", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}}, "recordingSessionId")},
		{Name: "tm_recorder_compile", Description: "Compile a distilled Flow IR into deterministic OpenDesk JavaScript", InputSchema: obj(map[string]any{"recordingSessionId": map[string]any{"type": "string"}, "replayConfigPath": map[string]any{"type": "string"}}, "recordingSessionId")},
		{Name: "tm_permissions", Description: "macOS automation/screenshot permission snapshot", InputSchema: obj(map[string]any{})},
		{Name: "tm_request_permissions", Description: "Open macOS privacy settings and trigger permission probes", InputSchema: obj(map[string]any{"openSettings": map[string]any{"type": "boolean", "description": "Open System Settings if supported"}, "section": map[string]any{"type": "string", "description": "Optional macOS privacy section hint"}})},
		{Name: "tm_list_windows", Description: "List visible windows; low-level fields in each row are best-effort metadata, not a stable cross-platform contract", InputSchema: obj(map[string]any{})},
		{Name: "tm_get_active_window", Description: "Return the current active window; low-level metadata fields are best-effort and not a stable cross-platform contract", InputSchema: obj(map[string]any{})},
		{Name: "tm_focus_window", Description: "Focus a window by title", InputSchema: obj(map[string]any{"title": map[string]any{"type": "string", "description": "Window title to focus"}}, "title")},
		{Name: "tm_wait_for_window", Description: "Poll windows until a matching title appears or becomes active", InputSchema: obj(map[string]any{"title": map[string]any{"type": "string", "description": "Window title to match"}, "timeoutMs": map[string]any{"type": "integer", "description": "Total wait timeout in milliseconds"}, "intervalMs": map[string]any{"type": "integer", "description": "Polling interval in milliseconds"}, "matchMode": map[string]any{"type": "string", "enum": []string{"exact", "contains"}, "description": "How to compare the title"}}, "title")},
		{Name: "tm_focus_and_type", Description: "Focus a window by title and type text into it", InputSchema: obj(map[string]any{"title": map[string]any{"type": "string", "description": "Window title to focus"}, "text": map[string]any{"type": "string", "description": "Text to type after focus"}, "pressEnter": map[string]any{"type": "boolean", "description": "Press Enter after typing"}}, "title", "text")},
		{Name: "tm_inspect_desktop", Description: "Aggregate status, permissions, active window, displays, and optional screenshot into one desktop snapshot", InputSchema: obj(map[string]any{"captureScreenshot": map[string]any{"type": "boolean", "description": "Capture a screenshot as part of the inspection"}, "path": map[string]any{"type": "string", "description": "Optional screenshot path when captureScreenshot is true"}, "target": map[string]any{"type": "string", "enum": []string{"screen", "activeWindow"}, "description": "Screenshot target when captureScreenshot is true"}, "returnType": map[string]any{"type": "string", "enum": []string{"base64", "bytes", "path", "object", "none"}, "description": "Screenshot result representation when captureScreenshot is true"}})},
		{Name: "tm_find_target", Description: "Return OCR, detect-ui, and optional layout evidence for a target so the host can decide the next action", InputSchema: obj(map[string]any{"target_text": map[string]any{"type": "string", "description": "Target text to search for"}, "imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "includeLayout": map[string]any{"type": "boolean", "description": "Include layout analysis in the result"}, "strategy": map[string]any{"type": "string", "enum": []string{"ocr", "detect_ui", "layout", "hybrid"}, "description": "Preferred evidence strategy"}, "staleAfterMs": map[string]any{"type": "integer", "description": "Optional freshness window to stamp onto returned candidates"}})},
		{Name: "tm_act_on_target", Description: "Execute a planned click, type, or focus action against a normalized target candidate", InputSchema: obj(map[string]any{"target": map[string]any{"type": "object", "description": "Candidate target from tm_find_target/tm_click_region/detect-ui/layout", "properties": map[string]any{"source": map[string]any{"type": "string", "description": "Source of the candidate"}, "text": map[string]any{"type": "string", "description": "Primary target text"}, "label": map[string]any{"type": "string", "description": "Primary target label"}, "bounds": map[string]any{"type": "object", "description": "Bounding box if available"}, "clickPoint": map[string]any{"type": "object", "description": "Resolved click point if available"}, "confidence": map[string]any{"type": "number", "description": "Confidence score when available"}, "regionId": map[string]any{"type": "string", "description": "Region id when the source is layout"}, "role": map[string]any{"type": "string", "description": "Role when available"}, "title": map[string]any{"type": "string", "description": "Window title when the target represents a window"}, "capturedAt": map[string]any{"type": "string", "description": "RFC3339/RFC3339Nano timestamp for freshness checks"}, "staleAfterMs": map[string]any{"type": "integer", "description": "Candidate freshness budget in milliseconds"}, "ambiguous": map[string]any{"type": "boolean", "description": "Whether the candidate should be treated as ambiguous by default"}, "matchScore": map[string]any{"type": "number", "description": "Host-facing ranking score for this candidate"}}}, "action": map[string]any{"type": "string", "enum": []string{"click", "type", "focus"}, "description": "Action to execute against the target"}, "text": map[string]any{"type": "string", "description": "Text payload for action=type"}, "button": map[string]any{"type": "string", "enum": []string{"left", "right", "middle"}, "description": "Mouse button for action=click"}, "pressEnter": map[string]any{"type": "boolean", "description": "Press Enter after action=type"}, "expectedWindowTitle": map[string]any{"type": "string", "description": "Optional active-window guard before acting"}, "focusExpectedWindow": map[string]any{"type": "boolean", "description": "Atomically focus and verify expectedWindowTitle before the remaining guards and action"}, "expectedTargetText": map[string]any{"type": "string", "description": "Optional target-text guard before acting"}, "allowAmbiguous": map[string]any{"type": "boolean", "description": "Allow execution even if the candidate is marked ambiguous"}, "dryRun": map[string]any{"type": "boolean", "description": "Return the planned action without executing"}, "previewOnly": map[string]any{"type": "boolean", "description": "Alias of dryRun for plan-only usage"}}, "target", "action")},
		{Name: "tm_list_displays", Description: "List displays and virtual bounds metadata", InputSchema: obj(map[string]any{})},
		{Name: "tm_screenshot", Description: "Capture screenshot using OpenDesk runtime", InputSchema: obj(map[string]any{"path": map[string]any{"type": "string", "description": "Optional output path"}, "target": map[string]any{"type": "string", "enum": []string{"screen", "activeWindow"}, "description": "Capture target"}, "returnType": map[string]any{"type": "string", "enum": []string{"base64", "bytes", "path", "object", "none"}, "description": "Screenshot result representation"}, "fullPage": map[string]any{"type": "boolean", "description": "Request a full target capture when supported"}, "displayIndex": map[string]any{"type": "integer", "description": "Specific display index"}, "clip": map[string]any{"type": "object", "description": "Optional clip rectangle"}})},
		{Name: "tm_ocr", Description: "Run OCR over image bytes/path/base64", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "provider": map[string]any{"type": "string", "description": "Optional OCR provider override"}, "lang": map[string]any{"type": "string", "description": "Optional OCR language hint"}})},
		{Name: "tm_detect_ui", Description: "Detect text target from UI screenshot", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "target_text": map[string]any{"type": "string", "description": "Target text to locate"}}, "target_text")},
		{Name: "tm_wait_for_text", Description: "Poll OCR until target text is present or timeout expires", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "target_text": map[string]any{"type": "string", "description": "Target text to wait for"}, "timeoutMs": map[string]any{"type": "integer", "description": "Total wait timeout in milliseconds"}, "intervalMs": map[string]any{"type": "integer", "description": "Polling interval in milliseconds"}}, "target_text")},
		{Name: "tm_click_text", Description: "Find target text via OCR/detect-ui and click its center point", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "target_text": map[string]any{"type": "string", "description": "Target text to click"}, "matchMode": map[string]any{"type": "string", "enum": []string{"exact", "contains"}, "description": "Text matching mode"}, "minConfidence": map[string]any{"type": "number", "description": "Minimum confidence threshold when supported"}, "button": map[string]any{"type": "string", "enum": []string{"left", "right", "middle"}, "description": "Mouse button to click"}, "expectedTargetText": map[string]any{"type": "string", "description": "Optional matched-text guard before clicking"}, "dryRun": map[string]any{"type": "boolean", "description": "Return the planned click without executing"}, "previewOnly": map[string]any{"type": "boolean", "description": "Alias of dryRun for preview-only planning"}}, "target_text")},
		{Name: "tm_capture_and_annotate", Description: "Capture a screenshot, analyze layout, then emit an annotated image result", InputSchema: obj(map[string]any{"path": map[string]any{"type": "string", "description": "Optional screenshot output path"}, "target": map[string]any{"type": "string", "enum": []string{"screen", "activeWindow"}, "description": "Capture target"}, "returnType": map[string]any{"type": "string", "enum": []string{"path", "object"}, "description": "Screenshot result representation; capture-and-annotate requires a path-bearing result"}, "outputPath": map[string]any{"type": "string", "description": "Annotated image output path"}, "title": map[string]any{"type": "string", "description": "Optional annotation title"}})},
		{Name: "tm_analyze_layout", Description: "Analyze layout regions/separators from screenshot", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "title": map[string]any{"type": "string", "description": "Optional analysis title"}})},
		{Name: "tm_annotate_regions", Description: "Annotate layout regions and export png/base64", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "regions": map[string]any{"type": "array", "description": "Layout regions to annotate"}, "outputPath": map[string]any{"type": "string", "description": "Annotated image output path"}})},
		{Name: "tm_click_region", Description: "Find a layout region by id or filters and click its center point", InputSchema: obj(map[string]any{"imagePath": map[string]any{"type": "string", "description": "Path to source image"}, "image": map[string]any{"type": "string", "description": "Base64 image payload"}, "regionId": map[string]any{"type": "string", "description": "Exact region id from analyze_layout"}, "role": map[string]any{"type": "string", "description": "Optional region role filter"}, "label": map[string]any{"type": "string", "description": "Optional region label contains filter"}, "button": map[string]any{"type": "string", "enum": []string{"left", "right", "middle"}, "description": "Mouse button to click"}, "expectedTargetText": map[string]any{"type": "string", "description": "Optional region label/text guard before clicking"}, "dryRun": map[string]any{"type": "boolean", "description": "Return the planned click without executing"}, "previewOnly": map[string]any{"type": "boolean", "description": "Preview the planned click without executing"}})},
		{Name: "tm_click", Description: "Click screen coordinates", InputSchema: obj(map[string]any{"x": map[string]any{"type": "number", "description": "Screen X coordinate"}, "y": map[string]any{"type": "number", "description": "Screen Y coordinate"}, "processId": map[string]any{"type": "integer", "description": "Optional PID for fail-closed macOS AXPress instead of a global click"}, "button": map[string]any{"type": "string", "enum": []string{"left", "right", "middle"}, "description": "Mouse button to click"}, "expectedWindowTitle": map[string]any{"type": "string", "description": "Optional active-window guard; click only if the active window title matches exactly"}, "targetKey": map[string]any{"type": "string", "description": "Stable target key used by deterministic replay state"}, "targetLabel": map[string]any{"type": "string", "description": "Human-readable target label"}, "targetRole": map[string]any{"type": "string", "description": "Expected accessibility role"}, "windowRelative": map[string]any{"type": "object", "description": "Window-relative geometry projection"}, "acceptedLabels": map[string]any{"type": "array", "description": "Allowed accessibility labels"}, "expectedBundleID": map[string]any{"type": "string"}, "expectedAppPath": map[string]any{"type": "string"}}, "x", "y")},
		{Name: "tm_type", Description: "Type text and optional Enter", InputSchema: obj(map[string]any{"text": map[string]any{"type": "string", "description": "Text to type"}, "processId": map[string]any{"type": "integer", "description": "Optional target PID for fail-closed macOS typing"}, "pressEnter": map[string]any{"type": "boolean", "description": "Press Enter after typing"}, "expectedWindowTitle": map[string]any{"type": "string", "description": "Optional exact active-window guard before typing"}, "focusExpectedWindow": map[string]any{"type": "boolean", "description": "Atomically focus and verify expectedWindowTitle before typing"}}, "text")},
		{Name: "tm_press_key", Description: "Press a single key or chord", InputSchema: obj(map[string]any{"key": map[string]any{"type": "string", "description": "Key or chord such as cmd+shift+p"}, "expectedWindowTitle": map[string]any{"type": "string", "description": "Optional exact active-window guard before pressing the key"}, "focusExpectedWindow": map[string]any{"type": "boolean", "description": "Atomically focus and verify expectedWindowTitle before pressing the key"}}, "key")},
		{Name: "tm_scroll", Description: "Scroll mouse wheel", InputSchema: obj(map[string]any{"deltaX": map[string]any{"type": "number", "description": "Horizontal scroll delta"}, "deltaY": map[string]any{"type": "number", "description": "Vertical scroll delta"}, "steps": map[string]any{"type": "integer", "description": "Optional wheel step count"}, "x": map[string]any{"type": "number", "description": "Optional screen X coordinate; must be provided with y to move before scrolling"}, "y": map[string]any{"type": "number", "description": "Optional screen Y coordinate; must be provided with x to move before scrolling"}, "expectedWindowTitle": map[string]any{"type": "string", "description": "Optional exact active-window guard before scrolling"}, "focusExpectedWindow": map[string]any{"type": "boolean", "description": "Atomically focus and verify expectedWindowTitle before scrolling"}})},
	}
	for index := range tools {
		if recordableTool(tools[index].Name) {
			properties, _ := tools[index].InputSchema["properties"].(map[string]any)
			properties["recordingSessionId"] = map[string]any{"type": "string", "description": "Explicit Recorder session returned by tm_recorder_start"}
			properties["executionId"] = map[string]any{"type": "string", "description": "Optional host execution identity"}
			properties["recorderHint"] = recorderHintSchema()
		}
	}
	return tools
}

func recorderHintSchema() map[string]any {
	return map[string]any{
		"type":        "object",
		"description": "Structured Agent semantics; evidence remains authoritative",
		"properties": map[string]any{
			"goal": map[string]any{"type": "string"}, "subgoal": map[string]any{"type": "string"},
			"intent": map[string]any{"type": "string"}, "targetDescription": map[string]any{"type": "string"},
			"expectedPostconditions": map[string]any{"type": "array"}, "risk": map[string]any{"type": "string", "enum": []string{"low", "medium", "high"}},
			"variableHints": map[string]any{"type": "array"}, "recoveryReason": map[string]any{"type": "string"},
		},
	}
}
