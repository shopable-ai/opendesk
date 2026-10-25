package mcpserver

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

const proofNonce = "0123456789abcdef0123456789abcdef"

func proofDir(t *testing.T) string {
	t.Helper()
	repo, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	base := filepath.Join(repo, ".runtime", "tests", "mcp-chatgpt-web", "adapter-development")
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(base, "adapter-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	return dir
}
func proofServer(t *testing.T, dir string) *Server {
	t.Helper()
	s, err := NewWebFileTestServer(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s
}
func proofFailed(r Response) bool {
	return r.Error != nil || strings.Contains(string(r.Result), `"isError":true`)
}
func proofWrite(t *testing.T, s *Server) {
	t.Helper()
	if r := policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": proofNonce}); proofFailed(r) {
		t.Fatalf("write failed: %+v %s", r, r.Result)
	}
}

func TestWebFileSurfaceAndRoundtrip(t *testing.T) {
	dir := proofDir(t)
	s := proofServer(t, dir)
	r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/list"})
	var result struct {
		Tools []Tool `json:"tools"`
	}
	if err := json.Unmarshal(r.Result, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Tools) != 3 {
		t.Fatalf("surface: %s", r.Result)
	}
	for i, name := range []string{"tm_status", "tm_test_write_nonce", "tm_test_read_nonce"} {
		if result.Tools[i].Name != name {
			t.Fatal("unexpected tool")
		}
	}
	if proofFailed(policyCall(t, s, "tm_status", map[string]any{})) {
		t.Fatal("status failed")
	}
	if !proofFailed(policyCall(t, s, "tm_test_read_nonce", map[string]any{})) {
		t.Fatal("read before write")
	}
	// Test every full-mode tool against discovery, dispatch and direct core seams.
	for name := range NewServer(nil).tools {
		if name == "tm_status" {
			continue
		}
		if !proofFailed(policyCall(t, s, name, map[string]any{})) {
			t.Fatalf("exposed %s", name)
		}
		if _, err := s.callTool(name, map[string]any{}); err == nil {
			t.Fatalf("direct allowed %s", name)
		}
		if _, err := s.callToolCore(name, map[string]any{}); err == nil {
			t.Fatalf("core allowed %s", name)
		}
	}
	proofWrite(t, s)
	read := policyCall(t, s, "tm_test_read_nonce", map[string]any{})
	if proofFailed(read) || !strings.Contains(string(read.Result), proofNonce) {
		t.Fatalf("roundtrip: %s", read.Result)
	}
	data, err := os.ReadFile(filepath.Join(dir, webProofName))
	if err != nil || string(data) != proofNonce+"\n" {
		t.Fatal("incorrect host content")
	}
	info, err := os.Stat(filepath.Join(dir, webProofName))
	if err != nil || info.Mode().Perm() != 0600 {
		t.Fatal("permissions")
	}
	if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": strings.Repeat("a", 32)})) {
		t.Fatal("repeat allowed")
	}
	again, _ := os.ReadFile(filepath.Join(dir, webProofName))
	if string(again) != string(data) {
		t.Fatal("repeat changed file")
	}
	other := proofServer(t, dir)
	if !proofFailed(policyCall(t, other, "tm_test_read_nonce", map[string]any{})) {
		t.Fatal("cross-instance read")
	}
	if !proofFailed(policyCall(t, other, "tm_test_write_nonce", map[string]any{"nonce": proofNonce})) {
		t.Fatal("existing overwrite")
	}
	for _, mode := range []*Server{NewServer(nil), NewServerWithOptions(nil, ServerOptions{ReadOnly: true})} {
		for _, name := range []string{"tm_test_write_nonce", "tm_test_read_nonce"} {
			if _, ok := mode.tools[name]; ok {
				t.Fatal("test tools leaked into normal mode")
			}
			if !proofFailed(policyCall(t, mode, name, map[string]any{"nonce": proofNonce})) {
				t.Fatal("normal mode test dispatch")
			}
		}
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	if !proofFailed(policyCall(t, s, "tm_status", map[string]any{})) {
		t.Fatal("closed used")
	}
	if _, err := s.webFileTest.file.Stat(); err == nil {
		t.Fatal("file handle remained open")
	}
	if _, err := s.webFileTest.root.Stat("."); err == nil {
		t.Fatal("root handle remained open")
	}
}

func TestWebFileRejectArgumentsAndNotifications(t *testing.T) {
	dir := proofDir(t)
	s := proofServer(t, dir)
	for _, nonce := range []any{"", strings.Repeat("a", 31), strings.Repeat("a", 33), strings.Repeat("A", 32), strings.Repeat("g", 32), "../" + strings.Repeat("a", 29), nil, 32} {
		if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": nonce})) {
			t.Fatalf("accepted nonce %v", nonce)
		}
	}
	for _, key := range []string{"path", "filename", "root", "runid", "content", "shell", "recordingSessionId"} {
		for _, name := range []string{"tm_status", "tm_test_read_nonce", "tm_test_write_nonce"} {
			args := map[string]any{key: "blocked"}
			if name == "tm_test_write_nonce" {
				args["nonce"] = proofNonce
			}
			if !proofFailed(policyCall(t, s, name, args)) {
				t.Fatal("unknown argument accepted")
			}
		}
	}
	for _, raw := range []string{
		`{"name":"tm_test_write_nonce","arguments":{"nonce":"` + proofNonce + `"},"path":"x"}`,
		`{"name":"tm_test_write_nonce","arguments":{"nonce":"bad","nonce":"` + proofNonce + `"}}`,
		`{"name":"tm_status","arguments":null}`, `{"name":"tm_status","_meta":null}`,
		`{"name":"tm_status","name":"tm_status","arguments":{}}`,
	} {
		r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: json.RawMessage(raw)})
		if !proofFailed(r) {
			t.Fatal("bad wrapper accepted")
		}
	}
	params := json.RawMessage(`{"name":"tm_test_write_nonce","arguments":{"nonce":"` + proofNonce + `"}}`)
	s.Handle(Request{JSONRPC: "2.0", Method: "tools/call", Params: params})
	if !proofFailed(s.handleToolsCall(Request{JSONRPC: "2.0", Method: "tools/call", Params: params})) {
		t.Fatal("direct no-ID dispatch accepted")
	}
	for _, id := range []string{`null`, `true`, `1.5`} {
		if !proofFailed(s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(id), Method: "tools/call", Params: params})) {
			t.Fatal("bad id accepted")
		}
	}
	if _, err := os.Lstat(filepath.Join(dir, webProofName)); !os.IsNotExist(err) {
		t.Fatal("invalid call created file")
	}
	proofWrite(t, s)
}

