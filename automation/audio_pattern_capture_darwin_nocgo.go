//go:build darwin && !cgo

package automation

func newDefaultAudioCaptureBackend() AudioCaptureBackend {
	return newUnsupportedAudioCaptureBackend("darwin", "system audio pattern capture requires a CGO-enabled build")
}
