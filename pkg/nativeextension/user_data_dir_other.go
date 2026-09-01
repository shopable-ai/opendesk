//go:build !darwin && !linux && !windows

package nativeextension

import (
	"fmt"
	"path/filepath"
)

func currentUserDiscoveryRoot(overrideBase string) (string, error) {
	if overrideBase == "" {
		return "", fmt.Errorf("canonical current-user data directory is not implemented for this platform")
	}
	if !filepath.IsAbs(overrideBase) {
		return "", fmt.Errorf("user data directory must be absolute")
	}
	return currentUserRootForPlatform("other", currentUserPathInputs{FallbackData: overrideBase})
}
