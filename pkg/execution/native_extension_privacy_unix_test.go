//go:build !windows

package execution

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/nativeextension"
)

const nativeExtensionSecretError = "REDTEAM_SECRET_ERROR_MESSAGE_42"

func TestNativeExtensionPrivacyHelperProcess(t *testing.T) {
	if os.Getenv("OPENDESK_NATIVE_EXT_PRIVACY_HELPER") != "1" {
		return
	}
	var request struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(bufio.NewReader(os.Stdin)).Decode(&request); err != nil {
		os.Exit(91)
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
		"protocol": nativeextension.ProtocolName,
		"version":  nativeextension.ProtocolVersion,
		"id":       request.ID,
		"ok":       false,
		"error": map[string]any{
			"code":    "secret_failure",
			"message": nativeExtensionSecretError,
		},
	})
	os.Exit(0)
}

func TestRunNativeExtensionsRedactsExtensionErrorFromPersistentArtifacts(t *testing.T) {
	base, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, "NativeExtensions")
	bundle := filepath.Join(root, "com.example.secret-error")
	executable := filepath.Join(bundle, "bin", "native-ext-secret-error")
	if err := os.MkdirAll(filepath.Dir(executable), 0o700); err != nil {
		t.Fatal(err)
	}
	wrapper := "#!/bin/sh\nOPENDESK_NATIVE_EXT_PRIVACY_HELPER=1 exec " + shellQuoteForNativeExtensionTest(os.Args[0]) + " -test.run=TestNativeExtensionPrivacyHelperProcess\n"
	if err := os.WriteFile(executable, []byte(wrapper), 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := map[string]any{
		"schemaVersion": 1,
		"id":            "com.example.secret-error",
		"version":       "0.1.0",
		"protocol":      map[string]any{"name": nativeextension.ProtocolName, "version": nativeextension.ProtocolVersion},
		"executable":    "bin/native-ext-secret-error",
		"javascript":    map[string]any{"namespace": "secretError"},
		// This test validates privacy redaction, not timeout behavior. Leave enough
		// time for the helper test binary to start during a parallel root test run.
		"methods": map[string]any{"fail": map[string]any{"wireMethod": "fail", "timeoutMs": 30000}},
	}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(bundle, "extension.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	artifacts, err := PrepareArtifacts(filepath.Join(base, "run"), "native-extension-error-privacy", ".js")
	if err != nil {
		t.Fatal(err)
	}
	result, summary, runErr := Run(Request{
		ExecutionID: "native-extension-error-privacy", SourceLabel: "test", Ext: ".js",
		ScriptContent: []byte(`NativeExtensions.secretError.fail({business:"safe"});`),
		Timeout:       45 * time.Second, EnableNativeExtensions: true,
		NativeExtensionRoots: []nativeextension.DiscoveryRoot{{Kind: nativeextension.RootTest, Path: root}},
		Artifacts:            artifacts, Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr == nil || result.Status != ExecutionStatusFailed {
		t.Fatalf("secret extension error did not fail execution: status=%s err=%v", result.Status, runErr)
	}
	encoded, err := json.Marshal([]any{result, summary, runErr.Error()})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), nativeExtensionSecretError) {
		t.Fatalf("secret extension error leaked through returned execution objects: %s", encoded)
	}
	seenDigestMetadata := false
	err = filepath.WalkDir(artifacts.RunDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		if strings.Contains(string(content), nativeExtensionSecretError) {
			return fmt.Errorf("secret extension error leaked into %s", path)
		}
		if strings.Contains(string(content), "extensionMessageSha256") && strings.Contains(string(content), "extensionMessageBytes") {
			seenDigestMetadata = true
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if !seenDigestMetadata {
		t.Fatal("privacy-minimized extension error digest metadata was not persisted")
	}
}

func shellQuoteForNativeExtensionTest(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
