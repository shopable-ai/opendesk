package measurementshortcut

import "strings"

// GlobalShortcutAccelerator is shared by App-lifecycle registration and the
// first-party menu/Recorder hints. A hint never registers another shortcut.
const GlobalShortcutAccelerator = "CommandOrControl+Alt+Shift+M"

// GlobalShortcutLabel returns the default binding's presentation only on the
// platforms with a native registration backend. Derive it from the registered
// accelerator so changing the binding cannot silently leave stale UI hints.
func GlobalShortcutLabel(goos string) string {
	parts := strings.Split(GlobalShortcutAccelerator, "+")
	switch goos {
	case "darwin":
		for i, part := range parts {
			switch part {
			case "CommandOrControl":
				parts[i] = "⌘"
			case "Alt":
				parts[i] = "⌥"
			case "Shift":
				parts[i] = "⇧"
			}
		}
		return strings.Join(parts, "")
	case "windows":
		for i, part := range parts {
			if part == "CommandOrControl" {
				parts[i] = "Ctrl"
			}
		}
		return strings.Join(parts, "+")
	default:
		return ""
	}
}
