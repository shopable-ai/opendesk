//go:build darwin || linux

package browsercli

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestR17GoCLIHelpVersionAndUnknownNeverAuthorizeDirectory(t *testing.T) {
	home, err := os.MkdirTemp("", "opendesk-r17-cli-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(home) })
	if err = os.Chmod(home, 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	for _, args := range [][]string{
		{"browser", "help"}, {"browser", "--help"}, {"browser", "-h"},
		{"browser", "dev", "--help"}, {"browser", "--version"},
	} {
		var out, diag bytes.Buffer
		if code := Execute(args, &out, &diag); code != 0 || out.Len() == 0 || diag.Len() != 0 {
			t.Fatalf("side-effect-free command %v rejected: code=%d stdout=%q stderr=%q", args, code, out.String(), diag.String())
		}
	}
	if _, err := os.Lstat(filepath.Join(home, ".opendesk-browser")); !os.IsNotExist(err) {
		t.Fatalf("help/version performed installation side effect: %v", err)
	}
	for _, args := range [][]string{
		{"browser", "unexpected-script.js"}, {"browser", "not-a-directory"},
	} {
		var out, diag bytes.Buffer
		if code := Execute(args, &out, &diag); code == 0 || !strings.Contains(diag.String(), "E_CAPABILITY") {
			t.Fatalf("unknown subcommand implicitly authorized: %v %s", args, diag.String())
		}
	}
	for _, args := range [][]string{
		{"browser"}, {"browser", "dev"}, {"browser", "dev", "."},
		{"browser", "--read-only"}, {"browser", "dev", "--read-only"},
		{"browser", "dev", "--read-only", "/some/directory"},
		{"browser", "dev", "--read-only", "--", "--special"},
	} {
		var out, diag bytes.Buffer
		if code := Execute(args, &out, &diag); code == 0 || !strings.Contains(diag.String(), "E_DEV_COMPONENT_MISSING") {
			t.Fatalf("bare browser/dev did not consistently select trusted Node CLI: %v %s", args, diag.String())
		}
	}
}

func TestR17ReadOnlyArgumentsAreValidatedBeforeNodeOrAuthorization(t *testing.T) {
	for _, args := range [][]string{
		{}, {"--read-only"}, {"."}, {"--read-only", "."},
		{"--", "--read-only"}, {"--read-only", "--", "--special directory"},
	} {
		if err := validateBrowserDevArgs(args); err != nil {
			t.Fatalf("valid dev arguments %v: %v", args, err)
		}
	}
	for _, args := range [][]string{
		{"--read-only", "--read-only"}, {".", "--read-only"}, {"one", "two"}, {"--access", "read-write"},
		{"--"}, {"--read-only", "--"}, {"--read-only=true"}, {""}, {"--", ""},
		{"one", "--", "two"}, {"--", "one", "--read-only"},
	} {
		if err := validateBrowserDevArgs(args); err == nil {
			t.Fatalf("invalid dev arguments accepted: %v", args)
		}
		var out, diag bytes.Buffer
		if code := runBrowserDev(args, &out, &diag); code == 0 || !strings.Contains(diag.String(), "E_SCHEMA") {
			t.Fatalf("invalid args reached component lookup: %v %s", args, diag.String())
		}
	}
}

func TestR17GoRejectsLegacyNPMReceiptAndPreservesHashPin(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	root := filepath.Join(home, ".opendesk-browser")
	receiptDir := filepath.Join(root, "dev-tool-r17")
	entry := filepath.Join(home, "npm-prefix", "lib", "node_modules", "@shopable", "opendesk-dev", "bin", "opendesk-dev.mjs")
	for _, dir := range []string{root, receiptDir, filepath.Dir(entry)} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	body := []byte("// registered component fixture\n")
	if err := os.WriteFile(entry, body, 0600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(body)
	receipt := devReceipt{Format: devReceiptFormat, Entry: entry, SHA256: hex.EncodeToString(digest[:])}
	write := func() {
		t.Helper()
		encoded, err := json.Marshal(receipt)
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(receiptDir, "entry.json"), encoded, 0600); err != nil {
			t.Fatal(err)
		}
	}
	write()
	if _, err := findTrustedDevTool(); err == nil || !strings.Contains(err.Error(), "E_DEV_COMPONENT_UPDATE_REQUIRED") {
		t.Fatalf("old Node could silently preserve read-only default: %v", err)
	}
	receipt.LocalDevAccessVersion = 1
	write()
	if got, err := findTrustedDevTool(); err != nil || got != entry {
		t.Fatalf("compatible registered CLI rejected: %s %v", got, err)
	}
	if err := os.WriteFile(entry, []byte("// changed after registration\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := findTrustedDevTool(); err == nil || !strings.Contains(err.Error(), "E_DEV_COMPONENT_CHANGED") {
		t.Fatalf("npm update bypassed recorded hash: %v", err)
	}
}
