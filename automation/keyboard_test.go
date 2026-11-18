package automation

import (
	"errors"
	"os"
	"testing"

	"github.com/dop251/goja"
)

func TestNormalizeKeyNameMapsPublicMetaToRobotgoModifierFlag(t *testing.T) {
	if got := normalizeKeyName("Meta"); got != "cmd" {
		t.Fatalf("normalizeKeyName(Meta)=%q, want robotgo modifier flag cmd", got)
	}
}

// The private backend callbacks let the JavaScript contract assert actual
// dispatch counts and payloads without sending input or reading the display.
func TestInputBoundaryBackendDispatch(t *testing.T) {
	var keys = make([][]any, 0)
	var pixels = make([][2]int, 0)
	keyboard := &Keyboard{send: func(key, action string, modifiers []string) error {
		keys = append(keys, []any{key, action, append([]string{}, modifiers...)})
		if key == "F24" {
			return errors.New("fixture backend refused key")
		}
		return nil
	}}
	screen := &Screen{readPixel: func(x, y int) string {
		pixels = append(pixels, [2]int{x, y})
		return map[int]string{1: "aabbcc", -2147483648: "ddeeff"}[x]
	}}
	script, err := os.ReadFile("../tests/runtime-api/seams/input-boundaries.js")
	if err != nil {
		t.Fatal(err)
	}
	rt := goja.New()
	keyboardMethods := mapKeyboardToJS(rt, keyboard)
	for name, value := range map[string]any{
		"keyboard": keyboardMethods,
		"page":     map[string]any{"keyboard": keyboardMethods},
		"Screen":   AutoMapObject(rt, screen),
		"inputBoundaryCalls": func() map[string]any {
			return map[string]any{"keys": keys, "pixels": pixels}
		},
	} {
		if err := rt.Set(name, value); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := rt.RunScript("input-boundaries.js", string(script)); err != nil {
		t.Fatal(err)
	}
}
