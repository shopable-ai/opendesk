//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework ApplicationServices -framework CoreGraphics -framework CoreFoundation -framework Foundation
#include <ApplicationServices/ApplicationServices.h>
#include <stdlib.h>
#include "accessibility_backend_darwin.h"
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync/atomic"
	"time"
	"unsafe"
)

const darwinAccessibilityBackendName = "macos-ax"

type darwinAccessibilityHandle struct {
	element C.uintptr_t
	pid     int64
}

// darwinAccessibilityBackend is used only by AccessibilityRuntime's locked
// native worker. resourceCount is atomic because lifecycle diagnostics may read
// it after cancellation while that worker is returning from a provider call.
type darwinAccessibilityBackend struct {
	initialized   bool
	closed        atomic.Bool
	nextHandle    uint64
	handles       map[uint64]darwinAccessibilityHandle
	resourceCount atomic.Int64
}

type darwinAXNativeBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type darwinAXInspection struct {
	NativeRole       *string               `json:"nativeRole"`
	Subrole          *string               `json:"subrole"`
	Name             *string               `json:"name"`
	Identifier       *string               `json:"identifier"`
	Enabled          *bool                 `json:"enabled"`
	Focused          *bool                 `json:"focused"`
	Selected         *bool                 `json:"selected"`
	Checked          *bool                 `json:"checked"`
	Expanded         *bool                 `json:"expanded"`
	Secure           bool                  `json:"secure"`
	NativeActions    []string              `json:"nativeActions"`
	ValueSettable    bool                  `json:"valueSettable"`
	ExpandedSettable bool                  `json:"expandedSettable"`
	SelectedSettable bool                  `json:"selectedSettable"`
	NativeBounds     *darwinAXNativeBounds `json:"nativeBounds"`
	Value            interface{}           `json:"value"`
	ValueIncluded    bool                  `json:"valueIncluded"`
}

type darwinAXRoot struct {
	element C.uintptr_t
	pid     int64
	owned   bool
}

type darwinAXTraversal struct {
	backend      *darwinAccessibilityBackend
	ctx          context.Context
	limits       AccessibilityLimits
	includeValue bool
	nodes        int
	maxDepth     int
	complete     bool
	truncated    bool
	reason       string
}

func newDefaultAccessibilityBackend() AccessibilityBackend {
	return &darwinAccessibilityBackend{handles: map[uint64]darwinAccessibilityHandle{}}
}

func (b *darwinAccessibilityBackend) Name() string { return darwinAccessibilityBackendName }

// Capabilities performs only the non-prompting trust check. It does not create
// an AX application object or enumerate any desktop/application elements.
func (b *darwinAccessibilityBackend) Capabilities() AccessibilityBackendCapabilities {
	granted := C.opendesk_ax_is_process_trusted() != 0
	status := "permission_denied"
	if granted {
		status = "available"
	}
	return AccessibilityBackendCapabilities{
		Platform:    "darwin",
		Backend:     b.Name(),
		Implemented: true,
		Status:      status,
		Menus:       true,
		Actions: map[string]bool{
			"invoke": true, "setValue": true, "expand": true,
			"collapse": true, "select": true, "setChecked": true,
		},
		Permission: AccessibilityPermissionStatus{
			Required: true, State: map[bool]string{true: "granted", false: "denied"}[granted],
			Granted: granted, Cached: false,
		},
		CoordinateMapping: false,
		Notes:             "element actions remain conditional on current AX actions, writable attributes, and readable state; native bounds are macOS display points and are not projected as OpenDesk screen regions",
	}
}

func (b *darwinAccessibilityBackend) Initialize(ctx context.Context) error {
	if err := darwinAXContextError(ctx, "initialize", false); err != nil {
		return err
	}
	if b.closed.Load() {
		return darwinAXTypedError(AccessibilityCanceled, "initialize", "accessibility backend is closed", nil, AccessibilityActionNotStarted)
	}
	if C.opendesk_ax_is_process_trusted() == 0 {
		return darwinAXTypedError(AccessibilityPermissionDenied, "permission", "macOS Accessibility permission is not granted", nil, AccessibilityActionNotStarted)
	}
	b.initialized = true
	return nil
}

func (b *darwinAccessibilityBackend) ensureReady(ctx context.Context) error {
	if err := darwinAXContextError(ctx, "permission", false); err != nil {
		return err
	}
	if b.closed.Load() {
		return darwinAXTypedError(AccessibilityCanceled, "backend", "accessibility backend is closed", nil, AccessibilityActionNotStarted)
	}
	if !b.initialized {
		if err := b.Initialize(ctx); err != nil {
			return err
		}
	}
	// Permission can be revoked after initialization. Recheck before every real
	// request without asking macOS to display a prompt.
	if C.opendesk_ax_is_process_trusted() == 0 {
		return darwinAXTypedError(AccessibilityPermissionDenied, "permission", "macOS Accessibility permission is not granted", nil, AccessibilityActionNotStarted)
	}
	return nil
}

func darwinAXTypedError(code AccessibilityErrorCode, phase, message string, cause error, state AccessibilityActionState) error {
	return &AccessibilityError{Code: code, Phase: phase, Message: message, Cause: cause, ActionState: state}
}

func darwinAXContextError(ctx context.Context, phase string, attempted bool) error {
	if ctx == nil {
		return nil
	}
	if err := ctx.Err(); err != nil {
		state := AccessibilityActionNotStarted
		if attempted {
			state = AccessibilityActionUnknown
		}
		if err == context.DeadlineExceeded {
			return darwinAXTypedError(AccessibilityTimeout, phase, "macOS Accessibility request timed out", err, state)
		}
		return darwinAXTypedError(AccessibilityCanceled, phase, "macOS Accessibility request was canceled", err, state)
	}
	return nil
}

