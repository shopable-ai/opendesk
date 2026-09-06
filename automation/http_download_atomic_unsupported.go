//go:build !darwin && !linux && !windows

package automation

import "errors"

var errDownloadAtomicUnsupported = errors.New("safe atomic download commit is not supported on this platform")

// Windows and other unsupported backends fail closed. In particular, this
// avoids a truncate/copy/delete fallback that could expose partial files or
// weaken reparse-point safety.
func downloadAtomicCommit(temporaryPath, targetPath string, overwrite bool) (bool, error) {
	return false, errDownloadAtomicUnsupported
}
