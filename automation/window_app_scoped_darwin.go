//go:build darwin

package automation

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <libproc.h>
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

// Resolve only this AX element. The private symbol is optional, dynamically
// loaded, and called at most once with the element's bounded messaging timeout.
static AXError scoped_ax_window_id(AXUIElementRef element, uint32_t *out) {
    if (!element || CFGetTypeID(element) != AXUIElementGetTypeID()) return kAXErrorIllegalArgument;
    AXError err = AXUIElementSetMessagingTimeout(element, 0.2f);
    if (err != kAXErrorSuccess) return err;
    CFTypeRef value = NULL;
    err = AXUIElementCopyAttributeValue(element, CFSTR("AXWindowNumber"), &value);
    int64_t number = 0;
    if (err == kAXErrorSuccess && value && CFGetTypeID(value) == CFNumberGetTypeID())
        CFNumberGetValue((CFNumberRef)value, kCFNumberSInt64Type, &number);
    if (value) CFRelease(value);
    if (number > 0 && number <= UINT32_MAX) { *out = (uint32_t)number; return kAXErrorSuccess; }
    if (err != kAXErrorSuccess && err != kAXErrorAttributeUnsupported && err != kAXErrorNoValue)
        return err;
    typedef AXError (*GetWindow)(AXUIElementRef, uint32_t *);
    GetWindow getWindow = (GetWindow)dlsym(RTLD_DEFAULT, "_AXUIElementGetWindow");
    if (!getWindow) return kAXErrorNotImplemented;
    err = getWindow(element, out);
    return err == kAXErrorSuccess && *out == 0 ? kAXErrorFailure : err;
}

static int scoped_executable_matches(int pid, const char *expected) {
    char path[PROC_PIDPATHINFO_MAXSIZE];
    int size = proc_pidpath(pid, path, sizeof(path));
    if (size <= 0) return -1;
    return strcmp(path, expected) == 0 ? 1 : 0;
}

static AXError scoped_focused_window(int pid, AXUIElementRef *out) {
    AXUIElementRef app = AXUIElementCreateApplication(pid);
    if (!app) return kAXErrorFailure;
    AXError err = AXUIElementSetMessagingTimeout(app, 0.2f);
    CFTypeRef focused = NULL;
    if (err == kAXErrorSuccess)
        err = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute, &focused);
    CFRelease(app);
    if (err != kAXErrorSuccess) { if (focused) CFRelease(focused); return err; }
    if (!focused) return kAXErrorNoValue;
    if (CFGetTypeID(focused) != AXUIElementGetTypeID()) { CFRelease(focused); return kAXErrorFailure; }
    pid_t owner = 0;
    err = AXUIElementGetPid((AXUIElementRef)focused, &owner);
    if (err != kAXErrorSuccess || owner != pid) { CFRelease(focused); return kAXErrorFailure; }
    *out = (AXUIElementRef)focused;
    return kAXErrorSuccess;
}

// The only CG query includes exactly the previously resolved native window ID.
static int scoped_exact_bounds(int pid, uint32_t wid, CGRect *bounds) {
    CFArrayRef rows = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, wid);
    if (!rows) return 0;
    int valid = 0;
    if (CFArrayGetCount(rows) == 1) {
        CFDictionaryRef row = CFArrayGetValueAtIndex(rows, 0);
        CFNumberRef owner = CFDictionaryGetValue(row, kCGWindowOwnerPID);
        CFNumberRef number = CFDictionaryGetValue(row, kCGWindowNumber);
        int64_t actualPID = 0, actualID = 0;
        CFDictionaryRef rect = CFDictionaryGetValue(row, kCGWindowBounds);
        if (owner && number && CFNumberGetValue(owner, kCFNumberSInt64Type, &actualPID) &&
            CFNumberGetValue(number, kCFNumberSInt64Type, &actualID) && actualPID == pid && actualID == wid &&
            rect && CGRectMakeWithDictionaryRepresentation(rect, bounds)) valid = 1;
    }
    CFRelease(rows);
    return valid;
}
static AXError scoped_title(AXUIElementRef window, char *out, size_t capacity) {
    CFTypeRef value = NULL;
    AXError err = AXUIElementCopyAttributeValue(window, kAXTitleAttribute, &value);
    if (err == kAXErrorNoValue || err == kAXErrorAttributeUnsupported) return kAXErrorSuccess;
    if (err != kAXErrorSuccess) { if (value) CFRelease(value); return err; }
    int valid = value && CFGetTypeID(value) == CFStringGetTypeID() &&
        CFStringGetCString((CFStringRef)value, out, capacity, kCFStringEncodingUTF8);
    if (value) CFRelease(value);
    return valid ? kAXErrorSuccess : kAXErrorFailure;
}
*/
import "C"

