// Command stdio-smoke validates the built OpenDesk MCP server through its real
// stdin/stdout transport. It deliberately does not import pkg/mcpserver and it
// never performs a successful desktop action.
package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

const evidenceSchemaVersion = "1.0.0"

type options struct {
	binary      string
	runs        int
	evidenceDir string
	timeout     time.Duration
	exitTimeout time.Duration
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
	Method  string          `json:"method,omitempty"`
}

type toolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema"`
}

type toolsListResult struct {
	Tools []toolDefinition `json:"tools"`
}

type lineResult struct {
	text string
	err  error
}

type childProcess struct {
	cmd        *exec.Cmd
	stdin      io.WriteCloser
	lines      chan lineResult
	stderrDone chan struct{}
	stderr     bytes.Buffer
}

type exitResult struct {
	waited   bool
	timedOut bool
	exitCode int
	err      error
	trailing []lineResult
}

type runResult struct {
	Run                int             `json:"run"`
	StartedAt          string          `json:"startedAt"`
	FinishedAt         string          `json:"finishedAt"`
	DurationMs         int64           `json:"durationMs"`
	Status             string          `json:"status"`
	Checks             map[string]bool `json:"checks"`
	RequestCount       int             `json:"requestCount"`
	NotificationCount  int             `json:"notificationCount"`
	ResponseCount      int             `json:"responseCount"`
	ErrorResponseCount int             `json:"errorResponseCount"`
	StdoutLines        int             `json:"stdoutLines"`
	NonJSONLines       int             `json:"nonJSONLines"`
	ProtocolViolations int             `json:"protocolViolations"`
	UnexpectedLines    int             `json:"unexpectedLines"`
	TimedOut           bool            `json:"timedOut"`
	Waited             bool            `json:"waited"`
	CleanExit          bool            `json:"cleanExit"`
	ExitCode           int             `json:"exitCode"`
	StderrPath         string          `json:"stderrPath"`
	StderrBytes        int             `json:"stderrBytes"`
	StderrSHA256       string          `json:"stderrSha256"`
	StderrNonEmpty     bool            `json:"stderrNonEmpty"`
	PanicObserved      bool            `json:"panicObserved"`
	ToolCount          int             `json:"toolCount,omitempty"`
	ToolNames          []string        `json:"toolNames,omitempty"`
	RegistrySHA256     string          `json:"registrySha256,omitempty"`
	Error              string          `json:"error,omitempty"`
}

type fileMetadata struct {
	Path    string `json:"path"`
	Size    int64  `json:"sizeBytes"`
	SHA256  string `json:"sha256"`
	ModTime string `json:"modTime"`
}

type summary struct {
	SchemaVersion       string       `json:"schemaVersion"`
	StartedAt           string       `json:"startedAt"`
	FinishedAt          string       `json:"finishedAt"`
	DurationMs          int64        `json:"durationMs"`
	Status              string       `json:"status"`
	OS                  string       `json:"os"`
	Arch                string       `json:"arch"`
	Binary              fileMetadata `json:"binary"`
	EvidenceDir         string       `json:"evidenceDir"`
	NDJSONPath          string       `json:"ndjsonPath"`
	ToolsListPath       string       `json:"toolsListPath"`
	SummaryPath         string       `json:"summaryPath"`
	RequestedRuns       int          `json:"requestedRuns"`
	PassedRuns          int          `json:"passedRuns"`
	FailedRuns          int          `json:"failedRuns"`
	InitializePassed    int          `json:"initializePassed"`
	CleanExits          int          `json:"cleanExits"`
	Timeouts            int          `json:"timeouts"`
	PanicCount          int          `json:"panicCount"`
	StdoutNonJSONLines  int          `json:"stdoutNonJSONLines"`
	ProtocolViolations  int          `json:"protocolViolations"`
	UnexpectedStdout    int          `json:"unexpectedStdoutLines"`
	StderrNonEmptyRuns  int          `json:"stderrNonEmptyRuns"`
	RegistryStable      bool         `json:"registryStable"`
	RegistrySnapshots   int          `json:"registrySnapshots"`
	RegistrySHA256      string       `json:"registrySha256,omitempty"`
	ToolCount           int          `json:"toolCount,omitempty"`
	ToolNames           []string     `json:"toolNames,omitempty"`
	Runs                []runResult  `json:"runs"`
	EvidenceWriteErrors []string     `json:"evidenceWriteErrors,omitempty"`
}

