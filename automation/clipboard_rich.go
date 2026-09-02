package automation

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/dop251/goja"
)

const (
	ClipboardFormatText  = "text/plain"
	ClipboardFormatHTML  = "text/html"
	ClipboardFormatRTF   = "text/rtf"
	ClipboardFormatPNG   = "image/png"
	ClipboardFormatFiles = "files"

	clipboardMaxPayloadBytes = 16 << 20
	clipboardMaxTextBytes    = 4 << 20
	clipboardMaxFiles        = 256
	clipboardMaxPathBytes    = 4096
)

var clipboardFormatOrder = []string{
	ClipboardFormatText,
	ClipboardFormatHTML,
	ClipboardFormatRTF,
	ClipboardFormatPNG,
	ClipboardFormatFiles,
}

type ClipboardErrorCode string

const (
	ClipboardInvalidArgument    ClipboardErrorCode = "INVALID_ARGUMENT"
	ClipboardUnsupportedFormat  ClipboardErrorCode = "UNSUPPORTED_FORMAT"
	ClipboardPayloadTooLarge    ClipboardErrorCode = "PAYLOAD_TOO_LARGE"
	ClipboardNotSupported       ClipboardErrorCode = "NOT_SUPPORTED"
	ClipboardBackendFailed      ClipboardErrorCode = "BACKEND_FAILED"
	ClipboardVerificationFailed ClipboardErrorCode = "VERIFICATION_FAILED"
	ClipboardChanged            ClipboardErrorCode = "CLIPBOARD_CHANGED"
)

// ClipboardError never includes clipboard contents. Paths, HTML, RTF, PNG,
// and text are deliberately excluded from diagnostic fields and messages.
type ClipboardError struct {
	Code      ClipboardErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *ClipboardError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "clipboard operation failed"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *ClipboardError) Unwrap() error { return e.Cause }

type ClipboardPayload struct {
	Text     *string
	HTML     *string
	RTF      []byte
	PNG      []byte
	Files    []string
	HasRTF   bool
	HasPNG   bool
	HasFiles bool
}

type ClipboardReadRequest struct {
	Formats          []string
	MaxBytes         int
	formatsSpecified bool
}

type ClipboardBackend interface {
	Name() string
	Supported() bool
	NativeFormats() ([]string, error)
	ChangeCount() (int64, error)
	ReadData(format string) ([]byte, error)
	ReadFiles() ([]string, error)
	Write(ClipboardPayload) (int64, error)
	Clear() (int64, error)
}

type ClipboardBackendFactory func() ClipboardBackend

func newClipboardWithBackend(backend ClipboardBackend) *Clipboard {
	if backend == nil {
		backend = newUnsupportedClipboardBackend(runtime.GOOS, "rich clipboard backend factory returned nil")
	}
	return &Clipboard{backend: backend}
}

func (c *Clipboard) Write(payload ClipboardPayload) (map[string]interface{}, error) {
	if err := validateClipboardPayload(payload); err != nil {
		return nil, wrapClipboardError("clipboard.write", err)
	}
	if c == nil || c.backend == nil || !c.backend.Supported() {
		return nil, clipboardOperationError("clipboard.write", ClipboardNotSupported, "rich clipboard is unavailable on this platform", nil)
	}
	changeCount, err := c.backend.Write(payload)
	if err != nil {
		return nil, wrapClipboardError("clipboard.write", err)
	}
	formats, err := c.verifyWrite(payload, changeCount)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"changeCount": changeCount, "formats": formats}, nil
}

func (c *Clipboard) Read(request ClipboardReadRequest) (map[string]interface{}, error) {
	if c == nil || c.backend == nil || !c.backend.Supported() {
		return nil, clipboardOperationError("clipboard.read", ClipboardNotSupported, "rich clipboard is unavailable on this platform", nil)
	}
	maxBytes := request.MaxBytes
	if maxBytes == 0 {
		maxBytes = clipboardMaxPayloadBytes
	}
	if maxBytes < 1 || maxBytes > clipboardMaxPayloadBytes {
		return nil, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "maxBytes must be between 1 and 16777216", nil)
	}
	requested, err := normalizeClipboardFormats(request.Formats)
	if err != nil {
		return nil, wrapClipboardError("clipboard.read", err)
	}
	formatsSpecified := request.formatsSpecified || request.Formats != nil
	for attempt := 0; attempt < 2; attempt++ {
		result, changed, readErr := c.readSnapshot(requested, formatsSpecified, maxBytes)
		if readErr != nil {
			return nil, readErr
		}
		if !changed {
			return result, nil
		}
	}
	return nil, clipboardOperationError("clipboard.read", ClipboardChanged, "clipboard changed while a consistent snapshot was being read; retry the operation", nil)
}

