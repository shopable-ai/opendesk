//go:build darwin && cgo

// native-window-observer records WindowServer evidence for a window that was
// created by a public JavaScript Dialog smoke. It never creates, manipulates,
// or closes a window; those actions remain in the public runtime script.
package main

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static int copy_number(CFDictionaryRef dictionary, CFStringRef key, int64_t *out) {
	CFNumberRef value = (CFNumberRef)CFDictionaryGetValue(dictionary, key);
	if (value == NULL) return 0;
	return CFNumberGetValue(value, kCFNumberSInt64Type, out) ? 1 : 0;
}

static int copy_bool(CFDictionaryRef dictionary, CFStringRef key, int *out) {
	CFBooleanRef value = (CFBooleanRef)CFDictionaryGetValue(dictionary, key);
	if (value == NULL) return 0;
	*out = CFBooleanGetValue(value) ? 1 : 0;
	return 1;
}

static int dialog_window_evidence(
	int pid, int64_t wanted_window_id,
	int64_t *window_id, int64_t *owner_pid, int64_t *layer, int *on_screen,
	double *alpha, double *x, double *y, double *width, double *height,
	int64_t *display_id, double *display_x, double *display_y,
	double *display_width, double *display_height
) {
	CFArrayRef rows = CGWindowListCopyWindowInfo(
		kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
		kCGNullWindowID
	);
	if (rows == NULL) return 0;
	CFIndex count = CFArrayGetCount(rows);
	int found = 0;
	for (CFIndex index = 0; index < count; index++) {
		CFDictionaryRef row = (CFDictionaryRef)CFArrayGetValueAtIndex(rows, index);
		int64_t found_pid = 0, found_window_id = 0, found_layer = 0;
		if (!copy_number(row, kCGWindowOwnerPID, &found_pid) || found_pid != pid) continue;
		if (!copy_number(row, kCGWindowNumber, &found_window_id) || found_window_id <= 0) continue;
		if (wanted_window_id > 0 && found_window_id != wanted_window_id) continue;
		if (!copy_number(row, kCGWindowLayer, &found_layer)) continue;
		CFDictionaryRef raw_bounds = (CFDictionaryRef)CFDictionaryGetValue(row, kCGWindowBounds);
		CGRect bounds = CGRectZero;
		if (raw_bounds == NULL || !CGRectMakeWithDictionaryRepresentation(raw_bounds, &bounds)) continue;
		int visible = 0;
		(void)copy_bool(row, kCGWindowIsOnscreen, &visible);
		CFNumberRef raw_alpha = (CFNumberRef)CFDictionaryGetValue(row, kCGWindowAlpha);
		double found_alpha = 0;
		if (raw_alpha != NULL) CFNumberGetValue(raw_alpha, kCFNumberDoubleType, &found_alpha);
		*window_id = found_window_id;
		*owner_pid = found_pid;
		*layer = found_layer;
		*on_screen = visible;
		*alpha = found_alpha;
		*x = bounds.origin.x;
		*y = bounds.origin.y;
		*width = bounds.size.width;
		*height = bounds.size.height;
		CGDirectDisplayID displays[16];
		uint32_t display_count = 0;
		if (CGGetDisplaysWithPoint(CGPointMake(CGRectGetMidX(bounds), CGRectGetMidY(bounds)), 16, displays, &display_count) == kCGErrorSuccess && display_count > 0) {
			CGRect display_bounds = CGDisplayBounds(displays[0]);
			*display_id = displays[0];
			*display_x = display_bounds.origin.x;
			*display_y = display_bounds.origin.y;
			*display_width = display_bounds.size.width;
			*display_height = display_bounds.size.height;
		}
		found = 1;
		break;
	}
	CFRelease(rows);
	return found;
}

static int copy_cf_string(CFTypeRef value, char *dst, size_t size) {
	if (dst == NULL || size == 0 || value == NULL || CFGetTypeID(value) != CFStringGetTypeID()) return 0;
	dst[0] = '\0';
	return CFStringGetCString((CFStringRef)value, dst, size, kCFStringEncodingUTF8) ? 1 : 0;
}

static int ax_string_equals(CFTypeRef value, const char *wanted) {
	char actual[512];
	if (!copy_cf_string(value, actual, sizeof(actual))) return 0;
	return strcmp(actual, wanted) == 0;
}

