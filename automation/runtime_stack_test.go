package automation

import (
	"testing"

	"github.com/dop251/goja"
)

func TestNormalizeRuntimeStack(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", RuntimeStackLegacy},
		{"legacy", RuntimeStackLegacy},
		{" LEGACY ", RuntimeStackLegacy},
		{"upgraded", RuntimeStackUpgraded},
		{"UPGRADED", RuntimeStackUpgraded},
		{"playwright", RuntimeStackPlaywright},
		{"unknown", RuntimeStackLegacy},
	}

	for _, tt := range tests {
		if got := NormalizeRuntimeStack(tt.input); got != tt.want {
			t.Fatalf("NormalizeRuntimeStack(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestApplyRuntimeStackModeUsesUpgradedAliasOnlyWhenPresent(t *testing.T) {
	rt := goja.New()
	if err := rt.Set("page", "legacy-page"); err != nil {
		t.Fatal(err)
	}

	if err := ApplyRuntimeStackMode(rt, RuntimeStackUpgraded); err != nil {
		t.Fatal(err)
	}
	if got := rt.Get("page").String(); got != "legacy-page" {
		t.Fatalf("upgraded mode replaced page without pageUpgraded: got %q", got)
	}

	if err := rt.Set("pageUpgraded", "upgraded-page"); err != nil {
		t.Fatal(err)
	}
	if err := ApplyRuntimeStackMode(rt, RuntimeStackUpgraded); err != nil {
		t.Fatal(err)
	}
	if got := rt.Get("page").String(); got != "upgraded-page" {
		t.Fatalf("upgraded mode did not select available pageUpgraded: got %q", got)
	}
}

func TestApplyRuntimeStackModePlaywrightAliasesAvailableUpgradedGlobals(t *testing.T) {
	rt := goja.New()
	for name, value := range map[string]string{
		"page":            "legacy-page",
		"browser":         "legacy-browser",
		"context":         "legacy-context",
		"pageUpgraded":    "upgraded-page",
		"browserUpgraded": "upgraded-browser",
		"contextUpgraded": "upgraded-context",
	} {
		if err := rt.Set(name, value); err != nil {
			t.Fatal(err)
		}
	}

	if err := ApplyRuntimeStackMode(rt, RuntimeStackPlaywright); err != nil {
		t.Fatal(err)
	}

	for name, want := range map[string]string{
		"page":    "upgraded-page",
		"browser": "upgraded-browser",
		"context": "upgraded-context",
	} {
		if got := rt.Get(name).String(); got != want {
			t.Fatalf("%s = %q, want %q", name, got, want)
		}
	}
}
