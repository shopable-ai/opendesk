package automation

import (
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// WindowInfo represents information about a window
// WindowInfo 结构体增加新字段
type WindowInfo struct {
	Title     string `json:"title"`
	ProcessID uint32 `json:"pid"`
	X         int32  `json:"x"`
	Y         int32  `json:"y"`
	Width     int32  `json:"width"`
	Height    int32  `json:"height"`
	ExeName   string `json:"exe_name"` // 添加可执行文件名
	ExePath   string `json:"exe_path"` // 添加可执行文件完整路径
}

// WindowManager handles window-related operations
type WindowManager struct {
	user32 *windows.LazyDLL
}

// NewWindowManager creates a new WindowManager instance
func NewWindowManager() *WindowManager {
	return &WindowManager{
		user32: windows.NewLazySystemDLL("user32.dll"),
	}
}

var (
	procGetWindowTextW           = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextW")
	procGetWindowTextLengthW     = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextLengthW")
	procGetWindowRect            = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowRect")
	procFindWindowW              = windows.NewLazySystemDLL("user32.dll").NewProc("FindWindowW")
	procGetForegroundWindow      = windows.NewLazySystemDLL("user32.dll").NewProc("GetForegroundWindow")
	procSetForegroundWindow      = windows.NewLazySystemDLL("user32.dll").NewProc("SetForegroundWindow")
	procShowWindow               = windows.NewLazySystemDLL("user32.dll").NewProc("ShowWindow")
	procMoveWindow               = windows.NewLazySystemDLL("user32.dll").NewProc("MoveWindow")
	procGetWindowThreadProcessId = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowThreadProcessId")
	kernel32                     = windows.NewLazySystemDLL("kernel32.dll")
	psapi                        = windows.NewLazySystemDLL("psapi.dll")
	procGetModuleFileNameEx      = psapi.NewProc("GetModuleFileNameExW")
	procOpenProcess              = kernel32.NewProc("OpenProcess")
	procPostMessageW             = windows.NewLazySystemDLL("user32.dll").NewProc("PostMessageW")
	procEnumWindows              = windows.NewLazySystemDLL("user32.dll").NewProc("EnumWindows")
	procSendMessageW             = windows.NewLazySystemDLL("user32.dll").NewProc("SendMessageW")
	procTerminateProcess         = kernel32.NewProc("TerminateProcess")
	procGetWindowDC              = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowDC")
	procGetClientRect            = windows.NewLazySystemDLL("user32.dll").NewProc("GetClientRect")
	procGetDC                    = windows.NewLazySystemDLL("user32.dll").NewProc("GetDC")
	procReleaseDC                = windows.NewLazySystemDLL("user32.dll").NewProc("ReleaseDC")
	procEnumChildWindows         = windows.NewLazySystemDLL("user32.dll").NewProc("EnumChildWindows")
	procGetClassName             = windows.NewLazySystemDLL("user32.dll").NewProc("GetClassNameW")
	procGetWindow                = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindow")
	procGetGUIThreadInfo         = windows.NewLazySystemDLL("user32.dll").NewProc("GetGUIThreadInfo")
	// 用于获取编辑框内容
	EM_GETTEXT       = 0x000D
	EM_GETTEXTLENGTH = 0x000E
	// 用于获取富文本框内容
	WM_GETTEXT       = 0x000D
	WM_GETTEXTLENGTH = 0x000E
)

type GUITHREADINFO struct {
	CbSize        uint32
	Flags         uint32
	HwndActive    windows.Handle
	HwndFocus     windows.Handle
	HwndCapture   windows.Handle
	HwndMenuOwner windows.Handle
	HwndMoveSize  windows.Handle
	HwndCaret     windows.Handle
	RcCaret       windows.Rect
}

const (
	SW_HIDE     = 0
	SW_NORMAL   = 1
	SW_MINIMIZE = 6
	SW_MAXIMIZE = 3
	SW_RESTORE  = 9
	WM_CLOSE    = 0x0010
)

func getWindowTitle(hwnd windows.Handle) string {
	textLength, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
	buf := make([]uint16, textLength+1)
	procGetWindowTextW.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
	)
	return windows.UTF16ToString(buf)
}

func getWindowRect(hwnd windows.Handle) (x, y, width, height int32) {
	var rect windows.Rect
	procGetWindowRect.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&rect)),
	)
	return rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top
}

func getWindowProcessId(hwnd windows.Handle) uint32 {
	var processId uint32
	procGetWindowThreadProcessId.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&processId)),
	)
	return processId
}

