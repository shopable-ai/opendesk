package toolbar_test

import (
	"sort"
	"testing"

	. "opendesk/pkg/customui/toolbar"
)

func TestGeneratedIconRegistryIsCompleteAndOrdered(t *testing.T) {
	got := IconNames()
	if len(got) != 160 {
		t.Fatalf("IconNames() count = %d, want 160", len(got))
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

func TestGeneratedIconRegistryCoversAIAutomationWorkflows(t *testing.T) {
	want := map[string]string{
		"ai.assistant":         "brain",
		"ai.generate":          "wand.and.rays",
		"ai.analyze":           "doc.text.magnifyingglass",
		"ai.search":            "text.magnifyingglass",
		"automation.run":       "arrow.triangle.2.circlepath",
		"automation.schedule":  "clock.arrow.circlepath",
		"automation.trigger":   "bolt.circle.fill",
		"automation.configure": "gearshape.2.fill",
		"automation.review":    "rectangle.and.hand.point.up.left.fill",
		"automation.approve":   "hand.tap.fill",
	}
	for name, symbol := range want {
		presentation, ok := IconPresentationFor(name)
		if !ok || presentation.SystemSymbol != symbol {
			t.Fatalf("semantic presentation for %q = %#v, ok=%t; want system symbol %q", name, presentation, ok, symbol)
		}
		if token, ok := IconToken(name); !ok || token == "" {
			t.Fatalf("semantic token for %q = %q, ok=%t", name, token, ok)
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

func TestToolbarItemPlannerKeepsBoundariesBetweenActionGroups(t *testing.T) {
	button := func(id string) ToolbarItemSpec {
		return ButtonItem(ButtonSpec{ID: id, Label: id, Icon: "timer", State: ButtonState{Revision: 1}})
	}
	separator := ToolbarItemSpec{Type: ItemSeparator, ID: "divider"}
	spacer := ToolbarItemSpec{Type: ItemSpacer, ID: "space"}

	plan, err := Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2,
		Items: []ToolbarItemSpec{button("one"), button("two"), separator, button("three"), button("four")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Rows) != 2 || len(plan.Rows[0]) != 2 || len(plan.Rows[1]) != 2 {
		t.Fatalf("natural wrap plan = %#v", plan.Rows)
	}
	for _, row := range plan.Rows {
		for _, item := range row {
			if item.Type == ItemSeparator {
				t.Fatalf("separator was rendered at a natural row boundary: %#v", plan.Rows)
			}
		}
	}

	plan, err = Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 4,
		Items: []ToolbarItemSpec{button("one"), button("two"), separator, button("three"), button("four")},
	})
	if err != nil || len(plan.Rows) != 1 || len(plan.Rows[0]) != 5 || plan.Rows[0][2].Type != ItemSeparator {
		t.Fatalf("same-row separator plan = %#v, err=%v", plan, err)
	}

	plan, err = Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2, MaxWidth: 108,
		Items: []ToolbarItemSpec{button("one"), separator, button("two")},
	})
	if err != nil || len(plan.Rows) != 2 || plan.OuterWidth != 60 {
		t.Fatalf("width-boundary plan = %#v, err=%v", plan, err)
	}
	if SpacerGroupGap != 8 || SpacerIntrinsicSize != 0 {
		t.Fatalf("spacer geometry = intrinsic %v, group gap %v; want 0 and 8", SpacerIntrinsicSize, SpacerGroupGap)
	}
	plan, err = Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2, MaxWidth: 108,
		Items: []ToolbarItemSpec{button("one"), spacer, button("two")},
	})
	if err != nil || len(plan.Rows) != 1 || len(plan.Rows[0]) != 3 || plan.Rows[0][1].Type != ItemSpacer || plan.OuterWidth != 108 {
		t.Fatalf("fixed-spacer plan = %#v, err=%v", plan, err)
	}

	plan, err = Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationVertical, MaxColumns: 1,
		Items: []ToolbarItemSpec{button("one"), separator, button("two")},
	})
	if err != nil || plan.OuterWidth != 60 || plan.OuterHeight != 138 || len(plan.Rows) != 1 || len(plan.Rows[0]) != 3 {
		t.Fatalf("vertical separator plan = %#v, err=%v", plan, err)
	}
}
