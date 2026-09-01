package automation

import "runtime"

type unsupportedAudioBackend struct {
	platform string
	reason   string
}

func newUnsupportedAudioBackend(platform, reason string) AudioBackend {
	if platform == "" {
		platform = runtime.GOOS
	}
	return &unsupportedAudioBackend{platform: platform, reason: reason}
}

func (b *unsupportedAudioBackend) Capabilities() AudioBackendCapabilities {
	return AudioBackendCapabilities{Platform: b.platform, Backend: "unavailable", Notes: b.reason}
}

func (b *unsupportedAudioBackend) unsupported() error {
	return audioOperationError("", AudioNotSupported, b.reason, nil)
}

func (b *unsupportedAudioBackend) GetVolume() (float64, error)        { return 0, b.unsupported() }
func (b *unsupportedAudioBackend) SetVolume(float64) (float64, error) { return 0, b.unsupported() }
func (b *unsupportedAudioBackend) IsMuted() (bool, error)             { return false, b.unsupported() }
func (b *unsupportedAudioBackend) SetMuted(bool) (bool, error)        { return false, b.unsupported() }
func (b *unsupportedAudioBackend) Devices(AudioDirection) ([]AudioDevice, error) {
	return nil, b.unsupported()
}
func (b *unsupportedAudioBackend) DefaultDevice(AudioDirection) (*AudioDevice, error) {
	return nil, b.unsupported()
}
