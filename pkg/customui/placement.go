package customui

import (
	"math"
	"strings"
)

const (
	PlacementLeft   = "left"
	PlacementCenter = "center"
	PlacementRight  = "right"
	PlacementTop    = "top"
	PlacementBottom = "bottom"

	PlacementDisplayActive  = "active"
	PlacementDisplayCurrent = "current"
	PlacementDisplayPrimary = "primary"
)

// NormalizeWindowPlacement validates and fills the framework-owned screen
// placement declaration shared by generic Custom UI windows and native
// FloatingWindow toolbars. Placement always targets the selected display's
// visible work area, not its raw full-screen bounds.
func NormalizeWindowPlacement(value WindowPlacement) (WindowPlacement, error) {
	value.Horizontal = strings.TrimSpace(value.Horizontal)
	value.Vertical = strings.TrimSpace(value.Vertical)
	value.Display = strings.TrimSpace(value.Display)
	if value.Display == "" {
		value.Display = PlacementDisplayActive
	}
	if value.Horizontal != PlacementLeft && value.Horizontal != PlacementCenter && value.Horizontal != PlacementRight {
		return WindowPlacement{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: `placement.horizontal must be "left", "center", or "right"`}
	}
	if value.Vertical != PlacementTop && value.Vertical != PlacementCenter && value.Vertical != PlacementBottom {
		return WindowPlacement{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: `placement.vertical must be "top", "center", or "bottom"`}
	}
	if value.Display != PlacementDisplayActive && value.Display != PlacementDisplayCurrent && value.Display != PlacementDisplayPrimary {
		return WindowPlacement{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: `placement.display must be "active", "current", or "primary"`}
	}
	if math.IsNaN(value.Margin) || math.IsInf(value.Margin, 0) || value.Margin < 0 {
		return WindowPlacement{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: "placement.margin must be a non-negative finite number"}
	}
	return value, nil
}

// NormalizeInitialWindowPlacement validates placement used while a window is
// being declared. "current" is intentionally a runtime-only selector: before
// native creation there is no current display for the window to belong to.
func NormalizeInitialWindowPlacement(value WindowPlacement) (WindowPlacement, error) {
	value, err := NormalizeWindowPlacement(value)
	if err != nil {
		return WindowPlacement{}, err
	}
	if value.Display == PlacementDisplayCurrent {
		return WindowPlacement{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: `placement.display "current" is available only through setPlacement() after window creation`}
	}
	return value, nil
}

// ResolveWindowPlacement computes a top-left logical desktop frame within one
// usable display work area. Drivers obtain the work area from their native
// platform; keeping the geometry policy here gives memory tests the identical
// no-clipping and margin-overflow behavior without pretending to be a native
// display implementation.
func ResolveWindowPlacement(bounds Bounds, placement WindowPlacement, workArea Bounds) (Bounds, error) {
	placement, err := NormalizeWindowPlacement(placement)
	if err != nil {
		return Bounds{}, err
	}
	if !validBounds(bounds) || !validBounds(workArea) {
		return Bounds{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: "window bounds and selected display work area must be finite positive rectangles"}
	}
	horizontalFits := bounds.Width <= workArea.Width
	verticalFits := bounds.Height <= workArea.Height
	if placement.Horizontal != PlacementCenter {
		horizontalFits = bounds.Width+placement.Margin <= workArea.Width
	}
	if placement.Vertical != PlacementCenter {
		verticalFits = bounds.Height+placement.Margin <= workArea.Height
	}
	if !horizontalFits || !verticalFits {
		return Bounds{}, &Error{Code: CodeInvalidSpec, Capability: "placement", Message: "window and placement margin do not fit the selected display work area"}
	}
	if placement.Horizontal == PlacementLeft {
		bounds.X = workArea.X + placement.Margin
	} else if placement.Horizontal == PlacementCenter {
		bounds.X = workArea.X + (workArea.Width-bounds.Width)/2
	} else {
		bounds.X = workArea.X + workArea.Width - placement.Margin - bounds.Width
	}
	if placement.Vertical == PlacementTop {
		bounds.Y = workArea.Y + placement.Margin
	} else if placement.Vertical == PlacementCenter {
		bounds.Y = workArea.Y + (workArea.Height-bounds.Height)/2
	} else {
		bounds.Y = workArea.Y + workArea.Height - placement.Margin - bounds.Height
	}
	return bounds, nil
}

