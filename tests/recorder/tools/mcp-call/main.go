// Command mcp-call invokes one OpenDesk MCP tool through a fresh real stdio process.
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   any             `json:"error"`
}

func main() {
	var binary, tool, rawArguments string
	var timeout time.Duration
	flag.StringVar(&binary, "binary", "dist/opendesk-mcp", "MCP binary")
	flag.StringVar(&tool, "tool", "", "tool name")
	flag.StringVar(&rawArguments, "arguments", `{}`, "tool arguments JSON")
	flag.DurationVar(&timeout, "timeout", 10*time.Second, "response timeout")
	flag.Parse()
	if tool == "" {
		fatal("tool is required")
	}
	var arguments map[string]any
	if err := json.Unmarshal([]byte(rawArguments), &arguments); err != nil {
		fatal("invalid arguments JSON: %v", err)
	}
	cmd := exec.Command(binary)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		fatal("stdin: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fatal("stdout: %v", err)
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		fatal("start: %v", err)
	}
	encoder := json.NewEncoder(stdin)
	lines := make(chan response, 4)
	errors := make(chan error, 1)
	go readResponses(stdout, lines, errors)
	if err := encoder.Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": map[string]any{"protocolVersion": "2024-11-05"}}); err != nil {
		fatal("initialize write: %v", err)
	}
	if _, err := waitForID(lines, errors, timeout, "1"); err != nil {
		fatal("initialize: %v", err)
	}
	if err := encoder.Encode(map[string]any{"jsonrpc": "2.0", "method": "notifications/initialized"}); err != nil {
		fatal("initialized write: %v", err)
	}
	if err := encoder.Encode(map[string]any{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": map[string]any{"name": tool, "arguments": arguments}}); err != nil {
		fatal("tool write: %v", err)
	}
	result, err := waitForID(lines, errors, timeout, "2")
	if err != nil {
		fatal("tool call: %v", err)
	}
	_ = stdin.Close()
	if waitErr := cmd.Wait(); waitErr != nil {
		fatal("server exit: %v", waitErr)
	}
	encoded, _ := json.Marshal(result)
	fmt.Println(string(encoded))
}

func readResponses(reader io.Reader, output chan<- response, errors chan<- error) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		var value response
		if err := json.Unmarshal(scanner.Bytes(), &value); err != nil {
			errors <- fmt.Errorf("non-JSON stdout: %q", scanner.Text())
			return
		}
		output <- value
	}
	if err := scanner.Err(); err != nil {
		errors <- err
	}
}

func waitForID(lines <-chan response, errors <-chan error, timeout time.Duration, id string) (response, error) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	for {
		select {
		case value := <-lines:
			if string(value.ID) != id {
				continue
			}
			if value.Error != nil {
				return value, fmt.Errorf("JSON-RPC error: %v", value.Error)
			}
			return value, nil
		case err := <-errors:
			return response{}, err
		case <-timer.C:
			return response{}, fmt.Errorf("timeout waiting for id %s", id)
		}
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
