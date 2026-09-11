//go:build windows
// +build windows

package automation

import (
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// windowsWindowManager is the Win32 owner behind the public window facade.
// Native actions are always followed by a read-back of the actual HWND state;
// Win32 APIs whose return value describes prior state (not operation success)
// are never treated as success or failure signals.
type windowsWindowManager struct{}

func newPlatformWindowManager() windowManagerPlatform { return &windowsWindowManager{} }

const (
	SM_CXSCREEN = 0
	SM_CYSCREEN = 1

	PROCESS_QUERY_INFORMATION              = 0x0400
	PROCESS_VM_READ                        = 0x0010
	processQueryLimitedInformation         = 0x1000
	processTerminate                       = 0x0001
	GWL_STYLE                              = -16
	GWL_STYLE_32                           = -16
	GWL_EXSTYLE                            = -20
	WS_EX_TOOLWINDOW               uintptr = 0x00000080
	wsExTopmost                    uintptr = 0x00000008
	WS_CHILD                       uintptr = 0x40000000
	WS_POPUP                       uintptr = 0x80000000

	SW_HIDE          = 0
	SW_NORMAL        = 1
	SW_SHOWMINIMIZED = 2
	SW_MAXIMIZE      = 3
	SW_SHOW          = 5
	SW_MINIMIZE      = 6
	SW_RESTORE       = 9

	WM_CLOSE         = 0x0010
	WM_GETTEXT       = 0x000D
	WM_GETTEXTLENGTH = 0x000E
	EM_GETTEXT       = WM_GETTEXT
	EM_GETTEXTLENGTH = WM_GETTEXTLENGTH

	HWND_TOP              = 0
	HWND_TOPMOST   uint32 = 0xFFFFFFFF
	HWND_NOTOPMOST uint32 = 0xFFFFFFFE

	SWP_NOSIZE               = 0x0001
	SWP_NOMOVE               = 0x0002
	swpNoActivate            = 0x0010
	SWP_SHOWWINDOW           = 0x0040
	GW_HWNDNEXT              = 2
	gaRoot                   = 2
	smtoBlock                = 0x0001
	smtoAbortIfHung          = 0x0002
	smtoErrorOnExit          = 0x0020
	errorAccessDenied        = syscall.Errno(5)
	errorInvalidHandle       = syscall.Errno(6)
	errorInsufficientBuffer  = syscall.Errno(122)
	errorInvalidWindowHandle = syscall.Errno(1400)
	errorTimeout             = syscall.Errno(1460)
)

const (
	windowsMutationTimeout    = 2 * time.Second
	windowsMutationPoll       = 20 * time.Millisecond
	windowsCloseSendTimeout   = 1200 * time.Millisecond
	windowsCloseVerifyTimeout = 2 * time.Second
	windowsTextTimeout        = 250 * time.Millisecond
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	psapi    = windows.NewLazySystemDLL("psapi.dll")

	procGetWindowTextW             = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextW")
	procGetWindowTextLengthW       = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowTextLengthW")
	procGetCurrentThreadId         = user32.NewProc("GetCurrentThreadId")
	procGetWindowRect              = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowRect")
	procFindWindowW                = windows.NewLazySystemDLL("user32.dll").NewProc("FindWindowW")
	procGetForegroundWindow        = windows.NewLazySystemDLL("user32.dll").NewProc("GetForegroundWindow")
	procSetForegroundWindow        = windows.NewLazySystemDLL("user32.dll").NewProc("SetForegroundWindow")
	procBringWindowToTop           = windows.NewLazySystemDLL("user32.dll").NewProc("BringWindowToTop")
	procShowWindow                 = windows.NewLazySystemDLL("user32.dll").NewProc("ShowWindow")
	procMoveWindow                 = windows.NewLazySystemDLL("user32.dll").NewProc("MoveWindow")
	procGetWindowThreadProcessId   = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowThreadProcessId")
	procOpenProcess                = kernel32.NewProc("OpenProcess")
	procTerminateProcess           = kernel32.NewProc("TerminateProcess")
	procQueryFullProcessImageNameW = kernel32.NewProc("QueryFullProcessImageNameW")
	procGetModuleFileNameEx        = psapi.NewProc("GetModuleFileNameExW") // retained for package compatibility; no longer used for metadata.
	procPostMessageW               = windows.NewLazySystemDLL("user32.dll").NewProc("PostMessageW")
	procEnumWindows                = windows.NewLazySystemDLL("user32.dll").NewProc("EnumWindows")
	procEnumChildWindows           = windows.NewLazySystemDLL("user32.dll").NewProc("EnumChildWindows")
	procSendMessageW               = windows.NewLazySystemDLL("user32.dll").NewProc("SendMessageW")
	procSendMessageTimeoutW        = windows.NewLazySystemDLL("user32.dll").NewProc("SendMessageTimeoutW")
	procGetWindowDC                = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowDC")
	procGetClientRect              = windows.NewLazySystemDLL("user32.dll").NewProc("GetClientRect")
	procGetDC                      = windows.NewLazySystemDLL("user32.dll").NewProc("GetDC")
	procReleaseDC                  = windows.NewLazySystemDLL("user32.dll").NewProc("ReleaseDC")
	procGetClassName               = windows.NewLazySystemDLL("user32.dll").NewProc("GetClassNameW")
	procGetWindow                  = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindow")
	procGetGUIThreadInfo           = windows.NewLazySystemDLL("user32.dll").NewProc("GetGUIThreadInfo")
	procIsWindow                   = user32.NewProc("IsWindow")
	procGetDesktopWindow           = user32.NewProc("GetDesktopWindow")
	procIsWindowVisible            = windows.NewLazySystemDLL("user32.dll").NewProc("IsWindowVisible")
	procIsIconic                   = windows.NewLazySystemDLL("user32.dll").NewProc("IsIconic")
	procIsZoomed                   = windows.NewLazySystemDLL("user32.dll").NewProc("IsZoomed")
	procGetWindowPlacement         = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowPlacement")
	procSetWindowPos               = windows.NewLazySystemDLL("user32.dll").NewProc("SetWindowPos")
	procGetAncestor                = windows.NewLazySystemDLL("user32.dll").NewProc("GetAncestor")
	procGetSystemMetrics           = windows.NewLazySystemDLL("user32.dll").NewProc("GetSystemMetrics")
	procGetWindowLongW             = windows.NewLazySystemDLL("user32.dll").NewProc("GetWindowLongW")

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

type POINT struct{ X, Y int32 }
type RECT struct{ Left, Top, Right, Bottom int32 }

type WINDOWPLACEMENT struct {
	Length           uint32
	Flags            uint32
	ShowCmd          uint32
	PtMinPosition    POINT
	PtMaxPosition    POINT
	RcNormalPosition RECT
}

type windowsWindowObservation struct {
	Exists  bool
	Visible bool
	Iconic  bool
	Zoomed  bool
	Topmost bool
	ShowCmd uint32
}

type windowsExpectedState uint8

const (
	windowsStateVisible windowsExpectedState = iota + 1
	windowsStateMinimized
	windowsStateMaximized
	windowsStateRestored
	windowsStateTopmost
	windowsStateNotTopmost
)

// Function seams keep the two error-prone Win32 identity calls directly testable.
var windowsGetWindowThreadProcessID = func(hwnd uintptr, pid *uint32) uint32 {
	threadID, _, _ := procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(pid)))
	return uint32(threadID)
}

