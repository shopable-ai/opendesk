//go:build windows

package automation

import (
	"errors"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"unsafe"

	"github.com/lxn/win"
	"golang.org/x/sys/windows"
)

var errGlobalShortcutPlatformUnsupported = errors.New("global shortcut platform backend is unavailable")

const (
	windowsModifierAlt          uint32 = 0x0001
	windowsModifierControl      uint32 = 0x0002
	windowsModifierShift        uint32 = 0x0004
	windowsModifierWin          uint32 = 0x0008
	windowsModifierNoRepeat     uint32 = 0x4000
	windowsMessageCloseShortcut uint32 = 0x8000 + 0x4d
)

var (
	windowsUser32            = windows.NewLazySystemDLL("user32.dll")
	windowsRegisterHotKey    = windowsUser32.NewProc("RegisterHotKey")
	windowsUnregisterHotKey  = windowsUser32.NewProc("UnregisterHotKey")
	windowsPostThreadMessage = windowsUser32.NewProc("PostThreadMessageW")
)

type windowsGlobalShortcutBackend struct {
	mu      sync.Mutex
	nextID  uint32
	handles map[uint32]*windowsGlobalShortcutHandle
	closed  bool
}

type windowsGlobalShortcutHandle struct {
	id          uint32
	accelerator GlobalShortcutPlatformAccelerator
	callback    func()
	threadID    atomic.Uint32
	stopping    atomic.Bool
	started     chan struct{}
	ready       chan error
	done        chan struct{}
	once        sync.Once
}

func newPlatformGlobalShortcutBackend() GlobalShortcutBackend {
	return &windowsGlobalShortcutBackend{handles: map[uint32]*windowsGlobalShortcutHandle{}}
}

func platformGlobalShortcutAccelerator(accelerator Accelerator) (GlobalShortcutPlatformAccelerator, error) {
	modifiers := accelerator.Modifiers
	hasCommandOrControl := modifiers&shortcutModifierCommandOrControl != 0
	hasControl := modifiers&shortcutModifierControl != 0
	if hasCommandOrControl && hasControl {
		return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "CommandOrControl and Control resolve to the same Windows modifier")
	}
	if modifiers&shortcutModifierCommandOrControl != 0 {
		modifiers &^= shortcutModifierCommandOrControl
		modifiers |= shortcutModifierControl
	}
	if modifiers&shortcutModifierCommand != 0 {
		modifiers &^= shortcutModifierCommand
		if modifiers&shortcutModifierMeta != 0 {
			return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "Command and Meta resolve to the same Windows modifier")
		}
		modifiers |= shortcutModifierMeta
	}
	windowsModifiers := uint32(0)
	if modifiers&shortcutModifierControl != 0 {
		windowsModifiers |= windowsModifierControl
	}
	if modifiers&shortcutModifierShift != 0 {
		windowsModifiers |= windowsModifierShift
	}
	if modifiers&shortcutModifierAlt != 0 {
		windowsModifiers |= windowsModifierAlt
	}
	if modifiers&shortcutModifierMeta != 0 {
		windowsModifiers |= windowsModifierWin
	}
	keyCode, ok := windowsShortcutKeyCode(accelerator.Key)
	if !ok {
		return GlobalShortcutPlatformAccelerator{}, invalidAccelerator(accelerator.Canonical, "unsupported Windows key "+accelerator.Key)
	}
	parts := make([]string, 0, 5)
	if modifiers&shortcutModifierControl != 0 {
		parts = append(parts, "Control")
	}
	if modifiers&shortcutModifierShift != 0 {
		parts = append(parts, "Shift")
	}
	if modifiers&shortcutModifierAlt != 0 {
		parts = append(parts, "Alt")
	}
	if modifiers&shortcutModifierMeta != 0 {
		parts = append(parts, "Meta")
	}
	parts = append(parts, accelerator.Key)
	return GlobalShortcutPlatformAccelerator{Canonical: joinShortcutParts(parts), KeyCode: keyCode, Modifiers: windowsModifiers}, nil
}

