package customui

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const MaxTrustedHTMLBytes = 8 << 20
const MaxTrustedMessageBytes = 64 << 10

// TrustedContent is internal fixed-byte transport, never a public trust switch.
type TrustedContent struct {
	HTML string `json:"html"`
}
type TrustedFile struct {
	File     string `json:"file"`
	BasePath string `json:"basePath,omitempty"`
	SHA256   string `json:"sha256"`
}

func LoadTrustedContent(content TrustedFile, baseDir string) (*TrustedContent, error) {
	digest, err := hex.DecodeString(content.SHA256)
	if err != nil || len(digest) != sha256.Size {
		return nil, invalidSpec("content.sha256 must be a 64-character SHA-256 hex digest")
	}
	if baseDir == "" {
		baseDir = "."
	}
	root, err := canonicalDirectory(baseDir)
	if err != nil {
		return nil, invalidSpec("invalid script directory")
	}
	if content.BasePath != "" {
		root, err = resolveContainedPath(root, content.BasePath, true)
		if err != nil {
			return nil, invalidSpec("content.basePath must stay within script directory")
		}
	}
	path, err := resolveContainedPath(root, content.File, false)
	if err != nil || content.File == "" {
		return nil, invalidSpec("content.file must be a contained local HTML file")
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".html" && ext != ".htm" {
		return nil, invalidSpec("content.file must be HTML")
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, invalidSpec("cannot open trusted HTML")
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, invalidSpec("trusted HTML must be a regular file")
	}
	data, err := io.ReadAll(io.LimitReader(f, MaxTrustedHTMLBytes+1))
	if err != nil || len(data) > MaxTrustedHTMLBytes || !utf8.Valid(data) {
		return nil, invalidSpec("trusted HTML must be UTF-8 and at most 8 MiB")
	}
	sum := sha256.Sum256(data)
	if !strings.EqualFold(hex.EncodeToString(sum[:]), content.SHA256) {
		return nil, invalidSpec("trusted HTML SHA-256 mismatch")
	}
	return &TrustedContent{HTML: string(data)}, nil
}

// ValidateTrustedJSON checks data only; there is no JavaScript evaluation API.
func ValidateTrustedJSON(data []byte) error {
	if len(data) > MaxTrustedMessageBytes || !utf8.Valid(data) || !json.Valid(data) {
		return fmt.Errorf("message must be valid UTF-8 JSON of at most 64 KiB")
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	nodes := 0
	var visit func(any, int) error
	visit = func(v any, depth int) error {
		nodes++
		if depth > 32 || nodes > 4096 {
			return fmt.Errorf("message exceeds depth 32 or 4096 values")
		}
		switch x := v.(type) {
		case []any:
			for _, item := range x {
				if err := visit(item, depth+1); err != nil {
					return err
				}
			}
		case map[string]any:
			for _, item := range x {
				if err := visit(item, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	return visit(value, 0)
}

func (w *Window) PostMessage(ctx context.Context, data json.RawMessage) error {
	if err := ValidateTrustedJSON(data); err != nil {
		return &Error{Code: CodeInvalidSpec, Operation: "postMessage", Message: err.Error()}
	}
	w.operation.Lock()
	defer w.operation.Unlock()
	if w.spec.Trusted == nil {
		return &Error{Code: CodeUnsupportedCapability, Operation: "postMessage", Message: "window is not trusted"}
	}
	if w.Status() == StatusClosed || w.Status() == StatusFailed {
		return &Error{Code: CodeInvalidState, Operation: "postMessage", Message: "window is closed"}
	}
	sender, ok := w.driver.(interface {
		PostMessage(context.Context, json.RawMessage) error
	})
	if !ok {
		return &Error{Code: CodeUnsupportedCapability, Operation: "postMessage", Message: "driver does not support trusted messages"}
	}
	return sender.PostMessage(ctx, data)
}

func (w *processWindow) PostMessage(ctx context.Context, data json.RawMessage) error {
	return w.driver.call(ctx, w.sessionID, w.id, "postMessage", map[string]any{"json": string(data)}, nil)
}
