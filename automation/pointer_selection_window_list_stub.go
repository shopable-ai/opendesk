//go:build !windows && !darwin
// +build !windows,!darwin

package automation

func listPointerSelectionWindows(manager *WindowManager) ([]map[string]interface{}, error) {
	return manager.List()
}
