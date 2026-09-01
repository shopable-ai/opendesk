//go:build windows

package nativeextension

import (
	"fmt"
	"os"
)

// Windows current-user discovery still lacks an owner/DACL/reparse trust gate.
// Machine-wide discovery therefore remains disabled. This stub preserves the
// current-user Experimental behavior until that platform security Goal lands.
func validateTrustedAncestorDirectories(path string) error {
	return nil
}

func validateSecureDirectory(path string, info os.FileInfo) error {
	if info == nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s must be a real directory", path)
	}
	return nil
}

func validateSecureRegularFile(path string, info os.FileInfo, executable bool) error {
	if info == nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s must be a real regular file", path)
	}
	return nil
}
