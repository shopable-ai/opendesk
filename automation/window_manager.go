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
)

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
