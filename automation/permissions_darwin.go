//go:build darwin
// +build darwin

package automation

/*
#cgo darwin CFLAGS: -x objective-c
#cgo darwin LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation -framework Foundation -framework IOKit
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
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

import (
	"fmt"
	"os/exec"
	"strings"
	"unsafe"
)

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

type macOSPermissionProvider struct{}

func newPermissionProvider() permissionProvider {
	return macOSPermissionProvider{}
}

func (macOSPermissionProvider) Check(id PermissionID, target string) permissionProbe {
	switch id {
	case PermissionAccessibility:
		trusted := darwinAccessibilityStatus()
		status := PermissionUnknown
		remediation := "Open System Settings and allow OpenDesk under Accessibility."
		if trusted {
			status = PermissionGranted
			remediation = ""
		}
		return permissionProbe{Status: status, Remediation: remediation, Evidence: map[string]any{
			"api": "AXIsProcessTrusted", "trusted": trusted,
		}}
	case PermissionScreenCapture:
		granted := darwinScreenCaptureStatus()
		status := PermissionUnknown
		remediation := "Open System Settings and allow OpenDesk under Screen & System Audio Recording."
		if granted {
			status = PermissionGranted
			remediation = ""
		}
		return permissionProbe{Status: status, Remediation: remediation, Evidence: map[string]any{
			"api": "CGPreflightScreenCaptureAccess", "granted": granted,
		}}
	case PermissionInputMonitoring:
		raw := darwinInputMonitoringStatus()
		status := PermissionUnknown
		switch raw {
		case "granted":
			status = PermissionGranted
		case "denied":
			status = PermissionDenied
		}
		remediation := ""
		if status != PermissionGranted {
			remediation = "Input Monitoring is needed only for recorder features that listen to global input. Enable it in System Settings when those features are required."
		}
		return permissionProbe{Status: status, Remediation: remediation, Evidence: map[string]any{
			"api": "IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)", "result": raw,
		}}
	case PermissionAutomation:
		evidence := map[string]any{"scope": "target-application", "checkSideEffects": "not-probed"}
		if target != "" {
			evidence["targetApp"] = target
		}
		return permissionProbe{
			Status: PermissionUnknown,
			Remediation: "Automation is requested on demand for a specific target application. OpenDesk does not probe Apple Events at startup because probing can itself trigger consent.",
			Evidence: evidence,
		}
	default:
		return permissionProbe{Status: PermissionUnsupported, Remediation: fmt.Sprintf("Unknown macOS permission %q.", id)}
	}
}

func (p macOSPermissionProvider) Request(id PermissionID, target string) (permissionProbe, error) {
	switch id {
	case PermissionAccessibility:
		if !darwinAccessibilityStatus() {
			_ = darwinRequestAccessibilityPrompt()
		}
		return p.Check(id, target), nil
	case PermissionScreenCapture:
		if !darwinScreenCaptureStatus() {
			_ = darwinRequestScreenCapturePrompt()
		}
		return p.Check(id, target), nil
	case PermissionInputMonitoring:
		if darwinInputMonitoringStatus() != "granted" {
			_ = darwinRequestInputMonitoringPrompt()
		}
		return p.Check(id, target), nil
	case PermissionAutomation:
		target = strings.TrimSpace(target)
		if target == "" {
			return p.Check(id, target), fmt.Errorf("automation permission requires a target application, for example automation:Finder")
		}
		if darwinTriggerAppleEventsPrompt(target) {
			return permissionProbe{Status: PermissionGranted, Evidence: map[string]any{
				"api": "NSAppleScript/AppleEvents", "targetApp": target, "requestSucceeded": true,
			}}, nil
		}
		probe := p.Check(id, target)
		probe.Evidence["requestSucceeded"] = false
		probe.Remediation = "The Apple Events request did not succeed. Review Automation access for this target application in System Settings, then retry the real operation."
		return probe, nil
	default:
		return p.Check(id, target), fmt.Errorf("unknown permission id %q", id)
	}
}

func (macOSPermissionProvider) OpenSettings(id PermissionID) error {
	urls := map[PermissionID]string{
		PermissionAccessibility:   "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
		PermissionScreenCapture:   "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
		PermissionInputMonitoring: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
		PermissionAutomation:      "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
	}
	url, ok := urls[id]
	if !ok {
		return fmt.Errorf("unknown macOS permission id %q", id)
	}
	if err := exec.Command("/usr/bin/open", url).Run(); err == nil {
		return nil
	} else {
		fallback := "x-apple.systempreferences:com.apple.preference.security"
		if fallbackErr := exec.Command("/usr/bin/open", fallback).Run(); fallbackErr != nil {
			return fmt.Errorf("open macOS permission settings for %q: deep link failed: %v; fallback failed: %w", id, err, fallbackErr)
		}
	}
	return nil
}