func TestWebFileReplacementAndLinks(t *testing.T) {
	for _, kind := range []string{"symlink-existing", "hardlink-existing", "symlink-replace", "hardlink-replace", "directory-file", "directory-root", "symlink-root", "changed-content", "nonutf8"} {
		t.Run(kind, func(t *testing.T) {
			dir := proofDir(t)
			s := proofServer(t, dir)
			path := filepath.Join(dir, webProofName)
			secret := filepath.Join(dir, "private")
			if err := os.WriteFile(secret, []byte("PRIVATE-CONTENT"), 0600); err != nil {
				t.Fatal(err)
			}
			existing := strings.HasSuffix(kind, "existing")
			if !existing {
				proofWrite(t, s)
			}
			switch kind {
			case "symlink-existing":
				if err := os.Symlink(secret, path); err != nil {
					t.Fatal(err)
				}
			case "hardlink-existing":
				if err := os.Link(secret, path); err != nil {
					t.Fatal(err)
				}
			case "symlink-replace", "hardlink-replace", "directory-file":
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				var err error
				if kind == "symlink-replace" {
					err = os.Symlink(secret, path)
				} else if kind == "hardlink-replace" {
					err = os.Link(secret, path)
				} else {
					err = os.Mkdir(path, 0700)
				}
				if err != nil {
					t.Fatal(err)
				}
			case "directory-root", "symlink-root":
				moved := dir + "-moved"
				if err := os.Rename(dir, moved); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { os.RemoveAll(moved) })
				var err error
				if kind == "symlink-root" {
					err = os.Symlink(moved, dir)
				} else {
					err = os.Mkdir(dir, 0700)
				}
				if err != nil {
					t.Fatal(err)
				}
			case "changed-content", "nonutf8":
				data := []byte("PRIVATE-CONTENT")
				if kind == "nonutf8" {
					data = []byte{0xff, 0xfe}
				}
				if err := os.WriteFile(path, data, 0600); err != nil {
					t.Fatal(err)
				}
			}
			r := policyCall(t, s, "tm_test_read_nonce", map[string]any{})
			if !proofFailed(r) || strings.Contains(string(r.Result), "PRIVATE-CONTENT") {
				t.Fatalf("unsafe read: %s", r.Result)
			}
			if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": proofNonce})) {
				t.Fatal("unsafe write")
			}
			if existing {
				data, _ := os.ReadFile(secret)
				if string(data) != "PRIVATE-CONTENT" {
					t.Fatal("existing changed")
				}
			}
		})
	}
}

