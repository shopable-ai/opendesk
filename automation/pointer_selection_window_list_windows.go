//go:build windows
// +build windows

package automation

func listPointerSelectionWindows(manager *WindowManager) ([]map[string]interface{}, error) {
	return manager.List()
}
