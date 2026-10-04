package mcpserver

import (
	"encoding/json"
	"testing"
)

// MCP schema/error translation only; this never claims live Browser evidence.
type browserContractRuntime struct {
	Runtime
	code string
}

func (r browserContractRuntime) BrowserCall(operation string, args map[string]any) (map[string]any, error) {
	return map[string]any{"error": map[string]any{"code": r.code, "outcome": "NOT_DISPATCHED"}, "outcome": "NOT_DISPATCHED"}, nil
}

func TestBrowserMCPPreservesStructuredFailures(t *testing.T) {
	for _, code := range []string{"TARGET_NOT_FOUND", "AMBIGUOUS_TARGET", "STALE_TARGET", "TIMEOUT", "PERMISSION_DENIED", "OUTCOME_UNKNOWN"} {
		t.Run(code, func(t *testing.T) {
			s := NewServer(browserContractRuntime{code: code})
			params, _ := json.Marshal(map[string]any{"name": "tm_browser_status", "arguments": map[string]any{}})
			response := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage("1"), Method: "tools/call", Params: params})
			if response.Error != nil {
				t.Fatalf("Structured Core failure collapsed to JSON-RPC error: %+v", response.Error)
			}
			var result map[string]any
			if err := json.Unmarshal(response.Result, &result); err != nil {
				t.Fatal(err)
			}
			if result["isError"] != true {
				t.Fatal("Missing MCP error marker")
			}
			content := result["content"].([]any)[0].(map[string]any)
			var payload map[string]any
			if err := json.Unmarshal([]byte(content["text"].(string)), &payload); err != nil {
				t.Fatal(err)
			}
			if payload["error"].(map[string]any)["code"] != code {
				t.Fatalf("Lost Core code %s", code)
			}
		})
	}
}

func TestBrowserMCPRejectsArbitraryExecutionArguments(t *testing.T) {
	s := NewServer(browserContractRuntime{code: "SHOULD_NOT_CALL"})
	for _, property := range []string{"evaluate", "pageJavaScript", "executionId", "origin", "source"} {
		params, _ := json.Marshal(map[string]any{"name": "tm_browser_status", "arguments": map[string]any{property: "untrusted"}})
		response := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage("1"), Method: "tools/call", Params: params})
		if response.Error == nil || response.Error.Code != ErrCodeInvalidParams {
			t.Fatalf("Unexpectedly accepted host-owned/arbitrary argument %s", property)
		}
	}
}
