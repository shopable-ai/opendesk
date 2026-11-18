package automation

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/dop251/goja"
)

func TestMouseMutationsFailBeforeOSInputWhenPermissionCheckFails(t *testing.T) {
	denied := errors.New("PERMISSION_DENIED: test permission is not granted")
	mouse := NewMouse()
	checks := 0
	mouse.inputPermissionCheck = func() error {
		checks++
		return denied
	}

	operations := []struct {
		name string
		run  func() error
	}{
		{"click", func() error { return mouse.Click(10, 10, nil) }},
		{"move", func() error { return mouse.Move(10, 10, nil) }},
		{"down", func() error { return mouse.Down(nil) }},
		{"up", func() error { return mouse.Up(nil) }},
		{"wheel", func() error { return mouse.Wheel(map[string]interface{}{"deltaY": 1}) }},
	}
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			if err := operation.run(); !errors.Is(err, denied) {
				t.Fatalf("error=%v, want permission denial", err)
			}
		})
	}
	if checks != len(operations) {
		t.Fatalf("permission checks=%d, want %d", checks, len(operations))
	}
}

func TestMouseValidatesArgumentsBeforePermissionCheckAndSkipsNoopWheel(t *testing.T) {
	mouse := NewMouse()
	checks := 0
	mouse.inputPermissionCheck = func() error {
		checks++
		return errors.New("permission check should not run")
	}
	if err := mouse.Click(0, 0, map[string]interface{}{"button": "invalid"}); err == nil || !strings.Contains(err.Error(), "invalid button") {
		t.Fatalf("invalid click error=%v", err)
	}
	if err := mouse.Move(0, 0, map[string]interface{}{"durationMs": 0}); err == nil || !strings.Contains(err.Error(), "durationMs") {
		t.Fatalf("invalid move error=%v", err)
	}
	if err := mouse.Wheel(map[string]interface{}{"deltaX": 0, "deltaY": 0}); err != nil {
		t.Fatalf("no-op wheel error=%v", err)
	}
	if checks != 0 {
		t.Fatalf("permission checks=%d, want 0", checks)
	}
}

func TestMouseCoordinateJSBinding(t *testing.T) {
	rt := goja.New()
	mouse := NewMouse()
	checks := 0
	calls := make([][]any, 0)
	mouse.inputPermissionCheck = func() error {
		checks++
		return nil
	}
	mouse.dispatchClick = func(x, y int, options MouseOptions) error {
		calls = append(calls, []any{"click", x, y, options.Button, options.ClickCount, options.Delay})
		return nil
	}
	mouse.dispatchMove = func(x, y int, options mouseMoveOptions) error {
		calls = append(calls, []any{"move", x, y, options.steps, options.curve})
		return nil
	}

	page := &Page{Mouse: mouse, Keyboard: NewKeyboard()}
	if err := MapPageToJS(rt, page); err != nil {
		t.Fatal(err)
	}
	mappedPage := rt.Get("page")
	mouseMethods := mapMouseToJS(rt, mouse)
	for name, value := range map[string]any{
		"mouse":        mouseMethods,
		"page":         map[string]any{"mouse": mouseMethods},
		"mappedPage":   mappedPage,
		"returnedPage": autoMapPageResult(rt, page),
		"mouseBoundaryState": func() map[string]any {
			return map[string]any{"checks": checks, "calls": calls}
		},
	} {
		if err := rt.Set(name, value); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{
		"../polyfills/005-geometry.js",
		"../tests/runtime-api/seams/mouse-coordinates.js",
	} {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := rt.RunScript(path, string(source)); err != nil {
			t.Fatal(err)
		}
	}
}
