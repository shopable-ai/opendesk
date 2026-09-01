package automation

import (
	"errors"
	"runtime"
	"strconv"
	"strings"
)

type WindowErrorCode string

const (
	WindowInvalidArgument    WindowErrorCode = "INVALID_ARGUMENT"
	WindowNotSupported       WindowErrorCode = "NOT_SUPPORTED"
	WindowNotFound           WindowErrorCode = "NOT_FOUND"
	WindowAmbiguousTarget    WindowErrorCode = "AMBIGUOUS_TARGET"
	WindowStaleTarget        WindowErrorCode = "STALE_TARGET"
	WindowPermissionDenied   WindowErrorCode = "PERMISSION_DENIED"
	WindowVerificationFailed WindowErrorCode = "VERIFICATION_FAILED"
	WindowTimeout            WindowErrorCode = "TIMEOUT"
	WindowBackendFailed      WindowErrorCode = "BACKEND_FAILED"
)

// WindowError is projected by AutoMapObject as a JavaScript Error with stable
// code, operation, platform, and capability properties. Target titles are not
// copied into the structured metadata because they may contain private text.
type WindowError struct {
	Code       WindowErrorCode
	Operation  string
	Platform   string
	Capability string
	Message    string
	Cause      error
}

func (e *WindowError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "window operation failed"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *WindowError) Unwrap() error { return e.Cause }

func (e *WindowError) JSProperties() map[string]interface{} {
	properties := map[string]interface{}{
		"code":      string(e.Code),
		"operation": e.Operation,
		"platform":  e.Platform,
	}
	if e.Capability != "" {
		properties["capability"] = e.Capability
	}
	return properties
}

type WindowCapabilityStatus string

const (
	WindowStable       WindowCapabilityStatus = "Stable"
	WindowPartial      WindowCapabilityStatus = "Partial"
	WindowUnsupported  WindowCapabilityStatus = "Unsupported"
	WindowExperimental WindowCapabilityStatus = "Experimental"
)

type WindowCapability struct {
	Status    WindowCapabilityStatus `json:"status"`
	Supported bool                   `json:"supported"`
	Notes     string                 `json:"notes,omitempty"`
}

type WindowCapabilities struct {
	Platform        string                      `json:"platform"`
	Backend         string                      `json:"backend"`
	Identity        string                      `json:"identity"`
	CoordinateSpace string                      `json:"coordinateSpace"`
	SpaceBehavior   string                      `json:"spaceBehavior"`
	Capabilities    map[string]WindowCapability `json:"capabilities"`
}

// WindowInfo is the cross-platform normalized window model exposed to JS.
type WindowInfo struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ProcessID    uint32 `json:"pid"`
	X            int32  `json:"x"`
	Y            int32  `json:"y"`
	Width        int32  `json:"width"`
	Height       int32  `json:"height"`
	ExeName      string `json:"exeName"`
	ExePath      string `json:"exePath"`
	IsForeground bool   `json:"isForeground"`
	HasFocus     bool   `json:"hasFocus"`
	Handle       uint64 `json:"handle"`
	IsPopup      bool   `json:"isPopup"`
	Index        int    `json:"index"`
}

// windowManagerPlatform defines the platform-specific capability contract.
type windowManagerPlatform interface {
	GetActiveWindow() (*WindowInfo, error)
	GetWindowByTitle(title string) (*WindowInfo, error)
	Focus(title string) error
	SetWindowBounds(title string, x, y, width, height int) error
	SetWidth(title string, width int) error
	SetHeight(title string, height int) error
	Maximize(title string) error
	Minimize(title string) error
	Restore(title string) error
	RestoreByPID(pid uint32) error
	MinimizeByPID(pid uint32) error
	MaximizeByPID(pid uint32) error
	CloseWindow(title string) error
	CloseActiveWindow() error
	Kill(processId uint32) error
	Title() (string, error)
	GetTitle(selector string) (string, error)
	Content() (string, error)
	GetContent(selector string) (string, error)
	List() ([]map[string]interface{}, error)
	GetFocusWindow() (*WindowInfo, error)
	SetAlwaysOnTop(title string, alwaysOnTop bool) error
	UnsetTopMost(title string) error
	BringToTop(title string, pid interface{}) error
}

// WindowManager is a stable cross-platform facade exposed to JS runtime.
type WindowManager struct {
	impl windowManagerPlatform
}

