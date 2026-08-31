package automation

import (
	"fmt"
	"strings"

	"github.com/dop251/goja"
)

// RuntimeStackMode expresses which browser automation surface a JS runtime
// should expose by default. Legacy remains the default to preserve existing
// scripts, while upgraded/playwright expose the new compatibility facade.
type RuntimeStackMode string

const (
	RuntimeStackLegacy     = "legacy"
	RuntimeStackUpgraded   = "upgraded"
	RuntimeStackPlaywright = "playwright"
)

func normalizeRuntimeStackMode(mode string) RuntimeStackMode {
	switch RuntimeStackMode(strings.ToLower(strings.TrimSpace(mode))) {
	case RuntimeStackUpgraded:
		return RuntimeStackUpgraded
	case RuntimeStackPlaywright:
		return RuntimeStackPlaywright
	default:
		return RuntimeStackLegacy
	}
}

// NormalizeRuntimeStack returns the supported stack name, falling back to the
// legacy surface for an empty or unknown value.
func NormalizeRuntimeStack(mode string) string {
	return string(normalizeRuntimeStackMode(mode))
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
	if source == nil || goja.IsUndefined(source) || goja.IsNull(source) {
		// Compatibility layers can be selectively unavailable. Preserve the
		// current global rather than making mode selection itself fail.
		return nil
	}
	return runtime.Set(targetName, source)
}
