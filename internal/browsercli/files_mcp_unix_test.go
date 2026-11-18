//go:build darwin || linux

package browsercli

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"opendesk/internal/browserbridge"
)

func TestFilesMCPCLIHelper(t *testing.T) {
	if os.Getenv("OPENDESK_FILES_MCP_CLI_TEST") != "1" {
		return
	}
	for i, arg := range os.Args {
		if arg == "--" {
			os.Exit(Execute(append([]string{"browser", "files-mcp"}, os.Args[i+1:]...), os.Stdout, os.Stderr))
		}
	}
	os.Exit(2)
}
func TestFilesMCPCLIRejectsInvalidInputWithoutSecrets(t *testing.T) {
	for _, args := range [][]string{{}, {"grant"}, {"grant", "--approval-file", "/private/secret/approval.json"}, {"revoke", "--grant-id", "not-a-uuid"}, {"grant", "--approval-file", "x", "--credential-file", "y", "--credential-file", "z"}, {"read"}} {
		var out, diag bytes.Buffer
		if code := Execute(append([]string{"browser", "files-mcp"}, args...), &out, &diag); code != 1 {
			t.Fatal("unsafe CLI input accepted")
		}
		if strings.Contains(diag.String(), "/private/secret") || out.Len() != 0 {
			t.Fatal("CLI leaked private path")
		}
	}
}
func TestFilesMCPCLILeaseHeldUntilProcessExit(t *testing.T) {
	base := "/tmp"
	if runtime.GOOS == "darwin" {
		base = "/private/tmp"
	}
	home, e := os.MkdirTemp(base, "od-mcp-cli-")
	if e != nil {
		t.Fatal(e)
	}
	defer os.RemoveAll(home)
	os.Chmod(home, 0700)
	t.Setenv("HOME", home)
	t.Setenv("OPENDESK_CODEX_HTTP_ADDR", "")
	t.Setenv("OPENDESK_CODEX_HTTP_TOKEN", "")
	binary, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	// All installation metadata and Unix IPC stay inside this disposable HOME.
	if _, e = browserbridge.Setup(cliTestExtensionID, "chrome", "", binary); e != nil {
		t.Fatal(e)
	}
	cfg, e := browserbridge.Load()
	if e != nil {
		t.Fatal(e)
	}
	dir := filepath.Join(home, "workspace")
	os.Mkdir(dir, 0700)
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte("before"), 0600)
	workspace, e := browserbridge.WorkspaceAdd(dir, "read-write")
	if e != nil {
		t.Fatal(e)
	}
	in, chromeWrite := io.Pipe()
	chromeRead, out := io.Pipe()
	h, e := browserbridge.NewHost(cfg, "chrome-extension://"+cfg.ExtensionID+"/", in, out)
	if e != nil {
		t.Fatal(e)
	}
	hostDone := make(chan error, 1)
	go func() { hostDone <- h.Run() }()
	defer func() {
		h.Close()
		chromeRead.Close()
		chromeWrite.Close()
		out.Close()
		select {
		case <-hostDone:
		case <-time.After(time.Second):
			t.Error("test Host did not exit")
		}
	}()
	if _, e = browserbridge.ReadFrame(chromeRead); e != nil {
		t.Fatal(e)
	}
	if e = browserbridge.WriteFrame(chromeWrite, browserbridge.MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": cfg.ExtensionID, "extensionVersion": "test"})); e != nil {
		t.Fatal(e)
	}
	private := filepath.Join(home, "private")
	os.Mkdir(private, 0700)
	approval := filepath.Join(private, "approval.json")
	credential := filepath.Join(private, "credential.json")
	raw, _ := json.Marshal(map[string]any{"purpose": "opendesk.files-mcp.v1", "workspaceId": workspace["workspaceId"], "ttlSeconds": 60, "bodyEgressConsent": true, "files": []map[string]string{{"path": "file.txt", "access": "read-write"}}})
	os.WriteFile(approval, raw, 0600)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "-test.run=^TestFilesMCPCLIHelper$", "--", "grant", "--approval-file", approval, "--credential-file", credential)
	cmd.Env = append(os.Environ(), "OPENDESK_FILES_MCP_CLI_TEST=1")
	var diagnostics bytes.Buffer
	cmd.Stderr = &diagnostics
	stdout, e := cmd.StdoutPipe()
	if e != nil {
		t.Fatal(e)
	}
	if e = cmd.Start(); e != nil {
		t.Fatal(e)
	}
	waited := false
	defer func() {
		if !waited {
			cmd.Process.Kill()
			cmd.Wait()
		}
	}()
	var result map[string]any
	if e = json.NewDecoder(stdout).Decode(&result); e != nil {
		t.Fatal("grant did not emit readiness", e)
	}
	if result["ok"] != true || result["grantId"] == nil || len(result) != 3 {
		t.Fatal("grant output schema changed")
	}
	c, e := browserbridge.NewFilesMCPClient(credential)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	raw, e = c.Call(ctx, "files.status", json.RawMessage(`{}`))
	if e != nil {
		t.Fatal(e)
	}
	var status map[string]any
	json.Unmarshal(raw, &status)
	if status["ok"] != true {
		t.Fatal("CLI did not hold active lease")
	}
	if e = cmd.Process.Signal(syscall.SIGTERM); e != nil {
		t.Fatal(e)
	}
	e = cmd.Wait()
	waited = true
	if e != nil {
		t.Fatal("CLI did not close cleanly", e)
	}
	deadline := time.Now().Add(time.Second)
	revoked := false
	for time.Now().Before(deadline) {
		raw, e = c.Call(ctx, "files.status", json.RawMessage(`{}`))
		if e == nil {
			json.Unmarshal(raw, &status)
			if status["ok"] == false {
				revoked = true
				break
			}
		}
		time.Sleep(time.Millisecond)
	}
	if !revoked {
		t.Fatal("CLI exit retained capability")
	}
	if diagnostics.Len() != 0 {
		t.Fatal("CLI wrote unexpected diagnostics")
	}
}