var windowsGetGUIThreadInfo = func(threadID uint32, info *GUITHREADINFO) error {
	result, _, callErr := procGetGUIThreadInfo.Call(uintptr(threadID), uintptr(unsafe.Pointer(info)))
	if result == 0 {
		return win32CallError(callErr)
	}
	return nil
}

func win32CallError(err error) error {
	if err == nil {
		return nil
	}
	if errno, ok := err.(syscall.Errno); ok && errno == 0 {
		return nil
	}
	return err
}

func windowsBackendError(code WindowErrorCode, message string, cause error) error {
	return &WindowError{Code: code, Platform: "windows", Message: message, Cause: cause}
}

func windowsErrorFromCall(message string, callErr error) error {
	callErr = win32CallError(callErr)
	if errno, ok := callErr.(syscall.Errno); ok {
		switch errno {
		case errorAccessDenied:
			return windowsBackendError(WindowPermissionDenied, message, callErr)
		case errorInvalidHandle, errorInvalidWindowHandle:
			return windowsBackendError(WindowStaleTarget, message, callErr)
		case errorTimeout:
			return windowsBackendError(WindowTimeout, message, callErr)
		}
	}
	return windowsBackendError(WindowBackendFailed, message, callErr)
}

func isValidWindow(hwnd uintptr) bool {
	if hwnd == 0 {
		return false
	}
	result, _, _ := procIsWindow.Call(hwnd)
	return result != 0
}

