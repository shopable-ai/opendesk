//go:build windows

package automation

// Windows replacement semantics have not yet been target-runtime verified.
// Fail closed rather than truncating the target or claiming os.Rename has the
// same atomic replacement behavior as the supported Unix backend.
func fileJSONAtomicReplace(temporaryPath, targetPath string) error {
	return errFileJSONAtomicReplaceUnsupported
}