func TestWebFileDirectoryAuthorization(t *testing.T) {
	dir := proofDir(t)
	link := dir + "-link"
	if err := os.Symlink(dir, link); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Remove(link) })
	for _, bad := range []string{"", ".", dir + "/../" + filepath.Base(dir), dir + "/", link, filepath.Join(link, "child"), filepath.Dir(filepath.Dir(dir)), t.TempDir(), dir + "-missing"} {
		if s, err := NewWebFileTestServer(bad); err == nil {
			s.Close()
			t.Fatalf("bad dir authorized: %s", bad)
		}
	}
	// Parent path components must also remain bound to their original identity.
	nested := filepath.Join(dir, "nested")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	s := proofServer(t, nested)
	moved := dir + "-moved"
	if err := os.Rename(dir, moved); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(moved) })
	if err := os.Symlink(moved, dir); err != nil {
		t.Fatal(err)
	}
	if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": proofNonce})) {
		t.Fatal("replaced ancestor authorized")
	}
	if _, err := os.Stat(filepath.Join(moved, "nested", webProofName)); !os.IsNotExist(err) {
		t.Fatal("ancestor replacement wrote")
	}
}

func TestWebFileConcurrentCreateOnce(t *testing.T) {
	dir := proofDir(t)
	s := proofServer(t, dir)
	var wins atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.callTool("tm_test_write_nonce", map[string]any{"nonce": proofNonce}); err == nil {
				wins.Add(1)
			}
		}()
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("writes: %d", wins.Load())
	}
	if proofFailed(policyCall(t, s, "tm_test_read_nonce", map[string]any{})) {
		t.Fatal("concurrent result unreadable")
	}
}

func TestWebFileConcurrentInstancesCreateOnce(t *testing.T) {
	dir := proofDir(t)
	first, second := proofServer(t, dir), proofServer(t, dir)
	var wins atomic.Int32
	var wg sync.WaitGroup
	for _, server := range []*Server{first, second} {
		wg.Add(1)
		go func(s *Server) {
			defer wg.Done()
			if _, err := s.callTool("tm_test_write_nonce", map[string]any{"nonce": proofNonce}); err == nil {
				wins.Add(1)
			}
		}(server)
	}
	wg.Wait()
	if wins.Load() != 1 {
		t.Fatalf("instance writes: %d", wins.Load())
	}
	readers := 0
	for _, server := range []*Server{first, second} {
		if !proofFailed(policyCall(t, server, "tm_test_read_nonce", map[string]any{})) {
			readers++
		}
	}
	if readers != 1 {
		t.Fatalf("instance readers: %d", readers)
	}
}

func TestWebFileRootReplacementBeforeCreate(t *testing.T) {
	dir := proofDir(t)
	s := proofServer(t, dir)
	moved := dir + "-moved"
	if err := os.Rename(dir, moved); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(moved) })
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": proofNonce})) {
		t.Fatal("replacement accepted")
	}
	for _, root := range []string{dir, moved} {
		if _, err := os.Stat(filepath.Join(root, webProofName)); !os.IsNotExist(err) {
			t.Fatal("replacement caused write")
		}
	}
}

