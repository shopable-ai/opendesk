//go:build !darwin || !cgo

package automation

func newAppWindowWatchBackend(pid int, path string) (appWindowWatchBackend, error) {
	return nil, &WindowError{Code: WindowNotSupported, Message: "window.watchAppWindow requires macOS with cgo"}
}
