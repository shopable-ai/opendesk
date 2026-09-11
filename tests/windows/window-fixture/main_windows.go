//go:build windows

package main

import (
	"flag"
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"
)

const (
	csHRedraw = 0x0002
	csVRedraw = 0x0001

	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsBorder           = 0x00800000
	esAutoHScroll      = 0x0080

	swShow = 5

	wmCreate   = 0x0001
	wmDestroy  = 0x0002
	wmSize     = 0x0005
	wmSetFocus = 0x0007
	wmClose    = 0x0010

	colorWindow = 5
	idcArrow    = 32512
)

type point struct {
	X int32
	Y int32
}

type msg struct {
	Hwnd     syscall.Handle
	Message  uint32
	WParam   uintptr
	LParam   uintptr
	Time     uint32
	Pt       point
	LPrivate uint32
}

type wndClass struct {
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   syscall.Handle
	Icon       syscall.Handle
	Cursor     syscall.Handle
	Background syscall.Handle
	MenuName   *uint16
	ClassName  *uint16
}

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procRegisterClassW      = user32.NewProc("RegisterClassW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procShowWindow          = user32.NewProc("ShowWindow")
	procUpdateWindow        = user32.NewProc("UpdateWindow")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procSetFocus            = user32.NewProc("SetFocus")
	procMoveWindow          = user32.NewProc("MoveWindow")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procLoadCursorW         = user32.NewProc("LoadCursorW")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")

	childWindow syscall.Handle
	closeDelay  time.Duration
)

func utf16Ptr(value string) *uint16 {
	ptr, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		panic(err)
	}
	return ptr
}

func lowWord(value uintptr) int32  { return int32(uint16(value & 0xffff)) }
func highWord(value uintptr) int32 { return int32(uint16((value >> 16) & 0xffff)) }

func windowProc(hwnd syscall.Handle, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case wmCreate:
		child, _, _ := procCreateWindowExW.Call(
			0,
			uintptr(unsafe.Pointer(utf16Ptr("EDIT"))),
			uintptr(unsafe.Pointer(utf16Ptr("OpenDesk Focus Target"))),
			wsChild|wsVisible|wsBorder|esAutoHScroll,
			20, 20, 360, 32,
			uintptr(hwnd), 0, 0, 0,
		)
		childWindow = syscall.Handle(child)
		if child != 0 {
			procSetFocus.Call(child)
		}
		return 0
	case wmSetFocus:
		if childWindow != 0 {
			procSetFocus.Call(uintptr(childWindow))
		}
		return 0
	case wmSize:
		if childWindow != 0 {
			width := lowWord(lParam)
			if width < 80 {
				width = 80
			}
			procMoveWindow.Call(uintptr(childWindow), 20, 20, uintptr(width-40), 32, 1)
		}
		return 0
	case wmClose:
		if closeDelay > 0 {
			time.Sleep(closeDelay)
		}
		procDestroyWindow.Call(uintptr(hwnd))
		return 0
	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(message), wParam, lParam)
	return result
}

func main() {
	title := flag.String("title", "OpenDesk Window Fixture", "window title")
	closeDelayMS := flag.Int("close-delay-ms", 0, "delay handling WM_CLOSE")
	x := flag.Int("x", 180, "initial x")
	y := flag.Int("y", 140, "initial y")
	width := flag.Int("width", 640, "initial width")
	height := flag.Int("height", 420, "initial height")
	flag.Parse()

	if *closeDelayMS < 0 {
		fmt.Fprintln(os.Stderr, "close-delay-ms must be non-negative")
		os.Exit(2)
	}
	closeDelay = time.Duration(*closeDelayMS) * time.Millisecond

	instance, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, idcArrow)
	className := utf16Ptr("OpenDeskWindowManagerFixture")
	wc := wndClass{
		Style:      csHRedraw | csVRedraw,
		WndProc:    syscall.NewCallback(windowProc),
		Instance:   syscall.Handle(instance),
		Cursor:     syscall.Handle(cursor),
		Background: syscall.Handle(colorWindow + 1),
		ClassName:  className,
	}
	atom, _, registerErr := procRegisterClassW.Call(uintptr(unsafe.Pointer(&wc)))
	if atom == 0 {
		fmt.Fprintf(os.Stderr, "RegisterClassW failed: %v\n", registerErr)
		os.Exit(1)
	}

	hwnd, _, createErr := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(utf16Ptr(*title))),
		wsOverlappedWindow|wsVisible,
		uintptr(*x), uintptr(*y), uintptr(*width), uintptr(*height),
		0, 0, instance, 0,
	)
	if hwnd == 0 {
		fmt.Fprintf(os.Stderr, "CreateWindowExW failed: %v\n", createErr)
		os.Exit(1)
	}

	procShowWindow.Call(hwnd, swShow)
	procUpdateWindow.Call(hwnd)
	procSetForegroundWindow.Call(hwnd)
	if childWindow != 0 {
		procSetFocus.Call(uintptr(childWindow))
	}
	fmt.Printf("WINDOW_FIXTURE_READY pid=%d hwnd=%d title=%q\n", os.Getpid(), hwnd, *title)

	var message msg
	for {
		result, _, messageErr := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(result) == -1 {
			fmt.Fprintf(os.Stderr, "GetMessageW failed: %v\n", messageErr)
			os.Exit(1)
		}
		if result == 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}
}