func darwinAXStatusError(ctx context.Context, status C.int32_t, phase string, attempted bool) error {
	if status == 0 {
		return darwinAXContextError(ctx, phase, attempted)
	}
	if err := darwinAXContextError(ctx, phase, attempted); err != nil {
		return err
	}
	state := AccessibilityActionNotStarted
	// The C bridge sets attempted immediately before the one native mutation.
	// Once that call has been issued, no AX error can prove that it had no side
	// effect, so every failure must prevent an automatic retry.
	if attempted {
		state = AccessibilityActionUnknown
	}
	cause := fmt.Errorf("macOS AX status %d", int32(status))
	switch int32(status) {
	case int32(C.kAXErrorAPIDisabled):
		return darwinAXTypedError(AccessibilityPermissionDenied, phase, "macOS Accessibility API is disabled", cause, state)
	case int32(C.kAXErrorInvalidUIElement):
		return darwinAXTypedError(AccessibilityStaleTarget, phase, "native accessibility element is stale", cause, state)
	case int32(C.kAXErrorCannotComplete):
		return darwinAXTypedError(AccessibilityTimeout, phase, "native accessibility provider did not complete before the request deadline", cause, state)
	case int32(C.kAXErrorActionUnsupported), int32(C.kAXErrorAttributeUnsupported), int32(C.OPENDESK_AX_STATUS_ACTION_UNSUPPORTED):
		return darwinAXTypedError(AccessibilityActionUnsupported, phase, "the native element does not support the requested action", cause, state)
	case int32(C.kAXErrorNotImplemented):
		return darwinAXTypedError(AccessibilityNotSupported, phase, "the target process does not implement the required Accessibility operation", cause, state)
	case int32(C.OPENDESK_AX_STATUS_TARGET_NOT_FOUND), int32(C.kAXErrorNoValue):
		return darwinAXTypedError(AccessibilityTargetNotFound, phase, "native accessibility target is unavailable", cause, state)
	case int32(C.OPENDESK_AX_STATUS_PROTECTED_VALUE):
		return darwinAXTypedError(AccessibilityPermissionDenied, phase, "protected accessibility values cannot be read or modified", cause, state)
	case int32(C.OPENDESK_AX_STATUS_VALUE_UNSUPPORTED):
		return darwinAXTypedError(AccessibilityNotSupported, phase, "the native accessibility value cannot be represented safely", cause, state)
	case int32(C.OPENDESK_AX_STATUS_ELEMENT_DISABLED):
		return darwinAXTypedError(AccessibilityElementDisabled, phase, "the native accessibility element is disabled", cause, state)
	case int32(C.OPENDESK_AX_STATUS_STATE_UNKNOWN):
		return darwinAXTypedError(AccessibilityStateUnknown, phase, "the native accessibility state cannot be determined safely", cause, state)
	default:
		return darwinAXTypedError(AccessibilityBackendFailed, phase, "macOS Accessibility backend failed", cause, state)
	}
}

func darwinAXRemainingTimeout(ctx context.Context) (C.double, error) {
	if err := darwinAXContextError(ctx, "deadline", false); err != nil {
		return 0, err
	}
	remaining := accessibilityDefaultTimeout
	if deadline, ok := ctx.Deadline(); ok {
		remaining = time.Until(deadline)
	}
	if remaining <= 0 {
		return 0, darwinAXTypedError(AccessibilityTimeout, "deadline", "macOS Accessibility request timed out", context.DeadlineExceeded, AccessibilityActionNotStarted)
	}
	if remaining > accessibilityMaximumTimeout {
		remaining = accessibilityMaximumTimeout
	}
	return C.double(remaining.Seconds()), nil
}

func (b *darwinAccessibilityBackend) track(element C.uintptr_t) C.uintptr_t {
	if element != 0 {
		b.resourceCount.Add(1)
	}
	return element
}

func (b *darwinAccessibilityBackend) releaseNative(element C.uintptr_t) {
	if element == 0 {
		return
	}
	C.opendesk_ax_release_element(element)
	b.resourceCount.Add(-1)
}

func (b *darwinAccessibilityBackend) releaseAll(elements []C.uintptr_t) {
	for _, element := range elements {
		b.releaseNative(element)
	}
}

func (b *darwinAccessibilityBackend) createApplication(ctx context.Context, pid int64) (C.uintptr_t, error) {
	if pid <= 0 || pid > math.MaxInt32 {
		return 0, darwinAXTypedError(AccessibilityInvalidArgument, "scope", "application scope requires a valid PID", nil, AccessibilityActionNotStarted)
	}
	if err := darwinAXContextError(ctx, "scope", false); err != nil {
		return 0, err
	}
	element := b.track(C.opendesk_ax_create_application(C.int32_t(pid)))
	if element == 0 {
		return 0, darwinAXTypedError(AccessibilityTargetNotFound, "scope", "application accessibility root is unavailable", nil, AccessibilityActionNotStarted)
	}
	if err := b.verifyPID(ctx, element, pid); err != nil {
		b.releaseNative(element)
		return 0, err
	}
	return element, nil
}

func (b *darwinAccessibilityBackend) verifyPID(ctx context.Context, element C.uintptr_t, expected int64) error {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return err
	}
	var pid C.int32_t
	status := C.opendesk_ax_element_pid(element, timeout, &pid)
	if err := darwinAXStatusError(ctx, status, "identity", false); err != nil {
		return err
	}
	if expected > 0 && int64(pid) != expected {
		return darwinAXTypedError(AccessibilityStaleTarget, "identity", "native accessibility element no longer belongs to the expected process", nil, AccessibilityActionNotStarted)
	}
	return nil
}

func (b *darwinAccessibilityBackend) copyElementAttribute(ctx context.Context, element C.uintptr_t, attribute C.int32_t) (C.uintptr_t, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return 0, err
	}
	var result C.uintptr_t
	status := C.opendesk_ax_copy_element_attribute(element, attribute, timeout, &result)
	if err := darwinAXStatusError(ctx, status, "scope", false); err != nil {
		return 0, err
	}
	b.track(result)
	if err := darwinAXContextError(ctx, "scope", false); err != nil {
		b.releaseNative(result)
		return 0, err
	}
	return result, nil
}

func (b *darwinAccessibilityBackend) copyElementArray(ctx context.Context, element C.uintptr_t, attribute C.int32_t) ([]C.uintptr_t, bool, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return nil, false, err
	}
	var raw *C.uintptr_t
	var count C.int64_t
	var materialized C.int32_t
	status := C.opendesk_ax_copy_element_array_attribute(element, attribute, timeout, &raw, &count, &materialized)
	if err := darwinAXStatusError(ctx, status, "traversal", false); err != nil {
		return nil, false, err
	}
	if count < 0 || uint64(count) > uint64(math.MaxInt32) {
		if raw != nil {
			C.opendesk_ax_free_element_array(raw)
		}
		return nil, false, darwinAXTypedError(AccessibilityBackendFailed, "traversal", "native accessibility child count is invalid", nil, AccessibilityActionNotStarted)
	}
	results := make([]C.uintptr_t, int(count))
	if count > 0 {
		copy(results, unsafe.Slice(raw, int(count)))
		b.resourceCount.Add(int64(count))
	}
	if raw != nil {
		C.opendesk_ax_free_element_array(raw)
	}
	if err := darwinAXContextError(ctx, "traversal", false); err != nil {
		b.releaseAll(results)
		return nil, false, err
	}
	return results, materialized != 0, nil
}

func (b *darwinAccessibilityBackend) inspect(ctx context.Context, element C.uintptr_t, includeValue bool) (darwinAXInspection, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return darwinAXInspection{}, err
	}
	var raw *C.char
	include := C.int32_t(0)
	if includeValue {
		include = 1
	}
	status := C.opendesk_ax_inspect_json(element, timeout, include, &raw)
	if raw != nil {
		defer C.opendesk_ax_free(unsafe.Pointer(raw))
	}
	if err := darwinAXStatusError(ctx, status, "read", false); err != nil {
		return darwinAXInspection{}, err
	}
	if raw == nil {
		return darwinAXInspection{}, darwinAXTypedError(AccessibilityBackendFailed, "read", "native accessibility inspection returned no data", nil, AccessibilityActionNotStarted)
	}
	var result darwinAXInspection
	if err := json.Unmarshal([]byte(C.GoString(raw)), &result); err != nil {
		return darwinAXInspection{}, darwinAXTypedError(AccessibilityBackendFailed, "read", "native accessibility inspection data is invalid", err, AccessibilityActionNotStarted)
	}
	if err := darwinAXContextError(ctx, "read", false); err != nil {
		return darwinAXInspection{}, err
	}
	return result, nil
}

