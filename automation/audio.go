package automation

import (
	"errors"
	"fmt"
	"math"
	"runtime"
	"strings"

	"github.com/dop251/goja"
)

type AudioErrorCode string

const (
	AudioInvalidArgument   AudioErrorCode = "INVALID_ARGUMENT"
	AudioNotSupported      AudioErrorCode = "NOT_SUPPORTED"
	AudioDeviceUnavailable AudioErrorCode = "DEVICE_UNAVAILABLE"
	AudioBackendFailed     AudioErrorCode = "BACKEND_FAILED"
	AudioReadbackFailed    AudioErrorCode = "READBACK_FAILED"
)

// AudioError is projected to JavaScript as an Error with stable code and
// operation properties. Device names and UIDs are intentionally omitted from
// diagnostics because operators may give personal names to audio devices.
type AudioError struct {
	Code      AudioErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *AudioError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "audio operation failed"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *AudioError) Unwrap() error { return e.Cause }

type AudioDirection string

const (
	AudioDirectionInput  AudioDirection = "input"
	AudioDirectionOutput AudioDirection = "output"
)

// AudioDevice is backend-neutral metadata. The JavaScript projection below is
// explicit so Goja never leaks Go field names or platform-native pointers.
type AudioDevice struct {
	ID             uint32
	UID            string
	Name           string
	Manufacturer   string
	Transport      string
	InputChannels  int
	OutputChannels int
	Alive          bool
	DefaultInput   bool
	DefaultOutput  bool
	VolumeReadable bool
	VolumeWritable bool
	MuteReadable   bool
	MuteWritable   bool
}

type AudioBackendCapabilities struct {
	Platform        string
	Backend         string
	VolumeReadable  bool
	VolumeWritable  bool
	MuteReadable    bool
	MuteWritable    bool
	EnumerateInput  bool
	EnumerateOutput bool
	DefaultInput    bool
	DefaultOutput   bool
	Notes           string
}

type AudioBackend interface {
	Capabilities() AudioBackendCapabilities
	GetVolume() (float64, error)
	SetVolume(float64) (float64, error)
	IsMuted() (bool, error)
	SetMuted(bool) (bool, error)
	Devices(AudioDirection) ([]AudioDevice, error)
	DefaultDevice(AudioDirection) (*AudioDevice, error)
}

type AudioBackendFactory func() AudioBackend

// Audio is the system-control primitive. Existing Sound playback remains a
// separate compatibility namespace and is not reimplemented here.
type Audio struct {
	backend AudioBackend
}

func NewAudio() *Audio { return newAudioWithBackend(newDefaultAudioBackend()) }

func newAudioWithBackend(backend AudioBackend) *Audio {
	if backend == nil {
		backend = newUnsupportedAudioBackend(runtime.GOOS, "audio backend factory returned nil")
	}
	return &Audio{backend: backend}
}

func (a *Audio) GetVolume() (float64, error) {
	if a == nil || a.backend == nil {
		return 0, audioOperationError("Audio.getVolume", AudioNotSupported, "audio backend is unavailable", nil)
	}
	value, err := a.backend.GetVolume()
	if err != nil {
		return 0, wrapAudioOperationError("Audio.getVolume", err)
	}
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1 {
		return 0, audioOperationError("Audio.getVolume", AudioReadbackFailed, "backend returned a volume outside the scalar range", nil)
	}
	return value, nil
}

func (a *Audio) SetVolume(value float64) (float64, error) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1 {
		return 0, audioOperationError("Audio.setVolume", AudioInvalidArgument, "volume must be a finite scalar between 0 and 1 inclusive", nil)
	}
	if a == nil || a.backend == nil {
		return 0, audioOperationError("Audio.setVolume", AudioNotSupported, "audio backend is unavailable", nil)
	}
	readback, err := a.backend.SetVolume(value)
	if err != nil {
		return 0, wrapAudioOperationError("Audio.setVolume", err)
	}
	if math.IsNaN(readback) || math.IsInf(readback, 0) || readback < 0 || readback > 1 {
		return 0, audioOperationError("Audio.setVolume", AudioReadbackFailed, "backend returned an invalid volume readback", nil)
	}
	return readback, nil
}

func (a *Audio) IsMuted() (bool, error) {
	if a == nil || a.backend == nil {
		return false, audioOperationError("Audio.isMuted", AudioNotSupported, "audio backend is unavailable", nil)
	}
	muted, err := a.backend.IsMuted()
	if err != nil {
		return false, wrapAudioOperationError("Audio.isMuted", err)
	}
	return muted, nil
}

