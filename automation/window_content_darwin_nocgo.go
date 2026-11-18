//go:build darwin && !cgo

package automation

import "context"

func readDarwinWindowContent(context.Context, *darwinWindowManager, WindowInfo) (string, error) {
	return "", windowOperationError("", WindowNotSupported, "window content requires a cgo-enabled macOS Accessibility backend", nil)
}
