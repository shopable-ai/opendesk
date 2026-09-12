package automation

import (
	"testing"

	"github.com/dop251/goja"
)

func TestRegisterSystemProductExposesImmutableIdentity(t *testing.T) {
	runtime := goja.New()
	if err := runtime.Set("System", map[string]any{}); err != nil {
		t.Fatalf("register System test object: %v", err)
	}
	if err := registerSystemProduct(runtime); err != nil {
		t.Fatalf("register System.product: %v", err)
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
	want := ProductID + "|" + ProductName + "|" + ProductWebsite + "|id,name,website"
	if got := value.String(); got != want {
		t.Fatalf("System.product = %q, want %q", got, want)
	}

	if _, err := runtime.RunString(`'use strict'; System.product.website = 'https://example.invalid';`); err == nil {
		t.Fatal("mutating System.product.website unexpectedly succeeded")
	}
	if _, err := runtime.RunString(`'use strict'; System.product = {website: 'https://example.invalid'};`); err == nil {
		t.Fatal("replacing System.product unexpectedly succeeded")
	}
	if got := runtime.Get("System").ToObject(runtime).Get("product").ToObject(runtime).Get("website").String(); got != ProductWebsite {
		t.Fatalf("System.product.website changed to %q", got)
	}
}
