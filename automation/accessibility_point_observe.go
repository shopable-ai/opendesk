package automation

import (
	"context"
	"fmt"
	"runtime"
)

// AccessibilityPointEvidence is a read-only projection of the existing
// Recorder Accessibility/UIA point probe. It intentionally carries only
// semantic identity and screen-logical geometry: no native handles, values,
// selected text, or mutable actions cross this boundary.
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

// AccessibilityPointObservation reuses the existing native Recorder point-hit
// implementation rather than creating another AX/UIA runtime. Elements are
// ordered from the point hit toward progressively larger ancestors/containers.
type AccessibilityPointObservation struct {
	Source   string                       `json:"source"`
	Elements []AccessibilityPointEvidence `json:"elements"`
}

// ObserveAccessibilityAtPoint observes the semantic UI hierarchy at one
// screen-logical point inside an already-resolved exact window. It is
// side-effect free. Platform permission, stale-window, timeout, and native
// backend errors are returned to the caller instead of being converted to an
// empty success.
func ObserveAccessibilityAtPoint(ctx context.Context, window *WindowInfo, x, y int) (*AccessibilityPointObservation, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if window == nil || window.ID == "" || window.ProcessID == 0 || window.Handle == 0 || window.Width <= 0 || window.Height <= 0 {
		return nil, fmt.Errorf("accessibility point observation requires an exact resolved window")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	probe := newRecorderTargetProbe()
	if probe == nil {
		return nil, fmt.Errorf("accessibility point observation is unavailable")
	}
	snapshot, err := probe(ctx, window, recorderTargetPoint{X: x, Y: y, InputSpace: "screen-logical"})
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		return nil, fmt.Errorf("accessibility point observation returned no evidence")
	}

	source := "accessibility"
	switch runtime.GOOS {
	case "darwin":
		source = "ax"
	case "windows":
		source = "uia"
	}
	result := &AccessibilityPointObservation{Source: source}
	seen := map[string]bool{}
	appendDescriptor := func(relation string, descriptor recorderElementDescriptor) {
		if descriptor.Bounds.Width <= 0 || descriptor.Bounds.Height <= 0 || descriptor.BoundsSpace != "screen-logical" {
			return
		}
		key := fmt.Sprintf("%d:%d:%d:%d:%s:%s:%s", descriptor.Bounds.X, descriptor.Bounds.Y, descriptor.Bounds.Width, descriptor.Bounds.Height, descriptor.Role, descriptor.Name, descriptor.Identifier)
		if seen[key] {
			return
		}
		seen[key] = true
		result.Elements = append(result.Elements, AccessibilityPointEvidence{
			Relation: relation,
			Source: source,
			Role: descriptor.Role,
			NativeRole: descriptor.NativeRole,
			Subrole: descriptor.Subrole,
			Name: descriptor.Name,
			Identifier: descriptor.Identifier,
			Enabled: descriptor.Enabled,
			Focused: descriptor.Focused,
			Actions: append([]string(nil), descriptor.NativeActions...),
			Bounds: AccessibilityScreenBounds{
				X: float64(descriptor.Bounds.X), Y: float64(descriptor.Bounds.Y),
				Width: float64(descriptor.Bounds.Width), Height: float64(descriptor.Bounds.Height),
				CoordinateSpace: "screen-logical",
			},
		})
	}

	appendDescriptor("hit", snapshot.Hit)
	for _, descriptor := range snapshot.Ancestors {
		appendDescriptor("ancestor", descriptor)
	}
	for _, descriptor := range snapshot.Containers {
		appendDescriptor("container", descriptor)
	}
	if len(result.Elements) == 0 {
		return nil, fmt.Errorf("accessibility point observation contains no bounded semantic element")
	}
	return result, nil
}
