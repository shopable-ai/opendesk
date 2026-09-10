//go:build windows

package automation

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"time"
)

// newRecorderTargetProbe reuses the first-party UIA client and property
// readers. Every probe creates, uses, and releases UIA elements on one locked
// OS thread; no COM pointer or runtime ID crosses into the Recorder queues.
func newRecorderTargetProbe() func(context.Context, *WindowInfo, recorderTargetPoint) (*recorderElementSnapshot, error) {
	return func(ctx context.Context, window *WindowInfo, point recorderTargetPoint) (*recorderElementSnapshot, error) {
		if ctx == nil {
			ctx = context.Background()
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if window == nil || window.ProcessID == 0 || window.Handle == 0 || window.Width <= 0 || window.Height <= 0 {
			return nil, fmt.Errorf("semantic target window is unavailable")
		}
		if point.InputSpace != "screen-logical" || point.NativePoint == nil ||
			point.NativePoint.Space != "windowsPhysicalScreen" || point.NativePoint.Source != "GetPhysicalCursorPos" {
			return nil, fmt.Errorf("verified Windows physical input point is unavailable")
		}

		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		backend := &windowsAccessibilityBackend{handles: make(map[uint64]*windowsAccessibilityHandle)}
		if err := backend.Initialize(ctx); err != nil {
			return nil, err
		}
		defer backend.Close()
		return backend.recorderTargetAtPoint(ctx, window, point)
	}
}

func newRecorderTextProbe() recorderTextProbe { return nil }

func (b *windowsAccessibilityBackend) recorderTargetAtPoint(ctx context.Context, window *WindowInfo, point recorderTargetPoint) (*recorderElementSnapshot, error) {
	if err := b.ensureReady(); err != nil {
		return nil, err
	}
	root, err := b.client.elementFromHandle(uintptr(window.Handle))
	if err != nil {
		return nil, windowsAccessibilityNativeError("recorder_target_scope", err, AccessibilityActionNotStarted)
	}
	defer root.release()
	if err := b.validateElementPID(root, window.ProcessID); err != nil {
		return nil, err
	}
	rootBounds, err := b.nativeBounds(root)
	if err != nil || rootBounds == nil || rootBounds.Width <= 0 || rootBounds.Height <= 0 {
		return nil, fmt.Errorf("UIA target window has no usable physical bounds")
	}
	if !recorderPointInsideWindow(point.X, point.Y, recorderWindowBounds{X: int(window.X), Y: int(window.Y), Width: int(window.Width), Height: int(window.Height)}) {
		return nil, fmt.Errorf("logical input point is outside the resolved exact window")
	}

	// UIA point APIs and BoundingRectangle use physical desktop coordinates.
	// The callback-time GetPhysicalCursorPos result is accepted only when it
	// agrees with the same HWND's logical and UIA root rectangles.
	scaleX := rootBounds.Width / float64(window.Width)
	scaleY := rootBounds.Height / float64(window.Height)
	if math.IsNaN(scaleX) || math.IsInf(scaleX, 0) || math.IsNaN(scaleY) || math.IsInf(scaleY, 0) || scaleX <= 0 || scaleY <= 0 {
		return nil, fmt.Errorf("Windows logical-to-physical point mapping is unavailable")
	}
	expectedX := rootBounds.X + float64(point.X-int(window.X))*scaleX
	expectedY := rootBounds.Y + float64(point.Y-int(window.Y))*scaleY
	nativeX, nativeY := point.NativePoint.X, point.NativePoint.Y
	tolerance := math.Max(3, math.Max(scaleX, scaleY)*2)
	if math.Abs(float64(nativeX)-expectedX) > tolerance || math.Abs(float64(nativeY)-expectedY) > tolerance ||
		float64(nativeX) < rootBounds.X || float64(nativeX) >= rootBounds.X+rootBounds.Width ||
		float64(nativeY) < rootBounds.Y || float64(nativeY) >= rootBounds.Y+rootBounds.Height {
		return nil, fmt.Errorf("Windows physical input point does not match the resolved exact window mapping")
	}
	if nativeX < math.MinInt32 || nativeX > math.MaxInt32 || nativeY < math.MinInt32 || nativeY > math.MaxInt32 {
		return nil, fmt.Errorf("Windows physical input point is outside UIA POINT range")
	}

	hitElement, err := b.client.elementFromPoint(int32(nativeX), int32(nativeY))
	if err != nil {
		return nil, windowsAccessibilityNativeError("recorder_target", err, AccessibilityActionNotStarted)
	}
	owned := []*uiaElement{hitElement}
	defer func() {
		recorderReleaseOwned(owned, func(element *uiaElement) {
			if element != nil {
				element.release()
			}
		})
	}()
	if err := b.validateElementPID(hitElement, window.ProcessID); err != nil {
		return nil, fmt.Errorf("UIA point target does not belong to the resolved window application: %w", err)
	}
	hit, secure, err := b.recorderElementDescriptor(ctx, hitElement)
	if err != nil {
		return nil, err
	}
	if secure {
		return nil, fmt.Errorf("secure UIA element semantics are not recorded")
	}
	if !recorderPointInsideWindow(nativeX, nativeY, hit.Bounds) {
		return nil, fmt.Errorf("UIA element bounds do not contain the physical input point")
	}

	selected := hit
	resolution := "point-hit"
	selectedForClick := recorderElementSupportsSingleClick(hit)
	ancestors := make([]recorderElementDescriptor, 0, 6)
	containers := make([]recorderElementDescriptor, 0, 3)
	windowMatched := false
	current := hitElement
	for depth := 0; depth < 32; depth++ {
		if err := windowsAccessibilityContextError(ctx, "recorder_target_parent", AccessibilityActionNotStarted); err != nil {
			return nil, err
		}
		parent, parentErr := b.walker.parent(current)
		if parentErr != nil {
			return nil, windowsAccessibilityNativeError("recorder_target_parent", parentErr, AccessibilityActionNotStarted)
		}
		if parent == nil {
			break
		}
		owned = append(owned, parent)
		current = parent
		if err := b.validateElementPID(parent, window.ProcessID); err != nil {
			return nil, fmt.Errorf("UIA ancestry leaves the resolved window application: %w", err)
		}
		handle, handleErr := b.elementWindowHandle(parent, 0)
		if handleErr != nil {
			return nil, handleErr
		}
		descriptor, parentSecure, inspectErr := b.recorderElementDescriptor(ctx, parent)
		if inspectErr != nil {
			return nil, inspectErr
		}
		if parentSecure {
			return nil, fmt.Errorf("secure UIA ancestor semantics are not recorded")
		}
		if handle == uintptr(window.Handle) {
			windowMatched = true
			break
		}
		if !recorderPointInsideWindow(nativeX, nativeY, descriptor.Bounds) {
			return nil, fmt.Errorf("UIA ancestor bounds do not contain the physical input point")
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
		return nil, fmt.Errorf("UIA element exact window ancestry is unavailable")
	}

	offsetX, offsetY := nativeX-selected.Bounds.X, nativeY-selected.Bounds.Y
	return &recorderElementSnapshot{
		Source: "accessibility", Resolution: resolution,
		Role: selected.Role, NativeRole: selected.NativeRole, Subrole: selected.Subrole, Name: selected.Name,
		Identifier: selected.Identifier, Enabled: selected.Enabled, Focused: selected.Focused, ValueSettable: selected.ValueSettable,
		NativeActions: append([]string{}, selected.NativeActions...), Bounds: selected.Bounds, BoundsSpace: "windowsPhysicalScreen",
		Hit: hit, Ancestors: ancestors, Containers: containers,
		Point: recorderElementPoint{OffsetX: offsetX, OffsetY: offsetY, XRatio: float64(offsetX) / float64(selected.Bounds.Width), YRatio: float64(offsetY) / float64(selected.Bounds.Height)},
		CoordinateMapping: &recorderElementCoordinateMapping{
			InputX: point.X, InputY: point.Y, InputSpace: point.InputSpace,
			NativeX: nativeX, NativeY: nativeY, NativeSpace: "windowsPhysicalScreen",
			Method: "GetPhysicalCursorPos+uia-root-bounds-correlation", Verified: true,
		},
		ObservedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}, nil
}

func (b *windowsAccessibilityBackend) recorderElementDescriptor(ctx context.Context, element *uiaElement) (recorderElementDescriptor, bool, error) {
	if err := windowsAccessibilityContextError(ctx, "recorder_target_read", AccessibilityActionNotStarted); err != nil {
		return recorderElementDescriptor{}, false, err
	}
	password, err := b.propertyBool(element, uiaIsPasswordProperty)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	if password != nil && *password {
		return recorderElementDescriptor{}, true, nil
	}
	role, nativeRole, err := b.elementRole(element)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	name, err := b.propertyString(element, uiaNameProperty)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	identifier, err := b.propertyString(element, uiaAutomationIDProperty)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	enabled, err := b.propertyBool(element, uiaIsEnabledProperty)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	focused, err := b.propertyBool(element, uiaHasKeyboardFocusProperty)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	actions, err := b.elementActions(element)
	if err != nil {
		return recorderElementDescriptor{}, false, windowsAccessibilityNativeError("recorder_target_read", err, AccessibilityActionNotStarted)
	}
	bounds, err := b.nativeBounds(element)
	if err != nil || bounds == nil || bounds.Width <= 0 || bounds.Height <= 0 ||
		bounds.X < math.MinInt32 || bounds.X > math.MaxInt32 || bounds.Y < math.MinInt32 || bounds.Y > math.MaxInt32 ||
		bounds.Width > math.MaxInt32 || bounds.Height > math.MaxInt32 {
		return recorderElementDescriptor{}, false, fmt.Errorf("UIA element has no usable physical bounds")
	}
	descriptor := recorderElementDescriptor{
		Role: role, NativeRole: nativeRole, Name: recorderAccessibilityString(name), Identifier: recorderAccessibilityString(identifier),
		Enabled: enabled, Focused: focused, ValueSettable: recorderContainsString(actions, "setValue"), NativeActions: append([]string{}, actions...),
		Bounds:      recorderWindowBounds{X: int(math.Round(bounds.X)), Y: int(math.Round(bounds.Y)), Width: int(math.Round(bounds.Width)), Height: int(math.Round(bounds.Height))},
		BoundsSpace: "windowsPhysicalScreen",
	}
	if err := recorderValidateElementDescriptor(descriptor); err != nil {
		return recorderElementDescriptor{}, false, err
	}
	return descriptor, false, nil
}

func recorderAccessibilityString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func recorderContainsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