static AXUIElementRef ax_window_for_title(pid_t pid, const char *wanted_title) {
	AXUIElementRef application = AXUIElementCreateApplication(pid);
	if (application == NULL) return NULL;
	CFTypeRef raw_windows = NULL;
	if (AXUIElementCopyAttributeValue(application, kAXWindowsAttribute, &raw_windows) != kAXErrorSuccess || raw_windows == NULL || CFGetTypeID(raw_windows) != CFArrayGetTypeID()) {
		CFRelease(application);
		if (raw_windows) CFRelease(raw_windows);
		return NULL;
	}
	AXUIElementRef match = NULL;
	CFArrayRef windows = (CFArrayRef)raw_windows;
	for (CFIndex index = 0; index < CFArrayGetCount(windows); index++) {
		AXUIElementRef window = (AXUIElementRef)CFArrayGetValueAtIndex(windows, index);
		CFTypeRef title = NULL;
		if (AXUIElementCopyAttributeValue(window, kAXTitleAttribute, &title) == kAXErrorSuccess && ax_string_equals(title, wanted_title)) match = (AXUIElementRef)CFRetain(window);
		if (title) CFRelease(title);
		if (match) break;
	}
	CFRelease(raw_windows);
	CFRelease(application);
	return match;
}

static AXUIElementRef ax_button_for_label(AXUIElementRef element, const char *wanted_label, int *remaining) {
	if (element == NULL || *remaining <= 0) return NULL;
	(*remaining)--;
	CFTypeRef role = NULL;
	CFTypeRef title = NULL;
	int is_button = AXUIElementCopyAttributeValue(element, kAXRoleAttribute, &role) == kAXErrorSuccess && role != NULL && CFEqual(role, kAXButtonRole);
	int matches = is_button && AXUIElementCopyAttributeValue(element, kAXTitleAttribute, &title) == kAXErrorSuccess && title != NULL && ax_string_equals(title, wanted_label);
	if (role) CFRelease(role);
	if (title) CFRelease(title);
	if (matches) return (AXUIElementRef)CFRetain(element);
	CFTypeRef raw_children = NULL;
	if (AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &raw_children) != kAXErrorSuccess || raw_children == NULL || CFGetTypeID(raw_children) != CFArrayGetTypeID()) {
		if (raw_children) CFRelease(raw_children);
		return NULL;
	}
	AXUIElementRef match = NULL;
	CFArrayRef children = (CFArrayRef)raw_children;
	for (CFIndex index = 0; index < CFArrayGetCount(children); index++) {
		match = ax_button_for_label((AXUIElementRef)CFArrayGetValueAtIndex(children, index), wanted_label, remaining);
		if (match) break;
	}
	CFRelease(raw_children);
	return match;
}

static int dialog_ax_button_evidence(int pid, const char *wanted_window_title, const char *wanted_button_title,
	char *window_title, size_t window_title_size, char *button_title, size_t button_title_size,
	double *x, double *y, double *width, double *height, int *supports_press) {
	AXUIElementRef window = ax_window_for_title((pid_t)pid, wanted_window_title);
	if (window == NULL) return 0;
	CFTypeRef title = NULL;
	(void)AXUIElementCopyAttributeValue(window, kAXTitleAttribute, &title);
	(void)copy_cf_string(title, window_title, window_title_size);
	if (title) CFRelease(title);
	int remaining = 4096;
	AXUIElementRef button = ax_button_for_label(window, wanted_button_title, &remaining);
	if (button == NULL) { CFRelease(window); return 0; }
	CFTypeRef button_name = NULL;
	(void)AXUIElementCopyAttributeValue(button, kAXTitleAttribute, &button_name);
	(void)copy_cf_string(button_name, button_title, button_title_size);
	if (button_name) CFRelease(button_name);
	CFTypeRef raw_position = NULL;
	CFTypeRef raw_size = NULL;
	CGPoint position = CGPointZero;
	CGSize size = CGSizeZero;
	if (AXUIElementCopyAttributeValue(button, kAXPositionAttribute, &raw_position) != kAXErrorSuccess || raw_position == NULL || !AXValueGetValue((AXValueRef)raw_position, kAXValueCGPointType, &position)) {
		if (raw_position) CFRelease(raw_position); CFRelease(button); CFRelease(window); return 0;
	}
	if (AXUIElementCopyAttributeValue(button, kAXSizeAttribute, &raw_size) != kAXErrorSuccess || raw_size == NULL || !AXValueGetValue((AXValueRef)raw_size, kAXValueCGSizeType, &size)) {
		CFRelease(raw_position); if (raw_size) CFRelease(raw_size); CFRelease(button); CFRelease(window); return 0;
	}
	CFRelease(raw_position); CFRelease(raw_size);
	CFArrayRef actions = NULL;
	*supports_press = AXUIElementCopyActionNames(button, &actions) == kAXErrorSuccess && actions != NULL && CFArrayContainsValue(actions, CFRangeMake(0, CFArrayGetCount(actions)), kAXPressAction);
	if (actions) CFRelease(actions);
	*x = position.x; *y = position.y; *width = size.width; *height = size.height;
	CFRelease(button); CFRelease(window);
	return 1;
}
*/
import "C"

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"unsafe"
)

type bounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type evidence struct {
	HostPID              int                     `json:"hostPid"`
	NativeWindowID       int64                   `json:"nativeWindowId"`
	OnScreen             bool                    `json:"onScreen"`
	Layer                int64                   `json:"layer"`
	Alpha                float64                 `json:"alpha"`
	Bounds               bounds                  `json:"bounds"`
	DisplayID            int64                   `json:"displayId,omitempty"`
	DisplayBounds        bounds                  `json:"displayBounds"`
	CenterOffset         point                   `json:"centerOffset"`
	Accessibility        *accessibilityEvidence  `json:"accessibility,omitempty"`
	AccessibilityButtons []accessibilityEvidence `json:"accessibilityButtons,omitempty"`
}

type point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type accessibilityEvidence struct {
	WindowTitle   string `json:"windowTitle"`
	ButtonTitle   string `json:"buttonTitle"`
	SupportsPress bool   `json:"supportsPress"`
	Bounds        bounds `json:"bounds"`
}

type stringFlags []string

func (values *stringFlags) String() string { return fmt.Sprint([]string(*values)) }

func (values *stringFlags) Set(value string) error {
	*values = append(*values, value)
	return nil
}

func main() {
	pid := flag.Int("pid", 0, "native host process id")
	nativeWindowID := flag.Int64("native-window-id", 0, "optional exact native window id")
	title := flag.String("title", "", "exact native accessibility window title")
	var buttons stringFlags
	flag.Var(&buttons, "button", "exact native accessibility button title; repeat to inspect every action")
	output := flag.String("output", "", "optional JSON evidence path")
	flag.Parse()
	if *pid <= 0 {
		fmt.Fprintln(os.Stderr, "-pid must be positive")
		os.Exit(2)
	}
	var id, ownerPID, layer C.int64_t
	var onScreen C.int
	var displayID C.int64_t
	var alpha, x, y, width, height C.double
	var displayX, displayY, displayWidth, displayHeight C.double
	if C.dialog_window_evidence(C.int(*pid), C.int64_t(*nativeWindowID), &id, &ownerPID, &layer, &onScreen, &alpha, &x, &y, &width, &height, &displayID, &displayX, &displayY, &displayWidth, &displayHeight) == 0 {
		fmt.Fprintln(os.Stderr, "no matching on-screen WindowServer window")
		os.Exit(1)
	}
	result := evidence{
		HostPID: int(ownerPID), NativeWindowID: int64(id), OnScreen: onScreen != 0,
		Layer: int64(layer), Alpha: float64(alpha),
		Bounds:        bounds{X: float64(x), Y: float64(y), Width: float64(width), Height: float64(height)},
		DisplayID:     int64(displayID),
		DisplayBounds: bounds{X: float64(displayX), Y: float64(displayY), Width: float64(displayWidth), Height: float64(displayHeight)},
		CenterOffset: point{
			X: float64(x + width/2 - displayX - displayWidth/2),
			Y: float64(y + height/2 - displayY - displayHeight/2),
		},
	}
	if *title != "" || len(buttons) != 0 {
		if *title == "" || len(buttons) == 0 {
			fmt.Fprintln(os.Stderr, "-title and at least one -button must be supplied together")
			os.Exit(2)
		}
		for _, wantedButton := range buttons {
			windowTitle := make([]byte, 512)
			buttonTitle := make([]byte, 512)
			cWindowTitle := C.CString(*title)
			cButtonTitle := C.CString(wantedButton)
			var buttonX, buttonY, buttonWidth, buttonHeight C.double
			var supportsPress C.int
			found := C.dialog_ax_button_evidence(C.int(*pid), cWindowTitle, cButtonTitle, (*C.char)(unsafe.Pointer(&windowTitle[0])), C.size_t(len(windowTitle)), (*C.char)(unsafe.Pointer(&buttonTitle[0])), C.size_t(len(buttonTitle)), &buttonX, &buttonY, &buttonWidth, &buttonHeight, &supportsPress)
			C.free(unsafe.Pointer(cWindowTitle))
			C.free(unsafe.Pointer(cButtonTitle))
			if found == 0 {
				fmt.Fprintf(os.Stderr, "matching native accessibility button %q was not found\n", wantedButton)
				os.Exit(1)
			}
			item := accessibilityEvidence{
				WindowTitle: cstring(windowTitle), ButtonTitle: cstring(buttonTitle), SupportsPress: supportsPress != 0,
				Bounds: bounds{X: float64(buttonX), Y: float64(buttonY), Width: float64(buttonWidth), Height: float64(buttonHeight)},
			}
			result.AccessibilityButtons = append(result.AccessibilityButtons, item)
		}
		if len(result.AccessibilityButtons) > 0 {
			result.Accessibility = &result.AccessibilityButtons[0]
		}
	}
	if *output != "" {
		file, err := os.Create(*output)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		defer file.Close()
		if err := json.NewEncoder(file).Encode(result); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func cstring(value []byte) string {
	for index, item := range value {
		if item == 0 {
			return string(value[:index])
		}
	}
	return string(value)
}
