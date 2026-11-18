//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func mcpFixture(t *testing.T) (*Host, string, string, string) {
	t.Helper()
	f, dir, id := filesFixture(t)
	for _, name := range []string{"roundtrip.txt", "readonly.txt", "secret.txt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("before"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	h, err := NewHost(f.cfg, "chrome-extension://"+f.cfg.ExtensionID+"/", bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	h.ready = true
	h.files = f
	if err = h.startSocket(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(h.Close)
	private := filepath.Join(filepath.Dir(dir), "mcp-private")
	if err = os.Mkdir(private, 0700); err != nil {
		t.Fatal(err)
	}
	approval := filepath.Join(private, "approval.json")
	body, _ := json.Marshal(map[string]any{"purpose": "opendesk.files-mcp.v1", "workspaceId": id, "ttlSeconds": 1800, "bodyEgressConsent": true, "files": []map[string]string{{"path": "roundtrip.txt", "access": "read-write"}, {"path": "readonly.txt", "access": "read"}}})
	if err = os.WriteFile(approval, body, 0600); err != nil {
		t.Fatal(err)
	}
	return h, dir, id, approval
}
func mcpCall(t *testing.T, c *FilesMCPClient, method string, args any) map[string]any {
	t.Helper()
	raw, _ := json.Marshal(args)
	reply, err := c.Call(context.Background(), method, raw)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if json.Unmarshal(reply, &result) != nil {
		t.Fatal("invalid reply")
	}
	return result
}
func TestFilesMCPRoundtripAndRevocation(t *testing.T) {
	_, dir, id, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, err := GrantFilesMCP(context.Background(), approval, cred)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Close()
	c, err := NewFilesMCPClient(cred)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	args := map[string]any{"workspaceId": id, "path": "roundtrip.txt"}
	read := mcpCall(t, c, "files.read", args)
	if read["ok"] != true {
		t.Fatalf("read: %v", read)
	}
	data := read["data"].(map[string]any)
	if data["content"] != "before" {
		t.Fatal("wrong content")
	}
	requestID := "11111111-1111-4111-8111-111111111111"
	write := map[string]any{"workspaceId": id, "path": "roundtrip.txt", "content": "after", "expectedSha256": data["sha256"], "requestId": requestID}
	saved := mcpCall(t, c, "files.write", write)
	if saved["ok"] != true {
		t.Fatalf("write: %v", saved)
	}
	beforeDuplicate, e := os.Stat(filepath.Join(dir, "roundtrip.txt"))
	if e != nil {
		t.Fatal(e)
	}
	duplicate := mcpCall(t, c, "files.write", write)
	if duplicate["ok"] != true {
		t.Fatal("duplicate not idempotent")
	}
	afterDuplicate, e := os.Stat(filepath.Join(dir, "roundtrip.txt"))
	if e != nil || !os.SameFile(beforeDuplicate, afterDuplicate) {
		t.Fatal("duplicate replayed publication")
	}
	readback := mcpCall(t, c, "files.read", args)
	readData := readback["data"].(map[string]any)
	if readData["content"] != "after" || readData["sha256"] != textHash("after") {
		t.Fatal("readback differs from expected bytes/hash")
	}
	write["content"] = "other"
	if mcpCall(t, c, "files.write", write)["ok"] != false {
		t.Fatal("request conflict accepted")
	}
	write["requestId"] = "22222222-2222-4222-8222-222222222222"
	if mcpCall(t, c, "files.write", write)["ok"] != false {
		t.Fatal("stale SHA accepted")
	}
	write["path"] = "readonly.txt"
	if mcpCall(t, c, "files.write", write)["ok"] != false {
		t.Fatal("readonly write accepted")
	}
	args["path"] = "secret.txt"
	if mcpCall(t, c, "files.read", args)["ok"] != false {
		t.Fatal("unapproved read accepted")
	}
	listed := mcpCall(t, c, "files.list", map[string]any{"workspaceId": id, "path": ""})
	entries := listed["data"].(map[string]any)["entries"].([]any)
	if len(entries) != 2 {
		t.Fatal("list leaked siblings")
	}
	status := mcpCall(t, c, "files.status", map[string]any{"requestId": requestID})
	if status["data"].(map[string]any)["receiptStatus"] != "KNOWN" {
		t.Fatal("missing receipt")
	}
	disk, _ := os.ReadFile(filepath.Join(dir, "roundtrip.txt"))
	if string(disk) != "after" {
		t.Fatal("disk mismatch")
	}
	if err = RevokeFilesMCP(context.Background(), lease.GrantID); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"files.status", "files.read", "files.write"} {
		a := any(args)
		if method == "files.status" {
			a = map[string]any{"requestId": requestID}
		}
		if method == "files.write" {
			a = write
		}
		if mcpCall(t, c, method, a)["ok"] != false {
			t.Fatal("revoked call accepted", method)
		}
	}
}
func TestFilesMCPLeaseExitAndABA(t *testing.T) {
	for _, mode := range []string{"exit", "ABA", "TTL"} {
		t.Run(mode, func(t *testing.T) {
			h, dir, workspaceID, approval := mcpFixture(t)
			cred := filepath.Join(filepath.Dir(approval), "credential.json")
			lease, err := GrantFilesMCP(context.Background(), approval, cred)
			if err != nil {
				t.Fatal(err)
			}
			defer lease.Close()
			c, err := NewFilesMCPClient(cred)
			if err != nil {
				t.Fatal(err)
			}
			defer c.Close()
			requestID := "33333333-3333-4333-8333-333333333333"
			if mcpCall(t, c, "files.write", map[string]any{"workspaceId": workspaceID, "path": "roundtrip.txt", "content": "after", "expectedSha256": textHash("before"), "requestId": requestID})["ok"] != true {
				t.Fatal("fixture receipt write failed")
			}
			switch mode {
			case "exit":
				lease.Close()
				select {
				case <-lease.Done():
				case <-time.After(time.Second):
					t.Fatal("lease did not exit")
				}
				time.Sleep(30 * time.Millisecond)
			case "ABA":
				if _, err = WorkspaceAdd(dir, "read-only"); err != nil {
					t.Fatal(err)
				}
				if _, err = WorkspaceAdd(dir, "read-write"); err != nil {
					t.Fatal(err)
				}
			case "TTL":
				h.files.mu.Lock()
				for _, g := range h.files.mcpGrants {
					g.expires = time.Now().Add(-time.Second)
				}
				h.files.mu.Unlock()
			}
			if mcpCall(t, c, "files.status", map[string]any{"requestId": requestID})["ok"] != false {
				t.Fatal("retired capability accepted")
			}
		})
	}
}
func TestFilesMCPCredentialPrivacyAndPurpose(t *testing.T) {
	_, _, _, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, err := GrantFilesMCP(context.Background(), approval, cred)
	if err != nil {
		t.Fatal(err)
	}
	defer lease.Close()
	for _, mode := range []os.FileMode{0644, 0400} {
		if err = os.Chmod(cred, mode); err != nil {
			t.Fatal(err)
		}
		if c, e := NewFilesMCPClient(cred); e == nil {
			c.Close()
			t.Fatal("unsafe credential accepted")
		}
	}
	os.Chmod(cred, 0600)
	raw, _ := os.ReadFile(cred)
	var fields map[string]any
	json.Unmarshal(raw, &fields)
	fields["purpose"] = "browser.rpc"
	raw, _ = json.Marshal(fields)
	os.WriteFile(cred, raw, 0600)
	if c, e := NewFilesMCPClient(cred); e == nil {
		c.Close()
		t.Fatal("wrong purpose accepted")
	}
}

