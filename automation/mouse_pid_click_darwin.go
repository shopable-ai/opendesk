//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <errno.h>
#include <stdint.h>
#include <sys/types.h>
#include <signal.h>
#include <unistd.h>

static int clawdesk_copy_sint64(CFDictionaryRef dictionary, CFStringRef key, int64_t *value) {
	CFNumberRef number = (CFNumberRef)CFDictionaryGetValue(dictionary, key);
	if (number == NULL) return 0;
	return CFNumberGetValue(number, kCFNumberSInt64Type, value) ? 1 : 0;
}

static int clawdesk_window_for_pid_at_point(pid_t pid, CGPoint point, int64_t *window_number) {
	CFArrayRef windows = CGWindowListCopyWindowInfo(
		kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
		kCGNullWindowID
	);
	if (windows == NULL) return -1;

	int found = 0;
	CFIndex count = CFArrayGetCount(windows);
	for (CFIndex index = 0; index < count; index++) {
		CFDictionaryRef window = (CFDictionaryRef)CFArrayGetValueAtIndex(windows, index);
		int64_t owner_pid = 0;
		int64_t layer = -1;
		int64_t number = 0;
		if (!clawdesk_copy_sint64(window, kCGWindowOwnerPID, &owner_pid) || owner_pid != pid) continue;
		if (!clawdesk_copy_sint64(window, kCGWindowLayer, &layer) || layer != 0) continue;
		if (!clawdesk_copy_sint64(window, kCGWindowNumber, &number) || number <= 0) continue;

		CFDictionaryRef bounds_value = (CFDictionaryRef)CFDictionaryGetValue(window, kCGWindowBounds);
		CGRect bounds = CGRectZero;
		if (bounds_value == NULL || !CGRectMakeWithDictionaryRepresentation(bounds_value, &bounds)) continue;
		if (bounds.size.width <= 0 || bounds.size.height <= 0) continue;
		if (point.x < CGRectGetMinX(bounds) || point.x >= CGRectGetMaxX(bounds)) continue;
		if (point.y < CGRectGetMinY(bounds) || point.y >= CGRectGetMaxY(bounds)) continue;

		*window_number = number;
		found = 1;
		break;
	}

	CFRelease(windows);
	return found;
}

// CGEventPostToPid and CGEventPostToPSN can report success while AppKit drops
// the targeted mouse-button pair on macOS 12. Resolve the element from the
// caller-supplied PID and global point, verify that it supports AXPress, and
// perform that single target-process action instead. This never chooses a
// receiver from whichever application happens to be frontmost.
static int clawdesk_post_left_click_to_pid(pid_t pid, double x, double y) {
	if (!CGPreflightPostEventAccess()) return 1;
	if (kill(pid, 0) != 0 && errno != EPERM) return 2;

	CGPoint point = CGPointMake(x, y);
	CGDirectDisplayID display = kCGNullDirectDisplay;
	uint32_t display_count = 0;
	if (CGGetDisplaysWithPoint(point, 1, &display, &display_count) != kCGErrorSuccess) return 3;
	if (display_count == 0) return 4;

	int64_t window_number = 0;
	int window_status = clawdesk_window_for_pid_at_point(pid, point, &window_number);
	if (window_status < 0) return 5;
	if (window_status == 0) return 6;
	(void)window_number;

	AXUIElementRef application = AXUIElementCreateApplication(pid);
	if (application == NULL) return 7;
	AXUIElementRef element = NULL;
	AXError hit_error = AXUIElementCopyElementAtPosition(
		application, (float)x, (float)y, &element
	);
	CFRelease(application);
	if (hit_error != kAXErrorSuccess || element == NULL) {
		if (element != NULL) CFRelease(element);
		return 8;
	}

	pid_t element_pid = 0;
	if (AXUIElementGetPid(element, &element_pid) != kAXErrorSuccess || element_pid != pid) {
		CFRelease(element);
		return 9;
	}

	CFArrayRef actions = NULL;
	if (AXUIElementCopyActionNames(element, &actions) != kAXErrorSuccess || actions == NULL) {
		if (actions != NULL) CFRelease(actions);
		CFRelease(element);
		return 10;
	}
	Boolean supports_press = CFArrayContainsValue(
		actions,
		CFRangeMake(0, CFArrayGetCount(actions)),
		kAXPressAction
	);
	CFRelease(actions);
	if (!supports_press) {
		CFRelease(element);
		return 11;
	}

	if (CGWarpMouseCursorPosition(point) != kCGErrorSuccess) {
		CFRelease(element);
		return 12;
	}
	usleep(50000);
	AXError press_error = AXUIElementPerformAction(element, kAXPressAction);
	CFRelease(element);
	if (press_error != kAXErrorSuccess) return 13;
	return 0;
}
*/
import "C"

import "fmt"

func clickForPIDPlatform(processID int32, x, y float64) error {
	status := int(C.clawdesk_post_left_click_to_pid(C.pid_t(processID), C.double(x), C.double(y)))
	switch status {
	case 0:
		return nil
	case 1:
		return fmt.Errorf("macOS Accessibility event-posting permission is unavailable")
	case 2:
		return fmt.Errorf("target process %d is unavailable", processID)
	case 3:
		return fmt.Errorf("failed to query the display for click point (%g, %g)", x, y)
	case 4:
		return fmt.Errorf("click point (%g, %g) is outside all active displays", x, y)
	case 5:
		return fmt.Errorf("failed to inspect visible windows for process %d", processID)
	case 6:
		return fmt.Errorf("process %d has no visible window at click point (%g, %g)", processID, x, y)
	case 7:
		return fmt.Errorf("failed to create an Accessibility application element for process %d", processID)
	case 8:
		return fmt.Errorf("process %d has no Accessibility element at click point (%g, %g)", processID, x, y)
	case 9:
		return fmt.Errorf("Accessibility hit test at (%g, %g) did not resolve to process %d", x, y, processID)
	case 10:
		return fmt.Errorf("failed to inspect Accessibility actions at click point (%g, %g)", x, y)
	case 11:
		return fmt.Errorf("Accessibility element at click point (%g, %g) does not support press", x, y)
	case 12:
		return fmt.Errorf("failed to move the pointer to click point (%g, %g)", x, y)
	case 13:
		return fmt.Errorf("Accessibility press failed for process %d at click point (%g, %g)", processID, x, y)
	default:
		return fmt.Errorf("PID-targeted mouse click failed with status %d", status)
	}
}
