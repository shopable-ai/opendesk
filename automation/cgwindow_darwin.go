//go:build darwin

package automation

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdint.h>
#include <string.h>

static void copy_cf_string(CFStringRef value, char *dst, size_t size) {
	if (dst == NULL || size == 0) return;
	dst[0] = '\0';
	if (value == NULL) return;
	CFStringGetCString(value, dst, size, kCFStringEncodingUTF8);
}

static int copy_number(CFDictionaryRef dict, const void *key, int64_t *out) {
	CFNumberRef value = (CFNumberRef)CFDictionaryGetValue(dict, key);
	if (value == NULL) return 0;
	return CFNumberGetValue(value, kCFNumberSInt64Type, out);
}

static int window_for_pid(
	int pid,
	int64_t *window_id,
	double *x,
	double *y,
	double *width,
	double *height,
	char *owner,
	size_t owner_size,
	char *title,
	size_t title_size
) {
	CFArrayRef rows = CGWindowListCopyWindowInfo(
		kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
		kCGNullWindowID
	);
	if (rows == NULL) return 0;
	CFIndex count = CFArrayGetCount(rows);
	int found = 0;
	for (CFIndex i = 0; i < count; i++) {
		CFDictionaryRef row = (CFDictionaryRef)CFArrayGetValueAtIndex(rows, i);
		int64_t owner_pid = 0;
		int64_t layer = -1;
		if (!copy_number(row, kCGWindowOwnerPID, &owner_pid) || owner_pid != pid) continue;
		if (!copy_number(row, kCGWindowLayer, &layer) || layer != 0) continue;

		CFDictionaryRef bounds = (CFDictionaryRef)CFDictionaryGetValue(row, kCGWindowBounds);
		CGRect rect = CGRectZero;
		if (bounds == NULL || !CGRectMakeWithDictionaryRepresentation(bounds, &rect)) continue;
		if (rect.size.width <= 0 || rect.size.height <= 0) continue;

		int64_t number = 0;
		copy_number(row, kCGWindowNumber, &number);
		*window_id = number;
		*x = rect.origin.x;
		*y = rect.origin.y;
		*width = rect.size.width;
		*height = rect.size.height;
		copy_cf_string((CFStringRef)CFDictionaryGetValue(row, kCGWindowOwnerName), owner, owner_size);
		copy_cf_string((CFStringRef)CFDictionaryGetValue(row, kCGWindowName), title, title_size);
		found = 1;
		break;
	}
	CFRelease(rows);
	return found;
}
*/
import "C"

import (
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"unsafe"
)

var lsappinfoPIDPattern = regexp.MustCompile(`"pid"=([0-9]+)`)

func getActiveMacWindowCoreGraphics() (*macWindow, error) {
	pid, err := frontmostApplicationPID()
	if err != nil {
		return nil, err
	}
	return getMacWindowForPIDCoreGraphics(pid)
}

func getMacWindowForPIDCoreGraphics(pid int) (*macWindow, error) {
	if pid <= 0 {
		return nil, fmt.Errorf("invalid application pid %d", pid)
	}
	var windowID C.int64_t
	var x, y, width, height C.double
	owner := make([]byte, 512)
	title := make([]byte, 1024)
	found := C.window_for_pid(
		C.int(pid),
		&windowID,
		&x,
		&y,
		&width,
		&height,
		(*C.char)(unsafe.Pointer(&owner[0])),
		C.size_t(len(owner)),
		(*C.char)(unsafe.Pointer(&title[0])),
		C.size_t(len(title)),
	)
	if found == 0 {
		return nil, fmt.Errorf("frontmost application pid %d has no on-screen window", pid)
	}
	item := &macWindow{
		Title:        cStringBytes(title),
		PID:          uint32(pid),
		X:            int32(x),
		Y:            int32(y),
		Width:        int32(width),
		Height:       int32(height),
		AppName:      cStringBytes(owner),
		IsForeground: true,
		HasFocus:     true,
		Handle:       int64(windowID),
	}
	enrichMacWindow(item)
	if !normalizeMacWindowTitle(item) {
		return nil, fmt.Errorf("frontmost application pid %d has no identifiable window", pid)
	}
	return item, nil
}

func frontmostApplicationPID() (int, error) {
	front, err := exec.Command("lsappinfo", "front").Output()
	if err != nil {
		return 0, fmt.Errorf("resolve frontmost application: %w", err)
	}
	asn := strings.TrimSpace(string(front))
	if asn == "" {
		return 0, fmt.Errorf("resolve frontmost application: empty ASN")
	}
	info, err := exec.Command("lsappinfo", "info", "-only", "pid", asn).Output()
	if err != nil {
		return 0, fmt.Errorf("resolve frontmost application pid: %w", err)
	}
	match := lsappinfoPIDPattern.FindSubmatch(info)
	if len(match) != 2 {
		return 0, fmt.Errorf("resolve frontmost application pid: unexpected lsappinfo output")
	}
	pid, err := strconv.Atoi(string(match[1]))
	if err != nil || pid <= 0 {
		return 0, fmt.Errorf("resolve frontmost application pid: invalid pid")
	}
	return pid, nil
}

func cStringBytes(value []byte) string {
	if index := bytes.IndexByte(value, 0); index >= 0 {
		value = value[:index]
	}
	return string(value)
}
