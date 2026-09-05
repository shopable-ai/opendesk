//go:build darwin || linux

package automation

import (
	"os"
	"syscall"
)

// openAudioPatternReference prevents a path that is replaced with a FIFO
// between resolution and open from blocking an execution worker indefinitely.
// The caller validates the type and size using File.Stat on this exact handle.
func openAudioPatternReference(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
}
