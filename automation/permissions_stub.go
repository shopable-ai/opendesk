//go:build !darwin
// +build !darwin

package automation

import "runtime"

func darwinAccessibilityStatus() bool {
	return false
}

func darwinRequestAccessibilityPrompt() bool {
	return false
}

func darwinScreenCaptureStatus() bool {
	return false
}

func darwinRequestScreenCapturePrompt() bool {
	return false
}

func darwinInputMonitoringStatus() string {
	return "unsupported"
}

func darwinRequestInputMonitoringPrompt() bool {
	return false
}

func darwinTriggerAppleEventsPrompt(targetApp string) bool {
	_ = targetApp
	return false
}

func TriggerMacAutomationPermissionHelper(targetApp string) bool {
	_ = targetApp
	return false
}

func newPermissionProvider() permissionProvider {
	if runtime.GOOS == "windows" {
		return windowsPermissionProvider{}
	}
	return unsupportedPermissionProvider{platform: runtime.GOOS}
}
