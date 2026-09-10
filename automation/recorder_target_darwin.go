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
	"errors"
	"fmt"
	"math"
	"time"
	"unsafe"
)

var errRecorderElementBoundsUnavailable = errors.New("accessibility element has no usable bounds")

func newRecorderTextProbe() recorderTextProbe {
	return func(ctx context.Context, window *WindowInfo, snapshot *recorderWindowSnapshot) (*recorderTextFieldSample, error) {
		if ctx == nil {
			ctx = context.Background()
		}
		if window == nil || snapshot == nil || window.ProcessID == 0 || snapshot.Application.ProcessID != window.ProcessID {
			return nil, fmt.Errorf("focused text window is unavailable")
		}
		if C.opendesk_ax_is_process_trusted() == 0 {
			return nil, fmt.Errorf("macOS Accessibility permission is not granted")
		}
		focused, err := recorderFocusedInputElement(ctx, window.ProcessID)
		if err != nil {
			return nil, err
		}
		defer C.opendesk_ax_release_element(focused)
		timeout, err := recorderTargetTimeout(ctx)
		if err != nil {
			return nil, err
		}
		var raw *C.char
		status := C.opendesk_ax_inspect_json(focused, C.double(timeout.Seconds()), 1, &raw)
		if raw != nil {
			defer C.opendesk_ax_free(unsafe.Pointer(raw))
		}
		if err := darwinAXStatusError(ctx, status, "recorder_text", false); err != nil {
			return nil, err
		}
		if raw == nil {
			return nil, fmt.Errorf("focused text input returned no inspection")
		}
		var inspection darwinAXInspection
		if err := json.Unmarshal([]byte(C.GoString(raw)), &inspection); err != nil {
			return nil, fmt.Errorf("decode focused text input: %w", err)
		}
		role := normalizeDarwinAXRole(darwinAXString(inspection.NativeRole))
		value, valueOK := inspection.Value.(string)
		if inspection.Secure || role != "textField" || !inspection.ValueSettable || inspection.Focused == nil || !*inspection.Focused || !inspection.ValueIncluded || !valueOK {
			return nil, fmt.Errorf("focused element is not a readable writable non-secure text field")
		}
		descriptor := recorderElementDescriptor{
			Role: role, NativeRole: darwinAXString(inspection.NativeRole), Subrole: darwinAXString(inspection.Subrole),
			Name: darwinAXString(inspection.Name), Identifier: darwinAXString(inspection.Identifier), Enabled: inspection.Enabled, Focused: inspection.Focused,
			ValueSettable: inspection.ValueSettable, NativeActions: append([]string{}, inspection.NativeActions...),
		}
		if bounds := inspection.NativeBounds; bounds != nil && bounds.Width > 0 && bounds.Height > 0 {
			descriptor.Bounds = recorderWindowBounds{X: int(math.Round(bounds.X)), Y: int(math.Round(bounds.Y)), Width: int(math.Round(bounds.Width)), Height: int(math.Round(bounds.Height))}
			descriptor.BoundsSpace = "screen-logical"
		}
		// Bounds are pointer evidence, not a prerequisite for observing the
		// focused editable value. Some applications expose a valid writable
		// AXTextArea without usable geometry; replay still resolves it uniquely
		// inside the exact active window and verifies focus plus value hashes.
		if err := recorderValidateEditableDescriptor(descriptor); err != nil {
			return nil, err
		}
		return &recorderTextFieldSample{ObservedAt: time.Now().UTC(), Window: recorderCloneWindowSnapshot(snapshot), Element: descriptor, Value: value}, nil
	}
}

