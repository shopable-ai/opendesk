package configcli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"opendesk/pkg/officialconfig"
)

func TestIsCommand(t *testing.T) {
	for _, subcommand := range []string{"compile", "inspect", "verify"} {
		if !IsCommand([]string{"config", subcommand}) {
			t.Fatalf("config %s command was not recognized", subcommand)
		}
	}
	if IsCommand([]string{"package", "build"}) {
		t.Fatal("non-config command was recognized")
	}
}

func TestExecuteCompile(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, officialconfig.BaseName+".json")
	output := filepath.Join(root, officialconfig.BaseName+".odcfg")
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(input, []byte(data), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := Execute([]string{"config", "compile", "--input", input, "--output", output}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("Execute code = %d, stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	encoded, err := os.ReadFile(output)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if _, err := officialconfig.Decode(encoded); err != nil {
		t.Fatalf("decode target: %v", err)
	}
	var response map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("decode CLI response: %v", err)
	}
	if response["ok"] != true || response["command"] != "config.compile" {
		t.Fatalf("unexpected CLI response: %#v", response)
	}
	result := response["result"].(map[string]any)
	if result["input"] != input || result["output"] != output {
		t.Fatalf("compile response paths = %#v", result)
	}
	if _, ok := result["source"]; ok {
		t.Fatalf("compile response still exposes legacy source field: %#v", result)
	}
	if _, ok := result["target"]; ok {
		t.Fatalf("compile response still exposes legacy target field: %#v", result)
	}
	if _, ok := result["config"].(map[string]any); !ok {
		t.Fatalf("compile response does not expose the validated config: %#v", response)
	}

	stdout.Reset()
	code = Execute([]string{"config", "inspect", "--input", output}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("inspect code = %d, stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	response = nil
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("decode inspect response: %v", err)
	}
	if response["ok"] != true || response["command"] != "config.inspect" {
		t.Fatalf("unexpected inspect response: %#v", response)
	}
	result = response["result"].(map[string]any)
	if result["input"] != output {
		t.Fatalf("unexpected inspect input: %#v", result)
	}
	if _, ok := result["path"]; ok {
		t.Fatalf("inspect response still exposes legacy path field: %#v", result)
	}

	stdout.Reset()
	code = Execute([]string{"config", "verify", "--input", input, "--output", output}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("verify code = %d, stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	response = nil
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatalf("decode verify response: %v", err)
	}
	result = response["result"].(map[string]any)
	if response["ok"] != true || response["command"] != "config.verify" || result["inputMatchesOutput"] != true {
		t.Fatalf("unexpected verify response: %#v", response)
	}
	if result["input"] != input || result["output"] != output {
		t.Fatalf("unexpected verify paths: %#v", result)
	}
	if _, ok := result["source"]; ok {
		t.Fatalf("verify response still exposes legacy source field: %#v", result)
	}
	if _, ok := result["target"]; ok {
		t.Fatalf("verify response still exposes legacy target field: %#v", result)
	}
}

func TestExecuteCompileRejectsInvalidSource(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, officialconfig.BaseName+".json")
	output := filepath.Join(root, officialconfig.BaseName+".odcfg")
	if err := os.WriteFile(input, []byte(`{"schemaVersion":1,"actions":{}}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	var stdout bytes.Buffer
	code := Execute([]string{"config", "compile", "--input", input}, &stdout, ioDiscard{})
	if code == 0 {
		t.Fatalf("invalid config unexpectedly compiled: %s", stdout.String())
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Fatalf("invalid config left derived output: %v", err)
	}
}

func TestExecuteCompileDerivesOutputBesideInput(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "nested.name.JSON")
	output := filepath.Join(root, "nested.name.odcfg")
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(input, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}

	var stdout bytes.Buffer
	code := Execute([]string{"config", "compile", "--input", input}, &stdout, ioDiscard{})
	if code != 0 {
		t.Fatalf("default output compile failed: code=%d output=%s", code, stdout.String())
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatalf("derived output was not created beside input: %v", err)
	}
	var response struct {
		Result compileResult `json:"result"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Result.Output != output {
		t.Fatalf("derived output = %q, want %q", response.Result.Output, output)
	}
}

func TestExecuteCompileExplicitOutputOnlyWritesSpecifiedFile(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "input", "actions.json")
	defaultOutput := filepath.Join(root, "input", "actions.odcfg")
	explicitOutput := filepath.Join(root, "release", "nested", "product.odcfg")
	if err := os.MkdirAll(filepath.Dir(input), 0o755); err != nil {
		t.Fatal(err)
	}
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(input, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}

	var stdout bytes.Buffer
	code := Execute([]string{"config", "compile", "--input", input, "--output", explicitOutput}, &stdout, ioDiscard{})
	if code != 0 {
		t.Fatalf("explicit output compile failed: code=%d output=%s", code, stdout.String())
	}
	if _, err := os.Stat(explicitOutput); err != nil {
		t.Fatalf("explicit output was not created: %v", err)
	}
	if _, err := os.Stat(defaultOutput); !os.IsNotExist(err) {
		t.Fatalf("default output must not be written when --output is explicit: %v", err)
	}
}

func TestExecuteCompileAcceptsRelativeInput(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "relative.json")
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(input, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}
	workingDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	relativeInput, err := filepath.Rel(workingDirectory, input)
	if err != nil {
		t.Fatal(err)
	}
	relativeOutput := filepath.Join(filepath.Dir(relativeInput), "relative.odcfg")

	var stdout bytes.Buffer
	code := Execute([]string{"config", "compile", "--input", relativeInput}, &stdout, ioDiscard{})
	if code != 0 {
		t.Fatalf("relative input compile failed: code=%d output=%s", code, stdout.String())
	}
	if _, err := os.Stat(relativeOutput); err != nil {
		t.Fatalf("relative derived output was not created: %v", err)
	}
}

func TestExecuteCompileRejectsInvalidArguments(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		message string
	}{
		{name: "missing input", args: []string{"config", "compile"}, message: "--input is required"},
		{name: "empty input", args: []string{"config", "compile", "--input="}, message: "--input is required"},
		{name: "legacy source", args: []string{"config", "compile", "--source", "input.json"}, message: "flag provided but not defined"},
		{name: "positional input", args: []string{"config", "compile", "input.json"}, message: "does not accept positional"},
		{name: "duplicate input", args: []string{"config", "compile", "--input", "one.json", "--input", "two.json"}, message: "may be specified only once"},
		{name: "duplicate output", args: []string{"config", "compile", "--input", "one.json", "--output", "one.odcfg", "--output", "two.odcfg"}, message: "may be specified only once"},
		{name: "input extension", args: []string{"config", "compile", "--input", "input.yaml"}, message: "must name a .json file"},
		{name: "empty basename", args: []string{"config", "compile", "--input", ".json"}, message: "must have a basename"},
		{name: "output extension", args: []string{"config", "compile", "--input", "input.json", "--output", "output.bin"}, message: "must be a .odcfg file"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var stdout bytes.Buffer
			code := Execute(test.args, &stdout, ioDiscard{})
			if code == 0 || !strings.Contains(stdout.String(), test.message) {
				t.Fatalf("code=%d output=%s, want error containing %q", code, stdout.String(), test.message)
			}
		})
	}
}

