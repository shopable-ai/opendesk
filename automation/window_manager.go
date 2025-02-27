package automation

import (
	"fmt"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// WindowInfo represents information about a window
// WindowInfo 结构体增加新字段
type WindowInfo struct {
	Title        string  `json:"title"`
	ProcessID    uint32  `json:"pid"`
	X            int32   `json:"x"`
	Y            int32   `json:"y"`
	Width        int32   `json:"width"`
	Height       int32   `json:"height"`
	ExeName      string  `json:"exeName"`
	ExePath      string  `json:"exePath"`
	IsForeground bool    `json:"isForeground"`
	HasFocus     bool    `json:"hasFocus"`
	Handle       uintptr `json:"handle"`
	IsPopup      bool    `json:"isPopup"`
	Index        int     `json:"index"`
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

// 系统指标常量
const (
	SM_CXSCREEN               = 0
	SM_CYSCREEN               = 1
	PROCESS_QUERY_INFORMATION = 0x0400
	PROCESS_VM_READ           = 0x0010

	GWL_STYLE    = -16
	GWL_STYLE_32 = -16
	GWL_EXSTYLE  = -20

	// 扩展窗口风格
	WS_EX_TOOLWINDOW = 0x00000080

	// 窗口风格
	WS_CHILD = 0x40000000
)

var (
	procGetWindowTextW           = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextW")
	procGetWindowTextLengthW     = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextLengthW")
	procGetCurrentThreadId       = user32.NewProc("GetCurrentThreadId")
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
	procIsWindow                 = user32.NewProc("IsWindow")
	procGetDesktopWindow         = user32.NewProc("GetDesktopWindow")
	// 用于获取编辑框内容
	EM_GETTEXT       = 0x000D
	EM_GETTEXTLENGTH = 0x000E
	// 用于获取富文本框内容
	WM_GETTEXT          = 0x000D
	WM_GETTEXTLENGTH    = 0x000E
	procIsWindowVisible = windows.NewLazySystemDLL("user32.dll").NewProc("IsWindowVisible")
	procGetWindowLongW  = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowLongW")
)

// 添加新的系统调用
var (
	user32                = syscall.NewLazyDLL("user32.dll")
	procGetWindowLong     = user32.NewProc("GetWindowLongW")
	procGetClassNameW     = user32.NewProc("GetClassNameW")
	procGetWindowLongPtrW = user32.NewProc("GetWindowLongPtrW")
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
	SW_HIDE          = 0
	SW_NORMAL        = 1
	SW_MINIMIZE      = 6
	SW_MAXIMIZE      = 3
	SW_RESTORE       = 9
	WS_POPUP         = 0x80000000
	WM_CLOSE         = 0x0010
	SW_SHOW          = 5
	SW_SHOWMINIMIZED = 2
	// 新增常量
	HWND_TOP              = 0
	HWND_TOPMOST   uint32 = 0xFFFFFFFF // -1 的无符号表示
	HWND_NOTOPMOST uint32 = 0xFFFFFFFE // -2 的无符号表示

	SWP_NOMOVE     = 0x0002
	SWP_NOSIZE     = 0x0001
	SWP_SHOWWINDOW = 0x0040
	GW_HWNDNEXT    = 2
)

// POINT 定义了一个点的坐标
type POINT struct {
	X, Y int32
}

// RECT 定义了一个矩形的坐标
type RECT struct {
	Left, Top, Right, Bottom int32
}

// WINDOWPLACEMENT 结构体定义
type WINDOWPLACEMENT struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    POINT
	PtMaxPosition    POINT
	RcNormalPosition RECT
}

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

// 获取系统指标函数
func getSystemMetrics(nIndex int) int32 {
	ret, _, _ := user32.NewProc("GetSystemMetrics").Call(uintptr(nIndex))
	return int32(ret)
}

// GetActiveWindow 获取当前活动窗口信息
func (w *WindowManager) GetActiveWindow() (*WindowInfo, error) {
	hwnd, _, _ := procGetForegroundWindow.Call()

	// fmt.Printf("GetForegroundWindow返回句柄: 0x%x\n", hwnd)

	if hwnd == 0 {
		// fmt.Println("警告: GetForegroundWindow返回了0句柄")

		// 尝试获取顶层可见窗口作为备选
		topHwnd := w.getTopWindow()
		if topHwnd != 0 {
			// fmt.Printf("使用顶层可见窗口代替: 0x%x\n", topHwnd)
			hwnd = topHwnd
		} else {
			// 如果找不到顶层窗口，最后才使用桌面窗口
			hwnd, _, _ = procGetDesktopWindow.Call()
			// fmt.Printf("使用桌面窗口代替: 0x%x\n", hwnd)

			if hwnd == 0 {
				// fmt.Println("极端情况: 无法获取桌面窗口")
				// 返回默认信息
				return &WindowInfo{
					Title:     "系统桌面",
					ProcessID: 0,
					X:         0,
					Y:         0,
					Width:     getSystemMetrics(SM_CXSCREEN),
					Height:    getSystemMetrics(SM_CYSCREEN),
					ExeName:   "explorer.exe",
					ExePath:   "",
				}, nil
			}
		}
	}

	// 安全地获取窗口信息
	var title string
	var x, y, width, height int32
	var processId uint32
	var exeName, exePath string

	// 使用recover防止任何可能的panic
	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("获取窗口标题时发生panic: %v\n", r)
			}
		}()

		title = getWindowTitle(windows.Handle(hwnd))
	}()

	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("获取窗口位置时发生panic: %v\n", r)
			}
		}()

		x, y, width, height = getWindowRect(windows.Handle(hwnd))
	}()

	func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("获取进程ID时发生panic: %v\n", r)
			}
		}()

		processId = getWindowProcessId(windows.Handle(hwnd))
	}()

	// 仅在获取到有效进程ID时尝试获取可执行文件信息
	if processId > 0 {
		func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Printf("获取进程可执行文件信息时发生panic: %v\n", r)
				}
			}()

			exeName, exePath, _ = getProcessExecutableInfo(processId)
		}()
	}

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

