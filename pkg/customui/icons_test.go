package customui

import "testing"

func TestToolbarIconRegistryUsesReviewedSFSymbolPresentations(t *testing.T) {
	if got := len(ToolbarIconNames()); got != 150 {
		t.Fatalf("ToolbarIconNames() count = %d, want 150", got)
	}
	want := map[string]ToolbarIconPresentation{
		"play.fill":       {SystemSymbol: "play.fill", Scale: 1.00, OffsetX: 0.5, OffsetY: 0},
		"pause.fill":      {SystemSymbol: "pause.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"stop.fill":       {SystemSymbol: "stop.fill", Scale: 1.15, OffsetX: 0, OffsetY: 0},
		"gearshape.fill":  {SystemSymbol: "gearshape.fill", Scale: 1.08, OffsetX: 0, OffsetY: 0},
		"paperplane.fill": {SystemSymbol: "paperplane.fill", Scale: 1.00, OffsetX: -0.25, OffsetY: 0.25},
		"timer":           {SystemSymbol: "timer", Scale: 1.00, OffsetX: 0, OffsetY: 0},
	}
	for name, expected := range want {
		presentation, ok := ToolbarIconPresentationFor(name)
		if !ok || presentation != expected {
			t.Fatalf("presentation for %q = %#v, ok=%t; want %#v", name, presentation, ok, expected)
		}
		if _, ok := ToolbarIconToken(name); !ok {
			t.Fatalf("trusted icon token missing for %q", name)
		}
	}
	for _, unsafe := range []string{"", " play.fill", "play.fill ", "https://example.com/icon.svg", "/tmp/icon.svg", "javascript:alert(1)", "../../icon.svg", "play", "fallback"} {
		if _, ok := ToolbarIconPresentationFor(unsafe); ok {
			t.Fatalf("unsafe icon %q unexpectedly resolved", unsafe)
		}
	}
}
