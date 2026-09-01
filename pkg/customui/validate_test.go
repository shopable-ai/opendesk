package customui

import (
	"context"
	"errors"
	"fmt"
	"math"
	"opendesk/pkg/customui/toolbar"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNormalizeRejectsNonFiniteBounds(t *testing.T) {
	for name, bounds := range map[string]Bounds{
		"nan x":          {X: math.NaN(), Width: 320, Height: 180},
		"infinite y":     {Y: math.Inf(1), Width: 320, Height: 180},
		"infinite width": {Width: math.Inf(1), Height: 180},
		"nan height":     {Width: 320, Height: math.NaN()},
	} {
		t.Run(name, func(t *testing.T) {
			spec := testWindowSpec("finiteBounds")
			spec.Bounds = bounds
			if _, err := Normalize(spec, t.TempDir()); err == nil {
				t.Fatal("non-finite bounds unexpectedly passed validation")
			}
		})
	}
}

func TestNormalizeToolbarOrientationPolicy(t *testing.T) {
	button := func(id string) toolbar.ButtonSpec {
		return toolbar.ButtonSpec{ID: id, Label: id, Icon: "timer", State: toolbar.ButtonState{Revision: 1}}
	}
	base := func(orientation string, buttons []toolbar.ButtonSpec) WindowSpec {
		return WindowSpec{
			ID: "nativeToolbar", Bounds: Bounds{X: 10, Y: 20},
			Toolbar: &toolbar.ToolbarSpec{SchemaVersion: toolbar.SchemaVersion, Revision: 1, Orientation: orientation, Buttons: buttons},
		}
	}
	for _, orientation := range []string{toolbar.OrientationHorizontal, toolbar.OrientationVertical} {
		spec, err := Normalize(base(orientation, []toolbar.ButtonSpec{button("one")}), t.TempDir())
		if err != nil || spec.Toolbar.Orientation != orientation {
			t.Fatalf("Normalize(%q) = %#v, err=%v", orientation, spec.Toolbar, err)
		}
	}
	defaulted, err := Normalize(base("", []toolbar.ButtonSpec{button("default")}), t.TempDir())
	if err != nil || defaulted.Toolbar.Orientation != toolbar.OrientationHorizontal {
		t.Fatalf("empty orientation = %#v, err=%v", defaulted.Toolbar, err)
	}
	_, err = Normalize(base("diagonal", []toolbar.ButtonSpec{button("bad")}), t.TempDir())
	var uiErr *Error
	if err == nil || !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Capability != "orientation" {
		t.Fatalf("invalid orientation error = %#v", err)
	}
	tooMany := make([]toolbar.ButtonSpec, 0, toolbar.MaxVerticalButtons+1)
	for index := 0; index < toolbar.MaxVerticalButtons+1; index++ {
		tooMany = append(tooMany, button(fmt.Sprintf("button%d", index)))
	}
	if _, err := Normalize(base(toolbar.OrientationVertical, tooMany), t.TempDir()); err == nil {
		t.Fatal("six-button vertical toolbar unexpectedly passed")
	}
}

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

func TestNormalizeLoadsRelativeHTMLPathFromHTMLField(t *testing.T) {
	dir := t.TempDir()
	views := filepath.Join(dir, "views")
	if err := os.MkdirAll(views, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(views, "panel.html"), []byte(`<header id="drag" data-clawdesk-drag>Panel</header><button id="save">Save</button>`), 0o600); err != nil {
		t.Fatal(err)
	}

	spec, err := Normalize(WindowSpec{
		ID: "panel", Bounds: Bounds{Width: 300, Height: 200},
		Content: ContentSpec{HTML: "./views/panel.html"},
	}, dir)
	if err != nil {
		t.Fatal(err)
	}
	realDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	if spec.Content.File != filepath.Join(realDir, "views", "panel.html") || spec.Content.BasePath != filepath.Join(realDir, "views") {
		t.Fatalf("relative html path was not normalized: %#v", spec.Content)
	}
	if got := spec.Controls; !reflect.DeepEqual(got, []Control{{ID: "drag", Type: "container", Order: 0}, {ID: "save", Type: "button", Order: 1}}) {
		t.Fatalf("controls = %#v", got)
	}
}

func TestNormalizeExtractsInlineStylesFromHTMLFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "panel.html"), []byte(`<!doctype html><html><head><style>.panel{color:blue}</style><style>button{padding:8px}</style></head><body><div id="panel" class="panel">Panel</div><button id="save">Save</button></body></html>`), 0o600); err != nil {
		t.Fatal(err)
	}

	spec, err := Normalize(WindowSpec{
		ID: "panel", Bounds: Bounds{Width: 300, Height: 200},
		Content: ContentSpec{HTML: "./panel.html", CSS: `button{color:white}`},
	}, dir)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(spec.Content.HTML), "<style") {
		t.Fatalf("normalized HTML still contains style elements: %q", spec.Content.HTML)
	}
	for _, css := range []string{".panel{color:blue}", "button{padding:8px}", "button{color:white}"} {
		if !strings.Contains(spec.Content.CSS, css) {
			t.Fatalf("normalized CSS missing %q: %q", css, spec.Content.CSS)
		}
	}
	if strings.Index(spec.Content.CSS, ".panel{color:blue}") > strings.Index(spec.Content.CSS, "button{color:white}") {
		t.Fatalf("inline CSS must precede caller CSS: %q", spec.Content.CSS)
	}
	want := []Control{{ID: "panel", Type: "container", Order: 0}, {ID: "save", Type: "button", Order: 1}}
	if !reflect.DeepEqual(spec.Controls, want) {
		t.Fatalf("controls = %#v, want %#v", spec.Controls, want)
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
		{name: "style element image set", html: `<style>.x{background:image-set("https://example.com/a.png" 1x)}</style><div id="box">A</div>`, code: CodeInvalidSpec},
		{name: "style cannot become control", html: `<style id="theme">body{color:white}</style><button id="save">A</button>`, code: CodeInvalidSpec},
		{name: "option cannot become control", html: `<select id="mode"><option id="unsafe" value="x">X</option></select>`, code: CodeInvalidSpec},
		{name: "css escape", html: `<style>.x{background:u\72l(https://example.com/a.png)}</style><div id="box">A</div>`, code: CodeInvalidSpec},
		{name: "svg data image", html: `<img id="logo" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">`, code: CodeInvalidSpec},
		{name: "file input", html: `<input id="upload" type="file">`, code: CodeInvalidSpec},
		{name: "multiple select", html: `<select id="mode" multiple><option value="a">A</option></select>`, code: CodeInvalidSpec},
		{name: "drag region missing id", html: `<div data-clawdesk-drag>Drag</div>`, code: CodeInvalidSpec},
		{name: "interactive drag region", html: `<button id="drag" data-clawdesk-drag>Drag</button>`, code: CodeInvalidSpec},
		{name: "invalid drag value", html: `<header id="drag" data-clawdesk-drag="sometimes">Drag</header>`, code: CodeInvalidSpec},
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

func TestNormalizeRejectsDeclaredDerivedOrUnsupportedFields(t *testing.T) {
	base := WindowSpec{ID: "panel", Bounds: Bounds{Width: 300, Height: 200}, Content: ContentSpec{HTML: `<button id="save">Save</button>`}}
	tests := []struct {
		name       string
		mutate     func(*WindowSpec)
		code       string
		capability string
	}{
		{name: "derived controls", mutate: func(spec *WindowSpec) { spec.Controls = []Control{} }, code: CodeInvalidSpec},
		{name: "empty assets map", mutate: func(spec *WindowSpec) { spec.Content.Assets = map[string]string{} }, code: CodeInvalidSpec},
		{name: "unimplemented theme", mutate: func(spec *WindowSpec) { spec.Theme = "contrast" }, code: CodeUnsupportedCapability, capability: "theme"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			spec := base
			test.mutate(&spec)
			_, err := Normalize(spec, t.TempDir())
			var uiErr *Error
			if !errors.As(err, &uiErr) || uiErr.Code != test.code || uiErr.Capability != test.capability {
				t.Fatalf("error = %#v", err)
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
	tests := []struct {
		name    string
		content ContentSpec
	}{
		{name: "explicit absolute path", content: ContentSpec{File: outsideHTML}},
		{name: "explicit parent path", content: ContentSpec{File: filepath.Join("..", filepath.Base(outside), "outside.html")}},
		{name: "explicit symlink", content: ContentSpec{File: link}},
		{name: "html parent path", content: ContentSpec{HTML: filepath.Join("..", filepath.Base(outside), "outside.html")}},
		{name: "html symlink", content: ContentSpec{HTML: "escape.html"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Normalize(WindowSpec{ID: "panel", Bounds: Bounds{Width: 300, Height: 200}, Content: test.content}, root)
			var uiErr *Error
			if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec {
				t.Fatalf("content %#v error = %#v", test.content, err)
			}
		})
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

func TestButtonStatePatchUsesOnlyTrustedToolbarIcons(t *testing.T) {
	driver := NewMemoryDriver()
	session, err := NewSession("toolbar-state", t.TempDir(), driver, nil)
	if err != nil {
		t.Fatal(err)
	}
	window, err := session.Create(context.Background(), WindowSpec{
		ID: "toolbar", Theme: "dark", Bounds: Bounds{Width: 240, Height: 81},
		Content: ContentSpec{HTML: `<button id="startPause">开始</button><span id="status">Idle</span>`},
	})
	if err != nil {
		t.Fatal(err)
	}
	icon, text, errorState := "pause.fill", "暂停", "intentional"
	active, busy := true, true
	state, err := window.UpdateControl(context.Background(), "startPause", ControlPatch{
		Text: &text, Icon: &icon, Active: &active, Busy: &busy, Error: &errorState,
	})
	if err != nil || state.Text != text || state.Icon != icon || !state.Active || !state.Busy || state.Error != errorState {
		t.Fatalf("button state = %#v, err=%v", state, err)
	}
	unknown := "https://example.com/icon.svg"
	_, err = window.UpdateControl(context.Background(), "startPause", ControlPatch{Icon: &unknown})
	var uiErr *Error
	if !errors.As(err, &uiErr) || uiErr.Code != CodeInvalidSpec || uiErr.Capability != "icon" || uiErr.TargetID != "startPause" {
		t.Fatalf("unknown icon error = %#v", err)
	}
	_, err = window.UpdateControl(context.Background(), "status", ControlPatch{Icon: &icon})
	if !errors.As(err, &uiErr) || uiErr.Code != CodeUnsupportedCapability || uiErr.Capability != "icon" {
		t.Fatalf("non-button icon error = %#v", err)
	}
}