func requireValidWindow(hwnd uintptr) error {
	if !isValidWindow(hwnd) {
		return windowsBackendError(WindowStaleTarget, "native window handle is no longer valid", nil)
	}
	return nil
}

func isWindowVisible(hwnd uintptr) bool {
	result, _, _ := procIsWindowVisible.Call(hwnd)
	return result != 0
}

func isWindowIconic(hwnd uintptr) bool {
	result, _, _ := procIsIconic.Call(hwnd)
	return result != 0
}

func isWindowZoomed(hwnd uintptr) bool {
	result, _, _ := procIsZoomed.Call(hwnd)
	return result != 0
}

func getWindowLong(hwnd uintptr, index int32) uintptr {
	result, _, _ := procGetWindowLongW.Call(hwnd, uintptr(int64(index)))
	return result
}

func getWindowStyle(hwnd syscall.Handle) uint32 {
	return uint32(getWindowLong(uintptr(hwnd), GWL_STYLE))
}

func getWindowTitle(hwnd windows.Handle) string {
	if hwnd == 0 {
		return ""
	}
	textLength, _, _ := procGetWindowTextLengthW.Call(uintptr(hwnd))
	if textLength == 0 {
		return ""
	}
	buffer := make([]uint16, int(textLength)+1)
	copied, _, _ := procGetWindowTextW.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	if copied == 0 {
		return ""
	}
	return windows.UTF16ToString(buffer[:int(copied)])
}

func queryWindowRect(hwnd uintptr) (RECT, error) {
	if err := requireValidWindow(hwnd); err != nil {
		return RECT{}, err
	}
	var rect RECT
	result, _, callErr := procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rect)))
	if result == 0 {
		return RECT{}, windowsErrorFromCall("GetWindowRect failed", callErr)
	}
	return rect, nil
}

func getWindowRect(hwnd windows.Handle) (x, y, width, height int32) {
	rect, err := queryWindowRect(uintptr(hwnd))
	if err != nil {
		return 0, 0, 0, 0
	}
	return rect.Left, rect.Top, rect.Right - rect.Left, rect.Bottom - rect.Top
}

func getWindowThreadProcessID(hwnd uintptr) (uint32, uint32, error) {
	if err := requireValidWindow(hwnd); err != nil {
		return 0, 0, err
	}
	var pid uint32
	threadID := windowsGetWindowThreadProcessID(hwnd, &pid)
	if threadID == 0 {
		return 0, pid, windowsBackendError(WindowBackendFailed, "GetWindowThreadProcessId returned no thread identity", nil)
	}
	return threadID, pid, nil
}

func getWindowProcessId(hwnd windows.Handle) uint32 {
	_, pid, err := getWindowThreadProcessID(uintptr(hwnd))
	if err != nil {
		return 0
	}
	return pid
}

func getSystemMetrics(index int) int32 {
	result, _, _ := procGetSystemMetrics.Call(uintptr(index))
	return int32(result)
}

