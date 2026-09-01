//go:build linux

package nativeextension

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func currentUserDiscoveryRoot(overrideBase string) (string, error) {
	if overrideBase != "" {
		if !filepath.IsAbs(overrideBase) {
			return "", fmt.Errorf("user data directory override must be absolute")
		}
		return filepath.Join(filepath.Clean(overrideBase), "OpenDesk", "NativeExtensions"), nil
	}
	xdgDataHome := os.Getenv("XDG_DATA_HOME")
	home := ""
	if strings.TrimSpace(xdgDataHome) == "" {
		var err error
		home, err = os.UserHomeDir()
		if err != nil {
			return "", err
		}
	}
	return currentUserRootForPlatform("linux", currentUserPathInputs{
		Home: home, XDGDataHome: xdgDataHome,
	})
}