func (c *Clipboard) readSnapshot(requested []string, formatsSpecified bool, maxBytes int) (map[string]interface{}, bool, error) {
	changeCount, err := c.backend.ChangeCount()
	if err != nil {
		return nil, false, wrapClipboardError("clipboard.read", err)
	}
	nativeFormats, err := c.backend.NativeFormats()
	if err != nil {
		return nil, false, wrapClipboardError("clipboard.read", err)
	}
	available := canonicalClipboardFormats(nativeFormats)
	if !formatsSpecified {
		requested = available
	}
	result := map[string]interface{}{
		"formats": available, "nativeFormats": nativeFormats,
		"unsupportedNativeFormats": unsupportedClipboardNativeFormats(nativeFormats),
		"derivedNativeFormats":     derivedClipboardNativeFormats(nativeFormats),
		"changeCount":              changeCount,
	}
	total := 0
	for _, format := range requested {
		if !containsString(available, format) {
			continue
		}
		if format == ClipboardFormatFiles {
			files, readErr := c.backend.ReadFiles()
			if readErr != nil {
				return nil, false, wrapClipboardError("clipboard.read", readErr)
			}
			for _, path := range files {
				total += len(path)
			}
			if total > maxBytes {
				return nil, false, clipboardOperationError("clipboard.read", ClipboardPayloadTooLarge, "clipboard payload exceeds maxBytes", nil)
			}
			result["files"] = files
			continue
		}
		data, readErr := c.backend.ReadData(format)
		if readErr != nil {
			return nil, false, wrapClipboardError("clipboard.read", readErr)
		}
		total += len(data)
		if total > maxBytes {
			return nil, false, clipboardOperationError("clipboard.read", ClipboardPayloadTooLarge, "clipboard payload exceeds maxBytes", nil)
		}
		switch format {
		case ClipboardFormatText:
			result["text"] = string(data)
		case ClipboardFormatHTML:
			result["html"] = string(data)
		case ClipboardFormatRTF:
			result["rtfBase64"] = base64.StdEncoding.EncodeToString(data)
		case ClipboardFormatPNG:
			result["pngBase64"] = base64.StdEncoding.EncodeToString(data)
		}
	}
	finalChangeCount, err := c.backend.ChangeCount()
	if err != nil {
		return nil, false, wrapClipboardError("clipboard.read", err)
	}
	if finalChangeCount != changeCount {
		return nil, true, nil
	}
	return result, false, nil
}

func (c *Clipboard) verifyWrite(payload ClipboardPayload, expectedChangeCount int64) ([]string, error) {
	changeCount, err := c.backend.ChangeCount()
	if err != nil {
		return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard changeCount readback failed", err)
	}
	if changeCount != expectedChangeCount {
		return nil, clipboardOperationError("clipboard.write", ClipboardChanged, "clipboard changed before the write could be verified", nil)
	}
	nativeFormats, err := c.backend.NativeFormats()
	if err != nil {
		return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard format readback failed", err)
	}
	formats := canonicalClipboardFormats(nativeFormats)
	for _, format := range clipboardPayloadFormats(payload) {
		if !containsString(formats, format) {
			return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard write did not advertise every requested format", nil)
		}
	}
	for _, format := range clipboardPayloadFormats(payload) {
		if format == ClipboardFormatFiles {
			files, readErr := c.backend.ReadFiles()
			if readErr != nil {
				return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard file-list readback failed", readErr)
			}
			if !equalStrings(files, payload.Files) {
				return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard file-list readback did not match the requested paths", nil)
			}
			continue
		}
		actual, readErr := c.backend.ReadData(format)
		if readErr != nil {
			return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard representation readback failed", readErr)
		}
		var expected []byte
		switch format {
		case ClipboardFormatText:
			expected = []byte(*payload.Text)
		case ClipboardFormatHTML:
			expected = []byte(*payload.HTML)
		case ClipboardFormatRTF:
			expected = payload.RTF
		case ClipboardFormatPNG:
			expected = payload.PNG
		}
		if !bytes.Equal(actual, expected) {
			return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard representation readback did not match the requested bytes", nil)
		}
	}
	finalChangeCount, err := c.backend.ChangeCount()
	if err != nil {
		return nil, clipboardOperationError("clipboard.write", ClipboardVerificationFailed, "clipboard changeCount verification failed", err)
	}
	if finalChangeCount != expectedChangeCount {
		return nil, clipboardOperationError("clipboard.write", ClipboardChanged, "clipboard changed while the write was being verified", nil)
	}
	return formats, nil
}

