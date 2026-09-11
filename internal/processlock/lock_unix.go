//go:build darwin || linux || freebsd || openbsd || netbsd || dragonfly

package processlock

import (
	"errors"
	"os"

	"golang.org/x/sys/unix"
)

type platformLock struct{}

func tryPlatformLock(file *os.File) (platformLock, bool, error) {
	err := unix.Flock(int(file.Fd()), unix.LOCK_EX|unix.LOCK_NB)
	if err == nil {
		return platformLock{}, true, nil
	}
	if errors.Is(err, unix.EWOULDBLOCK) || errors.Is(err, unix.EAGAIN) {
		return platformLock{}, false, nil
	}
	return platformLock{}, false, err
}

func unlockPlatformLock(file *os.File, _ platformLock) error {
	return unix.Flock(int(file.Fd()), unix.LOCK_UN)
}