import (
	"context"
	"fmt"
	"math"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unsafe"
)

// macScopedAXWindowID is shared with Accessibility's exact AX-root resolution.
// The caller owns a live AXUIElementRef for the duration of this call.
func macScopedAXWindowID(element uintptr) (uint64, error) {
	var wid C.uint32_t
	status := C.scoped_ax_window_id(C.AXUIElementRef(unsafe.Pointer(element)), &wid)
	if status != C.kAXErrorSuccess {
		return 0, macScopedAXError(status)
	}
	return uint64(wid), nil
}

func macScopedAXError(status C.AXError) error {
	code := WindowBackendFailed
	switch status {
	case C.kAXErrorAPIDisabled:
		code = WindowPermissionDenied
	case C.kAXErrorCannotComplete:
		code = WindowTimeout
	case C.kAXErrorNotImplemented:
		code = WindowNotSupported
	}
	return &WindowError{Code: code, Message: fmt.Sprintf("scoped AX observation failed (%d)", int(status))}
}

// Each invocation uses a fresh system utility process, avoiding the stale
// LaunchServices/Carbon foreground cache in a long-lived Runtime. Query only
// the front ASN and its PID; never request names, paths, windows or app lists.
var scopedFrontASN = regexp.MustCompile(`^ASN:0x[0-9a-fA-F]+-0x[0-9a-fA-F]+:$`)
var scopedFrontPID = regexp.MustCompile(`^"pid"=([0-9]+)$`)

func macScopedForegroundPID() (int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
	defer cancel()
	query := func(args ...string) (string, error) {
		output, err := exec.CommandContext(ctx, "/usr/bin/lsappinfo", args...).Output()
		if err != nil {
			code := WindowBackendFailed
			if ctx.Err() != nil {
				code = WindowTimeout
			}
			return "", &WindowError{Code: code, Message: "scoped foreground PID query failed"}
		}
		return strings.TrimSpace(string(output)), nil
	}
	asn, err := query("front")
	if err != nil {
		return 0, err
	}
	if !scopedFrontASN.MatchString(asn) {
		return 0, &WindowError{Code: WindowBackendFailed, Message: "invalid foreground process token"}
	}
	raw, err := query("info", "-only", "pid", asn)
	if err != nil {
		return 0, err
	}
	match := scopedFrontPID.FindStringSubmatch(raw)
	if len(match) != 2 {
		return 0, &WindowError{Code: WindowBackendFailed, Message: "invalid foreground process identifier"}
	}
	pid, err := strconv.ParseInt(match[1], 10, 32)
	if err != nil || pid <= 0 {
		return 0, &WindowError{Code: WindowBackendFailed, Message: "invalid foreground process identifier"}
	}
	return int(pid), nil
}