func (c *Clipboard) GetFormats() ([]string, error) {
	if c == nil || c.backend == nil || !c.backend.Supported() {
		return nil, clipboardOperationError("clipboard.getFormats", ClipboardNotSupported, "rich clipboard is unavailable on this platform", nil)
	}
	native, err := c.backend.NativeFormats()
	if err != nil {
		return nil, wrapClipboardError("clipboard.getFormats", err)
	}
	return canonicalClipboardFormats(native), nil
}

func (c *Clipboard) GetCapabilities() map[string]interface{} {
	backend := "unavailable"
	supported := false
	if c != nil && c.backend != nil {
		backend = c.backend.Name()
		supported = c.backend.Supported()
	}
	return map[string]interface{}{
		"schemaVersion": 1, "platform": runtime.GOOS, "backend": backend,
		"rich": supported,
		"formats": map[string]interface{}{
			ClipboardFormatText: supported, ClipboardFormatHTML: supported, ClipboardFormatRTF: supported,
			ClipboardFormatPNG: supported, ClipboardFormatFiles: supported,
		},
		"maxPayloadBytes": clipboardMaxPayloadBytes,
		"limits": map[string]interface{}{
			"maxPayloadBytes": clipboardMaxPayloadBytes,
			"maxTextBytes":    clipboardMaxTextBytes,
			"maxFiles":        clipboardMaxFiles,
			"maxPathBytes":    clipboardMaxPathBytes,
		},
		"watcher": map[string]interface{}{
			"api": "Events.on", "event": "clipboard.changed", "contentIncluded": false,
		},
	}
}

func registerClipboard(runtimeValue *goja.Runtime, opts InitJSOptions) *Clipboard {
	var backend ClipboardBackend
	if opts.ClipboardBackendFactory != nil {
		backend = opts.ClipboardBackendFactory()
	} else {
		backend = newDefaultClipboardBackend()
	}
	clipboard := newClipboardWithBackend(backend)
	object := runtimeValue.NewObject()
	_ = object.Set("copy", func(call goja.FunctionCall) goja.Value {
		value := call.Argument(0)
		text, ok := value.Export().(string)
		if !ok || goja.IsUndefined(value) || goja.IsNull(value) {
			panic(clipboardJSError(runtimeValue, clipboardOperationError("clipboard.copy", ClipboardInvalidArgument, "text must be a string", nil)))
		}
		if err := clipboard.Copy(text); err != nil {
			panic(clipboardJSError(runtimeValue, wrapClipboardError("clipboard.copy", err)))
		}
		return goja.Undefined()
	})
	_ = object.Set("paste", func(goja.FunctionCall) goja.Value {
		text, err := clipboard.Paste()
		if err != nil {
			panic(clipboardJSError(runtimeValue, wrapClipboardError("clipboard.paste", err)))
		}
		return runtimeValue.ToValue(text)
	})
	_ = object.Set("clear", func(goja.FunctionCall) goja.Value {
		if err := clipboard.Clear(); err != nil {
			panic(clipboardJSError(runtimeValue, wrapClipboardError("clipboard.clear", err)))
		}
		return goja.Undefined()
	})
	_ = object.Set("read", func(call goja.FunctionCall) goja.Value {
		request, err := parseClipboardReadRequest(call.Argument(0))
		if err != nil {
			panic(clipboardJSError(runtimeValue, err))
		}
		result, err := clipboard.Read(request)
		if err != nil {
			panic(clipboardJSError(runtimeValue, err))
		}
		return runtimeValue.ToValue(result)
	})
	_ = object.Set("write", func(call goja.FunctionCall) goja.Value {
		payload, err := parseClipboardPayload(call.Argument(0))
		if err != nil {
			panic(clipboardJSError(runtimeValue, err))
		}
		result, err := clipboard.Write(payload)
		if err != nil {
			panic(clipboardJSError(runtimeValue, err))
		}
		return runtimeValue.ToValue(result)
	})
	_ = object.Set("getFormats", func(goja.FunctionCall) goja.Value {
		formats, err := clipboard.GetFormats()
		if err != nil {
			panic(clipboardJSError(runtimeValue, err))
		}
		return runtimeValue.ToValue(formats)
	})
	_ = object.Set("getCapabilities", func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(clipboard.GetCapabilities())
	})
	_ = runtimeValue.Set("clipboard", object)
	return clipboard
}