// 修改 GetActiveWindow 方法
func (w *WindowManager) GetActiveWindow() (*WindowInfo, error) {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return nil, fmt.Errorf("no active window found")
	}

	title := getWindowTitle(windows.Handle(hwnd))
	x, y, width, height := getWindowRect(windows.Handle(hwnd))
	processId := getWindowProcessId(windows.Handle(hwnd))

	// 获取可执行文件信息
	exeName, exePath, _ := getProcessExecutableInfo(processId)

	return &WindowInfo{
		Title:     title,
		ProcessID: processId,
		X:         x,
		Y:         y,
		Width:     width,
		Height:    height,
		ExeName:   exeName,
		ExePath:   exePath,
	}, nil
}

// 修改 GetWindowByTitle 方法
func (w *WindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return nil, fmt.Errorf("invalid title: %v", err)
	}

	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return nil, fmt.Errorf("window with title '%s' not found", title)
	}

	x, y, width, height := getWindowRect(windows.Handle(hwnd))
	processId := getWindowProcessId(windows.Handle(hwnd))

	// 获取可执行文件信息
	exeName, exePath, _ := getProcessExecutableInfo(processId)

	return &WindowInfo{
		Title:     title,
		ProcessID: processId,
		X:         x,
		Y:         y,
		Width:     width,
		Height:    height,
		ExeName:   exeName,
		ExePath:   exePath,
	}, nil
}

// 获取进程可执行文件信息的函数
func getProcessExecutableInfo(processId uint32) (exeName, exePath string, err error) {
	const PROCESS_QUERY_INFORMATION = 0x0400
	const PROCESS_VM_READ = 0x0010

	// 打开进程句柄
	handle, _, _ := procOpenProcess.Call(
		uintptr(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ),
		0,
		uintptr(processId),
	)
	if handle == 0 {
		return "", "", fmt.Errorf("failed to open process")
	}
	defer windows.CloseHandle(windows.Handle(handle))

	// 获取进程可执行文件路径
	buffer := make([]uint16, windows.MAX_PATH)
	ret, _, _ := procGetModuleFileNameEx.Call(
		handle,
		0,
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)
	if ret == 0 {
		return "", "", fmt.Errorf("failed to get process path")
	}

	filePath := windows.UTF16ToString(buffer)

	// 从路径中提取文件名
	parts := strings.Split(filePath, "\\")
	fileName := parts[len(parts)-1]

	return fileName, filePath, nil
}

// Focus activates and brings the specified window to the front
func (w *WindowManager) Focus(title string) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	procSetForegroundWindow.Call(hwnd)
	return nil
}

// SetWindowBounds sets the position and size of a window
func (w *WindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	procMoveWindow.Call(
		hwnd,
		uintptr(x),
		uintptr(y),
		uintptr(width),
		uintptr(height),
		1, // repaint
	)
	return nil
}

// Maximize maximizes the specified window
func (w *WindowManager) Maximize(title string) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	procShowWindow.Call(hwnd, uintptr(SW_MAXIMIZE))
	return nil
}

// Minimize minimizes the specified window
func (w *WindowManager) Minimize(title string) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	procShowWindow.Call(hwnd, uintptr(SW_MINIMIZE))
	return nil
}

// Restore restores a minimized or maximized window to its normal state
func (w *WindowManager) Restore(title string) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	procShowWindow.Call(hwnd, uintptr(SW_RESTORE))
	return nil
}

// CloseWindow 关闭指定标题的窗口
func (w *WindowManager) CloseWindow(title string) error {
	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return fmt.Errorf("window not found")
	}

	// 发送 WM_CLOSE 消息给窗口
	procSendMessageW.Call(
		hwnd,
		uintptr(WM_CLOSE),
		0,
		0,
	)
	return nil
}

// CloseActiveWindow 关闭当前活动窗口
func (w *WindowManager) CloseActiveWindow() error {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return fmt.Errorf("no active window found")
	}

	// 发送 WM_CLOSE 消息给活动窗口
	procSendMessageW.Call(
		hwnd,
		uintptr(WM_CLOSE),
		0,
		0,
	)
	return nil
}

// Kill 终止指定的进程
func (w *WindowManager) Kill(processId uint32) error {
	const PROCESS_TERMINATE = 0x0001

	handle, _, _ := procOpenProcess.Call(
		uintptr(PROCESS_TERMINATE),
		0,
		uintptr(processId),
	)
	if handle == 0 {
		return fmt.Errorf("failed to open process")
	}
	defer windows.CloseHandle(windows.Handle(handle))

	ret, _, _ := procTerminateProcess.Call(
		handle,
		0,
	)
	if ret == 0 {
		return fmt.Errorf("failed to kill process")
	}

	return nil
}

// Title 获取当前活动窗口的标题
func (w *WindowManager) Title() string {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return ""
	}
	return getWindowTitle(windows.Handle(hwnd))
}

