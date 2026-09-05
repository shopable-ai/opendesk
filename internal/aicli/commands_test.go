package aicli

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestResolveRoute(t *testing.T) {
	tests := []struct {
		args string
		want string
	}{
		{"windows --title Safari", "windows"},
		{"window active", "window.active"},
		{"vision detect-ui --image shot.png --text Send", "vision.detect-ui"},
		{"run recipe.js --input {}", "run"},
	}
	for _, test := range tests {
		name, _, err := resolveRoute(strings.Fields(test.args))
		if err != nil {
			t.Fatalf("resolveRoute(%q): %v", test.args, err)
		}
		if name != test.want {
			t.Fatalf("resolveRoute(%q) = %q, want %q", test.args, name, test.want)
		}
	}
	if _, _, err := resolveRoute([]string{"window"}); err == nil || err.Code != "invalid_command" {
		t.Fatalf("missing grouped subcommand error = %#v", err)
	}
}

func TestEnvelopeIsOneJSONObjectWithUnicodeAndNestedValues(t *testing.T) {
	var output bytes.Buffer
	code := writeEnvelope(&output, Envelope{
		OK:      true,
		Command: "clipboard.get",
		Result:  map[string]any{"text": "发送", "nested": map[string]any{"value": 1}},
	})
	if code != 0 {
		t.Fatalf("writeEnvelope code = %d", code)
	}
	var got map[string]any
	if err := json.Unmarshal(output.Bytes(), &got); err != nil {
		t.Fatalf("stdout is not JSON: %v\n%s", err, output.String())
	}
	if got["ok"] != true || got["command"] != "clipboard.get" {
		t.Fatalf("unexpected envelope: %#v", got)
	}
}

func TestExecuteReportsMachineReadableParserErrors(t *testing.T) {
	tests := []struct {
		argv    []string
		command string
		code    string
	}{
		{argv: []string{"ai", "not-a-command"}, command: "not-a-command", code: "invalid_command"},
		{argv: []string{"ai", "window"}, command: "ai", code: "invalid_command"},
		{argv: []string{"ai", "run"}, command: "run", code: "invalid_argument"},
	}
	for _, test := range tests {
		var stdout, stderr bytes.Buffer
		if exit := Execute(test.argv, &stdout, &stderr); exit != 2 {
			t.Fatalf("Execute(%q) exit=%d, want 2", test.argv, exit)
		}
		var got Envelope
		if err := json.Unmarshal(stdout.Bytes(), &got); err != nil {
			t.Fatalf("Execute(%q) stdout is not JSON: %v", test.argv, err)
		}
		if got.OK || got.Command != test.command || got.Error == nil || got.Error.Code != test.code {
			t.Fatalf("Execute(%q) envelope=%+v", test.argv, got)
		}
	}
}

func TestRegionContracts(t *testing.T) {
	region, err := parseRect("20,80,800,500")
	if err != nil || region != (rect{X: 20, Y: 80, Width: 800, Height: 500}) {
		t.Fatalf("parseRect = %#v, %#v", region, err)
	}
	if _, err := parseRect("1,2,-1,3"); err == nil || err.Code != "invalid_argument" {
		t.Fatalf("negative region error = %#v", err)
	}
	relative, err := parseRelativeRect("0.05,0.10,0.90,0.70")
	if err != nil || relative.Width != 0.90 || relative.Height != 0.70 {
		t.Fatalf("parseRelativeRect = %#v, %#v", relative, err)
	}
	if _, err := parseRelativeRect("0.5,0.5,0.6,0.6"); err == nil || err.Code != "invalid_argument" {
		t.Fatalf("out-of-bounds relative error = %#v", err)
	}
}

func TestReadRunInput(t *testing.T) {
	input, err := readRunInput(`{"message":"hello","nested":{"ok":true}}`, "", false)
	if err != nil {
		t.Fatalf("readRunInput: %v", err)
	}
	root, ok := input.(map[string]any)
	if !ok || root["message"] != "hello" {
		t.Fatalf("unexpected input: %#v", input)
	}
	if _, err := readRunInput("{", "", false); err == nil || err.Code != "invalid_json" {
		t.Fatalf("invalid JSON error = %#v", err)
	}
}

func TestNormalizeRecipeEntrypointAwaitsTerminalMainCall(t *testing.T) {
	source := []byte("async function main() { await page.waitForTimeout(1); }\nmain();\n")
	normalized := string(normalizeRecipeEntrypoint(source))
	if !strings.HasSuffix(normalized, "return await main();\n") {
		t.Fatalf("terminal main was not normalized: %q", normalized)
	}
	topLevelAwait := []byte("async function main() { await page.waitForTimeout(1); }\nawait main();\n")
	if got := string(normalizeRecipeEntrypoint(topLevelAwait)); !strings.HasSuffix(got, "return await main();\n") || strings.Contains(got, "await return") {
		t.Fatalf("terminal await main was not normalized: %q", got)
	}
	memberCall := []byte("async function main() { return 1; }\nworker.main();\n")
	if got := string(normalizeRecipeEntrypoint(memberCall)); got != string(memberCall) {
		t.Fatalf("terminal member call changed: %q", got)
	}
	unchanged := []byte("async function work() { return 1; }\nwork();\n")
	if got := string(normalizeRecipeEntrypoint(unchanged)); got != string(unchanged) {
		t.Fatalf("non-main recipe changed: %q", got)
	}
}

func TestRegistryContainsAgentPrimitives(t *testing.T) {
	want := map[string]bool{
		"capabilities": true, "schema": true, "windows": true, "screenshot": true,
		"mouse.click": true, "keyboard.type": true, "clipboard.get": true,
		"app.open": true, "vision.ocr": true, "image.match": true, "run": true,
	}
	for _, name := range commandNames() {
		delete(want, name)
	}
	if len(want) != 0 {
		t.Fatalf("missing primitive commands: %#v", want)
	}
}

func TestRunSchemaDocumentsExecutionOptions(t *testing.T) {
	command, found := findCommand("run")
	if !found {
		t.Fatal("run command missing")
	}
	foundTimeout := false
	for _, argument := range command.Arguments {
		if argument.Name == "--timeout" && argument.Type == "duration" {
			foundTimeout = true
		}
		if argument.Name == "--subprocess" {
			t.Fatal("run schema must not require a second command-execution authorization flag")
		}
	}
	if !foundTimeout {
		t.Fatal("run schema omitted --timeout")
	}
}

func TestEveryRegisteredCommandHasAHandler(t *testing.T) {
	for _, command := range registry() {
		if command.Handler == nil {
			t.Fatalf("%s has no handler", command.Name)
		}
	}
}
