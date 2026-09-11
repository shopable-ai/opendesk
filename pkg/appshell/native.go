package appshell

import "fmt"

func NewNativeHost(appPackage *Package) (NativeHost, error) {
	if appPackage == nil {
		return nil, fmt.Errorf("app package is required")
	}
	if !appPackage.Manifest.Tray.Enabled {
		return nil, nil
	}
	return newPlatformNativeHost(appPackage)
}
