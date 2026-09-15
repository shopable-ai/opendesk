package appshell

import (
	"fmt"
	"path/filepath"
	"strings"

	"opendesk/pkg/localization"
)

func NewNativeHost(appPackage *Package) (NativeHost, error) {
	if appPackage == nil {
		return nil, fmt.Errorf("app package is required")
	}
	if !appPackage.Manifest.Tray.Enabled {
		return nil, nil
	}

	var manager *localization.Manager
	if shouldConfigureLocalization(appPackage.Manifest) {
		manager = localization.ConfigureDefault(localization.Options{
			CatalogDir: filepath.Join(appPackage.Root, "locales"),
		})
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

func shouldConfigureLocalization(manifest Manifest) bool {
	if IsOpenDeskProduct(manifest) {
		return true
	}
	for _, item := range manifest.Tray.Menu {
		if strings.TrimSpace(item.LabelKey) != "" {
			return true
		}
	}
	return false
}
