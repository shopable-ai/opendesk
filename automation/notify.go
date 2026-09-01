package automation

import (
	"fmt"
	"time"
)

// NotifyOptions defines the options for system notifications
type NotifyOptions struct {
	Title   string `json:"title,omitempty"`
	Message string `json:"message"`
	Sound   bool   `json:"sound,omitempty"`
	// Timeout is retained for JavaScript API compatibility. The cross-platform
	// notification backends do not expose a configurable display duration, so
	// it is intentionally not used when dispatching a notification.
	Timeout time.Duration `json:"timeout,omitempty"`
}

// notificationBackend is kept behind the public bridge so platform delivery
// can be tested without making a test depend on the user's Notification
// Center state. A nil error means that the host submitted the request to the
// platform backend; it is not a proof that a banner was rendered.
type notificationBackend func(title, message string, sound bool) error

var notifyBackend notificationBackend = defaultNotificationBackend

// Notify sends a system notification
func Notify(options *NotifyOptions) error {
	if options == nil {
		return fmt.Errorf("notify options cannot be nil")
	}

	normalized := *options
	if normalized.Title == "" {
		normalized.Title = "OpenDesk Notification"
	}

	err := notifyBackend(normalized.Title, normalized.Message, normalized.Sound)
	if err != nil {
		return fmt.Errorf("notification failed: %w", err)
	}

	return nil
}
