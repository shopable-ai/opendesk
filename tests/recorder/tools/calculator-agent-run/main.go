// Command calculator-agent-run executes one fail-closed Calculator Agent Run through
// a persistent OpenDesk MCP stdio server and records every real desktop action.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   any             `json:"error"`
}

type toolResult struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	IsError bool `json:"isError"`
}

type client struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	encoder *json.Encoder
	lines   chan rpcResponse
	errors  chan error
	nextID  int
}

type desktopState struct {
	TimestampEpochMs int64 `json:"timestampEpochMs"`
	Permissions      struct {
		ScreenCapture bool `json:"screenCapture"`
		Accessibility bool `json:"accessibility"`
	} `json:"permissions"`
	Application struct {
		PID        int64  `json:"pid"`
		Available  bool   `json:"available"`
		BundleID   string `json:"bundleID"`
		BundlePath string `json:"bundlePath"`
		Active     bool   `json:"active"`
		Terminated bool   `json:"terminated"`
	} `json:"application"`
	Frontmost struct {
		PID int64 `json:"pid"`
	} `json:"frontmost"`
	Windows []struct {
		OwnerPID int64 `json:"ownerPID"`
		Bounds   struct {
			X      float64 `json:"x"`
			Y      float64 `json:"y"`
			Width  float64 `json:"width"`
			Height float64 `json:"height"`
		} `json:"bounds"`
	} `json:"windows"`
	MainDisplayValue any                       `json:"mainDisplayValue"`
	Hits             map[string]map[string]any `json:"hits"`
}

type step struct {
	Key      string
	Label    string
	Intent   string
	Expected string
	Accepted []string
}