// getTopWindow 获取Z顺序中的顶层可见窗口
func (w *WindowManager) getTopWindow() uintptr {
	var result uintptr = 0

	// 枚举所有顶级窗口的函数
	enumFunc := syscall.NewCallback(func(hwnd uintptr, lParam uintptr) uintptr {
		// 忽略不可见窗口
		isVisible, _, _ := procIsWindowVisible.Call(hwnd)
		if isVisible == 0 {
			return 1 // 继续枚举
		}

		// 忽略无标题窗口
		length, _, _ := procGetWindowTextLengthW.Call(hwnd)
		if length == 0 {
			return 1 // 继续枚举
		}

		// 检查窗口是否为工具窗口或子窗口
		// style, _, _ := procGetWindowLongPtrW.Call(uintptr(hwnd), uintptr(uint(GWL_STYLE)))
		// exStyle, _, _ := procGetWindowLongPtrW.Call(uintptr(hwnd), uintptr(uint(GWL_EXSTYLE)))
		// style, _, _ := procGetWindowLongPtrW.Call(uintptr(hwnd), uintptr(GWL_STYLE))
		// exStyle, _, _ := procGetWindowLongPtrW.Call(uintptr(hwnd), uintptr(GWL_EXSTYLE))
		// For 32-bit systems, use the following approach
		style, _, _ := procGetWindowLongPtrW.Call(hwnd, ^uintptr(15))   // equivalent to -16
		exStyle, _, _ := procGetWindowLongPtrW.Call(hwnd, ^uintptr(19)) // equivalent to -20

		// 忽略工具窗口
		if (exStyle & WS_EX_TOOLWINDOW) != 0 {
			return 1
		}

		// 忽略子窗口
		if (style & WS_CHILD) != 0 {
			return 1
		}

		// 忽略任务栏
		className := make([]uint16, 256)
		procGetClassNameW.Call(
			hwnd,
			uintptr(unsafe.Pointer(&className[0])),
			256,
		)
		classNameStr := windows.UTF16ToString(className)

		if classNameStr == "Shell_TrayWnd" || classNameStr == "Shell_SecondaryTrayWnd" {
			return 1
		}

		// 找到了有效窗口，存储并停止枚举
		result = hwnd
		return 0 // 停止枚举
	})

	// 开始枚举顶级窗口
	procEnumWindows.Call(enumFunc, 0)

	return result
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

func (w *WindowManager) RestoreByPID(pid uint32) error {
	var targetHwnd uintptr
	var foundWindow bool

	// Define window enumeration callback
	enumWindows := func(hwnd syscall.Handle, lparam uintptr) uintptr {
		var windowPID uint32
		procGetWindowThreadProcessId.Call(
			uintptr(hwnd),
			uintptr(unsafe.Pointer(&windowPID)),
		)

		if windowPID == pid {
			// Get window info for logging
			title := getWindowTitle(windows.Handle(hwnd))
			style := getWindowStyle(hwnd)
			isVisible, _, _ := procIsWindowVisible.Call(uintptr(hwnd))

			// Log window details for debugging
			fmt.Printf("Found window - PID: %d, Title: %s, Style: %x, Visible: %v\n",
				pid, title, style, isVisible != 0)

			// Not a child window and has title - likely main window
			if style&0x40000000 == 0 && title != "" {
				targetHwnd = uintptr(hwnd)
				foundWindow = true
				return 0
			}
		}
		return 1
	}

	// Enumerate windows
	cb := syscall.NewCallback(enumWindows)
	procEnumWindows.Call(cb, 0)

	if !foundWindow {
		return fmt.Errorf("no suitable window found for process ID %d", pid)
	}

	// Get current window placement
	var placement WINDOWPLACEMENT
	placement.Length = uint32(unsafe.Sizeof(placement))
	ret, _, err := windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowPlacement").Call(
		targetHwnd,
		uintptr(unsafe.Pointer(&placement)),
	)

	if ret == 0 {
		return fmt.Errorf("failed to get window placement for PID %d: %v", pid, err)
	}

	// Log current window state
	fmt.Printf("Current window state - ShowCmd: %d, Flags: %d\n",
		placement.ShowCmd, placement.Flags)

	// Try multiple restore approaches
	restoreApproaches := []struct {
		name string
		fn   func() error
	}{
		{"normal restore", func() error {
			ret, _, err := procShowWindow.Call(targetHwnd, uintptr(SW_RESTORE))
			if ret == 0 {
				return fmt.Errorf("ShowWindow(SW_RESTORE) failed: %v", err)
			}
			return nil
		}},
		{"hide-show cycle", func() error {
			if ret, _, err := procShowWindow.Call(targetHwnd, uintptr(SW_HIDE)); ret == 0 {
				return fmt.Errorf("ShowWindow(SW_HIDE) failed: %v", err)
			}
			time.Sleep(100 * time.Millisecond)
			if ret, _, err := procShowWindow.Call(targetHwnd, uintptr(SW_SHOW)); ret == 0 {
				return fmt.Errorf("ShowWindow(SW_SHOW) failed: %v", err)
			}
			return nil
		}},
		{"force normal state", func() error {
			if ret, _, err := procShowWindow.Call(targetHwnd, uintptr(SW_NORMAL)); ret == 0 {
				return fmt.Errorf("ShowWindow(SW_NORMAL) failed: %v", err)
			}
			return nil
		}},
	}

	var lastError error
	for _, approach := range restoreApproaches {
		fmt.Printf("Trying %s approach...\n", approach.name)
		if err := approach.fn(); err != nil {
			fmt.Printf("Failed with %s approach: %v\n", approach.name, err)
			lastError = err
			continue
		}

		// Verify window is now visible
		if visible, _, _ := procIsWindowVisible.Call(targetHwnd); visible != 0 {
			fmt.Printf("Successfully restored window using %s approach\n", approach.name)

			// Ensure window is in visible area
			var rect windows.Rect
			if ret, _, _ := procGetWindowRect.Call(targetHwnd, uintptr(unsafe.Pointer(&rect))); ret != 0 {
				if rect.Left <= -32000 || rect.Top <= -32000 {
					procMoveWindow.Call(
						targetHwnd,
						100,
						100,
						uintptr(rect.Right-rect.Left),
						uintptr(rect.Bottom-rect.Top),
						1,
					)
				}
			}

			// Bring window to front
			procSetForegroundWindow.Call(targetHwnd)
			return nil
		}
	}

	return fmt.Errorf("all restore approaches failed for PID %d - last error: %v", pid, lastError)
}

