//go:build !darwin && !linux

package automation

import "os"

// The caller checks the known path type and validates the opened descriptor
// before truncating. Unix FIFO non-blocking flags are not portable to Windows.
func openRuntimeFile(path string, flags int, mode os.FileMode) (*os.File, error) {
	return os.OpenFile(path, flags, mode)
}
