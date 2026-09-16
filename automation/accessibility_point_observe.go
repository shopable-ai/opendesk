package automation

import (
	"context"
	"fmt"
	"math"
	"runtime"
	"strings"
	"time"
)

// AccessibilityPointEvidence is a read-only projection of OpenDesk's existing
// Accessibility/UIA backend. It intentionally carries only semantic identity
// and verified screen-logical geometry: no native handles, values, selected
// text, or mutable actions cross this boundary.
type AccessibilityPointEvidence struct {
	Relation   string                    `json:"relation"`
	Source     string                    `json:"source"`
	Role       string                    `json:"role,omitempty"`
	NativeRole string                    `json:"nativeRole,omitempty"`
	Subrole    string                    `json:"subrole,omitempty"`
	Name       string                    `json:"name,omitempty"`
	Identifier string                    `json:"identifier,omitempty"`
	Enabled    *bool                     `json:"enabled,omitempty"`
	Focused    *bool                     `json:"focused,omitempty"`
	Actions    []string                  `json:"actions,omitempty"`
	Bounds     AccessibilityScreenBounds `json:"bounds"`
}

// AccessibilityPointObservation reuses the existing native AX/UIA backend and
// scopes observation to the exact target window. This is intentionally not a
// desktop ElementFromPoint hit: a topmost Measurement Surface must never hide
// the underlying target hierarchy from Measurement candidate discovery.
type AccessibilityPointObservation struct {
	Source   string                       `json:"source"`
	Complete bool                         `json:"complete"`
	Reason   string                       `json:"reason,omitempty"`
	Elements []AccessibilityPointEvidence `json:"elements"`
}

// ObserveAccessibilityAtPoint snapshots one already-resolved exact target
// window, then returns the bounded semantic hierarchy containing the supplied
// OpenDesk screen-logical point. The native worker is locked to one OS thread,
// matching AccessibilityRuntime's ownership requirement (notably Windows COM).
//
// Native AX/UIA coordinates are converted through the exact window root bounds
// instead of being assumed to equal OpenDesk logical coordinates. On Windows
// this turns UIA physical pixels into per-window logical coordinates; on macOS
// it proves the same affine mapping against the exact AXWindow bounds. Provider
// errors are returned honestly and no UI action is performed.
func ObserveAccessibilityAtPoint(ctx context.Context, window *WindowInfo, x, y int) (*AccessibilityPointObservation, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if window == nil || window.ID == "" || window.ProcessID == 0 || window.Handle == 0 || window.Width <= 0 || window.Height <= 0 {
		return nil, fmt.Errorf("accessibility point observation requires an exact resolved window")
	}
	if x < int(window.X) || y < int(window.Y) || x > int(window.X+window.Width) || y > int(window.Y+window.Height) {
		return nil, fmt.Errorf("accessibility point observation is outside the exact target window")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	backend := newDefaultAccessibilityBackend()
	if backend == nil {
		return nil, fmt.Errorf("accessibility point observation is unavailable")
	}
	if err := backend.Initialize(ctx); err != nil {
		_ = backend.Close()
		return nil, err
	}
	defer backend.Close()

	timeout := accessibilityDefaultTimeout
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
		if timeout <= 0 {
			return nil, context.DeadlineExceeded
		}
		if timeout > accessibilityMaximumTimeout {
			timeout = accessibilityMaximumTimeout
		}
	}
	scope := AccessibilityScope{
		Kind:   AccessibilityScopeWindow,
		PID:    int64(window.ProcessID),
		Target: AccessibilityTargetIdentity{PID: int64(window.ProcessID), ExecutablePath: window.ExePath},
		Window: &AccessibilityWindowIdentity{
			ID: window.ID, PID: int64(window.ProcessID), Handle: window.Handle, Title: window.Title,
			X: int64(window.X), Y: int64(window.Y), Width: int64(window.Width), Height: int64(window.Height),
			IsForeground: window.IsForeground,
		},
	}
	data, err := backend.Snapshot(ctx, scope, AccessibilityLimits{Timeout: timeout, MaxDepth: 20, MaxNodes: 2500})
	if err != nil {
		return nil, err
	}
	if data.Root == nil {
		return nil, fmt.Errorf("accessibility exact-window snapshot returned no root")
	}
	rootNative := data.Root.NativeBounds
	if rootNative == nil || !finitePositiveAccessibilityBounds(rootNative) {
		return nil, fmt.Errorf("accessibility exact-window root has no usable native bounds")
	}

	scaleX := rootNative.Width / float64(window.Width)
	scaleY := rootNative.Height / float64(window.Height)
	if math.IsNaN(scaleX) || math.IsInf(scaleX, 0) || math.IsNaN(scaleY) || math.IsInf(scaleY, 0) || scaleX <= 0 || scaleY <= 0 {
		return nil, fmt.Errorf("accessibility exact-window coordinate mapping is unavailable")
	}

	source := accessibilityObservationSource(backend.Name())
	pointX, pointY := float64(x), float64(y)
	ordered := make([]AccessibilityPointEvidence, 0, 12)
	var walk func(AccessibilityNode, bool)
	walk = func(node AccessibilityNode, root bool) {
		bounds, ok := accessibilityNodeLogicalBounds(node, rootNative, window, scaleX, scaleY)
		if !ok || pointX < bounds.X || pointY < bounds.Y || pointX > bounds.X+bounds.Width || pointY > bounds.Y+bounds.Height {
			return
		}
		for _, child := range node.Children {
			walk(child, false)
		}
		if root || node.Role == "application" || node.Role == "window" {
			return
		}
		name, identifier, subrole := accessibilityOptionalString(node.Name), accessibilityOptionalString(node.Identifier), accessibilityOptionalString(node.NativeSubrole)
		ordered = append(ordered, AccessibilityPointEvidence{
			Relation: "ancestor", Source: source, Role: node.Role, NativeRole: node.NativeRole,
			Subrole: subrole, Name: name, Identifier: identifier, Enabled: node.Enabled, Focused: node.Focused,
			Actions: append([]string(nil), node.Actions...), Bounds: bounds,
		})
	}
	walk(*data.Root, true)
	if len(ordered) == 0 {
		return &AccessibilityPointObservation{Source: source, Complete: data.Complete, Reason: data.Reason}, fmt.Errorf("accessibility exact-window snapshot contains no bounded semantic element at point")
	}
	ordered[0].Relation = "hit"
	return &AccessibilityPointObservation{Source: source, Complete: data.Complete, Reason: data.Reason, Elements: ordered}, nil
}

