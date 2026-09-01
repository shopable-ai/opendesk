//go:build linux

package nativeextension

import "testing"

func TestLinuxAbsoluteXDGDataHomeDoesNotRequireHome(t *testing.T) {
	t.Setenv("HOME", "")
	t.Setenv("XDG_DATA_HOME", "/srv/opendesk-user-data")
	root, err := currentUserDiscoveryRoot("")
	if err != nil {
		t.Fatal(err)
	}
	if root != "/srv/opendesk-user-data/OpenDesk/NativeExtensions" {
		t.Fatalf("current-user root = %q", root)
	}
}