func TestFilesMCPGrantRejectsUnboundedOrUnconsentedScope(t *testing.T) {
	_, dir, _, approval := mcpFixture(t)
	original, err := os.ReadFile(approval)
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"no-consent", "ttl-zero", "ttl-high", "empty", "too-many", "duplicate", "missing", "symlink", "hardlink", "readonly-workspace", "wrong-epoch", "nested-duplicate"} {
		t.Run(mode, func(t *testing.T) {
			var a map[string]any
			json.Unmarshal(original, &a)
			switch mode {
			case "no-consent":
				a["bodyEgressConsent"] = false
			case "ttl-zero":
				a["ttlSeconds"] = 0
			case "ttl-high":
				a["ttlSeconds"] = 1801
			case "empty":
				a["files"] = []any{}
			case "too-many":
				entries := []map[string]string{}
				for i := 0; i < 33; i++ {
					entries = append(entries, map[string]string{"path": fmt.Sprintf("f%d.txt", i), "access": "read"})
				}
				a["files"] = entries
			case "duplicate":
				a["files"] = []map[string]string{{"path": "roundtrip.txt", "access": "read"}, {"path": "roundtrip.txt", "access": "read-write"}}
			case "missing":
				a["files"] = []map[string]string{{"path": "missing.txt", "access": "read"}}
			case "symlink":
				if err := os.Symlink(filepath.Join(dir, "roundtrip.txt"), filepath.Join(dir, "link.txt")); err != nil {
					t.Fatal(err)
				}
				a["files"] = []map[string]string{{"path": "link.txt", "access": "read"}}
			case "hardlink":
				if err := os.Link(filepath.Join(dir, "readonly.txt"), filepath.Join(dir, "hard.txt")); err != nil {
					t.Fatal(err)
				}
				defer os.Remove(filepath.Join(dir, "hard.txt"))
				a["files"] = []map[string]string{{"path": "hard.txt", "access": "read"}}
			case "readonly-workspace":
				if _, err := WorkspaceAdd(dir, "read-only"); err != nil {
					t.Fatal(err)
				}
				defer WorkspaceAdd(dir, "read-write")
			case "wrong-epoch":
				a["leaseEpoch"] = "99999999-9999-4999-8999-999999999999"
			}
			raw, _ := json.Marshal(a)
			if mode == "nested-duplicate" {
				raw = bytes.Replace(raw, []byte(`"access":"read-write"`), []byte(`"access":"read","access":"read-write"`), 1)
			}
			if err := os.WriteFile(approval, raw, 0600); err != nil {
				t.Fatal(err)
			}
			lease, e := GrantFilesMCP(context.Background(), approval, filepath.Join(filepath.Dir(approval), mode+".json"))
			if e == nil {
				lease.Close()
				t.Fatal("unsafe grant accepted")
			}
		})
	}
}
func TestFilesMCPStrictArgumentsAndLimits(t *testing.T) {
	_, _, id, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, e := GrantFilesMCP(context.Background(), approval, cred)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	c, e := NewFilesMCPClient(cred)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	for _, raw := range []string{`{"requestId":"x","requestId":"y"}`, `{"RequestId":"11111111-1111-4111-8111-111111111111"}`, `{"requestId":null}`, `{"principal":"admin"}`, `{"requestId":"\ud800"}`} {
		if _, e = c.Call(context.Background(), "files.status", json.RawMessage(raw)); e == nil {
			t.Fatal("invalid args accepted")
		}
	}
	if _, e = c.Call(context.Background(), "run.start", json.RawMessage(`{}`)); e == nil {
		t.Fatal("general RPC accepted")
	}
	for _, content := range []string{strings.Repeat("a", 32769), strings.Repeat("\x01", 12000)} {
		raw, _ := json.Marshal(map[string]any{"workspaceId": id, "path": "roundtrip.txt", "content": content, "expectedSha256": textHash("before"), "requestId": "11111111-1111-4111-8111-111111111111"})
		if _, e = c.Call(context.Background(), "files.write", raw); e == nil {
			t.Fatal("oversized body/frame accepted")
		}
	}
	if result := mcpCall(t, c, "files.write", map[string]any{"workspaceId": id, "path": "roundtrip.txt", "content": strings.Repeat("a", 32768), "expectedSha256": textHash("before"), "requestId": "11111111-1111-4111-8111-111111111111"}); result["ok"] != true {
		t.Fatal("32KiB boundary rejected")
	}
}

