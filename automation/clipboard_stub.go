//go:build !darwin
// +build !darwin

package automation

import "fmt"

func platformClipboardWriteFallback(text string) error {
	_ = text
	return fmt.Errorf("platform clipboard fallback is unsupported on this OS")
}

func platformClipboardReadFallback() (string, error) {
	return "", fmt.Errorf("platform clipboard fallback is unsupported on this OS")
}
