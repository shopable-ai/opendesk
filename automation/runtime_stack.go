package automation

import (
	"fmt"

	"github.com/dop251/goja"
)

// RuntimeStackMode expresses which browser automation surface a JS runtime
// should expose by default. Legacy remains the default to preserve existing
// scripts, while upgraded/playwright expose the new compatibility facade.
type RuntimeStackMode string

const (
	RuntimeStackLegacy     RuntimeStackMode = "legacy"
	RuntimeStackUpgraded   RuntimeStackMode = "upgraded"
	RuntimeStackPlaywright RuntimeStackMode = "playwright"
)

func normalizeRuntimeStackMode(mode string) RuntimeStackMode {
	switch RuntimeStackMode(mode) {
	case RuntimeStackUpgraded:
		return RuntimeStackUpgraded
	case RuntimeStackPlaywright:
		return RuntimeStackPlaywright
	default:
		return RuntimeStackLegacy
	}
}

func ApplyRuntimeStackMode(runtime *goja.Runtime, mode string) error {
	if runtime == nil {
		return fmt.Errorf("runtime is required")
	}
	selected := normalizeRuntimeStackMode(mode)

	switch selected {
	case RuntimeStackLegacy:
		// Keep whatever polyfills already exposed as the legacy default.
		return nil
	case RuntimeStackUpgraded:
		return aliasGlobalObject(runtime, "pageUpgraded", "page", "upgraded page facade")
	case RuntimeStackPlaywright:
		if err := aliasGlobalObject(runtime, "browserUpgraded", "browser", "playwright browser facade"); err != nil {
			return err
		}
		if err := aliasGlobalObject(runtime, "contextUpgraded", "context", "playwright context facade"); err != nil {
			return err
		}
		if err := aliasGlobalObject(runtime, "pageUpgraded", "page", "playwright page facade"); err != nil {
			return err
		}
		return nil
	default:
		return nil
	}
}

func aliasGlobalObject(runtime *goja.Runtime, sourceName, targetName, label string) error {
	source := runtime.Get(sourceName)
	if goja.IsUndefined(source) || goja.IsNull(source) {
		return fmt.Errorf("%s is unavailable: missing global %s", label, sourceName)
	}
	return runtime.Set(targetName, source)
}
