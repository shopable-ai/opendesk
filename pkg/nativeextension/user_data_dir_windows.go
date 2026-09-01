//go:build windows

package nativeextension

import (
	"fmt"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// localAppDataKnownFolder is intentionally a narrow seam for Windows-only
// path-contract tests. Product code always resolves FOLDERID_LocalAppData and
// never trusts a caller-provided environment variable such as LOCALAPPDATA.
var localAppDataKnownFolder = func() (string, error) {
	return windows.KnownFolderPath(windows.FOLDERID_LocalAppData, 0)
}

func currentUserDiscoveryRoot(overrideBase string) (string, error) {
	if overrideBase != "" {
		if !filepath.IsAbs(overrideBase) {
			return "", fmt.Errorf("user data directory override must be absolute")
		}
		return filepath.Join(filepath.Clean(overrideBase), "OpenDesk", "NativeExtensions"), nil
	}
	localAppData, err := localAppDataKnownFolder()
	if err != nil {
		return "", err
	}
	return currentUserRootForPlatform("windows", currentUserPathInputs{LocalAppData: localAppData})
}