type eventRecorder struct {
	file     *os.File
	encoder  *json.Encoder
	sequence int
	err      error
}

func newEventRecorder(path string) (*eventRecorder, error) {
	file, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	return &eventRecorder{file: file, encoder: json.NewEncoder(file)}, nil
}

func (r *eventRecorder) event(run int, eventType string, fields map[string]any) {
	if r == nil || r.err != nil {
		return
	}
	r.sequence++
	value := map[string]any{
		"schemaVersion": evidenceSchemaVersion,
		"sequence":      r.sequence,
		"timestamp":     time.Now().UTC().Format(time.RFC3339Nano),
		"run":           run,
		"type":          eventType,
	}
	for key, field := range fields {
		value[key] = field
	}
	r.err = r.encoder.Encode(value)
}

func (r *eventRecorder) close() error {
	if r == nil {
		return nil
	}
	if syncErr := r.file.Sync(); r.err == nil {
		r.err = syncErr
	}
	if closeErr := r.file.Close(); r.err == nil {
		r.err = closeErr
	}
	return r.err
}

func startChild(binary string) (*childProcess, error) {
	cmd := exec.Command(binary)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("create stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %s: %w", binary, err)
	}

	child := &childProcess{
		cmd:        cmd,
		stdin:      stdin,
		lines:      make(chan lineResult, 64),
		stderrDone: make(chan struct{}),
	}
	go func() {
		defer close(child.lines)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			child.lines <- lineResult{text: scanner.Text()}
		}
		if err := scanner.Err(); err != nil {
			child.lines <- lineResult{err: err}
		}
	}()
	go func() {
		defer close(child.stderrDone)
		_, _ = io.Copy(&child.stderr, stderr)
	}()
	return child, nil
}

func (child *childProcess) finish(timeout time.Duration) exitResult {
	_ = child.stdin.Close()
	result := exitResult{exitCode: -1}
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	// os/exec requires callers using StdoutPipe or StderrPipe to finish reading
	// before Wait runs. Running Wait concurrently can close a pipe underneath
	// Scanner and surface a spurious "file already closed" protocol failure.
	// Drain both streams first; retaining trailing stdout keeps real pollution
	// visible to the protocol validator below.
	lines := (<-chan lineResult)(child.lines)
	stderrDone := (<-chan struct{})(child.stderrDone)
	timeoutC := timer.C
	for lines != nil || stderrDone != nil {
		select {
		case item, ok := <-lines:
			if !ok {
				lines = nil
				continue
			}
			result.trailing = append(result.trailing, item)
		case <-stderrDone:
			stderrDone = nil
		case <-timeoutC:
			result.timedOut = true
			_ = child.cmd.Process.Kill()
			timeoutC = nil
		}
	}

	if result.timedOut {
		result.err = child.cmd.Wait()
		result.waited = true
	} else {
		waitDone := make(chan error, 1)
		go func() { waitDone <- child.cmd.Wait() }()
		select {
		case result.err = <-waitDone:
			result.waited = true
		case <-timer.C:
			result.timedOut = true
			_ = child.cmd.Process.Kill()
			result.err = <-waitDone
			result.waited = true
		}
	}
	if child.cmd.ProcessState != nil {
		result.exitCode = child.cmd.ProcessState.ExitCode()
	}
	return result
}

func sendRaw(child *childProcess, recorder *eventRecorder, run int, kind, raw string) error {
	recorder.event(run, kind, map[string]any{"raw": raw})
	if _, err := io.WriteString(child.stdin, raw+"\n"); err != nil {
		return fmt.Errorf("write %s: %w", kind, err)
	}
	return nil
}

func sendRequest(child *childProcess, recorder *eventRecorder, result *runResult, run, id int, method string, params any) error {
	request := map[string]any{"jsonrpc": "2.0", "id": id, "method": method}
	if params != nil {
		request["params"] = params
	}
	raw, err := json.Marshal(request)
	if err != nil {
		return err
	}
	result.RequestCount++
	return sendRaw(child, recorder, run, "request", string(raw))
}

func sendNotification(child *childProcess, recorder *eventRecorder, result *runResult, run int, method string, params any) error {
	request := map[string]any{"jsonrpc": "2.0", "method": method}
	if params != nil {
		request["params"] = params
	}
	raw, err := json.Marshal(request)
	if err != nil {
		return err
	}
	result.NotificationCount++
	return sendRaw(child, recorder, run, "notification", string(raw))
}

