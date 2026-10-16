//go:build darwin && cgo

package automation

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestDarwinSetValueAcceptsMissingEnabledOnlyAsNotExplicitlyDisabled(t *testing.T) {
	if err := requireDarwinSetValueNotDisabled(darwinAXInspection{}); err != nil {
		t.Fatalf("standard writable AXTextArea may omit AXEnabled: %v", err)
	}
	enabled := true
	if err := requireDarwinSetValueNotDisabled(darwinAXInspection{Enabled: &enabled}); err != nil {
		t.Fatalf("enabled text input rejected: %v", err)
	}
	disabled := false
	err := requireDarwinSetValueNotDisabled(darwinAXInspection{Enabled: &disabled})
	var accessibilityErr *AccessibilityError
	if !errors.As(err, &accessibilityErr) || accessibilityErr.Code != AccessibilityElementDisabled || accessibilityErr.ActionState != AccessibilityActionNotStarted {
		t.Fatalf("disabled text input error=%#v", err)
	}
}

func TestDarwinPopUpButtonIsSelectableThroughAnExplicitWritableValue(t *testing.T) {
	if got := normalizeDarwinAXRole("AXPopUpButton"); got != "popUpButton" {
		t.Fatalf("normalized popup role = %q", got)
	}
	valueSettable := true
	nativeRole := "AXPopUpButton"
	node := (darwinAXInspection{NativeRole: &nativeRole, ValueSettable: valueSettable}).node()
	if node.Role != "popUpButton" {
		t.Fatalf("node role = %q", node.Role)
	}
	seen := false
	for _, action := range node.Actions {
		if action == "setValue" {
			seen = true
			break
		}
	}
	if !seen {
		t.Fatalf("writable popup actions = %#v", node.Actions)
	}
}

// Exercise the Objective-C bridge with an in-process provider seam. This does
// not query the desktop or replace the public JS Runtime API regression gate.
func TestDarwinAXOptionalButtonSubroleNativeSeam(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate native bridge source")
	}
	root := filepath.Dir(filepath.Dir(filename))
	outputRoot := filepath.Join(root, ".runtime", "tests", "accessibility-native")
	if err := os.MkdirAll(outputRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(outputRoot, "optional-subrole-")
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(dir, "seam.m")
	if err := os.WriteFile(source, []byte(darwinAXOptionalSubroleSeam), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	binary := filepath.Join(dir, "seam")
	include := "-DOPENDESK_AX_SOURCE=" + `"` + filepath.Join(root, "automation", "accessibility_backend_darwin.m") + `"`
	cmd := exec.CommandContext(ctx, "xcrun", "clang", "-fobjc-arc", "-Wall", "-Wextra", "-Werror", include,
		"-framework", "ApplicationServices", "-framework", "Foundation", source, "-o", binary)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("compile native seam: %v\n%s", err, output)
	}
	if output, err := exec.CommandContext(ctx, binary).CombinedOutput(); err != nil {
		t.Fatalf("native seam: %v\n%s", err, output)
	}
}

func TestDarwinAXFailureKeepsSubmissionState(t *testing.T) {
	for _, attempted := range []bool{false, true} {
		err := darwinAXStatusError(context.Background(), -25200, "invoke", attempted)
		var axErr *AccessibilityError
		want := AccessibilityActionNotStarted
		if attempted {
			want = AccessibilityActionUnknown
		}
		if !errors.As(err, &axErr) || axErr.Code != AccessibilityBackendFailed || axErr.ActionState != want {
			t.Fatalf("attempted=%v error=%#v", attempted, err)
		}
	}
}

