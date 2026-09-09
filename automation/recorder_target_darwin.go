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
	"time"
	"unsafe"
)

func newRecorderTargetProbe() func(context.Context, *WindowInfo, int, int) (*recorderElementSnapshot, error) {
	return func(ctx context.Context, window *WindowInfo, x, y int) (*recorderElementSnapshot, error) {
		if ctx == nil {
			ctx = context.Background()
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if window == nil || window.ProcessID == 0 {
			return nil, fmt.Errorf("semantic target window is unavailable")
		}
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
			return nil, err
		}
		if secure {
			return nil, fmt.Errorf("secure accessibility element semantics are not recorded")
		}
		if !recorderPointInsideWindow(x, y, hit.Bounds) {
			return nil, fmt.Errorf("accessibility element bounds do not contain the pointer")
		}

		selected := hit
		resolution := "point-hit"
		ancestors := make([]recorderElementDescriptor, 0, 6)
		if len(hit.NativeActions) == 0 {
			current := element
			for depth := 0; depth < 6; depth++ {
				timeout, timeoutErr := recorderTargetTimeout(ctx)
				if timeoutErr != nil {
					break
				}
				var parent C.uintptr_t
				parentStatus := C.opendesk_ax_copy_element_attribute(current, C.OPENDESK_AX_ELEMENT_ATTRIBUTE_PARENT, C.double(timeout.Seconds()), &parent)
				if parentStatus == C.int32_t(C.OPENDESK_AX_STATUS_TARGET_NOT_FOUND) || parent == 0 {
					break
				}
				if parentStatus != 0 {
					break
				}
				owned = append(owned, parent)
				current = parent
				var parentPID C.int32_t
				if pidStatus := C.opendesk_ax_element_pid(parent, C.double(timeout.Seconds()), &parentPID); pidStatus != 0 || uint32(parentPID) != window.ProcessID {
					break
				}
				descriptor, parentSecure, inspectErr := recorderInspectAXDescriptor(ctx, parent)
				if inspectErr != nil || parentSecure || !recorderPointInsideWindow(x, y, descriptor.Bounds) {
					break
				}
				ancestors = append(ancestors, descriptor)
				if len(descriptor.NativeActions) > 0 {
					selected = descriptor
					resolution = "nearest-actionable-ancestor"
					break
				}
			}
		}

		offsetX, offsetY := x-selected.Bounds.X, y-selected.Bounds.Y
		return &recorderElementSnapshot{
			Source: "accessibility", Resolution: resolution,
			Role: selected.Role, NativeRole: selected.NativeRole, Name: selected.Name,
			Identifier: selected.Identifier, NativeActions: append([]string{}, selected.NativeActions...),
			Bounds: selected.Bounds, Hit: hit, Ancestors: ancestors,
			Point:      recorderElementPoint{OffsetX: offsetX, OffsetY: offsetY, XRatio: float64(offsetX) / float64(selected.Bounds.Width), YRatio: float64(offsetY) / float64(selected.Bounds.Height)},
			ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
		}, nil
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
		return recorderElementDescriptor{}, false, fmt.Errorf("accessibility element has no usable bounds")
	}
	descriptor := recorderElementDescriptor{
		Role: normalizeDarwinAXRole(darwinAXString(inspection.NativeRole)), NativeRole: darwinAXString(inspection.NativeRole),
		Name: darwinAXString(inspection.Name), Identifier: darwinAXString(inspection.Identifier), NativeActions: append([]string{}, inspection.NativeActions...),
		Bounds: recorderWindowBounds{X: int(math.Round(bounds.X)), Y: int(math.Round(bounds.Y)), Width: int(math.Round(bounds.Width)), Height: int(math.Round(bounds.Height))},
	}
	if err := recorderValidateElementDescriptor(descriptor); err != nil {
		return recorderElementDescriptor{}, false, err
	}
	return descriptor, false, nil
}
