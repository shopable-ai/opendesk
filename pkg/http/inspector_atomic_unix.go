//go:build !windows

package http

import "os"

func inspectorAtomicReplace(temporaryPath, targetPath string) error {
	return os.Rename(temporaryPath, targetPath)
}
