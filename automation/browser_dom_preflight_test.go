package automation

import (
	"context"
	"testing"
)

// Pure Go lifecycle seam: this never starts Node, Broker or a real browser.
func TestBrowserDOMInvalidCallsRejectedBeforeCoreStartup(t *testing.T) {
	runtime := NewBrowserDOMRuntime(context.Background(), BrowserDOMPolicy{
		CoreRoot: "/tmp", Origin: "http://127.0.0.1:9123", Tab: 1,
	}, "test-invalid-preflight", "recipe", true)
	defer runtime.Close()
	cases := []struct{
		op string
		args map[string]any
	}{
		{"not_a_browser_operation", nil},
		{"status", map[string]any{"arbitrary": true}},
		{"act", map[string]any{"operation": "evaluate", "target": map[string]any{"tab": 1}}},
		{"locate", map[string]any{"scope": map[string]any{"tab": 1}, "query": map[string]any{}, "script": "ignored"}},
	}
	for _, tc := range cases {
		got := runtime.Call(tc.op, tc.args)
		if got["outcome"] != "NOT_DISPATCHED" || got["error"] == nil {
			t.Fatalf("%s: invalid request was dispatched: %+v", tc.op, got)
		}
		if runtime.cmd != nil || runtime.stdin != nil || runtime.stdout != nil {
			t.Fatalf("%s: invalid request started Browser client", tc.op)
		}
	}
}
