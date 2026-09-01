//go:build darwin

package automation

import (
	"context"
	"errors"
	"fmt"
)

type darwinNotificationInteractionBackend struct{}

func newDefaultNotificationInteractionBackend() NotificationInteractionBackend {
	return &darwinNotificationInteractionBackend{}
}

func (b *darwinNotificationInteractionBackend) Capabilities() NotificationInteractionCapabilities {
	return NotificationInteractionCapabilities{
		SchemaVersion: 1,
		Platform:      "darwin",
		Backend:       "macos-usernotifications",
		Scope:         "own-app",
		List: NotificationOperationCapability{
			Supported: true, Verified: false,
			Notes: "lists only notifications delivered by the OpenDesk app identity; content is redacted unless explicitly requested",
		},
		WaitFor: NotificationOperationCapability{
			Supported: true, Verified: false,
			Notes: "polls the own-app delivered-notification model with timeout and duplicate-safe request identifiers",
		},
		Dismiss: NotificationOperationCapability{
			Supported: true, Verified: false,
			Notes: "removes one own-app delivered notification by identifier and verifies it is absent",
		},
		Activate: NotificationOperationCapability{
			Supported: false, Verified: false,
			Notes: "UserNotifications reports user-selected actions to the owning app but has no public API to simulate activation",
		},
		Events: NotificationOperationCapability{
			Supported: false, Verified: false,
			Notes: "Events does not advertise notification.changed; waitFor uses an explicit bounded poll",
		},
	}
}

func (b *darwinNotificationInteractionBackend) List(ctx context.Context) ([]NotificationRecord, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	records, err := notificationInteractionDarwinListNative()
	if err == nil {
		return records, nil
	}
	if !errors.Is(err, errDarwinNativeNotificationUnavailable) {
		return nil, fmt.Errorf("native macOS notification list: %w", err)
	}
	return listDarwinNotificationsViaAppHelper(ctx)
}

func (b *darwinNotificationInteractionBackend) Dismiss(ctx context.Context, id string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	dismissed, err := notificationInteractionDarwinDismissNative(id)
	if err == nil {
		return dismissed, nil
	}
	if !errors.Is(err, errDarwinNativeNotificationUnavailable) {
		return false, fmt.Errorf("native macOS notification dismiss: %w", err)
	}
	dismissed, err = dismissDarwinNotificationViaAppHelper(ctx, id)
	if err != nil {
		return false, err
	}
	return dismissed, nil
}
