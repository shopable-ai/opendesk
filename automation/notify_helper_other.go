//go:build !darwin

package automation

import (
	"encoding/json"
	"io"
)

func RunMacOSNotificationHelper(_ io.Reader, stdout, _ io.Writer) int {
	_ = json.NewEncoder(stdout).Encode(macOSNotificationHelperResponse{
		OK:    false,
		Error: "macOS notification helper is unavailable on this platform",
	})
	return 1
}
