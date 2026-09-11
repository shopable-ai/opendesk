//go:build windows

package appshell

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
)

const (
	appShellTrayMessage    = win.WM_USER + 0x351
	appShellCommandMessage = win.WM_USER + 0x352
	appShellIconID         = 1
)

type windowsHostCommand struct {
	kind  string
	id    string
	patch MenuItemPatch
	done  chan error
}

type windowsNativeHost struct {
	appPackage *Package

	mu            sync.RWMutex
	handler       func(string, string)
	hwnd          win.HWND
	icon          win.HICON
	notify        win.NOTIFYICONDATA
	className     *uint16
	command       chan windowsHostCommand
	ready         chan error
	done          chan struct{}
	doneOnce      sync.Once
	closed        bool
	menuState     map[string]MenuItemPatch
	primaryItemID string
	taskbarReset  uint32
}

var windowsAppShellHosts sync.Map

func newPlatformNativeHost(appPackage *Package) (NativeHost, error) {
	primaryItemID := appPackage.Manifest.Tray.PrimaryAction
	if primaryItemID != "opendesk.open" {
		for _, item := range appPackage.Manifest.Tray.Menu {
			if item.Action == primaryItemID {
				primaryItemID = item.ID
				break
			}
		}
	}
	state := make(map[string]MenuItemPatch)
	for _, item := range appPackage.Manifest.Tray.Menu {
		if item.Type == "separator" {
			continue
		}
		label := item.Label
		enabled, visible := true, true
		if item.Enabled != nil {
			enabled = *item.Enabled
		}
		if item.Visible != nil {
			visible = *item.Visible
		}
		state[item.ID] = MenuItemPatch{Label: &label, Enabled: &enabled, Visible: &visible}
	}
	return &windowsNativeHost{
		appPackage: appPackage, command: make(chan windowsHostCommand, 64),
		ready: make(chan error, 1), done: make(chan struct{}), menuState: state,
		primaryItemID: primaryItemID,
	}, nil
}

func (h *windowsNativeHost) Start(ctx context.Context, handler func(string, string)) error {
	if handler == nil {
		return fmt.Errorf("Windows tray action handler is required")
	}
	h.mu.Lock()
	h.handler = handler
	h.mu.Unlock()
	go h.runMessageLoop()
	select {
	case err := <-h.ready:
		return err
	case <-ctx.Done():
		// The owner may cancel during Win32 setup. Once setup reports ready,
		// tear down any icon it managed to create instead of leaving a detached
		// message-loop goroutine behind a failed Start call.
		go func() {
			if err := <-h.ready; err == nil {
				cleanupContext, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				_ = h.Teardown(cleanupContext)
			}
		}()
		return ctx.Err()
	}
}

func (h *windowsNativeHost) runMessageLoop() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	defer h.doneOnce.Do(func() { close(h.done) })
	instance := win.GetModuleHandle(nil)
	className, _ := syscall.UTF16PtrFromString("OpenDesk.AppShell." + h.appPackage.Manifest.InstanceKey())
	h.className = className
	wndClass := win.WNDCLASSEX{
		CbSize: uint32(unsafe.Sizeof(win.WNDCLASSEX{})), HInstance: instance,
		LpfnWndProc: syscall.NewCallback(windowsAppShellWndProc), LpszClassName: className,
	}
	if win.RegisterClassEx(&wndClass) == 0 {
		h.ready <- fmt.Errorf("register Windows tray message class")
		return
	}
	defer win.UnregisterClass(className)
	hwnd := win.CreateWindowEx(0, className, className, 0, 0, 0, 0, 0, win.HWND_MESSAGE, 0, instance, nil)
	if hwnd == 0 {
		h.ready <- fmt.Errorf("create Windows tray message window")
		return
	}
	h.mu.Lock()
	h.hwnd = hwnd
	h.taskbarReset = win.RegisterWindowMessage(mustUTF16("TaskbarCreated"))
	h.mu.Unlock()
	windowsAppShellHosts.Store(hwnd, h)
	iconWidth, iconHeight := windowsTrayIconSize(hwnd)
	iconHandle := win.LoadImage(0, mustUTF16(h.appPackage.WindowsIconPath), win.IMAGE_ICON, iconWidth, iconHeight, win.LR_LOADFROMFILE)
	if iconHandle == 0 {
		windowsAppShellHosts.Delete(hwnd)
		win.DestroyWindow(hwnd)
		h.ready <- fmt.Errorf("load Windows tray icon %s", h.appPackage.WindowsIconPath)
		return
	}
	h.mu.Lock()
	h.icon = win.HICON(iconHandle)
	h.notify = win.NOTIFYICONDATA{
		CbSize: uint32(unsafe.Sizeof(win.NOTIFYICONDATA{})), HWnd: hwnd, UID: appShellIconID,
		UFlags: win.NIF_MESSAGE | win.NIF_ICON | win.NIF_TIP, UCallbackMessage: appShellTrayMessage, HIcon: h.icon,
	}
	copy(h.notify.SzTip[:], syscall.StringToUTF16(h.appPackage.Manifest.Tray.Tooltip))
	added := win.Shell_NotifyIcon(win.NIM_ADD, &h.notify)
	if added {
		h.notify.UVersion = win.NOTIFYICON_VERSION_4
		win.Shell_NotifyIcon(win.NIM_SETVERSION, &h.notify)
	}
	h.mu.Unlock()
	if !added {
		windowsAppShellHosts.Delete(hwnd)
		win.DestroyIcon(h.icon)
		win.DestroyWindow(hwnd)
		h.ready <- fmt.Errorf("add Windows Notification Area icon")
		return
	}
	h.ready <- nil
	var message win.MSG
	for win.GetMessage(&message, 0, 0, 0) > 0 {
		win.TranslateMessage(&message)
		win.DispatchMessage(&message)
	}
	windowsAppShellHosts.Delete(hwnd)
}

