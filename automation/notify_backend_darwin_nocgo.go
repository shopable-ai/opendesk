//go:build darwin && !cgo

package automation

func notifyDarwinNative(string, string, bool) error {
	return errDarwinNativeNotificationUnavailable
}
