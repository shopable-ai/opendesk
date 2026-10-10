//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func filesFixture(t *testing.T) (*nativeFiles, string, string) {
	t.Helper()
	home, _ := projectFixture(t)
	directory := filepath.Join(home, "workspace")
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	grant, err := WorkspaceAdd(directory, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	manager, err := newNativeFiles(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(manager.Close)
	return manager, directory, grant["workspaceId"].(string)
}

func filesTestRequest(t *testing.T, manager *nativeFiles, method string, params map[string]any) filesRequest {
	t.Helper()
	id, err := NewID()
	if err != nil {
		t.Fatal(err)
	}
	raw := MustEncode(map[string]any{"v": 1, "kind": "files.request", "protocol": FilesProtocol,
		"requestId": id, "sessionId": manager.sessionID, "method": method, "params": params})
	req, err := decodeFilesRequest(raw)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func callFiles(t *testing.T, manager *nativeFiles, method string, params map[string]any) filesResponse {
	t.Helper()
	return manager.Handle(filesTestRequest(t, manager, method, params))
}

func requireFilesResult(t *testing.T, response filesResponse) map[string]any {
	t.Helper()
	if response.Error != nil {
		t.Fatalf("unexpected file error: %+v", response.Error)
	}
	result, ok := response.Result.(map[string]any)
	if !ok {
		t.Fatalf("unexpected result type %T", response.Result)
	}
	return result
}

func requireFilesCode(t *testing.T, response filesResponse, code string) {
	t.Helper()
	if response.Error == nil || response.Error.Code != code {
		t.Fatalf("want %s, got %+v", code, response)
	}
}

func textHash(text string) string {
	hash := sha256.Sum256([]byte(text))
	return hex.EncodeToString(hash[:])
}

func TestNativeFilesActualReadWriteCreateAndPrivateListing(t *testing.T) {
	manager, directory, id := filesFixture(t)
	file := filepath.Join(directory, "README.md")
	if err := os.WriteFile(file, []byte("# 原文\n"), 0640); err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(file)
	read := requireFilesResult(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "README.md"}))
	if read["content"] != "# 原文\n" || read["sha256"] != textHash("# 原文\n") {
		t.Fatalf("incorrect disk snapshot %v", read)
	}
	written := requireFilesResult(t, callFiles(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "README.md", "content": "# 已保存\n", "expectedSha256": read["sha256"]}))
	actual, _ := os.ReadFile(file)
	after, _ := os.Stat(file)
	if string(actual) != "# 已保存\n" || written["sha256"] != textHash(string(actual)) ||
		written["saved"] != true || os.SameFile(before, after) || after.Mode().Perm() != 0640 {
		t.Fatalf("save did not atomically publish exact bytes and mode: %v", written)
	}
	created := requireFilesResult(t, callFiles(t, manager, "files.create", map[string]any{
		"workspaceId": id, "path": "preview.html", "content": "<h1>本机预览</h1>"}))
	actual, _ = os.ReadFile(filepath.Join(directory, "preview.html"))
	if created["created"] != true || created["sha256"] != textHash(string(actual)) {
		t.Fatal("create receipt was not verified against disk")
	}
	requireFilesCode(t, callFiles(t, manager, "files.create", map[string]any{
		"workspaceId": id, "path": "preview.html", "content": "replacement"}), "E_FILES_EXISTS")
	unchanged, _ := os.ReadFile(filepath.Join(directory, "preview.html"))
	if !bytes.Equal(actual, unchanged) {
		t.Fatal("exclusive create overwrote an existing file")
	}
	listed := requireFilesResult(t, callFiles(t, manager, "files.list", map[string]any{"workspaceId": id, "path": ""}))
	if len(listed["entries"].([]map[string]any)) != 2 {
		t.Fatalf("temporary files leaked into listing: %v", listed)
	}
	grants := requireFilesResult(t, callFiles(t, manager, "workspaces.list", map[string]any{}))
	encoded, _ := json.Marshal([]any{read, written, listed, grants})
	if bytes.Contains(encoded, []byte(directory)) || bytes.Contains(encoded, []byte(manager.cfg.ClientCredential)) {
		t.Fatal("absolute workspace path or Native credential leaked to Browser")
	}
}

