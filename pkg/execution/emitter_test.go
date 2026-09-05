package execution

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEmitterColorsOnlyTerminalPrefixes(t *testing.T) {
	dir := t.TempDir()
	artifacts := ExecutionArtifacts{
		StdoutPath:       filepath.Join(dir, "stdout.log"),
		StderrPath:       filepath.Join(dir, "stderr.log"),
		EventLogPath:     filepath.Join(dir, "events.ndjson"),
		AgentSummaryPath: filepath.Join(dir, "agent_summary.json"),
	}
	emitter, err := NewEmitter("color-test", TerminalSelection{
		Mode:       "full",
		ColorMode:  "always",
		Categories: map[string]bool{"script": true, "error": true},
	}, artifacts, time.Now())
	if err != nil {
		t.Fatalf("NewEmitter: %v", err)
	}
	var stdout, stderr bytes.Buffer
	emitter.terminalOut = &stdout
	emitter.terminalErr = &stderr

	message := `[ENVIRONMENT-EXAMPLE] {"mode":"full"}`
	emitter.Emit(EventCategoryScript, EventLevelInfo, EventSourceConsole, "log", message, nil)
	emitter.Emit(EventCategoryError, EventLevelError, EventSourceRuntime, "error", "boom", nil)
	if _, _, err := emitter.Finalize(ExecutionStatusSucceeded, nil); err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	if err := emitter.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if got := stdout.String(); got != "\x1b[1;96m[SCRIPT]\x1b[0m "+message+"\n" {
		t.Fatalf("terminal stdout = %q", got)
	}
	if got := stderr.String(); got != "\x1b[1;31m[ERROR]\x1b[0m boom\n" {
		t.Fatalf("terminal stderr = %q", got)
	}
	for _, name := range []string{"stdout.log", "stderr.log", "events.ndjson", "agent_summary.json"} {
		content, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if bytes.Contains(content, []byte("\x1b[")) {
			t.Fatalf("%s contains terminal ANSI: %q", name, content)
		}
		if bytes.Contains(content, []byte(`\u001b[`)) {
			t.Fatalf("%s contains JSON-escaped terminal ANSI: %q", name, content)
		}
	}
	stdoutLog, err := os.ReadFile(artifacts.StdoutPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(stdoutLog) != message+"\n" {
		t.Fatalf("raw stdout message changed: %q", stdoutLog)
	}
}

func TestEmitterAutoDoesNotColorRedirectedWriters(t *testing.T) {
	emitter, err := NewEmitter("redirect-test", TerminalSelection{
		Mode:       "full",
		ColorMode:  "auto",
		Categories: map[string]bool{"summary": true},
	}, ExecutionArtifacts{}, time.Now())
	if err != nil {
		t.Fatalf("NewEmitter: %v", err)
	}
	defer emitter.Close()
	var stdout bytes.Buffer
	emitter.terminalOut = &stdout

	emitter.Emit(EventCategorySummary, EventLevelInfo, EventSourceSystem, "summary", "done", nil)
	if got := stdout.String(); got != "[SUMMARY] done\n" {
		t.Fatalf("redirected auto output = %q", got)
	}
}

func TestEmitterAgentModeOverridesForcedColor(t *testing.T) {
	emitter, err := NewEmitter("agent-test", TerminalSelection{
		Mode:       "agent",
		ColorMode:  "always",
		Categories: map[string]bool{"script": true, "error": true},
	}, ExecutionArtifacts{}, time.Now())
	if err != nil {
		t.Fatalf("NewEmitter: %v", err)
	}
	defer emitter.Close()
	var stdout, stderr bytes.Buffer
	emitter.terminalOut = &stdout
	emitter.terminalErr = &stderr

	emitter.Emit(EventCategoryScript, EventLevelInfo, EventSourceConsole, "log", "payload", nil)
	emitter.Emit(EventCategoryError, EventLevelError, EventSourceRuntime, "error", "boom", nil)
	if strings.Contains(stdout.String(), "\x1b[") || strings.Contains(stderr.String(), "\x1b[") {
		t.Fatalf("agent output contains ANSI: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
	if stdout.String() != "[SCRIPT] payload\n" || stderr.String() != "[ERROR] boom\n" {
		t.Fatalf("agent terminal routing changed: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}

func TestFormatTerminalEventKeepsLevelVisibleWithoutColor(t *testing.T) {
	writer := &bytes.Buffer{}
	tests := []struct {
		event RunEvent
		want  string
	}{
		{RunEvent{Category: EventCategoryScript, Level: EventLevelWarn, Message: "careful"}, "[SCRIPT] [WARN] careful"},
		{RunEvent{Category: EventCategoryScript, Level: EventLevelDebug, Message: "details"}, "[SCRIPT] [DEBUG] details"},
		{RunEvent{Category: EventCategoryMeta, Level: EventLevelError, Message: "broken"}, "[META] [ERROR] broken"},
		{RunEvent{Category: EventCategoryError, Level: EventLevelError, Message: "boom"}, "[ERROR] boom"},
	}
	for _, test := range tests {
		if got := formatTerminalEvent(test.event, "never", writer); got != test.want {
			t.Errorf("formatTerminalEvent(%+v) = %q, want %q", test.event, got, test.want)
		}
	}
}

func TestFormatTerminalEventKeepsConsoleMethodVisible(t *testing.T) {
	writer := &bytes.Buffer{}
	tests := []struct {
		method string
		level  EventLevel
		want   string
	}{
		{"log", EventLevelInfo, "[SCRIPT] [LOG] payload"},
		{"info", EventLevelInfo, "[SCRIPT] [INFO] payload"},
		{"warn", EventLevelWarn, "[SCRIPT] [WARN] payload"},
		{"debug", EventLevelDebug, "[SCRIPT] [DEBUG] payload"},
		{"table", EventLevelInfo, "[SCRIPT] [TABLE] payload"},
		{"group", EventLevelInfo, "[SCRIPT] [GROUP] payload"},
		{"groupEnd", EventLevelInfo, "[SCRIPT] [GROUP] payload"},
		{"time", EventLevelDebug, "[SCRIPT] [TIME] payload"},
		{"timeEnd", EventLevelDebug, "[SCRIPT] [TIME] payload"},
	}
	for _, test := range tests {
		event := RunEvent{
			Category: EventCategoryScript,
			Level:    test.level,
			Source:   EventSourceConsole,
			Message:  "payload",
			Fields:   map[string]any{"consoleMethod": test.method},
		}
		if got := formatTerminalEvent(event, "never", writer); got != test.want {
			t.Errorf("console.%s terminal line = %q, want %q", test.method, got, test.want)
		}
	}
}

func TestFormatTerminalEventKeepsBusinessErrorOwnerVisible(t *testing.T) {
	writer := &bytes.Buffer{}
	event := RunEvent{
		Category: EventCategoryError,
		Level:    EventLevelError,
		Source:   EventSourceConsole,
		Message:  "business failure",
		Fields:   map[string]any{"consoleMethod": "error"},
	}
	if got := formatTerminalEvent(event, "never", writer); got != "[SCRIPT] [ERROR] business failure" {
		t.Fatalf("business console.error line = %q", got)
	}
	colored := formatTerminalEvent(event, "always", writer)
	if !strings.HasPrefix(colored, "\x1b[1;96m[SCRIPT]\x1b[0m \x1b[1;31m[ERROR]\x1b[0m ") {
		t.Fatalf("business console.error styling = %q", colored)
	}
}

func TestFinalizeDeduplicatesCentralExecutionError(t *testing.T) {
	emitter, err := NewEmitter("error-dedupe", TerminalSelection{}, ExecutionArtifacts{}, time.Now())
	if err != nil {
		t.Fatalf("NewEmitter: %v", err)
	}
	defer emitter.Close()

	failure := errors.New("single failure")
	emitter.Emit(EventCategoryError, EventLevelError, EventSourceRuntime, "error", failure.Error(), nil)
	_, summary, err := emitter.Finalize(ExecutionStatusFailed, failure)
	if err != nil {
		t.Fatalf("Finalize: %v", err)
	}
	if len(summary.Errors) != 1 || summary.Errors[0].Message != failure.Error() {
		t.Fatalf("summary errors = %+v, want one central error", summary.Errors)
	}
}

func TestFinalizeDoneEventUsesStatusLevel(t *testing.T) {
	tests := []struct {
		status     ExecutionStatus
		err        error
		wantLevel  EventLevel
		wantErrors int
	}{
		{ExecutionStatusSucceeded, nil, EventLevelInfo, 0},
		{ExecutionStatusFailed, errors.New("failed"), EventLevelError, 1},
		{ExecutionStatusTimedOut, errors.New("timed out"), EventLevelError, 1},
		{ExecutionStatusCanceled, errors.New("canceled"), EventLevelWarn, 0},
	}
	for _, test := range tests {
		t.Run(string(test.status), func(t *testing.T) {
			emitter, err := NewEmitter("done-level", TerminalSelection{}, ExecutionArtifacts{}, time.Now())
			if err != nil {
				t.Fatalf("NewEmitter: %v", err)
			}
			defer emitter.Close()
			_, events := emitter.Subscribe(1)
			_, summary, err := emitter.Finalize(test.status, test.err)
			if err != nil {
				t.Fatalf("Finalize: %v", err)
			}
			done := <-events
			if done.Kind != "done" || done.Level != test.wantLevel {
				t.Fatalf("done event = kind:%q level:%q, want level %q", done.Kind, done.Level, test.wantLevel)
			}
			if len(summary.Errors) != test.wantErrors {
				t.Fatalf("summary errors = %+v, want %d", summary.Errors, test.wantErrors)
			}
		})
	}
}
