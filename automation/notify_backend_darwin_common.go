//go:build darwin

package automation

import (
	"errors"
	"fmt"
)

var errDarwinNativeNotificationUnavailable = fmt.Errorf("macOS native notification backend unavailable")

func defaultNotificationBackend(title, message string, sound bool) error {
	nativeErr := notifyDarwinNative(title, message, sound)
	if nativeErr == nil {
		return nil
	}

	if !errors.Is(nativeErr, errDarwinNativeNotificationUnavailable) {
		return fmt.Errorf("native macOS notification backend: %w", nativeErr)
	}

	// A plain CLI or Scheduler has no app identity. Re-enter the sibling
	// OpenDesk.app in a private, notification-only helper mode so Notification
	// Center sees the real OpenDesk bundle instead of ScriptEditor2.
	if err := notifyDarwinViaAppHelper(title, message, sound); err != nil {
		return fmt.Errorf("OpenDesk.app notification helper: %w", err)
	}
	return nil
}