func TestNativeFilesConflictAndKnownRequestReceiptNeverReplay(t *testing.T) {
	manager, directory, id := filesFixture(t)
	file := filepath.Join(directory, "draft.md")
	if err := os.WriteFile(file, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	stale := textHash("original")
	if err := os.WriteFile(file, []byte("external edit"), 0600); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "draft.md", "content": "stale proposal", "expectedSha256": stale}), "E_FILES_CONFLICT")
	actual, _ := os.ReadFile(file)
	if string(actual) != "external edit" {
		t.Fatal("stale proposal overwrote external changes")
	}
	req := filesTestRequest(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "draft.md", "content": "accepted proposal", "expectedSha256": textHash("external edit")})
	first := requireFilesResult(t, manager.Handle(req))
	if err := os.WriteFile(file, []byte("newer external edit"), 0600); err != nil {
		t.Fatal(err)
	}
	second := requireFilesResult(t, manager.Handle(req))
	if first["sha256"] != second["sha256"] {
		t.Fatal("known mutation receipt changed")
	}
	actual, _ = os.ReadFile(file)
	if string(actual) != "newer external edit" {
		t.Fatal("receipt lookup replayed a write")
	}
	changed := req
	changed.Params = json.RawMessage(strings.Replace(string(req.Params), "accepted proposal", "different proposal", 1))
	requireFilesCode(t, manager.Handle(changed), "E_REQUEST_CONFLICT")
}

func TestNativeFilesContainmentSymlinksHardlinksAndHiddenPaths(t *testing.T) {
	manager, directory, id := filesFixture(t)
	outside := filepath.Join(filepath.Dir(directory), "private.md")
	if err := os.WriteFile(outside, []byte("PRIVATE"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{".git", ".secrets", "node_modules", "notes"} {
		if err := os.Mkdir(filepath.Join(directory, name), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, name, "data.md"), []byte("nested"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(outside, filepath.Join(directory, "linked.md")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(".secrets", filepath.Join(directory, "alias")); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(outside, filepath.Join(directory, "hard.md")); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{"../private.md", outside, ".git/data.md", ".secrets/data.md", "node_modules/data.md", "notes/../private.md", "notes\\data.md"} {
		requireFilesCode(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": p}), "E_FILES_PATH")
	}
	for _, p := range []string{"linked.md", "hard.md", "alias/data.md"} {
		requireFilesCode(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": p}), "E_FILES_ACCESS")
	}
	requireFilesCode(t, callFiles(t, manager, "files.create", map[string]any{
		"workspaceId": id, "path": "alias/new.md", "content": "bad"}), "E_FILES_ACCESS")
	if _, err := os.Stat(filepath.Join(directory, ".secrets", "new.md")); !os.IsNotExist(err) {
		t.Fatal("create followed a directory symlink")
	}
	read := requireFilesResult(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "notes/data.md"}))
	if read["content"] != "nested" {
		t.Fatal("safe nested text could not be read")
	}
	listed := requireFilesResult(t, callFiles(t, manager, "files.list", map[string]any{"workspaceId": id, "path": ""}))
	rows := listed["entries"].([]map[string]any)
	if len(rows) != 1 || rows[0]["path"] != "notes" {
		t.Fatalf("unsafe entries were advertised: %v", rows)
	}
	linkDirectory := filepath.Join(filepath.Dir(directory), "linked-workspace")
	if err := os.Symlink(directory, linkDirectory); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceAdd(linkDirectory, "read-write"); err == nil {
		t.Fatal("symlink workspace authorized")
	}
}

func TestNativeFilesGrantRevocationReadOnlyAndDirectoryReplacement(t *testing.T) {
	manager, directory, id := filesFixture(t)
	if err := os.WriteFile(filepath.Join(directory, "data.md"), []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceAdd(directory, "read-only"); err != nil {
		t.Fatal(err)
	}
	requireFilesResult(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "data.md"}))
	requireFilesCode(t, callFiles(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "data.md", "content": "edit", "expectedSha256": textHash("data")}), "E_FILES_ACCESS")
	if _, err := WorkspaceAdd(directory, "read-write"); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceRevoke(id); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "data.md"}), "E_FILES_ACCESS")
	grant, err := WorkspaceAdd(directory, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	id = grant["workspaceId"].(string)
	if err := os.Rename(directory, directory+"-old"); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(directory, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "data.md"), []byte("different directory"), 0600); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "data.md"}), "E_FILES_ACCESS")
}

