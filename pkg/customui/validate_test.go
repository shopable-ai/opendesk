package customui

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeBuildsStableControlOrder(t *testing.T) {
	baseDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(baseDir, "preview.png"), []byte("fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	spec, err := Normalize(WindowSpec{
		ID:     "toolbar",
		Kind:   "floating",
		Bounds: Bounds{X: 20, Y: 30, Width: 420, Height: 160},
		Content: ContentSpec{HTML: `<!doctype html><html><body>
			<button id="record">Record</button>
			<span id="status">Idle</span>
			<img id="preview" src="preview.png">
			<input id="enabled" type="checkbox" role="switch">
			<input id="name">
			<select id="mode"><option value="safe">Safe</option></select>
		</body></html>`},
	}, baseDir)
	if err != nil {
		t.Fatal(err)
	}
	want := []Control{
		{ID: "record", Type: "button", Order: 0},
		{ID: "status", Type: "text", Order: 1},
		{ID: "preview", Type: "img", Order: 2},
		{ID: "enabled", Type: "switch", Order: 3},
		{ID: "name", Type: "input", Order: 4},
		{ID: "mode", Type: "select", Order: 5},
	}
	if !reflect.DeepEqual(spec.Controls, want) {
		t.Fatalf("controls = %#v, want %#v", spec.Controls, want)
	}
	if spec.Theme != "system" {
		t.Fatalf("theme = %q, want system", spec.Theme)
	}
}

func TestNormalizeLoadsFilesRelativeToScript(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "panel.html"), []byte(`<button id="save">Save</button>`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "panel.css"), []byte(`button { color: blue; }`), 0o600); err != nil {
		t.Fatal(err)
	}
	spec, err := Normalize(WindowSpec{
		ID: "panel", Bounds: Bounds{Width: 300, Height: 200},
		Content: ContentSpec{File: "panel.html", CSSFile: "panel.css"},
	}, dir)
	if err != nil {
		t.Fatal(err)
	}
	realDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	if spec.Content.File != filepath.Join(realDir, "panel.html") || spec.Content.BasePath != realDir {
		t.Fatalf("paths were not normalized: %#v", spec.Content)
	}
	if spec.Content.CSS == "" || len(spec.Controls) != 1 || spec.Controls[0].ID != "save" {
		t.Fatalf("file declaration was not loaded: %#v", spec)
	}
}

func TestNormalizeRejectsUnsafeOrAmbiguousHTML(t *testing.T) {
	tests := []struct {
		name string
		html string
		code string
	}{
		{name: "missing stable id", html: `<button>Save</button>`, code: CodeInvalidSpec},
		{name: "duplicate id", html: `<button id="save">A</button><button id="save">B</button>`, code: CodeDuplicateID},
		{name: "inline handler", html: `<button id="save" onclick="danger()">A</button>`, code: CodeInvalidSpec},
		{name: "page script", html: `<script>danger()</script>`, code: CodeInvalidSpec},
		{name: "remote resource", html: `<img id="logo" src="https://example.com/logo.png">`, code: CodeInvalidSpec},
		{name: "parent resource", html: `<img id="logo" src="../../secret.png">`, code: CodeInvalidSpec},
		{name: "meta refresh", html: `<meta http-equiv="refresh" content="0;url=data:text/html,<script>alert(1)</script>"><button id="save">A</button>`, code: CodeInvalidSpec},
		{name: "srcset", html: `<img id="logo" srcset="https://example.com/a.png 1x">`, code: CodeInvalidSpec},
		{name: "inline style url", html: `<div id="box" style="background: url( https://example.com/a.png )">A</div>`, code: CodeInvalidSpec},
		{name: "style element url", html: `<style>.x{background:u/**/rl(https://example.com/a.png)}</style><div id="box">A</div>`, code: CodeInvalidSpec},
		{name: "css escape", html: `<style>.x{background:u\72l(https://example.com/a.png)}</style><div id="box">A</div>`, code: CodeInvalidSpec},
		{name: "svg data image", html: `<img id="logo" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">`, code: CodeInvalidSpec},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Normalize(WindowSpec{ID: "panel", Bounds: Bounds{Width: 300, Height: 200}, Content: ContentSpec{HTML: test.html}}, t.TempDir())
			var uiErr *Error
			if !errors.As(err, &uiErr) || uiErr.Code != test.code {
				t.Fatalf("error = %#v, want code %s", err, test.code)
			}
		})
	}
}

func TestNormalizeRejectsPathsOutsideScriptRoot(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	outsideHTML := filepath.Join(outside, "outside.html")
	if err := os.WriteFile(outsideHTML, []byte(`<button id="save">Save</button>`), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "escape.html")
	if err := os.Symlink(outsideHTML, link); err != nil {
		t.Fatal(err)
	}
	for _, file := range []string{outsideHTML, filepath.Join("..", filepath.Base(outside), "outside.html"), link} {
		_, err := Normalize(WindowSpec{ID: "panel", Bounds: Bounds{Width: 300, Height: 200}, Content: ContentSpec{File: file}}, root)
		var uiErr *Error
		if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec {
			t.Fatalf("file %q error = %#v", file, err)
		}
	}
}

func TestNormalizeValidatesInitialAndUpdatedImageSources(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"first.png", "second.png"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("fixture"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	driver := NewMemoryDriver()
	session, err := NewSession("images", root, driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), WindowSpec{
		ID: "panel", Bounds: Bounds{Width: 300, Height: 200},
		Content: ContentSpec{HTML: `<img id="preview" src="first.png"><button id="save">Save</button>`},
	})
	if err != nil {
		t.Fatal(err)
	}
	valid := "second.png"
	if _, err := window.UpdateControl(context.Background(), "preview", ControlPatch{Source: &valid}); err != nil {
		t.Fatalf("valid local image update failed: %v", err)
	}
	for _, source := range []string{"https://example.com/a.png", "../outside.png", "file:///tmp/a.png"} {
		_, err := window.UpdateControl(context.Background(), "preview", ControlPatch{Source: &source})
		var uiErr *Error
		if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Operation != "updateControl" || uiErr.WindowID != "panel" || uiErr.TargetID != "preview" {
			t.Fatalf("source %q error = %#v", source, err)
		}
	}
	_, err = window.UpdateControl(context.Background(), "save", ControlPatch{Source: &valid})
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeUnsupportedCapability || uiErr.Capability != "source" {
		t.Fatalf("wrong control type error = %#v", err)
	}
	_, err = window.UpdateControl(context.Background(), "save", ControlPatch{})
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec {
		t.Fatalf("empty patch error = %#v", err)
	}
}
