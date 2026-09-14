package officialconfig

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testConfig() Config {
	return Config{
		SchemaVersion: SchemaVersion,
		Actions: map[string]Action{
			"home":        {Visible: true, URL: "https://example.com/home"},
			"help":        {Visible: true, URL: "https://example.com/help"},
			"examples":    {Visible: true, URL: "https://example.com/examples"},
			"apiDocs":     {Visible: true, URL: "https://example.com/docs/api"},
			"customize":   {Visible: true, URL: "https://example.com/customize"},
			"marketplace": {Visible: false, URL: ""},
			"upgrade":     {Visible: false, URL: ""},
		},
	}
}

func TestEncodeDecodeRoundTrip(t *testing.T) {
	encoded, err := Encode(testConfig())
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	if !strings.HasPrefix(string(encoded), Magic+":") {
		t.Fatalf("encoded payload missing %s header: %q", Magic, encoded)
	}
	if strings.Contains(string(encoded), "example.com") {
		t.Fatalf("encoded payload leaked plaintext URL: %q", encoded)
	}
	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if got := decoded.Actions["help"].URL; got != "https://example.com/help" {
		t.Fatalf("decoded help URL = %q", got)
	}
	if got := decoded.Actions["apiDocs"].URL; got != "https://example.com/docs/api" {
		t.Fatalf("decoded API docs URL = %q", got)
	}

	second, err := Encode(decoded)
	if err != nil {
		t.Fatalf("Encode(decoded): %v", err)
	}
	if !bytes.Equal(encoded, second) {
		t.Fatalf("ODCFG output is not deterministic:\nfirst=%s\nsecond=%s", encoded, second)
	}
}

func TestValidateRejectsUnsafeURLHiddenCoreMissingAndUnknownActions(t *testing.T) {
	config := testConfig()
	action := config.Actions["home"]
	action.URL = "http://example.com/home"
	config.Actions["home"] = action
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "https URL") {
		t.Fatalf("Validate(http home) error = %v", err)
	}

	config = testConfig()
	action = config.Actions["help"]
	action.URL = "http://example.com/help"
	config.Actions["help"] = action
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "https URL") {
		t.Fatalf("Validate(http) error = %v", err)
	}

	for _, name := range []string{"home", "help", "customize", "examples", "apiDocs"} {
		config = testConfig()
		action = config.Actions[name]
		action.Visible = false
		config.Actions[name] = action
		if err := Validate(config); err == nil || !strings.Contains(err.Error(), "cannot be hidden") {
			t.Fatalf("Validate(hidden %s) error = %v", name, err)
		}
	}

	config = testConfig()
	action = config.Actions["home"]
	action.URL = ""
	config.Actions["home"] = action
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "requires https URL") {
		t.Fatalf("Validate(empty home) error = %v", err)
	}

	config = testConfig()
	action = config.Actions["help"]
	action.URL = ""
	config.Actions["help"] = action
	if err := Validate(config); err != nil {
		t.Fatalf("Validate(empty optional URL): %v", err)
	}

	config = testConfig()
	delete(config.Actions, "upgrade")
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "missing action") {
		t.Fatalf("Validate(missing action) error = %v", err)
	}

	config = testConfig()
	config.Actions["unknown"] = Action{Visible: true, URL: "https://example.com/unknown"}
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "unknown action") {
		t.Fatalf("Validate(unknown action) error = %v", err)
	}

	config = testConfig()
	delete(config.Actions, "examples")
	delete(config.Actions, "apiDocs")
	if err := Validate(config); err != nil {
		t.Fatalf("Validate(config without backward-compatible optional actions): %v", err)
	}
}

func TestParseSourceRejectsTrailingJSON(t *testing.T) {
	data := []byte(`{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}} {"unexpected":true}`)
	if _, err := ParseSource(data); err == nil || !strings.Contains(err.Error(), "trailing JSON") {
		t.Fatalf("ParseSource trailing data error = %v", err)
	}
}

func TestDecodeRejectsChecksumMismatch(t *testing.T) {
	encoded, err := Encode(testConfig())
	if err != nil {
		t.Fatalf("Encode: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(string(encoded)), "\n")
	if len(lines) != 2 || len(lines[1]) < 2 {
		t.Fatalf("unexpected encoded payload: %q", encoded)
	}
	last := lines[1][len(lines[1])-1]
	replacement := byte('0')
	if last == '0' {
		replacement = '1'
	}
	lines[1] = lines[1][:len(lines[1])-1] + string(replacement)
	if _, err := Decode([]byte(strings.Join(lines, "\n"))); err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("Decode(tampered) error = %v", err)
	}
}

func TestCompileFileWritesDecodableTarget(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, BaseName+".json")
	target := filepath.Join(root, "bundle", BaseName+".odcfg")
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(source, []byte(data), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if _, err := CompileFile(source, target); err != nil {
		t.Fatalf("CompileFile: %v", err)
	}
	encoded, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read target: %v", err)
	}
	if _, err := Decode(encoded); err != nil {
		t.Fatalf("decode compiled target: %v", err)
	}
	inspected, err := InspectFile(target)
	if err != nil {
		t.Fatalf("InspectFile: %v", err)
	}
	if inspected.Actions["help"].Visible != true {
		t.Fatal("InspectFile did not return the compiled action configuration")
	}
	if _, err := VerifyFiles(source, target); err != nil {
		t.Fatalf("VerifyFiles: %v", err)
	}
	secondTarget := filepath.Join(root, "second", BaseName+".odcfg")
	if _, err := CompileFile(source, secondTarget); err != nil {
		t.Fatalf("second CompileFile: %v", err)
	}
	secondEncoded, err := os.ReadFile(secondTarget)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(encoded, secondEncoded) {
		t.Fatal("CompileFile output is not deterministic across output paths")
	}
}