func getClassName(hwnd uintptr) string {
	if hwnd == 0 {
		return ""
	}
	buffer := make([]uint16, 256)
	copied, _, _ := procGetClassNameW.Call(hwnd, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	if copied == 0 {
		return ""
	}
	return windows.UTF16ToString(buffer[:int(copied)])
}

func queryWindowPlacement(hwnd uintptr) (WINDOWPLACEMENT, error) {
	var placement WINDOWPLACEMENT
	placement.Length = uint32(unsafe.Sizeof(placement))
	result, _, callErr := procGetWindowPlacement.Call(hwnd, uintptr(unsafe.Pointer(&placement)))
	if result == 0 {
		return placement, windowsErrorFromCall("GetWindowPlacement failed", callErr)
	}
	return placement, nil
}

func observeWindowsWindow(hwnd uintptr) (windowsWindowObservation, error) {
	if !isValidWindow(hwnd) {
		return windowsWindowObservation{}, windowsBackendError(WindowStaleTarget, "native window handle is no longer valid", nil)
	}
	placement, err := queryWindowPlacement(hwnd)
	if err != nil {
		return windowsWindowObservation{}, err
	}
	exStyle := getWindowLong(hwnd, GWL_EXSTYLE)
	return windowsWindowObservation{
		Exists:  true,
		Visible: isWindowVisible(hwnd),
		Iconic:  isWindowIconic(hwnd),
		Zoomed:  isWindowZoomed(hwnd),
		Topmost: exStyle&wsExTopmost != 0,
		ShowCmd: placement.ShowCmd,
	}, nil
}

func windowsStateSatisfied(expected windowsExpectedState, observation windowsWindowObservation) bool {
	if !observation.Exists {
		return false
	}
	switch expected {
	case windowsStateVisible:
		return observation.Visible
	case windowsStateMinimized:
		return observation.Iconic
	case windowsStateMaximized:
		return observation.Zoomed && observation.Visible
	case windowsStateRestored:
		return observation.Visible && !observation.Iconic && !observation.Zoomed
	case windowsStateTopmost:
		return observation.Topmost
	case windowsStateNotTopmost:
		return !observation.Topmost
	default:
		return false
	}
}

func waitForWindowsState(hwnd uintptr, expected windowsExpectedState, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var last windowsWindowObservation
	for {
		observation, err := observeWindowsWindow(hwnd)
		if err != nil {
			return err
		}
		last = observation
		if windowsStateSatisfied(expected, observation) {
			return nil
		}
		if time.Now().After(deadline) {
			return windowsBackendError(
				WindowVerificationFailed,
				fmt.Sprintf("window post-condition was not observed (visible=%t iconic=%t zoomed=%t topmost=%t showCmd=%d)", last.Visible, last.Iconic, last.Zoomed, last.Topmost, last.ShowCmd),
				nil,
			)
		}
		time.Sleep(windowsMutationPoll)
	}
}

func showWindowAndVerify(hwnd uintptr, command int, expected windowsExpectedState) error {
	if err := requireValidWindow(hwnd); err != nil {
		return err
	}
	// ShowWindow returns the previous visibility state. Its return value is not
	// an operation-success flag and is intentionally ignored.
	procShowWindow.Call(hwnd, uintptr(command))
	return waitForWindowsState(hwnd, expected, windowsMutationTimeout)
}

func windowRoot(hwnd uintptr) uintptr {
	if hwnd == 0 {
		return 0
	}
	root, _, _ := procGetAncestor.Call(hwnd, gaRoot)
	if root == 0 {
		return hwnd
	}
	return root
}

func guiThreadInfoForWindow(hwnd uintptr) (threadID uint32, processID uint32, info GUITHREADINFO, err error) {
	if err := requireValidWindow(hwnd); err != nil {
		return 0, 0, info, err
	}
	threadID, processID, err = getWindowThreadProcessID(hwnd)
	if err != nil {
		return 0, processID, info, err
	}
	info.CbSize = uint32(unsafe.Sizeof(info))
	// GetGUIThreadInfo consumes the thread ID returned by
	// GetWindowThreadProcessId, never the process ID written to its out param.
	if err := windowsGetGUIThreadInfo(threadID, &info); err != nil {
		return 0, processID, info, windowsErrorFromCall("GetGUIThreadInfo failed", err)
	}
	return threadID, processID, info, nil
}

func foregroundAndFocus() (foreground uintptr, active uintptr, focus uintptr, err error) {
	foreground, _, _ = procGetForegroundWindow.Call()
	if foreground == 0 {
		return 0, 0, 0, windowsBackendError(WindowNotFound, "no active foreground window", nil)
	}
	_, _, info, threadErr := guiThreadInfoForWindow(foreground)
	if threadErr != nil {
		return 0, 0, 0, threadErr
	}
	return foreground, uintptr(info.HwndActive), uintptr(info.HwndFocus), nil
}

func getProcessExecutableInfo(processID uint32) (string, string, error) {
	if processID == 0 {
		return "", "", windowsBackendError(WindowInvalidArgument, "process id must be positive", nil)
	}
	handle, _, callErr := procOpenProcess.Call(processQueryLimitedInformation, 0, uintptr(processID))
	if handle == 0 {
		return "", "", windowsErrorFromCall("OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION) failed", callErr)
	}
	defer windows.CloseHandle(windows.Handle(handle))

	for capacity := 512; capacity <= 32768; capacity *= 2 {
		buffer := make([]uint16, capacity)
		size := uint32(len(buffer))
		result, _, queryErr := procQueryFullProcessImageNameW.Call(
			handle,
			0,
			uintptr(unsafe.Pointer(&buffer[0])),
			uintptr(unsafe.Pointer(&size)),
		)
		if result != 0 {
			path := windows.UTF16ToString(buffer[:int(size)])
			return filepath.Base(path), path, nil
		}
		normalized := win32CallError(queryErr)
		if errno, ok := normalized.(syscall.Errno); !ok || errno != errorInsufficientBuffer {
			return "", "", windowsErrorFromCall("QueryFullProcessImageNameW failed", queryErr)
		}
	}
	return "", "", windowsBackendError(WindowBackendFailed, "process executable path exceeded supported Windows path capacity", nil)
}

func enumerateTopLevelWindows(includeHidden bool) []uintptr {
	windowsList := make([]uintptr, 0, 32)
	callback := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		if !isValidWindow(hwnd) {
			return 1
		}
		if !includeHidden && !isWindowVisible(hwnd) {
			return 1
		}
		className := getClassName(hwnd)
		if className == "Shell_TrayWnd" || className == "Shell_SecondaryTrayWnd" {
			return 1
		}
		windowsList = append(windowsList, hwnd)
		return 1
	})
	procEnumWindows.Call(callback, 0)
	return windowsList
}

