//go:build !darwin && !linux && !windows

package automation

import "os"

// Unsupported platforms retain the portable opener. The caller still trusts
// only metadata obtained from the opened handle.
func openAudioPatternReference(path string) (*os.File, error) {
	return os.Open(path)
}