func windowsAppShellWndProc(hwnd win.HWND, message uint32, wParam, lParam uintptr) uintptr {
	value, ok := windowsAppShellHosts.Load(hwnd)
	if !ok {
		return win.DefWindowProc(hwnd, message, wParam, lParam)
	}
	h := value.(*windowsNativeHost)
	if message == h.taskbarReset {
		h.mu.Lock()
		if win.Shell_NotifyIcon(win.NIM_ADD, &h.notify) {
			h.notify.UVersion = win.NOTIFYICON_VERSION_4
			win.Shell_NotifyIcon(win.NIM_SETVERSION, &h.notify)
		}
		h.mu.Unlock()
		return 0
	}
	switch message {
	case appShellCommandMessage:
		h.drainCommands()
		return 0
	case appShellTrayMessage:
		// NOTIFYICON_VERSION_4 packs the notification in LOWORD(lParam)
		// and the icon id in HIWORD(lParam). Older shells pass only the
		// notification value, so LOWORD works for both contracts.
		switch windowsTrayEventCode(lParam) {
		case win.WM_LBUTTONUP, win.NIN_SELECT, win.NIN_KEYSELECT:
			h.dispatch(h.primaryItemID, "tray-primary")
		case win.WM_RBUTTONUP, win.WM_CONTEXTMENU:
			h.showMenu()
		}
		return 0
	case win.WM_DESTROY:
		win.PostQuitMessage(0)
		return 0
	}
	return win.DefWindowProc(hwnd, message, wParam, lParam)
}

func (h *windowsNativeHost) dispatch(itemID, source string) {
	h.mu.RLock()
	handler, closed := h.handler, h.closed
	h.mu.RUnlock()
	if handler != nil && !closed {
		handler(itemID, source)
	}
}

func (h *windowsNativeHost) showMenu() {
	menu := win.CreatePopupMenu()
	if menu == 0 {
		return
	}
	defer win.DestroyMenu(menu)
	commands := make(map[uint32]string)
	position, nextID := uint32(0), uint32(100)
	insertWindowsMenuItem(menu, position, nextID, "Open / Show", true, false)
	commands[nextID] = "opendesk.open"
	position, nextID = position+1, nextID+1
	insertWindowsMenuItem(menu, position, 0, "", false, true)
	position++
	h.mu.RLock()
	for _, item := range h.appPackage.Manifest.Tray.Menu {
		if item.Type == "separator" {
			insertWindowsMenuItem(menu, position, 0, "", false, true)
			position++
			continue
		}
		state := h.menuState[item.ID]
		visible := state.Visible == nil || *state.Visible
		if !visible {
			continue
		}
		label := item.Label
		if state.Label != nil {
			label = *state.Label
		}
		enabled := state.Enabled == nil || *state.Enabled
		insertWindowsMenuItem(menu, position, nextID, label, enabled, false)
		commands[nextID] = item.ID
		position, nextID = position+1, nextID+1
	}
	h.mu.RUnlock()
	insertWindowsMenuItem(menu, position, 0, "", false, true)
	position++
	insertWindowsMenuItem(menu, position, nextID, "Quit", true, false)
	commands[nextID] = "opendesk.quit"
	var point win.POINT
	if !win.GetCursorPos(&point) {
		return
	}
	win.SetForegroundWindow(h.hwnd)
	selected := win.TrackPopupMenu(menu, win.TPM_RETURNCMD|win.TPM_RIGHTBUTTON, point.X, point.Y, 0, h.hwnd, nil)
	// Required by the Win32 notification-area contract so clicking elsewhere
	// reliably dismisses the popup after SetForegroundWindow.
	win.PostMessage(h.hwnd, win.WM_NULL, 0, 0)
	if itemID := commands[selected]; itemID != "" {
		h.dispatch(itemID, "tray-menu")
	}
}

