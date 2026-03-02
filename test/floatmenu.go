package main

import (
	"log"
	"unsafe"

	"github.com/lxn/win"
	"golang.org/x/sys/windows"
)

const (
	IDC_BUTTON1 = 101
	IDC_BUTTON2 = 102
	IDC_BUTTON3 = 103
	IDC_BUTTON4 = 104
)

type WNDCLASSEX struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     win.HINSTANCE
	HIcon         win.HICON
	HCursor       win.HCURSOR
	HbrBackground win.HBRUSH
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       win.HICON
}

var (
	isMouseDown bool
	lastX       int32
	lastY       int32
)

func wndProc(hwnd win.HWND, msg uint32, wParam uintptr, lParam uintptr) uintptr {
	switch msg {
	case win.WM_DESTROY:
		win.PostQuitMessage(0)
		return 0

	case win.WM_LBUTTONDOWN:
		isMouseDown = true
		lastX = int32(win.GET_X_LPARAM(lParam))
		lastY = int32(win.GET_Y_LPARAM(lParam))
		win.SetCapture(hwnd)
		return 0

	case win.WM_MOUSEMOVE:
		if isMouseDown {
			x := int32(win.GET_X_LPARAM(lParam))
			y := int32(win.GET_Y_LPARAM(lParam))

			var rect win.RECT
			win.GetWindowRect(hwnd, &rect)

			deltaX := x - lastX
			deltaY := y - lastY

			win.SetWindowPos(
				hwnd,
				0,
				rect.Left+deltaX,
				rect.Top+deltaY,
				0, 0,
				win.SWP_NOSIZE|win.SWP_NOZORDER,
			)
		}
		return 0

	case win.WM_LBUTTONUP:
		isMouseDown = false
		win.ReleaseCapture()
		return 0

	case win.WM_COMMAND:
		switch win.LOWORD(uint32(wParam)) {
		case IDC_BUTTON1:
			win.MessageBox(hwnd, windows.StringToUTF16Ptr("点击了开始按钮"), windows.StringToUTF16Ptr("提示"), win.MB_OK)
		case IDC_BUTTON2:
			win.MessageBox(hwnd, windows.StringToUTF16Ptr("点击了暂停按钮"), windows.StringToUTF16Ptr("提示"), win.MB_OK)
		case IDC_BUTTON3:
			win.MessageBox(hwnd, windows.StringToUTF16Ptr("点击了停止按钮"), windows.StringToUTF16Ptr("提示"), win.MB_OK)
		case IDC_BUTTON4:
			win.MessageBox(hwnd, windows.StringToUTF16Ptr("点击了设置按钮"), windows.StringToUTF16Ptr("提示"), win.MB_OK)
		}
		return 0
	}

	return win.DefWindowProc(hwnd, msg, wParam, lParam)
}

func main() {
	// 注册窗口类
	className := windows.StringToUTF16Ptr("FloatingToolbar")
	mainInstance := win.GetModuleHandle(nil)
	cursor := win.LoadCursor(0, win.MAKEINTRESOURCE(win.IDC_ARROW))

	wndClass := WNDCLASSEX{
		CbSize:        uint32(unsafe.Sizeof(WNDCLASSEX{})),
		Style:         win.CS_HREDRAW | win.CS_VREDRAW,
		LpfnWndProc:   windows.NewCallback(wndProc),
		HInstance:     mainInstance,
		HCursor:       cursor,
		HbrBackground: win.COLOR_WINDOW + 1,
		LpszClassName: className,
	}

	if atom := win.RegisterClassEx((*win.WNDCLASSEX)(unsafe.Pointer(&wndClass))); atom == 0 {
		log.Fatal("RegisterClassEx failed")
	}

	// 创建主窗口
	hwnd := win.CreateWindowEx(
		win.WS_EX_TOOLWINDOW|win.WS_EX_TOPMOST,
		className,
		windows.StringToUTF16Ptr("录屏工具栏"),
		win.WS_POPUP|win.WS_VISIBLE,
		100, 100, 300, 60,
		0, 0, mainInstance, nil,
	)

	if hwnd == 0 {
		log.Fatal("CreateWindowEx failed")
	}

	// 创建按钮
	buttonWidth := int32(60)
	buttonHeight := int32(40)
	spacing := int32(10)
	startX := int32(20)
	y := int32(10)

	buttons := []struct {
		id   int
		text string
	}{
		{IDC_BUTTON1, "开始"},
		{IDC_BUTTON2, "暂停"},
		{IDC_BUTTON3, "停止"},
		{IDC_BUTTON4, "设置"},
	}

	for i, btn := range buttons {
		x := startX + int32(i)*(buttonWidth+spacing)
		win.CreateWindowEx(
			0,
			windows.StringToUTF16Ptr("BUTTON"),
			windows.StringToUTF16Ptr(btn.text),
			win.WS_CHILD|win.WS_VISIBLE|win.BS_PUSHBUTTON,
			x, y, buttonWidth, buttonHeight,
			hwnd,
			win.HMENU(btn.id),
			mainInstance,
			nil,
		)
	}

	// 消息循环
	var msg win.MSG
	for {
		if win.GetMessage(&msg, 0, 0, 0) == 0 {
			break
		}
		win.TranslateMessage(&msg)
		win.DispatchMessage(&msg)
	}
}
