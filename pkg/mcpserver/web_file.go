package mcpserver

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const webProofName = "web-proof.txt"

// webFileTest is a private adapter, deliberately independent of Runtime/File APIs.
// The mutex covers authorization, creation, reads and handle shutdown together.
type webFileTest struct {
	mu         sync.Mutex
	root       *os.Root
	paths      []string
	identities []os.FileInfo
	file       *os.File
	identity   os.FileInfo
	expected   string
	closed     bool
}

func webFileTools() []Tool {
	empty := func() map[string]any {
		return map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}
	}
	write := empty()
	write["properties"] = map[string]any{"nonce": map[string]any{"type": "string", "pattern": "^[0-9a-f]{32}$"}}
	write["required"] = []string{"nonce"}
	return []Tool{
		{Name: "tm_status", Description: "Restricted nonce proof adapter status; no desktop access", InputSchema: empty(), Annotations: &ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true}},
		{Name: "tm_test_write_nonce", Description: "Create web-proof.txt once with a 32 lowercase hex nonce and newline", InputSchema: write, Annotations: &ToolAnnotations{}},
		{Name: "tm_test_read_nonce", Description: "Read only this instance's successfully created nonce proof", InputSchema: empty(), Annotations: &ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true}},
	}
}

// NewWebFileTestServer opens an existing dedicated run directory below the
// current repository's .runtime/tests/mcp-chatgpt-web directory. It never creates
// a Runtime or registers desktop, Browser, Recorder, or general file tools.
func NewWebFileTestServer(dir string) (*Server, error) {
	fail := func() (*Server, error) { return nil, errors.New("invalid web file test directory") }
	if !filepath.IsAbs(dir) || filepath.Clean(dir) != dir {
		return fail()
	}
	repo, err := os.Getwd()
	if err != nil {
		return fail()
	}
	for {
		if _, err := os.Stat(filepath.Join(repo, "go.mod")); err == nil {
			if _, err := os.Stat(filepath.Join(repo, ".git")); err == nil {
				break
			}
		}
		parent := filepath.Dir(repo)
		if parent == repo {
			return fail()
		}
		repo = parent
	}
	base := filepath.Join(repo, ".runtime", "tests", "mcp-chatgpt-web")
	rel, err := filepath.Rel(base, dir)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fail()
	}
	w := &webFileTest{}
	current := filepath.VolumeName(dir) + string(filepath.Separator)
	// Capture each path identity, rejecting symbolic links at every level.
	for _, part := range strings.Split(strings.TrimPrefix(dir, current), string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fail()
		}
		w.paths = append(w.paths, current)
		w.identities = append(w.identities, info)
	}
	w.root, err = os.OpenRoot(dir)
	if err != nil {
		return fail()
	}
	if err := w.checkRoot(); err != nil {
		w.root.Close()
		return fail()
	}
	s := &Server{webFileTest: w, protocolVersion: LatestProtocolVersion, tools: map[string]Tool{}}
	for _, tool := range webFileTools() {
		s.tools[tool.Name] = tool
	}
	return s, nil
}

// Close releases only handles owned by the restricted adapter; proof artifacts
// remain available for independent host inspection. Safe to call repeatedly.
func (s *Server) Close() error {
	if s.webFileTest == nil {
		return nil
	}
	w := s.webFileTest
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil
	}
	w.closed = true
	var fileErr error
	if w.file != nil {
		fileErr = w.file.Close()
	}
	return errors.Join(fileErr, w.root.Close())
}

func (w *webFileTest) checkRoot() error {
	for i, path := range w.paths {
		info, err := os.Lstat(path)
		if err != nil || !info.IsDir() || !os.SameFile(info, w.identities[i]) {
			return errors.New("proof directory identity changed")
		}
	}
	info, err := w.root.Stat(".")
	if err != nil || !os.SameFile(info, w.identities[len(w.identities)-1]) {
		return errors.New("proof directory identity changed")
	}
	return nil
}

// Inspect the original envelope before Unmarshal can erase duplicate fields.
// Fold case because encoding/json also accepts case-insensitive struct fields.
func validWebFileEnvelope(raw []byte) bool {
	d := json.NewDecoder(bytes.NewReader(raw))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return false
	}
	seen := map[string]bool{}
	for d.More() {
		token, err := d.Token()
		key, ok := token.(string)
		for _, field := range []string{"jsonrpc", "id", "method", "params"} {
			if strings.EqualFold(key, field) {
				key = field
				break
			}
		}
		if err != nil || !ok || seen[key] {
			return false
		}
		seen[key] = true
		var value json.RawMessage
		if d.Decode(&value) != nil {
			return false
		}
	}
	_, err = d.Token()
	return err == nil
}