// MinimizeByPID 通过进程ID最小化窗口
func (w *WindowManager) MinimizeByPID(pid uint32) error {
	var targetHwnd uintptr
	var foundWindow bool

	// 定义枚举窗口的回调函数
	enumWindows := func(hwnd syscall.Handle, lparam uintptr) uintptr {
		var windowPID uint32
		procGetWindowThreadProcessId.Call(
			uintptr(hwnd),
			uintptr(unsafe.Pointer(&windowPID)),
		)

		if windowPID == pid {
			title := getWindowTitle(windows.Handle(hwnd))
			style := getWindowStyle(hwnd)

			// 不是子窗口且有标题的窗口很可能是主窗口
			if style&0x40000000 == 0 && title != "" {
				targetHwnd = uintptr(hwnd)
				foundWindow = true
				return 0
			}
		}
		return 1
	}

	// 枚举所有窗口
	cb := syscall.NewCallback(enumWindows)
	procEnumWindows.Call(cb, 0)

	if !foundWindow {
		return fmt.Errorf("no suitable window found for process ID %d", pid)
	}

	// 获取当前窗口状态
	var placement WINDOWPLACEMENT
	placement.Length = uint32(unsafe.Sizeof(placement))
	ret, _, _ := windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowPlacement").Call(
		targetHwnd,
		uintptr(unsafe.Pointer(&placement)),
	)

	if ret == 0 {
		return fmt.Errorf("failed to get window placement for PID %d", pid)
	}

	// 如果窗口已经最小化，直接返回
	if placement.ShowCmd == SW_SHOWMINIMIZED {
		return nil
	}

	// 最小化窗口
	ret, _, _ = procShowWindow.Call(targetHwnd, uintptr(SW_MINIMIZE))
	if ret == 0 {
		return fmt.Errorf("failed to minimize window for PID %d", pid)
	}

	return nil
}

