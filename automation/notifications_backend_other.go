//go:build !darwin

package automation

import "context"

type unsupportedNotificationInteractionBackend struct{}

func newDefaultNotificationInteractionBackend() NotificationInteractionBackend {
	return &unsupportedNotificationInteractionBackend{}
}

func (b *unsupportedNotificationInteractionBackend) Capabilities() NotificationInteractionCapabilities {
	notes := "no stable OpenDesk notification-interaction backend is installed"
	return unsupportedNotificationCapabilities(notes)
}

func (b *unsupportedNotificationInteractionBackend) List(context.Context) ([]NotificationRecord, error) {
	return nil, notificationOperationError("", NotificationNotSupported, "listing notifications is unavailable on this platform/backend", nil)
}

func (b *unsupportedNotificationInteractionBackend) Dismiss(context.Context, string) (bool, error) {
	return false, notificationOperationError("", NotificationNotSupported, "dismissing notifications is unavailable on this platform/backend", nil)
}
