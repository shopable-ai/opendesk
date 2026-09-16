package automation

import "testing"

func TestAccessibilityOptionalString(t *testing.T) {
	if got := accessibilityOptionalString(nil); got != "" {
		t.Fatalf("nil optional accessibility field = %q", got)
	}
	value := "save-button"
	if got := accessibilityOptionalString(&value); got != value {
		t.Fatalf("optional accessibility field = %q want %q", got, value)
	}
}
