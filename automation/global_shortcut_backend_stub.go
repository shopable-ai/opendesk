//go:build !darwin && !windows

package automation

import "errors"

var errGlobalShortcutPlatformUnsupported = errors.New("global shortcut platform backend is unavailable")

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