func TestFilesMCPTransportUnknownNeverReconnects(t *testing.T) {
	base := "/tmp"
	if runtime.GOOS == "darwin" {
		base = "/private/tmp"
	}
	root, e := os.MkdirTemp(base, "od-mcp-unknown-")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	root, e = filepath.EvalSymlinks(root)
	if e != nil {
		t.Fatal(e)
	}
	os.Chmod(root, 0700)
	socket := filepath.Join(root, "fake.sock")
	listener, e := net.ListenUnix("unix", &net.UnixAddr{Name: socket, Net: "unix"})
	if e != nil {
		t.Fatal(e)
	}
	defer listener.Close()
	credential := filesMCPCredential{Purpose: "opendesk.files-mcp.v1", SocketPath: socket, SessionID: "11111111-1111-4111-8111-111111111111", GrantID: "22222222-2222-4222-8222-222222222222", Capability: strings.Repeat("a", 64), ExpiresAt: time.Now().Add(time.Minute).Unix()}
	cred := filepath.Join(root, "credential.json")
	raw, _ := json.Marshal(credential)
	if e = os.WriteFile(cred, raw, 0600); e != nil {
		t.Fatal(e)
	}
	serverDone := make(chan error, 1)
	go func() {
		conn, e := listener.AcceptUnix()
		if e != nil {
			serverDone <- e
			return
		}
		reader := bufio.NewReaderSize(conn, MaxBytes+2)
		_, e = ReadLine(reader)
		if e == nil {
			e = WriteLine(conn, []byte(`{"v":1,"kind":"files-mcp.authenticated"}`))
		}
		if e == nil {
			_, e = ReadLine(reader)
		}
		conn.Close()
		if e != nil {
			serverDone <- e
			return
		}
		listener.SetDeadline(time.Now().Add(100 * time.Millisecond))
		second, e := listener.AcceptUnix()
		if e == nil {
			second.Close()
			serverDone <- fmt.Errorf("client reconnected after unknown")
			return
		}
		serverDone <- nil
	}()
	c, e := NewFilesMCPClient(cred)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	raw, _ = json.Marshal(map[string]any{"workspaceId": "workspace-33333333-3333-4333-8333-333333333333", "path": "a.txt", "content": "after", "expectedSha256": textHash("before"), "requestId": "44444444-4444-4444-8444-444444444444"})
	_, e = c.Call(context.Background(), "files.write", raw)
	var call *CallError
	if !errors.As(e, &call) || call.Outcome != "OUTCOME_UNKNOWN" {
		t.Fatalf("lost unknown: %v", e)
	}
	if e = <-serverDone; e != nil {
		t.Fatal(e)
	}
}