func readResponse(child *childProcess, recorder *eventRecorder, result *runResult, run int, timeout time.Duration) (rpcResponse, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case item, ok := <-child.lines:
		if !ok {
			return rpcResponse{}, errors.New("server stdout closed before the expected response")
		}
		if item.err != nil {
			result.ProtocolViolations++
			recorder.event(run, "stdout_read_error", map[string]any{"error": item.err.Error()})
			return rpcResponse{}, fmt.Errorf("read server stdout: %w", item.err)
		}
		result.StdoutLines++
		recorder.event(run, "stdout_line", map[string]any{"raw": item.text})
		var response rpcResponse
		if err := json.Unmarshal([]byte(item.text), &response); err != nil {
			result.NonJSONLines++
			result.ProtocolViolations++
			return rpcResponse{}, fmt.Errorf("stdout pollution: line is not JSON: %q: %w", item.text, err)
		}
		if response.JSONRPC != "2.0" {
			result.ProtocolViolations++
			return rpcResponse{}, fmt.Errorf("stdout line is not a JSON-RPC 2.0 response: %q", item.text)
		}
		if response.Method != "" {
			result.ProtocolViolations++
			return rpcResponse{}, fmt.Errorf("unexpected server request/notification on stdout: %q", item.text)
		}
		if (len(response.Result) == 0) == (response.Error == nil) {
			result.ProtocolViolations++
			return rpcResponse{}, fmt.Errorf("response must contain exactly one of result or error: %q", item.text)
		}
		result.ResponseCount++
		if response.Error != nil {
			result.ErrorResponseCount++
		}
		return response, nil
	case <-timer.C:
		result.TimedOut = true
		recorder.event(run, "response_timeout", map[string]any{"timeoutMs": timeout.Milliseconds()})
		return rpcResponse{}, fmt.Errorf("timed out after %s waiting for JSON-RPC response", timeout)
	}
}

func requireID(response rpcResponse, want int, result *runResult) error {
	wantID := strconv.Itoa(want)
	if strings.TrimSpace(string(response.ID)) != wantID {
		result.UnexpectedLines++
		result.ProtocolViolations++
		return fmt.Errorf("response id mismatch: want %s, got %s", wantID, printableID(response.ID))
	}
	return nil
}

func printableID(id json.RawMessage) string {
	if len(id) == 0 {
		return "<missing>"
	}
	return string(id)
}

func expectSuccess(response rpcResponse, id int, result *runResult) (json.RawMessage, error) {
	if err := requireID(response, id, result); err != nil {
		return nil, err
	}
	if response.Error != nil {
		return nil, fmt.Errorf("request id=%d returned JSON-RPC error %d: %s", id, response.Error.Code, response.Error.Message)
	}
	return response.Result, nil
}

func expectError(response rpcResponse, id, code int, messagePart string, result *runResult) error {
	if err := requireID(response, id, result); err != nil {
		return err
	}
	if response.Error == nil {
		return fmt.Errorf("request id=%d unexpectedly succeeded", id)
	}
	if response.Error.Code != code {
		return fmt.Errorf("request id=%d error code: want %d, got %d (%s)", id, code, response.Error.Code, response.Error.Message)
	}
	if messagePart != "" && !strings.Contains(strings.ToLower(response.Error.Message), strings.ToLower(messagePart)) {
		return fmt.Errorf("request id=%d error message %q does not contain %q", id, response.Error.Message, messagePart)
	}
	return nil
}

func roundTrip(child *childProcess, recorder *eventRecorder, result *runResult, run, id int, method string, params any, timeout time.Duration) (rpcResponse, error) {
	if err := sendRequest(child, recorder, result, run, id, method, params); err != nil {
		return rpcResponse{}, err
	}
	return readResponse(child, recorder, result, run, timeout)
}

