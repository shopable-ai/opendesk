//go:build darwin
// +build darwin

package automation

import (
	"fmt"
	"os/exec"
	"strings"
)

func platformClipboardWriteFallback(text string) error {
	cmd := exec.Command(
		"osascript",
		"-e", "on run argv",
		"-e", "set the clipboard to item 1 of argv",
		"-e", "end run",
		text,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("osascript clipboard write failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func platformClipboardReadFallback() (string, error) {
	cmd := exec.Command(
		"osascript",
		"-e", "the clipboard as text",
	)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("osascript clipboard read failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return trimAppleScriptOutput(string(out)), nil
}

func trimAppleScriptOutput(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	return strings.TrimSuffix(s, "\n")
}
