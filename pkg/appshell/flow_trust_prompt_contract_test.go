package appshell

import (
	"os"
	"strings"
	"testing"
)

// The AppKit trust prompt lives in Objective-C and cannot be exercised by the
// normal headless Go test matrix. Keep a small source contract here so product
// changes cannot silently regress to two competing install actions or broaden
// publisher trust by default. Trust-store behavior itself is covered by the
// flowinstall tests.
func TestDarwinFlowTrustPromptSourceContract(t *testing.T) {
	data, err := os.ReadFile("native_darwin.m")
	if err != nil {
		t.Fatalf("read native_darwin.m: %v", err)
	}
	source := string(data)
	start := strings.Index(source, "int ODAppShellConfirmFlowTrust(")
	end := strings.Index(source, "int ODAppShellConfirmMarketplaceInstall(")
	if start < 0 || end < 0 || end <= start {
		t.Fatal("could not isolate the native Flow trust prompt")
	}
	flowTrustPrompt := source[start:end]

	required := []string{
		`alert.messageText = [NSString stringWithFormat:@"Install “%@”?", flowName];`,
		`✓ Package signature is valid.`,
		`Publisher identity is not verified by OpenDesk.`,
		`By default, trust is limited to this Flow. Installing does not run the Flow.`,
		`@"Trust this publisher for future Flows"`,
		`trustPublisher.state = NSControlStateValueOff;`,
		`@"Security Details…"`,
		`[alert addButtonWithTitle:@"Install"];`,
		`[alert addButtonWithTitle:@"Cancel"];`,
		`*decision = trustPublisher.state == NSControlStateValueOn ? 2 : 1;`,
	}
	for _, fragment := range required {
		if !strings.Contains(flowTrustPrompt, fragment) {
			t.Fatalf("native Flow trust prompt is missing contract fragment %q", fragment)
		}
	}

	forbidden := []string{
		`@"Install This Flow"`,
		`@"Trust Publisher & Install"`,
		`@"Unverified publisher: %@"`,
	}
	for _, fragment := range forbidden {
		if strings.Contains(flowTrustPrompt, fragment) {
			t.Fatalf("native Flow trust prompt reintroduced ambiguous UI %q", fragment)
		}
	}

	if count := strings.Count(flowTrustPrompt, `[alert addButtonWithTitle:@"Install"]`); count != 1 {
		t.Fatalf("native Flow trust prompt must expose exactly one Install action, got %d", count)
	}
}