func darwinAXScopePID(scope AccessibilityScope) int64 {
	if scope.PID > 0 {
		return scope.PID
	}
	if scope.Target.PID > 0 {
		return scope.Target.PID
	}
	if scope.Window != nil {
		return scope.Window.PID
	}
	return 0
}

func (b *darwinAccessibilityBackend) resolveScopeRoot(ctx context.Context, scope AccessibilityScope) (darwinAXRoot, error) {
	if err := b.ensureReady(ctx); err != nil {
		return darwinAXRoot{}, err
	}
	pid := darwinAXScopePID(scope)
	switch scope.Kind {
	case AccessibilityScopeElement:
		handle, err := b.lookupHandle(ctx, scope.ElementHandle)
		if err != nil {
			return darwinAXRoot{}, err
		}
		if pid > 0 && handle.pid != pid {
			return darwinAXRoot{}, darwinAXTypedError(AccessibilityStaleTarget, "identity", "element reference does not belong to the requested scope", nil, AccessibilityActionNotStarted)
		}
		return darwinAXRoot{element: handle.element, pid: handle.pid}, nil
	case AccessibilityScopeApplication:
		application, err := b.createApplication(ctx, pid)
		return darwinAXRoot{element: application, pid: pid, owned: application != 0}, err
	case AccessibilityScopeMenuBar:
		return b.resolveApplicationMenuBar(ctx, pid)
	case AccessibilityScopeWindow:
		return b.resolveWindowRoot(ctx, scope, pid)
	default:
		return darwinAXRoot{}, darwinAXTypedError(AccessibilityInvalidArgument, "scope", "unsupported accessibility scope", nil, AccessibilityActionNotStarted)
	}
}

func (b *darwinAccessibilityBackend) resolveApplicationMenuBar(ctx context.Context, pid int64) (darwinAXRoot, error) {
	application, err := b.createApplication(ctx, pid)
	if err != nil {
		return darwinAXRoot{}, err
	}
	defer b.releaseNative(application)
	menuBar, err := b.copyElementAttribute(ctx, application, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_MENU_BAR)
	if err != nil {
		return darwinAXRoot{}, err
	}
	if err := b.verifyPID(ctx, menuBar, pid); err != nil {
		b.releaseNative(menuBar)
		return darwinAXRoot{}, err
	}
	return darwinAXRoot{element: menuBar, pid: pid, owned: true}, nil
}

func (b *darwinAccessibilityBackend) resolveWindowRoot(ctx context.Context, scope AccessibilityScope, pid int64) (darwinAXRoot, error) {
	if scope.Window == nil || scope.Window.Handle == 0 || scope.Window.PID != pid {
		return darwinAXRoot{}, darwinAXTypedError(AccessibilityStaleTarget, "scope", "window scope has no verified native identity", nil, AccessibilityActionNotStarted)
	}
	application, err := b.createApplication(ctx, pid)
	if err != nil {
		return darwinAXRoot{}, err
	}
	defer b.releaseNative(application)
	windows, materialized, err := b.copyElementArray(ctx, application, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_WINDOWS)
	if err != nil {
		return darwinAXRoot{}, err
	}
	defer b.releaseAll(windows)
	if !materialized {
		return darwinAXRoot{}, darwinAXTypedError(AccessibilityStaleTarget, "scope", "window accessibility hierarchy is unavailable", nil, AccessibilityActionNotStarted)
	}
	matched := -1
	for index, window := range windows {
		inspection, inspectErr := b.inspect(ctx, window, false)
		if inspectErr != nil {
			return darwinAXRoot{}, inspectErr
		}
		bounds := inspection.NativeBounds
		if bounds == nil || bounds.Width <= 0 || bounds.Height <= 0 ||
			bounds.X < math.MinInt32 || bounds.X > math.MaxInt32 || bounds.Y < math.MinInt32 || bounds.Y > math.MaxInt32 ||
			bounds.Width > math.MaxInt32 || bounds.Height > math.MaxInt32 {
			continue
		}
		windowID, identityErr := getMacWindowIDForPIDAndBounds(
			uint32(pid), int32(math.Round(bounds.X)), int32(math.Round(bounds.Y)),
			int32(math.Round(bounds.Width)), int32(math.Round(bounds.Height)),
		)
		if identityErr != nil || uint64(windowID) != scope.Window.Handle {
			continue
		}
		if matched >= 0 {
			return darwinAXRoot{}, darwinAXTypedError(AccessibilityAmbiguousTarget, "scope", "multiple accessibility windows match the verified window identity", nil, AccessibilityActionNotStarted)
		}
		matched = index
	}
	if matched < 0 {
		return darwinAXRoot{}, darwinAXTypedError(AccessibilityStaleTarget, "scope", "verified window is no longer present in the accessibility hierarchy", nil, AccessibilityActionNotStarted)
	}
	selected := windows[matched]
	windows[matched] = 0
	return darwinAXRoot{element: selected, pid: pid, owned: true}, nil
}

// macOS exposes the application menu bar as an application child, not as a
// rectangle-bounded child of an AXWindow. A verified window scope therefore
// contributes its PID/identity but never clips the menu bar to window bounds.
func (b *darwinAccessibilityBackend) resolveMenuRoot(ctx context.Context, scope AccessibilityScope) (darwinAXRoot, error) {
	if scope.Kind == AccessibilityScopeElement || scope.Kind == AccessibilityScopeMenuBar {
		return b.resolveScopeRoot(ctx, scope)
	}
	if scope.Kind != AccessibilityScopeApplication && scope.Kind != AccessibilityScopeWindow {
		return darwinAXRoot{}, darwinAXTypedError(AccessibilityInvalidArgument, "menu_scope", "menu operations require an application, window, menu bar, or element scope", nil, AccessibilityActionNotStarted)
	}
	if err := b.ensureReady(ctx); err != nil {
		return darwinAXRoot{}, err
	}
	return b.resolveApplicationMenuBar(ctx, darwinAXScopePID(scope))
}

func (b *darwinAccessibilityBackend) releaseRoot(root darwinAXRoot) {
	if root.owned {
		b.releaseNative(root.element)
	}
}

func (b *darwinAccessibilityBackend) lookupHandle(ctx context.Context, handle uint64) (darwinAccessibilityHandle, error) {
	if err := b.ensureReady(ctx); err != nil {
		return darwinAccessibilityHandle{}, err
	}
	entry, ok := b.handles[handle]
	if handle == 0 || !ok || entry.element == 0 {
		return darwinAccessibilityHandle{}, darwinAXTypedError(AccessibilityStaleTarget, "reference", "accessibility element reference is stale", nil, AccessibilityActionNotStarted)
	}
	if err := b.verifyPID(ctx, entry.element, entry.pid); err != nil {
		return darwinAccessibilityHandle{}, err
	}
	return entry, nil
}

