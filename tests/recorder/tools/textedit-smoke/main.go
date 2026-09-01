// Command textedit-smoke records a bounded TextEdit smoke in one persistent
// OpenDesk MCP session. It never opens or saves a user file.
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

type response struct {
	ID     json.RawMessage `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  any             `json:"error"`
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
	lines   chan response
	errors  chan error
	nextID  int
}

type inspection struct {
	Application struct {
		PID        int64  `json:"pid"`
		Available  any    `json:"available"`
		Active     bool   `json:"active"`
		Terminated bool   `json:"terminated"`
		BundleID   string `json:"bundleID"`
		BundlePath string `json:"bundlePath"`
	} `json:"application"`
	FrontmostPID  int64 `json:"frontmostPID"`
	Windows       []any `json:"windows"`
	TextAreaValue any   `json:"textAreaValue"`
	OK            bool  `json:"ok"`
}

func main() {
	var binary, inspector, evidence, recorderRoot, title string
	var pid int64
	flag.StringVar(&binary, "binary", "dist/opendesk-mcp", "OpenDesk MCP binary")
	flag.StringVar(&inspector, "inspector", "", "macOS TextEdit inspector")
	flag.StringVar(&evidence, "evidence-root", ".runtime/tests/recorder/textedit-smoke", "evidence root")
	flag.StringVar(&recorderRoot, "recorder-root", ".runtime/recordings", "recorder root")
	flag.StringVar(&title, "title", "未命名", "exact blank document title")
	flag.Int64Var(&pid, "pid", 0, "isolated TextEdit PID")
	flag.Parse()
	if inspector == "" || pid <= 0 {
		log.Fatal("-inspector and -pid are required")
	}
	binary, _ = filepath.Abs(binary)
	inspector, _ = filepath.Abs(inspector)
	evidence, _ = filepath.Abs(evidence)
	recorderRoot, _ = filepath.Abs(recorderRoot)
	if err := os.MkdirAll(evidence, 0o755); err != nil {
		log.Fatal(err)
	}
	pre, err := inspect(inspector, pid)
	if err != nil {
		log.Fatal(err)
	}
	if err := validateBlank(pre, pid); err != nil {
		log.Fatal(err)
	}
	writeJSON(filepath.Join(evidence, "before.json"), pre)

	c, err := start(binary, recorderRoot)
	if err != nil {
		log.Fatal(err)
	}
	defer c.close()
	started, err := c.call("tm_recorder_start", map[string]any{"goal": "TextEdit isolated untitled document smoke", "executionId": "textedit-smoke", "observationPolicy": "standard"})
	if err != nil {
		log.Fatal(err)
	}
	sessionID, _ := started["recordingSessionId"].(string)
	if sessionID == "" {
		log.Fatal("missing recorder session")
	}
	summary := map[string]any{"ok": false, "recordingSessionId": sessionID, "pid": pid, "title": title, "savedUserFile": false, "wrongTargetClickCount": 0, "actions": []any{}}
	appendAction := func(tool string, arguments map[string]any, hint map[string]any) (string, error) {
		arguments["recordingSessionId"] = sessionID
		arguments["executionId"] = "textedit-smoke"
		arguments["recorderHint"] = hint
		payload, callErr := c.call(tool, arguments)
		row := map[string]any{"tool": tool, "ok": callErr == nil, "arguments": arguments}
		if callErr != nil {
			row["error"] = callErr.Error()
			summary["actions"] = append(summary["actions"].([]any), row)
			return "", callErr
		}
		recorderPayload, _ := payload["recorder"].(map[string]any)
		actionID, _ := recorderPayload["actionId"].(string)
		row["actionId"] = actionID
		summary["actions"] = append(summary["actions"].([]any), row)
		return actionID, nil
	}
	hint := func(intent, target string, postconditions []any) map[string]any {
		value := map[string]any{"goal": "TextEdit isolated untitled document smoke", "subgoal": intent, "intent": intent, "targetDescription": target, "risk": "low"}
		if postconditions != nil {
			value["expectedPostconditions"] = postconditions
		}
		return value
	}
	textPost := func(value string) []any { return []any{map[string]any{"kind": "textEquals", "value": value}} }

	var runErr error
	for _, row := range []struct {
		Tool string
		Args map[string]any
		Hint map[string]any
	}{
		{"tm_type", map[string]any{"text": "OPENDESK-RECORDER-TEXTEDIT-20260901", "expectedWindowTitle": title}, hint("type unique token", "TextEdit text area", nil)},
		{"tm_type", map[string]any{"text": "\n", "expectedWindowTitle": title}, hint("start first text line", "TextEdit text area", nil)},
		{"tm_type", map[string]any{"text": "line one", "expectedWindowTitle": title}, hint("type first text line", "TextEdit text area", nil)},
		{"tm_type", map[string]any{"text": "\n", "expectedWindowTitle": title}, hint("start second text line", "TextEdit text area", nil)},
		{"tm_type", map[string]any{"text": "line two", "expectedWindowTitle": title}, hint("type second text line", "TextEdit text area", nil)},
	} {
		if row.Tool == "tm_type" {
			row.Args["processId"] = pid
		}
		if _, err := appendAction(row.Tool, row.Args, row.Hint); err != nil {
			runErr = err
			break
		}
	}
	if runErr == nil {
		initial, err := inspect(inspector, pid)
		if err != nil {
			runErr = err
		} else {
			writeJSON(filepath.Join(evidence, "after-initial-text.json"), initial)
			expected := "OPENDESK-RECORDER-TEXTEDIT-20260901\nline one\nline two"
			if normalizeText(initial.TextAreaValue) != expected {
				runErr = fmt.Errorf("F6: initial TextEdit readback mismatch: %q", normalizeText(initial.TextAreaValue))
			}
		}
	}
	if runErr == nil {
		_, runErr = appendAction("tm_press_key", map[string]any{"key": "cmd+a", "expectedWindowTitle": title}, hint("select all document text", "TextEdit text area", nil))
	}
	var replacementActionID string
	const replacement = "OPENDESK-RECORDER-REPLACED-56088"
	if runErr == nil {
		replacementActionID, runErr = appendAction("tm_type", map[string]any{"text": replacement, "processId": pid, "expectedWindowTitle": title}, hint("replace selected text", "TextEdit text area", textPost(replacement)))
	}
	if runErr == nil {
		replaced, err := inspect(inspector, pid)
		if err != nil {
			runErr = err
		} else {
			writeJSON(filepath.Join(evidence, "after-replacement.json"), replaced)
			if normalizeText(replaced.TextAreaValue) != replacement {
				runErr = fmt.Errorf("F6: replacement readback mismatch: %q", normalizeText(replaced.TextAreaValue))
			} else {
				_, runErr = c.call("tm_recorder_verify", map[string]any{
					"recordingSessionId": sessionID, "executionId": "textedit-smoke", "actionId": replacementActionID,
					"verification": map[string]any{"status": "pass", "postconditions": textPost(replacement), "actual": map[string]any{"text": replacement}, "evidenceRefs": []string{filepath.Join(evidence, "after-replacement.json")}, "message": "AXTextArea exact readback passed"},
				})
			}
		}
	}
	if runErr == nil {
		_, runErr = appendAction("tm_press_key", map[string]any{"key": "cmd+w", "expectedWindowTitle": title}, hint("close untitled document", "TextEdit untitled window", nil))
	}
	if runErr == nil {
		time.Sleep(350 * time.Millisecond)
		closed, err := inspect(inspector, pid)
		if err != nil {
			runErr = err
		} else if len(closed.Windows) == 0 {
			summary["closeMode"] = "closed-without-save-dialog"
		} else {
			active, activeErr := c.call("tm_get_active_window", map[string]any{})
			if activeErr != nil {
				runErr = activeErr
			} else {
				summary["saveDialogActiveWindow"] = active
				activeTitle, _ := active["title"].(string)
				if activeTitle == "" {
					runErr = errors.New("F1: save dialog active window unavailable")
				} else {
					_, runErr = appendAction("tm_press_key", map[string]any{"key": "cmd+backspace", "expectedWindowTitle": activeTitle}, hint("discard isolated untitled document", "TextEdit save dialog", []any{map[string]any{"kind": "windowClosed"}}))
					summary["closeMode"] = "discarded-save-dialog"
				}
			}
		}
	}
	if runErr == nil {
		time.Sleep(350 * time.Millisecond)
		after, err := inspect(inspector, pid)
		if err != nil {
			runErr = err
		} else {
			writeJSON(filepath.Join(evidence, "after-close.json"), after)
			if len(after.Windows) != 0 || after.TextAreaValue != nil {
				runErr = fmt.Errorf("F6: TextEdit untitled document did not close without save")
			}
		}
	}
	stopped, stopErr := c.call("tm_recorder_stop", map[string]any{"recordingSessionId": sessionID})
	summary["stop"] = stopped
	if runErr == nil && stopErr != nil {
		runErr = stopErr
	}
	if runErr == nil {
		distilled, err := c.call("tm_recorder_distill", map[string]any{"recordingSessionId": sessionID})
		summary["distillation"] = distilled
		if err != nil {
			runErr = err
		}
	}
	if runErr == nil {
		summary["ok"] = true
	} else {
		summary["error"] = runErr.Error()
	}
	writeJSON(filepath.Join(evidence, "summary.json"), summary)
	encoded, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(encoded))
	if runErr != nil {
		os.Exit(1)
	}
}

func validateBlank(value inspection, pid int64) error {
	if !value.OK || value.Application.PID != pid || value.Application.BundleID != "com.apple.TextEdit" || value.Application.BundlePath != "/System/Applications/TextEdit.app" || value.FrontmostPID != pid || len(value.Windows) != 1 {
		return errors.New("F4: isolated TextEdit identity/window gate failed")
	}
	if normalizeText(value.TextAreaValue) != "" {
		return errors.New("F9: TextEdit document is not blank")
	}
	return nil
}

func normalizeText(value any) string {
	if value == nil {
		return ""
	}
	normalized := strings.ReplaceAll(fmt.Sprint(value), "\r\n", "\n")
	return strings.ReplaceAll(normalized, "\u2028", "\n")
}

func inspect(binary string, pid int64) (inspection, error) {
	output, err := exec.Command(binary, fmt.Sprint(pid)).Output()
	if err != nil {
		return inspection{}, err
	}
	var result inspection
	err = json.Unmarshal(output, &result)
	return result, err
}

func start(binary, recorderRoot string) (*client, error) {
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
	c := &client{command: command, stdin: stdin, encoder: json.NewEncoder(stdin), lines: make(chan response, 8), errors: make(chan error, 1), nextID: 1}
	go read(stdout, c.lines, c.errors)
	if err := c.encoder.Encode(map[string]any{"jsonrpc": "2.0", "id": c.nextID, "method": "initialize", "params": map[string]any{"protocolVersion": "2024-11-05"}}); err != nil {
		return nil, err
	}
	if _, err := c.wait(c.nextID); err != nil {
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
	response, err := c.wait(id)
	if err != nil {
		return nil, err
	}
	var result toolResult
	if err := json.Unmarshal(response.Result, &result); err != nil {
		return nil, err
	}
	if len(result.Content) == 0 || result.Content[0].Type != "text" {
		return nil, errors.New("MCP tool returned no text")
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &payload); err != nil {
		return nil, err
	}
	if result.IsError {
		return payload, fmt.Errorf("MCP tool %s failed: %s", name, result.Content[0].Text)
	}
	return payload, nil
}

func (c *client) wait(id int) (response, error) {
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	for {
		select {
		case value := <-c.lines:
			if string(value.ID) != fmt.Sprint(id) {
				continue
			}
			if value.Error != nil {
				return value, fmt.Errorf("JSON-RPC error: %v", value.Error)
			}
			return value, nil
		case err := <-c.errors:
			return response{}, err
		case <-timer.C:
			return response{}, fmt.Errorf("MCP timeout %d", id)
		}
	}
}

func (c *client) close() {
	_ = c.stdin.Close()
	_ = c.command.Wait()
}

func read(reader io.Reader, lines chan<- response, errors chan<- error) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		var value response
		if err := json.Unmarshal(scanner.Bytes(), &value); err != nil {
			errors <- err
			return
		}
		lines <- value
	}
	if err := scanner.Err(); err != nil {
		errors <- err
	}
}

func writeJSON(path string, value any) {
	data, _ := json.MarshalIndent(value, "", "  ")
	_ = os.WriteFile(path, append(data, '\n'), 0o644)
}