func getAppScopedWindow(pid uint32, exePath string) (*WindowInfo, error) {
	const operation = "window.getAppWindow"
	// No target AX tree (or other window's metadata) is touched on mismatch.
	front, err := macScopedForegroundPID()
	if err != nil {
		return nil, err
	}
	if front != int(pid) {
		return nil, nil
	}
	expected := C.CString(exePath)
	defer C.free(unsafe.Pointer(expected))
	verifyProcess := func() error {
		switch C.scoped_executable_matches(C.int(pid), expected) {
		case 1:
			return nil
		case 0:
			return windowOperationError(operation, WindowVerificationFailed, "target executable does not match process", nil)
		default:
			return windowOperationError(operation, WindowStaleTarget, "target process identity is unavailable", nil)
		}
	}
	if err := verifyProcess(); err != nil {
		return nil, err
	}
	// The fresh foreground check above precedes all target AX access; only
	// local process identity verification intervenes. Recheck after AX below.
	var focused C.AXUIElementRef
	status := C.scoped_focused_window(C.int(pid), &focused)
	if status == C.kAXErrorNoValue || status == C.kAXErrorAttributeUnsupported {
		return nil, nil
	}
	if status != C.kAXErrorSuccess {
		return nil, macScopedAXError(status)
	}
	defer C.CFRelease(C.CFTypeRef(focused))
	handle, err := macScopedAXWindowID(uintptr(unsafe.Pointer(focused)))
	if err != nil {
		return nil, err
	}
	var bounds C.CGRect
	if C.scoped_exact_bounds(C.int(pid), C.uint32_t(handle), &bounds) == 0 {
		return nil, windowOperationError(operation, WindowVerificationFailed, "focused window owner or native identity could not be verified", nil)
	}
	values := []float64{float64(bounds.origin.x), float64(bounds.origin.y), float64(bounds.size.width), float64(bounds.size.height)}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < math.MinInt32 || value > math.MaxInt32 {
			return nil, windowOperationError(operation, WindowVerificationFailed, "invalid focused window bounds", nil)
		}
	}
	if values[2] < 1 || values[3] < 1 {
		return nil, windowOperationError(operation, WindowVerificationFailed, "empty focused window bounds", nil)
	}
	title := make([]C.char, 8192)
	if status = C.scoped_title(focused, &title[0], C.size_t(len(title))); status != C.kAXErrorSuccess {
		return nil, macScopedAXError(status)
	}
	if err := verifyProcess(); err != nil {
		return nil, err
	}
	front, err = macScopedForegroundPID()
	if err != nil {
		return nil, err
	}
	if front != int(pid) {
		return nil, nil
	}
	return &WindowInfo{
		ID: makeWindowID(pid, handle), ProcessID: pid, Handle: handle,
		Title: C.GoString(&title[0]), ExePath: exePath, ExeName: filepath.Base(exePath),
		X: int32(values[0]), Y: int32(values[1]), Width: int32(values[2]), Height: int32(values[3]),
		IsForeground: true, HasFocus: true,
	}, nil
}

// Accessibility refreshes an already resolved ID without observing other apps.
func macScopedAccessibilityWindow(ctx context.Context, expected AccessibilityWindowIdentity) (*WindowInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var bounds C.CGRect
	if C.scoped_exact_bounds(C.int(expected.PID), C.uint32_t(expected.Handle), &bounds) == 0 {
		return nil, nil
	}
	front, err := macScopedForegroundPID()
	if err != nil {
		return nil, err
	}
	focused := false
	if front == int(expected.PID) {
		var element C.AXUIElementRef
		status := C.scoped_focused_window(C.int(expected.PID), &element)
		if status != C.kAXErrorSuccess {
			return nil, macScopedAXError(status)
		}
		defer C.CFRelease(C.CFTypeRef(element))
		wid, err := macScopedAXWindowID(uintptr(unsafe.Pointer(element)))
		if err != nil {
			return nil, err
		}
		focused = wid == expected.Handle
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	// A target AX read may span a foreground switch. Recheck before reporting
	// focus to callers that use this observation to guard following or input.
	front, err = macScopedForegroundPID()
	if err != nil {
		return nil, err
	}
	focused = focused && front == int(expected.PID)
	return &WindowInfo{ID: expected.ID, ProcessID: uint32(expected.PID), Handle: expected.Handle,
		X: int32(bounds.origin.x), Y: int32(bounds.origin.y), Width: int32(bounds.size.width), Height: int32(bounds.size.height),
		IsForeground: focused, HasFocus: focused}, nil
}

// macScopedWindowBounds observes only an already resolved (PID, window ID).
// It deliberately supplies no foreground/focus authorization. Snapshot callers
// must also verify their retained AX root and compare pre/post geometry.
func macScopedWindowBounds(ctx context.Context, pid int64, handle uint64) (*AccessibilityNativeBounds, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if pid <= 0 || pid > math.MaxInt32 || handle == 0 || handle > math.MaxUint32 {
		return nil, darwinAXMappingStale()
	}
	var bounds C.CGRect
	if C.scoped_exact_bounds(C.int(pid), C.uint32_t(handle), &bounds) == 0 {
		return nil, darwinAXMappingStale()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	result := &AccessibilityNativeBounds{
		X: float64(bounds.origin.x), Y: float64(bounds.origin.y),
		Width: float64(bounds.size.width), Height: float64(bounds.size.height),
		CoordinateSpace: "macos-global-display-points-top-left",
	}
	if !finitePositiveAccessibilityBounds(result) {
		return nil, darwinAXMappingStale()
	}
	for _, value := range []float64{result.X, result.Y, result.Width, result.Height} {
		if value < math.MinInt32 || value > math.MaxInt32 {
			return nil, darwinAXMappingStale()
		}
	}
	return result, nil
}