// MaximizeByPID 通过进程ID最大化对应的窗口
func (w *WindowManager) MaximizeByPID(pid uint32) error {
	var targetHwnd uintptr
	var foundWindow bool

	// 定义枚举窗口的回调函数
	enumWindows := func(hwnd syscall.Handle, lparam uintptr) uintptr {
		// 获取窗口的进程ID
		var windowPID uint32
		procGetWindowThreadProcessId.Call(
			uintptr(hwnd),
			uintptr(unsafe.Pointer(&windowPID)),
		)

		// 如果找到匹配的进程ID
		if windowPID == pid {
			// 获取窗口标题
			title := getWindowTitle(windows.Handle(hwnd))

			// 获取窗口样式
			style := getWindowStyle(hwnd)

			// 不是子窗口且有标题的窗口很可能是主窗口
			if style&0x40000000 == 0 && title != "" { // WS_CHILD = 0x40000000
				targetHwnd = uintptr(hwnd)
				foundWindow = true
				return 0 // 停止枚举
			}
		}

		return 1 // 继续枚举
	}

	// 枚举所有窗口
	cb := syscall.NewCallback(enumWindows)
	procEnumWindows.Call(cb, 0)

	if !foundWindow {
		return fmt.Errorf("no suitable window found for process ID %d", pid)
	}

	// 获取窗口位置和大小
	var rect windows.Rect
	ret, _, err := procGetWindowRect.Call(
		targetHwnd,
		uintptr(unsafe.Pointer(&rect)),
	)
	if ret == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("GetWindowRect failed for PID %d: %v", pid, lastErr)
	}

	// 检查窗口是否最小化
	if rect.Left <= -32000 || rect.Top <= -32000 {
		// 先恢复窗口
		ret, _, err = procShowWindow.Call(
			targetHwnd,
			uintptr(SW_RESTORE),
		)
		if ret == 0 {
			fmt.Printf("Warning: ShowWindow (restore) failed for PID %d: %v\n", pid, err)
		}

		// 等待窗口恢复
		time.Sleep(100 * time.Millisecond)
	}

	// 将窗口设置为前台
	ret, _, err = procSetForegroundWindow.Call(targetHwnd)
	if ret == 0 {
		fmt.Printf("Warning: SetForegroundWindow failed for PID %d: %v\n", pid, err)
	}

	// 最大化窗口
	ret, _, err = procShowWindow.Call(
		targetHwnd,
		uintptr(SW_MAXIMIZE),
	)

	if ret == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("ShowWindow (maximize) failed for PID %d: %v", pid, lastErr)
	}

	// 确保窗口在最前
	ret, _, err = procSetWindowPos.Call(
		targetHwnd,
		0,          // HWND_TOP
		0, 0, 0, 0, // 位置和大小不变
		uintptr(SWP_NOMOVE|SWP_NOSIZE|SWP_SHOWWINDOW),
	)

	if ret == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("SetWindowPos failed for PID %d: %v", pid, lastErr)
	}

	return nil
}

// CloseWindow 关闭指定标题的窗口
func (w *WindowManager) CloseWindow(title string) error {
	fmt.Printf("尝试关闭窗口: %s\n", title)

	titlePtr, _ := windows.UTF16PtrFromString(title)
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		fmt.Printf("未找到窗口: %s\n", title)
		return fmt.Errorf("window not found")
	}

	fmt.Printf("找到窗口句柄: 0x%x\n", hwnd)

	// 先尝试激活窗口，确保它可以接收消息
	procSetForegroundWindow.Call(hwnd)
	time.Sleep(100 * time.Millisecond) // 给窗口一点时间来响应

	// 方案1: 使用PostMessage代替SendMessage (异步，不阻塞)
	success, _, err := procPostMessageW.Call(
		hwnd,
		uintptr(WM_CLOSE),
		0,
		0,
	)

	if success == 0 {
		fmt.Printf("PostMessage发送关闭消息失败: %v\n", err)

		// 方案2: 如果PostMessage失败，尝试使用SendMessage
		fmt.Printf("尝试使用SendMessage关闭窗口...\n")
		_, _, err = procSendMessageW.Call(
			hwnd,
			uintptr(WM_CLOSE),
			0,
			0,
		)

		if err != nil && err != windows.ERROR_SUCCESS {
			fmt.Printf("SendMessage也失败了: %v\n", err)
			return fmt.Errorf("关闭窗口失败: %v", err)
		}
	}

	// 验证窗口是否真的关闭
	// 有些窗口可能需要更多时间来处理关闭请求
	for i := 0; i < 5; i++ {
		time.Sleep(200 * time.Millisecond)
		isWindowVisible, _, _ := procIsWindow.Call(hwnd)
		if isWindowVisible == 0 {
			fmt.Printf("窗口已成功关闭\n")
			return nil
		}
	}

	fmt.Printf("警告：发送了关闭消息，但窗口似乎没有关闭\n")
	return fmt.Errorf("窗口可能拒绝了关闭请求")
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

