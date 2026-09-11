//go:build !windows && !darwin && !linux && !freebsd && !openbsd && !netbsd && !dragonfly

package processlock

import (
	"fmt"
	"os"
)

type platformLock struct{}

func tryPlatformLock(_ *os.File) (platformLock, bool, error) {
	return platformLock{}, false, fmt.Errorf("process locks are not supported on this platform")
}

func unlockPlatformLock(_ *os.File, _ platformLock) error { return nil }
