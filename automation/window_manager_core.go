package automation

// WindowInfo is the cross-platform normalized window model exposed to JS.
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
	Title() string
	GetTitle(selector string) (string, error)
	Content() string
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

func (w *WindowManager) GetActiveWindow() (*WindowInfo, error) {
	return w.impl.GetActiveWindow()
}

func (w *WindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	return w.impl.GetWindowByTitle(title)
}

func (w *WindowManager) Focus(title string) error {
	return w.impl.Focus(title)
}

func (w *WindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	return w.impl.SetWindowBounds(title, x, y, width, height)
}

func (w *WindowManager) SetWidth(title string, width int) error {
	return w.impl.SetWidth(title, width)
}

func (w *WindowManager) SetHeight(title string, height int) error {
	return w.impl.SetHeight(title, height)
}

func (w *WindowManager) Maximize(title string) error {
	return w.impl.Maximize(title)
}

func (w *WindowManager) Minimize(title string) error {
	return w.impl.Minimize(title)
}

func (w *WindowManager) Restore(title string) error {
	return w.impl.Restore(title)
}

func (w *WindowManager) RestoreByPID(pid uint32) error {
	return w.impl.RestoreByPID(pid)
}

func (w *WindowManager) MinimizeByPID(pid uint32) error {
	return w.impl.MinimizeByPID(pid)
}

func (w *WindowManager) MaximizeByPID(pid uint32) error {
	return w.impl.MaximizeByPID(pid)
}

func (w *WindowManager) CloseWindow(title string) error {
	return w.impl.CloseWindow(title)
}

func (w *WindowManager) CloseActiveWindow() error {
	return w.impl.CloseActiveWindow()
}

func (w *WindowManager) Kill(processId uint32) error {
	return w.impl.Kill(processId)
}

func (w *WindowManager) Title() string {
	return w.impl.Title()
}

func (w *WindowManager) GetTitle(selector string) (string, error) {
	return w.impl.GetTitle(selector)
}

func (w *WindowManager) Content() string {
	return w.impl.Content()
}

func (w *WindowManager) GetContent(selector string) (string, error) {
	return w.impl.GetContent(selector)
}

func (w *WindowManager) List() ([]map[string]interface{}, error) {
	return w.impl.List()
}

func (w *WindowManager) GetFocusWindow() (*WindowInfo, error) {
	return w.impl.GetFocusWindow()
}

func (w *WindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	return w.impl.SetAlwaysOnTop(title, alwaysOnTop)
}

func (w *WindowManager) UnsetTopMost(title string) error {
	return w.impl.UnsetTopMost(title)
}

func (w *WindowManager) BringToTop(title string, pid interface{}) error {
	return w.impl.BringToTop(title, pid)
}
