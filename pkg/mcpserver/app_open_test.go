package mcpserver

import (
	"errors"
	"strings"
	"testing"
)

type appOpenRuntime struct {
	fakeRuntime
	names []string
	err   error
}

func (r *appOpenRuntime) OpenApp(name string) error {
	r.names = append(r.names, name)
	return r.err
}

func TestOpenAppCallsExistingLauncherOnce(t *testing.T) {
	runtime := &appOpenRuntime{}
	server := NewServer(runtime)
	response := policyCall(t, server, "tm_open_app", map[string]any{"appName": "  计算器  "})
	if response.Error != nil {
		t.Fatal(response.Error)
	}
	result := mustMapResult(t, response.Result)
	payload := mustJSONTextPayload(t, mustCallContent(t, result))
	if result["isError"] == true || payload["ok"] != true || payload["action"] != "open_app" {
		t.Fatalf("launcher acknowledgement: %#v", result)
	}
	if len(runtime.names) != 1 || runtime.names[0] != "计算器" {
		t.Fatalf("unexpected launcher calls: %#v", runtime.names)
	}
	if runtime.listWindowsCalls != 0 || runtime.getActiveWindowCalls != 0 || len(runtime.events) != 0 {
		t.Fatal("launcher must not imply window readiness, focus, or input")
	}
	tool := server.tools["tm_open_app"]
	if tool.Annotations.ReadOnlyHint || tool.Annotations.IdempotentHint {
		t.Fatal("application launch is an input/state-changing operation")
	}
}

func TestOpenAppRejectsInvalidArgumentsBeforeLaunching(t *testing.T) {
	for _, args := range []map[string]any{
		{}, {"appName": 1}, {"appName": ""}, {"appName": " \t "}, {"appName": "Calculator\x00"},
		{"appName": "Calculator", "args": []any{"--bad"}},
		{"appName": "Calculator", "env": map[string]any{"TOKEN": "not-a-token"}},
		{"appName": "Calculator", "command": "must-not-run"},
	} {
		runtime := &appOpenRuntime{}
		response := policyCall(t, NewServer(runtime), "tm_open_app", args)
		if response.Error == nil && mustMapResult(t, response.Result)["isError"] != true {
			t.Fatalf("invalid arguments accepted: %#v", args)
		}
		if len(runtime.names) != 0 {
			t.Fatalf("invalid arguments reached launcher: %#v", args)
		}
	}
}

func TestOpenAppFailureDoesNotRetryOrReportSuccess(t *testing.T) {
	runtime := &appOpenRuntime{err: errors.New("launcher failed")}
	response := policyCall(t, NewServer(runtime), "tm_open_app", map[string]any{"appName": "Calculator"})
	result := mustMapResult(t, response.Result)
	if result["isError"] != true || !strings.Contains(string(response.Result), "launcher failed") || len(runtime.names) != 1 {
		t.Fatalf("failure was hidden or replayed: %#v / %#v", result, runtime.names)
	}
	response = policyCall(t, NewServer(&fakeRuntime{}), "tm_open_app", map[string]any{"appName": "Calculator"})
	if mustMapResult(t, response.Result)["isError"] != true {
		t.Fatal("missing launcher capability must fail closed")
	}
}

func TestOpenAppIsUnavailableInReadOnlyMode(t *testing.T) {
	runtime := &appOpenRuntime{}
	server := NewServerWithOptions(runtime, ServerOptions{ReadOnly: true})
	response := policyCall(t, server, "tm_open_app", map[string]any{"appName": "Calculator"})
	if response.Error == nil || response.Error.Message != "tool not found" || len(runtime.names) != 0 {
		t.Fatalf("read-only policy permitted launch: %#v", response)
	}
}
