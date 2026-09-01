//go:build windows

package automation

import "testing"

func TestWindowsGlobalShortcutPlatformMapping(t *testing.T) {
	accelerator, err := NormalizeAccelerator("CommandOrControl + Shift + F24")
	if err != nil {
		t.Fatal(err)
	}
	platform, err := platformGlobalShortcutAccelerator(accelerator)
	if err != nil {
		t.Fatal(err)
	}
	if platform.Canonical != "Control+Shift+F24" {
		t.Fatalf("canonical = %q", platform.Canonical)
	}
	if platform.KeyCode != 0x87 { // VK_F24
		t.Fatalf("F24 key code = %#x", platform.KeyCode)
	}
	if platform.Modifiers != windowsModifierControl|windowsModifierShift {
		t.Fatalf("modifiers = %#x", platform.Modifiers)
	}
}
