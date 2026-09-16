package customui

import "testing"

// Keep the product About surface pinned to the same constrained HTML contract
// enforced by Normalize. This regression covers the production failure where a
// browser-valid <h1> reached createWindow but Custom UI v1 rejected it.
func TestOpenDeskAboutMarkupIsValidCustomUIV1(t *testing.T) {
	spec := WindowSpec{
		ID:     "aboutOpenDesk1",
		Kind:   "normal",
		Theme:  "dark",
		Bounds: Bounds{Width: 420, Height: 300},
		Content: ContentSpec{
			HTML: `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
				<div class="mark">OD</div>
				<div class="product-name">OpenDesk</div>
				<p class="version">Version 2.0.1</p>
				<p class="description">Agent-driven desktop automation</p>
				<p class="copyright">© 2026 OpenDesk</p>
				<div class="actions"><button id="website">OpenDesk Website</button><button id="close">Close</button></div>
			</main></body></html>`,
			CSS: `html,body{height:100%;margin:0}main{height:100%;display:flex}.product-name{font-size:22px}.actions{display:flex}button:hover{cursor:pointer}`,
		},
	}

	normalized, err := Normalize(spec, t.TempDir())
	if err != nil {
		t.Fatalf("About markup must satisfy Custom UI v1: %v", err)
	}
	if len(normalized.Controls) != 2 {
		t.Fatalf("About controls=%d want=2", len(normalized.Controls))
	}
	if normalized.Controls[0].ID != "website" || normalized.Controls[0].Type != "button" {
		t.Fatalf("first About control=%+v want website button", normalized.Controls[0])
	}
	if normalized.Controls[1].ID != "close" || normalized.Controls[1].Type != "button" {
		t.Fatalf("second About control=%+v want close button", normalized.Controls[1])
	}
}

func TestCustomUIV1StillRejectsHeadingElementUsedByBrokenAbout(t *testing.T) {
	spec := WindowSpec{
		ID:      "brokenAbout",
		Kind:    "normal",
		Bounds:  Bounds{Width: 420, Height: 300},
		Content: ContentSpec{HTML: `<html><body><h1>OpenDesk</h1></body></html>`},
	}
	if _, err := Normalize(spec, t.TempDir()); err == nil {
		t.Fatal("Custom UI v1 unexpectedly accepted h1; regression test no longer describes the original About failure")
	}
}