func newRecorderTargetProbe() func(context.Context, *WindowInfo, recorderTargetPoint) (*recorderElementSnapshot, error) {
	return func(ctx context.Context, window *WindowInfo, point recorderTargetPoint) (*recorderElementSnapshot, error) {
		if ctx == nil {
			ctx = context.Background()
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if window == nil || window.ProcessID == 0 || window.Handle == 0 {
			return nil, fmt.Errorf("semantic target window is unavailable")
		}
		if point.InputSpace != "screen-logical" {
			return nil, fmt.Errorf("semantic target input coordinate space is unsupported")
		}
		x, y := point.X, point.Y
		if C.opendesk_ax_is_process_trusted() == 0 {
			return nil, fmt.Errorf("macOS Accessibility permission is not granted")
		}
		timeout, err := recorderTargetTimeout(ctx)
		if err != nil {
			return nil, err
		}
		var element C.uintptr_t
		status := C.opendesk_ax_copy_element_at_position(C.double(x), C.double(y), C.double(timeout.Seconds()), &element)
		if err := darwinAXStatusError(ctx, status, "recorder_target", false); err != nil {
			return nil, err
		}
		if element == 0 {
			return nil, fmt.Errorf("no accessibility element at pointer")
		}
		owned := []C.uintptr_t{element}
		defer func() {
			for _, item := range owned {
				C.opendesk_ax_release_element(item)
			}
		}()
		var pid C.int32_t
		if status := C.opendesk_ax_element_pid(element, C.double(timeout.Seconds()), &pid); status != 0 || uint32(pid) != window.ProcessID {
			return nil, fmt.Errorf("accessibility element does not belong to the resolved window application")
		}
		hit, secure, err := recorderInspectAXDescriptor(ctx, element)
		if err != nil {
			if !errors.Is(err, errRecorderElementBoundsUnavailable) {
				return nil, err
			}
			focused, focusedErr := recorderFocusedInputElement(ctx, window.ProcessID)
			if focusedErr != nil {
				return nil, err
			}
			owned = append(owned, focused)
			focusedDescriptor, focusedSecure, focusedInspectErr := recorderInspectAXDescriptor(ctx, focused)
			if focusedInspectErr != nil || focusedSecure || focusedDescriptor.Role != "textField" || !focusedDescriptor.ValueSettable || focusedDescriptor.Focused == nil || !*focusedDescriptor.Focused || !recorderPointInsideWindow(x, y, focusedDescriptor.Bounds) {
				return nil, err
			}
			return recorderElementSnapshotFromDescriptor(focusedDescriptor, "focused-input-fallback", x, y), nil
		}
		if secure {
			return nil, fmt.Errorf("secure accessibility element semantics are not recorded")
		}
		if !recorderPointInsideWindow(x, y, hit.Bounds) {
			return nil, fmt.Errorf("accessibility element bounds do not contain the pointer")
		}

		selected := hit
		resolution := "point-hit"
		selectedForClick := recorderElementSupportsSingleClick(hit)
		ancestors := make([]recorderElementDescriptor, 0, 6)
		containers := make([]recorderElementDescriptor, 0, 3)
		windowMatched := false
		current := element
		for depth := 0; depth < 32; depth++ {
			timeout, timeoutErr := recorderTargetTimeout(ctx)
			if timeoutErr != nil {
				return nil, timeoutErr
			}
			var parent C.uintptr_t
			parentStatus := C.opendesk_ax_copy_element_attribute(current, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_PARENT, C.double(timeout.Seconds()), &parent)
			if parentStatus == C.int32_t(C.OPENDESK_AX_STATUS_TARGET_NOT_FOUND) || parent == 0 {
				break
			}
			if err := darwinAXStatusError(ctx, parentStatus, "recorder_target_parent", false); err != nil {
				return nil, err
			}
			owned = append(owned, parent)
			current = parent
			var parentPID C.int32_t
			if pidStatus := C.opendesk_ax_element_pid(parent, C.double(timeout.Seconds()), &parentPID); pidStatus != 0 || uint32(parentPID) != window.ProcessID {
				return nil, fmt.Errorf("accessibility ancestry leaves the resolved window application")
			}
			descriptor, parentSecure, inspectErr := recorderInspectAXDescriptor(ctx, parent)
			if parentSecure {
				return nil, fmt.Errorf("secure accessibility ancestor semantics are not recorded")
			}
			if errors.Is(inspectErr, errRecorderElementBoundsUnavailable) {
				continue
			}
			if inspectErr != nil {
				return nil, inspectErr
			}
			if descriptor.Role == "window" {
				windowID, identityErr := getMacWindowIDForPIDAndBounds(
					window.ProcessID, int32(descriptor.Bounds.X), int32(descriptor.Bounds.Y),
					int32(descriptor.Bounds.Width), int32(descriptor.Bounds.Height),
				)
				if identityErr != nil || uint64(windowID) != window.Handle {
					return nil, fmt.Errorf("accessibility element does not belong to the resolved exact window")
				}
				windowMatched = true
				break
			}
			if !recorderPointInsideWindow(x, y, descriptor.Bounds) {
				return nil, fmt.Errorf("accessibility ancestor bounds do not contain the pointer")
			}
			if !selectedForClick && len(ancestors) < 6 {
				ancestors = append(ancestors, descriptor)
				if recorderElementSupportsSingleClick(descriptor) {
					selected = descriptor
					selectedForClick = true
					resolution = "nearest-actionable-ancestor"
				}
				continue
			}
			if selectedForClick && len(containers) < 3 {
				containers = append(containers, descriptor)
			}
		}
		if !windowMatched {
			return nil, fmt.Errorf("accessibility element exact window ancestry is unavailable")
		}

		offsetX, offsetY := x-selected.Bounds.X, y-selected.Bounds.Y
		return &recorderElementSnapshot{
			Source: "accessibility", Resolution: resolution,
			Role: selected.Role, NativeRole: selected.NativeRole, Subrole: selected.Subrole, Name: selected.Name,
			Identifier: selected.Identifier, Enabled: selected.Enabled, Focused: selected.Focused, ValueSettable: selected.ValueSettable,
			NativeActions: append([]string{}, selected.NativeActions...),
			Bounds:        selected.Bounds, BoundsSpace: "screen-logical", Hit: hit, Ancestors: ancestors, Containers: containers,
			Point: recorderElementPoint{OffsetX: offsetX, OffsetY: offsetY, XRatio: float64(offsetX) / float64(selected.Bounds.Width), YRatio: float64(offsetY) / float64(selected.Bounds.Height)},
			CoordinateMapping: &recorderElementCoordinateMapping{
				InputX: x, InputY: y, InputSpace: "screen-logical", NativeX: x, NativeY: y,
				NativeSpace: "screen-logical", Method: "identity", Verified: true,
			},
			ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
		}, nil
	}
}

func recorderFocusedInputElement(ctx context.Context, processID uint32) (C.uintptr_t, error) {
	if processID == 0 || processID > math.MaxInt32 {
		return 0, fmt.Errorf("focused input process is invalid")
	}
	application := C.opendesk_ax_create_application(C.int32_t(processID))
	if application == 0 {
		return 0, fmt.Errorf("focused input application is unavailable")
	}
	defer C.opendesk_ax_release_element(application)
	timeout, err := recorderTargetTimeout(ctx)
	if err != nil {
		return 0, err
	}
	var focused C.uintptr_t
	status := C.opendesk_ax_copy_element_attribute(application, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_FOCUSED_UI_ELEMENT, C.double(timeout.Seconds()), &focused)
	if err := darwinAXStatusError(ctx, status, "recorder_focused_input", false); err != nil {
		return 0, err
	}
	if focused == 0 {
		return 0, fmt.Errorf("focused input is unavailable")
	}
	return focused, nil
}

func recorderElementSnapshotFromDescriptor(descriptor recorderElementDescriptor, resolution string, x, y int) *recorderElementSnapshot {
	offsetX, offsetY := x-descriptor.Bounds.X, y-descriptor.Bounds.Y
	return &recorderElementSnapshot{
		Source: "accessibility", Resolution: resolution,
		Role: descriptor.Role, NativeRole: descriptor.NativeRole, Subrole: descriptor.Subrole, Name: descriptor.Name,
		Identifier: descriptor.Identifier, Enabled: descriptor.Enabled, Focused: descriptor.Focused, ValueSettable: descriptor.ValueSettable,
		NativeActions: append([]string{}, descriptor.NativeActions...), Bounds: descriptor.Bounds,
		BoundsSpace: descriptor.BoundsSpace, Hit: descriptor, Ancestors: []recorderElementDescriptor{}, Containers: []recorderElementDescriptor{},
		Point: recorderElementPoint{OffsetX: offsetX, OffsetY: offsetY, XRatio: float64(offsetX) / float64(descriptor.Bounds.Width), YRatio: float64(offsetY) / float64(descriptor.Bounds.Height)},
		CoordinateMapping: &recorderElementCoordinateMapping{
			InputX: x, InputY: y, InputSpace: "screen-logical", NativeX: x, NativeY: y,
			NativeSpace: "screen-logical", Method: "identity", Verified: true,
		},
		ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func recorderTargetTimeout(ctx context.Context) (time.Duration, error) {
	timeout := recorderContextFreshness
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < timeout {
		timeout = time.Until(deadline)
	}
	if timeout <= 0 {
		return 0, context.DeadlineExceeded
	}
	return timeout, nil
}

func recorderInspectAXDescriptor(ctx context.Context, element C.uintptr_t) (recorderElementDescriptor, bool, error) {
	timeout, err := recorderTargetTimeout(ctx)
	if err != nil {
		return recorderElementDescriptor{}, false, err
	}
	var raw *C.char
	status := C.opendesk_ax_inspect_json(element, C.double(timeout.Seconds()), 0, &raw)
	if raw != nil {
		defer C.opendesk_ax_free(unsafe.Pointer(raw))
	}
	if err := darwinAXStatusError(ctx, status, "recorder_target", false); err != nil {
		return recorderElementDescriptor{}, false, err
	}
	if raw == nil {
		return recorderElementDescriptor{}, false, fmt.Errorf("accessibility target returned no inspection")
	}
	var inspection darwinAXInspection
	if err := json.Unmarshal([]byte(C.GoString(raw)), &inspection); err != nil {
		return recorderElementDescriptor{}, false, fmt.Errorf("decode accessibility target: %w", err)
	}
	if inspection.Secure {
		return recorderElementDescriptor{}, true, nil
	}
	bounds := inspection.NativeBounds
	if bounds == nil || bounds.Width <= 0 || bounds.Height <= 0 {
		return recorderElementDescriptor{}, false, errRecorderElementBoundsUnavailable
	}
	descriptor := recorderElementDescriptor{
		Role: normalizeDarwinAXRole(darwinAXString(inspection.NativeRole)), NativeRole: darwinAXString(inspection.NativeRole), Subrole: darwinAXString(inspection.Subrole),
		Name: darwinAXString(inspection.Name), Identifier: darwinAXString(inspection.Identifier), Enabled: inspection.Enabled, Focused: inspection.Focused,
		ValueSettable: inspection.ValueSettable, NativeActions: append([]string{}, inspection.NativeActions...),
		Bounds:      recorderWindowBounds{X: int(math.Round(bounds.X)), Y: int(math.Round(bounds.Y)), Width: int(math.Round(bounds.Width)), Height: int(math.Round(bounds.Height))},
		BoundsSpace: "screen-logical",
	}
	if err := recorderValidateElementDescriptor(descriptor); err != nil {
		return recorderElementDescriptor{}, false, err
	}
	return descriptor, false, nil
}
