//go:build !darwin

package automation

func getAppScopedWindow(pid uint32, exePath string) (*WindowInfo, error) {
	return nil, windowOperationError("window.getAppWindow", WindowNotSupported, "app-scoped window observation requires macOS", nil)
}
