package automation

import (
	"strings"
	"testing"

	"github.com/dop251/goja"
)

func envEntriesForTest(entries []string) map[string]string {
	out := make(map[string]string, len(entries))
	for _, entry := range entries {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) == 2 {
			out[strings.ToUpper(parts[0])] = parts[1]
		}
	}
	return out
}

func TestCommandEnvModeReplaceDropsInheritedEnvironment(t *testing.T) {
	runtimeValue := goja.New()
	spec := commandSpec{env: []string{"PATH=/bin", "BUSINESS_SECRET=do-not-pass"}}
	options := runtimeValue.ToValue(map[string]interface{}{
		"envMode": "replace",
		"env": map[string]interface{}{"VISIBLE": "yes"},
	})
	if err := parseCommandOptions(options, &spec); err != nil {
		t.Fatalf("parseCommandOptions: %v", err)
	}
	got := envEntriesForTest(spec.env)
	if got["VISIBLE"] != "yes" {
		t.Fatalf("VISIBLE=%q, want yes", got["VISIBLE"])
	}
	if _, ok := got["BUSINESS_SECRET"]; ok {
		t.Fatalf("replace mode leaked BUSINESS_SECRET: %#v", got)
	}
	if _, ok := got["PATH"]; ok {
		t.Fatalf("replace mode implicitly retained PATH: %#v", got)
	}
}

func TestCommandEnvModeInheritRemainsDefault(t *testing.T) {
	runtimeValue := goja.New()
	spec := commandSpec{env: []string{"PATH=/bin", "BUSINESS_SECRET=keep"}}
	options := runtimeValue.ToValue(map[string]interface{}{
		"env": map[string]interface{}{"VISIBLE": "yes"},
	})
	if err := parseCommandOptions(options, &spec); err != nil {
		t.Fatalf("parseCommandOptions: %v", err)
	}
	got := envEntriesForTest(spec.env)
	if got["PATH"] != "/bin" || got["BUSINESS_SECRET"] != "keep" || got["VISIBLE"] != "yes" {
		t.Fatalf("inherit mode mismatch: %#v", got)
	}
}

func TestCommandEnvModeRejectsUnknownValue(t *testing.T) {
	runtimeValue := goja.New()
	spec := commandSpec{env: []string{"PATH=/bin"}}
	options := runtimeValue.ToValue(map[string]interface{}{"envMode": "clean"})
	if err := parseCommandOptions(options, &spec); err == nil {
		t.Fatal("expected invalid envMode to fail")
	}
}
