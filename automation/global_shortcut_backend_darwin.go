//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework ApplicationServices -framework Carbon -framework Foundation -framework IOKit
#include <stdint.h>

int opendesk_global_shortcut_register(uint32_t id, uint32_t key_code, uint32_t modifiers, uintptr_t *out_handle);
int opendesk_global_shortcut_unregister(uintptr_t handle);
int opendesk_global_shortcut_tap_start(void);
void opendesk_global_shortcut_tap_stop(void);
*/
import "C"

import (
	"errors"
	"fmt"
	"sync"
)

var errGlobalShortcutPlatformUnsupported = errors.New("global shortcut platform backend is unavailable")

const (
	darwinModifierCommand uint32 = 1 << iota
	darwinModifierControl
	darwinModifierShift
	darwinModifierAlt
)

const darwinEventHotKeyExistsErr = -9878

// Carbon exposes virtual-key constants only through F20. The HID usage table
// defines the remaining standard function keys, so reserve values that cannot
// collide with a CGKeyCode and let the native HID listener dispatch them.
const darwinExtendedFunctionKeyBase uint32 = 0xf1

type darwinShortcutKey struct {
	keyCode   uint32
	modifiers uint32
}

type darwinShortcutHubState struct {
	sync.Mutex
	nextID    uint32
	callbacks map[darwinShortcutKey]func()
}

var darwinShortcutHub = darwinShortcutHubState{
	callbacks: map[darwinShortcutKey]func(){},
}

// darwinShortcutTapLifecycle serializes listener start and stop separately
// from darwinShortcutHub. The native stop operation joins the listener thread,
// whose callback takes darwinShortcutHub, so it must never run while that hub
// is held. Register takes this lock before publishing a callback; a final
// Unregister takes it before rechecking whether the listener is still unused.
// That prevents a new Runtime registration from landing between the final
// registry check and a previous Runtime stopping the process-wide listener.
var darwinShortcutTapLifecycle sync.Mutex

type darwinGlobalShortcutBackend struct{}

type darwinGlobalShortcutHandle struct {
	once   sync.Once
	key    darwinShortcutKey
	native uintptr
}

func newPlatformGlobalShortcutBackend() GlobalShortcutBackend { return darwinGlobalShortcutBackend{} }

func platformGlobalShortcutAccelerator(accelerator Accelerator) (GlobalShortcutPlatformAccelerator, error) {
	modifiers := accelerator.Modifiers
	hasCommandOrControl := modifiers&shortcutModifierCommandOrControl != 0
	hasCommand := modifiers&shortcutModifierCommand != 0
	if hasCommandOrControl && hasCommand {
		return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "CommandOrControl and Command resolve to the same macOS modifier")
	}
	if modifiers&shortcutModifierCommandOrControl != 0 {
		modifiers &^= shortcutModifierCommandOrControl
		modifiers |= shortcutModifierCommand
	}
	if modifiers&shortcutModifierMeta != 0 {
		modifiers &^= shortcutModifierMeta
		if modifiers&shortcutModifierCommand != 0 {
			return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "Command and Meta resolve to the same macOS modifier")
		}
		modifiers |= shortcutModifierCommand
	}
	carbonModifiers := uint32(0)
	dispatchModifiers := uint32(0)
	if modifiers&shortcutModifierCommand != 0 {
		carbonModifiers |= 1 << 8 // Carbon cmdKey
		dispatchModifiers |= darwinModifierCommand
	}
	if modifiers&shortcutModifierControl != 0 {
		carbonModifiers |= 1 << 12 // Carbon controlKey
		dispatchModifiers |= darwinModifierControl
	}
	if modifiers&shortcutModifierShift != 0 {
		carbonModifiers |= 1 << 9 // Carbon shiftKey
		dispatchModifiers |= darwinModifierShift
	}
	if modifiers&shortcutModifierAlt != 0 {
		carbonModifiers |= 1 << 11 // Carbon optionKey
		dispatchModifiers |= darwinModifierAlt
	}
	keyCode, ok := darwinShortcutKeyCode(accelerator.Key)
	if !ok {
		return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "unsupported macOS key "+accelerator.Key)
	}
	canonicalParts := make([]string, 0, 5)
	if modifiers&shortcutModifierCommand != 0 {
		canonicalParts = append(canonicalParts, "Command")
	}
	if modifiers&shortcutModifierControl != 0 {
		canonicalParts = append(canonicalParts, "Control")
	}
	if modifiers&shortcutModifierShift != 0 {
		canonicalParts = append(canonicalParts, "Shift")
	}
	if modifiers&shortcutModifierAlt != 0 {
		canonicalParts = append(canonicalParts, "Alt")
	}
	canonicalParts = append(canonicalParts, accelerator.Key)
	return GlobalShortcutPlatformAccelerator{
		Canonical: joinShortcutParts(canonicalParts), KeyCode: keyCode,
		Modifiers: (carbonModifiers << 16) | dispatchModifiers,
	}, nil
}