// storeRetainedHandle takes ownership of one already-retained native element.
func (b *darwinAccessibilityBackend) storeRetainedHandle(element C.uintptr_t, pid int64) (uint64, error) {
	if element == 0 {
		return 0, darwinAXTypedError(AccessibilityBackendFailed, "reference", "cannot retain an empty accessibility element", nil, AccessibilityActionNotStarted)
	}
	if b.closed.Load() {
		b.releaseNative(element)
		return 0, darwinAXTypedError(AccessibilityCanceled, "reference", "accessibility backend is closed", nil, AccessibilityActionNotStarted)
	}
	for {
		b.nextHandle++
		if b.nextHandle == 0 {
			continue
		}
		if _, exists := b.handles[b.nextHandle]; !exists {
			break
		}
	}
	handle := b.nextHandle
	b.handles[handle] = darwinAccessibilityHandle{element: element, pid: pid}
	return handle, nil
}

func (b *darwinAccessibilityBackend) retain(element C.uintptr_t) (C.uintptr_t, error) {
	retained := b.track(C.opendesk_ax_retain_element(element))
	if retained == 0 {
		return 0, darwinAXTypedError(AccessibilityBackendFailed, "reference", "native accessibility element could not be retained", nil, AccessibilityActionNotStarted)
	}
	return retained, nil
}

func normalizeDarwinAccessibilityLimits(limits AccessibilityLimits) AccessibilityLimits {
	if limits.Timeout <= 0 {
		limits.Timeout = accessibilityDefaultTimeout
	}
	if limits.MaxDepth <= 0 {
		limits.MaxDepth = accessibilityDefaultMaxDepth
	}
	if limits.MaxDepth > accessibilityMaximumMaxDepth {
		limits.MaxDepth = accessibilityMaximumMaxDepth
	}
	if limits.MaxNodes <= 0 {
		limits.MaxNodes = accessibilityDefaultMaxNodes
	}
	if limits.MaxNodes > accessibilityMaximumMaxNodes {
		limits.MaxNodes = accessibilityMaximumMaxNodes
	}
	return limits
}

func newDarwinAXTraversal(backend *darwinAccessibilityBackend, ctx context.Context, limits AccessibilityLimits) *darwinAXTraversal {
	limits = normalizeDarwinAccessibilityLimits(limits)
	includeValue := false
	for _, property := range limits.Properties {
		if property == "value" {
			includeValue = true
			break
		}
	}
	return &darwinAXTraversal{backend: backend, ctx: ctx, limits: limits, includeValue: includeValue, complete: true}
}

func (t *darwinAXTraversal) markIncomplete(reason string, truncated bool) {
	t.complete = false
	if t.reason == "" {
		t.reason = reason
	}
	if truncated {
		t.truncated = true
	}
}

func darwinAXString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func normalizeDarwinAXRole(nativeRole string) string {
	switch nativeRole {
	case "AXApplication":
		return "application"
	case "AXWindow":
		return "window"
	case "AXMenuBar":
		return "menuBar"
	case "AXMenu":
		return "menu"
	case "AXMenuItem", "AXMenuBarItem":
		return "menuItem"
	case "AXButton":
		return "button"
	case "AXCheckBox":
		return "checkbox"
	case "AXRadioButton":
		return "radioButton"
	case "AXTextField", "AXTextArea":
		return "textField"
	case "AXStaticText":
		return "staticText"
	case "AXList":
		return "list"
	case "AXTable":
		return "table"
	case "AXRow":
		return "row"
	case "AXCell":
		return "cell"
	case "AXGroup":
		return "group"
	default:
		return "unknown"
	}
}

func (inspection darwinAXInspection) supportsNativeAction(action string) bool {
	for _, candidate := range inspection.NativeActions {
		if candidate == action {
			return true
		}
	}
	return false
}

func appendUniqueAccessibilityAction(actions []string, action string) []string {
	for _, existing := range actions {
		if existing == action {
			return actions
		}
	}
	return append(actions, action)
}

func (inspection darwinAXInspection) publicActions() []string {
	actions := []string{}
	role := normalizeDarwinAXRole(darwinAXString(inspection.NativeRole))
	if inspection.supportsNativeAction("AXPress") && role != "checkbox" && role != "radioButton" {
		actions = appendUniqueAccessibilityAction(actions, "invoke")
	}
	// AXPress is a one-way selection operation for a radio button. Expose the
	// semantic select action, not invoke/toggle, and still re-read its AXValue
	// immediately before deciding whether input is needed.
	if role == "radioButton" && inspection.supportsNativeAction("AXPress") && inspection.Selected != nil {
		actions = appendUniqueAccessibilityAction(actions, "select")
	}
	if !inspection.Secure {
		if role == "checkbox" && (inspection.ValueSettable || inspection.supportsNativeAction("AXPress")) {
			actions = appendUniqueAccessibilityAction(actions, "setChecked")
		} else if role == "textField" && inspection.ValueSettable {
			actions = appendUniqueAccessibilityAction(actions, "setValue")
		}
	}
	if inspection.Expanded != nil && inspection.ExpandedSettable {
		actions = appendUniqueAccessibilityAction(actions, "expand")
		actions = appendUniqueAccessibilityAction(actions, "collapse")
	}
	if role == "menuItem" && inspection.supportsNativeAction("AXShowMenu") {
		actions = appendUniqueAccessibilityAction(actions, "expand")
	}
	if inspection.SelectedSettable && role != "menuItem" {
		actions = appendUniqueAccessibilityAction(actions, "select")
	}
	return actions
}

func (inspection darwinAXInspection) node() AccessibilityNode {
	nativeRole := darwinAXString(inspection.NativeRole)
	node := AccessibilityNode{
		Role:          normalizeDarwinAXRole(nativeRole),
		NativeRole:    nativeRole,
		Name:          inspection.Name,
		Identifier:    inspection.Identifier,
		Enabled:       inspection.Enabled,
		Focused:       inspection.Focused,
		Selected:      inspection.Selected,
		Checked:       inspection.Checked,
		Expanded:      inspection.Expanded,
		Actions:       inspection.publicActions(),
		Value:         inspection.Value,
		ValueIncluded: inspection.ValueIncluded,
	}
	if inspection.NativeBounds != nil {
		node.NativeBounds = &AccessibilityNativeBounds{
			X: inspection.NativeBounds.X, Y: inspection.NativeBounds.Y,
			Width: inspection.NativeBounds.Width, Height: inspection.NativeBounds.Height,
			CoordinateSpace: "macos-global-display-points-top-left",
		}
	}
	// AX points are intentionally not copied into the OpenDesk mouse/screen
	// coordinate model. Mixed-scale conversion is not proven in this backend.
	node.Bounds = nil
	return node
}

