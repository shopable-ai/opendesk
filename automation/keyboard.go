package automation

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/go-vgo/robotgo"
)

type Keyboard struct {
	// Optional per-instance backend for the input boundary fixture.
	send func(key, action string, modifiers []string) error
}

func NewKeyboard() *Keyboard {
	return &Keyboard{}
}

// Reject coercion at the JavaScript input boundary. For example, a numeric
// argument or an object with toString must not become a valid printable key.
func mapKeyboardToJS(runtime *goja.Runtime, keyboard *Keyboard) map[string]any {
	methods := AutoMapObject(runtime, keyboard)
	for _, name := range []string{"press", "down", "up", "combination"} {
		invoke := methods[name].(func(goja.FunctionCall) goja.Value)
		methods[name] = func(call goja.FunctionCall) goja.Value {
			for i, argument := range call.Arguments {
				if _, ok := argument.(goja.String); !ok {
					panic(runtime.NewTypeError("keyboard key at position %d must be a string", i+1))
				}
			}
			return invoke(call)
		}
	}
	return methods
}

// Type types the given text string
func (k *Keyboard) Type(text string) error {
	if text == "" {
		return fmt.Errorf("input text cannot be empty")
	}
	if err := typeText(text); err != nil {
		return err
	}
	time.Sleep(100 * time.Millisecond)
	return nil
}

// TypeForPID types text only into the requested process when the platform can
// provide a PID-scoped event primitive.
func (k *Keyboard) TypeForPID(processID int, text string) error {
	if processID <= 0 {
		return fmt.Errorf("processID must be positive")
	}
	if text == "" {
		return fmt.Errorf("input text cannot be empty")
	}
	if err := typeTextForPID(processID, text); err != nil {
		return err
	}
	time.Sleep(100 * time.Millisecond)
	return nil
}

// Press presses and releases a single key.
func (k *Keyboard) Press(key string) error {
	return k.sendKey(key, "", nil)
}

// Down holds down a key.
func (k *Keyboard) Down(key string) error {
	return k.sendKey(key, "down", nil)
}

// Up releases a key.
func (k *Keyboard) Up(key string) error {
	return k.sendKey(key, "up", nil)
}

// Combination sends the final key with the preceding modifiers as one shortcut.
func (k *Keyboard) Combination(keys ...string) error {
	if len(keys) == 0 {
		return fmt.Errorf("no keys provided")
	}
	modifiers := make([]string, len(keys)-1)
	for i, key := range keys[:len(keys)-1] {
		modifier := strings.ToLower(normalizeKeyName(key))
		switch modifier {
		case "command":
			modifier = "cmd"
		case "control":
			modifier = "ctrl"
		case "right_shift":
			modifier = "rshift"
		}
		switch modifier {
		case "alt", "ralt", "lalt", "cmd", "rcmd", "lcmd",
			"ctrl", "rctrl", "lctrl", "shift", "rshift", "lshift":
			modifiers[i] = modifier
		default:
			return fmt.Errorf("invalid modifier at position %d: %q", i+1, key)
		}
	}
	primary := keys[len(keys)-1]
	if strings.TrimSpace(primary) == "" {
		return fmt.Errorf("key cannot be empty")
	}
	return k.sendKey(primary, "", modifiers)
}

func (k *Keyboard) sendKey(key, action string, modifiers []string) error {
	if key == "" || (key != " " && strings.TrimSpace(key) == "") {
		return fmt.Errorf("key cannot be empty")
	}
	normalized := normalizeKeyName(key)
	lower := strings.ToLower(normalized)
	// robotgo's exported Keycode table is for hooks, not keyboard input.
	// Its tap/toggle path silently sends key code zero for unknown names.
	if !(len(lower) == 1 && lower[0] >= ' ' && lower[0] <= '~') &&
		!slices.Contains(robotgoInputKeyNames, lower) {
		return fmt.Errorf("unsupported key %q", key)
	}

	var err error
	switch {
	case k.send != nil:
		err = k.send(normalized, action, modifiers)
	case action != "":
		err = robotgo.KeyToggle(normalized, action)
	case len(modifiers) == 0:
		err = robotgo.KeyTap(normalized)
	default:
		err = robotgo.KeyTap(normalized, modifiers)
	}
	if err != nil {
		return fmt.Errorf("keyboard input for %q: %w", key, err)
	}
	time.Sleep(50 * time.Millisecond)
	return nil
}