const darwinAXOptionalSubroleSeam = `
#import <ApplicationServices/ApplicationServices.h>
#import <Foundation/Foundation.h>
#include <assert.h>
#include <string.h>

static CFStringRef role;
static AXError subroleStatus;
static CFTypeRef subroleValue;
static CFStringRef failedAttribute;
static int valueReads;
static int actionCalls;

static AXError fakeCopy(AXUIElementRef element, CFStringRef attribute, CFTypeRef *value) {
    (void)element;
    *value = NULL;
    if (failedAttribute && CFEqual(attribute, failedAttribute)) return kAXErrorFailure;
    if (CFEqual(attribute, kAXRoleAttribute)) { *value = CFRetain(role); return kAXErrorSuccess; }
    if (CFEqual(attribute, kAXSubroleAttribute)) {
        if (subroleStatus == kAXErrorSuccess && subroleValue) *value = CFRetain(subroleValue);
        return subroleStatus;
    }
    if (CFEqual(attribute, kAXEnabledAttribute)) { *value = CFRetain(kCFBooleanTrue); return kAXErrorSuccess; }
    if (CFEqual(attribute, kAXValueAttribute)) valueReads++;
    return kAXErrorAttributeUnsupported;
}
static AXError fakeTimeout(AXUIElementRef element, float timeout) {
    (void)element; (void)timeout; return kAXErrorSuccess;
}
static AXError fakeSettable(AXUIElementRef element, CFStringRef attribute, Boolean *settable) {
    (void)element; (void)attribute; *settable = false; return kAXErrorSuccess;
}
static AXError fakeActions(AXUIElementRef element, CFArrayRef *actions) {
    (void)element;
    CFStringRef action = kAXPressAction;
    *actions = CFArrayCreate(NULL, (const void **)&action, 1, &kCFTypeArrayCallBacks);
    return kAXErrorSuccess;
}
static AXError fakePerform(AXUIElementRef element, CFStringRef action) {
    (void)element; (void)action; actionCalls++; return kAXErrorFailure;
}
#define AXUIElementCopyAttributeValue fakeCopy
#define AXUIElementSetMessagingTimeout fakeTimeout
#define AXUIElementIsAttributeSettable fakeSettable
#define AXUIElementCopyActionNames fakeActions
#define AXUIElementPerformAction fakePerform
#include OPENDESK_AX_SOURCE

static void inspectExpect(int expected) {
    char *json = NULL;
    int status = opendesk_ax_inspect_json(1, 1, 1, &json);
    assert(status == expected);
    if (expected == kAXErrorSuccess) {
        assert(json != NULL);
        NSData *data = [NSData dataWithBytes:json length:strlen(json)];
        NSDictionary *node = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        assert([node[@"subrole"] isEqual:[NSNull null]]);
        assert([node[@"secure"] boolValue] == NO);
        assert([node[@"nativeRole"] isEqual:(__bridge id)role]);
    } else {
        assert(json == NULL);
    }
    free(json);
}
int main(void) { @autoreleasepool {
    role = kAXButtonRole;
    subroleStatus = kAXErrorFailure;
    inspectExpect(kAXErrorSuccess);
    const AXError failures[] = {kAXErrorCannotComplete, kAXErrorInvalidUIElement, kAXErrorAPIDisabled, kAXErrorNotImplemented};
    for (unsigned i = 0; i < sizeof(failures)/sizeof(failures[0]); i++) {
        subroleStatus = failures[i]; inspectExpect(failures[i]);
    }
    subroleStatus = kAXErrorFailure;
    role = kAXTextFieldRole;
    inspectExpect(kAXErrorFailure);
    role = kAXStaticTextRole;
    inspectExpect(kAXErrorFailure);
    role = kAXButtonRole;
    failedAttribute = kAXIdentifierAttribute;
    inspectExpect(kAXErrorFailure);
    failedAttribute = kAXEnabledAttribute;
    inspectExpect(kAXErrorFailure);
    failedAttribute = NULL;
    subroleStatus = kAXErrorSuccess;
    subroleValue = kCFBooleanTrue;
    inspectExpect(OPENDESK_AX_STATUS_TYPE_MISMATCH);
    role = kAXTextFieldRole;
    subroleValue = kAXSecureTextFieldSubrole;
    valueReads = 0;
    inspectExpect(OPENDESK_AX_STATUS_PROTECTED_VALUE);
    assert(valueReads == 0);
    role = kAXButtonRole;
    subroleStatus = kAXErrorFailure;
    subroleValue = NULL;
    int32_t attempted = 0, satisfied = 0;
    assert(opendesk_ax_set_string_value(1, 1, "x", 1, &attempted, &satisfied) == kAXErrorFailure);
    assert(attempted == 0 && satisfied == 0);
    assert(opendesk_ax_perform_action(1, OPENDESK_AX_ACTION_PRESS, 1, &attempted) == kAXErrorFailure);
    assert(attempted == 1 && actionCalls == 1);
    return 0;
} }
`