func (inspection darwinAXInspection) mayHaveUnmaterializedChildren() bool {
	nativeRole := darwinAXString(inspection.NativeRole)
	role := normalizeDarwinAXRole(nativeRole)
	switch role {
	case "application", "window", "menuBar", "menu", "group", "list", "table", "row":
		return true
	}
	// AXMenuBarItem represents a submenu-bearing top-level item. A leaf
	// AXMenuItem with no AXChildren is complete unless it advertises an expand
	// mechanism; treating every menu item as lazy would make every ordinary
	// menu snapshot permanently incomplete.
	if nativeRole == "AXMenuBarItem" {
		return true
	}
	if role == "menuItem" {
		return inspection.ExpandedSettable || inspection.supportsNativeAction("AXShowMenu")
	}
	return false
}

// Reading AXChildren from a collapsed AppKit menu can call NSMenuDelegate and
// materialize lazy items even though no expand action was requested. Treat a
// submenu-capable item as an observation boundary until native state proves it
// is already open.
func (inspection darwinAXInspection) deferCollapsedMenuChildren() bool {
	nativeRole := darwinAXString(inspection.NativeRole)
	if nativeRole != "AXMenuBarItem" && nativeRole != "AXMenuItem" {
		return false
	}
	if inspection.Expanded != nil {
		return !*inspection.Expanded
	}
	if inspection.Selected != nil {
		return !*inspection.Selected
	}
	// State is unknown. Stopping is safer than a supposedly read-only child
	// query that may open or materialize the provider's submenu.
	return true
}

func (t *darwinAXTraversal) buildNode(element C.uintptr_t, depth int) (AccessibilityNode, bool, error) {
	if t.nodes >= t.limits.MaxNodes {
		t.markIncomplete("maxNodes", true)
		return AccessibilityNode{}, false, nil
	}
	inspection, err := t.backend.inspect(t.ctx, element, t.includeValue)
	if err != nil {
		return AccessibilityNode{}, false, err
	}
	t.nodes++
	if depth > t.maxDepth {
		t.maxDepth = depth
	}
	node := inspection.node()
	if inspection.deferCollapsedMenuChildren() {
		node.Children = []AccessibilityNode{}
		t.markIncomplete("unmaterialized", false)
		return node, true, nil
	}
	children, materialized, err := t.backend.copyElementArray(t.ctx, element, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN)
	if err != nil {
		return AccessibilityNode{}, false, err
	}
	defer t.backend.releaseAll(children)
	if !materialized {
		if inspection.mayHaveUnmaterializedChildren() {
			t.markIncomplete("unmaterialized", false)
		}
		return node, true, nil
	}
	if len(children) == 0 {
		node.Children = []AccessibilityNode{}
		return node, true, nil
	}
	if depth >= t.limits.MaxDepth {
		t.markIncomplete("maxDepth", true)
		return node, true, nil
	}
	node.Children = make([]AccessibilityNode, 0, len(children))
	for _, child := range children {
		childNode, visited, childErr := t.buildNode(child, depth+1)
		if childErr != nil {
			return AccessibilityNode{}, false, childErr
		}
		if !visited {
			break
		}
		node.Children = append(node.Children, childNode)
	}
	return node, true, nil
}

func darwinAccessibilitySelectorMatches(node AccessibilityNode, selector AccessibilitySelector) bool {
	if selector.Role != "" && node.Role != selector.Role {
		return false
	}
	if selector.Name != nil && (node.Name == nil || *node.Name != *selector.Name) {
		return false
	}
	if selector.Identifier != nil && (node.Identifier == nil || *node.Identifier != *selector.Identifier) {
		return false
	}
	return true
}

func (t *darwinAXTraversal) find(
	element C.uintptr_t,
	depth int,
	selector AccessibilitySelector,
	matchCount *int,
	matchedElement *C.uintptr_t,
	matchedNode *AccessibilityNode,
) error {
	if *matchCount > 1 {
		return nil
	}
	if t.nodes >= t.limits.MaxNodes {
		t.markIncomplete("maxNodes", true)
		return nil
	}
	inspection, err := t.backend.inspect(t.ctx, element, false)
	if err != nil {
		return err
	}
	t.nodes++
	if depth > t.maxDepth {
		t.maxDepth = depth
	}
	node := inspection.node()
	if darwinAccessibilitySelectorMatches(node, selector) {
		*matchCount++
		if *matchCount == 1 {
			retained, retainErr := t.backend.retain(element)
			if retainErr != nil {
				return retainErr
			}
			*matchedElement = retained
			*matchedNode = node
		}
		if *matchCount > 1 {
			return nil
		}
	}
	if inspection.deferCollapsedMenuChildren() {
		t.markIncomplete("unmaterialized", false)
		return nil
	}
	children, materialized, err := t.backend.copyElementArray(t.ctx, element, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN)
	if err != nil {
		return err
	}
	defer t.backend.releaseAll(children)
	if !materialized {
		if inspection.mayHaveUnmaterializedChildren() {
			t.markIncomplete("unmaterialized", false)
		}
		return nil
	}
	if len(children) == 0 {
		return nil
	}
	if depth >= t.limits.MaxDepth {
		t.markIncomplete("maxDepth", true)
		return nil
	}
	for _, child := range children {
		if err := t.find(child, depth+1, selector, matchCount, matchedElement, matchedNode); err != nil {
			return err
		}
		if *matchCount > 1 {
			return nil
		}
	}
	return nil
}

func (b *darwinAccessibilityBackend) Snapshot(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) (AccessibilitySnapshotData, error) {
	root, err := b.resolveScopeRoot(ctx, scope)
	if err != nil {
		return AccessibilitySnapshotData{}, err
	}
	defer b.releaseRoot(root)
	traversal := newDarwinAXTraversal(b, ctx, limits)
	node, visited, err := traversal.buildNode(root.element, 0)
	if err != nil {
		return AccessibilitySnapshotData{}, err
	}
	if !visited {
		return AccessibilitySnapshotData{}, darwinAXTypedError(AccessibilitySearchIncomplete, "snapshot", "accessibility snapshot reached its node limit before reading the root", nil, AccessibilityActionNotStarted)
	}
	return AccessibilitySnapshotData{
		Root: &node, Complete: traversal.complete, Truncated: traversal.truncated,
		Reason: traversal.reason, Nodes: traversal.nodes, MaxDepth: traversal.maxDepth,
	}, nil
}

func (b *darwinAccessibilityBackend) Find(ctx context.Context, scope AccessibilityScope, selector AccessibilitySelector, limits AccessibilityLimits) (AccessibilityFindData, error) {
	root, err := b.resolveScopeRoot(ctx, scope)
	if err != nil {
		return AccessibilityFindData{}, err
	}
	defer b.releaseRoot(root)
	traversal := newDarwinAXTraversal(b, ctx, limits)
	matchCount := 0
	var matchedElement C.uintptr_t
	var matchedNode AccessibilityNode
	if err := traversal.find(root.element, 0, selector, &matchCount, &matchedElement, &matchedNode); err != nil {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityFindData{}, err
	}
	if matchCount > 1 {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityFindData{}, darwinAXTypedError(AccessibilityAmbiguousTarget, "search", "multiple native accessibility elements match the selector", nil, AccessibilityActionNotStarted)
	}
	if !traversal.complete {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityFindData{}, darwinAXTypedError(AccessibilitySearchIncomplete, "search", "bounded accessibility search could not prove a unique result", nil, AccessibilityActionNotStarted)
	}
	if matchCount == 0 {
		return AccessibilityFindData{Found: false, Complete: true}, nil
	}
	handle, err := b.storeRetainedHandle(matchedElement, root.pid)
	if err != nil {
		return AccessibilityFindData{}, err
	}
	return AccessibilityFindData{Found: true, Handle: handle, Node: matchedNode, Complete: true}, nil
}