func findUniqueWindowByTitle(title string) (uintptr, error) {
	if strings.TrimSpace(title) == "" {
		return 0, windowsBackendError(WindowInvalidArgument, "window title cannot be empty", nil)
	}
	matches := make([]uintptr, 0, 2)
	for _, hwnd := range enumerateTopLevelWindows(true) {
		if getWindowTitle(windows.Handle(hwnd)) == title {
			matches = append(matches, hwnd)
		}
	}
	switch len(matches) {
	case 0:
		return 0, windowsBackendError(WindowNotFound, "window not found", nil)
	case 1:
		return matches[0], nil
	default:
		return 0, windowsBackendError(WindowAmbiguousTarget, "multiple windows have the requested title", nil)
	}
}

func findWindowByPID(pid uint32) (uintptr, error) {
	if pid == 0 {
		return 0, windowsBackendError(WindowInvalidArgument, "pid must be positive", nil)
	}
	for _, hwnd := range enumerateTopLevelWindows(true) {
		_, candidatePID, err := getWindowThreadProcessID(hwnd)
		if err != nil || candidatePID != pid {
			continue
		}
		style := getWindowLong(hwnd, GWL_STYLE)
		if style&WS_CHILD != 0 {
			continue
		}
		if getWindowTitle(windows.Handle(hwnd)) == "" {
			continue
		}
		return hwnd, nil
	}
	return 0, windowsBackendError(WindowNotFound, "no suitable window found for process", nil)
}

func buildWindowInfo(hwnd uintptr, index int, foreground uintptr, focus uintptr) (*WindowInfo, error) {
	if err := requireValidWindow(hwnd); err != nil {
		return nil, err
	}
	rect, err := queryWindowRect(hwnd)
	if err != nil {
		return nil, err
	}
	_, pid, err := getWindowThreadProcessID(hwnd)
	if err != nil {
		return nil, err
	}
	exeName, exePath, _ := getProcessExecutableInfo(pid) // metadata is best-effort by contract.
	style := getWindowLong(hwnd, GWL_STYLE)
	focusRoot := windowRoot(focus)
	return &WindowInfo{
		Title:        getWindowTitle(windows.Handle(hwnd)),
		ProcessID:    pid,
		X:            rect.Left,
		Y:            rect.Top,
		Width:        rect.Right - rect.Left,
		Height:       rect.Bottom - rect.Top,
		ExeName:      exeName,
		ExePath:      exePath,
		IsForeground: hwnd == foreground,
		HasFocus:     hwnd == focus || (focus != 0 && focusRoot == hwnd),
		Handle:       uint64(hwnd),
		IsPopup:      style&WS_POPUP != 0,
		Index:        index,
	}, nil
}

func (w *windowsWindowManager) GetActiveWindow() (*WindowInfo, error) {
	foreground, _, focus, err := foregroundAndFocus()
	if err != nil {
		return nil, err
	}
	return buildWindowInfo(foreground, 0, foreground, focus)
}

func (w *windowsWindowManager) GetFocusWindow() (*WindowInfo, error) {
	foreground, _, focus, err := foregroundAndFocus()
	if err != nil {
		return nil, err
	}
	if focus == 0 {
		return nil, windowsBackendError(WindowNotFound, "active GUI thread has no focused child window", nil)
	}
	info, err := buildWindowInfo(focus, 0, foreground, focus)
	if err != nil {
		return nil, err
	}
	info.HasFocus = true
	return info, nil
}

func (w *windowsWindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return nil, err
	}
	foreground, _, focus, _ := foregroundAndFocus()
	return buildWindowInfo(hwnd, 0, foreground, focus)
}

