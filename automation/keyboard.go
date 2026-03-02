package automation

import (
	"fmt"
	"strings"
	"time"

	"github.com/go-vgo/robotgo"
)

type Keyboard struct{}

func NewKeyboard() *Keyboard {
	return &Keyboard{}
}

// Type types the given text string
func (k *Keyboard) Type(text string) error {
	if text == "" {
		return fmt.Errorf("input text cannot be empty")
	}
	robotgo.TypeStr(text)
	time.Sleep(100 * time.Millisecond)
	return nil
}

// Press presses and releases a single key
func (k *Keyboard) Press(key string) error {
	if key == "" {
		return fmt.Errorf("key cannot be empty")
	}

	// Convert common key names
	key = normalizeKeyName(key)

	robotgo.KeyTap(key)
	time.Sleep(50 * time.Millisecond)
	return nil
}

// Down holds down a key
func (k *Keyboard) Down(key string) error {
	if key == "" {
		return fmt.Errorf("key cannot be empty")
	}

	// Convert common key names
	key = normalizeKeyName(key)

	robotgo.KeyToggle(key, "down")
	time.Sleep(50 * time.Millisecond)
	return nil
}

// Up releases a key
func (k *Keyboard) Up(key string) error {
	if key == "" {
		return fmt.Errorf("key cannot be empty")
	}

	// Convert common key names
	key = normalizeKeyName(key)

	robotgo.KeyToggle(key, "up")
	time.Sleep(50 * time.Millisecond)
	return nil
}

// Combination presses multiple keys simultaneously
func (k *Keyboard) Combination(keys ...string) error {
	if len(keys) == 0 {
		return fmt.Errorf("no keys provided")
	}

	// Convert all keys
	normalizedKeys := make([]string, len(keys))
	for i, key := range keys {
		normalizedKeys[i] = normalizeKeyName(key)
	}

	// Hold down all keys in order
	for _, key := range normalizedKeys {
		if err := k.Down(key); err != nil {
			return err
		}
	}

	// Release all keys in reverse order
	for i := len(normalizedKeys) - 1; i >= 0; i-- {
		if err := k.Up(normalizedKeys[i]); err != nil {
			return err
		}
	}

	return nil
}

// normalizeKeyName converts common key names to robotgo format
func normalizeKeyName(key string) string {
	keyMap := map[string]string{
		// Special keys
		"Meta":        "command", // Windows key
		"Control":     "ctrl",
		"Shift":       "shift",
		"Alt":         "alt",
		"AltGraph":    "alt", // Right Alt
		"CapsLock":    "caps",
		"NumLock":     "numlock",
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
		"NumpadDivide":   "numpaddivide",
		"NumpadMultiply": "numpadmultiply",
		"NumpadSubtract": "numpadsubtract",
		"NumpadAdd":      "numpadadd",
		"NumpadDecimal":  "numpaddecimal",
		"Numpad0":        "numpad0",
		"Numpad1":        "numpad1",
		"Numpad2":        "numpad2",
		"Numpad3":        "numpad3",
		"Numpad4":        "numpad4",
		"Numpad5":        "numpad5",
		"Numpad6":        "numpad6",
		"Numpad7":        "numpad7",
		"Numpad8":        "numpad8",
		"Numpad9":        "numpad9",

		// Media keys
		"AudioVolumeMute":    "volumemute",
		"AudioVolumeDown":    "volumedown",
		"AudioVolumeUp":      "volumeup",
		"MediaPlayPause":     "playpause",
		"MediaTrackPrevious": "prevtrack",
		"MediaTrackNext":     "nexttrack",

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
