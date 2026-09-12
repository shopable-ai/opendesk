package officialconfig

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testConfig() Config {
	return Config{
		SchemaVersion: SchemaVersion,
		Actions: map[string]Action{
			"help":        {Visible: true, URL: "https://example.com/help"},
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

	second, err := Encode(decoded)
	if err != nil {
		t.Fatalf("Encode(decoded): %v", err)
	}
	if !bytes.Equal(encoded, second) {
		t.Fatalf("ODCFG output is not deterministic:\nfirst=%s\nsecond=%s", encoded, second)
	}
}

func TestValidateRejectsRuntimeOwnedHomeUnsafeURLAndHiddenCoreActions(t *testing.T) {
	config := testConfig()
	config.Actions["home"] = Action{Visible: true, URL: "https://example.com"}
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "runtime-owned") {
		t.Fatalf("Validate(home) error = %v", err)
	}

	config = testConfig()
	action := config.Actions["help"]
	action.URL = "http://example.com/help"
	config.Actions["help"] = action
	if err := Validate(config); err == nil || !strings.Contains(err.Error(), "https URL") {
		t.Fatalf("Validate(http) error = %v", err)
	}

	for _, name := range []string{"help", "customize"} {
		config = testConfig()
		action = config.Actions[name]
		action.Visible = false
		config.Actions[name] = action
		if err := Validate(config); err == nil || !strings.Contains(err.Error(), "cannot be hidden") {
			t.Fatalf("Validate(hidden %s) error = %v", name, err)
		}
	}
}

func TestParseSourceRejectsTrailingJSON(t *testing.T) {
	data := []byte(`{"schemaVersion":1,"actions":{"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}} {"unexpected":true}`)
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
	source := filepath.Join(root, "official-shell.json")
	target := filepath.Join(root, "bundle", "official-shell.odcfg")
	data := `{"schemaVersion":1,"actions":{"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
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
}
