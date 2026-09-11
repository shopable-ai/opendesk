//go:build windows

package processlock

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

type platformLock struct{}

func tryPlatformLock(file *os.File) (platformLock, bool, error) {
	var overlapped windows.Overlapped
	err := windows.LockFileEx(
		windows.Handle(file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY,
		0,
		1,
		0,
		&overlapped,
	)
	if err == nil {
		return platformLock{}, true, nil
	}
	if errors.Is(err, windows.ERROR_LOCK_VIOLATION) {
		return platformLock{}, false, nil
	}
	return platformLock{}, false, err
}

func unlockPlatformLock(file *os.File, _ platformLock) error {
	var overlapped windows.Overlapped
	return windows.UnlockFileEx(windows.Handle(file.Fd()), 0, 1, 0, &overlapped)
}
