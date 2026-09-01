package automation

import (
	"opendesk/pkg/customui"
	"strconv"
	"strings"
	"testing"

	"github.com/dop251/goja"
)

func TestParseDialogOptionsAllowsOmittedOptionalFields(t *testing.T) {
	runtime := goja.New()
	value, err := runtime.RunString(`({title: "OpenDesk", message: "ready", level: "info", okText: "Continue"})`)
	if err != nil {
		t.Fatal(err)
	}
	options, err := parseDialogOptions(runtime, dialogAlert, value)
	if err != nil {
		t.Fatalf("parse partial alert options: %v", err)
	}
	if options.Message != "ready" || options.OKText != "Continue" || options.Title != "OpenDesk" {
		t.Fatalf("unexpected parsed options: %#v", options)
	}
}

func TestParseDialogOptionsRejectsUnknownAndSensitiveLimits(t *testing.T) {
	runtime := goja.New()
	for _, source := range []string{
		`({message: "ready", html: "<script>"})`,
		`({message: "ready", secure: true})`,
		`({message: "ready", maxLength: NaN})`,
		`({message: "", secure: true})`,
		`({message: "ready", level: "urgent"})`,
		`({message: "ready", defaultAction: "later"})`,
		`({message: "ready", confirmText: ""})`,
		`Object.create({message: "ready", html: "<script>"})`,
	} {
		value, err := runtime.RunString(source)
		if err != nil {
			t.Fatal(err)
		}
		kind := dialogAlert
		if strings.Contains(source, "defaultAction") || strings.Contains(source, "confirmText") {
			kind = dialogConfirm
		}
		_, err = parseDialogOptions(runtime, kind, value)
		if err == nil {
			t.Fatalf("expected invalid options for %s", source)
		}
		if strings.Contains(err.Error(), "<script>") {
			t.Fatalf("validation error leaked supplied content: %v", err)
		}
	}

	promptValue, err := runtime.RunString(`({message: "secret", secure: true, maxLength: 7, defaultValue: "secret"})`)
	if err != nil {
		t.Fatal(err)
	}
	options, err := parseDialogOptions(runtime, dialogPrompt, promptValue)
	if err != nil {
		t.Fatalf("parse secure prompt options: %v", err)
	}
	if !options.Secure || options.MaxLength != 7 || options.DefaultValue != "secret" {
		t.Fatalf("unexpected secure prompt options: %#v", options)
	}
}

func TestParseDialogOptionsEnforcesEveryTextLimit(t *testing.T) {
	runtime := goja.New()
	tests := []struct {
		name   string
		kind   dialogKind
		source string
	}{
		{"title", dialogAlert, `({title: "` + strings.Repeat("t", dialogMaxTitleRunes+1) + `", message: "ready"})`},
		{"message", dialogAlert, `({message: "` + strings.Repeat("m", dialogMaxMessageRunes+1) + `"})`},
		{"okText", dialogAlert, `({message: "ready", okText: "` + strings.Repeat("b", dialogMaxButtonRunes+1) + `"})`},
		{"confirmText", dialogConfirm, `({message: "ready", confirmText: "` + strings.Repeat("b", dialogMaxButtonRunes+1) + `"})`},
		{"cancelText", dialogConfirm, `({message: "ready", cancelText: "` + strings.Repeat("b", dialogMaxButtonRunes+1) + `"})`},
		{"defaultValue", dialogPrompt, `({message: "ready", maxLength: 1, defaultValue: "xx"})`},
		{"placeholder", dialogPrompt, `({message: "ready", placeholder: "` + strings.Repeat("p", dialogMaxPlaceholderRunes+1) + `"})`},
		{"hard input limit", dialogPrompt, `({message: "ready", maxLength: ` + strconv.Itoa(dialogHardMaxInputRunes+1) + `})`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value, err := runtime.RunString(test.source)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := parseDialogOptions(runtime, test.kind, value); err == nil {
				t.Fatal("expected a bounded Dialog option error")
			}
		})
	}
}

func TestDialogWindowSpecIsHostCenteredAndNormal(t *testing.T) {
	spec := buildDialogWindowSpec(&activeDialog{
		id:   "dialog-1",
		kind: dialogPrompt,
		options: dialogOptions{
			Title: "OpenDesk", Message: "Name", Level: dialogInfo,
			ConfirmText: "OK", CancelText: "Cancel", DefaultAction: "confirm",
			MaxLength: dialogDefaultInputRunes,
		},
	})
	if spec.Kind != "normal" || !spec.CenterOnActiveDisplay || spec.Bounds.X != 0 || spec.Bounds.Y != 0 || spec.Bounds.Width <= 0 || spec.Bounds.Height <= 0 {
		t.Fatalf("unexpected host-owned Dialog window spec: %#v", spec)
	}
	if spec.Bounds.Width != dialogWindowWidth || spec.Bounds.Height != dialogPromptWindowHeight {
		t.Fatalf("prompt frame lost the reviewed compact dimensions: %#v", spec.Bounds)
	}
	normalized, err := customui.Normalize(spec, ".")
	if err != nil {
		t.Fatalf("normalize host-owned Dialog template: %v", err)
	}
	derived := make(map[string]string, len(normalized.Controls))
	for _, control := range normalized.Controls {
		derived[control.ID] = control.Type
	}
	if derived[dialogInputControlID] != "input" || derived[dialogCancelControlID] != "button" || derived[dialogConfirmControlID] != "button" {
		t.Fatalf("Dialog prompt did not derive its bounded native accessibility controls: %#v", normalized.Controls)
	}
	if strings.Contains(spec.Content.HTML, "<script") || !strings.Contains(spec.Content.HTML, `type="text"`) {
		t.Fatalf("Dialog HTML is not the fixed host template")
	}
	if strings.Contains(spec.Content.HTML, `dialogInputLabel`) || !strings.Contains(spec.Content.HTML, `class="dialog-message"`) {
		t.Fatalf("Dialog prompt did not keep the compact message-to-input layout")
	}
	css := dialogCSS()
	for _, selector := range []string{`height:100%`, `grid-template-columns:30px`, `justify-content:flex-end`, `margin-top:auto`, `padding:20px 22px 18px`, `margin-top:-4px`} {
		if !strings.Contains(css, selector) {
			t.Fatalf("Dialog layout lost required Apple-style spacing rule %q", selector)
		}
	}
}

func TestDialogActionWindowKindsShareCompactHeight(t *testing.T) {
	for _, kind := range []dialogKind{dialogAlert, dialogConfirm} {
		spec := buildDialogWindowSpec(&activeDialog{
			id: string(kind), kind: kind,
			options: dialogOptions{Title: "OpenDesk", Message: "Message", Level: dialogInfo,
				OKText: "OK", ConfirmText: "OK", CancelText: "Cancel", DefaultAction: "confirm"},
		})
		if spec.Bounds.Width != dialogWindowWidth || spec.Bounds.Height != dialogActionWindowHeight {
			t.Fatalf("%s frame lost the reviewed compact dimensions: %#v", kind, spec.Bounds)
		}
	}
}