func parseClipboardPayload(value goja.Value) (ClipboardPayload, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "payload must be an object", nil)
	}
	object, ok := value.Export().(map[string]interface{})
	if !ok {
		return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "payload must be an object", nil)
	}
	allowed := map[string]bool{"text": true, "html": true, "rtfBase64": true, "pngBase64": true, "files": true}
	for key := range object {
		if !allowed[key] {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "payload contains an unknown field", nil)
		}
	}
	payload := ClipboardPayload{}
	if raw, exists := object["text"]; exists {
		text, valid := raw.(string)
		if !valid {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "text must be a string", nil)
		}
		payload.Text = &text
	}
	if raw, exists := object["html"]; exists {
		html, valid := raw.(string)
		if !valid {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "html must be a string", nil)
		}
		payload.HTML = &html
	}
	if raw, exists := object["rtfBase64"]; exists {
		encoded, valid := raw.(string)
		if !valid {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "rtfBase64 must be a string", nil)
		}
		decoded, err := base64.StdEncoding.Strict().DecodeString(encoded)
		if err != nil || base64.StdEncoding.EncodeToString(decoded) != encoded {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "rtfBase64 must be canonical base64", nil)
		}
		payload.RTF, payload.HasRTF = decoded, true
	}
	if raw, exists := object["pngBase64"]; exists {
		encoded, valid := raw.(string)
		if !valid {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "pngBase64 must be a string", nil)
		}
		decoded, err := base64.StdEncoding.Strict().DecodeString(encoded)
		if err != nil || base64.StdEncoding.EncodeToString(decoded) != encoded {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "pngBase64 must be canonical base64", nil)
		}
		if !bytes.HasPrefix(decoded, []byte("\x89PNG\r\n\x1a\n")) {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "pngBase64 must decode to a PNG signature", nil)
		}
		payload.PNG, payload.HasPNG = decoded, true
	}
	if raw, exists := object["files"]; exists {
		items, valid := raw.([]interface{})
		if !valid {
			return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "files must be an array of absolute existing paths", nil)
		}
		payload.HasFiles = true
		for _, item := range items {
			path, valid := item.(string)
			if !valid {
				return ClipboardPayload{}, clipboardOperationError("clipboard.write", ClipboardInvalidArgument, "files must contain only paths", nil)
			}
			payload.Files = append(payload.Files, path)
		}
	}
	if err := validateClipboardPayload(payload); err != nil {
		return ClipboardPayload{}, wrapClipboardError("clipboard.write", err)
	}
	return payload, nil
}

func parseClipboardReadRequest(value goja.Value) (ClipboardReadRequest, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return ClipboardReadRequest{}, nil
	}
	object, ok := value.Export().(map[string]interface{})
	if !ok {
		return ClipboardReadRequest{}, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "options must be an object", nil)
	}
	for key := range object {
		if key != "formats" && key != "maxBytes" {
			return ClipboardReadRequest{}, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "options contains an unknown field", nil)
		}
	}
	request := ClipboardReadRequest{}
	if raw, exists := object["formats"]; exists {
		request.formatsSpecified = true
		items, valid := raw.([]interface{})
		if !valid {
			return request, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "formats must be an array", nil)
		}
		for _, item := range items {
			format, valid := item.(string)
			if !valid {
				return request, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "formats must contain only strings", nil)
			}
			request.Formats = append(request.Formats, format)
		}
	}
	if raw, exists := object["maxBytes"]; exists {
		value, valid := finiteInteger(raw)
		if !valid || value < 1 || value > clipboardMaxPayloadBytes {
			return request, clipboardOperationError("clipboard.read", ClipboardInvalidArgument, "maxBytes must be an integer between 1 and 16777216", nil)
		}
		request.MaxBytes = value
	}
	if _, err := normalizeClipboardFormats(request.Formats); err != nil {
		return request, wrapClipboardError("clipboard.read", err)
	}
	return request, nil
}

