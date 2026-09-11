//go:build !darwin && !windows

package appshell

import (
	"fmt"
	"runtime"
)

func newPlatformNativeHost(*Package) (NativeHost, error) {
	return nil, fmt.Errorf("App Mode tray is not supported on %s", runtime.GOOS)
}