func validateTools(raw json.RawMessage) (toolsListResult, []string, string, error) {
	var list toolsListResult
	if err := json.Unmarshal(raw, &list); err != nil {
		return list, nil, "", fmt.Errorf("decode tools/list result: %w", err)
	}
	if len(list.Tools) == 0 {
		return list, nil, "", errors.New("tools/list returned no tools")
	}
	seen := make(map[string]struct{}, len(list.Tools))
	names := make([]string, 0, len(list.Tools))
	for index, tool := range list.Tools {
		if strings.TrimSpace(tool.Name) == "" {
			return list, nil, "", fmt.Errorf("tools[%d] has an empty name", index)
		}
		if _, exists := seen[tool.Name]; exists {
			return list, nil, "", fmt.Errorf("duplicate tool name %q", tool.Name)
		}
		seen[tool.Name] = struct{}{}
		names = append(names, tool.Name)
		if tool.InputSchema == nil {
			return list, nil, "", fmt.Errorf("tool %q has no inputSchema", tool.Name)
		}
		if schemaType, _ := tool.InputSchema["type"].(string); schemaType != "object" {
			return list, nil, "", fmt.Errorf("tool %q inputSchema.type is %q, want object", tool.Name, schemaType)
		}
		properties, _ := tool.InputSchema["properties"].(map[string]any)
		if properties == nil {
			return list, nil, "", fmt.Errorf("tool %q inputSchema.properties is missing or invalid", tool.Name)
		}
		if required, exists := tool.InputSchema["required"]; exists {
			items, ok := required.([]any)
			if !ok {
				return list, nil, "", fmt.Errorf("tool %q inputSchema.required is not an array", tool.Name)
			}
			for _, item := range items {
				name, ok := item.(string)
				if !ok || name == "" {
					return list, nil, "", fmt.Errorf("tool %q has invalid required entry %#v", tool.Name, item)
				}
				if _, exists := properties[name]; !exists {
					return list, nil, "", fmt.Errorf("tool %q requires undeclared property %q", tool.Name, name)
				}
			}
		}
	}
	for _, requiredTool := range []string{"tm_status", "tm_focus_window", "tm_click"} {
		if _, exists := seen[requiredTool]; !exists {
			return list, nil, "", fmt.Errorf("tools/list is missing smoke dependency %q", requiredTool)
		}
	}
	canonical, err := json.Marshal(list)
	if err != nil {
		return list, nil, "", err
	}
	digest := sha256.Sum256(canonical)
	return list, names, hex.EncodeToString(digest[:]), nil
}

func validateStatusCall(raw json.RawMessage) error {
	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError,omitempty"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("decode tm_status result: %w", err)
	}
	if result.IsError {
		return errors.New("tm_status returned isError=true")
	}
	if len(result.Content) == 0 || result.Content[0].Type != "text" {
		return fmt.Errorf("tm_status returned invalid content: %s", string(raw))
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &payload); err != nil {
		return fmt.Errorf("tm_status text is not a JSON object: %w", err)
	}
	if len(payload) == 0 {
		return errors.New("tm_status returned an empty payload")
	}
	return nil
}