func TestWebFileMCPMetadataAndOptionalArguments(t *testing.T) {
	s := proofServer(t, proofDir(t))
	for _, raw := range []string{
		`{"name":"tm_status"}`,
		`{"name":"tm_status","_meta":{"progressToken":"p","client/extension":{"path":"ignored"}}}`,
		`{"name":"tm_status","arguments":{},"_meta":{}}`,
	} {
		r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: json.RawMessage(raw)})
		if proofFailed(r) {
			t.Fatalf("legal MCP wrapper rejected: %s", r.Result)
		}
	}
	missing := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: json.RawMessage(`{"name":"tm_test_write_nonce","_meta":{"nonce":"` + proofNonce + `"}}`)})
	if !proofFailed(missing) {
		t.Fatal("metadata became tool arguments")
	}
	raw := `{"name":"tm_test_write_nonce","arguments":{"nonce":"` + proofNonce + `"},"_meta":{"progressToken":7,"client/path":"ignored"}}`
	r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: json.RawMessage(raw)})
	if proofFailed(r) {
		t.Fatalf("write with metadata rejected: %s", r.Result)
	}
	if proofFailed(policyCall(t, s, "tm_test_read_nonce", map[string]any{})) {
		t.Fatal("metadata roundtrip failed")
	}
}

func TestWebFileServeStreamRejectsDuplicateEnvelope(t *testing.T) {
	write := `{"name":"tm_test_write_nonce","arguments":{"nonce":"` + proofNonce + `"}}`
	for _, tc := range []struct{ name, fields string }{
		{"method", `"method":"ping","method":"tools/call","params":` + write + `,"id":1`},
		{"params", `"method":"tools/call","params":{"name":"tm_status"},"params":` + write + `,"id":1`},
		{"id", `"method":"tools/call","params":` + write + `,"id":null,"id":1`},
		{"same-id", `"method":"tools/call","params":` + write + `,"id":1,"id":1`},
		{"jsonrpc", `"jsonrpc":"1.0","method":"tools/call","params":` + write + `,"id":1`},
		{"escaped-method", `"metho\u0064":"ping","method":"tools/call","params":` + write + `,"id":1`},
		{"case-params", `"method":"tools/call","PARAMS":{"name":"tm_status"},"params":` + write + `,"id":1`},
		{"unicode-params", `"method":"tools/call","param\u017f":{"name":"tm_status"},"params":` + write + `,"id":1`},
		{"case-id", `"method":"tools/call","params":` + write + `,"ID":null,"id":1`},
		{"notification", `"method":"ping","method":"tools/call","params":` + write},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := proofDir(t)
			s := proofServer(t, dir)
			input := `{"jsonrpc":"2.0",` + tc.fields + "}\n" + `{"jsonrpc":"2.0","method":"ping","id":2}` + "\n"
			var output bytes.Buffer
			if err := s.ServeStream(strings.NewReader(input), &output); err != nil {
				t.Fatal(err)
			}
			d := json.NewDecoder(&output)
			var rejected, ping Response
			if err := d.Decode(&rejected); err != nil {
				t.Fatal(err)
			}
			if rejected.Error == nil || rejected.Error.Code != ErrCodeInvalidRequest || string(rejected.ID) != "null" {
				t.Fatalf("duplicate envelope accepted: %+v", rejected)
			}
			if err := d.Decode(&ping); err != nil || ping.Error != nil || string(ping.ID) != "2" {
				t.Fatalf("stream did not continue: %+v, %v", ping, err)
			}
			if s.webFileTest.file != nil || s.webFileTest.expected != "" {
				t.Fatal("rejected envelope dispatched creation")
			}
			if _, err := os.Lstat(filepath.Join(dir, webProofName)); !os.IsNotExist(err) {
				t.Fatal("rejected envelope mutated proof path")
			}
			// A rejected envelope must not consume the one permitted creation.
			output.Reset()
			if err := s.ServeStream(strings.NewReader(`{"jsonrpc":"2.0","method":"tools/call","id":3,"params":`+write+"}\n"), &output); err != nil {
				t.Fatal(err)
			}
			var created Response
			if err := json.Unmarshal(output.Bytes(), &created); err != nil || proofFailed(created) {
				t.Fatalf("valid stream creation failed: %s, %v", output.String(), err)
			}
			data, err := os.ReadFile(filepath.Join(dir, webProofName))
			if err != nil || string(data) != proofNonce+"\n" {
				t.Fatal("valid stream did not create expected content")
			}
		})
	}
}

