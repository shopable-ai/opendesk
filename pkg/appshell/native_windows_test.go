//go:build windows

package appshell

import (
	"testing"

	"github.com/lxn/win"
)

func TestWindowsTrayEventCodeSupportsVersion4Packing(t *testing.T) {
	packed := uintptr(appShellIconID)<<16 | uintptr(win.NIN_SELECT)
	if got := windowsTrayEventCode(packed); got != win.NIN_SELECT {
		t.Fatalf("event code=%#x want %#x", got, win.NIN_SELECT)
	}
	if got := windowsTrayEventCode(uintptr(win.WM_RBUTTONUP)); got != win.WM_RBUTTONUP {
		t.Fatalf("legacy event code=%#x want %#x", got, win.WM_RBUTTONUP)
	}
}

func TestWindowsNativeHostMapsReusablePrimaryActionToItemIdentity(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	manifest.Tray.PrimaryAction = "sync.pause"
	hostValue, err := newPlatformNativeHost(&Package{Manifest: manifest})
	if err != nil {
		t.Fatal(err)
	}
	host := hostValue.(*windowsNativeHost)
	if host.primaryItemID != "sync.pause" {
		t.Fatalf("primary item id=%q", host.primaryItemID)
	}
	state, ok := host.menuState["sync.pause"]
	if !ok || state.Enabled == nil || !*state.Enabled || state.Visible == nil || !*state.Visible {
		t.Fatalf("unexpected menu state: %+v", state)
	}
}
