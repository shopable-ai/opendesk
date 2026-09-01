package automation

import (
	"errors"
	"math"
	"testing"

	"github.com/dop251/goja"
)

func TestAudioControlValidationAndReadback(t *testing.T) {
	backend := newMemoryAudioBackend()
	audio := newAudioWithBackend(backend)

	if value, err := audio.GetVolume(); err != nil || value != 0.5 {
		t.Fatalf("initial volume=%v err=%v", value, err)
	}
	if readback, err := audio.SetVolume(0.25); err != nil || readback != 0.25 || backend.volume != 0.25 {
		t.Fatalf("set volume readback=%v backend=%v err=%v", readback, backend.volume, err)
	}
	for _, value := range []float64{-0.01, 1.01, math.NaN(), math.Inf(1)} {
		if _, err := audio.SetVolume(value); audioErrorCode(err) != AudioInvalidArgument {
			t.Fatalf("SetVolume(%v) error=%v code=%q", value, err, audioErrorCode(err))
		}
	}

	if muted, err := audio.Mute(); err != nil || !muted || !backend.muted {
		t.Fatalf("mute readback=%v backend=%v err=%v", muted, backend.muted, err)
	}
	if muted, err := audio.ToggleMute(); err != nil || muted || backend.muted {
		t.Fatalf("toggle readback=%v backend=%v err=%v", muted, backend.muted, err)
	}
	if muted, err := audio.Unmute(); err != nil || muted || backend.muted {
		t.Fatalf("unmute readback=%v backend=%v err=%v", muted, backend.muted, err)
	}
}

func TestAudioDeviceProjectionAndCapabilities(t *testing.T) {
	backend := newMemoryAudioBackend()
	audio := newAudioWithBackend(backend)

	outputs, err := audio.GetOutputDevices()
	if err != nil || len(outputs) != 1 {
		t.Fatalf("output devices=%#v err=%v", outputs, err)
	}
	if outputs[0]["name"] != "Test Output" || outputs[0]["defaultOutput"] != true {
		t.Fatalf("output projection=%#v", outputs[0])
	}
	if _, leaked := outputs[0]["Name"]; leaked {
		t.Fatalf("Go field name leaked into JavaScript projection: %#v", outputs[0])
	}
	inputs, err := audio.GetInputDevices()
	if err != nil || len(inputs) != 1 || inputs[0]["defaultInput"] != true {
		t.Fatalf("input devices=%#v err=%v", inputs, err)
	}
	defaultOutput, err := audio.GetDefaultOutput()
	if err != nil || defaultOutput["id"] != uint32(10) {
		t.Fatalf("default output=%#v err=%v", defaultOutput, err)
	}
	defaultInput, err := audio.GetDefaultInput()
	if err != nil || defaultInput["id"] != uint32(20) {
		t.Fatalf("default input=%#v err=%v", defaultInput, err)
	}
	backend.devices = nil
	missingDefault, err := audio.GetDefaultOutput()
	if err != nil || missingDefault != nil {
		t.Fatalf("missing default output=%#v err=%v", missingDefault, err)
	}

	capabilities := audio.GetCapabilities()
	if capabilities["backend"] != "memory" || capabilities["platform"] != "test" {
		t.Fatalf("capabilities=%#v", capabilities)
	}
	controls := capabilities["controls"].(map[string]interface{})
	volume := controls["volume"].(map[string]interface{})
	if volume["unit"] != "scalar" || volume["minimum"] != 0.0 || volume["maximum"] != 1.0 {
		t.Fatalf("volume capability=%#v", volume)
	}
	capture := capabilities["capture"].(map[string]interface{})
	microphone := capture["microphone"].(map[string]interface{})
	if microphone["supported"] != false || microphone["status"] != "notImplemented" {
		t.Fatalf("microphone capability=%#v", microphone)
	}
}