// List returns window information in a format suitable for JavaScript
func (w *WindowManager) List() ([]map[string]interface{}, error) {
	// 首先获取所有窗口
	var allWindows []syscall.Handle
	enumWindows := func(hwnd syscall.Handle, lparam uintptr) uintptr {
		isVisible, _, _ := procIsWindowVisible.Call(uintptr(hwnd))
		if isVisible != 0 {
			title := getWindowTitle(windows.Handle(hwnd))
			if title != "" {
				allWindows = append(allWindows, hwnd)
			}
		}
		return 1
	}

	cb := syscall.NewCallback(enumWindows)
	procEnumWindows.Call(cb, 0)

	// 获取前台窗口
	foregroundHwnd, _, _ := procGetForegroundWindow.Call()

	// 构建窗口Z顺序链（从顶到底）
	var orderedWindows []syscall.Handle

	// 1. 把前台窗口放在第一位
	if foregroundHwnd != 0 {
		for i, hwnd := range allWindows {
			if uintptr(hwnd) == foregroundHwnd {
				orderedWindows = append(orderedWindows, hwnd)
				allWindows = append(allWindows[:i], allWindows[i+1:]...)
				break
			}
		}
	}

	// 2. 使用GetWindow + GW_HWNDNEXT构建Z顺序
	currentHwnd := foregroundHwnd
	for currentHwnd != 0 && len(orderedWindows) < len(allWindows)+1 {
		nextHwnd, _, _ := procGetWindow.Call(currentHwnd, GW_HWNDNEXT)
		if nextHwnd != 0 {
			// 检查这个窗口是否在我们的列表中
			for i, hwnd := range allWindows {
				if uintptr(hwnd) == nextHwnd {
					orderedWindows = append(orderedWindows, hwnd)
					allWindows = append(allWindows[:i], allWindows[i+1:]...)
					break
				}
			}
		}
		currentHwnd = nextHwnd
		if currentHwnd == 0 {
			break
		}
	}

	// 3. 添加剩余的窗口（如果有的话）
	orderedWindows = append(orderedWindows, allWindows...)

	// 创建最终的窗口信息列表，但使用map[string]interface{}格式
	var windowsList []map[string]interface{}
	windowCount := len(orderedWindows)

	for i, hwnd := range orderedWindows {
		// 获取窗口信息，与之前相同
		title := getWindowTitle(windows.Handle(hwnd))
		x, y, width, height := getWindowRect(windows.Handle(hwnd))
		processId := getWindowProcessId(windows.Handle(hwnd))
		exeName, exePath, _ := getProcessExecutableInfo(processId)

		isForeground := uintptr(hwnd) == foregroundHwnd

		hasFocus := false
		focusHwnd := getForegroundWindow()
		if focusHwnd != 0 {
			focusHandle := windows.Handle(focusHwnd)
			threadFocus := getFocusWindow(focusHandle)
			hasFocus = uintptr(hwnd) == threadFocus
		}

		style := getWindowStyle(hwnd)
		isPopup := (style & WS_POPUP) == WS_POPUP

		// 使用map[string]interface{}代替结构体
		// 修改索引值，使其类似于HTML的z-index：数字越大，显示层级越高
		zIndex := windowCount - i - 1

		windowInfo := map[string]interface{}{
			"title":        title,
			"processId":    processId,
			"x":            x,
			"y":            y,
			"width":        width,
			"height":       height,
			"exeName":      exeName,
			"exePath":      exePath,
			"isForeground": isForeground,
			"hasFocus":     hasFocus,
			"isPopup":      isPopup,
			"handle":       uintptr(hwnd),
			"index":        zIndex, // 数字越大，显示层级越高，类似HTML的z-index
		}

		windowsList = append(windowsList, windowInfo)
	}

	return windowsList, nil
}