func TestFilesMCPPrivateFilesRejectLinksAndLooseDirectory(t *testing.T) {
	_, _, _, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, e := GrantFilesMCP(context.Background(), approval, cred)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	link := filepath.Join(filepath.Dir(approval), "link.json")
	os.Symlink(cred, link)
	if c, e := NewFilesMCPClient(link); e == nil {
		c.Close()
		t.Fatal("symlink accepted")
	}
	hard := filepath.Join(filepath.Dir(approval), "hard.json")
	if e = os.Link(cred, hard); e != nil {
		t.Fatal(e)
	}
	if c, e := NewFilesMCPClient(cred); e == nil {
		c.Close()
		t.Fatal("hardlink accepted")
	}
	os.Remove(hard)
	os.Chmod(filepath.Dir(approval), 0755)
	defer os.Chmod(filepath.Dir(approval), 0700)
	if c, e := NewFilesMCPClient(cred); e == nil {
		c.Close()
		t.Fatal("loose parent accepted")
	}
}

func TestFilesMCPRevokeEndsOwnerConnection(t *testing.T) {
	_, _, _, approval := mcpFixture(t)
	lease, e := GrantFilesMCP(context.Background(), approval, filepath.Join(filepath.Dir(approval), "credential.json"))
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	if e = RevokeFilesMCP(context.Background(), lease.GrantID); e != nil {
		t.Fatal(e)
	}
	select {
	case <-lease.Done():
	case <-time.After(time.Second):
		t.Fatal("revoked CLI lease connection remained open")
	}
}