func TestWebFileEnvelopeLeavesOtherModesUnchanged(t *testing.T) {
	for _, s := range []*Server{NewServer(nil), NewServerWithOptions(nil, ServerOptions{ReadOnly: true})} {
		var output bytes.Buffer
		input := `{"jsonrpc":"1.0","jsonrpc":"2.0","id":null,"id":7,"method":"unknown","method":"ping","params":null,"params":{}}` + "\n"
		if err := s.ServeStream(strings.NewReader(input), &output); err != nil {
			t.Fatal(err)
		}
		var r Response
		if err := json.Unmarshal(output.Bytes(), &r); err != nil || r.Error != nil || string(r.ID) != "7" || string(r.Result) != "{}" {
			t.Fatalf("other mode envelope behavior changed: %s, %v", output.String(), err)
		}
	}
}

func TestWebFileFinalizeWriteValidatesHeldContent(t *testing.T) {
	for _, kind := range []string{"unchanged", "same-length", "truncated", "appended", "nonutf8", "replaced"} {
		t.Run(kind, func(t *testing.T) {
			dir := proofDir(t)
			s := proofServer(t, dir)
			w := s.webFileTest
			content := proofNonce + "\n"
			path := filepath.Join(dir, webProofName)
			// Prepare exactly the held FD/identity state at the post-Sync seam.
			// No callback or global hook is needed to tamper before finalization.
			f, err := w.root.OpenFile(webProofName, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
			if err != nil {
				t.Fatal(err)
			}
			w.file = f
			w.identity, err = f.Stat()
			if err != nil {
				t.Fatal(err)
			}
			if n, err := f.Write([]byte(content)); err != nil || n != len(content) {
				t.Fatalf("prepare write: %d, %v", n, err)
			}
			if err := f.Sync(); err != nil {
				t.Fatal(err)
			}
			tampered := content
			switch kind {
			case "same-length":
				tampered = strings.Repeat("x", len(content))
			case "truncated":
				tampered = content[:len(content)-1]
			case "appended":
				tampered = content + "PRIVATE-CONTENT"
			case "nonutf8":
				tampered = string([]byte{0xff, 0xfe})
			case "replaced":
				if err := os.Rename(path, filepath.Join(dir, "original")); err != nil {
					t.Fatal(err)
				}
			}
			if kind != "unchanged" {
				if err := os.WriteFile(path, []byte(tampered), 0600); err != nil {
					t.Fatal(err)
				}
			}
			w.mu.Lock()
			result, err := w.finalizeWrite(content)
			w.mu.Unlock()
			if kind == "unchanged" {
				if err != nil || result["ok"] != true || w.expected != content {
					t.Fatalf("valid finalization: %+v, %v", result, err)
				}
				if proofFailed(policyCall(t, s, "tm_test_read_nonce", map[string]any{})) {
					t.Fatal("valid finalization did not authorize reading")
				}
				return
			}
			if err == nil || result != nil || w.expected != "" {
				t.Fatalf("tampered creation authorized: %+v, %v", result, err)
			}
			if err.Error() != "proof content changed" && err.Error() != "proof file identity changed" {
				t.Fatalf("unexpected error or content disclosure: %v", err)
			}
			if !proofFailed(policyCall(t, s, "tm_test_read_nonce", map[string]any{})) {
				t.Fatal("failed creation authorized reading")
			}
			if !proofFailed(policyCall(t, s, "tm_test_write_nonce", map[string]any{"nonce": proofNonce})) {
				t.Fatal("failed creation allowed retry")
			}
			if w.file != f {
				t.Fatal("failed creation did not retain original handle")
			}
			if _, err := f.Stat(); err != nil {
				t.Fatal("failed creation closed original handle")
			}
			data, err := os.ReadFile(path)
			if err != nil || string(data) != tampered {
				t.Fatal("failure unlinked or modified proof path")
			}
		})
	}
}

// Optional host-provided root check opens and closes handles only. It never
// writes a nonce or alters the dedicated cloud acceptance fixture.
func TestWebFileConfiguredHostRoot(t *testing.T) {
	dir := os.Getenv("OPENDESK_MCP_TEST_HOST_ROOT")
	if dir == "" {
		t.Skip("no host fixture requested")
	}
	s := proofServer(t, dir)
	if proofFailed(policyCall(t, s, "tm_status", map[string]any{})) {
		t.Fatal("host root status failed")
	}
}
