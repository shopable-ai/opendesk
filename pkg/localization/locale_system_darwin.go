//go:build darwin

package localization

import (
	"fmt"
	"os/exec"
	"strings"
)

func detectSystemLocale() (string, error) {
	output, err := exec.Command("/usr/bin/defaults", "read", "-g", "AppleLocale").Output()
	if err != nil {
		return "", fmt.Errorf("read macOS AppleLocale: %w", err)
	}
	locale := strings.TrimSpace(string(output))
	if locale == "" {
		return "", fmt.Errorf("macOS AppleLocale is empty")
	}
	return locale, nil
}