func validateClipboardPayload(payload ClipboardPayload) error {
	if payload.Text == nil && payload.HTML == nil && !payload.HasRTF && !payload.HasPNG && !payload.HasFiles {
		return clipboardOperationError("", ClipboardInvalidArgument, "payload must contain at least one supported format", nil)
	}
	total := 0
	for _, value := range []*string{payload.Text, payload.HTML} {
		if value == nil {
			continue
		}
		if !utf8.ValidString(*value) {
			return clipboardOperationError("", ClipboardInvalidArgument, "text and html must be valid UTF-8", nil)
		}
		if len(*value) > clipboardMaxTextBytes {
			return clipboardOperationError("", ClipboardPayloadTooLarge, "a text representation exceeds 4194304 bytes", nil)
		}
		total += len(*value)
	}
	if payload.HasRTF {
		if !bytes.HasPrefix(bytes.TrimSpace(payload.RTF), []byte("{\\rtf")) {
			return clipboardOperationError("", ClipboardInvalidArgument, "RTF payload has an invalid header", nil)
		}
		total += len(payload.RTF)
	}
	if payload.HasPNG {
		if !bytes.HasPrefix(payload.PNG, []byte("\x89PNG\r\n\x1a\n")) {
			return clipboardOperationError("", ClipboardInvalidArgument, "PNG payload has an invalid signature", nil)
		}
		if _, err := png.DecodeConfig(bytes.NewReader(payload.PNG)); err != nil {
			return clipboardOperationError("", ClipboardInvalidArgument, "PNG payload could not be decoded", nil)
		}
		total += len(payload.PNG)
	}
	if payload.HasFiles {
		if len(payload.Files) == 0 || len(payload.Files) > clipboardMaxFiles {
			return clipboardOperationError("", ClipboardInvalidArgument, "files must contain between 1 and 256 paths", nil)
		}
		for _, path := range payload.Files {
			if strings.ContainsRune(path, 0) || len(path) == 0 || len(path) > clipboardMaxPathBytes || !filepath.IsAbs(path) || filepath.Clean(path) != path {
				return clipboardOperationError("", ClipboardInvalidArgument, "files must contain clean absolute paths", nil)
			}
			if _, err := os.Stat(path); err != nil {
				return clipboardOperationError("", ClipboardInvalidArgument, "every file path must exist", nil)
			}
			total += len(path)
		}
	}
	if total > clipboardMaxPayloadBytes {
		return clipboardOperationError("", ClipboardPayloadTooLarge, "clipboard payload exceeds 16777216 bytes", nil)
	}
	return nil
}

func normalizeClipboardFormats(formats []string) ([]string, error) {
	wanted := map[string]bool{}
	for _, format := range formats {
		if !containsString(clipboardFormatOrder, format) {
			return nil, clipboardOperationError("", ClipboardUnsupportedFormat, "unsupported clipboard format", nil)
		}
		wanted[format] = true
	}
	result := []string{}
	for _, format := range clipboardFormatOrder {
		if wanted[format] {
			result = append(result, format)
		}
	}
	return result, nil
}

func clipboardPayloadFormats(payload ClipboardPayload) []string {
	result := []string{}
	if payload.Text != nil {
		result = append(result, ClipboardFormatText)
	}
	if payload.HTML != nil {
		result = append(result, ClipboardFormatHTML)
	}
	if payload.HasRTF {
		result = append(result, ClipboardFormatRTF)
	}
	if payload.HasPNG {
		result = append(result, ClipboardFormatPNG)
	}
	if payload.HasFiles {
		result = append(result, ClipboardFormatFiles)
	}
	return result
}