func finitePositiveAccessibilityBounds(bounds *AccessibilityNativeBounds) bool {
	if bounds == nil || bounds.Width <= 0 || bounds.Height <= 0 {
		return false
	}
	for _, value := range []float64{bounds.X, bounds.Y, bounds.Width, bounds.Height} {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return true
}

func accessibilityNodeLogicalBounds(node AccessibilityNode, root *AccessibilityNativeBounds, window *WindowInfo, scaleX, scaleY float64) (AccessibilityScreenBounds, bool) {
	if node.Bounds != nil && node.Bounds.Width > 0 && node.Bounds.Height > 0 && strings.Contains(strings.ToLower(node.Bounds.CoordinateSpace), "screen") {
		return *node.Bounds, true
	}
	if node.NativeBounds == nil || !finitePositiveAccessibilityBounds(node.NativeBounds) || root == nil || window == nil {
		return AccessibilityScreenBounds{}, false
	}
	bounds := node.NativeBounds
	return AccessibilityScreenBounds{
		X:               float64(window.X) + (bounds.X-root.X)/scaleX,
		Y:               float64(window.Y) + (bounds.Y-root.Y)/scaleY,
		Width:           bounds.Width / scaleX,
		Height:          bounds.Height / scaleY,
		CoordinateSpace: "screen-logical",
	}, true
}

func accessibilityObservationSource(backend string) string {
	backend = strings.ToLower(strings.TrimSpace(backend))
	switch {
	case strings.Contains(backend, "macos"), strings.Contains(backend, "ax"):
		return "ax"
	case strings.Contains(backend, "windows"), strings.Contains(backend, "uia"):
		return "uia"
	default:
		return "accessibility"
	}
}

func accessibilityOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
