//go:build darwin
// +build darwin

package automation

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation -framework Foundation -framework IOKit
#include <stdlib.h>
#include <stdbool.h>
#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#import <Foundation/Foundation.h>

bool tm_ax_is_trusted() {
	return AXIsProcessTrusted();
}

bool tm_ax_request_with_prompt() {
	const void *keys[] = { kAXTrustedCheckOptionPrompt };
	const void *vals[] = { kCFBooleanTrue };
	CFDictionaryRef opts = CFDictionaryCreate(
		kCFAllocatorDefault,
		keys,
		vals,
		1,
		&kCFTypeDictionaryKeyCallBacks,
		&kCFTypeDictionaryValueCallBacks
	);
	bool trusted = AXIsProcessTrustedWithOptions(opts);
	if (opts != NULL) {
		CFRelease(opts);
	}
	return trusted;
}

bool tm_screen_preflight() {
	return CGPreflightScreenCaptureAccess();
}

bool tm_screen_request() {
	return CGRequestScreenCaptureAccess();
}

int tm_input_monitoring_status() {
	if (@available(macOS 10.15, *)) {
		switch (IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)) {
			case kIOHIDAccessTypeGranted: return 1;
			case kIOHIDAccessTypeDenied: return 0;
			default: return -1;
		}
	}
	return -1;
}

bool tm_input_monitoring_request() {
	if (@available(macOS 10.15, *)) {
		return IOHIDRequestAccess(kIOHIDRequestTypeListenEvent);
	}
	return false;
}

bool tm_trigger_appleevents_prompt(const char *targetApp) {
	@autoreleasepool {
		NSString *target = @"Finder";
		if (targetApp != NULL && strlen(targetApp) > 0) {
			target = [NSString stringWithUTF8String:targetApp];
		}
		NSString *source = [NSString stringWithFormat:
			@"tell application \"%@\" to activate",
			target
		];
		NSAppleScript *script = [[NSAppleScript alloc] initWithSource:source];
		NSDictionary *errorInfo = nil;
		NSAppleEventDescriptor *result = [script executeAndReturnError:&errorInfo];
		return result != nil;
	}
}
*/
import "C"

import "unsafe"

func darwinAccessibilityStatus() bool {
	return bool(C.tm_ax_is_trusted())
}

func darwinRequestAccessibilityPrompt() bool {
	return bool(C.tm_ax_request_with_prompt())
}

func darwinScreenCaptureStatus() bool {
	return bool(C.tm_screen_preflight())
}

func darwinRequestScreenCapturePrompt() bool {
	return bool(C.tm_screen_request())
}

func darwinInputMonitoringStatus() string {
	switch int(C.tm_input_monitoring_status()) {
	case 1:
		return "granted"
	case 0:
		return "denied"
	default:
		return "unknown"
	}
}

func darwinRequestInputMonitoringPrompt() bool {
	return bool(C.tm_input_monitoring_request())
}

func darwinTriggerAppleEventsPrompt(targetApp string) bool {
	cTarget := C.CString(targetApp)
	defer C.free(unsafe.Pointer(cTarget))
	return bool(C.tm_trigger_appleevents_prompt(cTarget))
}

func TriggerMacAutomationPermissionHelper(targetApp string) bool {
	return darwinTriggerAppleEventsPrompt(targetApp)
}
