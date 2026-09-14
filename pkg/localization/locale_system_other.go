//go:build !darwin && !windows

package localization

import (
	"fmt"
	"os"
	"strings"
)

func detectSystemLocale() (string, error) {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" && value != "C" && value != "POSIX" {
			return value, nil
		}
	}
	return "", fmt.Errorf("no supported locale environment variable is set")
}
