//go:build windows

package automation

import (
	"errors"
	"os"

	"golang.org/x/sys/windows"
)

// Kept for the common error classification path. Windows has a safe
// same-directory publication primitive below, so it is not returned here.
var errDownloadAtomicUnsupported = errors.New("safe atomic download commit is not supported on this platform")

// downloadAtomicCommit never truncates or deletes the current destination
// before the fully-written sibling temporary file is ready. CreateHardLink
// (through os.Link) gives the no-overwrite route a single atomic publication
// point. MoveFileEx replaces only the directory entry on the same volume for
// overwrite=true; because temp and target share a parent, no copy/delete
// fallback can cross a volume.
func downloadAtomicCommit(temporaryPath, targetPath string, overwrite bool) (bool, error) {
	if !overwrite {
		if err := os.Link(temporaryPath, targetPath); err != nil {
			return false, err
		}
		if err := os.Remove(temporaryPath); err != nil {
			return true, err
		}
		return true, nil
	}
	from, err := windows.UTF16PtrFromString(temporaryPath)
	if err != nil {
		return false, err
	}
	to, err := windows.UTF16PtrFromString(targetPath)
	if err != nil {
		return false, err
	}
	if err := windows.MoveFileEx(from, to, windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH); err != nil {
		return false, err
	}
	return true, nil
}