func getWindowStyle(hwnd syscall.Handle) uint32 {
	ret, _, _ := procGetWindowLongW.Call(
		uintptr(hwnd),
		^uintptr(15), // This is equivalent to -16 but avoids the overflow
	)
	return uint32(ret)
}

// Add these to your console.go or appropriate logging file:
func (c *Console) formatWindowInfo(info *WindowInfo) string {
	if info == nil {
		return "null"
	}
	return fmt.Sprintf(
		"{title: %q, processId: %d, exeName: %q, isForeground: %v, hasFocus: %v, isPopup: %v, handle: %d, dimensions: {x: %d, y: %d, width: %d, height: %d}}",
		info.Title,
		info.ProcessID,
		info.ExeName,
		info.IsForeground,
		info.HasFocus,
		info.IsPopup,
		info.Handle,
		info.X,
		info.Y,
		info.Width,
		info.Height,
	)
}

// Keep only one version of getWindowClass
func getWindowClass(hwnd windows.Handle) string {
	buf := make([]uint16, 256)
	ret, _, _ := procGetClassName.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
	)
	if ret == 0 {
		return ""
	}
	return windows.UTF16ToString(buf)
}

// isWindowVisible 判断窗口是否可见
func isWindowVisible(hwnd syscall.Handle) bool {
	ret, _, _ := windows.NewLazySystemDLL("user32.dll").NewProc("IsWindowVisible").Call(uintptr(hwnd))
	return ret != 0
}

// getForegroundWindow 获取前台窗口句柄
func getForegroundWindow() uintptr {
	hwnd, _, _ := procGetForegroundWindow.Call()
	return hwnd
}

// Function to get focused window of a thread
func getFocusWindowHandle(hwnd windows.Handle) uintptr {
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

// Add this to your automation/window.go file

// GetFocusWindow returns information about the currently focused window
func (w *WindowManager) GetFocusWindow() (*WindowInfo, error) {
	// Get the foreground window first
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		// If no foreground window, return null without error
		return nil, nil
	}

	// Get the focused window handle
	focusHwnd := getFocusWindow(windows.Handle(hwnd))
	if focusHwnd == 0 {
		// If no focus window, fall back to foreground window
		focusHwnd = hwnd
	}

	// Get window properties
	title := getWindowTitle(windows.Handle(focusHwnd))
	x, y, width, height := getWindowRect(windows.Handle(focusHwnd))
	processId := getWindowProcessId(windows.Handle(focusHwnd))

	// Get executable information
	exeName, exePath, _ := getProcessExecutableInfo(processId)

	// Check if window is foreground
	foregroundHwnd, _, _ := procGetForegroundWindow.Call()
	isForeground := focusHwnd == foregroundHwnd

	// Get window style to check if it's a popup
	style := getWindowStyle(syscall.Handle(focusHwnd))
	isPopup := (style & WS_POPUP) == WS_POPUP

	return &WindowInfo{
		Title:        title,
		ProcessID:    processId,
		X:            x,
		Y:            y,
		Width:        width,
		Height:       height,
		ExeName:      exeName,
		ExePath:      exePath,
		IsForeground: isForeground,
		HasFocus:     focusHwnd == hwnd,
		Handle:       uintptr(focusHwnd),
		IsPopup:      isPopup,
	}, nil
}

// Modify getFocusWindow to be more robust
func getFocusWindow(hwnd windows.Handle) uintptr {
	var threadId uint32
	procGetWindowThreadProcessId.Call(
		uintptr(hwnd),
		uintptr(unsafe.Pointer(&threadId)),
	)

	var gui GUITHREADINFO
	gui.CbSize = uint32(unsafe.Sizeof(gui))

	ret, _, _ := procGetGUIThreadInfo.Call(
		uintptr(threadId),
		uintptr(unsafe.Pointer(&gui)),
	)

	if ret == 0 || gui.HwndFocus == 0 {
		// If we can't get focus info or there's no focus window,
		// return the original window handle
		return uintptr(hwnd)
	}

	return uintptr(gui.HwndFocus)
}

// 添加新的Windows API调用
var (
	// 已有的变量声明
	procSetWindowPos = windows.NewLazySystemDLL("user32.dll").NewProc("SetWindowPos")
)