func TestAudioJSBindingUsesStructuredErrorsAndLowerCamelFields(t *testing.T) {
	runtimeValue := goja.New()
	backend := newMemoryAudioBackend()
	registerAudio(runtimeValue, InitJSOptions{AudioBackendFactory: func() AudioBackend { return backend }})

	value, err := runtimeValue.RunString(`
		(() => {
			const methods = ['getVolume', 'setVolume', 'isMuted', 'mute', 'unmute', 'toggleMute',
				'getOutputDevices', 'getInputDevices', 'getDefaultOutput', 'getDefaultInput', 'getCapabilities'];
			if (!methods.every(name => typeof Audio[name] === 'function')) throw new Error('missing method');
			const device = Audio.getDefaultOutput();
			if (device.name !== 'Test Output' || device.Name !== undefined) throw new Error('invalid device projection');
			let invalid;
			try { Audio.setVolume('50%'); } catch (error) { invalid = { code: error.code, operation: error.operation }; }
			return { invalid, readback: Audio.setVolume(0.4), muted: Audio.mute(), backend: Audio.getCapabilities().backend };
		})()
	`)
	if err != nil {
		t.Fatal(err)
	}
	result := value.Export().(map[string]interface{})
	invalid := result["invalid"].(map[string]interface{})
	if invalid["code"] != string(AudioInvalidArgument) || invalid["operation"] != "Audio.setVolume" {
		t.Fatalf("structured error=%#v", invalid)
	}
	if result["readback"] != 0.4 || result["muted"] != true || result["backend"] != "memory" {
		t.Fatalf("binding result=%#v", result)
	}
}

func TestAudioBackendErrorsPreserveStableCodes(t *testing.T) {
	backend := newMemoryAudioBackend()
	backend.err = audioOperationError("", AudioNotSupported, "device has no software volume control", nil)
	audio := newAudioWithBackend(backend)
	if _, err := audio.GetVolume(); audioErrorCode(err) != AudioNotSupported {
		t.Fatalf("get volume error=%v code=%q", err, audioErrorCode(err))
	}
	if _, err := audio.GetOutputDevices(); audioErrorCode(err) != AudioNotSupported {
		t.Fatalf("devices error=%v code=%q", err, audioErrorCode(err))
	}
}

func audioErrorCode(err error) AudioErrorCode {
	var audioErr *AudioError
	if errors.As(err, &audioErr) {
		return audioErr.Code
	}
	return ""
}

type memoryAudioBackend struct {
	volume  float64
	muted   bool
	err     error
	devices []AudioDevice
}

func newMemoryAudioBackend() *memoryAudioBackend {
	return &memoryAudioBackend{
		volume: 0.5,
		devices: []AudioDevice{
			{ID: 10, UID: "output-10", Name: "Test Output", Manufacturer: "OpenDesk", Transport: "test", OutputChannels: 2, Alive: true, DefaultOutput: true, VolumeReadable: true, VolumeWritable: true, MuteReadable: true, MuteWritable: true},
			{ID: 20, UID: "input-20", Name: "Test Input", Manufacturer: "OpenDesk", Transport: "test", InputChannels: 1, Alive: true, DefaultInput: true},
		},
	}
}

func (b *memoryAudioBackend) Capabilities() AudioBackendCapabilities {
	return AudioBackendCapabilities{
		Platform: "test", Backend: "memory", VolumeReadable: true, VolumeWritable: true,
		MuteReadable: true, MuteWritable: true, EnumerateInput: true, EnumerateOutput: true,
		DefaultInput: true, DefaultOutput: true, Notes: "deterministic test backend",
	}
}

func (b *memoryAudioBackend) GetVolume() (float64, error) {
	if b.err != nil {
		return 0, b.err
	}
	return b.volume, nil
}

func (b *memoryAudioBackend) SetVolume(value float64) (float64, error) {
	if b.err != nil {
		return 0, b.err
	}
	b.volume = value
	return b.volume, nil
}

func (b *memoryAudioBackend) IsMuted() (bool, error) {
	if b.err != nil {
		return false, b.err
	}
	return b.muted, nil
}

func (b *memoryAudioBackend) SetMuted(muted bool) (bool, error) {
	if b.err != nil {
		return false, b.err
	}
	b.muted = muted
	return b.muted, nil
}

func (b *memoryAudioBackend) Devices(direction AudioDirection) ([]AudioDevice, error) {
	if b.err != nil {
		return nil, b.err
	}
	result := []AudioDevice{}
	for _, device := range b.devices {
		if direction == AudioDirectionInput && device.InputChannels > 0 {
			result = append(result, device)
		}
		if direction == AudioDirectionOutput && device.OutputChannels > 0 {
			result = append(result, device)
		}
	}
	return result, nil
}

func (b *memoryAudioBackend) DefaultDevice(direction AudioDirection) (*AudioDevice, error) {
	if b.err != nil {
		return nil, b.err
	}
	for _, device := range b.devices {
		if (direction == AudioDirectionInput && device.DefaultInput) || (direction == AudioDirectionOutput && device.DefaultOutput) {
			copy := device
			return &copy, nil
		}
	}
	return nil, nil
}
