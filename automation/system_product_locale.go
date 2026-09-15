package automation

import (
	"strings"

	"github.com/dop251/goja"
	"opendesk/pkg/localization"
)

// productLocaleBridge is an official-product-only presentation projection.
// Catalog ownership and fallback remain in pkg/localization; JavaScript only
// receives resolved text for an explicit key and never a writable preference.
func productLocaleBridge(runtime *goja.Runtime, manager *localization.Manager) map[string]any {
	translate := func(call goja.FunctionCall) goja.Value {
		key := strings.TrimSpace(call.Argument(0).String())
		fallback := strings.TrimSpace(call.Argument(1).String())
		params := map[string]any(nil)
		if value := call.Argument(2); value != nil && !goja.IsUndefined(value) && !goja.IsNull(value) {
			if err := runtime.ExportTo(value, &params); err != nil {
				panic(runtime.NewTypeError("System.product.locale.translate params must be an object"))
			}
		}
		return runtime.ToValue(manager.TranslateWithFallback(key, fallback, params))
	}
	return map[string]any{
		"preference": manager.GetLocalePreference(),
		"resolved":   manager.GetResolvedLocale(),
		"translate":  translate,
	}
}
