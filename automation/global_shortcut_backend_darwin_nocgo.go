//go:build darwin && !cgo

package automation

import "errors"

var errGlobalShortcutPlatformUnsupported = errors.New("global shortcut requires a macOS cgo build")

func platformGlobalShortcutAccelerator(Accelerator) (GlobalShortcutPlatformAccelerator, error) {
	return GlobalShortcutPlatformAccelerator{}, errGlobalShortcutPlatformUnsupported
}

func newPlatformGlobalShortcutBackend() GlobalShortcutBackend {
	return unsupportedGlobalShortcutBackend{}
}

type unsupportedGlobalShortcutBackend struct{}

func (unsupportedGlobalShortcutBackend) Register(GlobalShortcutPlatformAccelerator, func()) (GlobalShortcutBackendHandle, error) {
	return nil, errGlobalShortcutPlatformUnsupported
}

func (unsupportedGlobalShortcutBackend) Close() error { return nil }