// NormalizeRelativePlacement validates a current-anchor placement request. Its
// policy is deliberately shared by the native hosts and memory driver: honour
// the first preferred side that fits, otherwise clamp the first side to the
// anchor display's work area.
func NormalizeRelativePlacement(value RelativePlacement) (RelativePlacement, error) {
	if !validBounds(value.Anchor) {
		return RelativePlacement{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "relative anchor must be a finite positive rectangle"}
	}
	if len(value.PreferredSides) == 0 || len(value.PreferredSides) > 4 {
		return RelativePlacement{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "preferredSides must contain between one and four sides"}
	}
	seen := map[string]bool{}
	for _, side := range value.PreferredSides {
		if side != "above" && side != "below" && side != "left" && side != "right" || seen[side] {
			return RelativePlacement{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "preferredSides may contain each of above, below, left, or right at most once"}
		}
		seen[side] = true
	}
	if value.Align == "" {
		value.Align = "center"
	}
	if value.Align != "start" && value.Align != "center" && value.Align != "end" {
		return RelativePlacement{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "relative align must be start, center, or end"}
	}
	if math.IsNaN(value.Gap) || math.IsInf(value.Gap, 0) || value.Gap < 0 {
		return RelativePlacement{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "relative gap must be a non-negative finite number"}
	}
	return value, nil
}

// ResolveRelativePlacement computes a work-area-contained frame in the same
// desktop coordinate space as anchor. It never invents an absolute display
// origin, so negative-origin displays remain valid.
func ResolveRelativePlacement(bounds Bounds, value RelativePlacement, workArea Bounds) (Bounds, error) {
	value, err := NormalizeRelativePlacement(value)
	if err != nil {
		return Bounds{}, err
	}
	if !validBounds(bounds) || !validBounds(workArea) || bounds.Width > workArea.Width || bounds.Height > workArea.Height {
		return Bounds{}, &Error{Code: CodeInvalidSpec, Capability: "relativePlacement", Message: "window must fit the anchor display work area"}
	}
	place := func(side string) Bounds {
		candidate := Bounds{Width: bounds.Width, Height: bounds.Height}
		if side == "above" || side == "below" {
			switch value.Align {
			case "start":
				candidate.X = value.Anchor.X
			case "end":
				candidate.X = value.Anchor.X + value.Anchor.Width - bounds.Width
			default:
				candidate.X = value.Anchor.X + (value.Anchor.Width-bounds.Width)/2
			}
			if side == "above" {
				candidate.Y = value.Anchor.Y - bounds.Height - value.Gap
			} else {
				candidate.Y = value.Anchor.Y + value.Anchor.Height + value.Gap
			}
		} else {
			switch value.Align {
			case "start":
				candidate.Y = value.Anchor.Y
			case "end":
				candidate.Y = value.Anchor.Y + value.Anchor.Height - bounds.Height
			default:
				candidate.Y = value.Anchor.Y + (value.Anchor.Height-bounds.Height)/2
			}
			if side == "left" {
				candidate.X = value.Anchor.X - bounds.Width - value.Gap
			} else {
				candidate.X = value.Anchor.X + value.Anchor.Width + value.Gap
			}
		}
		return candidate
	}
	contains := func(candidate Bounds) bool {
		return candidate.X >= workArea.X && candidate.Y >= workArea.Y && candidate.X+candidate.Width <= workArea.X+workArea.Width && candidate.Y+candidate.Height <= workArea.Y+workArea.Height
	}
	candidate := place(value.PreferredSides[0])
	for _, side := range value.PreferredSides {
		candidate = place(side)
		if contains(candidate) {
			return candidate, nil
		}
	}
	candidate.X = math.Max(workArea.X, math.Min(candidate.X, workArea.X+workArea.Width-candidate.Width))
	candidate.Y = math.Max(workArea.Y, math.Min(candidate.Y, workArea.Y+workArea.Height-candidate.Height))
	return candidate, nil
}