func executeProtocol(child *childProcess, recorder *eventRecorder, result *runResult, opts options, expectedRegistry string) (toolsListResult, string, error) {
	id := func(offset int) int { return result.Run*100 + offset }

	response, err := roundTrip(child, recorder, result, result.Run, id(1), "initialize", map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]any{},
		"clientInfo": map[string]any{
			"name":    "opendesk-stdio-smoke",
			"version": "1.0.0",
		},
	}, opts.timeout)
	if err != nil {
		return toolsListResult{}, "", err
	}
	raw, err := expectSuccess(response, id(1), result)
	if err != nil {
		return toolsListResult{}, "", err
	}
	var initialized struct {
		ProtocolVersion string `json:"protocolVersion"`
		ServerInfo      struct {
			Name string `json:"name"`
		} `json:"serverInfo"`
	}
	if err := json.Unmarshal(raw, &initialized); err != nil {
		return toolsListResult{}, "", fmt.Errorf("decode initialize result: %w", err)
	}
	if initialized.ProtocolVersion == "" || initialized.ServerInfo.Name == "" {
		return toolsListResult{}, "", fmt.Errorf("incomplete initialize result: %s", string(raw))
	}
	result.Checks["initialize"] = true

	if err := sendNotification(child, recorder, result, result.Run, "notifications/initialized", map[string]any{}); err != nil {
		return toolsListResult{}, "", err
	}
	response, err = roundTrip(child, recorder, result, result.Run, id(2), "ping", nil, opts.timeout)
	if err != nil {
		return toolsListResult{}, "", err
	}
	if _, err := expectSuccess(response, id(2), result); err != nil {
		return toolsListResult{}, "", fmt.Errorf("notifications/initialized emitted a response or ping failed: %w", err)
	}
	result.Checks["initialized_notification_silent"] = true
	result.Checks["ping"] = true

	response, err = roundTrip(child, recorder, result, result.Run, id(3), "tools/list", nil, opts.timeout)
	if err != nil {
		return toolsListResult{}, "", err
	}
	raw, err = expectSuccess(response, id(3), result)
	if err != nil {
		return toolsListResult{}, "", err
	}
	tools, names, registryHash, err := validateTools(raw)
	if err != nil {
		return toolsListResult{}, "", err
	}
	if expectedRegistry != "" && registryHash != expectedRegistry {
		return toolsListResult{}, "", fmt.Errorf("tools/list changed across runs: want %s, got %s", expectedRegistry, registryHash)
	}
	result.ToolCount = len(names)
	result.ToolNames = names
	result.RegistrySHA256 = registryHash
	result.Checks["tools_list"] = true
	result.Checks["tool_schemas"] = true

	response, err = roundTrip(child, recorder, result, result.Run, id(4), "tools/call", map[string]any{
		"name": "tm_status", "arguments": map[string]any{},
	}, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	raw, err = expectSuccess(response, id(4), result)
	if err != nil {
		return tools, registryHash, err
	}
	if err := validateStatusCall(raw); err != nil {
		return tools, registryHash, err
	}
	result.Checks["tools_call_status"] = true

	if err := sendRaw(child, recorder, result.Run, "invalid_json_request", `{"jsonrpc":`); err != nil {
		return tools, registryHash, err
	}
	result.RequestCount++
	response, err = readResponse(child, recorder, result, result.Run, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if response.Error == nil || response.Error.Code != -32700 {
		return tools, registryHash, fmt.Errorf("invalid JSON: expected -32700 parse error, got %+v", response.Error)
	}
	if len(response.ID) > 0 && string(response.ID) != "null" {
		return tools, registryHash, fmt.Errorf("invalid JSON response id must be null or absent, got %s", printableID(response.ID))
	}
	result.Checks["invalid_json"] = true

	badVersionID := id(5)
	badVersion := fmt.Sprintf(`{"jsonrpc":"1.0","id":%d,"method":"ping"}`, badVersionID)
	result.RequestCount++
	if err := sendRaw(child, recorder, result.Run, "request", badVersion); err != nil {
		return tools, registryHash, err
	}
	response, err = readResponse(child, recorder, result, result.Run, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if err := expectError(response, badVersionID, -32600, "jsonrpc", result); err != nil {
		return tools, registryHash, err
	}
	result.Checks["bad_jsonrpc_version"] = true

	response, err = roundTrip(child, recorder, result, result.Run, id(6), "opendesk/missing-method", nil, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if err := expectError(response, id(6), -32601, "method", result); err != nil {
		return tools, registryHash, err
	}
	result.Checks["unknown_method"] = true

	response, err = roundTrip(child, recorder, result, result.Run, id(7), "tools/call", map[string]any{
		"name": "tm_missing", "arguments": map[string]any{},
	}, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if err := expectError(response, id(7), -32602, "tool", result); err != nil {
		return tools, registryHash, err
	}
	result.Checks["unknown_tool"] = true

	response, err = roundTrip(child, recorder, result, result.Run, id(8), "tools/call", map[string]any{
		"name": "tm_focus_window", "arguments": map[string]any{},
	}, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if err := expectError(response, id(8), -32602, "title", result); err != nil {
		return tools, registryHash, err
	}
	result.Checks["missing_required_argument"] = true

	// This reaches the action dispatch path but is rejected by schema/button
	// validation before any OS input primitive can run. It is a regression for
	// diagnostic text leaking into the MCP stdout protocol channel.
	response, err = roundTrip(child, recorder, result, result.Run, id(9), "tools/call", map[string]any{
		"name": "tm_click", "arguments": map[string]any{"x": 0, "y": 0, "button": "invalid"},
	}, opts.timeout)
	if err != nil {
		return tools, registryHash, err
	}
	if err := expectError(response, id(9), -32602, "button", result); err != nil {
		return tools, registryHash, err
	}
	result.Checks["invalid_click_rejected_without_action"] = true
	return tools, registryHash, nil
}

func runOnce(opts options, recorder *eventRecorder, run int, expectedRegistry string) (runResult, toolsListResult, string) {
	started := time.Now()
	result := runResult{
		Run:       run,
		StartedAt: started.UTC().Format(time.RFC3339Nano),
		Status:    "failed",
		Checks:    map[string]bool{},
		ExitCode:  -1,
	}
	recorder.event(run, "process_start_requested", map[string]any{"binary": opts.binary})
	child, startErr := startChild(opts.binary)
	if startErr != nil {
		result.Error = startErr.Error()
		result.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
		result.DurationMs = time.Since(started).Milliseconds()
		recorder.event(run, "run_result", map[string]any{"result": result})
		return result, toolsListResult{}, ""
	}
	recorder.event(run, "process_started", map[string]any{"pid": child.cmd.Process.Pid})

	tools, registryHash, protocolErr := executeProtocol(child, recorder, &result, opts, expectedRegistry)
	exit := child.finish(opts.exitTimeout)
	result.Waited = exit.waited
	result.ExitCode = exit.exitCode
	result.TimedOut = result.TimedOut || exit.timedOut
	result.CleanExit = exit.waited && !exit.timedOut && exit.err == nil && exit.exitCode == 0

	protocolErr = validateTrailingOutput(exit.trailing, recorder, &result, run, protocolErr)

	stderrBytes := child.stderr.Bytes()
	stderrDir := filepath.Join(opts.evidenceDir, "stdio-smoke-stderr")
	stderrPath := filepath.Join(stderrDir, fmt.Sprintf("run-%02d.log", run))
	if err := os.MkdirAll(stderrDir, 0o755); err == nil {
		if writeErr := os.WriteFile(stderrPath, stderrBytes, 0o644); writeErr != nil && protocolErr == nil {
			protocolErr = fmt.Errorf("write stderr evidence: %w", writeErr)
		}
	} else if protocolErr == nil {
		protocolErr = fmt.Errorf("create stderr evidence directory: %w", err)
	}
	stderrDigest := sha256.Sum256(stderrBytes)
	result.StderrPath = stderrPath
	result.StderrBytes = len(stderrBytes)
	result.StderrSHA256 = hex.EncodeToString(stderrDigest[:])
	result.StderrNonEmpty = len(stderrBytes) > 0
	stderrText := string(stderrBytes)
	result.PanicObserved = strings.Contains(stderrText, "panic:") || strings.Contains(stderrText, "fatal error:")

	if protocolErr == nil && !result.CleanExit {
		protocolErr = fmt.Errorf("server did not exit cleanly: exitCode=%d timedOut=%t waitError=%v", exit.exitCode, exit.timedOut, exit.err)
	}
	if protocolErr == nil && result.PanicObserved {
		protocolErr = errors.New("server stderr contains panic/fatal error")
	}
	if protocolErr == nil && result.NonJSONLines == 0 && result.ProtocolViolations == 0 && result.UnexpectedLines == 0 {
		result.Status = "passed"
	} else if protocolErr == nil {
		protocolErr = fmt.Errorf("stdout validation failed: nonJSON=%d protocolViolations=%d unexpected=%d", result.NonJSONLines, result.ProtocolViolations, result.UnexpectedLines)
	}
	if protocolErr != nil {
		result.Error = protocolErr.Error()
	}
	result.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	result.DurationMs = time.Since(started).Milliseconds()
	recorder.event(run, "process_exit", map[string]any{
		"pid": child.cmd.Process.Pid, "waited": result.Waited, "cleanExit": result.CleanExit,
		"exitCode": result.ExitCode, "timedOut": result.TimedOut,
		"stderrPath": result.StderrPath, "stderrBytes": result.StderrBytes,
		"stderrSha256": result.StderrSHA256, "panicObserved": result.PanicObserved,
	})
	recorder.event(run, "run_result", map[string]any{"result": result})
	return result, tools, registryHash
}

func validateTrailingOutput(items []lineResult, recorder *eventRecorder, result *runResult, run int, protocolErr error) error {
	for _, item := range items {
		if item.err != nil {
			result.ProtocolViolations++
			if protocolErr == nil {
				protocolErr = fmt.Errorf("read trailing stdout: %w", item.err)
			}
			continue
		}
		result.StdoutLines++
		result.UnexpectedLines++
		recorder.event(run, "unexpected_stdout_line", map[string]any{"raw": item.text})
		var response rpcResponse
		if err := json.Unmarshal([]byte(item.text), &response); err != nil {
			result.NonJSONLines++
			result.ProtocolViolations++
		} else {
			result.ProtocolViolations++
		}
		if protocolErr == nil {
			protocolErr = fmt.Errorf("unexpected trailing stdout line: %q", item.text)
		}
	}
	return protocolErr
}

func writeJSON(path string, value any) error {
	temporary := path + ".tmp"
	file, err := os.Create(temporary)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	encodeErr := encoder.Encode(value)
	syncErr := file.Sync()
	closeErr := file.Close()
	if encodeErr != nil {
		_ = os.Remove(temporary)
		return encodeErr
	}
	if syncErr != nil {
		_ = os.Remove(temporary)
		return syncErr
	}
	if closeErr != nil {
		_ = os.Remove(temporary)
		return closeErr
	}
	return os.Rename(temporary, path)
}

func metadata(path string) (fileMetadata, error) {
	info, err := os.Stat(path)
	if err != nil {
		return fileMetadata{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return fileMetadata{}, err
	}
	hash := sha256.New()
	_, copyErr := io.Copy(hash, file)
	closeErr := file.Close()
	if copyErr != nil {
		return fileMetadata{}, copyErr
	}
	if closeErr != nil {
		return fileMetadata{}, closeErr
	}
	return fileMetadata{
		Path: path, Size: info.Size(), SHA256: hex.EncodeToString(hash.Sum(nil)),
		ModTime: info.ModTime().UTC().Format(time.RFC3339Nano),
	}, nil
}

func parseOptions() (options, error) {
	var opts options
	flag.StringVar(&opts.binary, "binary", "dist/opendesk-mcp", "path to the built opendesk-mcp binary")
	flag.IntVar(&opts.runs, "runs", 10, "number of fresh server processes to validate")
	flag.StringVar(&opts.evidenceDir, "evidence", "", "evidence directory (default: .runtime/tests/mcp/<run-id>)")
	flag.DurationVar(&opts.timeout, "timeout", 20*time.Second, "per-response timeout")
	flag.DurationVar(&opts.exitTimeout, "exit-timeout", 5*time.Second, "timeout for clean server exit after stdin EOF")
	flag.Parse()
	if flag.NArg() != 0 {
		return opts, fmt.Errorf("unexpected positional arguments: %s", strings.Join(flag.Args(), " "))
	}
	if opts.runs < 1 {
		return opts, errors.New("--runs must be at least 1")
	}
	if opts.timeout <= 0 || opts.exitTimeout <= 0 {
		return opts, errors.New("--timeout and --exit-timeout must be positive")
	}
	absBinary, err := filepath.Abs(opts.binary)
	if err != nil {
		return opts, err
	}
	info, err := os.Stat(absBinary)
	if err != nil {
		return opts, fmt.Errorf("stat --binary: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
		return opts, fmt.Errorf("--binary is not an executable regular file: %s", absBinary)
	}
	opts.binary = absBinary
	if opts.evidenceDir == "" {
		runID := time.Now().UTC().Format("20060102T150405Z") + "-" + strconv.Itoa(os.Getpid())
		opts.evidenceDir = filepath.Join(".runtime", "tests", "mcp", runID)
	}
	absEvidence, err := filepath.Abs(opts.evidenceDir)
	if err != nil {
		return opts, err
	}
	opts.evidenceDir = absEvidence
	return opts, nil
}

func main() {
	opts, err := parseOptions()
	if err != nil {
		fmt.Fprintln(os.Stderr, "stdio-smoke:", err)
		os.Exit(2)
	}
	if err := os.MkdirAll(opts.evidenceDir, 0o755); err != nil {
		fmt.Fprintln(os.Stderr, "stdio-smoke: create evidence directory:", err)
		os.Exit(2)
	}

	started := time.Now()
	binary, err := metadata(opts.binary)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stdio-smoke: binary metadata:", err)
		os.Exit(2)
	}
	ndjsonPath := filepath.Join(opts.evidenceDir, "stdio-smoke.ndjson")
	toolsListPath := filepath.Join(opts.evidenceDir, "tools-list.json")
	summaryPath := filepath.Join(opts.evidenceDir, "stdio-smoke-summary.json")
	recorder, err := newEventRecorder(ndjsonPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stdio-smoke: create NDJSON evidence:", err)
		os.Exit(2)
	}
	recorder.event(0, "suite_start", map[string]any{
		"binary": binary, "requestedRuns": opts.runs,
		"responseTimeoutMs": opts.timeout.Milliseconds(), "exitTimeoutMs": opts.exitTimeout.Milliseconds(),
	})

	results := make([]runResult, 0, opts.runs)
	var captured toolsListResult
	registryHash := ""
	registryStable := true
	registrySnapshots := 0
	for run := 1; run <= opts.runs; run++ {
		result, tools, observedHash := runOnce(opts, recorder, run, registryHash)
		results = append(results, result)
		if observedHash != "" {
			registrySnapshots++
			if registryHash == "" {
				registryHash = observedHash
				captured = tools
			} else if observedHash != registryHash {
				registryStable = false
			}
		}
	}

	toolsDocument := map[string]any{
		"schemaVersion":  evidenceSchemaVersion,
		"capturedAt":     time.Now().UTC().Format(time.RFC3339Nano),
		"binary":         binary,
		"available":      len(captured.Tools) > 0,
		"registrySha256": registryHash,
		"toolCount":      len(captured.Tools),
		"tools":          captured.Tools,
	}
	writeErrors := []string{}
	if err := writeJSON(toolsListPath, toolsDocument); err != nil {
		writeErrors = append(writeErrors, "tools-list.json: "+err.Error())
	}

	report := summary{
		SchemaVersion: evidenceSchemaVersion,
		StartedAt:     started.UTC().Format(time.RFC3339Nano),
		OS:            runtime.GOOS, Arch: runtime.GOARCH, Binary: binary,
		EvidenceDir: opts.evidenceDir, NDJSONPath: ndjsonPath,
		ToolsListPath: toolsListPath, SummaryPath: summaryPath,
		RequestedRuns: opts.runs, RegistryStable: registryStable && registrySnapshots == opts.runs,
		RegistrySnapshots: registrySnapshots, RegistrySHA256: registryHash,
		ToolCount: len(captured.Tools), Runs: results,
	}
	if len(captured.Tools) > 0 {
		for _, tool := range captured.Tools {
			report.ToolNames = append(report.ToolNames, tool.Name)
		}
		sort.Strings(report.ToolNames)
	}
	for _, result := range results {
		if result.Status == "passed" {
			report.PassedRuns++
		} else {
			report.FailedRuns++
		}
		if result.Checks["initialize"] {
			report.InitializePassed++
		}
		if result.CleanExit {
			report.CleanExits++
		}
		if result.TimedOut {
			report.Timeouts++
		}
		if result.PanicObserved {
			report.PanicCount++
		}
		if result.StderrNonEmpty {
			report.StderrNonEmptyRuns++
		}
		report.StdoutNonJSONLines += result.NonJSONLines
		report.ProtocolViolations += result.ProtocolViolations
		report.UnexpectedStdout += result.UnexpectedLines
	}
	recorder.event(0, "suite_result", map[string]any{
		"requestedRuns": report.RequestedRuns, "passedRuns": report.PassedRuns,
		"failedRuns": report.FailedRuns, "registryStable": report.RegistryStable,
		"stdoutNonJSONLines": report.StdoutNonJSONLines, "protocolViolations": report.ProtocolViolations,
		"timeouts": report.Timeouts, "panicCount": report.PanicCount,
	})
	if err := recorder.close(); err != nil {
		writeErrors = append(writeErrors, "stdio-smoke.ndjson: "+err.Error())
	}
	report.EvidenceWriteErrors = writeErrors
	report.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	report.DurationMs = time.Since(started).Milliseconds()
	if report.PassedRuns == opts.runs && report.CleanExits == opts.runs && report.RegistryStable &&
		report.StdoutNonJSONLines == 0 && report.ProtocolViolations == 0 && report.UnexpectedStdout == 0 &&
		report.Timeouts == 0 && report.PanicCount == 0 && len(report.EvidenceWriteErrors) == 0 {
		report.Status = "passed"
	} else {
		report.Status = "failed"
	}
	if err := writeJSON(summaryPath, report); err != nil {
		fmt.Fprintln(os.Stderr, "stdio-smoke: write summary:", err)
		os.Exit(2)
	}

	encoded, _ := json.Marshal(map[string]any{
		"status": report.Status, "runs": report.RequestedRuns, "passed": report.PassedRuns,
		"failed": report.FailedRuns, "cleanExits": report.CleanExits,
		"stdoutNonJSONLines": report.StdoutNonJSONLines, "protocolViolations": report.ProtocolViolations,
		"timeouts": report.Timeouts, "panics": report.PanicCount, "evidence": opts.evidenceDir,
	})
	fmt.Println(string(encoded))
	if report.Status != "passed" {
		os.Exit(1)
	}
}