func TestNativeFilesLimitsEncodingAndEscapedFrameBudget(t *testing.T) {
	manager, directory, id := filesFixture(t)
	cases := []struct {
		name    string
		content []byte
		code    string
	}{
		{"large.md", bytes.Repeat([]byte{'x'}, FilesMaxContentBytes+1), "E_FILES_LIMIT"},
		{"utf8.md", []byte{0xff, 0xfe}, "E_FILES_ENCODING"},
		{"nul.md", []byte{'a', 0, 'b'}, "E_FILES_ENCODING"},
		{"escaped.md", bytes.Repeat([]byte{1}, 12000), "E_FILES_LIMIT"},
	}
	for _, test := range cases {
		if err := os.WriteFile(filepath.Join(directory, test.name), test.content, 0600); err != nil {
			t.Fatal(err)
		}
		response := callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": test.name})
		requireFilesCode(t, response, test.code)
		encoded, err := Encode(response)
		if err != nil || len(encoded) > MaxBytes || bytes.Contains(encoded, []byte(directory)) {
			t.Fatal("error frame exceeded limits or leaked a private path")
		}
	}
	requireFilesCode(t, callFiles(t, manager, "files.create", map[string]any{
		"workspaceId": id, "path": "script.sh", "content": "echo nope"}), "E_FILES_TYPE")
	requireFilesCode(t, callFiles(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "missing.md", "content": "x", "expectedSha256": "bad"}), "E_SCHEMA")
}

func TestNativeFilesConcurrentConnectionsHonorOneRevision(t *testing.T) {
	manager, directory, id := filesFixture(t)
	other, err := newNativeFiles(manager.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	clients := []*nativeFiles{manager, other}
	file := filepath.Join(directory, "shared.md")
	if err := os.WriteFile(file, []byte("base"), 0600); err != nil {
		t.Fatal(err)
	}
	requests := []filesRequest{}
	for i, content := range []string{"first", "second"} {
		requests = append(requests, filesTestRequest(t, clients[i], "files.write", map[string]any{
			"workspaceId": id, "path": "shared.md", "content": content, "expectedSha256": textHash("base")}))
	}
	var wait sync.WaitGroup
	responses := make([]filesResponse, 2)
	for i := range requests {
		wait.Add(1)
		go func(i int) { defer wait.Done(); responses[i] = clients[i].Handle(requests[i]) }(i)
	}
	wait.Wait()
	success, conflict := 0, 0
	for _, response := range responses {
		if response.Error == nil {
			success++
		} else if response.Error.Code == "E_FILES_CONFLICT" || response.Error.Code == "E_FILES_BUSY" {
			conflict++
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("same revision admitted more than one write: %+v", responses)
	}
	actual, _ := os.ReadFile(file)
	if string(actual) != "first" && string(actual) != "second" {
		t.Fatalf("mixed or partial contents: %q", actual)
	}
}

func TestNativeFilesSessionCloseAndCredentialRotationRevokeAuthority(t *testing.T) {
	manager, directory, id := filesFixture(t)
	req := filesTestRequest(t, manager, "files.create", map[string]any{"workspaceId": id, "path": "new.md", "content": "new"})
	wrong := req
	wrong.SessionID = "stale-session"
	requireFilesCode(t, manager.Handle(wrong), "E_FILES_SESSION")
	if _, err := os.Stat(filepath.Join(directory, "new.md")); !os.IsNotExist(err) {
		t.Fatal("stale session created a file")
	}
	cfg := manager.cfg
	cfg.ClientCredential = strings.Repeat("c", 64)
	encoded, _ := json.Marshal(cfg)
	if err := os.WriteFile(configPath(), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, manager.Handle(req), "E_FILES_ACCESS")
	manager.Close()
	requireFilesCode(t, callFiles(t, manager, "files.status", map[string]any{}), "E_FILES_SESSION")
}

func TestNativeFilesSchemaStrictAndLegacyRPCUnchanged(t *testing.T) {
	valid := `{"v":1,"kind":"files.request","protocol":"opendesk.local-files.v1","requestId":"r","sessionId":"s","method":"files.status","params":{}}`
	for _, raw := range []string{
		strings.Replace(valid, `"v":1`, `"v":1,"v":1`, 1),
		strings.Replace(valid, `"params":{}`, `"params":{"path":"a","path":"b"}`, 1),
		strings.Replace(valid, `"params":{}`, `"params":null`, 1),
		strings.Replace(valid, `"method":"files.status"`, `"method":"workspace.add"`, 1),
		strings.Replace(valid, `"kind":"files.request"`, `"kind":"request"`, 1),
		strings.Replace(valid, `"v":1`, `"v":1,"absolutePath":"/private"`, 1),
	} {
		if _, err := decodeFilesRequest([]byte(raw)); err == nil {
			t.Fatalf("invalid file envelope accepted: %s", raw)
		}
	}
	if _, err := decodeFilesRequest([]byte(valid)); err != nil {
		t.Fatal(err)
	}
	legacy, _ := Decode([]byte(strings.Replace(valid, `"kind":"files.request"`, `"kind":"request"`, 1)))
	if ValidateRequest(legacy) == nil || len(supportedMethods) != 10 {
		t.Fatal("Native local CLI gained file operations")
	}
}

func TestNativeFilesNegotiatedHostFramesAndReconnectionSession(t *testing.T) {
	manager, _, _ := filesFixture(t)
	read, write := io.Pipe()
	host, err := NewHost(manager.cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), write)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { host.Close(); _ = read.Close(); _ = write.Close() })
	req := filesTestRequest(t, host.files, "files.status", map[string]any{})
	raw, _ := json.Marshal(req)
	if host.handleChrome(raw) == nil {
		t.Fatal("file request accepted before welcome")
	}
	welcomed := make(chan error, 1)
	go func() {
		welcomed <- host.handleChrome(MustEncode(map[string]any{
			"v": 1, "kind": "welcome", "extensionId": testExtensionID, "extensionVersion": "demo", "localFilesVersion": 1}))
	}()
	state := readAIFrame(t, read)
	if err := <-welcomed; err != nil {
		t.Fatal(err)
	}
	if String(state, "kind") != "files.state" || String(state, "protocol") != FilesProtocol || String(state, "sessionId") != host.files.sessionID {
		t.Fatalf("invalid negotiated state %v", state)
	}
	if err := host.handleChrome(raw); err != nil {
		t.Fatal(err)
	}
	response := readAIFrame(t, read)
	if String(response, "kind") != "files.response" || String(response, "requestId") != req.RequestID || !Has(response, "result") {
		t.Fatalf("correlation or success lost: %v", response)
	}
	other, err := NewHost(manager.cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	if other.files.sessionID == host.files.sessionID {
		t.Fatal("reconnection reused file session")
	}
	if err := other.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": testExtensionID, "extensionVersion": "legacy"})); err != nil {
		t.Fatal(err)
	}
	if other.handleChrome(raw) == nil {
		t.Fatal("unnegotiated legacy connection gained file methods")
	}
}