func (b *windowsGlobalShortcutBackend) Register(accelerator GlobalShortcutPlatformAccelerator, callback func()) (GlobalShortcutBackendHandle, error) {
	if callback == nil {
		return nil, fmt.Errorf("shortcut callback is required")
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, errGlobalShortcutPlatformUnsupported
	}
	b.nextID++
	id := b.nextID
	handle := &windowsGlobalShortcutHandle{
		id: id, accelerator: accelerator, callback: callback,
		started: make(chan struct{}), ready: make(chan error, 1), done: make(chan struct{}),
	}
	b.handles[id] = handle
	b.mu.Unlock()
	go handle.run()
	if err := <-handle.ready; err != nil {
		b.mu.Lock()
		delete(b.handles, id)
		b.mu.Unlock()
		return nil, err
	}
	return handle, nil
}

func (b *windowsGlobalShortcutBackend) Close() error {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil
	}
	b.closed = true
	handles := make([]*windowsGlobalShortcutHandle, 0, len(b.handles))
	for _, handle := range b.handles {
		handles = append(handles, handle)
	}
	b.handles = map[uint32]*windowsGlobalShortcutHandle{}
	b.mu.Unlock()
	var first error
	for _, handle := range handles {
		if err := handle.Unregister(); err != nil && first == nil {
			first = err
		}
	}
	return first
}

func (h *windowsGlobalShortcutHandle) run() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	var message win.MSG
	// Windows does not create a thread message queue until the first user32
	// call. PeekMessage makes PostThreadMessage reliable before ready is sent.
	win.PeekMessage(&message, 0, 0, 0, 0)
	h.threadID.Store(win.GetCurrentThreadId())
	close(h.started)
	if h.stopping.Load() {
		h.ready <- errGlobalShortcutPlatformUnsupported
		close(h.done)
		return
	}
	registered, _, callErr := windowsRegisterHotKey.Call(0, uintptr(h.id), uintptr(h.accelerator.Modifiers|windowsModifierNoRepeat), uintptr(h.accelerator.KeyCode))
	if registered == 0 {
		if callErr == windows.ERROR_HOTKEY_ALREADY_REGISTERED {
			h.ready <- errShortcutBackendAlreadyRegistered
		} else {
			h.ready <- fmt.Errorf("RegisterHotKey: %w", callErr)
		}
		close(h.done)
		return
	}
	h.ready <- nil
	defer close(h.done)
	for {
		result := win.GetMessage(&message, 0, 0, 0)
		if result == -1 {
			return
		}
		if result == 0 {
			return
		}
		if message.Message == win.WM_HOTKEY && uint32(message.WParam) == h.id {
			if h.callback != nil {
				h.callback()
			}
			continue
		}
		if message.Message == windowsMessageCloseShortcut {
			_, _, _ = windowsUnregisterHotKey.Call(0, uintptr(h.id))
			return
		}
	}
}

func (h *windowsGlobalShortcutHandle) Unregister() error {
	if h == nil {
		return nil
	}
	var unregisterErr error
	h.once.Do(func() {
		h.stopping.Store(true)
		<-h.started
		select {
		case <-h.done:
			return
		default:
		}
		threadID := h.threadID.Load()
		posted, _, callErr := windowsPostThreadMessage.Call(uintptr(threadID), uintptr(windowsMessageCloseShortcut), 0, 0)
		if posted == 0 {
			unregisterErr = fmt.Errorf("PostThreadMessageW: %w", callErr)
			return
		}
		<-h.done
	})
	return unregisterErr
}

func windowsShortcutKeyCode(key string) (uint32, bool) {
	if len(key) == 1 && ((key[0] >= 'A' && key[0] <= 'Z') || (key[0] >= '0' && key[0] <= '9')) {
		return uint32(key[0]), true
	}
	if len(key) >= 2 && key[0] == 'F' {
		var number int
		if _, err := fmt.Sscanf(key, "F%d", &number); err == nil && number >= 1 && number <= 24 {
			return uint32(0x70 + number - 1), true
		}
	}
	keys := map[string]uint32{"Enter": 0x0d, "Escape": 0x1b, "Space": 0x20, "Tab": 0x09, "Backspace": 0x08, "Delete": 0x2e, "Up": 0x26, "Down": 0x28, "Left": 0x25, "Right": 0x27}
	value, ok := keys[key]
	return value, ok
}

var _ = unsafe.Sizeof(win.MSG{})
