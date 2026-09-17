package appshell

import (
	"os"
	"strings"
	"testing"
)

// The URL scheme and AppKit bridge are product security boundaries that are
// not observable from headless Go. Keep their source-level contract precise:
// native code transports raw URLs only, while the Go Marketplace parser owns
// all semantic validation.
func TestDarwinMarketplaceProtocolSourceContract(t *testing.T) {
	nativeSource, err := os.ReadFile("native_darwin.m")
	if err != nil {
		t.Fatalf("read native_darwin.m: %v", err)
	}
	for _, fragment := range []string{
		`application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)urls`,
		`opendeskAppShellDarwinOpenURL(rawURL);`,
		`Marketplace has verified this publisher identity. This is not local publisher trust.`,
		`Installing does not run the Flow.`,
		`[alert addButtonWithTitle:@"Install Release"];`,
	} {
		if !strings.Contains(string(nativeSource), fragment) {
			t.Fatalf("native Marketplace protocol is missing %q", fragment)
		}
	}
	if strings.Contains(string(nativeSource), "artifactUrl") || strings.Contains(string(nativeSource), "licenseKey") {
		t.Fatal("native Marketplace protocol must not interpret artifact URLs or credentials")
	}

	builderSource, err := os.ReadFile("../../scripts/build_macos_app.sh")
	if err != nil {
		t.Fatalf("read macOS build script: %v", err)
	}
	for _, fragment := range []string{
		`<key>CFBundleURLTypes</key>`,
		`<string>com.opendesk.marketplace-install</string>`,
		`<string>opendesk</string>`,
	} {
		if !strings.Contains(string(builderSource), fragment) {
			t.Fatalf("macOS bundle does not register Marketplace URL protocol fragment %q", fragment)
		}
	}
}
