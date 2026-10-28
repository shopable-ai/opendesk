//go:build darwin

package automation

/*
#cgo LDFLAGS: -framework CoreGraphics -framework CoreFoundation -framework ApplicationServices
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <ApplicationServices/ApplicationServices.h>
#include <math.h>
#include <stdint.h>
#include <string.h>

// NSWorkspace's frontmostApplication can be stale in a CLI without an AppKit
// runloop. This legacy Process Manager query is retained for unscoped window
// discovery; it can also lag in long-lived processes. Scoped foreground/input
// guards must use macScopedForegroundPID instead. Fail closed if unavailable.
static int frontmost_application_pid(void) {
	ProcessSerialNumber psn = {0, 0};
	pid_t pid = 0;
	if (GetFrontProcess(&psn) != noErr || GetProcessPID(&psn, &pid) != noErr) return 0;
	return pid;
}

#define CGWINDOW_OWNER_CAPACITY 512
#define CGWINDOW_TITLE_CAPACITY 1024

typedef struct {
	int64_t window_id;
	int64_t pid;
	double x;
	double y;
	double width;
	double height;
	int index;
	char owner[CGWINDOW_OWNER_CAPACITY];
	char title[CGWINDOW_TITLE_CAPACITY];
} cgwindow_row;

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

// list_on_screen_windows is deliberately a CoreGraphics-only fallback for
// System Events enumeration.  A modal sheet can make AX/JXA stall while its
// parent document window remains visible; returning every normal, visible
// window preserves the parent identity needed by callers to use relative
// geometry safely.  The caller owns filtering and process enrichment.
static int list_on_screen_windows(cgwindow_row *out, int capacity,
	int expected_pid, int64_t expected_id, int front_pid, int64_t *front_id) {
	if (out == NULL || capacity <= 0) return 0;
	CFArrayRef rows = CGWindowListCopyWindowInfo(
		kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
		kCGNullWindowID
	);
	if (rows == NULL) return 0;
	CFIndex count = CFArrayGetCount(rows);
	int written = 0;
	int normal_index = 0;
	for (CFIndex i = 0; i < count && written < capacity; i++) {
		CFDictionaryRef row = (CFDictionaryRef)CFArrayGetValueAtIndex(rows, i);
		int64_t owner_pid = 0;
		int64_t layer = -1;
		if (!copy_number(row, kCGWindowOwnerPID, &owner_pid) || owner_pid <= 0) continue;
		if (!copy_number(row, kCGWindowLayer, &layer) || layer != 0) continue;

		CFDictionaryRef bounds = (CFDictionaryRef)CFDictionaryGetValue(row, kCGWindowBounds);
		CGRect rect = CGRectZero;
		if (bounds == NULL || !CGRectMakeWithDictionaryRepresentation(bounds, &rect)) continue;
		if (rect.size.width <= 0 || rect.size.height <= 0) continue;

		int64_t number = 0;
		if (!copy_number(row, kCGWindowNumber, &number) || number <= 0) continue;
		int index = normal_index++;
		if (front_id != NULL && *front_id == 0 && owner_pid == front_pid) *front_id = number;
		if (expected_pid > 0 && (owner_pid != expected_pid || number != expected_id)) continue;

		cgwindow_row *item = &out[written];
		memset(item, 0, sizeof(*item));
		item->window_id = number;
		item->pid = owner_pid;
		item->x = rect.origin.x;
		item->y = rect.origin.y;
		item->width = rect.size.width;
		item->height = rect.size.height;
		item->index = index;
		copy_cf_string((CFStringRef)CFDictionaryGetValue(row, kCGWindowOwnerName), item->owner, sizeof(item->owner));
		copy_cf_string((CFStringRef)CFDictionaryGetValue(row, kCGWindowName), item->title, sizeof(item->title));
		written++;
	}
	CFRelease(rows);
	return written;
}

static int window_id_for_pid_bounds(
	int pid,
	double expected_x,
	double expected_y,
	double expected_width,
	double expected_height,
	int64_t *window_id
) {
	CFArrayRef rows = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID);
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
		if (fabs(rect.origin.x - expected_x) > 2.0 || fabs(rect.origin.y - expected_y) > 2.0 ||
			fabs(rect.size.width - expected_width) > 2.0 || fabs(rect.size.height - expected_height) > 2.0) continue;

		int64_t number = 0;
		if (!copy_number(row, kCGWindowNumber, &number) || number <= 0) continue;
		if (found != 0) {
			CFRelease(rows);
			return 0;
		}
		*window_id = number;
		found = 1;
	}
	CFRelease(rows);
	return found;
}
*/
import "C"

