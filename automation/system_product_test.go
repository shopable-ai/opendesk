package automation

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/dop251/goja"
)

func TestSystemProductPolyfillExposesImmutableIdentity(t *testing.T) {
	source, err := os.ReadFile(filepath.Join("..", "polyfills", "000-systemBase.js"))
	if err != nil {
		t.Fatalf("read system base polyfill: %v", err)
	}

	runtime := goja.New()
	if err := runtime.Set("System", map[string]any{}); err != nil {
		t.Fatalf("register System test object: %v", err)
	}
	if err := runtime.Set("notify____Inject", func(goja.FunctionCall) goja.Value { return goja.Undefined() }); err != nil {
		t.Fatalf("register notify inject: %v", err)
	}
	if _, err := runtime.RunString(string(source)); err != nil {
		t.Fatalf("run system base polyfill: %v", err)
	}

	value, err := runtime.RunString(`[
		System.product.id,
		System.product.name,
		System.product.website,
		Object.keys(System.product).sort().join(','),
	].join('|')`)
	if err != nil {
		t.Fatalf("read System.product: %v", err)
	}
	const want = "com.opendesk.desktop|OpenDesk|https://github.com/shopable-ai/opendesk|id,name,website"
	if got := value.String(); got != want {
		t.Fatalf("System.product = %q, want %q", got, want)
	}

	if _, err := runtime.RunString(`'use strict'; System.product.website = 'https://example.invalid';`); err == nil {
		t.Fatal("mutating System.product.website unexpectedly succeeded")
	}
	if _, err := runtime.RunString(`'use strict'; System.product = {website: 'https://example.invalid'};`); err == nil {
		t.Fatal("replacing System.product unexpectedly succeeded")
	}
	value, err = runtime.RunString(`System.product.website`)
	if err != nil {
		t.Fatalf("read System.product.website after mutation attempts: %v", err)
	}
	if got := value.String(); got != "https://github.com/shopable-ai/opendesk" {
		t.Fatalf("System.product.website changed to %q", got)
	}
}
