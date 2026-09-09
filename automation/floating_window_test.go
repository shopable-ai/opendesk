package automation

import (
	"errors"
	"opendesk/pkg/customui"
	"opendesk/pkg/customui/toolbar"
	"strings"
	"testing"
)

func TestFloatingWindowBuildsOrderedStructuredToolbarSpec(t *testing.T) {
	value := &floatingWindow{
		revision: 4,
		items: []floatingToolbarItem{
			{typeName: toolbar.ItemButton, id: "start", button: &floatingButton{spec: toolbar.ButtonSpec{ID: "start", Label: "Start", Icon: "play.fill", State: toolbar.ButtonState{Revision: 1}}}},
			{typeName: toolbar.ItemLabel, id: "status", label: &floatingLabel{spec: toolbar.LabelSpec{ID: "status", Text: "Ready", Width: 120, Alignment: toolbar.LabelAlignmentLeading, VerticalAlignment: toolbar.LabelVerticalAlignmentCenter, Tone: toolbar.LabelToneSuccess, Revision: 2}}},
			{typeName: toolbar.ItemSeparator, id: "actions-divider"},
			{typeName: toolbar.ItemButton, id: "stop", button: &floatingButton{spec: toolbar.ButtonSpec{ID: "stop", Label: "Stop", Icon: "stop.fill", State: toolbar.ButtonState{Disabled: true, Revision: 4}}}},
		},
	}
	spec := value.toolbarSpec()
	if spec.SchemaVersion != toolbar.SchemaVersion || spec.Revision != 4 {
		t.Fatalf("toolbar header = %#v", spec)
	}
	if spec.Orientation != toolbar.OrientationHorizontal {
		t.Fatalf("default toolbar orientation = %q, want %q", spec.Orientation, toolbar.OrientationHorizontal)
	}
	if len(spec.Items) != 4 || spec.Items[0].ID != "start" || spec.Items[1].Type != toolbar.ItemLabel || spec.Items[2].Type != toolbar.ItemSeparator || spec.Items[3].ID != "stop" {
		t.Fatalf("item declaration order changed: %#v", spec.Items)
	}
	if spec.Items[1].Label == nil || spec.Items[1].Label.Text != "Ready" || spec.Items[1].Label.VerticalAlignment != toolbar.LabelVerticalAlignmentCenter || spec.Items[1].Label.Tone != toolbar.LabelToneSuccess {
		t.Fatalf("label state changed: %#v", spec.Items[1])
	}
	if spec.Items[3].Button == nil || !spec.Items[3].Button.State.Disabled || spec.Items[3].Button.State.Revision != 4 {
		t.Fatalf("button state changed: %#v", spec.Items[3])
	}
}

func TestFloatingWindowRemoveLabelAlsoRemovesAdjacentStructuralItems(t *testing.T) {
	button := floatingToolbarItem{typeName: toolbar.ItemButton, id: "action", button: &floatingButton{spec: toolbar.ButtonSpec{ID: "action"}}}
	label := floatingToolbarItem{typeName: toolbar.ItemLabel, id: "status", label: &floatingLabel{spec: toolbar.LabelSpec{ID: "status"}}}
	value := &floatingWindow{items: []floatingToolbarItem{
		button,
		{typeName: toolbar.ItemSeparator, id: "divider"},
		label,
		{typeName: toolbar.ItemSpacer, id: "space"},
		{typeName: toolbar.ItemButton, id: "close", button: &floatingButton{spec: toolbar.ButtonSpec{ID: "close"}}},
	}}
	if !value.removeLabelItem("status") {
		t.Fatal("status label was not removed")
	}
	if len(value.items) != 2 || value.items[0].id != "action" || value.items[1].id != "close" {
		t.Fatalf("label removal left invalid structural items: %#v", value.items)
	}
}

func TestFloatingWindowRemoveButtonAlsoRemovesAdjacentStructuralItems(t *testing.T) {
	button := func(id string) floatingToolbarItem {
		return floatingToolbarItem{typeName: toolbar.ItemButton, id: id, button: &floatingButton{spec: toolbar.ButtonSpec{ID: id}}}
	}
	value := &floatingWindow{items: []floatingToolbarItem{
		button("first"),
		{typeName: toolbar.ItemSeparator, id: "first-divider"},
		button("middle"),
		{typeName: toolbar.ItemSpacer, id: "middle-space"},
		button("last"),
	}}
	if !value.removeButtonItem("middle") {
		t.Fatal("middle button was not removed")
	}
	if len(value.items) != 2 || value.items[0].id != "first" || value.items[1].id != "last" {
		t.Fatalf("middle removal left invalid structural items: %#v", value.items)
	}
	if value.removeButtonItem("missing") {
		t.Fatal("missing button unexpectedly reported as removed")
	}
}