func TestFilesMCPReceiptCannotBePlantedByBrowserRequestID(t *testing.T) {
	h, _, _, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, e := GrantFilesMCP(context.Background(), approval, cred)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	c, e := NewFilesMCPClient(cred)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	id := "55555555-5555-4555-8555-555555555555"
	h.files.mu.Lock()
	h.files.receipts[lease.GrantID+":"+id] = filesReceipt{response: filesResponse{Result: map[string]any{"path": "secret.txt", "saved": true}}}
	h.files.mu.Unlock()
	result := mcpCall(t, c, "files.status", map[string]any{"requestId": id})
	if result["data"].(map[string]any)["receiptStatus"] != "UNKNOWN" {
		t.Fatal("Browser-planted receipt escaped capability scope")
	}
}
func TestFilesMCPAuthenticationCannotBecomeBrowserRPCOrControl(t *testing.T) {
	h, _, _, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, e := GrantFilesMCP(context.Background(), approval, cred)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	raw, e := os.ReadFile(cred)
	if e != nil {
		t.Fatal(e)
	}
	var credential filesMCPCredential
	json.Unmarshal(raw, &credential)
	for _, mode := range []string{"ordinary-auth", "wrong-purpose", "wrong-session", "general-method", "control-method", "ordinary-credential", "duplicate-auth"} {
		t.Run(mode, func(t *testing.T) {
			conn, e := net.DialUnix("unix", nil, &net.UnixAddr{Name: h.cfg.SocketPath, Net: "unix"})
			if e != nil {
				t.Fatal(e)
			}
			defer conn.Close()
			conn.SetDeadline(time.Now().Add(time.Second))
			reader := bufio.NewReaderSize(conn, MaxBytes+2)
			auth := filesMCPAuth{V: 1, Kind: "files-mcp.auth", Purpose: "opendesk.files-mcp.v1", SessionID: credential.SessionID, GrantID: credential.GrantID, Capability: credential.Capability}
			switch mode {
			case "ordinary-auth":
				auth.Kind = "auth"
			case "wrong-purpose":
				auth.Purpose = "browser.rpc"
			case "wrong-session":
				auth.SessionID = "99999999-9999-4999-8999-999999999999"
			case "ordinary-credential":
				auth.Capability = h.cfg.ClientCredential
			}
			raw, _ := json.Marshal(auth)
			if mode == "duplicate-auth" {
				raw = bytes.Replace(raw, []byte(`"purpose":"opendesk.files-mcp.v1"`), []byte(`"purpose":"browser.rpc","purpose":"opendesk.files-mcp.v1"`), 1)
			}
			if e = WriteLine(conn, raw); e != nil {
				t.Fatal(e)
			}
			authenticated, e := ReadLine(reader)
			if mode != "general-method" && mode != "control-method" {
				if e == nil {
					t.Fatal("wrong authentication accepted", len(authenticated))
				}
				return
			}
			if e != nil {
				t.Fatal(e)
			}
			method := "run.start"
			if mode == "control-method" {
				method = "files-mcp.grant"
			}
			raw, _ = json.Marshal(filesMCPRequest{V: 1, Kind: "files-mcp.call", Method: method, Args: json.RawMessage(`{}`)})
			if e = WriteLine(conn, raw); e != nil {
				t.Fatal(e)
			}
			reply, e := ReadLine(reader)
			if e != nil {
				t.Fatal(e)
			}
			var result map[string]any
			if json.Unmarshal(reply, &result) != nil || result["ok"] != false {
				t.Fatal("capability gained general method")
			}
		})
	}
	if supportedMethods["files.read"] || supportedMethods["files.write"] {
		t.Fatal("ordinary RPC allowlist expanded")
	}
}
func TestFilesMCPRealTTLAndExistingLease(t *testing.T) {
	for _, mode := range []string{"TTL", "existing-lease"} {
		t.Run(mode, func(t *testing.T) {
			h, dir, id, approval := mcpFixture(t)
			raw, _ := os.ReadFile(approval)
			var a map[string]any
			json.Unmarshal(raw, &a)
			epoch := ""
			if mode == "TTL" {
				a["ttlSeconds"] = 1
			} else {
				row, _, e := h.files.attachDevWorkspace(dir, "")
				if e != nil {
					t.Fatal(e)
				}
				epoch = row["leaseEpoch"].(string)
				a["leaseEpoch"] = epoch
			}
			raw, _ = json.Marshal(a)
			os.WriteFile(approval, raw, 0600)
			cred := filepath.Join(filepath.Dir(approval), "credential.json")
			lease, e := GrantFilesMCP(context.Background(), approval, cred)
			if e != nil {
				t.Fatal(e)
			}
			defer lease.Close()
			// A one-second grant can naturally expire before constructing a new client;
			// retain the existing capability reference to test server-side admission.
			if mode == "TTL" {
				select {
				case <-lease.Done():
				case <-time.After(2 * time.Second):
					t.Fatal("TTL did not end lease")
				}
				if c, e := NewFilesMCPClient(cred); e == nil {
					c.Close()
					t.Fatal("expired credential loaded")
				}
				return
			}
			c, e := NewFilesMCPClient(cred)
			if e != nil {
				t.Fatal(e)
			}
			defer c.Close()
			if mcpCall(t, c, "files.read", map[string]any{"workspaceId": id, "path": "roundtrip.txt"})["ok"] != true {
				t.Fatal("existing lease failed")
			}
			h.files.releaseDevWorkspace(id, epoch)
			if mcpCall(t, c, "files.status", map[string]any{})["ok"] != false {
				t.Fatal("released dev lease still authorized")
			}
		})
	}
}