func windowsTrayEventCode(lParam uintptr) uint32 { return uint32(lParam & 0xffff) }

func windowsTrayIconSize(hwnd win.HWND) (int32, int32) {
	dpi := win.GetDpiForWindow(hwnd)
	width := win.GetSystemMetricsForDpi(win.SM_CXSMICON, dpi)
	height := win.GetSystemMetricsForDpi(win.SM_CYSMICON, dpi)
	if width <= 0 {
		width = 16
	}
	if height <= 0 {
		height = 16
	}
	return width, height
}

func insertWindowsMenuItem(menu win.HMENU, position, command uint32, label string, enabled, separator bool) {
	item := win.MENUITEMINFO{CbSize: uint32(unsafe.Sizeof(win.MENUITEMINFO{}))}
	if separator {
		item.FMask = win.MIIM_FTYPE
		item.FType = win.MFT_SEPARATOR
	} else {
		text := syscall.StringToUTF16(label)
		item.FMask = win.MIIM_ID | win.MIIM_STRING | win.MIIM_STATE
		item.WID = command
		item.DwTypeData = &text[0]
		item.Cch = uint32(len(text) - 1)
		if enabled {
			item.FState = win.MFS_ENABLED
		} else {
			item.FState = win.MFS_DISABLED
		}
	}
	win.InsertMenuItem(menu, position, true, &item)
}

func (h *windowsNativeHost) drainCommands() {
	for {
		select {
		case command := <-h.command:
			switch command.kind {
			case "activate":
				command.done <- nil
			case "update":
				h.mu.Lock()
				state, ok := h.menuState[command.id]
				if ok {
					if command.patch.Label != nil {
						state.Label = command.patch.Label
					}
					if command.patch.Enabled != nil {
						state.Enabled = command.patch.Enabled
					}
					if command.patch.Visible != nil {
						state.Visible = command.patch.Visible
					}
					h.menuState[command.id] = state
				}
				h.mu.Unlock()
				if !ok {
					command.done <- fmt.Errorf("unknown Windows tray menu item %q", command.id)
				} else {
					command.done <- nil
				}
			case "teardown":
				h.mu.Lock()
				h.closed = true
				h.handler = nil
				win.Shell_NotifyIcon(win.NIM_DELETE, &h.notify)
				if h.icon != 0 {
					win.DestroyIcon(h.icon)
					h.icon = 0
				}
				h.mu.Unlock()
				command.done <- nil
				win.DestroyWindow(h.hwnd)
				return
			}
		default:
			return
		}
	}
}

func (h *windowsNativeHost) send(ctx context.Context, command windowsHostCommand) error {
	// Hold the read side of the admission gate until the command is queued.
	// Teardown takes the write side before adding its terminal FIFO command,
	// which makes it impossible for a caller to enqueue behind teardown.
	h.mu.RLock()
	hwnd := h.hwnd
	if h.closed || hwnd == 0 {
		h.mu.RUnlock()
		return ErrTornDown
	}
	command.done = make(chan error, 1)
	select {
	case h.command <- command:
	case <-ctx.Done():
		h.mu.RUnlock()
		return ctx.Err()
	}
	win.PostMessage(hwnd, appShellCommandMessage, 0, 0)
	h.mu.RUnlock()
	select {
	case err := <-command.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *windowsNativeHost) Activate(ctx context.Context) error {
	return h.send(ctx, windowsHostCommand{kind: "activate"})
}

func (h *windowsNativeHost) UpdateMenuItem(ctx context.Context, id string, patch MenuItemPatch) error {
	return h.send(ctx, windowsHostCommand{kind: "update", id: id, patch: patch})
}

func (h *windowsNativeHost) Teardown(ctx context.Context) error {
	// Close the admission gate before queueing teardown. Commands accepted
	// before this transition remain FIFO ahead of teardown; no command can be
	// stranded behind the message-loop terminating command.
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	h.closed = true
	h.handler = nil
	hwnd := h.hwnd
	h.mu.Unlock()
	if hwnd == 0 {
		return nil
	}
	command := windowsHostCommand{kind: "teardown", done: make(chan error, 1)}
	select {
	case h.command <- command:
	case <-ctx.Done():
		return ctx.Err()
	}
	win.PostMessage(hwnd, appShellCommandMessage, 0, 0)
	select {
	case err := <-command.done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *windowsNativeHost) Wait() { <-h.done }

func mustUTF16(value string) *uint16 {
	result, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		panic(err)
	}
	return result
}
