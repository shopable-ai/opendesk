//go:build !windows && !darwin
// +build !windows,!darwin

package automation

import "fmt"

type stubWindowManager struct{}

func newPlatformWindowManager() windowManagerPlatform { return &stubWindowManager{} }

func (w *stubWindowManager) GetActiveWindow() (*WindowInfo, error) {
	return nil, fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) GetWindowByTitle(title string) (*WindowInfo, error) {
	return nil, fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Focus(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) SetWindowBounds(title string, x, y, width, height int) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) SetWidth(title string, width int) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) SetHeight(title string, height int) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Maximize(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Minimize(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Restore(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) RestoreByPID(pid uint32) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) MinimizeByPID(pid uint32) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) MaximizeByPID(pid uint32) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) CloseWindow(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) CloseActiveWindow() error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Kill(processId uint32) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Title() string { return "" }

func (w *stubWindowManager) GetTitle(selector string) (string, error) {
	return "", fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) Content() string { return "" }

func (w *stubWindowManager) GetContent(selector string) (string, error) {
	return "", fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) List() ([]map[string]interface{}, error) {
	return nil, fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) GetFocusWindow() (*WindowInfo, error) {
	return nil, fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) SetAlwaysOnTop(title string, alwaysOnTop bool) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) UnsetTopMost(title string) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}

func (w *stubWindowManager) BringToTop(title string, pid interface{}) error {
	return fmt.Errorf("window automation is not implemented on this platform")
}