func main() {
	var binary, statePath, evidence, recorderRoot string
	flag.StringVar(&binary, "binary", "dist/opendesk-mcp", "OpenDesk MCP binary")
	flag.StringVar(&statePath, "state", "", "fresh Calculator watcher state")
	flag.StringVar(&evidence, "evidence-root", ".runtime/tests/recorder/calculator-agent", "evidence root")
	flag.StringVar(&recorderRoot, "recorder-root", ".runtime/recordings", "recorder root")
	flag.Parse()
	if statePath == "" {
		log.Fatal("-state is required")
	}
	for _, path := range []string{binary, statePath} {
		absolute, err := filepath.Abs(path)
		if err != nil {
			log.Fatal(err)
		}
		if path == binary {
			binary = absolute
		} else {
			statePath = absolute
		}
	}
	evidence, _ = filepath.Abs(evidence)
	recorderRoot, _ = filepath.Abs(recorderRoot)
	if err := os.MkdirAll(filepath.Join(evidence, "states"), 0o755); err != nil {
		log.Fatal(err)
	}
	c, err := startClient(binary, recorderRoot)
	if err != nil {
		log.Fatal(err)
	}
	defer c.close()

	start, err := c.call("tm_recorder_start", map[string]any{
		"goal":        "Calculate 123 × 456 = 56088 in macOS Calculator using real buttons",
		"executionId": "calculator-agent-first-run", "observationPolicy": "standard",
	})
	if err != nil {
		log.Fatal(err)
	}
	sessionID, _ := start["recordingSessionId"].(string)
	if sessionID == "" {
		log.Fatal("recorder start returned no session id")
	}
	summary := map[string]any{"ok": false, "recordingSessionId": sessionID, "goal": "123 × 456 = 56088", "wrongTargetClickCount": 0, "steps": []any{}}
	steps := []step{
		{Key: "clear", Label: "Clear", Intent: "clear the current Calculator entry", Expected: "0", Accepted: []string{"清除", "全部清除", "C", "AC"}},
		{Key: "clear", Label: "All Clear", Intent: "clear any pending Calculator operation context", Expected: "0", Accepted: []string{"清除", "全部清除", "C", "AC"}},
		{Key: "one", Label: "1", Intent: "enter first operand digit 1", Expected: "1", Accepted: []string{"1"}},
		{Key: "two", Label: "2", Intent: "enter first operand digit 2", Expected: "12", Accepted: []string{"2"}},
		{Key: "three", Label: "3", Intent: "enter first operand digit 3", Expected: "123", Accepted: []string{"3"}},
		{Key: "multiply", Label: "Multiply", Intent: "select multiplication operation", Expected: "123", Accepted: []string{"×", "乘", "Multiply"}},
		{Key: "four", Label: "4", Intent: "enter second operand digit 4", Expected: "4", Accepted: []string{"4"}},
		{Key: "five", Label: "5", Intent: "enter second operand digit 5", Expected: "45", Accepted: []string{"5"}},
		{Key: "six", Label: "6", Intent: "enter second operand digit 6", Expected: "456", Accepted: []string{"6"}},
		{Key: "equals", Label: "Equals", Intent: "evaluate multiplication", Expected: "56088", Accepted: []string{"=", "等于", "Equals"}},
	}
	var runErr error
	for index, item := range steps {
		result, err := executeStep(c, sessionID, statePath, evidence, index+1, len(steps), item)
		summary["steps"] = append(summary["steps"].([]any), result)
		if err != nil {
			runErr = err
			break
		}
	}
	stop, stopErr := c.call("tm_recorder_stop", map[string]any{"recordingSessionId": sessionID})
	summary["stop"] = stop
	if runErr == nil && stopErr != nil {
		runErr = stopErr
	}
	if runErr == nil {
		distilled, err := c.call("tm_recorder_distill", map[string]any{"recordingSessionId": sessionID})
		summary["distillation"] = distilled
		if err != nil {
			runErr = err
		} else {
			configPath := filepath.Join(recorderRoot, sessionID, "generated", "replay-config.json")
			config := map[string]any{"statePath": statePath, "reportPath": filepath.Join(evidence, "replay-report.json"), "maxStateAgeMs": 1000, "postconditionTimeoutMs": 2000}
			if err := writeJSON(configPath, config); err != nil {
				runErr = err
			} else {
				compiled, err := c.call("tm_recorder_compile", map[string]any{"recordingSessionId": sessionID, "replayConfigPath": configPath})
				summary["compiled"] = compiled
				if err != nil {
					runErr = err
				}
			}
		}
	}
	if runErr != nil {
		summary["error"] = runErr.Error()
	} else {
		summary["ok"] = true
	}
	if err := writeJSON(filepath.Join(evidence, "agent-run-summary.json"), summary); err != nil {
		log.Fatal(err)
	}
	encoded, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(encoded))
	if runErr != nil {
		os.Exit(1)
	}
}