func (a *Audio) Mute() (bool, error)   { return a.setMuted("Audio.mute", true) }
func (a *Audio) Unmute() (bool, error) { return a.setMuted("Audio.unmute", false) }

func (a *Audio) ToggleMute() (bool, error) {
	muted, err := a.IsMuted()
	if err != nil {
		return false, wrapAudioOperationError("Audio.toggleMute", err)
	}
	return a.setMuted("Audio.toggleMute", !muted)
}

func (a *Audio) setMuted(operation string, muted bool) (bool, error) {
	if a == nil || a.backend == nil {
		return false, audioOperationError(operation, AudioNotSupported, "audio backend is unavailable", nil)
	}
	readback, err := a.backend.SetMuted(muted)
	if err != nil {
		return false, wrapAudioOperationError(operation, err)
	}
	if readback != muted {
		return false, audioOperationError(operation, AudioReadbackFailed, "mute state did not match the requested value", nil)
	}
	return readback, nil
}

func (a *Audio) GetOutputDevices() ([]map[string]interface{}, error) {
	return a.devices("Audio.getOutputDevices", AudioDirectionOutput)
}

func (a *Audio) GetInputDevices() ([]map[string]interface{}, error) {
	return a.devices("Audio.getInputDevices", AudioDirectionInput)
}

func (a *Audio) devices(operation string, direction AudioDirection) ([]map[string]interface{}, error) {
	if a == nil || a.backend == nil {
		return nil, audioOperationError(operation, AudioNotSupported, "audio backend is unavailable", nil)
	}
	devices, err := a.backend.Devices(direction)
	if err != nil {
		return nil, wrapAudioOperationError(operation, err)
	}
	result := make([]map[string]interface{}, 0, len(devices))
	for _, device := range devices {
		result = append(result, audioDevicePayload(device))
	}
	return result, nil
}

func (a *Audio) GetDefaultOutput() (map[string]interface{}, error) {
	return a.defaultDevice("Audio.getDefaultOutput", AudioDirectionOutput)
}

func (a *Audio) GetDefaultInput() (map[string]interface{}, error) {
	return a.defaultDevice("Audio.getDefaultInput", AudioDirectionInput)
}

func (a *Audio) defaultDevice(operation string, direction AudioDirection) (map[string]interface{}, error) {
	if a == nil || a.backend == nil {
		return nil, audioOperationError(operation, AudioNotSupported, "audio backend is unavailable", nil)
	}
	device, err := a.backend.DefaultDevice(direction)
	if err != nil {
		return nil, wrapAudioOperationError(operation, err)
	}
	if device == nil {
		return nil, nil
	}
	return audioDevicePayload(*device), nil
}

func (a *Audio) GetCapabilities() map[string]interface{} {
	capability := AudioBackendCapabilities{Platform: runtime.GOOS, Backend: "unavailable", Notes: "audio backend is unavailable"}
	if a != nil && a.backend != nil {
		capability = a.backend.Capabilities()
	}
	return map[string]interface{}{
		"schemaVersion": 1,
		"platform":      capability.Platform,
		"backend":       capability.Backend,
		"controls": map[string]interface{}{
			"volume": map[string]interface{}{
				"read": capability.VolumeReadable, "write": capability.VolumeWritable,
				"unit": "scalar", "minimum": 0.0, "maximum": 1.0,
			},
			"mute": map[string]interface{}{"read": capability.MuteReadable, "write": capability.MuteWritable},
		},
		"devices": map[string]interface{}{
			"input": capability.EnumerateInput, "output": capability.EnumerateOutput,
			"defaultInput": capability.DefaultInput, "defaultOutput": capability.DefaultOutput,
			"setDefaultOutput": false,
		},
		"capture": map[string]interface{}{
			"microphone": map[string]interface{}{
				"supported": false, "status": "notImplemented", "permission": "microphone",
				"reason": "capture requires an app-owned permission and recording lifecycle",
			},
			"systemAudio": map[string]interface{}{
				"supported": false, "status": "notImplemented", "permission": "screenRecording",
				"reason": "system audio capture belongs to the ScreenCaptureKit recording lifecycle",
			},
		},
		"playback": map[string]interface{}{
			"namespace": "Sound", "blocking": true, "nonBlocking": true, "controllable": true,
			"formats": []string{"mp3", "wav"},
		},
		"notes": capability.Notes,
	}
}