func pointerValue[T any](value *T) interface{} {
	if value == nil {
		return nil
	}
	return *value
}

func accessibilityNativeBoundsValue(bounds *AccessibilityNativeBounds) interface{} {
	if bounds == nil {
		return nil
	}
	return map[string]interface{}{
		"x": bounds.X, "y": bounds.Y, "width": bounds.Width, "height": bounds.Height,
		"coordinateSpace": bounds.CoordinateSpace,
	}
}

func defaultDarwinReadProperties() []string {
	return []string{"role", "nativeRole", "name", "identifier", "enabled", "focused", "selected", "checked", "expanded", "actions", "nativeBounds", "bounds"}
}

func (b *darwinAccessibilityBackend) Read(ctx context.Context, handle uint64, properties []string) (AccessibilityReadData, error) {
	entry, err := b.lookupHandle(ctx, handle)
	if err != nil {
		return AccessibilityReadData{}, err
	}
	if len(properties) == 0 {
		properties = defaultDarwinReadProperties()
	}
	includeValue := false
	for _, property := range properties {
		if property == "value" {
			includeValue = true
		}
	}
	inspection, err := b.inspect(ctx, entry.element, includeValue)
	if err != nil {
		return AccessibilityReadData{}, err
	}
	node := inspection.node()
	result := make(map[string]interface{}, len(properties))
	for _, property := range properties {
		switch property {
		case "role":
			result[property] = node.Role
		case "nativeRole":
			result[property] = node.NativeRole
		case "name":
			result[property] = pointerValue(node.Name)
		case "identifier":
			result[property] = pointerValue(node.Identifier)
		case "enabled":
			result[property] = pointerValue(node.Enabled)
		case "focused":
			result[property] = pointerValue(node.Focused)
		case "selected":
			result[property] = pointerValue(node.Selected)
		case "checked":
			result[property] = pointerValue(node.Checked)
		case "expanded":
			result[property] = pointerValue(node.Expanded)
		case "actions":
			result[property] = node.Actions
		case "value":
			result[property] = node.Value
		case "nativeBounds":
			result[property] = accessibilityNativeBoundsValue(node.NativeBounds)
		case "bounds":
			result[property] = nil
		default:
			return AccessibilityReadData{}, darwinAXTypedError(AccessibilityInvalidArgument, "read", "unknown accessibility property", nil, AccessibilityActionNotStarted)
		}
	}
	return AccessibilityReadData{Properties: result}, nil
}

func (b *darwinAccessibilityBackend) finishMutation(ctx context.Context, status C.int32_t, attempted, already C.int32_t, phase string) (AccessibilityActionData, error) {
	didAttempt := attempted != 0
	if err := darwinAXStatusError(ctx, status, phase, didAttempt); err != nil {
		return AccessibilityActionData{}, err
	}
	if already != 0 {
		return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
	}
	if didAttempt {
		return AccessibilityActionData{State: AccessibilityActionAcknowledged}, nil
	}
	return AccessibilityActionData{}, darwinAXTypedError(AccessibilityBackendFailed, phase, "native accessibility mutation returned without a state", nil, AccessibilityActionNotStarted)
}

func (b *darwinAccessibilityBackend) setStringValue(ctx context.Context, element C.uintptr_t, value string) (AccessibilityActionData, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	cValue := C.CString(value)
	defer C.free(unsafe.Pointer(cValue))
	var attempted, already C.int32_t
	status := C.opendesk_ax_set_string_value(element, timeout, cValue, C.int64_t(len(value)), &attempted, &already)
	return b.finishMutation(ctx, status, attempted, already, "action")
}

func (b *darwinAccessibilityBackend) setBoolAttribute(ctx context.Context, element C.uintptr_t, attribute C.int32_t, desired bool, phase string) (AccessibilityActionData, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	nativeDesired := C.int32_t(0)
	if desired {
		nativeDesired = 1
	}
	var attempted, already C.int32_t
	status := C.opendesk_ax_set_bool_attribute(element, attribute, nativeDesired, timeout, &attempted, &already)
	return b.finishMutation(ctx, status, attempted, already, phase)
}

func (b *darwinAccessibilityBackend) setChecked(ctx context.Context, element C.uintptr_t, desired bool) (AccessibilityActionData, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	nativeDesired := C.int32_t(0)
	if desired {
		nativeDesired = 1
	}
	var attempted, already C.int32_t
	status := C.opendesk_ax_set_checked(element, nativeDesired, timeout, &attempted, &already)
	return b.finishMutation(ctx, status, attempted, already, "action")
}

func (b *darwinAccessibilityBackend) performNativeAction(ctx context.Context, element C.uintptr_t, action C.int32_t, phase string) (AccessibilityActionData, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	var attempted C.int32_t
	status := C.opendesk_ax_perform_action(element, action, timeout, &attempted)
	return b.finishMutation(ctx, status, attempted, 0, phase)
}

func (b *darwinAccessibilityBackend) pressCollapsedMenu(ctx context.Context, element C.uintptr_t) (AccessibilityActionData, error) {
	timeout, err := darwinAXRemainingTimeout(ctx)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	var attempted, already C.int32_t
	status := C.opendesk_ax_press_collapsed_menu(element, timeout, &attempted, &already)
	result, err := b.finishMutation(ctx, status, attempted, already, "menu_expand")
	if err == nil && result.State == AccessibilityActionNotNeeded {
		// Go-side inspection proved this item was collapsed immediately before
		// entering the fused bridge. If the bridge now observes an on-screen
		// child menu, expansion happened during this request (some AppKit
		// providers materialize/open it while AXChildren is queried). Preserve
		// that side effect instead of reporting the whole level as untouched.
		result.State = AccessibilityActionAcknowledged
	}
	return result, err
}

func requireDarwinKnownEnabled(inspection darwinAXInspection) error {
	if inspection.Enabled == nil {
		return darwinAXTypedError(AccessibilityStateUnknown, "action_check", "element enabled state is unavailable", nil, AccessibilityActionNotStarted)
	}
	if !*inspection.Enabled {
		return darwinAXTypedError(AccessibilityElementDisabled, "action_check", "the native accessibility element is disabled", nil, AccessibilityActionNotStarted)
	}
	return nil
}