func TestFloatingWindowPreservesVerticalToolbarOrientationAndLimit(t *testing.T) {
	value := &floatingWindow{orientation: toolbar.OrientationVertical, revision: 1}
	value.items = []floatingToolbarItem{{typeName: toolbar.ItemButton, id: "one", button: &floatingButton{spec: toolbar.ButtonSpec{ID: "one", Label: "One", Icon: "timer", State: toolbar.ButtonState{Revision: 1}}}}}
	spec := value.toolbarSpec()
	if spec.Orientation != toolbar.OrientationVertical {
		t.Fatalf("vertical toolbar orientation = %q", spec.Orientation)
	}
	if value.maxButtons() != toolbar.MaxVerticalButtons {
		t.Fatalf("vertical toolbar max = %d, want %d", value.maxButtons(), toolbar.MaxVerticalButtons)
	}
}

func TestFloatingWindowDerivesCompactHorizontalColumnsFromWrapConstraints(t *testing.T) {
	value := &floatingWindow{
		orientation: toolbar.OrientationHorizontal,
		layout:      floatingToolbarLayout{configured: true, maxColumns: 5, maxRows: 2},
		revision:    7,
	}
	for index := 0; index < 7; index++ {
		button := &floatingButton{spec: toolbar.ButtonSpec{
			ID: "button" + string(rune('A'+index)), Label: "Button", Icon: "timer",
			State: toolbar.ButtonState{Revision: uint64(index + 1)},
		}}
		value.items = append(value.items, floatingToolbarItem{typeName: toolbar.ItemButton, id: button.spec.ID, button: button})
	}
	spec := value.toolbarSpec()
	if spec.MaxColumns != 4 || spec.MaxRows != 2 {
		t.Fatalf("maxRows layout = %#v, want 4 columns and 2 rows", spec)
	}
	if value.maxButtons() != 10 {
		t.Fatalf("maxRows layout capacity = %d, want 10", value.maxButtons())
	}
	widthLayout := floatingToolbarLayoutFromDeclaration(floatingToolbarOptionsDeclaration{MaxWidth: testFloat64(252)})
	value.layout = widthLayout
	value.items = value.items[:6]
	if spec := value.toolbarSpec(); spec.MaxColumns != 5 || spec.MaxWidth != 252 {
		t.Fatalf("maxWidth layout = %#v, want 5 columns and maxWidth 252", spec)
	}
}

func testFloat64(value float64) *float64 { return &value }

func TestNewFloatingButtonRejectsInvalidInputs(t *testing.T) {
	tests := []struct {
		id, label, icon string
	}{
		{id: "bad id", label: "Run", icon: "play.fill"},
		{id: "run", label: " ", icon: "play.fill"},
		{id: "run", label: strings.Repeat("界", floatingMaxLabelRunes+1), icon: "play.fill"},
		{id: "run", label: "Run", icon: "https://example.com/icon.svg"},
		{id: "run", label: "Run", icon: "javascript:alert(1)"},
		{id: "run", label: "Run", icon: "../../icon.svg"},
		{id: "run", label: "Run", icon: "unknown.symbol"},
	}
	for _, test := range tests {
		_, err := newFloatingButton(test.id, test.label, test.icon)
		var uiErr *customui.Error
		if !errors.As(err, &uiErr) || uiErr.Code != customui.CodeInvalidSpec || uiErr.TargetID != test.id {
			t.Fatalf("newFloatingButton(%q, %q, %q) error = %#v", test.id, test.label, test.icon, err)
		}
	}
	button, err := newFloatingButton("record_1", "开始录制", "play.fill")
	if err != nil || button.spec.ID != "record_1" || button.spec.Label != "开始录制" {
		t.Fatalf("valid Unicode button = %#v, err=%v", button, err)
	}
}

