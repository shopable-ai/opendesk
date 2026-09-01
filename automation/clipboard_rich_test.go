package automation

import (
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dop251/goja"
)

const clipboardTestPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

func TestRichClipboardPreservesTextAPIAndTrueClear(t *testing.T) {
	backend := newMemoryClipboardBackend()
	clipboard := newClipboardWithBackend(backend)

	if err := clipboard.Copy(""); err != nil {
		t.Fatalf("copy empty text: %v", err)
	}
	if text, err := clipboard.Paste(); err != nil || text != "" {
		t.Fatalf("paste empty text=%q err=%v", text, err)
	}
	formats, err := clipboard.GetFormats()
	if err != nil || len(formats) != 1 || formats[0] != ClipboardFormatText {
		t.Fatalf("empty text formats=%#v err=%v", formats, err)
	}
	if err := clipboard.Clear(); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if formats, err := clipboard.GetFormats(); err != nil || len(formats) != 0 {
		t.Fatalf("formats after clear=%#v err=%v", formats, err)
	}
	if text, err := clipboard.Paste(); err != nil || text != "" {
		t.Fatalf("paste after clear=%q err=%v", text, err)
	}
}

func TestRichClipboardFormatNegotiationAndBinaryProjection(t *testing.T) {
	backend := newMemoryClipboardBackend()
	clipboard := newClipboardWithBackend(backend)
	file := filepath.Join(t.TempDir(), "fixture.txt")
	if err := os.WriteFile(file, []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	text := "plain"
	html := "<b>plain</b>"
	rtf := []byte("{\\rtf1\\ansi plain}")
	pngBytes, err := base64.StdEncoding.DecodeString(clipboardTestPNGBase64)
	if err != nil {
		t.Fatal(err)
	}
	payload := ClipboardPayload{
		Text: &text, HTML: &html, RTF: rtf, HasRTF: true, PNG: pngBytes, HasPNG: true,
		Files: []string{file}, HasFiles: true,
	}
	writeResult, err := clipboard.Write(payload)
	if err != nil {
		t.Fatal(err)
	}
	formats := writeResult["formats"].([]string)
	if strings.Join(formats, ",") != strings.Join(clipboardFormatOrder, ",") {
		t.Fatalf("formats=%#v", formats)
	}
	readResult, err := clipboard.Read(ClipboardReadRequest{Formats: []string{ClipboardFormatHTML, ClipboardFormatPNG, ClipboardFormatFiles}})
	if err != nil {
		t.Fatal(err)
	}
	if readResult["html"] != html || readResult["pngBase64"] != clipboardTestPNGBase64 {
		t.Fatalf("rich read fields=%#v", readResult)
	}
	files := readResult["files"].([]string)
	if len(files) != 1 || files[0] != file {
		t.Fatalf("files=%#v", files)
	}
	if _, included := readResult["text"]; included {
		t.Fatalf("unrequested text was returned: %#v", readResult)
	}
	if readResult["rtfBase64"] != nil {
		t.Fatalf("unrequested RTF was returned: %#v", readResult)
	}
}

func TestRichClipboardRejectsUnsupportedAndOversizePayloads(t *testing.T) {
	backend := newMemoryClipboardBackend()
	clipboard := newClipboardWithBackend(backend)
	secret := "private-clipboard-body"

	if _, err := clipboard.Read(ClipboardReadRequest{Formats: []string{"application/json"}}); clipboardErrorCode(err) != ClipboardUnsupportedFormat {
		t.Fatalf("unsupported read error=%v code=%q", err, clipboardErrorCode(err))
	}
	if _, err := clipboard.Write(ClipboardPayload{}); clipboardErrorCode(err) != ClipboardInvalidArgument {
		t.Fatalf("empty write error=%v code=%q", err, clipboardErrorCode(err))
	}
	tooLarge := strings.Repeat("x", clipboardMaxTextBytes+1)
	if _, err := clipboard.Write(ClipboardPayload{Text: &tooLarge}); clipboardErrorCode(err) != ClipboardPayloadTooLarge {
		t.Fatalf("large write error=%v code=%q", err, clipboardErrorCode(err))
	}
	backend.payload.Text = &secret
	backend.nativeFormats = []string{"public.utf8-plain-text"}
	if _, err := clipboard.Read(ClipboardReadRequest{MaxBytes: 1}); clipboardErrorCode(err) != ClipboardPayloadTooLarge {
		t.Fatalf("limited read error=%v code=%q", err, clipboardErrorCode(err))
	} else if strings.Contains(err.Error(), secret) {
		t.Fatalf("clipboard body leaked in size error: %v", err)
	}
}

func TestRichClipboardClassifiesPlainTextAliasesAndDerivedMetadata(t *testing.T) {
	native := []string{
		"public.utf16-plain-text",
		"com.apple.traditional-mac-plain-text",
		"dyn.ah62d4rv4gk81g7d3ru",
		"com.example.private",
	}
	formats := canonicalClipboardFormats(native)
	if len(formats) != 1 || formats[0] != ClipboardFormatText {
		t.Fatalf("canonical formats=%#v", formats)
	}
	derived := derivedClipboardNativeFormats(native)
	if len(derived) != 1 || derived[0] != "dyn.ah62d4rv4gk81g7d3ru" {
		t.Fatalf("derived formats=%#v", derived)
	}
	unsupported := unsupportedClipboardNativeFormats(native)
	if len(unsupported) != 1 || unsupported[0] != "com.example.private" {
		t.Fatalf("unsupported formats=%#v", unsupported)
	}
}

func TestRichClipboardJSBindingIsStructuredAndDoesNotDuplicateWatcher(t *testing.T) {
	runtimeValue := goja.New()
	backend := newMemoryClipboardBackend()
	registerClipboard(runtimeValue, InitJSOptions{ClipboardBackendFactory: func() ClipboardBackend { return backend }})

	value, err := runtimeValue.RunString(`
		(() => {
			const methods = ['copy', 'paste', 'clear', 'read', 'write', 'getFormats', 'getCapabilities'];
			if (!methods.every(name => typeof clipboard[name] === 'function')) throw new Error('missing clipboard method');
			if (clipboard.onChange !== undefined) throw new Error('clipboard must reuse Events instead of adding a watcher');
			clipboard.copy('roundtrip');
			if (clipboard.paste() !== 'roundtrip') throw new Error('text compatibility failed');
			const result = clipboard.write({text: 'plain', html: '<b>plain</b>'});
			const readback = clipboard.read({formats: ['text/html']});
			let invalid;
			try { clipboard.read({formats: ['application/json']}); } catch (error) { invalid = {code: error.code, operation: error.operation}; }
			return {result, readback, invalid, capabilities: clipboard.getCapabilities()};
		})()
	`)
	if err != nil {
		t.Fatal(err)
	}
	result := value.Export().(map[string]interface{})
	invalid := result["invalid"].(map[string]interface{})
	if invalid["code"] != string(ClipboardUnsupportedFormat) || invalid["operation"] != "clipboard.read" {
		t.Fatalf("structured error=%#v", invalid)
	}
	readback := result["readback"].(map[string]interface{})
	if readback["html"] != "<b>plain</b>" || readback["text"] != nil {
		t.Fatalf("readback=%#v", readback)
	}
	capabilities := result["capabilities"].(map[string]interface{})
	watcher := capabilities["watcher"].(map[string]interface{})
	if watcher["api"] != "Events.on" || watcher["contentIncluded"] != false {
		t.Fatalf("watcher capability=%#v", watcher)
	}
}

func clipboardErrorCode(err error) ClipboardErrorCode {
	var clipboardErr *ClipboardError
	if errors.As(err, &clipboardErr) {
		return clipboardErr.Code
	}
	return ""
}

type memoryClipboardBackend struct {
	payload       ClipboardPayload
	nativeFormats []string
	changeCount   int64
	err           error
}

func newMemoryClipboardBackend() *memoryClipboardBackend { return &memoryClipboardBackend{} }
func (b *memoryClipboardBackend) Name() string           { return "memory" }
func (b *memoryClipboardBackend) Supported() bool        { return true }
func (b *memoryClipboardBackend) NativeFormats() ([]string, error) {
	if b.err != nil {
		return nil, b.err
	}
	return append([]string(nil), b.nativeFormats...), nil
}
func (b *memoryClipboardBackend) ChangeCount() (int64, error) {
	if b.err != nil {
		return 0, b.err
	}
	return b.changeCount, nil
}
func (b *memoryClipboardBackend) ReadData(format string) ([]byte, error) {
	if b.err != nil {
		return nil, b.err
	}
	switch format {
	case ClipboardFormatText:
		if b.payload.Text == nil {
			return nil, clipboardOperationError("", ClipboardUnsupportedFormat, "missing representation", nil)
		}
		return []byte(*b.payload.Text), nil
	case ClipboardFormatHTML:
		if b.payload.HTML == nil {
			return nil, clipboardOperationError("", ClipboardUnsupportedFormat, "missing representation", nil)
		}
		return []byte(*b.payload.HTML), nil
	case ClipboardFormatRTF:
		return append([]byte(nil), b.payload.RTF...), nil
	case ClipboardFormatPNG:
		return append([]byte(nil), b.payload.PNG...), nil
	default:
		return nil, clipboardOperationError("", ClipboardUnsupportedFormat, "missing representation", nil)
	}
}
func (b *memoryClipboardBackend) ReadFiles() ([]string, error) {
	if b.err != nil {
		return nil, b.err
	}
	return append([]string(nil), b.payload.Files...), nil
}
func (b *memoryClipboardBackend) Write(payload ClipboardPayload) (int64, error) {
	if b.err != nil {
		return 0, b.err
	}
	b.payload = payload
	b.changeCount++
	b.nativeFormats = []string{}
	if payload.Text != nil {
		b.nativeFormats = append(b.nativeFormats, "public.utf8-plain-text")
	}
	if payload.HTML != nil {
		b.nativeFormats = append(b.nativeFormats, "public.html")
	}
	if payload.HasRTF {
		b.nativeFormats = append(b.nativeFormats, "public.rtf")
	}
	if payload.HasPNG {
		b.nativeFormats = append(b.nativeFormats, "public.png")
	}
	if payload.HasFiles {
		b.nativeFormats = append(b.nativeFormats, "public.file-url")
	}
	return b.changeCount, nil
}
func (b *memoryClipboardBackend) Clear() (int64, error) {
	if b.err != nil {
		return 0, b.err
	}
	b.payload = ClipboardPayload{}
	b.nativeFormats = nil
	b.changeCount++
	return b.changeCount, nil
}
