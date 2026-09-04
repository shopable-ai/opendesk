//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework AppKit -framework Foundation
#include <stdint.h>
#include <stdlib.h>

#define OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT -72000
#define OPENDESK_CLIPBOARD_SERIALIZATION_FAILED -72001
#define OPENDESK_CLIPBOARD_WRITE_FAILED -72002

int32_t opendesk_clipboard_native_formats_json(char **json);
int64_t opendesk_clipboard_change_count(void);
int32_t opendesk_clipboard_read_data(int format, void **data, int64_t *size);
int32_t opendesk_clipboard_read_files_json(char **json);
int32_t opendesk_clipboard_write_payload(
    const void *text, int64_t text_size, int has_text,
    const void *html, int64_t html_size, int has_html,
    const void *rtf, int64_t rtf_size, int has_rtf,
    const void *png, int64_t png_size, int has_png,
    const char *files_json, int has_files,
    int64_t *change_count);
int32_t opendesk_clipboard_clear(int64_t *change_count);
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"unsafe"
)

type darwinClipboardBackend struct{}

func newDefaultClipboardBackend() ClipboardBackend { return &darwinClipboardBackend{} }

func (b *darwinClipboardBackend) Name() string    { return "nspasteboard" }
func (b *darwinClipboardBackend) Supported() bool { return true }

func (b *darwinClipboardBackend) NativeFormats() ([]string, error) {
	var raw *C.char
	if status := int32(C.opendesk_clipboard_native_formats_json(&raw)); status != 0 {
		return nil, darwinClipboardStatusError(status, "pasteboard format enumeration failed")
	}
	if raw == nil {
		return []string{}, nil
	}
	defer C.free(unsafe.Pointer(raw))
	formats := []string{}
	if err := json.Unmarshal([]byte(C.GoString(raw)), &formats); err != nil {
		return nil, clipboardOperationError("", ClipboardBackendFailed, "pasteboard format metadata could not be decoded", err)
	}
	return formats, nil
}

func (b *darwinClipboardBackend) ChangeCount() (int64, error) {
	value := int64(C.opendesk_clipboard_change_count())
	if value < 0 {
		return 0, clipboardOperationError("", ClipboardBackendFailed, "pasteboard changeCount is unavailable", nil)
	}
	return value, nil
}

func (b *darwinClipboardBackend) ReadData(format string) ([]byte, error) {
	formatID := C.int(0)
	switch format {
	case ClipboardFormatText:
		formatID = 1
	case ClipboardFormatHTML:
		formatID = 2
	case ClipboardFormatRTF:
		formatID = 3
	case ClipboardFormatPNG:
		formatID = 4
	default:
		return nil, clipboardOperationError("", ClipboardUnsupportedFormat, "unsupported clipboard format", nil)
	}
	var raw unsafe.Pointer
	var size C.int64_t
	if status := int32(C.opendesk_clipboard_read_data(formatID, &raw, &size)); status != 0 {
		return nil, darwinClipboardStatusError(status, "pasteboard representation could not be read")
	}
	if raw == nil || size == 0 {
		return []byte{}, nil
	}
	defer C.free(raw)
	if int64(size) > clipboardMaxPayloadBytes {
		return nil, clipboardOperationError("", ClipboardPayloadTooLarge, "clipboard representation exceeds 16777216 bytes", nil)
	}
	return C.GoBytes(raw, C.int(size)), nil
}

func (b *darwinClipboardBackend) ReadFiles() ([]string, error) {
	var raw *C.char
	if status := int32(C.opendesk_clipboard_read_files_json(&raw)); status != 0 {
		return nil, darwinClipboardStatusError(status, "pasteboard file URLs could not be read")
	}
	if raw == nil {
		return []string{}, nil
	}
	defer C.free(unsafe.Pointer(raw))
	files := []string{}
	if err := json.Unmarshal([]byte(C.GoString(raw)), &files); err != nil {
		return nil, clipboardOperationError("", ClipboardBackendFailed, "pasteboard file metadata could not be decoded", err)
	}
	return files, nil
}

func (b *darwinClipboardBackend) Write(payload ClipboardPayload) (int64, error) {
	text, freeText := clipboardCBytes(payload.Text)
	defer freeText()
	html, freeHTML := clipboardCBytes(payload.HTML)
	defer freeHTML()
	rtf, freeRTF := clipboardRawCBytes(payload.RTF)
	defer freeRTF()
	png, freePNG := clipboardRawCBytes(payload.PNG)
	defer freePNG()
	filesJSON, err := json.Marshal(payload.Files)
	if err != nil {
		return 0, clipboardOperationError("", ClipboardBackendFailed, "file-list metadata could not be encoded", err)
	}
	cFiles := C.CString(string(filesJSON))
	defer C.free(unsafe.Pointer(cFiles))
	var changeCount C.int64_t
	status := int32(C.opendesk_clipboard_write_payload(
		text, clipboardStringSize(payload.Text), clipboardBool(payload.Text != nil),
		html, clipboardStringSize(payload.HTML), clipboardBool(payload.HTML != nil),
		rtf, C.int64_t(len(payload.RTF)), clipboardBool(payload.HasRTF),
		png, C.int64_t(len(payload.PNG)), clipboardBool(payload.HasPNG),
		cFiles, clipboardBool(payload.HasFiles), &changeCount,
	))
	if status != 0 {
		return 0, darwinClipboardStatusError(status, "pasteboard write failed")
	}
	return int64(changeCount), nil
}

func (b *darwinClipboardBackend) Clear() (int64, error) {
	var changeCount C.int64_t
	if status := int32(C.opendesk_clipboard_clear(&changeCount)); status != 0 {
		return 0, darwinClipboardStatusError(status, "pasteboard clear failed")
	}
	return int64(changeCount), nil
}

func clipboardCBytes(value *string) (unsafe.Pointer, func()) {
	if value == nil || len(*value) == 0 {
		return nil, func() {}
	}
	raw := C.CBytes([]byte(*value))
	return raw, func() { C.free(raw) }
}

func clipboardRawCBytes(value []byte) (unsafe.Pointer, func()) {
	if len(value) == 0 {
		return nil, func() {}
	}
	raw := C.CBytes(value)
	return raw, func() { C.free(raw) }
}

func clipboardStringSize(value *string) C.int64_t {
	if value == nil {
		return 0
	}
	return C.int64_t(len(*value))
}

func clipboardBool(value bool) C.int {
	if value {
		return 1
	}
	return 0
}

func darwinClipboardStatusError(status int32, message string) error {
	switch status {
	case C.OPENDESK_CLIPBOARD_UNSUPPORTED_FORMAT:
		return clipboardOperationError("", ClipboardUnsupportedFormat, message, nil)
	default:
		return clipboardOperationError("", ClipboardBackendFailed, message, fmt.Errorf("%s", formatClipboardStatus(status)))
	}
}
