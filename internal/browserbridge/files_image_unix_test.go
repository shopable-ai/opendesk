//go:build darwin || linux

package browserbridge

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

func filesImageFixture(t *testing.T, format string) []byte {
	t.Helper()
	var out bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	var err error
	if format == "png" {
		err = png.Encode(&out, img)
	} else {
		err = jpeg.Encode(&out, img, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func TestNativeFilesInspectImageMetadataAndTextBoundary(t *testing.T) {
	f, dir, id := filesFixture(t)
	if _, err := WorkspaceAdd(dir, "read-only"); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, format string }{{"image.png", "png"}, {"image.jpg", "jpeg"}, {"image.JPEG", "jpeg"}} {
		t.Run(tc.name, func(t *testing.T) {
			data := filesImageFixture(t, tc.format)
			name := filepath.Join(dir, tc.name)
			if err := os.WriteFile(name, data, 0600); err != nil {
				t.Fatal(err)
			}
			before, _ := os.Stat(name)
			receiptCount := len(f.receipts)
			got := requireFilesResult(t, callFiles(t, f, "files.inspectImage", map[string]any{"workspaceId": id, "path": tc.name, "leaseEpoch": ""}))
			if len(got) != 8 || got["workspaceId"] != id || got["path"] != tc.name || got["absolutePath"] != name || got["format"] != tc.format || got["width"] != 3 || got["height"] != 2 || got["bytes"] != len(data) || got["sha256"] != textHash(string(data)) {
				t.Fatalf("incorrect metadata: %v", got)
			}
			after, _ := os.Stat(name)
			actual, _ := os.ReadFile(name)
			if !os.SameFile(before, after) || !before.ModTime().Equal(after.ModTime()) || !bytes.Equal(data, actual) || f.writeConfirmed || len(f.receipts) != receiptCount {
				t.Fatal("inspection mutated file or mutation ledger")
			}
			requireFilesCode(t, callFiles(t, f, "files.read", map[string]any{"workspaceId": id, "path": tc.name}), "E_FILES_TYPE")
			requireFilesCode(t, callFiles(t, f, "files.create", map[string]any{"workspaceId": id, "path": tc.name, "content": "x"}), "E_FILES_ACCESS")
		})
	}
	status := requireFilesResult(t, callFiles(t, f, "files.status", map[string]any{}))
	found := false
	for _, method := range status["methods"].([]string) {
		found = found || method == "files.inspectImage"
	}
	if !found {
		t.Fatal("inspector not advertised")
	}
}

func TestNativeFilesInspectImageDecoder(t *testing.T) {
	pngData := filesImageFixture(t, "png")
	jpegData := filesImageFixture(t, "jpeg")
	// Valid header/CRC with excessive dimensions: must fail before pixel decode.
	hugePNG := append([]byte(nil), pngData...)
	binary.BigEndian.PutUint32(hugePNG[16:20], 1<<24)
	binary.BigEndian.PutUint32(hugePNG[29:33], crc32.ChecksumIEEE(hugePNG[12:29]))
	hugeJPEG := append([]byte(nil), jpegData...)
	sof := bytes.Index(hugeJPEG, []byte{0xff, 0xc0})
	if sof < 0 {
		t.Fatal("fixture has no baseline SOF")
	}
	binary.BigEndian.PutUint16(hugeJPEG[sof+5:sof+7], 65535)
	binary.BigEndian.PutUint16(hugeJPEG[sof+7:sof+9], 65535)
	corruptPNG := append([]byte(nil), pngData...)
	corruptPNG[len(corruptPNG)-1] ^= 1
	for _, tc := range []struct {
		name, format, code string
		data               []byte
	}{
		{"png", "png", "", pngData}, {"jpeg", "jpeg", "", jpegData},
		{"empty", "png", "E_FILES_TYPE", nil},
		{"html", "png", "E_FILES_TYPE", []byte("<html>download failed</html>")},
		{"svg", "png", "E_FILES_TYPE", []byte(`<svg width="3" height="2"></svg>`)},
		{"png-as-jpeg", "jpeg", "E_FILES_TYPE", pngData},
		{"jpeg-as-png", "png", "E_FILES_TYPE", jpegData},
		{"truncated-png", "png", "E_FILES_TYPE", pngData[:len(pngData)-12]},
		{"truncated-jpeg", "jpeg", "E_FILES_TYPE", jpegData[:len(jpegData)-2]},
		{"corrupt-crc", "png", "E_FILES_TYPE", corruptPNG},
		{"huge-png", "png", "E_FILES_LIMIT", hugePNG},
		{"huge-jpeg", "jpeg", "E_FILES_LIMIT", hugeJPEG},
		{"compressed-limit", "png", "E_FILES_LIMIT", make([]byte, 8*1024*1024+1)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := decodeFilesImage(tc.data, tc.format)
			if tc.code == "" {
				if err != nil || cfg.Width != 3 || cfg.Height != 2 {
					t.Fatalf("decode: %+v %v", cfg, err)
				}
			} else if err == nil || filesAsError(err).Code != tc.code {
				t.Fatalf("want %s, got %v", tc.code, err)
			}
		})
	}
	// Both truncated fixtures still have valid config, demonstrating that
	// config-only inspection would accept incomplete files.
	if _, err := png.DecodeConfig(bytes.NewReader(pngData[:len(pngData)-12])); err != nil {
		t.Fatal(err)
	}
	if _, err := jpeg.DecodeConfig(bytes.NewReader(jpegData[:len(jpegData)-2])); err != nil {
		t.Fatal(err)
	}
}

func TestNativeFilesInspectImagePathAndFileGuards(t *testing.T) {
	f, dir, id := filesFixture(t)
	data := filesImageFixture(t, "png")
	write := func(name string, content []byte, mode os.FileMode) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), content, mode); err != nil {
			t.Fatal(err)
		}
	}
	write("safe.png", data, 0600)
	if err := os.Mkdir(filepath.Join(dir, "nested"), 0700); err != nil {
		t.Fatal(err)
	}
	write("nested/safe.png", data, 0600)
	if err := os.Symlink("safe.png", filepath.Join(dir, "linked.png")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("nested", filepath.Join(dir, "alias")); err != nil {
		t.Fatal(err)
	}
	write("original.png", data, 0600)
	if err := os.Link(filepath.Join(dir, "original.png"), filepath.Join(dir, "hard.png")); err != nil {
		t.Fatal(err)
	}
	write("loose.png", data, 0600)
	if err := os.Chmod(filepath.Join(dir, "loose.png"), 0666); err != nil {
		t.Fatal(err)
	}
	if err := syscall.Mkfifo(filepath.Join(dir, "fifo.png"), 0600); err != nil {
		t.Fatal(err)
	}
	write("oversize.png", nil, 0600)
	if err := os.Truncate(filepath.Join(dir, "oversize.png"), 8*1024*1024+1); err != nil {
		t.Fatal(err)
	}
	write("fake.png", []byte("<html>not an image</html>"), 0600)
	write("mismatch.jpg", data, 0600)
	for _, tc := range []struct{ path, code string }{
		{"", "E_FILES_PATH"}, {"../outside.png", "E_FILES_PATH"}, {filepath.Join(dir, "safe.png"), "E_FILES_PATH"},
		{"nested/../safe.png", "E_FILES_PATH"}, {"nested\\safe.png", "E_FILES_PATH"},
		{".hidden/image.png", "E_FILES_PATH"}, {"node_modules/image.png", "E_FILES_PATH"},
		{"linked.png", "E_FILES_ACCESS"}, {"alias/safe.png", "E_FILES_ACCESS"}, {"hard.png", "E_FILES_ACCESS"},
		{"fifo.png", "E_FILES_ACCESS"}, {"loose.png", "E_FILES_ACCESS"},
		{"missing.png", "E_FILES_NOT_FOUND"}, {"absent/image.jpg", "E_FILES_NOT_FOUND"},
		{"oversize.png", "E_FILES_LIMIT"}, {"fake.png", "E_FILES_TYPE"}, {"mismatch.jpg", "E_FILES_TYPE"},
		{"safe.txt", "E_FILES_TYPE"}, {"safe.svg", "E_FILES_TYPE"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			response := callFiles(t, f, "files.inspectImage", map[string]any{"workspaceId": id, "path": tc.path})
			requireFilesCode(t, response, tc.code)
			encoded, err := Encode(response)
			if err != nil || bytes.Contains(encoded, []byte(dir)) {
				t.Fatal("error leaked absolute path or failed encoding")
			}
		})
	}
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", map[string]any{"workspaceId": id, "path": "nested/safe.png"}))
	root, err := os.OpenRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer root.Close()
	info, err := root.Stat(".")
	if err != nil {
		t.Fatal(err)
	}
	device, _, err := inodeIdentity(info)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = readImageSnapshot(root, "safe.png", device+1); err == nil || filesAsError(err).Code != "E_FILES_ACCESS" {
		t.Fatalf("wrong device: %v", err)
	}
	for _, method := range []string{"files.write", "files.create"} {
		params := map[string]any{"workspaceId": id, "path": "safe.png", "content": "replace"}
		if method == "files.write" {
			params["expectedSha256"] = textHash(string(data))
		}
		requireFilesCode(t, callFiles(t, f, method, params), "E_FILES_TYPE")
	}
	// Inspector accepts neither write payloads nor absolute-path fields.
	for _, key := range []string{"absolutePath", "content"} {
		requireFilesCode(t, callFiles(t, f, "files.inspectImage", map[string]any{"workspaceId": id, "path": "safe.png", key: "x"}), "E_SCHEMA")
	}
	if _, err := filesMCPArgsDecode("files.inspectImage", json.RawMessage(`{"workspaceId":"`+id+`","path":"safe.png"}`)); err == nil {
		t.Fatal("inspector escaped into purpose-bound MCP surface")
	}
	legacy, _ := Decode(MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "r", "method": "files.inspectImage", "params": map[string]any{}}))
	if ValidateRequest(legacy) == nil {
		t.Fatal("inspector escaped into legacy RPC")
	}
}

