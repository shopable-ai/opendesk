//go:build darwin && !cgo

package automation

func newDefaultAudioBackend() AudioBackend {
	return newUnsupportedAudioBackend("darwin", "CoreAudio controls require a CGO-enabled build")
}