// Internal receipt seam: a publication already confirmed by nativeFiles must
// remain CONFIRMED when a later readback/transport step reports uncertainty.
func TestFilesMCPReceiptPreservesConfirmedPublicationOnLaterFailure(t *testing.T) {
	h, _, id, approval := mcpFixture(t)
	cred := filepath.Join(filepath.Dir(approval), "credential.json")
	lease, e := GrantFilesMCP(context.Background(), approval, cred)
	if e != nil {
		t.Fatal(e)
	}
	defer lease.Close()
	c, e := NewFilesMCPClient(cred)
	if e != nil {
		t.Fatal(e)
	}
	defer c.Close()
	requestID := "11111111-1111-4111-8111-111111111111"
	result := mcpCall(t, c, "files.write", map[string]any{"workspaceId": id, "path": "roundtrip.txt", "content": "after", "expectedSha256": textHash("before"), "requestId": requestID})
	if result["ok"] != true {
		t.Fatal("fixture write failed")
	}
	h.files.mu.Lock()
	for key, receipt := range h.files.receipts {
		receipt.response.Result = nil
		receipt.response.Error = &filesError{Code: "E_EFFECT_UNKNOWN", Message: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}
		h.files.receipts[key] = receipt
	}
	h.files.mu.Unlock()
	status := mcpCall(t, c, "files.status", map[string]any{"requestId": requestID})
	receipt := status["data"].(map[string]any)["receipt"].(map[string]any)
	stages := receipt["stages"].(map[string]any)
	if stages["requestAccepted"] != "ACCEPTED" || stages["fileWritten"] != "CONFIRMED" || stages["readBackVerified"] != false {
		t.Fatalf("confirmed publication facts lost: %v", stages)
	}
}