func TestNativeFilesInspectImageAuthorityAndLease(t *testing.T) {
	f, dir, id := filesFixture(t)
	if err := os.WriteFile(filepath.Join(dir, "image.png"), filesImageFixture(t, "png"), 0600); err != nil {
		t.Fatal(err)
	}
	params := map[string]any{"workspaceId": id, "path": "image.png", "leaseEpoch": ""}
	req := filesTestRequest(t, f, "files.inspectImage", params)
	wrong := req
	wrong.SessionID = "wrong-session"
	requireFilesCode(t, f.Handle(wrong), "E_FILES_SESSION")
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", map[string]any{"workspaceId": "workspace-00000000-0000-0000-0000-000000000000", "path": "image.png"}), "E_FILES_ACCESS")
	attached, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	epoch := attached["leaseEpoch"].(string)
	requireFilesCode(t, f.Handle(req), "E_FILES_SESSION")
	params["leaseEpoch"] = epoch
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	if !f.releaseDevWorkspace(id, epoch) {
		t.Fatal("lease release failed")
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_SESSION")
	next, _, err := f.attachDevWorkspace(dir, "read-write")
	if err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_SESSION")
	params["leaseEpoch"] = next["leaseEpoch"]
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	if _, err := WorkspaceAdd(dir, "read-only"); err != nil {
		t.Fatal(err)
	}
	if _, err := WorkspaceAdd(dir, "read-write"); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_SESSION")
	delete(params, "leaseEpoch")
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	if _, err := WorkspaceRevoke(id); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_ACCESS")
	regranted, err := WorkspaceAdd(dir, "read-only")
	if err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_ACCESS")
	params["workspaceId"] = regranted["workspaceId"]
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	if err := os.Rename(dir, dir+"-old"); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_ACCESS")
	f.Close()
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_SESSION")
}

func TestNativeFilesInspectImageTemporaryLeaseAndInstallRevocation(t *testing.T) {
	f, dir, id := filesFixture(t)
	temporaryDir := filepath.Join(filepath.Dir(dir), "temporary-images")
	if err := os.Mkdir(temporaryDir, 0700); err != nil {
		t.Fatal(err)
	}
	data := filesImageFixture(t, "png")
	if err := os.WriteFile(filepath.Join(temporaryDir, "image.png"), data, 0600); err != nil {
		t.Fatal(err)
	}
	attached, owned, err := f.attachDevWorkspace(temporaryDir, "read-only")
	if err != nil || !owned {
		t.Fatalf("attach: %v %v", owned, err)
	}
	temporaryID := attached["workspaceId"].(string)
	epoch := attached["leaseEpoch"].(string)
	params := map[string]any{"workspaceId": temporaryID, "path": "image.png", "leaseEpoch": epoch}
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	if !f.releaseDevWorkspace(temporaryID, epoch) {
		t.Fatal("temporary release failed")
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_SESSION")
	delete(params, "leaseEpoch")
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_ACCESS")
	if err := os.WriteFile(filepath.Join(dir, "image.png"), data, 0600); err != nil {
		t.Fatal(err)
	}
	params["workspaceId"] = id
	requireFilesResult(t, callFiles(t, f, "files.inspectImage", params))
	cfg := f.cfg
	cfg.ClientCredential = strings.Repeat("c", 64)
	encoded, err := json.Marshal(cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath(), encoded, 0600); err != nil {
		t.Fatal(err)
	}
	requireFilesCode(t, callFiles(t, f, "files.inspectImage", params), "E_FILES_ACCESS")
}

func TestNativeFilesInspectImageNegotiatedTrustedHost(t *testing.T) {
	f, dir, id := filesFixture(t)
	if err := os.WriteFile(filepath.Join(dir, "image.png"), filesImageFixture(t, "png"), 0600); err != nil {
		t.Fatal(err)
	}
	reader, writer := io.Pipe()
	host, err := NewHost(f.cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), writer)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { host.Close(); _ = reader.Close(); _ = writer.Close() })
	req := filesTestRequest(t, host.files, "files.inspectImage", map[string]any{"workspaceId": id, "path": "image.png"})
	raw, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	if host.handleChrome(raw) == nil {
		t.Fatal("inspection accepted before authenticated welcome")
	}
	welcome := map[string]any{"v": 1, "kind": "welcome", "extensionId": "wrong-extension", "extensionVersion": "test", "localFilesVersion": 1}
	if host.handleChrome(MustEncode(welcome)) == nil {
		t.Fatal("wrong extension accepted")
	}
	welcome["extensionId"] = testExtensionID
	done := make(chan error, 1)
	go func() { done <- host.handleChrome(MustEncode(welcome)) }()
	state := readAIFrame(t, reader)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if String(state, "kind") != "files.state" {
		t.Fatal("missing negotiation state")
	}
	if err := host.handleChrome(raw); err != nil {
		t.Fatal(err)
	}
	response := readAIFrame(t, reader)
	if String(response, "kind") != "files.response" || String(response, "requestId") != req.RequestID || !Has(response, "result") || Has(response, "error") {
		t.Fatalf("inspection frame: %v", response)
	}
	legacy, err := NewHost(f.cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer legacy.Close()
	delete(welcome, "localFilesVersion")
	if err := legacy.handleChrome(MustEncode(welcome)); err != nil {
		t.Fatal(err)
	}
	if legacy.handleChrome(raw) == nil {
		t.Fatal("unnegotiated connection gained inspector")
	}
}
