package configcli

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opendesk/pkg/officialconfig"
)

func TestIsCommand(t *testing.T) {
	if !IsCommand([]string{"config", "compile"}) {
		t.Fatal("config command was not recognized")
	}
	if IsCommand([]string{"package", "build"}) {
		t.Fatal("non-config command was recognized")
	}
}

func TestExecuteCompile(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "official-shell.json")
	target := filepath.Join(root, "official-shell.odcfg")
	data := `{"schemaVersion":1,"actions":{"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}}}`
	if err := os.WriteFile(source, []byte(data), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := Execute([]string{"config", "compile", "--source", source, "--target", target}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("Execute code = %d, stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	encoded, err := os.ReadFile(target)
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
}

func TestExecuteCompileRejectsInvalidSource(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "official-shell.json")
	if err := os.WriteFile(source, []byte(`{"schemaVersion":1,"actions":{}}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	var stdout bytes.Buffer
	code := Execute([]string{"config", "compile", "--source", source, "--target", filepath.Join(root, "out.odcfg")}, &stdout, ioDiscard{})
	if code == 0 {
		t.Fatalf("invalid config unexpectedly compiled: %s", stdout.String())
	}
}

type ioDiscard struct{}

func (ioDiscard) Write(p []byte) (int, error) { return len(p), nil }
