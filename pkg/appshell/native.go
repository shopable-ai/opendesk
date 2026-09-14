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
	manager := localization.ConfigureDefault(localization.Options{
		CatalogDir: filepath.Join(appPackage.Root, "locales"),
	})
	if !appPackage.Manifest.Tray.Enabled {
		return nil, nil
	}
	native, err := newPlatformNativeHost(appPackage)
	if err != nil {
		return nil, err
	}
	if IsOpenDeskProduct(appPackage.Manifest) {
		return newLocalizedNativeHost(appPackage.Manifest, native, manager), nil
	}
	return native, nil
}
