package automation

import (
	"context"
	"runtime"
)

type unsupportedAudioCaptureBackend struct {
	platform string
	reason   string
}

func newUnsupportedAudioCaptureBackend(platform, reason string) AudioCaptureBackend {
	if platform == "" {
		platform = runtime.GOOS
	}
	if reason == "" {
		reason = "system audio pattern capture is unavailable on this platform"
	}
	return &unsupportedAudioCaptureBackend{platform: platform, reason: reason}
}

func (b *unsupportedAudioCaptureBackend) Name() string { return "unavailable" }

func (b *unsupportedAudioCaptureBackend) Capabilities() AudioCaptureCapabilities {
	return AudioCaptureCapabilities{
		Supported: false,
		Platform:  b.platform,
		Backend:   b.Name(),
		Permission: "screenRecording",
		Notes:      b.reason,
	}
}

func (b *unsupportedAudioCaptureBackend) Start(context.Context, AudioCaptureOptions, AudioCaptureSink) (AudioCaptureSession, error) {
	return nil, audioOperationError("", AudioNotSupported, b.reason, nil)
}

func (b *unsupportedAudioCaptureBackend) Close() error { return nil }

func (b *unsupportedAudioCaptureBackend) Wait() {}