import (
	"bytes"
	"fmt"
	"unsafe"
)

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

func listMacWindowsCoreGraphics() ([]macWindow, error) {
	// CoreGraphics returns front-to-back rows.  Keep the bounded buffer well
	// above the number of ordinary desktop windows while avoiding an unbounded
	// C allocation on a degraded desktop session.
	rows := make([]C.cgwindow_row, 128)
	written := int(C.list_on_screen_windows((*C.cgwindow_row)(unsafe.Pointer(&rows[0])), C.int(len(rows)), 0, 0, 0, nil))
	if written <= 0 {
		return nil, fmt.Errorf("CoreGraphics returned no visible normal windows")
	}

	frontPID, _ := frontmostApplicationPID()
	items := make([]macWindow, 0, written)
	for i := 0; i < written; i++ {
		row := &rows[i]
		owner := unsafe.Slice((*byte)(unsafe.Pointer(&row.owner[0])), len(row.owner))
		title := unsafe.Slice((*byte)(unsafe.Pointer(&row.title[0])), len(row.title))
		item := macWindow{
			Title:        cStringBytes(title),
			PID:          uint32(row.pid),
			X:            int32(row.x),
			Y:            int32(row.y),
			Width:        int32(row.width),
			Height:       int32(row.height),
			AppName:      cStringBytes(owner),
			IsForeground: int(row.pid) == frontPID,
			HasFocus:     int(row.pid) == frontPID,
			Handle:       int64(row.window_id),
			Index:        int(row.index),
		}
		enrichMacWindow(&item)
		if normalizeMacWindowTitle(&item) {
			items = append(items, item)
		}
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("CoreGraphics returned no identifiable visible windows")
	}
	return items, nil
}

// Refresh only the resolved owner/handle. Do not enrich every desktop process
// or make a second foreground/window-list observation for the same refresh.
func currentMacWindowCoreGraphics(pid uint32, handle uint64) (*macWindow, error) {
	frontPID, err := frontmostApplicationPID()
	if err != nil {
		return nil, err
	}
	rows := make([]C.cgwindow_row, 2) // Retain duplicate-identity rejection.
	var frontID C.int64_t
	written := int(C.list_on_screen_windows(&rows[0], C.int(len(rows)), C.int(pid), C.int64_t(handle), C.int(frontPID), &frontID))
	if written == 0 {
		return nil, nil
	}
	if written != 1 {
		return nil, fmt.Errorf("CoreGraphics returned duplicate window identity pid=%d handle=%d", pid, handle)
	}
	row := &rows[0]
	owner := unsafe.Slice((*byte)(unsafe.Pointer(&row.owner[0])), len(row.owner))
	title := unsafe.Slice((*byte)(unsafe.Pointer(&row.title[0])), len(row.title))
	foreground := int(row.pid) == frontPID && row.window_id == frontID
	item := &macWindow{
		Title: cStringBytes(title), PID: uint32(row.pid), Handle: int64(row.window_id),
		X: int32(row.x), Y: int32(row.y), Width: int32(row.width), Height: int32(row.height),
		AppName: cStringBytes(owner), Index: int(row.index), IsForeground: foreground, HasFocus: foreground,
	}
	enrichMacWindow(item)
	if !normalizeMacWindowTitle(item) {
		return nil, nil
	}
	return item, nil
}

func getMacWindowIDForPIDAndBounds(pid uint32, x, y, width, height int32) (int64, error) {
	if pid == 0 || width <= 0 || height <= 0 {
		return 0, fmt.Errorf("invalid macOS window identity input")
	}
	var windowID C.int64_t
	found := C.window_id_for_pid_bounds(
		C.int(pid),
		C.double(x),
		C.double(y),
		C.double(width),
		C.double(height),
		&windowID,
	)
	if found == 0 || windowID <= 0 {
		return 0, fmt.Errorf("no unique CoreGraphics window matches pid and bounds")
	}
	return int64(windowID), nil
}

func frontmostApplicationPID() (int, error) {
	pid := int(C.frontmost_application_pid())
	if pid <= 0 {
		return 0, fmt.Errorf("resolve frontmost application pid: Process Manager returned no live process")
	}
	return pid, nil
}

func cStringBytes(value []byte) string {
	if index := bytes.IndexByte(value, 0); index >= 0 {
		value = value[:index]
	}
	return string(value)
}