func executeStep(c *client, sessionID, statePath, evidence string, number, total int, item step) (map[string]any, error) {
	pre, raw, err := loadFreshState(statePath)
	if err != nil {
		return map[string]any{"step": number, "key": item.Key, "ok": false, "error": err.Error()}, err
	}
	hit, err := validateTarget(pre, item)
	if err != nil {
		return map[string]any{"step": number, "key": item.Key, "ok": false, "error": err.Error()}, err
	}
	prePath := filepath.Join(evidence, "states", fmt.Sprintf("step-%02d-%s-before.json", number, item.Key))
	if err := os.WriteFile(prePath, raw, 0o644); err != nil {
		return nil, err
	}
	arguments := map[string]any{
		"x": hit["x"], "y": hit["y"], "processId": pre.Application.PID, "expectedWindowTitle": "Calculator",
		"recordingSessionId": sessionID, "executionId": "calculator-agent-first-run", "targetKey": item.Key,
		"targetLabel": item.Label, "targetRole": "AXButton", "acceptedLabels": item.Accepted,
		"expectedBundleID": "com.apple.calculator", "expectedAppPath": "/System/Applications/Calculator.app",
		"windowRelative": map[string]any{
			"x": numberValue(hit["x"]) - pre.Windows[0].Bounds.X, "y": numberValue(hit["y"]) - pre.Windows[0].Bounds.Y,
			"windowWidth": pre.Windows[0].Bounds.Width, "windowHeight": pre.Windows[0].Bounds.Height,
		},
		"recorderHint": map[string]any{
			"goal": "123 × 456 = 56088", "subgoal": fmt.Sprintf("Calculator step %d of %d", number, total),
			"intent": item.Intent, "targetDescription": "Calculator " + item.Label + " button", "risk": "low",
			"expectedPostconditions": []any{map[string]any{"kind": "displayEquals", "value": item.Expected}},
		},
	}
	response, err := c.call("tm_click", arguments)
	if err != nil {
		return map[string]any{"step": number, "key": item.Key, "ok": false, "preState": prePath, "error": err.Error()}, err
	}
	recorderResult, _ := response["recorder"].(map[string]any)
	actionID, _ := recorderResult["actionId"].(string)
	post, postRaw, err := waitForDisplay(statePath, item.Expected, 2*time.Second)
	if err != nil {
		return map[string]any{"step": number, "key": item.Key, "ok": false, "preState": prePath, "actionId": actionID, "error": err.Error()}, err
	}
	postPath := filepath.Join(evidence, "states", fmt.Sprintf("step-%02d-%s-after.json", number, item.Key))
	if err := os.WriteFile(postPath, postRaw, 0o644); err != nil {
		return nil, err
	}
	verification := map[string]any{
		"status": "pass", "postconditions": []any{map[string]any{"kind": "displayEquals", "value": item.Expected}},
		"actual":       map[string]any{"mainDisplayValue": fmt.Sprint(post.MainDisplayValue), "targetKey": item.Key},
		"evidenceRefs": []string{prePath, postPath}, "message": "fresh watcher display postcondition passed",
	}
	if _, err := c.call("tm_recorder_verify", map[string]any{"recordingSessionId": sessionID, "executionId": "calculator-agent-first-run", "actionId": actionID, "verification": verification}); err != nil {
		return nil, err
	}
	return map[string]any{"step": number, "key": item.Key, "intent": item.Intent, "ok": true, "actionId": actionID, "expected": item.Expected, "actual": fmt.Sprint(post.MainDisplayValue), "preState": prePath, "postState": postPath}, nil
}

func loadFreshState(path string) (desktopState, []byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return desktopState{}, nil, err
	}
	var state desktopState
	if err := json.Unmarshal(data, &state); err != nil {
		return state, data, err
	}
	if age := time.Now().UnixMilli() - state.TimestampEpochMs; age < 0 || age > 1000 {
		return state, data, fmt.Errorf("F1: watcher state age %dms is not fresh", age)
	}
	if !state.Permissions.ScreenCapture || !state.Permissions.Accessibility {
		return state, data, errors.New("F0: screen capture or accessibility permission missing")
	}
	if !state.Application.Available || state.Application.Terminated || !state.Application.Active || state.Application.BundleID != "com.apple.calculator" || state.Application.BundlePath != "/System/Applications/Calculator.app" {
		return state, data, errors.New("F0: Calculator application identity gate failed")
	}
	if len(state.Windows) != 1 || state.Windows[0].OwnerPID != state.Application.PID || state.Frontmost.PID != state.Application.PID {
		return state, data, errors.New("F4: Calculator window is missing, ambiguous, or not foreground")
	}
	return state, data, nil
}