func (w *windowsWindowManager) Focus(title string) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	if !isWindowVisible(hwnd) {
		if err := showWindowAndVerify(hwnd, SW_SHOW, windowsStateVisible); err != nil {
			return err
		}
	}
	if isWindowIconic(hwnd) {
		if err := showWindowAndVerify(hwnd, SW_RESTORE, windowsStateRestored); err != nil {
			return err
		}
	}
	procBringWindowToTop.Call(hwnd)
	procSetForegroundWindow.Call(hwnd)
	deadline := time.Now().Add(windowsMutationTimeout)
	for {
		foreground, _, _ := procGetForegroundWindow.Call()
		if foreground == hwnd {
			return nil
		}
		if !isValidWindow(hwnd) {
			return windowsBackendError(WindowStaleTarget, "window disappeared while activation was pending", nil)
		}
		if time.Now().After(deadline) {
			return windowsBackendError(WindowVerificationFailed, "Windows foreground policy rejected window activation", nil)
		}
		time.Sleep(windowsMutationPoll)
	}
}

func (w *windowsWindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	if err := requireValidWindow(hwnd); err != nil {
		return err
	}
	result, _, callErr := procMoveWindow.Call(hwnd, uintptr(x), uintptr(y), uintptr(width), uintptr(height), 1)
	if result == 0 {
		if !isValidWindow(hwnd) {
			return windowsBackendError(WindowStaleTarget, "window disappeared before bounds update completed", nil)
		}
		return windowsErrorFromCall("MoveWindow failed", callErr)
	}
	rect, err := queryWindowRect(hwnd)
	if err != nil {
		return err
	}
	if rect.Left != int32(x) || rect.Top != int32(y) || rect.Right-rect.Left != int32(width) || rect.Bottom-rect.Top != int32(height) {
		return windowsBackendError(WindowVerificationFailed, "window bounds readback did not match the requested bounds", nil)
	}
	return nil
}

func (w *windowsWindowManager) SetWidth(title string, width int) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	rect, err := queryWindowRect(hwnd)
	if err != nil {
		return err
	}
	return w.SetWindowBounds(title, int(rect.Left), int(rect.Top), width, int(rect.Bottom-rect.Top))
}

func (w *windowsWindowManager) SetHeight(title string, height int) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	rect, err := queryWindowRect(hwnd)
	if err != nil {
		return err
	}
	return w.SetWindowBounds(title, int(rect.Left), int(rect.Top), int(rect.Right-rect.Left), height)
}

func (w *windowsWindowManager) Maximize(title string) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_MAXIMIZE, windowsStateMaximized)
}

func (w *windowsWindowManager) Minimize(title string) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_MINIMIZE, windowsStateMinimized)
}

func (w *windowsWindowManager) Restore(title string) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_RESTORE, windowsStateRestored)
}

func (w *windowsWindowManager) RestoreByPID(pid uint32) error {
	hwnd, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_RESTORE, windowsStateRestored)
}

func (w *windowsWindowManager) MinimizeByPID(pid uint32) error {
	hwnd, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_MINIMIZE, windowsStateMinimized)
}

func (w *windowsWindowManager) MaximizeByPID(pid uint32) error {
	hwnd, err := findWindowByPID(pid)
	if err != nil {
		return err
	}
	return showWindowAndVerify(hwnd, SW_MAXIMIZE, windowsStateMaximized)
}

func requestCloseWindow(hwnd uintptr) error {
	if err := requireValidWindow(hwnd); err != nil {
		return err
	}
	var messageResult uintptr
	delivered, _, callErr := procSendMessageTimeoutW.Call(
		hwnd,
		WM_CLOSE,
		0,
		0,
		smtoBlock|smtoAbortIfHung|smtoErrorOnExit,
		uintptr(windowsCloseSendTimeout/time.Millisecond),
		uintptr(unsafe.Pointer(&messageResult)),
	)
	if delivered == 0 {
		if !isValidWindow(hwnd) {
			return nil
		}
		normalized := win32CallError(callErr)
		if errno, ok := normalized.(syscall.Errno); ok {
			switch errno {
			case errorAccessDenied:
				return windowsBackendError(WindowPermissionDenied, "WM_CLOSE request was denied", normalized)
			case errorInvalidHandle, errorInvalidWindowHandle:
				return windowsBackendError(WindowStaleTarget, "window disappeared before WM_CLOSE could be delivered", normalized)
			case errorTimeout:
				return windowsBackendError(WindowTimeout, "WM_CLOSE delivery timed out because the window did not process messages", normalized)
			}
		}
		// SendMessageTimeout may leave last-error at zero on timeout. A still
		// valid HWND after a zero return is therefore treated as a bounded timeout.
		return windowsBackendError(WindowTimeout, "WM_CLOSE delivery timed out because the window did not process messages", normalized)
	}

	deadline := time.Now().Add(windowsCloseVerifyTimeout)
	for isValidWindow(hwnd) {
		if time.Now().After(deadline) {
			return windowsBackendError(WindowVerificationFailed, "WM_CLOSE was delivered but the window remained open", nil)
		}
		time.Sleep(windowsMutationPoll)
	}
	return nil
}

