//go:build darwin && !cgo

package automation

func newDefaultAccessibilityBackend() AccessibilityBackend {
	return &unsupportedAccessibilityBackend{reason: "macOS Accessibility requires a cgo-enabled build; AppleScript fallback is not used"}
}