// GetTitle 获取指定窗口的标题
func (w *WindowManager) GetTitle(selector string) (string, error) {
	titlePtr, err := windows.UTF16PtrFromString(selector)
	if err != nil {
		return "", fmt.Errorf("invalid selector: %v", err)
	}

	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return "", fmt.Errorf("window with selector '%s' not found", selector)
	}

	return getWindowTitle(windows.Handle(hwnd)), nil
}

// Content 获取当前活动窗口的内容
func (w *WindowManager) Content() string {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return ""
	}
	return w.getWindowContent(windows.Handle(hwnd))
}

// GetContent 获取指定窗口的内容
func (w *WindowManager) GetContent(selector string) (string, error) {
	titlePtr, err := windows.UTF16PtrFromString(selector)
	if err != nil {
		return "", fmt.Errorf("invalid selector: %v", err)
	}

	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		return "", fmt.Errorf("window with selector '%s' not found", selector)
	}

	return w.getWindowContent(windows.Handle(hwnd)), nil
}

// getWindowClass 获取窗口的类名
func getWindowClass(hwnd windows.Handle) string {
	// 分配缓冲区用于存储类名
	buf := make([]uint16, 256)

	// 调用 GetClassName API 获取窗口类名
	ret, _, _ := procGetClassName.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
	)

	if ret == 0 {
		return ""
	}

	// 转换为字符串并返回
	return windows.UTF16ToString(buf)
}

// getWindowContent 增强版获取窗口的完整内容
func (w *WindowManager) getWindowContent(hwnd windows.Handle) string {
	var content strings.Builder

	// 1. 获取主窗口基本内容
	mainText := getWindowText(hwnd)
	if mainText != "" {
		content.WriteString(mainText)
		content.WriteString("\n")
	}

	// 2. 获取窗口类名
	className := getWindowClass(hwnd)

	// 3. 特殊处理不同类型的控件
	switch className {
	case "Edit", "RichEdit", "RichEdit20W", "RICHEDIT50W":
		if text := getRichEditContent(hwnd); text != "" {
			content.WriteString(text)
			content.WriteString("\n")
		}
	}

	// 4. 获取所有子窗口内容
	var getChildContent func(hwnd windows.Handle)
	getChildContent = func(hwnd windows.Handle) {
		// 获取子窗口类名
		childClass := getWindowClass(hwnd)

		// 根据不同类型的控件获取内容
		var childText string
		switch childClass {
		case "Edit", "RichEdit", "RichEdit20W", "RICHEDIT50W":
			childText = getRichEditContent(hwnd)
		default:
			childText = getWindowText(hwnd)
		}

		if childText != "" {
			content.WriteString(childText)
			content.WriteString("\n")
		}

		// 递归获取子窗口的内容
		callback := func(childHwnd windows.Handle, lparam uintptr) uintptr {
			getChildContent(childHwnd)
			return 1
		}

		procEnumChildWindows.Call(
			uintptr(hwnd),
			windows.NewCallback(callback),
			0,
		)
	}

	// 5. 获取焦点窗口的内容
	if focusHwnd := getFocusWindow(hwnd); focusHwnd != 0 {
		if focusText := getWindowText(windows.Handle(focusHwnd)); focusText != "" {
			content.WriteString(focusText)
			content.WriteString("\n")
		}
	}

	// 开始获取子窗口内容
	getChildContent(hwnd)

	return content.String()
}

// getRichEditContent 获取富文本框内容
func getRichEditContent(hwnd windows.Handle) string {
	// 获取文本长度
	length, _, _ := procSendMessageW.Call(
		uintptr(hwnd),
		uintptr(WM_GETTEXTLENGTH),
		0,
		0,
	)

	if length == 0 {
		return ""
	}

	// 分配缓冲区
	buffer := make([]uint16, length+1)

	// 获取文本内容
	procSendMessageW.Call(
		uintptr(hwnd),
		uintptr(WM_GETTEXT),
		uintptr(length+1),
		uintptr(unsafe.Pointer(&buffer[0])),
	)

	return windows.UTF16ToString(buffer)
}

// getFocusWindow 获取窗口当前焦点控件
func getFocusWindow(hwnd windows.Handle) uintptr {
	var threadId uint32
	procGetWindowThreadProcessId.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&threadId)),
	)

	var gui GUITHREADINFO
	gui.CbSize = uint32(unsafe.Sizeof(gui))

	procGetGUIThreadInfo.Call(
		uintptr(threadId),
		uintptr(unsafe.Pointer(&gui)),
	)

	return uintptr(gui.HwndFocus)
}

// getWindowText 获取窗口的文本内容
func getWindowText(hwnd windows.Handle) string {
	textLen, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
	if textLen == 0 {
		return ""
	}

	buffer := make([]uint16, textLen+1)
	procGetWindowTextW.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&buffer[0])),
		uintptr(len(buffer)),
	)

	return windows.UTF16ToString(buffer)
}