func TestCompileFileRejectsSameInputAndOutput(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "same.json")
	if err := os.WriteFile(input, []byte(`{}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := CompileFile(input, input); err == nil || !strings.Contains(err.Error(), "must be different files") {
		t.Fatalf("CompileFile(same path) error = %v", err)
	}

	linkedOutput := filepath.Join(root, "same.odcfg")
	if err := os.Link(input, linkedOutput); err != nil {
		t.Skipf("hard links unavailable: %v", err)
	}
	if _, err := CompileFile(input, linkedOutput); err == nil || !strings.Contains(err.Error(), "must be different files") {
		t.Fatalf("CompileFile(hard link) error = %v", err)
	}
}

func TestCompileFileValidatesExtensionsBeforeWriting(t *testing.T) {
	root := t.TempDir()
	tests := []struct {
		name    string
		input   string
		output  string
		message string
	}{
		{name: "input", input: "input.yaml", output: "output.odcfg", message: "input must be a .json file"},
		{name: "input basename", input: ".json", output: "output.odcfg", message: "input filename must have a basename"},
		{name: "output", input: "input.json", output: "output.bin", message: "output must be a .odcfg file"},
		{name: "output basename", input: "input.json", output: ".odcfg", message: "output filename must have a basename"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			output := filepath.Join(root, test.output)
			_, err := CompileFile(filepath.Join(root, test.input), output)
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("CompileFile error = %v, want %q", err, test.message)
			}
			if _, statErr := os.Lstat(output); !os.IsNotExist(statErr) {
				t.Fatalf("invalid compile left output %q: %v", output, statErr)
			}
		})
	}
}

func TestCompileFileReplaceFailurePreservesExistingOutputAndCleansTemporaryFile(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "input.json")
	output := filepath.Join(root, "output.odcfg")
	inputData := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.com/home"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(input, []byte(inputData), 0o644); err != nil {
		t.Fatal(err)
	}
	original := []byte("existing complete output\n")
	if err := os.WriteFile(output, original, 0o640); err != nil {
		t.Fatal(err)
	}

	_, err := compileFile(input, output, func(_, _ string) error {
		return errors.New("injected replace failure")
	})
	if err == nil || !strings.Contains(err.Error(), "publish config output") {
		t.Fatalf("compileFile replace error = %v", err)
	}
	got, readErr := os.ReadFile(output)
	if readErr != nil {
		t.Fatal(readErr)
	}
	if !bytes.Equal(got, original) {
		t.Fatalf("failed compile changed existing output: got %q want %q", got, original)
	}
	temporary, globErr := filepath.Glob(filepath.Join(root, ".opendesk-config-*.tmp"))
	if globErr != nil {
		t.Fatal(globErr)
	}
	if len(temporary) != 0 {
		t.Fatalf("failed compile left temporary files: %v", temporary)
	}
}

func TestCompileFileInvalidInputPreservesExistingOutput(t *testing.T) {
	root := t.TempDir()
	input := filepath.Join(root, "input.json")
	output := filepath.Join(root, "output.odcfg")
	if err := os.WriteFile(input, []byte(`{"schemaVersion":1,"actions":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	original := []byte("existing complete output\n")
	if err := os.WriteFile(output, original, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := CompileFile(input, output); err == nil {
		t.Fatal("invalid input unexpectedly compiled")
	}
	got, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, original) {
		t.Fatalf("invalid input changed existing output: got %q want %q", got, original)
	}
}

func TestVerifyFilesRejectsValidButStaleTarget(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, BaseName+".json")
	target := filepath.Join(root, BaseName+".odcfg")
	current := testConfig()
	currentData, err := json.Marshal(current)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, currentData, 0o644); err != nil {
		t.Fatal(err)
	}

	stale := testConfig()
	staleAction := stale.Actions["help"]
	staleAction.URL = "https://example.com/old-help"
	stale.Actions["help"] = staleAction
	staleData, err := Encode(stale)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, staleData, 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := VerifyFiles(source, target); err == nil || !strings.Contains(err.Error(), "stale or non-canonical") {
		t.Fatalf("VerifyFiles(stale) error = %v", err)
	}
}

func TestInspectFileRejectsCorruptTarget(t *testing.T) {
	target := filepath.Join(t.TempDir(), BaseName+".odcfg")
	if err := os.WriteFile(target, []byte("ODCFG1:ffff\n00\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := InspectFile(target); err == nil || !strings.Contains(err.Error(), "checksum mismatch") {
		t.Fatalf("InspectFile(corrupt) error = %v", err)
	}
}
