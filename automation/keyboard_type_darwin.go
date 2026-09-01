//go:build darwin

package automation

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreFoundation
#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdlib.h>

static int opendesk_type_utf8(const char *text) {
    CFStringRef string = CFStringCreateWithCString(kCFAllocatorDefault, text, kCFStringEncodingUTF8);
    if (string == NULL) return 1;
    CFIndex length = CFStringGetLength(string);
    UniChar buffer[20];
    for (CFIndex offset = 0; offset < length; offset += 20) {
        CFIndex count = length - offset;
        if (count > 20) count = 20;
        CFStringGetCharacters(string, CFRangeMake(offset, count), buffer);
        CGEventRef down = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)0, true);
        CGEventRef up = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)0, false);
        if (down == NULL || up == NULL) {
            if (down != NULL) CFRelease(down);
            if (up != NULL) CFRelease(up);
            CFRelease(string);
            return 2;
        }
        CGEventKeyboardSetUnicodeString(down, count, buffer);
        CGEventKeyboardSetUnicodeString(up, count, buffer);
        CGEventPost(kCGHIDEventTap, down);
        CGEventPost(kCGHIDEventTap, up);
        CFRelease(down);
        CFRelease(up);
    }
    CFRelease(string);
    return 0;
}

static int opendesk_type_utf8_for_pid(int pid, const char *text) {
    AXUIElementRef application = AXUIElementCreateApplication((pid_t)pid);
    if (application == NULL) return 1;
    CFTypeRef focusedValue = NULL;
    AXError focusedError = AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute, &focusedValue);
    CFRelease(application);
    if (focusedError != kAXErrorSuccess || focusedValue == NULL || CFGetTypeID(focusedValue) != AXUIElementGetTypeID()) {
        if (focusedValue != NULL) CFRelease(focusedValue);
        return 2;
    }
    AXUIElementRef focused = (AXUIElementRef)focusedValue;
    pid_t focusedPID = 0;
    if (AXUIElementGetPid(focused, &focusedPID) != kAXErrorSuccess || focusedPID != (pid_t)pid) {
        CFRelease(focusedValue);
        return 3;
    }
    CFTypeRef roleValue = NULL;
    AXError roleError = AXUIElementCopyAttributeValue(focused, kAXRoleAttribute, &roleValue);
    if (roleError != kAXErrorSuccess || roleValue == NULL || CFGetTypeID(roleValue) != CFStringGetTypeID() ||
        (!CFEqual(roleValue, kAXTextAreaRole) && !CFEqual(roleValue, kAXTextFieldRole))) {
        if (roleValue != NULL) CFRelease(roleValue);
        CFRelease(focusedValue);
        return 4;
    }
    CFRelease(roleValue);
    CFStringRef string = CFStringCreateWithCString(kCFAllocatorDefault, text, kCFStringEncodingUTF8);
    if (string == NULL) {
        CFRelease(focusedValue);
        return 5;
    }
    AXError setError = AXUIElementSetAttributeValue(focused, kAXSelectedTextAttribute, string);
    CFRelease(string);
    CFRelease(focusedValue);
    return setError == kAXErrorSuccess ? 0 : 100 + (int)setError;
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

func typeText(text string) error {
	cText := C.CString(text)
	defer C.free(unsafe.Pointer(cText))
	if code := int(C.opendesk_type_utf8(cText)); code != 0 {
		return fmt.Errorf("native macOS Unicode typing failed with code %d", code)
	}
	return nil
}

func typeTextForPID(processID int, text string) error {
	cText := C.CString(text)
	defer C.free(unsafe.Pointer(cText))
	if code := int(C.opendesk_type_utf8_for_pid(C.int(processID), cText)); code != 0 {
		return fmt.Errorf("PID-scoped native macOS Unicode typing failed with code %d", code)
	}
	return nil
}