func canonicalClipboardFormats(native []string) []string {
	found := map[string]bool{}
	for _, value := range native {
		if format := canonicalClipboardFormatForNative(value); format != "" {
			found[format] = true
		}
	}
	result := []string{}
	for _, format := range clipboardFormatOrder {
		if found[format] {
			result = append(result, format)
		}
	}
	return result
}

func canonicalClipboardFormatForNative(value string) string {
	switch value {
	case "public.utf8-plain-text", "public.utf16-plain-text", "public.utf16-external-plain-text", "public.plain-text", "public.text", "com.apple.traditional-mac-plain-text", "NSStringPboardType":
		return ClipboardFormatText
	case "public.html", "NSHTMLPboardType":
		return ClipboardFormatHTML
	case "public.rtf", "NSRTFPboardType":
		return ClipboardFormatRTF
	case "public.png", "NSPNGPboardType":
		return ClipboardFormatPNG
	case "public.file-url", "NSFilenamesPboardType":
		return ClipboardFormatFiles
	default:
		return ""
	}
}

func unsupportedClipboardNativeFormats(native []string) []string {
	result := []string{}
	for _, value := range native {
		if canonicalClipboardFormatForNative(value) == "" && !isDerivedClipboardNativeFormat(value, native) {
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func derivedClipboardNativeFormats(native []string) []string {
	result := []string{}
	for _, value := range native {
		if isDerivedClipboardNativeFormat(value, native) {
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func isDerivedClipboardNativeFormat(value string, native []string) bool {
	// This dynamic UTI is the legacy Carbon 'styl' sidecar synthesized beside
	// plain text by macOS clipboard compatibility bridges. It is metadata, not
	// an independently readable user representation.
	if value == "dyn.ah62d4rv4gk81g7d3ru" || value == "CorePasteboardFlavorType 0x7374796C" {
		return true
	}
	// NSPasteboard may advertise generic URL compatibility sidecars for a
	// public.file-url representation. They are reproducible from the file URL,
	// but a standalone web URL is not a file list and must remain unsupported.
	return (value == "public.url" || value == "public.url-name") && containsString(native, "public.file-url")
}

func finiteInteger(value interface{}) (int, bool) {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return 0, false
	}
	if math.IsNaN(number) || math.IsInf(number, 0) || number != math.Trunc(number) {
		return 0, false
	}
	return int(number), true
}

func clipboardOperationError(operation string, code ClipboardErrorCode, message string, cause error) error {
	return &ClipboardError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapClipboardError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var clipboardErr *ClipboardError
	if errors.As(err, &clipboardErr) {
		copy := *clipboardErr
		copy.Operation = operation
		return &copy
	}
	return clipboardOperationError(operation, ClipboardBackendFailed, "clipboard backend failed", err)
}

func clipboardJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var clipboardErr *ClipboardError
	if errors.As(err, &clipboardErr) {
		_ = object.Set("code", string(clipboardErr.Code))
		_ = object.Set("operation", clipboardErr.Operation)
	}
	return object
}

func containsString(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

type unsupportedClipboardBackend struct {
	platform string
	reason   string
}

func newUnsupportedClipboardBackend(platform, reason string) ClipboardBackend {
	return &unsupportedClipboardBackend{platform: platform, reason: reason}
}

func (b *unsupportedClipboardBackend) Name() string    { return "unavailable" }
func (b *unsupportedClipboardBackend) Supported() bool { return false }
func (b *unsupportedClipboardBackend) err() error {
	return clipboardOperationError("", ClipboardNotSupported, b.reason, nil)
}
func (b *unsupportedClipboardBackend) NativeFormats() ([]string, error)      { return nil, b.err() }
func (b *unsupportedClipboardBackend) ChangeCount() (int64, error)           { return 0, b.err() }
func (b *unsupportedClipboardBackend) ReadData(string) ([]byte, error)       { return nil, b.err() }
func (b *unsupportedClipboardBackend) ReadFiles() ([]string, error)          { return nil, b.err() }
func (b *unsupportedClipboardBackend) Write(ClipboardPayload) (int64, error) { return 0, b.err() }
func (b *unsupportedClipboardBackend) Clear() (int64, error)                 { return 0, b.err() }

func formatClipboardStatus(status int32) string { return fmt.Sprintf("NSPasteboard status %d", status) }
