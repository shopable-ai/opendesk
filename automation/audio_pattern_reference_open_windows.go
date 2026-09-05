//go:build windows

package automation

import "os"

// Windows has no filesystem FIFO open mode corresponding to O_NONBLOCK.
// os.Open, File.Stat, and regular-file reads remain synchronous; the caller
// checks cancellation between completed operations and rejects non-regular
// handles before reading them.
func openAudioPatternReference(path string) (*os.File, error) {
	return os.Open(path)
}
