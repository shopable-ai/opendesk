package customui

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestMemoryDriverRetainsImageSourcePatches(t *testing.T) {
	driver := NewMemoryDriver()
	root := t.TempDir()
	for _, name := range []string{"before.png", "after.png"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	session, err := NewSession("source-patch", root, driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), WindowSpec{
		ID:      "panel",
		Bounds:  Bounds{Width: 320, Height: 180},
		Content: ContentSpec{HTML: `<img id="preview" src="before.png">`},
	})
	if err != nil {
		t.Fatal(err)
	}
	if state, err := window.ControlState(context.Background(), "preview"); err != nil || state.Source != "before.png" {
		t.Fatalf("initial source state = %#v, err=%v", state, err)
	}
	after := "after.png"
	state, err := window.UpdateControl(context.Background(), "preview", ControlPatch{Source: &after})
	if err != nil || state.Source != after {
		t.Fatalf("patched source state = %#v, err=%v", state, err)
	}
	readback, ok := driver.ControlSnapshot("source-patch", "panel", "preview")
	if !ok || readback.Source != after {
		t.Fatalf("memory readback = %#v, exists=%v", readback, ok)
	}
}
