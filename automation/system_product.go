package automation

import (
	"fmt"

	"github.com/dop251/goja"
)

const (
	// ProductID is the immutable first-party product identity exposed to every
	// JavaScript execution as System.product.id.
	ProductID = "com.opendesk.desktop"
	// ProductName is the immutable first-party product name exposed to scripts.
	ProductName = "OpenDesk"
	// ProductWebsite is the canonical first-party website used by product UI
	// entrypoints such as the Script Runner and Recorder brand buttons.
	ProductWebsite = "https://github.com/shopable-ai/opendesk"
)

// registerSystemProduct attaches the immutable System.product identity after
// the existing reflected System methods have been registered. Product identity
// is intentionally runtime-owned: app manifests, env files and user scripts
// cannot replace it.
func registerSystemProduct(runtime *goja.Runtime) error {
	if runtime == nil {
		return fmt.Errorf("register System.product: runtime is required")
	}

	systemValue := runtime.Get("System")
	if systemValue == nil || goja.IsUndefined(systemValue) || goja.IsNull(systemValue) {
		return fmt.Errorf("register System.product: System is unavailable")
	}
	systemObject := systemValue.ToObject(runtime)
	product := runtime.NewObject()
	fields := []struct {
		name  string
		value string
	}{
		{name: "id", value: ProductID},
		{name: "name", value: ProductName},
		{name: "website", value: ProductWebsite},
	}
	for _, field := range fields {
		if err := product.DefineDataProperty(
			field.name,
			runtime.ToValue(field.value),
			goja.FLAG_FALSE,
			goja.FLAG_FALSE,
			goja.FLAG_TRUE,
		); err != nil {
			return fmt.Errorf("register System.product.%s: %w", field.name, err)
		}
	}
	if err := systemObject.DefineDataProperty(
		"product",
		product,
		goja.FLAG_FALSE,
		goja.FLAG_FALSE,
		goja.FLAG_TRUE,
	); err != nil {
		return fmt.Errorf("register System.product: %w", err)
	}
	return nil
}
