package customui

import (
	"os"
	"strings"
	"testing"
)

func TestNormalizeFloatingWindowChrome(t *testing.T) {
	base := t.TempDir()
	makeSpec := func(id, kind, chrome string) WindowSpec {
		return WindowSpec{
			ID:      id,
			Kind:    kind,
			Chrome:  chrome,
			Bounds:  Bounds{Width: 320, Height: 180},
			Content: ContentSpec{HTML: `<div id="content">ok</div>`},
		}
	}

	got, err := Normalize(makeSpec("promotion", "floating", "none"), base)
	if err != nil {
		t.Fatalf("normalize frameless floating window: %v", err)
	}
	if got.Chrome != "none" {
		t.Fatalf("chrome = %q, want none", got.Chrome)
	}

	got, err = Normalize(makeSpec("defaultChrome", "floating", ""), base)
	if err != nil {
		t.Fatalf("normalize default chrome: %v", err)
	}
	if got.Chrome != "system" {
		t.Fatalf("default chrome = %q, want system", got.Chrome)
	}

	if _, err := Normalize(makeSpec("normalFrameless", "normal", "none"), base); err == nil {
		t.Fatal("chrome none must be rejected for non-floating public windows")
	}
	if _, err := Normalize(makeSpec("badChrome", "floating", "transparent"), base); err == nil {
		t.Fatal("unknown chrome value must be rejected")
	}
}

func TestFramelessChromeNativeParity(t *testing.T) {
	cases := map[string]struct {
		path   string
		tokens []string
	}{
		"macos": {
			path: "machost/native_darwin.m",
			tokens: []string{
				`BOOL frameless = [spec[@"chrome"] isEqualToString:@"none"]`,
				`NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel`,
				`panel.titleVisibility = NSWindowTitleHidden`,
			},
		},
		"windows": {
			path: "winhost/Host.cs",
			tokens: []string{
				`frameless=floating&&J.S(spec,"chrome","system")=="none"`,
				`Form.FormBorderStyle=FormBorderStyle.None`,
			},
		},
	}
	for name, tc := range cases {
		data, err := os.ReadFile(tc.path)
		if err != nil {
			t.Fatal(err)
		}
		source := string(data)
		for _, token := range tc.tokens {
			if !strings.Contains(source, token) {
				t.Fatalf("%s frameless host contract missing %q", name, token)
			}
		}
	}
}

func TestPromotionRequestsFramelessChrome(t *testing.T) {
	data, err := os.ReadFile("../../apps/opendesk/promotions/controller.js")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	if !strings.Contains(source, "kind:'floating',chrome:'none',title:'OpenDesk · 推广'") {
		t.Fatal("production Promotion controller must explicitly request chrome:none")
	}
}

func TestWindowChromeProtocolVersion(t *testing.T) {
	if ProtocolVersion != "1.13.0" {
		t.Fatalf("Go protocol = %q, want 1.13.0", ProtocolVersion)
	}
	for name, tc := range map[string]struct{ path, token string }{
		"macos":   {"machost/native_darwin.m", `CDProtocolVersion = @"1.13.0"`},
		"windows": {"winhost/Program.cs", `Protocol = "1.13.0"`},
	} {
		data, err := os.ReadFile(tc.path)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), tc.token) {
			t.Fatalf("%s native protocol is not synchronized to 1.13.0", name)
		}
	}
}