// Named input keys from the private robotgo v0.110.5 keyNames table.
// A recognized key may still be unavailable on the current platform.
var robotgoInputKeyNames = strings.Fields(`
    backspace delete enter tab esc escape up down right left home end pageup pagedown
    f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12 f13 f14 f15 f16 f17 f18 f19 f20 f21 f22 f23 f24
    cmd lcmd rcmd command alt lalt ralt ctrl lctrl rctrl control shift lshift rshift right_shift
    capslock space print printscreen insert menu
    audio_mute audio_vol_down audio_vol_up audio_play audio_stop audio_pause audio_prev audio_next
    audio_rewind audio_forward audio_repeat audio_random
    num0 num1 num2 num3 num4 num5 num6 num7 num8 num9 num_lock
    numpad_0 numpad_1 numpad_2 numpad_3 numpad_4 numpad_5 numpad_6 numpad_7 numpad_8 numpad_9 numpad_lock
    num. num+ num- num* num/ num_clear num_enter num_equal
    lights_mon_up lights_mon_down lights_kbd_toggle lights_kbd_up lights_kbd_down
`)

// normalizeKeyName converts common key names to robotgo format
func normalizeKeyName(key string) string {
	keyMap := map[string]string{
		// Special keys
		"Meta":        "cmd", // robotgo's modifier flag spelling on macOS/Windows
		"Control":     "ctrl",
		"Shift":       "shift",
		"Alt":         "alt",
		"AltGraph":    "alt", // Right Alt
		"CapsLock":    "capslock",
		"NumLock":     "num_lock",
		"ScrollLock":  "scrolllock",
		"PrintScreen": "printscreen",
		"Pause":       "pause",
		"Break":       "break",

		// Navigation keys
		"Enter":      "enter",
		"Return":     "enter",
		"Tab":        "tab",
		"Backspace":  "backspace",
		"Delete":     "delete",
		"Insert":     "insert",
		"Home":       "home",
		"End":        "end",
		"PageUp":     "pageup",
		"PageDown":   "pagedown",
		"Escape":     "escape",
		"Space":      "space",
		"ArrowUp":    "up",
		"ArrowDown":  "down",
		"ArrowLeft":  "left",
		"ArrowRight": "right",

		// Function keys
		"F1":  "f1",
		"F2":  "f2",
		"F3":  "f3",
		"F4":  "f4",
		"F5":  "f5",
		"F6":  "f6",
		"F7":  "f7",
		"F8":  "f8",
		"F9":  "f9",
		"F10": "f10",
		"F11": "f11",
		"F12": "f12",
		"F13": "f13",
		"F14": "f14",
		"F15": "f15",
		"F16": "f16",
		"F17": "f17",
		"F18": "f18",
		"F19": "f19",
		"F20": "f20",

		// Numpad keys
		"NumpadEnter":    "enter",
		"NumpadDivide":   "num/",
		"NumpadMultiply": "num*",
		"NumpadSubtract": "num-",
		"NumpadAdd":      "num+",
		"NumpadDecimal":  "num.",
		"Numpad0":        "num0",
		"Numpad1":        "num1",
		"Numpad2":        "num2",
		"Numpad3":        "num3",
		"Numpad4":        "num4",
		"Numpad5":        "num5",
		"Numpad6":        "num6",
		"Numpad7":        "num7",
		"Numpad8":        "num8",
		"Numpad9":        "num9",

		// Media keys
		"AudioVolumeMute":    "audio_mute",
		"AudioVolumeDown":    "audio_vol_down",
		"AudioVolumeUp":      "audio_vol_up",
		"MediaPlayPause":     "playpause",
		"MediaTrackPrevious": "audio_prev",
		"MediaTrackNext":     "audio_next",

		// Browser keys
		"BrowserBack":      "browserback",
		"BrowserForward":   "browserforward",
		"BrowserRefresh":   "browserrefresh",
		"BrowserStop":      "browserstop",
		"BrowserSearch":    "browsersearch",
		"BrowserFavorites": "browserfavorites",
		"BrowserHome":      "browserhome",

		// Additional common keys
		"ContextMenu": "menu",
		"Help":        "help",
		"Select":      "select",
		"Clear":       "clear",
		"Sleep":       "sleep",
		"Power":       "power",
		"Apps":        "apps",
	}

	// Convert to lowercase for case-insensitive matching
	normalizedKey := strings.ToLower(key)

	// Check if we have a mapping for this key
	if mapped, exists := keyMap[key]; exists {
		return mapped
	}

	// If it's a single character, return as is
	if len(normalizedKey) == 1 {
		return normalizedKey
	}

	return key
}