func NewWindowManager() *WindowManager {
	return &WindowManager{impl: newPlatformWindowManager()}
}

func (w *WindowManager) GetCapabilities() map[string]interface{} {
	capabilities := windowCapabilities(runtime.GOOS)
	items := make(map[string]interface{}, len(capabilities.Capabilities))
	for name, capability := range capabilities.Capabilities {
		item := map[string]interface{}{
			"status":    string(capability.Status),
			"supported": capability.Supported,
		}
		if capability.Notes != "" {
			item["notes"] = capability.Notes
		}
		items[name] = item
	}
	return map[string]interface{}{
		"platform":        capabilities.Platform,
		"backend":         capabilities.Backend,
		"identity":        capabilities.Identity,
		"coordinateSpace": capabilities.CoordinateSpace,
		"spaceBehavior":   capabilities.SpaceBehavior,
		"capabilities":    items,
	}
}

func (w *WindowManager) GetActiveWindow() (*WindowInfo, error) {
	result, err := w.impl.GetActiveWindow()
	if err != nil {
		return nil, wrapWindowError("window.getActiveWindow", err, false)
	}
	return normalizeWindowInfo(result), nil
}

func (w *WindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	if strings.TrimSpace(title) == "" {
		return nil, windowOperationError("window.getWindowByTitle", WindowInvalidArgument, "window title cannot be empty", nil)
	}
	result, err := w.impl.GetWindowByTitle(title)
	if err != nil {
		return nil, wrapWindowError("window.getWindowByTitle", err, false)
	}
	return normalizeWindowInfo(result), nil
}

