package main

import (
	"testing"

	"opendesk/automation"
)

func TestMacOSNotificationHelperModeIsExactAndPrivate(t *testing.T) {
	if !automation.MacOSNotificationHelperRequested([]string{"--opendesk-internal-macos-notify"}) {
		t.Fatal("exact helper argument was not recognized")
	}
	for _, args := range [][]string{
		nil,
		{"--opendesk-internal-macos-notify", "extra"},
		{"--opendesk-internal-macos-notify=true"},
	} {
		if automation.MacOSNotificationHelperRequested(args) {
			t.Fatalf("unexpected helper match for %q", args)
		}
	}
}
