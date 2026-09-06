//go:build !darwin && !windows

package automation

func newDefaultAccessibilityBackend() AccessibilityBackend {
	return &unsupportedAccessibilityBackend{reason: "native accessibility is not implemented on this platform"}
}
