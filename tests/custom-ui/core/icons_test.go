package customui_test

import (
	"testing"

	"opendesk/pkg/customui"
)

func TestToolbarIconRegistryUsesReviewedSFSymbolPresentations(t *testing.T) {
	if got := len(customui.ToolbarIconNames()); got != 160 {
		t.Fatalf("ToolbarIconNames() count = %d, want 160", got)
	}
	want := map[string]customui.ToolbarIconPresentation{
		"play.fill":            {SystemSymbol: "play.fill", Scale: 1.00, OffsetX: 0.5, OffsetY: 0},
		"pause.fill":           {SystemSymbol: "pause.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"stop.fill":            {SystemSymbol: "stop.fill", Scale: 1.15, OffsetX: 0, OffsetY: 0},
		"gearshape.fill":       {SystemSymbol: "gearshape.fill", Scale: 1.08, OffsetX: 0, OffsetY: 0},
		"paperplane.fill":      {SystemSymbol: "paperplane.fill", Scale: 1.00, OffsetX: -0.25, OffsetY: 0.25},
		"timer":                {SystemSymbol: "timer", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"ai.assistant":         {SystemSymbol: "brain", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"ai.generate":          {SystemSymbol: "wand.and.rays", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"ai.analyze":           {SystemSymbol: "doc.text.magnifyingglass", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"ai.search":            {SystemSymbol: "text.magnifyingglass", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.run":       {SystemSymbol: "arrow.triangle.2.circlepath", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.schedule":  {SystemSymbol: "clock.arrow.circlepath", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.trigger":   {SystemSymbol: "bolt.circle.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.configure": {SystemSymbol: "gearshape.2.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.review":    {SystemSymbol: "rectangle.and.hand.point.up.left.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
		"automation.approve":   {SystemSymbol: "hand.tap.fill", Scale: 1.00, OffsetX: 0, OffsetY: 0},
	}
	for name, expected := range want {
		presentation, ok := customui.ToolbarIconPresentationFor(name)
		if !ok || presentation != expected {
			t.Fatalf("presentation for %q = %#v, ok=%t; want %#v", name, presentation, ok, expected)
		}
		if _, ok := customui.ToolbarIconToken(name); !ok {
			t.Fatalf("trusted icon token missing for %q", name)
		}
	}
	for _, unsafe := range []string{"", " play.fill", "play.fill ", "https://example.com/icon.svg", "/tmp/icon.svg", "javascript:alert(1)", "../../icon.svg", "play", "fallback"} {
		if _, ok := customui.ToolbarIconPresentationFor(unsafe); ok {
			t.Fatalf("unsafe icon %q unexpectedly resolved", unsafe)
		}
	}
}
