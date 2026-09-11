//go:build darwin && !cgo

package appshell

import "fmt"

func newPlatformNativeHost(*Package) (NativeHost, error) {
	return nil, fmt.Errorf("App Mode on macOS requires cgo/AppKit")
}
