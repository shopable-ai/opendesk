//go:build !darwin && !linux

package automation

import (
	"errors"
	"os"
)

func fileHandleTryLock(_ *os.File) (bool, error) {
	return false, errors.New("FileHandle.tryLock is unsupported on this platform")
}
