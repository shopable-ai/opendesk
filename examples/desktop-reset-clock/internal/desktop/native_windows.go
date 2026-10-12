//go:build windows

package desktop

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	wmDestroy        = 0x0002
	wmMove           = 0x0003
	wmClose          = 0x0010
	wmPaint          = 0x000F
	wmCommand        = 0x0111
	wmMouseActivate  = 0x0021
	wmNCHitTest      = 0x0084
	wmLButtonDown    = 0x0201
	wmRButtonUp      = 0x0205
	wmApp            = 0x8000
	wmTray           = wmApp + 41
	wmUpdate         = wmApp + 42
	wsPopup          = 0x80000000
	wsVisible        = 0x10000000
	wsOverlapped     = 0x00CF0000
	wsChild          = 0x40000000
	exNoActivate     = 0x08000000
	exToolWindow     = 0x00000080
	exTransparent    = 0x00000020
	exLayered        = 0x00080000
	nifMessage       = 1
	nifIcon          = 2
	nifTip           = 4
	nifInfo          = 0x10
	nimAdd           = 0
	nimModify        = 1
	nimDelete        = 2
	swHide           = 0
	swShow           = 5
	swShowNoActivate = 4
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	gdi32           = syscall.NewLazyDLL("gdi32.dll")
	shell32         = syscall.NewLazyDLL("shell32.dll")
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	regClass        = user32.NewProc("RegisterClassExW")
	createWin       = user32.NewProc("CreateWindowExW")
	defProc         = user32.NewProc("DefWindowProcW")
	getMsg          = user32.NewProc("GetMessageW")
	translate       = user32.NewProc("TranslateMessage")
	dispatch        = user32.NewProc("DispatchMessageW")
	postMsg         = user32.NewProc("PostMessageW")
	showWin         = user32.NewProc("ShowWindow")
	destroyWin      = user32.NewProc("DestroyWindow")
	postQuit        = user32.NewProc("PostQuitMessage")
	setWindowPos    = user32.NewProc("SetWindowPos")
	invalidate      = user32.NewProc("InvalidateRect")
	setText         = user32.NewProc("SetWindowTextW")
	getText         = user32.NewProc("GetWindowTextW")
	getWindowRect   = user32.NewProc("GetWindowRect")
	sendMsg         = user32.NewProc("SendMessageW")
	releaseCapture  = user32.NewProc("ReleaseCapture")
	messageBox      = user32.NewProc("MessageBoxW")
	loadIcon        = user32.NewProc("LoadIconW")
	beginPaint      = user32.NewProc("BeginPaint")
	endPaint        = user32.NewProc("EndPaint")
	fillRect        = user32.NewProc("FillRect")
	drawText        = user32.NewProc("DrawTextW")
	setBk           = user32.NewProc("SetBkMode")
	setColor        = gdi32.NewProc("SetTextColor")
	createFont      = gdi32.NewProc("CreateFontW")
	selectObject    = gdi32.NewProc("SelectObject")
	deleteObject    = gdi32.NewProc("DeleteObject")
	createBrush     = gdi32.NewProc("CreateSolidBrush")
	shellIcon       = shell32.NewProc("Shell_NotifyIconW")
	popup           = user32.NewProc("CreatePopupMenu")
	appendMenu      = user32.NewProc("AppendMenuW")
	trackPopup      = user32.NewProc("TrackPopupMenu")
	destroyMenu     = user32.NewProc("DestroyMenu")
	getCursor       = user32.NewProc("GetCursorPos")
	setForeground   = user32.NewProc("SetForegroundWindow")
	registerMessage = user32.NewProc("RegisterWindowMessageW")
	createMutex     = kernel32.NewProc("CreateMutexW")
	closeHandle     = kernel32.NewProc("CloseHandle")
	getLastError    = kernel32.NewProc("GetLastError")
	findWindow      = user32.NewProc("FindWindowW")
	findWindowEx    = user32.NewProc("FindWindowExW")
	enumWindows     = user32.NewProc("EnumWindows")
	setParent       = user32.NewProc("SetParent")
	getLong         = user32.NewProc("GetWindowLongPtrW")
	setLong         = user32.NewProc("SetWindowLongPtrW")
	sendTimeout     = user32.NewProc("SendMessageTimeoutW")
)