func validateTarget(state desktopState, item step) (map[string]any, error) {
	hit := state.Hits[item.Key]
	if hit == nil || int64(numberValue(hit["pid"])) != state.Application.PID || fmt.Sprint(hit["role"]) != "AXButton" || hit["supportsAXPress"] != true {
		return nil, fmt.Errorf("F4: %s AX target is unavailable", item.Key)
	}
	labels := []string{strings.TrimSpace(fmt.Sprint(hit["title"])), strings.TrimSpace(fmt.Sprint(hit["description"]))}
	matched := false
	for _, actual := range labels {
		for _, accepted := range item.Accepted {
			if actual == accepted {
				matched = true
			}
		}
	}
	if !matched {
		return nil, fmt.Errorf("F4: %s target label mismatch: %v", item.Key, labels)
	}
	return hit, nil
}

func waitForDisplay(path, expected string, timeout time.Duration) (desktopState, []byte, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		state, data, err := loadFreshState(path)
		if err == nil && normalizeDisplay(state.MainDisplayValue) == normalizeDisplay(expected) {
			return state, data, nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	state, data, err := loadFreshState(path)
	if err != nil {
		return state, data, err
	}
	return state, data, fmt.Errorf("F6: display expected %s got %v", expected, state.MainDisplayValue)
}

func normalizeDisplay(value any) string {
	return strings.NewReplacer(" ", "", ",", "", "\u00a0", "").Replace(fmt.Sprint(value))
}

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case json.Number:
		result, _ := typed.Float64()
		return result
	default:
		return 0
	}
}

func startClient(binary, recorderRoot string) (*client, error) {
	command := exec.Command(binary)
	command.Env = append(os.Environ(), "OPENDESK_RECORDER_ROOT="+recorderRoot)
	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, err
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		return nil, err
	}
	c := &client{command: command, stdin: stdin, encoder: json.NewEncoder(stdin), lines: make(chan rpcResponse, 8), errors: make(chan error, 1), nextID: 1}
	go readResponses(stdout, c.lines, c.errors)
	if err := c.encoder.Encode(map[string]any{"jsonrpc": "2.0", "id": c.nextID, "method": "initialize", "params": map[string]any{"protocolVersion": "2024-11-05"}}); err != nil {
		return nil, err
	}
	if _, err := c.wait(c.nextID, 10*time.Second); err != nil {
		return nil, err
	}
	c.nextID++
	if err := c.encoder.Encode(map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *client) call(name string, arguments map[string]any) (map[string]any, error) {
	id := c.nextID
	c.nextID++
	if err := c.encoder.Encode(map[string]any{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": map[string]any{"name": name, "arguments": arguments}}); err != nil {
		return nil, err
	}
	response, err := c.wait(id, 15*time.Second)
	if err != nil {
		return nil, err
	}
	var result toolResult
	if err := json.Unmarshal(response.Result, &result); err != nil {
		return nil, err
	}
	if len(result.Content) == 0 || result.Content[0].Type != "text" {
		return nil, errors.New("MCP tool returned no text payload")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &payload); err != nil {
		return nil, fmt.Errorf("MCP payload: %w", err)
	}
	if result.IsError {
		return payload, fmt.Errorf("MCP tool %s failed: %s", name, result.Content[0].Text)
	}
	return payload, nil
}

func (c *client) wait(id int, timeout time.Duration) (rpcResponse, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case response := <-c.lines:
			if string(response.ID) != fmt.Sprint(id) {
				continue
			}
			if response.Error != nil {
				return response, fmt.Errorf("JSON-RPC error: %v", response.Error)
			}
			return response, nil
		case err := <-c.errors:
			return rpcResponse{}, err
		case <-timer.C:
			return rpcResponse{}, fmt.Errorf("timeout waiting for response %d", id)
		}
	}
}

func (c *client) close() {
	_ = c.stdin.Close()
	_ = c.command.Wait()
}

func readResponses(reader io.Reader, lines chan<- rpcResponse, errors chan<- error) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		var response rpcResponse
		if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
			errors <- fmt.Errorf("non-JSON MCP stdout: %q", scanner.Text())
			return
		}
		lines <- response
	}
	if err := scanner.Err(); err != nil {
		errors <- err
	}
}

func writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}