func TestValidateFloatingLabelSpec(t *testing.T) {
	valid := toolbar.LabelSpec{ID: "status", Text: "录制中 00:12", Width: 120, Alignment: toolbar.LabelAlignmentLeading, VerticalAlignment: toolbar.LabelVerticalAlignmentCenter, Tone: toolbar.LabelToneSuccess}
	if err := validateFloatingLabelSpec(valid); err != nil {
		t.Fatalf("valid label rejected: %v", err)
	}
	for name, mutate := range map[string]func(*toolbar.LabelSpec){
		"id":                 func(value *toolbar.LabelSpec) { value.ID = "bad id" },
		"text":               func(value *toolbar.LabelSpec) { value.Text = " " },
		"long text":          func(value *toolbar.LabelSpec) { value.Text = strings.Repeat("界", toolbar.MaxLabelRunes+1) },
		"width":              func(value *toolbar.LabelSpec) { value.Width = toolbar.MaxLabelWidth + 1 },
		"alignment":          func(value *toolbar.LabelSpec) { value.Alignment = "justify" },
		"vertical alignment": func(value *toolbar.LabelSpec) { value.VerticalAlignment = "baseline" },
		"tone":               func(value *toolbar.LabelSpec) { value.Tone = "brand" },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := valid
			mutate(&candidate)
			if err := validateFloatingLabelSpec(candidate); err == nil {
				t.Fatalf("invalid label passed: %#v", candidate)
			}
		})
	}
}

func TestPublicFloatingLabelStateUsesNativeAlignmentReadback(t *testing.T) {
	spec := toolbar.LabelSpec{
		ID: "status", Text: "Declared", Width: 120, Alignment: toolbar.LabelAlignmentLeading,
		VerticalAlignment: toolbar.LabelVerticalAlignmentCenter, Tone: toolbar.LabelTonePrimary, Revision: 1,
	}
	native := toolbar.LabelResult{
		LabelSpec: toolbar.LabelSpec{
			ID: "status", Text: "Applied", Width: 120, Alignment: toolbar.LabelAlignmentCenter,
			VerticalAlignment: toolbar.LabelVerticalAlignmentBottom, Tone: toolbar.LabelToneSuccess, Revision: 2,
		},
		RenderedText: "Applied", AccessibilityName: "Applied", AccessibilityRole: "staticText", AccessibilityValue: "Applied",
		RenderedTextBounds: toolbar.Bounds{X: 42, Y: 4, Width: 36, Height: 16},
	}
	state := publicFloatingLabelState(spec, native)
	if state.Text != "Applied" || state.Alignment != toolbar.LabelAlignmentCenter || state.VerticalAlignment != toolbar.LabelVerticalAlignmentBottom || state.Revision != 2 {
		t.Fatalf("native label state was not authoritative: %#v", state)
	}
	if state.RenderedTextBounds != native.RenderedTextBounds || state.AccessibilityName != "Applied" || state.AccessibilityRole != "staticText" || state.AccessibilityValue != "Applied" {
		t.Fatalf("native label geometry/accessibility readback changed: %#v", state)
	}
}

func TestPublicFloatingControlStateUsesNativeDisabledReadback(t *testing.T) {
	spec := toolbar.ControlSpec{ID: "switch", Kind: toolbar.ItemSwitch, Label: "Sync", Width: 140, Revision: 1}
	nativeSpec := spec
	nativeSpec.Disabled = true
	native := toolbar.ControlResult{ControlSpec: nativeSpec, RenderedValue: true}
	state := publicFloatingControlState(spec, native)
	if disabled, ok := state["disabled"].(bool); !ok || !disabled {
		t.Fatalf("native disabled readback was not authoritative: %#v", state)
	}
}

func TestPublicFloatingButtonStateUsesLabelForTooltipFallback(t *testing.T) {
	spec := toolbar.ButtonSpec{ID: "save", Label: "保存当前任务", Icon: "tray.and.arrow.down.fill", State: toolbar.ButtonState{Revision: 1}}
	declared := publicFloatingButtonState(spec, toolbar.ButtonResult{})
	if declared.Tooltip != spec.Label || declared.AccessibilityName != spec.Label {
		t.Fatalf("pre-show semantic fallback = %#v", declared)
	}
	native := publicFloatingButtonState(spec, toolbar.ButtonResult{Tooltip: spec.Label, AccessibilityName: spec.Label})
	if native.Tooltip != spec.Label || native.AccessibilityName != spec.Label {
		t.Fatalf("native semantic readback = %#v", native)
	}
}

func TestFloatingImageErrorsExposeIconCapability(t *testing.T) {
	err := withFloatingOperationCapability(
		&customui.Error{Code: customui.CodeInvalidSpec, Message: "custom icon path must stay within the script directory"},
		"FloatingWindow.addButton", "toolbar-1", "unsafe", "icon",
	)
	var uiErr *customui.Error
	if !errors.As(err, &uiErr) {
		t.Fatalf("error = %#v, want *customui.Error", err)
	}
	if uiErr.Code != customui.CodeInvalidSpec || uiErr.Operation != "FloatingWindow.addButton" || uiErr.WindowID != "toolbar-1" || uiErr.TargetID != "unsafe" || uiErr.Capability != "icon" {
		t.Fatalf("structured custom image error = %#v", uiErr)
	}
}