func (w *windowsWindowManager) CloseWindow(title string) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	return requestCloseWindow(hwnd)
}

func (w *windowsWindowManager) CloseActiveWindow() error {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return windowsBackendError(WindowNotFound, "no active foreground window", nil)
	}
	return requestCloseWindow(hwnd)
}

func (w *windowsWindowManager) Kill(processId uint32) error {
	handle, _, callErr := procOpenProcess.Call(processTerminate, 0, uintptr(processId))
	if handle == 0 {
		return windowsErrorFromCall("OpenProcess(PROCESS_TERMINATE) failed", callErr)
	}
	defer windows.CloseHandle(windows.Handle(handle))
	result, _, terminateErr := procTerminateProcess.Call(handle, 1)
	if result == 0 {
		return windowsErrorFromCall("TerminateProcess failed", terminateErr)
	}
	return nil
}

func (w *windowsWindowManager) Title() (string, error) {
	info, err := w.GetActiveWindow()
	if err != nil {
		return "", err
	}
	return info.Title, nil
}

func (w *windowsWindowManager) GetTitle(selector string) (string, error) {
	info, err := w.GetWindowByTitle(selector)
	if err != nil {
		return "", err
	}
	return info.Title, nil
}

func boundedWindowText(hwnd uintptr) string {
	if !isValidWindow(hwnd) {
		return ""
	}
	var lengthResult uintptr
	ok, _, _ := procSendMessageTimeoutW.Call(
		hwnd,
		WM_GETTEXTLENGTH,
		0,
		0,
		smtoBlock|smtoAbortIfHung|smtoErrorOnExit,
		uintptr(windowsTextTimeout/time.Millisecond),
		uintptr(unsafe.Pointer(&lengthResult)),
	)
	if ok == 0 || lengthResult == 0 || lengthResult > 1<<20 {
		return ""
	}
	buffer := make([]uint16, int(lengthResult)+1)
	var copied uintptr
	ok, _, _ = procSendMessageTimeoutW.Call(
		hwnd,
		WM_GETTEXT,
		uintptr(len(buffer)),
		uintptr(unsafe.Pointer(&buffer[0])),
		smtoBlock|smtoAbortIfHung|smtoErrorOnExit,
		uintptr(windowsTextTimeout/time.Millisecond),
		uintptr(unsafe.Pointer(&copied)),
	)
	if ok == 0 || copied == 0 {
		return ""
	}
	return windows.UTF16ToString(buffer)
}

func collectWindowContent(hwnd uintptr) (string, error) {
	if err := requireValidWindow(hwnd); err != nil {
		return "", err
	}
	values := make([]string, 0, 16)
	seen := make(map[string]struct{})
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		values = append(values, value)
	}
	add(getWindowTitle(windows.Handle(hwnd)))
	callback := syscall.NewCallback(func(child uintptr, _ uintptr) uintptr {
		add(boundedWindowText(child))
		if text := getWindowTitle(windows.Handle(child)); text != "" {
			add(text)
		}
		return 1
	})
	procEnumChildWindows.Call(hwnd, callback, 0)
	return strings.Join(values, "\n"), nil
}

func (w *windowsWindowManager) Content() (string, error) {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return "", windowsBackendError(WindowNotFound, "no active foreground window", nil)
	}
	return collectWindowContent(hwnd)
}

func (w *windowsWindowManager) GetContent(selector string) (string, error) {
	hwnd, err := findUniqueWindowByTitle(selector)
	if err != nil {
		return "", err
	}
	return collectWindowContent(hwnd)
}

