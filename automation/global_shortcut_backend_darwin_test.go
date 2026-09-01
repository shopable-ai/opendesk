//go:build darwin && cgo

package automation

import "testing"

func TestDarwinGlobalShortcutPlatformMapping(t *testing.T) {
	accelerator, err := NormalizeAccelerator("CmdOrCtrl + Shift + F24")
	if err != nil {
		t.Fatal(err)
	}
	platform, err := platformGlobalShortcutAccelerator(accelerator)
	if err != nil {
		t.Fatal(err)
	}
	if platform.Canonical != "Command+Shift+F24" {
		t.Fatalf("canonical = %q", platform.Canonical)
	}
	if platform.KeyCode != darwinExtendedFunctionKeyBase+3 {
		t.Fatalf("F24 key code = %#x", platform.KeyCode)
	}
	if platform.Modifiers&0xffff != darwinModifierCommand|darwinModifierShift {
		t.Fatalf("dispatch modifiers = %#x", platform.Modifiers&0xffff)
	}
}