func (b *darwinAccessibilityBackend) Perform(ctx context.Context, handle uint64, action AccessibilityAction) (AccessibilityActionData, error) {
	entry, err := b.lookupHandle(ctx, handle)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	inspection, err := b.inspect(ctx, entry.element, false)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	switch action.Action {
	case "invoke":
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		role := normalizeDarwinAXRole(darwinAXString(inspection.NativeRole))
		if role == "checkbox" || role == "radioButton" || !inspection.supportsNativeAction("AXPress") {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element does not support the AXPress command action", nil, AccessibilityActionNotStarted)
		}
		return b.performNativeAction(ctx, entry.element, C.OPENDESK_AX_ACTION_PRESS, "action")
	case "setValue":
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		if inspection.Secure {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityPermissionDenied, "action_check", "protected accessibility values cannot be modified", nil, AccessibilityActionNotStarted)
		}
		if !inspection.ValueSettable || normalizeDarwinAXRole(darwinAXString(inspection.NativeRole)) != "textField" {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element value is not writable as text", nil, AccessibilityActionNotStarted)
		}
		return b.setStringValue(ctx, entry.element, action.Value)
	case "expand":
		if inspection.Expanded != nil && *inspection.Expanded {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		if inspection.Expanded != nil && inspection.ExpandedSettable {
			return b.setBoolAttribute(ctx, entry.element, C.OPENDESK_AX_BOOL_ATTRIBUTE_EXPANDED, true, "action")
		}
		// AXShowMenu is state-directed, so unlike AXPress it is safe even when the
		// provider does not expose AXExpanded.
		if inspection.supportsNativeAction("AXShowMenu") {
			return b.performNativeAction(ctx, entry.element, C.OPENDESK_AX_ACTION_SHOW_MENU, "action")
		}
		if inspection.Expanded == nil {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityStateUnknown, "action_check", "element expanded state is unavailable", nil, AccessibilityActionNotStarted)
		}
		return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element has no safely mapped native expand operation", nil, AccessibilityActionNotStarted)
	case "collapse":
		if inspection.Expanded == nil {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityStateUnknown, "action_check", "element expanded state is unavailable", nil, AccessibilityActionNotStarted)
		}
		if !*inspection.Expanded {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		if !inspection.ExpandedSettable {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element expanded state is not writable", nil, AccessibilityActionNotStarted)
		}
		return b.setBoolAttribute(ctx, entry.element, C.OPENDESK_AX_BOOL_ATTRIBUTE_EXPANDED, false, "action")
	case "select":
		role := normalizeDarwinAXRole(darwinAXString(inspection.NativeRole))
		if role == "menuItem" {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "menu item selection semantics cannot be proven from AXSelected", nil, AccessibilityActionNotStarted)
		}
		if inspection.Selected == nil {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityStateUnknown, "action_check", "element selected state is unavailable", nil, AccessibilityActionNotStarted)
		}
		if *inspection.Selected {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		if inspection.SelectedSettable {
			return b.setBoolAttribute(ctx, entry.element, C.OPENDESK_AX_BOOL_ATTRIBUTE_SELECTED, true, "action")
		}
		if role == "radioButton" && inspection.supportsNativeAction("AXPress") {
			return b.performNativeAction(ctx, entry.element, C.OPENDESK_AX_ACTION_PRESS, "action")
		}
		return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element has no safely mapped native selection operation", nil, AccessibilityActionNotStarted)
	case "setChecked":
		if inspection.Checked == nil {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityStateUnknown, "action_check", "element checked state is unavailable or indeterminate", nil, AccessibilityActionNotStarted)
		}
		if *inspection.Checked == action.Checked {
			return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
		}
		if err := requireDarwinKnownEnabled(inspection); err != nil {
			return AccessibilityActionData{}, err
		}
		if normalizeDarwinAXRole(darwinAXString(inspection.NativeRole)) != "checkbox" ||
			(!inspection.ValueSettable && !inspection.supportsNativeAction("AXPress")) {
			return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "action_check", "element does not expose a safely writable two-state checkbox value", nil, AccessibilityActionNotStarted)
		}
		return b.setChecked(ctx, entry.element, action.Checked)
	default:
		return AccessibilityActionData{}, darwinAXTypedError(AccessibilityInvalidArgument, "action_check", "unknown accessibility action", nil, AccessibilityActionNotStarted)
	}
}

func (b *darwinAccessibilityBackend) MenuSnapshot(ctx context.Context, scope AccessibilityScope, limits AccessibilityLimits) (AccessibilityMenuData, error) {
	root, err := b.resolveMenuRoot(ctx, scope)
	if err != nil {
		return AccessibilityMenuData{}, err
	}
	defer b.releaseRoot(root)
	traversal := newDarwinAXTraversal(b, ctx, limits)
	node, visited, err := traversal.buildNode(root.element, 0)
	if err != nil {
		return AccessibilityMenuData{}, err
	}
	if !visited {
		return AccessibilityMenuData{}, darwinAXTypedError(AccessibilitySearchIncomplete, "menu_observe", "menu observation reached its node limit before reading the root", nil, AccessibilityActionNotStarted)
	}
	items := node.Children
	if items == nil {
		items = []AccessibilityNode{}
	}
	return AccessibilityMenuData{
		Items: items, Complete: traversal.complete, Truncated: traversal.truncated,
		Reason: traversal.reason, Nodes: traversal.nodes, MaxDepth: traversal.maxDepth,
	}, nil
}

func darwinAccessibilityMenuSegmentMatches(node AccessibilityNode, segment AccessibilityMenuSegment) bool {
	if segment.Name != nil && (node.Name == nil || *node.Name != *segment.Name) {
		return false
	}
	if segment.Identifier != nil && (node.Identifier == nil || *node.Identifier != *segment.Identifier) {
		return false
	}
	return true
}

func isDarwinMenuCandidate(inspection darwinAXInspection) bool {
	nativeRole := darwinAXString(inspection.NativeRole)
	return nativeRole == "AXMenuItem" || nativeRole == "AXMenuBarItem"
}

func isDarwinMenuTransparentContainer(inspection darwinAXInspection) bool {
	switch darwinAXString(inspection.NativeRole) {
	case "AXApplication", "AXWindow", "AXMenuBar", "AXMenu", "AXGroup":
		return true
	default:
		return false
	}
}

func (t *darwinAXTraversal) findMenuLevel(
	element C.uintptr_t,
	depth int,
	segment AccessibilityMenuSegment,
	matchCount *int,
	matchedElement *C.uintptr_t,
	matchedNode *AccessibilityNode,
) error {
	if *matchCount > 1 {
		return nil
	}
	if depth >= t.limits.MaxDepth {
		t.markIncomplete("maxDepth", true)
		return nil
	}
	children, materialized, err := t.backend.copyElementArray(t.ctx, element, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_CHILDREN)
	if err != nil {
		return err
	}
	defer t.backend.releaseAll(children)
	if !materialized {
		t.markIncomplete("unmaterialized", false)
		return nil
	}
	if len(children) == 0 {
		return nil
	}
	for _, child := range children {
		if t.nodes >= t.limits.MaxNodes {
			t.markIncomplete("maxNodes", true)
			return nil
		}
		inspection, inspectErr := t.backend.inspect(t.ctx, child, false)
		if inspectErr != nil {
			return inspectErr
		}
		t.nodes++
		if depth+1 > t.maxDepth {
			t.maxDepth = depth + 1
		}
		if isDarwinMenuCandidate(inspection) {
			node := inspection.node()
			if darwinAccessibilityMenuSegmentMatches(node, segment) {
				*matchCount++
				if *matchCount == 1 {
					retained, retainErr := t.backend.retain(child)
					if retainErr != nil {
						return retainErr
					}
					*matchedElement = retained
					*matchedNode = node
				}
				if *matchCount > 1 {
					return nil
				}
			}
			// A menu item starts the next semantic path level. Never search its
			// submenu while resolving the current segment.
			continue
		}
		if isDarwinMenuTransparentContainer(inspection) {
			if err := t.findMenuLevel(child, depth+1, segment, matchCount, matchedElement, matchedNode); err != nil {
				return err
			}
			if *matchCount > 1 {
				return nil
			}
		}
	}
	return nil
}