func TestExecuteInspectAndVerifyRequireInputOutputNames(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		message string
	}{
		{name: "inspect missing input", args: []string{"config", "inspect"}, message: "--input is required"},
		{name: "inspect legacy target", args: []string{"config", "inspect", "--target", "config.odcfg"}, message: "flag provided but not defined"},
		{name: "verify missing input", args: []string{"config", "verify", "--output", "config.odcfg"}, message: "--input is required"},
		{name: "verify missing output", args: []string{"config", "verify", "--input", "config.json"}, message: "--output is required"},
		{name: "verify legacy source", args: []string{"config", "verify", "--source", "config.json", "--target", "config.odcfg"}, message: "flag provided but not defined"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var stdout bytes.Buffer
			code := Execute(test.args, &stdout, ioDiscard{})
			if code == 0 || !strings.Contains(stdout.String(), test.message) {
				t.Fatalf("code=%d output=%s, want error containing %q", code, stdout.String(), test.message)
			}
		})
	}
}

func TestExecuteVerifyRejectsStaleTarget(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, officialconfig.BaseName+".json")
	target := filepath.Join(root, officialconfig.BaseName+".odcfg")
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(source, []byte(data), 0o644); err != nil {
		t.Fatal(err)
	}
	stale := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":"https://example.com/old"},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	staleConfig, err := officialconfig.ParseSource([]byte(stale))
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := officialconfig.Encode(staleConfig)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, encoded, 0o644); err != nil {
		t.Fatal(err)
	}

	var stdout bytes.Buffer
	code := Execute([]string{"config", "verify", "--input", source, "--output", target}, &stdout, ioDiscard{})
	if code == 0 || !bytes.Contains(stdout.Bytes(), []byte(`"code":"VERIFY_FAILED"`)) {
		t.Fatalf("stale target unexpectedly verified: code=%d output=%s", code, stdout.String())
	}
}

type ioDiscard struct{}

func (ioDiscard) Write(p []byte) (int, error) { return len(p), nil }
