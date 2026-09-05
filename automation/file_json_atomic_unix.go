//go:build darwin || linux

package automation

import "os"

// fileJSONAtomicReplace is verified on the local Unix filesystem. Rename is a
// same-directory atomic name replacement here; it is not a durability or CAS
// guarantee and callers must not infer equivalent Windows behavior.
func fileJSONAtomicReplace(temporaryPath, targetPath string) error {
	return os.Rename(temporaryPath, targetPath)
}