func TestFilesMCPGrantQuotaReclaimsRetiredCapabilities(t *testing.T) {
	_, _, _, approval := mcpFixture(t)
	var old *FilesMCPClient
	for i := 0; i < 35; i++ {
		cred := filepath.Join(filepath.Dir(approval), fmt.Sprintf("credential-%d.json", i))
		lease, e := GrantFilesMCP(context.Background(), approval, cred)
		if e != nil {
			t.Fatalf("grant cycle %d failed: %v", i, e)
		}
		if i == 0 {
			old, e = NewFilesMCPClient(cred)
			if e != nil {
				t.Fatal(e)
			}
			defer old.Close()
		}
		if e = RevokeFilesMCP(context.Background(), lease.GrantID); e != nil {
			t.Fatal(e)
		}
		lease.Close()
	}
	raw, e := old.Call(context.Background(), "files.status", json.RawMessage(`{}`))
	if e == nil {
		var result map[string]any
		json.Unmarshal(raw, &result)
		if result["ok"] != false {
			t.Fatal("reclaimed old capability revived")
		}
	}
}

func TestFilesMCPGrantQuotaReclaimsExpiredOwnerAndFence(t *testing.T) {
	h, _, _, approval := mcpFixture(t)
	previousID := ""
	for i := 0; i < 35; i++ {
		cred := filepath.Join(filepath.Dir(approval), fmt.Sprintf("expired-%d.json", i))
		lease, e := GrantFilesMCP(context.Background(), approval, cred)
		if e != nil {
			t.Fatalf("expiry cycle %d: %v", i, e)
		}
		h.files.mu.Lock()
		if previousID != "" && h.files.mcpGrants[previousID] != nil {
			h.files.mu.Unlock()
			t.Fatal("expired capability retained")
		}
		h.files.mcpGrants[lease.GrantID].expires = time.Now().Add(-time.Second)
		h.files.mu.Unlock()
		previousID = lease.GrantID
		// Expire the next admission without closing/revoking the old owner. The
		// grant transaction must close and retire that owner's binding itself.
		t.Cleanup(func() { lease.Close() })
	}
}

func TestFilesMCPExpiredPrunedGrantCannotRegisterOwner(t *testing.T) {
	h, _, _, approvalFile := mcpFixture(t)
	raw, e := os.ReadFile(approvalFile)
	if e != nil {
		t.Fatal(e)
	}
	var approval filesMCPApproval
	if e = filesMCPDecode(raw, &approval); e != nil {
		t.Fatal(e)
	}
	// Deterministically pause between granting and registering the owner. A
	// second grant expires/prunes the first before the old handler resumes.
	first, e := h.files.mcpGrant(approval)
	if e != nil {
		t.Fatal(e)
	}
	h.files.mu.Lock()
	h.files.mcpGrants[first.GrantID].expires = time.Now().Add(-time.Second)
	h.files.mu.Unlock()
	second, e := h.files.mcpGrant(approval)
	if e != nil {
		t.Fatal(e)
	}
	defer h.files.mcpRevoke(second.GrantID)
	staleOwner, peer := net.Pipe()
	defer staleOwner.Close()
	defer peer.Close()
	if h.files.mcpRegisterOwner(first.GrantID, staleOwner) {
		t.Fatal("pruned grant registered a late owner")
	}
	liveOwner, livePeer := net.Pipe()
	defer liveOwner.Close()
	defer livePeer.Close()
	if !h.files.mcpRegisterOwner(second.GrantID, liveOwner) {
		t.Fatal("live grant failed registration")
	}
	h.files.mcpRevoke(first.GrantID)
	if result := h.files.mcpCall(second.GrantID, "files.status", json.RawMessage(`{}`)); result["ok"] != true {
		t.Fatal("late old cleanup retired replacement grant")
	}
	h.files.mu.Lock()
	h.files.mcpGrants[second.GrantID].expires = time.Now().Add(-time.Second)
	h.files.mu.Unlock()
	if h.files.mcpRegisterOwner(second.GrantID, liveOwner) {
		t.Fatal("expired unpruned grant registered owner")
	}
}
