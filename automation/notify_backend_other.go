//go:build !darwin

package automation

import "github.com/gen2brain/beeep"

func defaultNotificationBackend(title, message string, sound bool) error {
	if sound {
		return beeep.Alert(title, message, "")
	}
	return beeep.Notify(title, message, "")
}
