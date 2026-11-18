package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"opendesk/internal/browserbridge"
	"opendesk/pkg/mcpserver"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

// Run only the file-mode branch in a subprocess, since main uses os.Exit.
// No Native client, desktop Runtime, credential file, or Tunnel is created.
func TestFilesBridgeCLIProcess(t *testing.T) {
	if os.Getenv("OPENDESK_MCP_FILES_CLI_TEST") != "1" {
		return
	}
	flag.CommandLine = flag.NewFlagSet("opendesk-mcp", flag.ExitOnError)
	for i, arg := range os.Args {
		if arg == "--" {
			os.Args = append([]string{"opendesk-mcp"}, os.Args[i+1:]...)
			main()
			return
		}
	}
	t.Fatal("missing subprocess arguments")
}

func TestFilesBridgeCLIFailsClosedAndRejectsMixedModes(t *testing.T) {
	const privateReference = "/private/native/secret-token.json"
	for _, tc := range []struct {
		name string
		args []string
		want string
	}{
		{"unavailable", []string{"--files-bridge-credential-file", privateReference}, "E_FILES_BRIDGE"},
		{"empty-reference", []string{"--files-bridge-credential-file="}, "E_FILES_BRIDGE"},
		{"desktop-read-only", []string{"--read-only"}, "conflicts"},
		{"explicit-false-read-only", []string{"--read-only=false"}, "conflicts"},
		{"nonce-proof", []string{"--web-file-test-dir=/private/proof"}, "conflicts"},
		{"browser", []string{"--browser-core-root=/private/browser"}, "conflicts"},
		{"browser-empty", []string{"--browser-execution-id="}, "conflicts"},
		{"scripts", []string{"--allow-script-execution"}, "conflicts"},
		{"scripts-explicit-false", []string{"--allow-script-execution=false"}, "conflicts"},
		{"script-capabilities", []string{"--script-capabilities=sqlite"}, "conflicts"},
		{"api-docs", []string{"--api-docs-root=/private/proof"}, "conflicts"},
		{"positional", []string{"--files-bridge-credential-file", privateReference, "unexpected"}, "positional arguments are not supported"},
		{"leading-positional", []string{"unexpected", "--files-bridge-credential-file", privateReference}, "positional arguments are not supported"},
		{"after-terminator", []string{"--", "--files-bridge-credential-file", privateReference}, "positional arguments are not supported"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			args := []string{"-test.run=^TestFilesBridgeCLIProcess$", "--"}
			if tc.want == "conflicts" {
				args = append(args, "--files-bridge-credential-file", privateReference)
			}
			args = append(args, tc.args...)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, os.Args[0], args...)
			cmd.Env = append(os.Environ(), "OPENDESK_MCP_FILES_CLI_TEST=1")
			cmd.Stdin = strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\n")
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			err := cmd.Run()
			if ctx.Err() != nil {
				t.Fatal("file mode did not fail closed promptly")
			}
			exit, ok := err.(*exec.ExitError)
			if !ok || exit.ExitCode() != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), tc.want) {
				t.Fatalf("exit=%v stdout=%q stderr=%q", err, stdout.String(), stderr.String())
			}
			for _, secret := range []string{privateReference, "secret-token", "/private/proof", "/private/browser"} {
				if strings.Contains(stderr.String(), secret) {
					t.Fatal("private CLI input leaked into diagnostics")
				}
			}
		})
	}
}

func TestAdvancedCLIRejectsInvalidAuthorizationBeforeRuntime(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
		want string
	}{
		{"read-only-script", []string{"--read-only", "--allow-script-execution"}, "conflicts with read-only"},
		{"capability-without-script", []string{"--script-capabilities=sqlite"}, "requires allow-script-execution"},
		{"unknown-capability", []string{"--allow-script-execution", "--script-capabilities=unknown"}, "unsupported host script capability"},
		{"relative-docs", []string{"--api-docs-root=docs"}, "absolute trusted checkout path"},
		{"nonce-script", []string{"--web-file-test-dir=/private/proof", "--allow-script-execution"}, "conflicts"},
		{"nonce-explicit-false", []string{"--web-file-test-dir=/private/proof", "--allow-script-execution=false"}, "conflicts"},
		{"nonce-capabilities", []string{"--web-file-test-dir=/private/proof", "--script-capabilities=sqlite"}, "conflicts"},
		{"nonce-docs", []string{"--web-file-test-dir=/private/proof", "--api-docs-root=/private/docs"}, "conflicts"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			args := append([]string{"-test.run=^TestFilesBridgeCLIProcess$", "--"}, tc.args...)
			cmd := exec.CommandContext(ctx, os.Args[0], args...)
			cmd.Env = append(os.Environ(), "OPENDESK_MCP_FILES_CLI_TEST=1")
			cmd.Stdin = strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\n")
			var stdout, stderr bytes.Buffer
			cmd.Stdout, cmd.Stderr = &stdout, &stderr
			err := cmd.Run()
			exit, ok := err.(*exec.ExitError)
			if ctx.Err() != nil || !ok || exit.ExitCode() != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), tc.want) {
				t.Fatalf("exit=%v stdout=%q stderr=%q", err, stdout.String(), stderr.String())
			}
		})
	}
}

type failedNativeFiles struct {
	err   error
	calls int
}

func (f *failedNativeFiles) Call(context.Context, string, json.RawMessage) (json.RawMessage, error) {
	f.calls++
	return nil, f.err
}

// A failed or uncertain Native call must be sanitized and never replayed.
func TestFilesBridgeNativeErrorsNeverLeakOrReplay(t *testing.T) {
	for _, tc := range []struct {
		name          string
		err           error
		code, outcome string
	}{
		{"unknown-write", &browserbridge.CallError{Code: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}, "E_EFFECT_UNKNOWN", "OUTCOME_UNKNOWN"},
		{"not-dispatched", &browserbridge.CallError{Code: "E_AUTH", Outcome: "NOT_DISPATCHED"}, "E_AUTH", "NOT_DISPATCHED"},
		{"private-error", errors.New("secret-capability /private/owner/body"), "E_FILES_BRIDGE", "OUTCOME_UNKNOWN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &failedNativeFiles{err: tc.err}
			backend := nativeFilesBackend{client: client}
			_, err := backend.Call(context.Background(), "files.write", json.RawMessage(`{}`))
			var safe *mcpserver.FilesBridgeBackendError
			if !errors.As(err, &safe) || safe.Code != tc.code || safe.Outcome != tc.outcome || client.calls != 1 {
				t.Fatalf("code/outcome/calls differ: %T %v calls=%d", err, err, client.calls)
			}
			if strings.Contains(err.Error(), "private") || strings.Contains(err.Error(), "secret") {
				t.Fatal("private Native diagnostic leaked")
			}
		})
	}
}
