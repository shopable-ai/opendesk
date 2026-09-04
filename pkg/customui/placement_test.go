package customui

import (
	"context"
	"errors"
	"math"
	"testing"
)

func TestNormalizeWindowPlacementCoversNineAnchors(t *testing.T) {
	for _, horizontal := range []string{PlacementLeft, PlacementCenter, PlacementRight} {
		for _, vertical := range []string{PlacementTop, PlacementCenter, PlacementBottom} {
			placement, err := NormalizeWindowPlacement(WindowPlacement{
				Horizontal: horizontal,
				Vertical:   vertical,
				Margin:     16,
			})
			if err != nil {
				t.Fatalf("normalize %s/%s: %v", horizontal, vertical, err)
			}
			if placement.Display != PlacementDisplayActive {
				t.Fatalf("default display = %q, want active", placement.Display)
			}
		}
	}
}

func TestNormalizeWindowPlacementRejectsInvalidFields(t *testing.T) {
	for _, placement := range []WindowPlacement{
		{Horizontal: "leading", Vertical: PlacementCenter},
		{Horizontal: PlacementRight, Vertical: "middle"},
		{Horizontal: PlacementRight, Vertical: PlacementCenter, Display: "secondary"},
		{Horizontal: PlacementRight, Vertical: PlacementCenter, Margin: -1},
		{Horizontal: PlacementRight, Vertical: PlacementCenter, Margin: math.NaN()},
	} {
		_, err := NormalizeWindowPlacement(placement)
		var uiErr *Error
		if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Capability != "placement" {
			t.Fatalf("invalid placement %#v returned %#v", placement, err)
		}
	}
}

func TestNormalizeInitialWindowPlacementRejectsCurrentDisplay(t *testing.T) {
	_, err := NormalizeInitialWindowPlacement(WindowPlacement{
		Horizontal: PlacementRight,
		Vertical:   PlacementCenter,
		Display:    PlacementDisplayCurrent,
	})
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Capability != "placement" {
		t.Fatalf("initial current placement returned %#v", err)
	}

	placement, err := NormalizeInitialWindowPlacement(WindowPlacement{
		Horizontal: PlacementRight,
		Vertical:   PlacementCenter,
	})
	if err != nil || placement.Display != PlacementDisplayActive {
		t.Fatalf("initial active placement = %#v, err = %v", placement, err)
	}
}

func TestMemoryWindowAppliesInitialAndDynamicPlacement(t *testing.T) {
	driver := NewMemoryDriver()
	session, err := NewSession("placement", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	spec := testWindowSpec("placedPanel")
	spec.Placement = &WindowPlacement{
		Horizontal: PlacementRight,
		Vertical:   PlacementCenter,
		Margin:     16,
		Display:    PlacementDisplayPrimary,
	}
	window, err := session.Create(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	state, err := window.State(context.Background())
	if err != nil || state.Bounds.X != 1104 || state.Bounds.Y != 360 {
		t.Fatalf("initial placement state = %#v, err = %v", state, err)
	}
	state, err = window.SetPlacement(context.Background(), WindowPlacement{
		Horizontal: PlacementLeft,
		Vertical:   PlacementBottom,
		Margin:     8,
		Display:    PlacementDisplayCurrent,
	})
	if err != nil || state.Bounds.X != 8 || state.Bounds.Y != 712 {
		t.Fatalf("dynamic placement state = %#v, err = %v", state, err)
	}
}

func TestResolveWindowPlacementUsesNegativeWorkAreaAndRejectsOverflow(t *testing.T) {
	workArea := Bounds{X: -1920, Y: -40, Width: 1920, Height: 1040}
	placed, err := ResolveWindowPlacement(Bounds{Width: 420, Height: 180}, WindowPlacement{
		Horizontal: PlacementRight, Vertical: PlacementBottom, Margin: 24,
	}, workArea)
	if err != nil {
		t.Fatal(err)
	}
	if placed.X != -444 || placed.Y != 796 {
		t.Fatalf("negative work-area placement = %#v", placed)
	}
	_, err = ResolveWindowPlacement(Bounds{Width: 1910, Height: 180}, WindowPlacement{
		Horizontal: PlacementRight, Vertical: PlacementCenter, Margin: 24,
	}, workArea)
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Capability != "placement" {
		t.Fatalf("overflow placement returned %#v", err)
	}
}
