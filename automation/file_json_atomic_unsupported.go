//go:build !darwin && !linux && !windows

package automation

func fileJSONAtomicReplace(temporaryPath, targetPath string) error {
	return errFileJSONAtomicReplaceUnsupported
}
