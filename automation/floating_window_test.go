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
		revision: 3,
		buttons: []floatingButton{
			{spec: toolbar.ButtonSpec{ID: "start", Label: "Start", Icon: "play.fill", State: toolbar.ButtonState{Revision: 1}}},
			{spec: toolbar.ButtonSpec{ID: "stop", Label: "Stop", Icon: "stop.fill", State: toolbar.ButtonState{Disabled: true, Revision: 3}}},
		},
	}
	spec := value.toolbarSpec()
	if spec.SchemaVersion != toolbar.SchemaVersion || spec.Revision != 3 {
		t.Fatalf("toolbar header = %#v", spec)
	}
	if len(spec.Buttons) != 2 || spec.Buttons[0].ID != "start" || spec.Buttons[1].ID != "stop" {
		t.Fatalf("declaration order changed: %#v", spec.Buttons)
	}
	if !spec.Buttons[1].State.Disabled || spec.Buttons[1].State.Revision != 3 {
		t.Fatalf("button state changed: %#v", spec.Buttons[1])
	}
}

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