// SetAlwaysOnTop 设置窗口始终置顶
func (w *WindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	if title == "" {
		return fmt.Errorf("window title cannot be empty")
	}

	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return fmt.Errorf("invalid title: %v", err)
	}

	hwnd, _, err := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("FindWindow failed for '%s': %v", title, lastErr)
	}

	// 确保窗口可见
	visible, _, _ := procIsWindowVisible.Call(hwnd)
	if visible == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("window '%s' is not visible: %v", title, lastErr)
	}

	// 记录原始窗口位置和大小
	var rect windows.Rect
	ret, _, err := procGetWindowRect.Call(
		hwnd,
		uintptr(unsafe.Pointer(&rect)),
	)
	if ret == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("GetWindowRect failed for '%s': %v", title, lastErr)
	}

	// 如果窗口在屏幕外，先移动到可见区域
	if rect.Left < -10000 || rect.Top < -10000 {
		ret, _, err = procMoveWindow.Call(
			hwnd,
			100,
			100,
			uintptr(rect.Right-rect.Left),
			uintptr(rect.Bottom-rect.Top),
			1,
		)
		if ret == 0 {
			lastErr := syscall.GetLastError()
			return fmt.Errorf("MoveWindow failed for '%s': %v", title, lastErr)
		}
	}

	// 先尝试激活窗口
	ret, _, err = procSetForegroundWindow.Call(hwnd)
	if ret == 0 {
		// 记录错误但继续执行
		fmt.Printf("Warning: SetForegroundWindow failed for '%s': %v\n", title, err)
	}

	// 设置窗口位置
	var flag uintptr
	if alwaysOnTop {
		flag = ^uintptr(0) // HWND_TOPMOST (-1)
	} else {
		flag = ^uintptr(1) // HWND_NOTOPMOST (-2)
	}

	ret, _, err = procSetWindowPos.Call(
		hwnd,
		flag,
		uintptr(rect.Left),
		uintptr(rect.Top),
		uintptr(rect.Right-rect.Left),
		uintptr(rect.Bottom-rect.Top),
		uintptr(SWP_SHOWWINDOW),
	)

	if ret == 0 {
		lastErr := syscall.GetLastError()
		return fmt.Errorf("SetWindowPos failed for '%s': %v", title, lastErr)
	}

	return nil
}

// UnsetTopMost 取消窗口的置顶状态
func (w *WindowManager) UnsetTopMost(title string) error {
	if title == "" {
		return fmt.Errorf("window title cannot be empty")
	}
	return w.SetAlwaysOnTop(title, false)
}

// WindowManager 的方法之一
func (w *WindowManager) attachThreadInput(idAttach, idAttachTo uint32, attach bool) error {
	var attachVal uintptr
	if attach {
		attachVal = 1
	}

	ret, _, err := windows.NewLazySystemDLL("user32.dll").NewProc("AttachThreadInput").Call(
		uintptr(idAttach),
		uintptr(idAttachTo),
		attachVal,
	)

	if ret == 0 {
		return fmt.Errorf("AttachThreadInput failed: %v", err)
	}
	return nil
}

