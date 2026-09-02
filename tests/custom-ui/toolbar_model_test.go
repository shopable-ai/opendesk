package toolbar_test

import (
	"sort"
	"testing"

	. "opendesk/pkg/customui/toolbar"
)

func TestGeneratedIconRegistryIsCompleteAndOrdered(t *testing.T) {
	got := IconNames()
	if len(got) != 150 {
		t.Fatalf("IconNames() count = %d, want 150", len(got))
	}
	if !sort.StringsAreSorted(got) {
		t.Fatalf("IconNames() is not sorted: %q", got)
	}
	for _, name := range []string{
		"arrow.clockwise", "gearshape.fill", "paperplane.fill", "person.2.fill", "play.fill",
		"qrcode", "timer", "video.fill", "wifi",
	} {
		presentation, ok := IconPresentationFor(name)
		if !ok || presentation.SystemSymbol != name {
			t.Fatalf("presentation for %q = %#v, ok=%t", name, presentation, ok)
		}
		if _, ok := IconToken(name); !ok {
			t.Fatalf("token for %q is missing", name)
		}
	}
}

func TestGeneratedIconRegistryFailsClosed(t *testing.T) {
	for _, value := range []string{
		"", " play.fill", "play.fill ", "play", "fallback",
		"https://example.com/icon.svg", "/tmp/icon.svg", "../icon.svg", "javascript:alert(1)",
	} {
		if _, ok := IconToken(value); ok {
			t.Fatalf("unsafe or unknown icon %q unexpectedly resolved", value)
		}
		if _, ok := IconPresentationFor(value); ok {
			t.Fatalf("unsafe or unknown presentation %q unexpectedly resolved", value)
		}
	}
}

func TestToolbarOrientationPolicy(t *testing.T) {
	if !IsValidOrientation(OrientationHorizontal) || !IsValidOrientation(OrientationVertical) {
		t.Fatal("supported toolbar orientations were rejected")
	}
	if IsValidOrientation("diagonal") {
		t.Fatal("unknown toolbar orientation was accepted")
	}
	if MaxButtonsForOrientation(OrientationHorizontal) != MaxButtons {
		t.Fatalf("horizontal max changed: %d", MaxButtonsForOrientation(OrientationHorizontal))
	}
	if MaxButtonsForOrientation(OrientationVertical) != MaxVerticalButtons {
		t.Fatalf("vertical max = %d, want %d", MaxButtonsForOrientation(OrientationVertical), MaxVerticalButtons)
	}
}

func TestHorizontalWrappingLayoutPolicy(t *testing.T) {
	for width, want := range map[float64]int{60: 1, 108: 2, 252: 5, 960: 19} {
		if got := MaxColumnsForWidth(width); got != want {
			t.Fatalf("MaxColumnsForWidth(%v) = %d, want %d", width, got, want)
		}
	}
	for _, item := range []struct {
		buttons, maxColumns, maxRows, wantColumns int
		ok                                        bool
	}{
		{buttons: 6, maxColumns: 5, maxRows: 0, wantColumns: 5, ok: true},
		{buttons: 5, maxColumns: 2, maxRows: 0, wantColumns: 2, ok: true},
		{buttons: 7, maxColumns: MaxColumns, maxRows: 2, wantColumns: 4, ok: true},
		{buttons: 5, maxColumns: 2, maxRows: 2, wantColumns: 0, ok: false},
	} {
		got, ok := ColumnsForButtonCount(item.buttons, item.maxColumns, item.maxRows)
		if got != item.wantColumns || ok != item.ok {
			t.Fatalf("ColumnsForButtonCount(%d, %d, %d) = (%d, %t), want (%d, %t)", item.buttons, item.maxColumns, item.maxRows, got, ok, item.wantColumns, item.ok)
		}
	}
	if got := MaxButtonsForLayout(OrientationHorizontal, 2, 2); got != 4 {
		t.Fatalf("two-column two-row capacity = %d, want 4", got)
	}
	if got := MaxButtonsForLayout(OrientationHorizontal, MaxColumns, 2); got != MaxButtons {
		t.Fatalf("default two-row capacity = %d, want %d", got, MaxButtons)
	}
}
