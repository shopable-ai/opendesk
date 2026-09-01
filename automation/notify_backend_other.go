//go:build !darwin

package automation

import "github.com/gen2brain/beeep"

func defaultNotificationBackend(title, message string, sound bool) error {
	icon := notificationIconPath()
	if sound {
		return beeep.Alert(title, message, icon)
	}
	return beeep.Notify(title, message, icon)
}