func (w *WindowManager) BringToTop(title string, pid interface{}) error {
	if title == "" {
		return fmt.Errorf("window title cannot be empty")
	}

	// fmt.Printf("BringToTop called with title: '%s'\n", title)
	// fmt.Printf("PID parameter type: %T, value: %v\n", pid, pid)

	targetPID := uint32(jsToInt(pid))
	// fmt.Printf("Converted target PID: %d\n", targetPID)

	// 直接尝试通过标题查找窗口
	titlePtr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return fmt.Errorf("invalid title: %v", err)
	}

	// 尝试直接找到窗口句柄
	hwnd, _, _ := procFindWindowW.Call(
		0,
		uintptr(unsafe.Pointer(titlePtr)),
	)

	if hwnd == 0 {
		fmt.Printf("FindWindow failed, trying EnumWindows...\n")
		// 如果直接查找失败，则使用EnumWindows
		type WindowInfo struct {
			hwnd  uintptr
			pid   uint32
			title string
		}

		var foundWindow WindowInfo
		var found bool

		enumFunc := syscall.NewCallback(func(hwnd syscall.Handle, lparam uintptr) uintptr {
			// 获取窗口标题
			length, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
			if length == 0 {
				return 1
			}

			buf := make([]uint16, length+1)
			_, _, _ = procGetWindowTextW.Call(
				uintptr(hwnd),
				uintptr(unsafe.Pointer(&buf[0])),
				uintptr(len(buf)),
			)

			windowTitle := syscall.UTF16ToString(buf)

			// 获取窗口PID
			var windowPID uint32
			_, _, _ = procGetWindowThreadProcessId.Call(
				uintptr(hwnd),
				uintptr(unsafe.Pointer(&windowPID)),
			)

			// fmt.Printf("Checking window - Title: '%s', PID: %d\n", windowTitle, windowPID)

			if windowTitle == title {
				if targetPID != 0 {
					if windowPID == targetPID {
						foundWindow = WindowInfo{
							hwnd:  uintptr(hwnd),
							pid:   windowPID,
							title: windowTitle,
						}
						found = true
						return 0 // 停止枚举
					}
				} else {
					foundWindow = WindowInfo{
						hwnd:  uintptr(hwnd),
						pid:   windowPID,
						title: windowTitle,
					}
					found = true
					return 0 // 停止枚举
				}
			} else if strings.Contains(windowTitle, title) {
				// 保存模糊匹配的结果，但继续搜索精确匹配
				if !found {
					foundWindow = WindowInfo{
						hwnd:  uintptr(hwnd),
						pid:   windowPID,
						title: windowTitle,
					}
				}
			}
			return 1
		})

		// 执行窗口枚举
		procEnumWindows.Call(uintptr(enumFunc), 0)

		if found {
			hwnd = foundWindow.hwnd
			fmt.Printf("Found window through enumeration - Title: '%s', PID: %d\n",
				foundWindow.title, foundWindow.pid)
		}
	}

	if hwnd == 0 {
		return fmt.Errorf("no window found with title '%s'", title)
	}

	// fmt.Printf("Found target window with handle: %v\n", hwnd)

	// 获取窗口位置
	var rect RECT
	ret, _, _ := procGetWindowRect.Call(
		hwnd,
		uintptr(unsafe.Pointer(&rect)),
	)
	if ret == 0 {
		return fmt.Errorf("GetWindowRect failed")
	}

	// 确保窗口可见
	visible, _, _ := procIsWindowVisible.Call(hwnd)
	if visible == 0 {
		// fmt.Printf("Window is not visible, attempting to show\n")
		commands := []int{SW_RESTORE, SW_SHOW, SW_NORMAL}
		for _, cmd := range commands {
			_, _, _ = procShowWindow.Call(hwnd, uintptr(cmd))
			time.Sleep(50 * time.Millisecond)
		}
	}

	// 如果窗口在屏幕外，移动到可见区域
	if rect.Left < -10000 || rect.Top < -10000 {
		// fmt.Printf("Moving window to visible area\n")
		_, _, _ = procMoveWindow.Call(
			hwnd,
			100,
			100,
			uintptr(rect.Right-rect.Left),
			uintptr(rect.Bottom-rect.Top),
			1,
		)
	}

	// 尝试设置为前台窗口
	// fmt.Printf("Setting window as foreground\n")
	_, _, _ = procSetForegroundWindow.Call(hwnd)

	// 确保窗口在最前
	// fmt.Printf("Setting window position to topmost\n")
	_, _, _ = procSetWindowPos.Call(
		hwnd,
		uintptr(HWND_TOPMOST),
		uintptr(rect.Left),
		uintptr(rect.Top),
		uintptr(rect.Right-rect.Left),
		uintptr(rect.Bottom-rect.Top),
		uintptr(SWP_SHOWWINDOW),
	)

	time.Sleep(50 * time.Millisecond)

	// 恢复正常层级
	// fmt.Printf("Resetting window position to notopmost\n")
	_, _, _ = procSetWindowPos.Call(
		hwnd,
		uintptr(HWND_NOTOPMOST),
		uintptr(rect.Left),
		uintptr(rect.Top),
		uintptr(rect.Right-rect.Left),
		uintptr(rect.Bottom-rect.Top),
		uintptr(SWP_SHOWWINDOW),
	)

	// fmt.Printf("BringToTop completed successfully\n")
	return nil
}

// isMainWindow 检查是否是主窗口
func isMainWindow(hwnd syscall.Handle) bool {
	// 检查窗口是否有父窗口
	parent, _, _ := procGetParent.Call(uintptr(hwnd))
	if parent != 0 {
		return false
	}

	// 检查窗口样式
	style, _, _ := procGetWindowLongW.Call(uintptr(hwnd), ^uintptr(0x0f))
	if (style & WS_VISIBLE) == 0 {
		return false
	}

	return true
}

// 系统调用定义
var (
	procGetParent          = windows.NewLazySystemDLL("user32.dll").NewProc("GetParent")
	procGetMonitorInfo     = windows.NewLazySystemDLL("user32.dll").NewProc("GetMonitorInfo")
	procMonitorFromWindow  = windows.NewLazySystemDLL("user32.dll").NewProc("MonitorFromWindow")
	procGetWindowPlacement = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowPlacement")
)

// 需要添加的常量
const (
	MONITOR_DEFAULTTOPRIMARY = 1
	WS_VISIBLE               = 0x10000000
)

// MONITORINFO 结构体
type MONITORINFO struct {
	CbSize    uint32
	RcMonitor RECT
	RcWork    RECT
	DwFlags   uint32
}
