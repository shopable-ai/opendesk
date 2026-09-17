package automation

import (
	"testing"

	"opendesk/pkg/customui"
)

func TestCustomUIWindowDeclarationCarriesChrome(t *testing.T) {
	bounds := customui.Bounds{Width: 320, Height: 180}
	declaration := customUIWindowDeclaration{
		ID:     "promotionPreview",
		Kind:   "floating",
		Title:  "Promotion",
		Chrome: "none",
		Bounds: &bounds,
		Content: customUIContentDeclaration{
			HTML: `<div id="content">ok</div>`,
		},
	}
	spec, err := declaration.windowSpec()
	if err != nil {
		t.Fatalf("windowSpec: %v", err)
	}
	if spec.Chrome != "none" {
		t.Fatalf("chrome = %q, want none", spec.Chrome)
	}
}