func audioDevicePayload(device AudioDevice) map[string]interface{} {
	return map[string]interface{}{
		"id": device.ID, "uid": device.UID, "name": device.Name, "manufacturer": device.Manufacturer,
		"transport": device.Transport, "inputChannels": device.InputChannels, "outputChannels": device.OutputChannels,
		"alive": device.Alive, "defaultInput": device.DefaultInput, "defaultOutput": device.DefaultOutput,
		"volume": map[string]interface{}{"read": device.VolumeReadable, "write": device.VolumeWritable},
		"mute":   map[string]interface{}{"read": device.MuteReadable, "write": device.MuteWritable},
	}
}

func registerAudio(runtimeValue *goja.Runtime, opts InitJSOptions) *Audio {
	factory := opts.AudioBackendFactory
	var backend AudioBackend
	if factory != nil {
		backend = factory()
	} else {
		backend = newDefaultAudioBackend()
	}
	audio := newAudioWithBackend(backend)
	object := runtimeValue.NewObject()
	set := func(name string, fn func(goja.FunctionCall) (interface{}, error)) {
		_ = object.Set(name, func(call goja.FunctionCall) goja.Value {
			result, err := fn(call)
			if err != nil {
				panic(audioJSError(runtimeValue, err))
			}
			if result == nil {
				return goja.Null()
			}
			return runtimeValue.ToValue(result)
		})
	}
	set("getVolume", func(goja.FunctionCall) (interface{}, error) { return audio.GetVolume() })
	set("setVolume", func(call goja.FunctionCall) (interface{}, error) {
		value, err := audioVolumeArgument(call.Argument(0))
		if err != nil {
			return nil, err
		}
		return audio.SetVolume(value)
	})
	set("isMuted", func(goja.FunctionCall) (interface{}, error) { return audio.IsMuted() })
	set("mute", func(goja.FunctionCall) (interface{}, error) { return audio.Mute() })
	set("unmute", func(goja.FunctionCall) (interface{}, error) { return audio.Unmute() })
	set("toggleMute", func(goja.FunctionCall) (interface{}, error) { return audio.ToggleMute() })
	set("getOutputDevices", func(goja.FunctionCall) (interface{}, error) { return audio.GetOutputDevices() })
	set("getInputDevices", func(goja.FunctionCall) (interface{}, error) { return audio.GetInputDevices() })
	set("getDefaultOutput", func(goja.FunctionCall) (interface{}, error) { return audio.GetDefaultOutput() })
	set("getDefaultInput", func(goja.FunctionCall) (interface{}, error) { return audio.GetDefaultInput() })
	set("getCapabilities", func(goja.FunctionCall) (interface{}, error) { return audio.GetCapabilities(), nil })
	_ = runtimeValue.Set("Audio", object)
	return audio
}

func audioVolumeArgument(value goja.Value) (float64, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return 0, audioOperationError("Audio.setVolume", AudioInvalidArgument, "volume must be a finite scalar between 0 and 1 inclusive", nil)
	}
	var result float64
	switch typed := value.Export().(type) {
	case int:
		result = float64(typed)
	case int64:
		result = float64(typed)
	case float64:
		result = typed
	default:
		return 0, audioOperationError("Audio.setVolume", AudioInvalidArgument, "volume must be a number", nil)
	}
	if math.IsNaN(result) || math.IsInf(result, 0) || result < 0 || result > 1 {
		return 0, audioOperationError("Audio.setVolume", AudioInvalidArgument, "volume must be a finite scalar between 0 and 1 inclusive", nil)
	}
	return result, nil
}

func audioOperationError(operation string, code AudioErrorCode, message string, cause error) error {
	return &AudioError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapAudioOperationError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var audioErr *AudioError
	if errors.As(err, &audioErr) {
		copy := *audioErr
		copy.Operation = operation
		return &copy
	}
	return audioOperationError(operation, AudioBackendFailed, "audio backend failed", err)
}

func audioJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	object := runtimeValue.NewGoError(err)
	var audioErr *AudioError
	if errors.As(err, &audioErr) {
		_ = object.Set("code", string(audioErr.Code))
		_ = object.Set("operation", audioErr.Operation)
	}
	return object
}

func formatAudioBackendStatus(status int32) string {
	return fmt.Sprintf("CoreAudio status %d", status)
}
