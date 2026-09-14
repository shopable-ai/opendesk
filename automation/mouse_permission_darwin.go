//go:build darwin
// +build darwin

package automation

import "errors"

func ensureMouseInputPermission() error {
	if darwinAccessibilityStatus() {
		return nil
	}
	return errors.New("PERMISSION_DENIED: macOS Accessibility permission is not granted; allow OpenDesk in System Settings > Privacy & Security > Accessibility")
}
