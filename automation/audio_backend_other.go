//go:build !darwin

package automation

import "runtime"

func newDefaultAudioBackend() AudioBackend {
	return newUnsupportedAudioBackend(runtime.GOOS, "system audio controls are not implemented on this platform")
}
