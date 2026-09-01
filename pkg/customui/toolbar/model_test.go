package toolbar

import (
	"reflect"
	"testing"
)

func TestGeneratedIconRegistryIsExactAndOrdered(t *testing.T) {
	want := []string{"gearshape.fill", "paperplane.fill", "pause.fill", "play.fill", "stop.fill", "timer"}
	if got := IconNames(); !reflect.DeepEqual(got, want) {
		t.Fatalf("IconNames() = %q, want %q", got, want)
	}
	for _, name := range want {
		presentation, ok := IconPresentationFor(name)
		if !ok || presentation.SystemSymbol != name {
			t.Fatalf("presentation for %q = %#v, ok=%t", name, presentation, ok)
		}
	}
}

func TestGeneratedIconRegistryFailsClosed(t *testing.T) {
	for _, value := range []string{
		"", " play.fill", "play.fill ", "play", "fallback",
		"https://example.com/icon.svg", "/tmp/icon.svg", "../icon.svg", "javascript:alert(1)",
	} {
		if _, ok := IconToken(value); ok {
			t.Fatalf("unsafe or unknown icon %q unexpectedly resolved", value)
		}
		if _, ok := IconPresentationFor(value); ok {
			t.Fatalf("unsafe or unknown presentation %q unexpectedly resolved", value)
		}
	}
}
