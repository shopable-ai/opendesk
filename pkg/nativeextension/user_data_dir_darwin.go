//go:build darwin

package nativeextension

import (
	"fmt"
	"os"
	"path/filepath"
)

func currentUserDiscoveryRoot(overrideBase string) (string, error) {
	if overrideBase != "" {
		if !filepath.IsAbs(overrideBase) {
			return "", fmt.Errorf("user data directory override must be absolute")
		}
		return filepath.Join(filepath.Clean(overrideBase), "OpenDesk", "NativeExtensions"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return currentUserRootForPlatform("darwin", currentUserPathInputs{Home: home})
}
