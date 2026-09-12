package officialconfig

import (
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
}

func TestValidateRejectsRuntimeOwnedHomeAndUnsafeURL(t *testing.T) {
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
