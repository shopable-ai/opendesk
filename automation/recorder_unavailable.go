//go:build !cgo || (!darwin && !windows && !linux)

package automation

import (
	"context"
	"runtime"
)

type unavailableRecorderBackend struct{}

func newRecorderInputBackend() RecorderInputBackend { return unavailableRecorderBackend{} }

func (unavailableRecorderBackend) Capabilities() RecorderBackendCapabilities {
	return RecorderBackendCapabilities{
		Supported: false, Platform: runtime.GOOS, Backend: "unavailable",
		Permission: "unsupported", CoordinateSpace: "unavailable",
		Limitations: []string{"Recorder capture is unavailable in this platform or CGO build; saved-file actions and basic generation remain available"},
	}
}
func (unavailableRecorderBackend) Start(context.Context, func(RecorderInputEvent), func(error)) error {
	return recorderError(RecorderCaptureUnavailable, "Recorder.start", "Recorder capture is unavailable in this build", nil)
}
func (unavailableRecorderBackend) Stop(context.Context) error { return nil }
func (unavailableRecorderBackend) Wait()                      {}
func recorderCaptureLeaseCount() int                          { return 0 }
