//go:build darwin && cgo

package automation

import (
	"os"
	"testing"
)

func TestDarwinAudioDeviceEnumerationMetadataDecodes(t *testing.T) {
	if os.Getenv("OPENDESK_LIVE_AUDIO_TEST") != "1" {
		t.Skip("set OPENDESK_LIVE_AUDIO_TEST=1 to enumerate real CoreAudio devices")
	}
	backend := &darwinAudioBackend{}
	for _, direction := range []AudioDirection{AudioDirectionInput, AudioDirectionOutput} {
		devices, err := backend.Devices(direction)
		if err != nil {
			t.Fatalf("enumerate %s devices: %v", direction, err)
		}
		for _, device := range devices {
			if device.ID == 0 || !device.Alive {
				t.Fatalf("invalid %s device metadata: %#v", direction, device)
			}
			if direction == AudioDirectionInput && device.InputChannels == 0 {
				t.Fatalf("input device has no input channels: %#v", device)
			}
			if direction == AudioDirectionOutput && device.OutputChannels == 0 {
				t.Fatalf("output device has no output channels: %#v", device)
			}
		}
	}
}
