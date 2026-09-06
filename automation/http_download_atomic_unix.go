//go:build darwin || linux

package automation

import (
	"errors"
	"os"
)

var errDownloadAtomicUnsupported = errors.New("safe atomic download commit is not supported on this platform")

// downloadAtomicCommit publishes only a same-directory temporary file. The
// no-overwrite path uses link(2), which atomically fails if another process
// created the destination after our preflight. It deliberately has no
// copy/delete fallback across filesystems.
func downloadAtomicCommit(temporaryPath, targetPath string, overwrite bool) (bool, error) {
	if overwrite {
		if err := os.Rename(temporaryPath, targetPath); err != nil {
			return false, err
		}
		return true, nil
	}
	if err := os.Link(temporaryPath, targetPath); err != nil {
		return false, err
	}
	if err := os.Remove(temporaryPath); err != nil {
		// The destination is already safely published. Return committed=true so
		// callers do not claim that an old target was preserved; their deferred
		// cleanup will make the leaked temporary name observable if it persists.
		return true, err
	}
	return true, nil
}
