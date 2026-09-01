//go:build darwin && cgo

package automation

import "strings"

// Reuse the existing CoreGraphics PID-specific Window backend. A full
// System Events enumeration is too slow and race-prone during cold app launch.
func appHasWindowPlatform(pid int64) (bool, error) {
	_, err := getMacWindowForPIDCoreGraphics(int(pid))
	if err == nil {
		return true, nil
	}
	if strings.Contains(err.Error(), "has no on-screen window") || strings.Contains(err.Error(), "has no identifiable window") {
		return false, nil
	}
	return false, err
}
