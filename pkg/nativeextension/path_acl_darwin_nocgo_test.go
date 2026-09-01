//go:build darwin && !cgo

package nativeextension

import "testing"

func TestValidatePlatformACLWithoutCGOFailsClosed(t *testing.T) {
	if err := validatePlatformACL(t.TempDir()); err == nil {
		t.Fatal("ACL validation unexpectedly passed without cgo")
	}
}
