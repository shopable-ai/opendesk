//go:build !darwin
// +build !darwin

package automation

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

func darwinTriggerAppleEventsPrompt(targetApp string) bool {
	_ = targetApp
	return false
}