func (b *darwinAccessibilityBackend) FindMenuChild(ctx context.Context, scope AccessibilityScope, parentHandle uint64, segment AccessibilityMenuSegment, limits AccessibilityLimits) (AccessibilityMenuMatch, error) {
	var root darwinAXRoot
	var err error
	if parentHandle == 0 {
		root, err = b.resolveMenuRoot(ctx, scope)
	} else {
		entry, lookupErr := b.lookupHandle(ctx, parentHandle)
		if lookupErr != nil {
			err = lookupErr
		} else {
			pid := darwinAXScopePID(scope)
			if pid > 0 && entry.pid != pid {
				err = darwinAXTypedError(AccessibilityStaleTarget, "menu_identity", "menu element no longer belongs to the requested scope", nil, AccessibilityActionNotStarted)
			} else {
				root = darwinAXRoot{element: entry.element, pid: entry.pid}
			}
		}
	}
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	defer b.releaseRoot(root)
	traversal := newDarwinAXTraversal(b, ctx, limits)
	matchCount := 0
	var matchedElement C.uintptr_t
	var matchedNode AccessibilityNode
	if err := traversal.findMenuLevel(root.element, 0, segment, &matchCount, &matchedElement, &matchedNode); err != nil {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityMenuMatch{}, err
	}
	if matchCount > 1 {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityMenuMatch{}, darwinAXTypedError(AccessibilityAmbiguousTarget, "menu_search", "multiple menu items match the requested path segment", nil, AccessibilityActionNotStarted)
	}
	// After a parent was expanded, macOS may expose AXChildren asynchronously.
	// Report that temporary absence to the menu coordinator as not-yet-found so
	// it can keep observing under the same request deadline. Limit exhaustion
	// and incomplete top-level observations remain SEARCH_INCOMPLETE.
	if parentHandle != 0 && matchCount == 0 && traversal.reason == "unmaterialized" {
		return AccessibilityMenuMatch{}, darwinAXTypedError(AccessibilityTargetNotFound, "menu_search", "expanded menu children are not materialized yet", nil, AccessibilityActionNotStarted)
	}
	if !traversal.complete {
		if matchedElement != 0 {
			b.releaseNative(matchedElement)
		}
		return AccessibilityMenuMatch{}, darwinAXTypedError(AccessibilitySearchIncomplete, "menu_search", "menu children are not fully materialized within the request limits", nil, AccessibilityActionNotStarted)
	}
	if matchCount == 0 {
		return AccessibilityMenuMatch{}, darwinAXTypedError(AccessibilityTargetNotFound, "menu_search", "menu path segment was not found", nil, AccessibilityActionNotStarted)
	}
	handle, err := b.storeRetainedHandle(matchedElement, root.pid)
	if err != nil {
		return AccessibilityMenuMatch{}, err
	}
	return AccessibilityMenuMatch{Handle: handle, Node: matchedNode}, nil
}

func (b *darwinAccessibilityBackend) ExpandMenu(ctx context.Context, handle uint64) (AccessibilityActionData, error) {
	entry, err := b.lookupHandle(ctx, handle)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	inspection, err := b.inspect(ctx, entry.element, false)
	if err != nil {
		return AccessibilityActionData{}, err
	}
	nativeRole := darwinAXString(inspection.NativeRole)
	if (inspection.Expanded != nil && *inspection.Expanded) ||
		(inspection.Expanded == nil && inspection.Selected != nil && *inspection.Selected &&
			(nativeRole == "AXMenuItem" || nativeRole == "AXMenuBarItem")) {
		return AccessibilityActionData{State: AccessibilityActionNotNeeded}, nil
	}
	if err := requireDarwinKnownEnabled(inspection); err != nil {
		return AccessibilityActionData{}, err
	}
	if inspection.Expanded != nil && inspection.ExpandedSettable {
		return b.setBoolAttribute(ctx, entry.element, C.OPENDESK_AX_BOOL_ATTRIBUTE_EXPANDED, true, "menu_expand")
	}
	// AXShowMenu is a state-directed native action, unlike a blind press/toggle.
	if inspection.supportsNativeAction("AXShowMenu") {
		return b.performNativeAction(ctx, entry.element, C.OPENDESK_AX_ACTION_SHOW_MENU, "menu_expand")
	}
	// Some macOS menu providers expose only AXPress. Use it solely when a child
	// AXMenu proves submenu intent and native state proves the item is not open.
	// AppKit exposes AXSelected=false for a closed menu item even when it omits
	// AXExpanded; this is still state-directed and never a blind press.
	knownCollapsed := inspection.Expanded != nil && !*inspection.Expanded
	if inspection.Expanded == nil && inspection.Selected != nil && !*inspection.Selected {
		knownCollapsed = true
	}
	if !knownCollapsed {
		return AccessibilityActionData{}, darwinAXTypedError(AccessibilityStateUnknown, "menu_expand", "menu expanded state is unavailable", nil, AccessibilityActionNotStarted)
	}
	if (nativeRole != "AXMenuItem" && nativeRole != "AXMenuBarItem") || !inspection.supportsNativeAction("AXPress") {
		return AccessibilityActionData{}, darwinAXTypedError(AccessibilityActionUnsupported, "menu_expand", "menu item has no safely provable expand action", nil, AccessibilityActionNotStarted)
	}
	return b.pressCollapsedMenu(ctx, entry.element)
}

func (b *darwinAccessibilityBackend) Release(handle uint64) error {
	entry, ok := b.handles[handle]
	if handle == 0 || !ok {
		return darwinAXTypedError(AccessibilityStaleTarget, "release", "accessibility element reference is stale", nil, AccessibilityActionNotStarted)
	}
	delete(b.handles, handle)
	b.releaseNative(entry.element)
	return nil
}

func (b *darwinAccessibilityBackend) Close() error {
	if b == nil || !b.closed.CompareAndSwap(false, true) {
		return nil
	}
	for handle, entry := range b.handles {
		delete(b.handles, handle)
		b.releaseNative(entry.element)
	}
	b.initialized = false
	return nil
}

func (b *darwinAccessibilityBackend) ResourceCount() int {
	if b == nil {
		return 0
	}
	// Preserve an impossible negative count in diagnostics instead of masking a
	// retain/release accounting defect as a clean zero.
	return int(b.resourceCount.Load())
}

var _ AccessibilityBackend = (*darwinAccessibilityBackend)(nil)