func TestNativeFilesUninstallRevokesWorkspaceStore(t *testing.T) {
	manager, directory, _ := filesFixture(t)
	manager.Close()
	if _, err := Cleanup(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{workspaceStoreName, workspaceLockName} {
		if _, err := os.Stat(filepath.Join(manager.cfg.InstallRoot, name)); !os.IsNotExist(err) {
			t.Fatalf("uninstall retained %s", name)
		}
	}
	if _, err := os.Stat(directory); err != nil {
		t.Fatal("uninstall removed the user's workspace")
	}
}

func TestNativeFilesEmptyTextAndGrantLock(t *testing.T) {
	manager, directory, id := filesFixture(t)
	created := requireFilesResult(t, callFiles(t, manager, "files.create", map[string]any{
		"workspaceId": id, "path": "empty.md", "content": ""}))
	read := requireFilesResult(t, callFiles(t, manager, "files.read", map[string]any{
		"workspaceId": id, "path": "empty.md"}))
	if created["sha256"] != textHash("") || read["content"] != "" || read["bytes"] != 0 {
		t.Fatal("empty UTF-8 text was treated as missing")
	}
	release, err := lockWorkspaceStore(manager.cfg)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceRevoke(id); err == nil || err.Error() != "E_FILES_BUSY" {
		release()
		t.Fatalf("revoke bypassed the file operation lock: %v", err)
	}
	requireFilesCode(t, callFiles(t, manager, "files.write", map[string]any{
		"workspaceId": id, "path": "empty.md", "content": "locked", "expectedSha256": textHash("")}), "E_FILES_BUSY")
	release()
	actual, _ := os.ReadFile(filepath.Join(directory, "empty.md"))
	if len(actual) != 0 {
		t.Fatal("write bypassed the grant lock")
	}
	if _, err := WorkspaceRevoke(id); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, manager, "files.read", map[string]any{"workspaceId": id, "path": "empty.md"}), "E_FILES_ACCESS")
}
