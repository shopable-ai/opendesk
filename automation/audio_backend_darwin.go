//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework CoreAudio -framework AudioToolbox -framework Foundation
#include <stdint.h>
#include <stdlib.h>

#define OPENDESK_AUDIO_NO_DEFAULT -71000
#define OPENDESK_AUDIO_UNSUPPORTED -71001
#define OPENDESK_AUDIO_NOT_SETTABLE -71002
#define OPENDESK_AUDIO_SERIALIZATION_FAILED -71003

int32_t opendesk_audio_default_device(int input, uint32_t *device_id);
int32_t opendesk_audio_get_volume(double *value);
int32_t opendesk_audio_set_volume(double value, double *readback);
int32_t opendesk_audio_get_mute(int *muted);
int32_t opendesk_audio_set_mute(int muted, int *readback);
int32_t opendesk_audio_devices_json(char **json);
int32_t opendesk_audio_default_output_capabilities(int *volume_read, int *volume_write, int *mute_read, int *mute_write);
*/
import "C"

import (
	"encoding/json"
	"errors"
	"fmt"
	"unsafe"
)

type darwinAudioBackend struct{}

func newDefaultAudioBackend() AudioBackend { return &darwinAudioBackend{} }

func (b *darwinAudioBackend) Capabilities() AudioBackendCapabilities {
	capability := AudioBackendCapabilities{
		Platform: "darwin", Backend: "coreaudio", EnumerateInput: true, EnumerateOutput: true,
		Notes: "CoreAudio HAL; volume is the default output device virtual-main scalar and may be quantized by hardware",
	}
	var volumeRead, volumeWrite, muteRead, muteWrite C.int
	if status := int32(C.opendesk_audio_default_output_capabilities(&volumeRead, &volumeWrite, &muteRead, &muteWrite)); status == 0 {
		capability.VolumeReadable = volumeRead != 0
		capability.VolumeWritable = volumeWrite != 0
		capability.MuteReadable = muteRead != 0
		capability.MuteWritable = muteWrite != 0
	}
	if device, err := b.defaultDeviceID(AudioDirectionInput); err == nil && device != 0 {
		capability.DefaultInput = true
	}
	if device, err := b.defaultDeviceID(AudioDirectionOutput); err == nil && device != 0 {
		capability.DefaultOutput = true
	}
	return capability
}

func (b *darwinAudioBackend) GetVolume() (float64, error) {
	var value C.double
	if status := int32(C.opendesk_audio_get_volume(&value)); status != 0 {
		return 0, darwinAudioStatusError(status, "default output volume is unavailable")
	}
	return float64(value), nil
}

func (b *darwinAudioBackend) SetVolume(value float64) (float64, error) {
	var readback C.double
	if status := int32(C.opendesk_audio_set_volume(C.double(value), &readback)); status != 0 {
		return 0, darwinAudioStatusError(status, "default output volume could not be changed")
	}
	return float64(readback), nil
}

func (b *darwinAudioBackend) IsMuted() (bool, error) {
	var muted C.int
	if status := int32(C.opendesk_audio_get_mute(&muted)); status != 0 {
		return false, darwinAudioStatusError(status, "default output mute state is unavailable")
	}
	return muted != 0, nil
}

func (b *darwinAudioBackend) SetMuted(muted bool) (bool, error) {
	requested := C.int(0)
	if muted {
		requested = 1
	}
	var readback C.int
	if status := int32(C.opendesk_audio_set_mute(requested, &readback)); status != 0 {
		return false, darwinAudioStatusError(status, "default output mute state could not be changed")
	}
	return readback != 0, nil
}

func (b *darwinAudioBackend) Devices(direction AudioDirection) ([]AudioDevice, error) {
	devices, err := b.allDevices()
	if err != nil {
		return nil, err
	}
	result := make([]AudioDevice, 0, len(devices))
	for _, device := range devices {
		if direction == AudioDirectionInput && device.InputChannels > 0 {
			result = append(result, device)
		}
		if direction == AudioDirectionOutput && device.OutputChannels > 0 {
			result = append(result, device)
		}
	}
	return result, nil
}

