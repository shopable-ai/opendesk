//go:build darwin || linux

package automation

import (
	"os"
	"syscall"
)

// Keep FIFO replacement races from blocking before descriptor type validation.
// O_NONBLOCK does not change regular-file I/O semantics.
func openRuntimeFile(path string, flags int, mode os.FileMode) (*os.File, error) {
	return os.OpenFile(path, flags|syscall.O_NONBLOCK, mode)
}
