package appshell

import (
	"fmt"
	"path/filepath"

	"opendesk/pkg/localization"
)

func NewNativeHost(appPackage *Package) (NativeHost, error) {
	if appPackage == nil {
		return nil, fmt.Errorf("app package is required")
	}
	localization.ConfigureDefault(localization.Options{
		CatalogDir: filepath.Join(appPackage.Root, "locales"),
	})
	if !appPackage.Manifest.Tray.Enabled {
		return nil, nil
	}
	return newPlatformNativeHost(appPackage)
}
