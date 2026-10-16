package automation

import (
	"bufio"
	"bytes"
	"context"
	"strings"
	"testing"
)

type browserDOMTestWriteCloser struct{ bytes.Buffer }

func (writer *browserDOMTestWriteCloser) Close() error { return nil }

// Pure Go protocol/lifecycle seam: never starts Node, a Broker or Chrome.
// All cases assert the precise error, not merely NOT_DISPATCHED (which a
// Linux platform rejection could otherwise satisfy).
func TestBrowserDOMInvalidCallsRejectedBeforeCoreStartup(t *testing.T) {
	owner := NewBrowserDOMRuntime(context.Background(), BrowserDOMPolicy{
		CoreRoot: "/tmp", Origin: "http://127.0.0.1:9123", Tab: 1,
	}, "test-invalid-preflight", "recipe", true)
	defer owner.Close()
	scope := map[string]any{"tab": 1, "frame": 0}
	target := map[string]any{"opaque": "not-a-valid-core-target"}
	cases := []struct {
		name, operation, code string
		args map[string]any
	}{
		{"unknown-operation", "not_a_browser_operation", "UNSUPPORTED_OPERATION", nil},
		{"status-extra-field", "status", "INVALID_ARGUMENT", map[string]any{"arbitrary": true}},
		{"observe-missing-scope", "observe", "INVALID_ARGUMENT", nil},
		{"observe-missing-frame", "observe", "INVALID_ARGUMENT", map[string]any{"scope": map[string]any{"tab": 1}}},
		{"observe-negative-frame", "observe", "INVALID_ARGUMENT", map[string]any{"scope": map[string]any{"tab": 1, "frame": -1}}},
		{"observe-fractional-frame", "observe", "INVALID_ARGUMENT", map[string]any{"scope": map[string]any{"tab": 1, "frame": 1.5}}},
		{"observe-ignored-scope-field", "observe", "INVALID_ARGUMENT", map[string]any{"scope": map[string]any{"tab": 1, "frame": 0, "css": "*"}}},
		{"locate-missing-query", "locate", "INVALID_ARGUMENT", map[string]any{"scope": scope}},
		{"locate-empty-query", "locate", "INVALID_ARGUMENT", map[string]any{"scope": scope, "query": map[string]any{}}},
		{"locate-extra-top-level", "locate", "INVALID_ARGUMENT", map[string]any{"scope": scope, "query": map[string]any{"kind": "text", "value": "Save"}, "script": "ignored"}},
		{"read-missing-target", "read", "INVALID_ARGUMENT", map[string]any{"field": "text"}},
		{"read-invalid-field", "read", "INVALID_ARGUMENT", map[string]any{"target": target, "field": "html"}},
		{"act-unsupported", "act", "UNSUPPORTED_OPERATION", map[string]any{"operation": "evaluate", "target": target}},
		{"click-missing-target", "act", "INVALID_ARGUMENT", map[string]any{"operation": "click"}},
		{"fill-missing-value", "act", "INVALID_ARGUMENT", map[string]any{"operation": "fill", "target": target}},
		{"fill-non-string-value", "act", "INVALID_ARGUMENT", map[string]any{"operation": "fill", "target": target, "value": 23}},
		{"wait-missing-condition", "wait", "INVALID_ARGUMENT", map[string]any{"target": target}},
		{"verify-missing-equals-expected", "verify", "INVALID_ARGUMENT", map[string]any{"target": target, "condition": map[string]any{"kind": "equals", "field": "text"}}},
		{"verify-nonempty-with-expected", "verify", "INVALID_ARGUMENT", map[string]any{"target": target, "condition": map[string]any{"kind": "nonEmpty", "field": "value", "expected": "incorrect"}}},
		{"read-fractional-timeout", "read", "INVALID_ARGUMENT", map[string]any{"target": target, "field": "text", "timeoutMs": 1.5}},
		{"read-negative-timeout", "read", "INVALID_ARGUMENT", map[string]any{"target": target, "field": "text", "timeoutMs": -1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := owner.Call(tc.operation, tc.args)
			failure, ok := got["error"].(map[string]any)
			if !ok || failure["code"] != tc.code || got["outcome"] != "NOT_DISPATCHED" {
				t.Fatalf("expected %s/NOT_DISPATCHED, got %+v", tc.code, got)
			}
			if owner.cmd != nil || owner.stdin != nil || owner.stdout != nil {
				t.Fatal("invalid arguments started the Browser Core client")
			}
		})
	}

	for _, raw := range []string{"null\n", "{}\n", "not-json\n"} {
		t.Run("invalid-adapter-"+strings.TrimSpace(raw), func(t *testing.T) {
			adapter := &BrowserDOMRuntime{
				stdin: &browserDOMTestWriteCloser{},
				stdout: bufio.NewScanner(strings.NewReader(raw)),
			}
			got := adapter.exchange(map[string]any{"operation": "status"})
			failure, ok := got["error"].(map[string]any)
			if !ok || failure["code"] != "BROWSER_ADAPTER_RESPONSE_INVALID" || got["outcome"] != "OUTCOME_UNKNOWN" {
				t.Fatalf("untrusted adapter envelope must fail closed, got %+v", got)
			}
		})
	}
}