type point struct{ X, Y int32 }
type rect struct{ Left, Top, Right, Bottom int32 }
type wndClass struct {
	Size, Style                        uint32
	Proc                               uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	MenuName, ClassName                *uint16
	IconSmall                          uintptr
}
type msg struct {
	Hwnd           uintptr
	Message        uint32
	_              uint32
	WParam, LParam uintptr
	Time           uint32
	Pt             point
	Private        uint32
}
type paint struct {
	DC                uintptr
	Erase             uint32
	Area              rect
	Restored, Updated uint32
	Reserved          [32]byte
}
type notifyData struct {
	Size                uint32
	Window              uintptr
	ID, Flags, Callback uint32
	Icon                uintptr
	Tip                 [128]uint16
	State, StateMask    uint32
	Info                [256]uint16
	Version             uint32
	Title               [64]uint16
	InfoFlags           uint32
	Guid                [16]byte
	BalloonIcon         uintptr
}

type windowsUI struct {
	mu                                    sync.Mutex
	display                               Display
	handler                               func(Action)
	card, settings, feedEdit, diagnostics uintptr
	tray                                  notifyData
	taskbar                               uint32
	instance                              uintptr
	desktopAttached                       bool
}

var current *windowsUI

func newNative() UI                                     { return &windowsUI{} }
func ptr(s string) *uint16                              { p, _ := syscall.UTF16PtrFromString(s); return p }
func utf(s string) uintptr                              { return uintptr(unsafe.Pointer(ptr(s))) }
func call(p *syscall.LazyProc, args ...uintptr) uintptr { r, _, _ := p.Call(args...); return r }
func (w *windowsUI) emit(name, value string) {
	if w.handler != nil {
		go w.handler(Action{Name: name, Value: value})
	}
}
func (w *windowsUI) Run(ctx context.Context, handler func(Action)) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	name := ptr("Local\\OpenDeskResetClock.R1")
	m := call(createMutex, 0, 0, uintptr(unsafe.Pointer(name)))
	if m == 0 {
		return errors.New("CreateMutexW failed")
	}
	defer call(closeHandle, m)
	if call(getLastError) == 183 {
		return errors.New("Reset Clock is already running")
	}
	w.instance = m
	w.handler = handler
	current = w
	defer func() { current = nil }()
	class := ptr("OpenDesk.ResetClock.Native.R1")
	wc := wndClass{Size: uint32(unsafe.Sizeof(wndClass{})), Proc: syscall.NewCallback(windowProc), Instance: call(kernel32.NewProc("GetModuleHandleW"), 0), ClassName: class, Icon: call(loadIcon, 0, 32512)}
	if call(regClass, uintptr(unsafe.Pointer(&wc))) == 0 {
		return errors.New("RegisterClassExW failed")
	}
	w.card = call(createWin, exNoActivate|exToolWindow|exLayered, uintptr(unsafe.Pointer(class)), utf("OpenDesk Reset Clock"), wsPopup, 70, 70, 360, 225, 0, 0, wc.Instance, 0)
	if w.card == 0 {
		return errors.New("CreateWindowExW card failed")
	}
	call(user32.NewProc("SetLayeredWindowAttributes"), w.card, 0, 245, 2)
	w.taskbar = uint32(call(registerMessage, utf("TaskbarCreated")))
	w.attachDesktop()
	w.tray = notifyData{Size: uint32(unsafe.Sizeof(notifyData{})), Window: w.card, ID: 1, Flags: nifMessage | nifIcon | nifTip, Callback: wmTray, Icon: call(loadIcon, 0, 32512)}
	copy(w.tray.Tip[:], syscall.StringToUTF16("OpenDesk Reset Clock"))
	if call(shellIcon, nimAdd, uintptr(unsafe.Pointer(&w.tray))) == 0 {
		call(destroyWin, w.card)
		return errors.New("Shell_NotifyIconW failed")
	}
	defer call(shellIcon, nimDelete, uintptr(unsafe.Pointer(&w.tray)))
	go func() { <-ctx.Done(); call(postMsg, w.card, wmClose, 0, 0) }()
	var mmsg msg
	for {
		v := int32(call(getMsg, uintptr(unsafe.Pointer(&mmsg)), 0, 0, 0))
		if v <= 0 {
			break
		}
		call(translate, uintptr(unsafe.Pointer(&mmsg)))
		call(dispatch, uintptr(unsafe.Pointer(&mmsg)))
	}
	return nil
}
func (w *windowsUI) attachDesktop() {
	// WorkerW is Explorer-owned and undocumented. Failure falls back to a
	// non-topmost bottom-level window; live Explorer restart must be verified.
	prog := call(findWindow, utf("Progman"), 0)
	if prog != 0 {
		var result uintptr
		call(sendTimeout, prog, 0x052C, 0, 0, 0, 1000, uintptr(unsafe.Pointer(&result)))
	}
	var worker uintptr
	callback := syscall.NewCallback(func(h, lp uintptr) uintptr {
		def := call(findWindowEx, h, 0, utf("SHELLDLL_DefView"), 0)
		if def != 0 {
			worker = call(findWindowEx, 0, h, utf("WorkerW"), 0)
			return 0
		}
		return 1
	})
	call(enumWindows, callback, 0)
	if worker != 0 && call(setParent, w.card, worker) != 0 {
		style := call(getLong, w.card, -16&0xffffffff)
		call(setLong, w.card, -16&0xffffffff, (style&^wsPopup)|wsChild)
		w.desktopAttached = true
	} else {
		w.desktopAttached = false
		call(setWindowPos, w.card, 1, 0, 0, 0, 0, 0x0013)
	}
}
func (w *windowsUI) Update(d Display) {
	w.mu.Lock()
	w.display = d
	w.mu.Unlock()
	if w.card != 0 {
		call(postMsg, w.card, wmUpdate, 0, 0)
	}
}
func (w *windowsUI) Notify(s string) {
	if w.card == 0 {
		return
	}
	w.mu.Lock()
	icon := w.tray
	w.mu.Unlock()
	icon.Flags = nifInfo
	copy(icon.Info[:], syscall.StringToUTF16(s))
	copy(icon.Title[:], syscall.StringToUTF16("OpenDesk Reset Clock"))
	icon.InfoFlags = 1
	call(shellIcon, nimModify, uintptr(unsafe.Pointer(&icon)))
}
func windowProc(hwnd uintptr, id uint32, wparam, lparam uintptr) uintptr {
	w := current
	if w == nil {
		return call(defProc, hwnd, uintptr(id), wparam, lparam)
	}
	if id == w.taskbar && w.card == hwnd {
		w.attachDesktop()
		call(shellIcon, nimAdd, uintptr(unsafe.Pointer(&w.tray)))
		return 0
	}
	if hwnd == w.settings {
		switch id {
		case wmClose:
			call(showWin, hwnd, swHide)
			return 0
		case wmCommand:
			if uint16(wparam&0xffff) == 1001 {
				b := make([]uint16, 2048)
				call(getText, w.feedEdit, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)))
				w.emit("url", syscall.UTF16ToString(b))
				return 0
			}
		}
	}
	if hwnd == w.card {
		switch id {
		case wmClose:
			if w.settings != 0 {
				call(destroyWin, w.settings)
			}
			call(destroyWin, w.card)
			return 0
		case wmDestroy:
			call(postQuit, 0)
			return 0
		case wmMouseActivate:
			return 3 // MA_NOACTIVATE
		case wmNCHitTest:
			w.mu.Lock()
			locked := w.display.Locked
			w.mu.Unlock()
			if locked {
				return ^uintptr(0)
			} // HTTRANSPARENT = -1
		case wmLButtonDown:
			w.mu.Lock()
			locked := w.display.Locked
			w.mu.Unlock()
			if !locked {
				call(releaseCapture)
				call(sendMsg, hwnd, 0x00A1, 2, 0)
			}
			return 0
		case wmMove:
			w.mu.Lock()
			locked := w.display.Locked
			oldX, oldY := w.display.X, w.display.Y
			w.mu.Unlock()
			if !locked {
				var r rect
				call(getWindowRect, hwnd, uintptr(unsafe.Pointer(&r)))
				if int(r.Left) != oldX || int(r.Top) != oldY {
					w.emit("position", fmt.Sprintf("%d,%d", r.Left, r.Top))
				}
			}
			return 0
		case wmUpdate:
			w.render()
			return 0
		case wmPaint:
			w.paint()
			return 0
		case wmTray:
			if uint32(lparam) == wmRButtonUp {
				w.menu()
				return 0
			}
			if uint32(lparam) == wmLButtonDown {
				w.settingsWindow()
				return 0
			}
		}
	}
	return call(defProc, hwnd, uintptr(id), wparam, lparam)
}
func (w *windowsUI) render() {
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	if w.card == 0 {
		return
	}
	if d.Show {
		call(showWin, w.card, swShowNoActivate)
	} else {
		call(showWin, w.card, swHide)
	}
	// If WorkerW integration failed, preserve HWND_BOTTOM rather than topmost.
	if !w.desktopAttached {
		call(setWindowPos, w.card, 1, uintptr(d.X), uintptr(d.Y), 360, 225, 0x0010)
	}
	if w.desktopAttached {
		call(setWindowPos, w.card, 0, uintptr(d.X), uintptr(d.Y), 360, 225, 0x0010|0x0004)
	}
	if d.Locked {
		call(user32.NewProc("SetWindowLongPtrW"), w.card, -20&0xffffffff, exNoActivate|exToolWindow|exLayered|exTransparent)
	} else {
		call(setLong, w.card, -20&0xffffffff, exNoActivate|exToolWindow|exLayered)
	}
	call(invalidate, w.card, 0, 1)
	if w.settings != 0 {
		call(setText, w.diagnostics, utf(d.Diagnostics))
		if call(user32.NewProc("GetFocus")) != w.feedEdit {
			call(setText, w.feedEdit, utf(d.FeedURL))
		}
	}
}
func (w *windowsUI) paint() {
	var p paint
	hdc := call(beginPaint, w.card, uintptr(unsafe.Pointer(&p)))
	if hdc == 0 {
		return
	}
	area := rect{0, 0, 360, 225}
	brush := call(createBrush, 0x00291E16)
	call(fillRect, hdc, uintptr(unsafe.Pointer(&area)), brush)
	call(deleteObject, brush)
	call(setBk, hdc, 1)
	call(setColor, hdc, 0x00F3F3F3)
	negHeight := int32(-17)
	font := call(createFont, uintptr(negHeight), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, utf("Segoe UI"))
	old := call(selectObject, hdc, font)
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	summary := strings.Join([]string{d.Clock, "", d.Title, d.Summary, d.Published, d.Effective, d.Countdown, d.Health}, "\r\n")
	area = rect{16, 12, 344, 210}
	call(drawText, hdc, utf(summary), ^uintptr(0), uintptr(unsafe.Pointer(&area)), 0x10|0x20|0x0000)
	call(selectObject, hdc, old)
	call(deleteObject, font)
	call(endPaint, w.card, uintptr(unsafe.Pointer(&p)))
}
func (w *windowsUI) menu() {
	m := call(popup)
	defer call(destroyMenu, m)
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	options := []struct{ name, title string }{{"settings", "查看公告 / 设置"}, {"refresh", "立即刷新"}, {"show", "显示 / 隐藏"}, {"lock", "编辑 / 锁定位置"}, {"clock", "12 / 24 小时制"}, {"quiet", "免打扰开关"}, {"advance", "提前10分钟提醒"}, {"manual", "10分钟后手动提醒"}}
	if d.Demo {
		options = append(options, struct{ name, title string }{"demo_v1", "模拟 V1"}, struct{ name, title string }{"demo_v2", "模拟 V2"}, struct{ name, title string }{"demo_v3", "模拟 V3"})
	}
	options = append(options, struct{ name, title string }{"quit", "退出"})
	for i, o := range options {
		call(appendMenu, m, 0, uintptr(i+1), utf(o.title))
	}
	var p point
	call(getCursor, uintptr(unsafe.Pointer(&p)))
	call(setForeground, w.card)
	id := int(call(trackPopup, m, 0x0100|0x0002, uintptr(p.X), uintptr(p.Y), 0, w.card, 0))
	if id < 1 || id > len(options) {
		return
	}
	name := options[id-1].name
	if name == "settings" {
		w.settingsWindow()
	} else if name == "quit" {
		w.emit("quit", "")
		call(postMsg, w.card, wmClose, 0, 0)
	} else {
		w.emit(name, "")
	}
}
func (w *windowsUI) settingsWindow() {
	if w.settings == 0 {
		class := ptr("OpenDesk.ResetClock.Native.R1")
		w.settings = call(createWin, 0, uintptr(unsafe.Pointer(class)), utf("Reset Clock · 设置"), wsOverlapped, 180, 180, 540, 345, 0, 0, call(kernel32.NewProc("GetModuleHandleW"), 0), 0)
		child := func(class, txt string, style uintptr, x, y, width, height int, id uintptr) uintptr {
			return call(createWin, 0, utf(class), utf(txt), wsChild|wsVisible|style, uintptr(x), uintptr(y), uintptr(width), uintptr(height), w.settings, id, 0, 0)
		}
		child("STATIC", "公告来源（HTTPS JSON Feed）", 0, 18, 16, 490, 22, 0)
		w.feedEdit = child("EDIT", "", 0x0080|0x00800000, 18, 44, 485, 28, 0)
		child("BUTTON", "保存并刷新", 0, 18, 82, 126, 29, 1001)
		child("STATIC", "来源状态 / 诊断", 0, 18, 132, 485, 22, 0)
		w.diagnostics = child("EDIT", "", 0x0800|0x0004|0x00200000|0x00800000, 18, 160, 485, 115, 0)
	}
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	call(setText, w.feedEdit, utf(d.FeedURL))
	call(setText, w.diagnostics, utf(d.Diagnostics))
	call(showWin, w.settings, swShow)
	call(setForeground, w.settings)
}
