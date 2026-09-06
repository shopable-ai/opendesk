//go:build !darwin

package automation

import "runtime"

func newDefaultAudioCaptureBackend() AudioCaptureBackend {
	return newUnsupportedAudioCaptureBackend(runtime.GOOS, "system audio pattern capture is unavailable on this platform")
}
