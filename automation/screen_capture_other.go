//go:build !darwin

package automation

func newDefaultScreenCaptureBackend() ScreenCaptureBackend {
	return newUnsupportedScreenCaptureBackend("screen selector and recording are currently available only on macOS")
}