func (w *windowsWindowManager) List() ([]map[string]interface{}, error) {
	foreground, _, focus, _ := foregroundAndFocus()
	handles := enumerateTopLevelWindows(false)
	rows := make([]map[string]interface{}, 0, len(handles))
	for i, hwnd := range handles {
		if getWindowTitle(windows.Handle(hwnd)) == "" {
			continue
		}
		info, err := buildWindowInfo(hwnd, len(handles)-i, foreground, focus)
		if err != nil {
			// Window enumeration races are expected. A row that goes stale is
			// omitted; metadata failures never make a valid row disappear.
			if windowErr, ok := err.(*WindowError); ok && windowErr.Code == WindowStaleTarget {
				continue
			}
			continue
		}
		rows = append(rows, map[string]interface{}{
			"title":        info.Title,
			"pid":          info.ProcessID,
			"processId":    info.ProcessID,
			"x":            info.X,
			"y":            info.Y,
			"width":        info.Width,
			"height":       info.Height,
			"exeName":      info.ExeName,
			"exePath":      info.ExePath,
			"isForeground": info.IsForeground,
			"hasFocus":     info.HasFocus,
			"isPopup":      info.IsPopup,
			"handle":       info.Handle,
			"index":        info.Index,
		})
	}
	return rows, nil
}

func setWindowTopmost(hwnd uintptr, topmost bool) error {
	if err := requireValidWindow(hwnd); err != nil {
		return err
	}
	insertAfter := ^uintptr(0) // HWND_TOPMOST (-1)
	expected := windowsStateTopmost
	if !topmost {
		insertAfter = ^uintptr(1) // HWND_NOTOPMOST (-2)
		expected = windowsStateNotTopmost
	}
	result, _, callErr := procSetWindowPos.Call(
		hwnd,
		insertAfter,
		0,
		0,
		0,
		0,
		SWP_NOMOVE|SWP_NOSIZE|swpNoActivate,
	)
	if result == 0 {
		if !isValidWindow(hwnd) {
			return windowsBackendError(WindowStaleTarget, "window disappeared before topmost update completed", nil)
		}
		return windowsErrorFromCall("SetWindowPos failed", callErr)
	}
	return waitForWindowsState(hwnd, expected, windowsMutationTimeout)
}

func (w *windowsWindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	hwnd, err := findUniqueWindowByTitle(title)
	if err != nil {
		return err
	}
	return setWindowTopmost(hwnd, alwaysOnTop)
}

func (w *windowsWindowManager) UnsetTopMost(title string) error {
	return w.SetAlwaysOnTop(title, false)
}

func pidFromInterface(value interface{}) (uint32, bool) {
	switch typed := value.(type) {
	case uint32:
		return typed, typed > 0
	case uint64:
		if typed > 0 && typed <= uint64(^uint32(0)) {
			return uint32(typed), true
		}
	case uint:
		if uint64(typed) > 0 && uint64(typed) <= uint64(^uint32(0)) {
			return uint32(typed), true
		}
	case int:
		if typed > 0 && uint64(typed) <= uint64(^uint32(0)) {
			return uint32(typed), true
		}
	case int32:
		if typed > 0 {
			return uint32(typed), true
		}
	case int64:
		if typed > 0 && uint64(typed) <= uint64(^uint32(0)) {
			return uint32(typed), true
		}
	case float64:
		if typed > 0 && typed <= float64(^uint32(0)) && typed == float64(uint32(typed)) {
			return uint32(typed), true
		}
	}
	return 0, false
}

func (w *windowsWindowManager) BringToTop(title string, pid interface{}) error {
	var hwnd uintptr
	var err error
	if strings.TrimSpace(title) != "" {
		hwnd, err = findUniqueWindowByTitle(title)
	} else if processID, ok := pidFromInterface(pid); ok {
		hwnd, err = findWindowByPID(processID)
	} else {
		return windowsBackendError(WindowInvalidArgument, "bringToTop requires a title or positive pid", nil)
	}
	if err != nil {
		return err
	}
	if !isWindowVisible(hwnd) {
		if err := showWindowAndVerify(hwnd, SW_SHOW, windowsStateVisible); err != nil {
			return err
		}
	}
	if isWindowIconic(hwnd) {
		if err := showWindowAndVerify(hwnd, SW_RESTORE, windowsStateRestored); err != nil {
			return err
		}
	}
	procBringWindowToTop.Call(hwnd)
	procSetForegroundWindow.Call(hwnd)
	deadline := time.Now().Add(windowsMutationTimeout)
	for {
		foreground, _, _ := procGetForegroundWindow.Call()
		if foreground == hwnd {
			return nil
		}
		if !isValidWindow(hwnd) {
			return windowsBackendError(WindowStaleTarget, "window disappeared while bringToTop was pending", nil)
		}
		if time.Now().After(deadline) {
			return windowsBackendError(WindowVerificationFailed, "Windows foreground policy rejected bringToTop", nil)
		}
		time.Sleep(windowsMutationPoll)
	}
}
