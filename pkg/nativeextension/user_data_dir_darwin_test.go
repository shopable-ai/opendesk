//go:build darwin

package nativeextension

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestCurrentUserDiscoveryRootUsesAbsoluteHome(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("HOME", home)

	got, err := currentUserDiscoveryRoot("")
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, "Library", "Application Support", "OpenDesk", "NativeExtensions")
	if got != want {
		t.Fatalf("current-user root = %q, want %q", got, want)
	}
}

func TestCurrentUserDiscoveryRootRejectsInvalidHome(t *testing.T) {
	for _, home := range []string{"", "relative/home"} {
		t.Run(strings.ReplaceAll(home, "/", "_"), func(t *testing.T) {
			t.Setenv("HOME", home)
			if _, err := currentUserDiscoveryRoot(""); err == nil {
				t.Fatalf("invalid HOME %q was accepted", home)
			}
		})
	}
}