// Reject duplicate/unknown wrapper fields while preserving MCP request _meta
// and optional arguments. Metadata is never passed into proof operations.
func validWebFileCall(raw json.RawMessage) bool {
	d := json.NewDecoder(bytes.NewReader(raw))
	token, err := d.Token()
	if err != nil || token != json.Delim('{') {
		return false
	}
	seen := map[string]bool{}
	for d.More() {
		token, err = d.Token()
		key, ok := token.(string)
		if err != nil || !ok || seen[key] || (key != "name" && key != "arguments" && key != "_meta") {
			return false
		}
		seen[key] = true
		var value json.RawMessage
		if d.Decode(&value) != nil {
			return false
		}
		if key == "_meta" && !isJSONObject(value) {
			return false
		}
		if key == "arguments" {
			if !isJSONObject(value) {
				return false
			}
			// Duplicate argument fields are rejected rather than last-value-wins.
			a := json.NewDecoder(bytes.NewReader(value))
			if _, err := a.Token(); err != nil {
				return false
			}
			keys := map[string]bool{}
			for a.More() {
				token, err := a.Token()
				k, ok := token.(string)
				if err != nil || !ok || keys[k] {
					return false
				}
				keys[k] = true
				var v json.RawMessage
				if a.Decode(&v) != nil {
					return false
				}
			}
		}
	}
	return seen["name"]
}

func validWebNonce(nonce string) bool {
	if len(nonce) != 32 {
		return false
	}
	for _, c := range nonce {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func (w *webFileTest) call(name string, args map[string]any) (map[string]any, error) {
	// Keep authorization independent of discovery and the generic dispatcher.
	var tool *Tool
	for _, candidate := range webFileTools() {
		if candidate.Name == name {
			copy := candidate
			tool = &copy
			break
		}
	}
	if tool == nil {
		return nil, errors.New("tool not allowed in web file test mode")
	}
	if err := validateToolArguments(*tool, args); err != nil {
		return nil, errors.New("invalid proof arguments")
	}
	nonce, _ := args["nonce"].(string)
	if name == "tm_test_write_nonce" && !validWebNonce(nonce) {
		return nil, errors.New("nonce must be 32 lowercase hexadecimal characters")
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return nil, errors.New("proof adapter closed")
	}
	if err := w.checkRoot(); err != nil {
		return nil, err
	}
	switch name {
	case "tm_status":
		return map[string]any{"ok": true, "mode": "web-file-test", "created": w.expected != ""}, nil
	case "tm_test_write_nonce":
		if w.file != nil {
			return nil, errors.New("proof already created or creation attempted")
		}
		f, err := w.root.OpenFile(webProofName, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return nil, errors.New("exclusive proof creation failed")
		}
		// Retain even a failed creation handle: never retry or unlink a potentially
		// replaced path. Only successful, validated writes authorize reading.
		w.file = f
		w.identity, err = f.Stat()
		if err != nil || !w.identity.Mode().IsRegular() {
			return nil, errors.New("invalid proof file identity")
		}
		if err := f.Chmod(0600); err != nil {
			return nil, errors.New("proof permissions failed")
		}
		content := nonce + "\n"
		if n, err := io.WriteString(f, content); err != nil || n != len(content) {
			return nil, errors.New("proof write failed")
		}
		if err := f.Sync(); err != nil {
			return nil, errors.New("proof sync failed")
		}
		return w.finalizeWrite(content)
	case "tm_test_read_nonce":
		if w.expected == "" {
			return nil, errors.New("this instance has not created a proof")
		}
		if err := w.validateContent(w.expected); err != nil {
			return nil, err
		}
		result := webProofMetadata(w.expected)
		result["nonce"] = strings.TrimSuffix(w.expected, "\n")
		return result, nil
	}
	return nil, errors.New("tool not allowed")
}

// Called with mu held, after Sync; authorize reads only after actual FD content
// and path identities have been validated. Failed attempts retain their handle.
func (w *webFileTest) finalizeWrite(content string) (map[string]any, error) {
	if err := w.validateContent(content); err != nil {
		return nil, err
	}
	w.expected = content
	return webProofMetadata(content), nil
}

func (w *webFileTest) validateContent(expected string) error {
	if err := w.checkFile(); err != nil {
		return err
	}
	// Bounded ReadAt on the original FD cannot follow a replacement or block on
	// an injected FIFO. No unexpected bytes are ever returned to the caller.
	data := make([]byte, len(expected)+1)
	n, err := w.file.ReadAt(data, 0)
	if err != nil && err != io.EOF {
		return errors.New("proof read failed")
	}
	if n != len(expected) || string(data[:n]) != expected {
		return errors.New("proof content changed")
	}
	return w.checkFile()
}

func (w *webFileTest) checkFile() error {
	if err := w.checkRoot(); err != nil {
		return err
	}
	info, err := w.root.Lstat(webProofName)
	if err != nil || !info.Mode().IsRegular() || !os.SameFile(info, w.identity) {
		return errors.New("proof file identity changed")
	}
	held, err := w.file.Stat()
	if err != nil || !held.Mode().IsRegular() || !os.SameFile(held, w.identity) {
		return errors.New("proof file identity changed")
	}
	return nil
}

func webProofMetadata(content string) map[string]any {
	sum := sha256.Sum256([]byte(content))
	return map[string]any{"ok": true, "filename": webProofName, "bytes": len(content), "sha256": hex.EncodeToString(sum[:])}
}