func (b *darwinAudioBackend) DefaultDevice(direction AudioDirection) (*AudioDevice, error) {
	id, err := b.defaultDeviceID(direction)
	if err != nil {
		var audioErr *AudioError
		if errors.As(err, &audioErr) && audioErr.Code == AudioDeviceUnavailable {
			return nil, nil
		}
		return nil, err
	}
	devices, err := b.allDevices()
	if err != nil {
		return nil, err
	}
	for _, device := range devices {
		if device.ID == id {
			copy := device
			return &copy, nil
		}
	}
	return nil, audioOperationError("", AudioDeviceUnavailable, "CoreAudio default device is not present in the current device list", nil)
}

func (b *darwinAudioBackend) defaultDeviceID(direction AudioDirection) (uint32, error) {
	input := C.int(0)
	if direction == AudioDirectionInput {
		input = 1
	}
	var id C.uint32_t
	if status := int32(C.opendesk_audio_default_device(input, &id)); status != 0 {
		return 0, darwinAudioStatusError(status, "CoreAudio default device is unavailable")
	}
	return uint32(id), nil
}

func (b *darwinAudioBackend) allDevices() ([]AudioDevice, error) {
	var raw *C.char
	if status := int32(C.opendesk_audio_devices_json(&raw)); status != 0 {
		return nil, darwinAudioStatusError(status, "CoreAudio device enumeration failed")
	}
	if raw == nil {
		return nil, audioOperationError("", AudioBackendFailed, "CoreAudio device enumeration returned no data", nil)
	}
	defer C.free(unsafe.Pointer(raw))
	var devices []struct {
		ID             uint32 `json:"id"`
		UID            string `json:"uid"`
		Name           string `json:"name"`
		Manufacturer   string `json:"manufacturer"`
		Transport      string `json:"transport"`
		InputChannels  int    `json:"inputChannels"`
		OutputChannels int    `json:"outputChannels"`
		Alive          bool   `json:"alive"`
		DefaultInput   bool   `json:"defaultInput"`
		DefaultOutput  bool   `json:"defaultOutput"`
		VolumeRead     bool   `json:"volumeRead"`
		VolumeWrite    bool   `json:"volumeWrite"`
		MuteRead       bool   `json:"muteRead"`
		MuteWrite      bool   `json:"muteWrite"`
	}
	if err := json.Unmarshal([]byte(C.GoString(raw)), &devices); err != nil {
		return nil, audioOperationError("", AudioBackendFailed, "CoreAudio device metadata could not be decoded", err)
	}
	result := make([]AudioDevice, 0, len(devices))
	for _, device := range devices {
		result = append(result, AudioDevice{
			ID: device.ID, UID: device.UID, Name: device.Name, Manufacturer: device.Manufacturer,
			Transport: device.Transport, InputChannels: device.InputChannels, OutputChannels: device.OutputChannels,
			Alive: device.Alive, DefaultInput: device.DefaultInput, DefaultOutput: device.DefaultOutput,
			VolumeReadable: device.VolumeRead, VolumeWritable: device.VolumeWrite,
			MuteReadable: device.MuteRead, MuteWritable: device.MuteWrite,
		})
	}
	return result, nil
}

func darwinAudioStatusError(status int32, message string) error {
	switch status {
	case C.OPENDESK_AUDIO_NO_DEFAULT:
		return audioOperationError("", AudioDeviceUnavailable, message, nil)
	case C.OPENDESK_AUDIO_UNSUPPORTED, C.OPENDESK_AUDIO_NOT_SETTABLE:
		return audioOperationError("", AudioNotSupported, message, nil)
	default:
		return audioOperationError("", AudioBackendFailed, message, fmt.Errorf("%s", formatAudioBackendStatus(status)))
	}
}