func (darwinGlobalShortcutBackend) Register(accelerator GlobalShortcutPlatformAccelerator, callback func()) (GlobalShortcutBackendHandle, error) {
	if callback == nil {
		return nil, fmt.Errorf("shortcut callback is required")
	}
	key := darwinShortcutKey{keyCode: accelerator.KeyCode, modifiers: accelerator.Modifiers & 0xffff}
	carbonModifiers := accelerator.Modifiers >> 16
	darwinShortcutTapLifecycle.Lock()
	defer darwinShortcutTapLifecycle.Unlock()
	darwinShortcutHub.Lock()
	defer darwinShortcutHub.Unlock()
	if _, exists := darwinShortcutHub.callbacks[key]; exists {
		return nil, errShortcutBackendAlreadyRegistered
	}
	darwinShortcutHub.nextID++
	id := darwinShortcutHub.nextID
	var native C.uintptr_t
	if key.keyCode < darwinExtendedFunctionKeyBase {
		status := int(C.opendesk_global_shortcut_register(C.uint32_t(id), C.uint32_t(key.keyCode), C.uint32_t(carbonModifiers), &native))
		if status != 0 {
			if status == darwinEventHotKeyExistsErr {
				return nil, errShortcutBackendAlreadyRegistered
			}
			return nil, fmt.Errorf("RegisterEventHotKey status=%d", status)
		}
	}
	// Publish before starting the listener so the first real key event after a
	// successful native registration cannot race an empty Go callback registry.
	darwinShortcutHub.callbacks[key] = callback
	if status := int(C.opendesk_global_shortcut_tap_start()); status != 0 {
		delete(darwinShortcutHub.callbacks, key)
		_ = C.opendesk_global_shortcut_unregister(native)
		return nil, fmt.Errorf("global key event listener could not start (allow Accessibility and Input Monitoring for this OpenDesk host): status=%d", status)
	}
	return &darwinGlobalShortcutHandle{key: key, native: uintptr(native)}, nil
}

func (darwinGlobalShortcutBackend) Close() error { return nil }

func (h *darwinGlobalShortcutHandle) Unregister() error {
	if h == nil {
		return nil
	}
	var unregisterErr error
	h.once.Do(func() {
		darwinShortcutHub.Lock()
		delete(darwinShortcutHub.callbacks, h.key)
		if h.native != 0 {
			if status := int(C.opendesk_global_shortcut_unregister(C.uintptr_t(h.native))); status != 0 {
				unregisterErr = fmt.Errorf("UnregisterEventHotKey status=%d", status)
			}
			h.native = 0
		}
		stopTap := len(darwinShortcutHub.callbacks) == 0
		darwinShortcutHub.Unlock()
		// Do not join the native listener while holding darwinShortcutHub: the
		// listener may currently be delivering an event and need this lock.
		if stopTap {
			darwinShortcutTapLifecycle.Lock()
			darwinShortcutHub.Lock()
			stillUnused := len(darwinShortcutHub.callbacks) == 0
			darwinShortcutHub.Unlock()
			if stillUnused {
				C.opendesk_global_shortcut_tap_stop()
			}
			darwinShortcutTapLifecycle.Unlock()
		}
	})
	return unregisterErr
}

// opendeskGlobalShortcutDarwinEvent is called by the listen-only native event
// tap. It only copies Go callbacks under a lock; each callback schedules work
// onto an EventLoop and never calls Goja from the native thread.
//
//export opendeskGlobalShortcutDarwinEvent
func opendeskGlobalShortcutDarwinEvent(keyCode C.ushort, modifiers C.ulonglong) {
	key := darwinShortcutKey{keyCode: uint32(keyCode), modifiers: uint32(modifiers)}
	darwinShortcutHub.Lock()
	callback := darwinShortcutHub.callbacks[key]
	darwinShortcutHub.Unlock()
	if callback != nil {
		callback()
	}
}

func joinShortcutParts(parts []string) string {
	result := ""
	for _, part := range parts {
		if result != "" {
			result += "+"
		}
		result += part
	}
	return result
}

func darwinShortcutKeyCode(key string) (uint32, bool) {
	// Carbon virtual key codes identify physical keys. Letter and digit support
	// therefore remains stable across layout changes, matching native hot-key
	// registration semantics rather than translated text input.
	keys := map[string]uint32{
		"A": 0x00, "S": 0x01, "D": 0x02, "F": 0x03, "H": 0x04, "G": 0x05, "Z": 0x06, "X": 0x07, "C": 0x08, "V": 0x09,
		"B": 0x0b, "Q": 0x0c, "W": 0x0d, "E": 0x0e, "R": 0x0f, "Y": 0x10, "T": 0x11,
		"1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15, "6": 0x16, "5": 0x17, "=": 0x18, "9": 0x19, "7": 0x1a, "-": 0x1b, "8": 0x1c, "0": 0x1d,
		"O": 0x1f, "U": 0x20, "I": 0x22, "P": 0x23, "L": 0x25, "J": 0x26, "K": 0x28, "N": 0x2d, "M": 0x2e,
		"Tab": 0x30, "Space": 0x31, "Backspace": 0x33, "Escape": 0x35, "Enter": 0x24, "Delete": 0x75,
		"Left": 0x7b, "Right": 0x7c, "Down": 0x7d, "Up": 0x7e,
		"F1": 0x7a, "F2": 0x78, "F3": 0x63, "F4": 0x76, "F5": 0x60, "F6": 0x61, "F7": 0x62, "F8": 0x64,
		"F9": 0x65, "F10": 0x6d, "F11": 0x67, "F12": 0x6f, "F13": 0x69, "F14": 0x6b, "F15": 0x71, "F16": 0x6a,
		"F17": 0x40, "F18": 0x4f, "F19": 0x50, "F20": 0x5a,
		"F21": darwinExtendedFunctionKeyBase, "F22": darwinExtendedFunctionKeyBase + 1,
		"F23": darwinExtendedFunctionKeyBase + 2, "F24": darwinExtendedFunctionKeyBase + 3,
	}
	value, ok := keys[key]
	return value, ok
}
