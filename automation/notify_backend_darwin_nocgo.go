//go:build darwin && !cgo

package automation

func notifyDarwinNative(string, string, bool) error {
	return errDarwinNativeNotificationUnavailable
}

func notificationInteractionDarwinListNative() ([]NotificationRecord, error) {
	return nil, errDarwinNativeNotificationUnavailable
}

func notificationInteractionDarwinDismissNative(string) (bool, error) {
	return false, errDarwinNativeNotificationUnavailable
}
