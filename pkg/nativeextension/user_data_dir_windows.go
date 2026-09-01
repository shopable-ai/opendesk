//go:build windows

package nativeextension

import (
	"fmt"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func currentUserDiscoveryRoot(overrideBase string) (string, error) {
	if overrideBase != "" {
		if !filepath.IsAbs(overrideBase) {
			return "", fmt.Errorf("user data directory override must be absolute")
		}
		return filepath.Join(filepath.Clean(overrideBase), "OpenDesk", "NativeExtensions"), nil
	}
	localAppData, err := windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
	if err != nil {
		return "", err
	}
	return currentUserRootForPlatform("windows", currentUserPathInputs{LocalAppData: localAppData})
}
