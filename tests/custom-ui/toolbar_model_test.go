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

func TestToolbarLabelGeometryAndWrapping(t *testing.T) {
	label := func(id string, width float64) ToolbarItemSpec {
		return LabelItem(LabelSpec{ID: id, Text: id, Width: width, Alignment: LabelAlignmentLeading, VerticalAlignment: LabelVerticalAlignmentCenter, Tone: LabelTonePrimary, Revision: 1})
	}
	button := ButtonItem(ButtonSpec{ID: "run", Label: "Run", Icon: "timer", State: ButtonState{Revision: 1}})
	plan, err := Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2,
		Items: []ToolbarItemSpec{label("status", 120), button, label("detail", 80)},
	})
	if err != nil || len(plan.Rows) != 2 || plan.OuterWidth != 188 || plan.OuterHeight != 129 {
		t.Fatalf("horizontal label plan = %#v, err=%v", plan, err)
	}
	vertical, err := Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationVertical, MaxColumns: 1,
		Items: []ToolbarItemSpec{label("status", 120)},
	})
	if err != nil || vertical.OuterWidth != 140 || vertical.OuterHeight != 81 {
		t.Fatalf("vertical label plan = %#v, err=%v", vertical, err)
	}
	_, err = Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 1, MaxWidth: 100,
		Items: []ToolbarItemSpec{label("tooWide", 120)},
	})
	if err == nil {
		t.Fatal("label wider than maxWidth unexpectedly passed")
	}
}

func TestToolbarContentItemsShareHeightGapPaddingAndDeclaredWidths(t *testing.T) {
	button := ButtonItem(ButtonSpec{ID: "run", Label: "Run", Icon: "timer", State: ButtonState{Revision: 1}})
	label := LabelItem(LabelSpec{ID: "status", Text: "Ready", Width: 120, Alignment: LabelAlignmentLeading, VerticalAlignment: LabelVerticalAlignmentCenter, Tone: LabelTonePrimary, Revision: 1})
	control := ControlItem(ControlSpec{ID: "query", Kind: ItemInput, Label: "Query", Width: 180, MaxLength: 32, Revision: 1})
	for _, item := range []ToolbarItemSpec{button, label, control} {
		_, height := item.VisualSize(OrientationHorizontal)
		if height != ContentItemHeight {
			t.Fatalf("%s height = %v, want shared %v", item.Type, height, ContentItemHeight)
		}
	}
	buttonWidth, _ := button.VisualSize(OrientationHorizontal)
	labelWidth, _ := label.VisualSize(OrientationHorizontal)
	controlWidth, _ := control.VisualSize(OrientationHorizontal)
	if buttonWidth != 40 || labelWidth != 120 || controlWidth != 180 {
		t.Fatalf("declared widths = button %v label %v control %v", buttonWidth, labelWidth, controlWidth)
	}
	plan, err := Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2,
		Items: []ToolbarItemSpec{button, label, control},
	})
	if err != nil || len(plan.Rows) != 2 || plan.OuterWidth != 200 || plan.OuterHeight != 129 {
		t.Fatalf("mixed content layout = %#v, err=%v", plan, err)
	}
	vertical, err := Plan(ToolbarSpec{
		SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationVertical, MaxColumns: 1,
		Items: []ToolbarItemSpec{button, label, control},
	})
	if err != nil || vertical.OuterWidth != 200 || vertical.OuterHeight != 177 {
		t.Fatalf("mixed vertical content layout = %#v, err=%v", vertical, err)
	}
	if ContentItemGap != 8 || HorizontalPadding != 10 || VerticalPadding != 8 {
		t.Fatalf("shared toolbar spacing = gap %v padding %v/%v", ContentItemGap, HorizontalPadding, VerticalPadding)
	}
}

func TestToolbarNativeControlValidationAndGeometry(t *testing.T) {
	controls := []ControlSpec{
		{ID: "toggle", Kind: ItemSwitch, Label: "Enabled", Width: 140, Checked: true, Revision: 1},
		{ID: "include", Kind: ItemCheckbox, Label: "Include logs", Width: 140, Revision: 1},
		{ID: "name", Kind: ItemInput, Label: "Name", Width: 180, Text: "draft", Placeholder: "Task name", MaxLength: 32, Revision: 1},
		{ID: "mode", Kind: ItemSelect, Label: "Mode", Width: 160, Selected: "safe", Options: []OptionSpec{{Value: "safe", Label: "Safe"}, {Value: "fast", Label: "Fast"}}, Revision: 1},
		{ID: "speed", Kind: ItemSlider, Label: "Speed", Width: 180, Min: 0, Max: 10, Step: 1, Value: 4, Revision: 1},
		{ID: "scope", Kind: ItemSegmented, Label: "Scope", Width: 200, Selected: "page", Options: []OptionSpec{{Value: "page", Label: "Page"}, {Value: "app", Label: "App"}}, Revision: 1},
		{ID: "work", Kind: ItemProgress, Label: "Work", Width: 160, Min: 0, Max: 1, Value: .25, Revision: 1},
	}
	items := make([]ToolbarItemSpec, 0, len(controls))
	for _, control := range controls {
		if err := ValidateControlSpec(control); err != nil {
			t.Fatalf("valid %s control rejected: %v", control.Kind, err)
		}
		items = append(items, ControlItem(control))
	}
	plan, err := Plan(ToolbarSpec{SchemaVersion: SchemaVersion, Revision: 1, Orientation: OrientationHorizontal, MaxColumns: 2, Items: items})
	if err != nil || len(plan.Rows) != 4 || plan.OuterHeight != 225 {
		t.Fatalf("control layout = %#v, err=%v", plan, err)
	}
	invalid := controls[3]
	invalid.Selected = "missing"
	if err := ValidateControlSpec(invalid); err == nil {
		t.Fatal("select value outside options unexpectedly passed")
	}
	invalid = controls[4]
	invalid.Value = 11
	if err := ValidateControlSpec(invalid); err == nil {
		t.Fatal("out-of-range slider unexpectedly passed")
	}
	updated := controls[3]
	updated.Selected = "fast"
	updated.Disabled = true
	updated.Revision++
	if !SameControlDeclaration(controls[3], updated) {
		t.Fatal("mutable choice state changed its native declaration")
	}
	updated.Options = append([]OptionSpec(nil), updated.Options...)
	updated.Options[0].Label = "Safer"
	if SameControlDeclaration(controls[3], updated) {
		t.Fatal("choice option mutation was accepted as a stable declaration")
	}
	if ValidateBadge("999") != nil || ValidateBadge("NEW!") != nil || ValidateBadge("TOO-LONG") == nil {
		t.Fatal("button badge bounds changed")
	}
}