func (w *WindowManager) Focus(title string) error {
	resolved, err := w.resolveTitle("window.focus", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.focus", w.impl.Focus(resolved), true)
}

func (w *WindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	if width <= 0 || height <= 0 {
		return windowOperationError("window.setWindowBounds", WindowInvalidArgument, "width and height must be positive", nil)
	}
	resolved, err := w.resolveTitle("window.setWindowBounds", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.setWindowBounds", w.impl.SetWindowBounds(resolved, x, y, width, height), true)
}

func (w *WindowManager) SetWidth(title string, width int) error {
	if width <= 0 {
		return windowOperationError("window.setWidth", WindowInvalidArgument, "width must be positive", nil)
	}
	resolved, err := w.resolveTitle("window.setWidth", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.setWidth", w.impl.SetWidth(resolved, width), true)
}

func (w *WindowManager) SetHeight(title string, height int) error {
	if height <= 0 {
		return windowOperationError("window.setHeight", WindowInvalidArgument, "height must be positive", nil)
	}
	resolved, err := w.resolveTitle("window.setHeight", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.setHeight", w.impl.SetHeight(resolved, height), true)
}

func (w *WindowManager) Maximize(title string) error {
	return w.titleAction("window.maximize", title, w.impl.Maximize)
}

func (w *WindowManager) Minimize(title string) error {
	return w.titleAction("window.minimize", title, w.impl.Minimize)
}

func (w *WindowManager) Restore(title string) error {
	return w.titleAction("window.restore", title, w.impl.Restore)
}

func (w *WindowManager) RestoreByPID(pid uint32) error {
	if pid == 0 {
		return windowOperationError("window.restoreByPID", WindowInvalidArgument, "pid must be positive", nil)
	}
	return wrapWindowError("window.restoreByPID", w.impl.RestoreByPID(pid), false)
}

func (w *WindowManager) MinimizeByPID(pid uint32) error {
	if pid == 0 {
		return windowOperationError("window.minimizeByPID", WindowInvalidArgument, "pid must be positive", nil)
	}
	return wrapWindowError("window.minimizeByPID", w.impl.MinimizeByPID(pid), false)
}

func (w *WindowManager) MaximizeByPID(pid uint32) error {
	if pid == 0 {
		return windowOperationError("window.maximizeByPID", WindowInvalidArgument, "pid must be positive", nil)
	}
	return wrapWindowError("window.maximizeByPID", w.impl.MaximizeByPID(pid), false)
}

func (w *WindowManager) CloseWindow(title string) error {
	return w.titleAction("window.closeWindow", title, w.impl.CloseWindow)
}

func (w *WindowManager) CloseActiveWindow() error {
	return wrapWindowError("window.closeActiveWindow", w.impl.CloseActiveWindow(), false)
}

func (w *WindowManager) Kill(processId uint32) error {
	if processId == 0 {
		return windowOperationError("window.kill", WindowInvalidArgument, "processId must be positive", nil)
	}
	return wrapWindowError("window.kill", w.impl.Kill(processId), false)
}

func (w *WindowManager) Title() (string, error) {
	value, err := w.impl.Title()
	return value, wrapWindowError("window.title", err, false)
}

func (w *WindowManager) GetTitle(selector string) (string, error) {
	resolved, err := w.resolveTitle("window.getTitle", selector)
	if err != nil {
		return "", err
	}
	value, err := w.impl.GetTitle(resolved)
	return value, wrapWindowError("window.getTitle", err, true)
}

func (w *WindowManager) Content() (string, error) {
	value, err := w.impl.Content()
	return value, wrapWindowError("window.content", err, false)
}

func (w *WindowManager) GetContent(selector string) (string, error) {
	resolved, err := w.resolveTitle("window.getContent", selector)
	if err != nil {
		return "", err
	}
	value, err := w.impl.GetContent(resolved)
	return value, wrapWindowError("window.getContent", err, true)
}

func (w *WindowManager) List() ([]map[string]interface{}, error) {
	rows, err := w.impl.List()
	if err != nil {
		return nil, wrapWindowError("window.list", err, false)
	}
	for _, row := range rows {
		normalizeWindowRow(row)
	}
	return rows, nil
}

func (w *WindowManager) GetFocusWindow() (*WindowInfo, error) {
	result, err := w.impl.GetFocusWindow()
	if err != nil {
		return nil, wrapWindowError("window.getFocusWindow", err, false)
	}
	return normalizeWindowInfo(result), nil
}

func (w *WindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	if err := w.requireCapability("window.setAlwaysOnTop", "window.alwaysOnTop"); err != nil {
		return err
	}
	resolved, err := w.resolveTitle("window.setAlwaysOnTop", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.setAlwaysOnTop", w.impl.SetAlwaysOnTop(resolved, alwaysOnTop), true)
}

func (w *WindowManager) UnsetTopMost(title string) error {
	if err := w.requireCapability("window.unsetTopMost", "window.alwaysOnTop"); err != nil {
		return err
	}
	resolved, err := w.resolveTitle("window.unsetTopMost", title)
	if err != nil {
		return err
	}
	return wrapWindowError("window.unsetTopMost", w.impl.UnsetTopMost(resolved), true)
}

func (w *WindowManager) BringToTop(title string, pid interface{}) error {
	resolved := strings.TrimSpace(title)
	if resolved != "" {
		var err error
		resolved, err = w.resolveTitle("window.bringToTop", resolved)
		if err != nil {
			return err
		}
	}
	return wrapWindowError("window.bringToTop", w.impl.BringToTop(resolved, pid), resolved != "")
}

func (w *WindowManager) titleAction(operation, title string, action func(string) error) error {
	resolved, err := w.resolveTitle(operation, title)
	if err != nil {
		return err
	}
	return wrapWindowError(operation, action(resolved), true)
}

func (w *WindowManager) requireCapability(operation, capability string) error {
	item, ok := windowCapabilities(runtime.GOOS).Capabilities[capability]
	if !ok || !item.Supported {
		return windowOperationError(operation, WindowNotSupported, capability+" is not supported on this platform", nil)
	}
	return nil
}

func (w *WindowManager) resolveTitle(operation, title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", windowOperationError(operation, WindowInvalidArgument, "window title cannot be empty", nil)
	}
	info, err := w.impl.GetWindowByTitle(title)
	if err != nil {
		return "", wrapWindowError(operation, err, false)
	}
	if info == nil || strings.TrimSpace(info.Title) == "" {
		return "", windowOperationError(operation, WindowNotFound, "window target is unavailable", nil)
	}
	return info.Title, nil
}

func normalizeWindowInfo(info *WindowInfo) *WindowInfo {
	if info == nil {
		return nil
	}
	if info.ID == "" {
		info.ID = makeWindowID(info.ProcessID, info.Handle)
	}
	return info
}

func normalizeWindowRow(row map[string]interface{}) {
	if row == nil {
		return
	}
	pid := uint64Value(row["pid"])
	if pid == 0 {
		pid = uint64Value(row["processId"])
	}
	if pid == 0 {
		pid = uint64Value(row["processID"])
	}
	row["pid"] = uint32(pid)
	row["processId"] = uint32(pid)
	handle := uint64Value(row["handle"])
	row["handle"] = handle
	if _, ok := row["id"]; !ok {
		row["id"] = makeWindowID(uint32(pid), handle)
	}
}

func uint64Value(value interface{}) uint64 {
	switch typed := value.(type) {
	case uint:
		return uint64(typed)
	case uint32:
		return uint64(typed)
	case uint64:
		return typed
	case uintptr:
		return uint64(typed)
	case int:
		if typed >= 0 {
			return uint64(typed)
		}
	case int32:
		if typed >= 0 {
			return uint64(typed)
		}
	case int64:
		if typed >= 0 {
			return uint64(typed)
		}
	case float64:
		if typed >= 0 {
			return uint64(typed)
		}
	}
	return 0
}

func makeWindowID(pid uint32, handle uint64) string {
	identity := "native:" + strconv.FormatUint(handle, 10)
	if handle == 0 {
		identity = "unresolved"
	}
	return runtime.GOOS + ":" + strconv.FormatUint(uint64(pid), 10) + ":" + identity
}

func windowOperationError(operation string, code WindowErrorCode, message string, cause error) error {
	return &WindowError{
		Code:       code,
		Operation:  operation,
		Platform:   runtime.GOOS,
		Capability: windowCapabilityForOperation(operation),
		Message:    message,
		Cause:      cause,
	}
}

func wrapWindowError(operation string, err error, resolved bool) error {
	if err == nil {
		return nil
	}
	var windowErr *WindowError
	if errors.As(err, &windowErr) {
		copy := *windowErr
		copy.Operation = operation
		copy.Platform = runtime.GOOS
		copy.Capability = windowCapabilityForOperation(operation)
		if resolved && copy.Code == WindowNotFound {
			copy.Code = WindowStaleTarget
			copy.Message = "resolved window target is no longer available"
		}
		return &copy
	}
	message := strings.ToLower(err.Error())
	code := WindowBackendFailed
	switch {
	case strings.Contains(message, "not supported") || strings.Contains(message, "not implemented"):
		code = WindowNotSupported
	case strings.Contains(message, "ambiguous") || strings.Contains(message, "multiple windows"):
		code = WindowAmbiguousTarget
	case strings.Contains(message, "not found") || strings.Contains(message, "no active window") || strings.Contains(message, "no suitable window") || strings.Contains(message, "does not match"):
		if resolved {
			code = WindowStaleTarget
		} else {
			code = WindowNotFound
		}
	case strings.Contains(message, "permission") || strings.Contains(message, "not authorized") || strings.Contains(message, "not permitted") || strings.Contains(message, "-1743"):
		code = WindowPermissionDenied
	case strings.Contains(message, "verification failed"):
		code = WindowVerificationFailed
	case strings.Contains(message, "timeout") || strings.Contains(message, "deadline exceeded"):
		code = WindowTimeout
	case strings.Contains(message, "invalid") || strings.Contains(message, "cannot be empty") || strings.Contains(message, "must be positive"):
		code = WindowInvalidArgument
	}
	return windowOperationError(operation, code, "window backend rejected the operation", err)
}

func windowCapabilityForOperation(operation string) string {
	switch operation {
	case "window.getCapabilities":
		return "window.capabilities"
	case "window.getActiveWindow", "window.getFocusWindow", "window.title", "window.content", "window.closeActiveWindow":
		return "window.active"
	case "window.getWindowByTitle", "window.getTitle", "window.getContent":
		return "window.findByTitle"
	case "window.focus":
		return "window.focus"
	case "window.setWindowBounds", "window.setWidth", "window.setHeight":
		return "window.setBounds"
	case "window.maximize", "window.maximizeByPID":
		return "window.maximize"
	case "window.minimize", "window.minimizeByPID":
		return "window.minimize"
	case "window.restore", "window.restoreByPID":
		return "window.restore"
	case "window.closeWindow":
		return "window.close"
	case "window.setAlwaysOnTop", "window.unsetTopMost":
		return "window.alwaysOnTop"
	case "window.bringToTop":
		return "window.bringToTop"
	case "window.list":
		return "window.list"
	default:
		return "window.process"
	}
}

func windowCapabilities(platform string) WindowCapabilities {
	names := []string{
		"window.list", "window.active", "window.findByTitle", "window.focus",
		"window.getBounds", "window.setBounds", "window.minimize", "window.maximize",
		"window.restore", "window.close", "window.alwaysOnTop", "window.bringToTop",
	}
	unsupported := func(note string) map[string]WindowCapability {
		result := make(map[string]WindowCapability, len(names))
		for _, name := range names {
			result[name] = WindowCapability{Status: WindowUnsupported, Supported: false, Notes: note}
		}
		return result
	}
	capabilities := WindowCapabilities{Platform: platform}
	switch platform {
	case "darwin":
		capabilities.Backend = "CoreGraphics+SystemEvents"
		capabilities.Identity = "pid+CGWindowID when WindowServer can resolve a unique row; unresolved rows are explicit; title actions require a unique current title and can become stale"
		capabilities.CoordinateSpace = "global display points; primary-display top-left origin; secondary displays may use negative coordinates"
		capabilities.SpaceBehavior = "observation is limited to WindowServer-visible rows; focus/actions across Spaces depend on macOS and Accessibility state"
		capabilities.Capabilities = map[string]WindowCapability{
			"window.list":        {Status: WindowPartial, Supported: true, Notes: "visible WindowServer rows; may degrade to the active window when System Events enumeration is unavailable"},
			"window.active":      {Status: WindowStable, Supported: true},
			"window.findByTitle": {Status: WindowPartial, Supported: true, Notes: "unique current title required; duplicate titles return AMBIGUOUS_TARGET"},
			"window.focus":       {Status: WindowPartial, Supported: true, Notes: "requires Accessibility/System Events and may switch Spaces"},
			"window.getBounds":   {Status: WindowStable, Supported: true},
			"window.setBounds":   {Status: WindowPartial, Supported: true, Notes: "target application may reject AX position or size changes"},
			"window.minimize":    {Status: WindowPartial, Supported: true, Notes: "requires Accessibility/System Events"},
			"window.maximize":    {Status: WindowPartial, Supported: true, Notes: "fills primary display bounds; not native full-screen"},
			"window.restore":     {Status: WindowPartial, Supported: true, Notes: "restores minimized state and raises; previous custom bounds are not persisted"},
			"window.close":       {Status: WindowPartial, Supported: true, Notes: "requires AXClose or Command-W fallback"},
			"window.alwaysOnTop": {Status: WindowUnsupported, Supported: false, Notes: "macOS does not expose a supported primitive for arbitrary third-party windows"},
			"window.bringToTop":  {Status: WindowPartial, Supported: true, Notes: "same constraints as focus"},
		}
	case "windows":
		capabilities.Backend = "Win32"
		capabilities.Identity = "pid+HWND for observations; title actions require a unique current title and can become stale"
		capabilities.CoordinateSpace = "virtual-screen logical coordinates; per-process DPI awareness can affect scaling"
		capabilities.SpaceBehavior = "virtual desktops are not selected or managed by this API"
		capabilities.Capabilities = map[string]WindowCapability{
			"window.list":        {Status: WindowStable, Supported: true},
			"window.active":      {Status: WindowStable, Supported: true},
			"window.findByTitle": {Status: WindowPartial, Supported: true, Notes: "unique current title required; duplicate titles return AMBIGUOUS_TARGET"},
			"window.focus":       {Status: WindowPartial, Supported: true, Notes: "Windows foreground-lock policy may reject activation"},
			"window.getBounds":   {Status: WindowStable, Supported: true},
			"window.setBounds":   {Status: WindowStable, Supported: true},
			"window.minimize":    {Status: WindowStable, Supported: true},
			"window.maximize":    {Status: WindowStable, Supported: true},
			"window.restore":     {Status: WindowStable, Supported: true},
			"window.close":       {Status: WindowPartial, Supported: true, Notes: "application may reject WM_CLOSE"},
			"window.alwaysOnTop": {Status: WindowStable, Supported: true},
			"window.bringToTop":  {Status: WindowPartial, Supported: true, Notes: "Windows foreground-lock policy may reject activation"},
		}
	default:
		capabilities.Backend = "unsupported"
		capabilities.Identity = "unavailable"
		capabilities.CoordinateSpace = "unavailable"
		capabilities.SpaceBehavior = "unavailable"
		capabilities.Capabilities = unsupported("no maintained window backend is available on this platform")
	}
	return capabilities
}

func windowErrorCode(err error) WindowErrorCode {
	var target *WindowError
	if errors.As(err, &target) {
		return target.Code
	}
	return ""
}
