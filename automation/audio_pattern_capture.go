package automation

import (
	"context"
	"time"
)

// AudioCaptureSourceType identifies the scope of a system-output capture.
// A system capture observes the complete output mix and therefore cannot
// attribute a match to an application. A process capture is an explicit,
// backend-verified process scope and must never silently fall back to the
// system mix.
type AudioCaptureSourceType string

const (
	AudioCaptureSourceSystem  AudioCaptureSourceType = "system"
	AudioCaptureSourceProcess AudioCaptureSourceType = "process"
)

type AudioCaptureSource struct {
	Type AudioCaptureSourceType
	PID  int64
}

// AudioCaptureCapabilities describes the private PCM source used by the
// public Audio sound-pattern API. It does not imply that raw recording or PCM
// delivery is exposed to JavaScript.
type AudioCaptureCapabilities struct {
	Supported        bool
	Platform         string
	Backend          string
	Verified         bool
	Permission       string
	SystemMix        bool
	Process          bool
	SelfExclusion    bool
	Notes            string
}

// AudioCaptureOptions requests canonical mono PCM. A backend must either
// deliver this exact format or reject Start; it must not silently substitute a
// different sample rate, channel layout, or source scope.
type AudioCaptureOptions struct {
	Source     AudioCaptureSource
	SampleRate int
	Channels   int
}

// AudioPCMChunk is Go-only capture data. Samples are interleaved Float32 PCM.
// The sound-pattern runtime currently requests one channel. Ownership of the
// Samples slice transfers to the sink; a backend must not mutate it after the
// PCM callback returns.
type AudioPCMChunk struct {
	CapturedAt time.Time
	SampleRate int
	Channels   int
	Samples    []float32
}

// AudioCaptureSink is safe to invoke from a native capture goroutine. Neither
// callback may retain or access Goja values. Backends should serialize PCM
// callbacks for a session; Error may race with the final PCM callback.
type AudioCaptureSink struct {
	PCM   func(AudioPCMChunk)
	Error func(error)
}

func (s AudioCaptureSink) Push(chunk AudioPCMChunk) {
	if s.PCM != nil {
		s.PCM(chunk)
	}
}

func (s AudioCaptureSink) Fail(err error) {
	if err != nil && s.Error != nil {
		s.Error(err)
	}
}

type AudioCaptureSessionInfo struct {
	ID             string
	Backend        string
	SourceScope    string
	SourceVerified bool
	PID            int64
	SampleRate     int
	Channels       int
	StartedAt      time.Time
}

// AudioCaptureSession is one execution-owned native stream. Stop is
// idempotent. Once Stop returns, the backend must not invoke the session sink
// again. Potentially blocking native shutdown belongs inside Stop and is
// always called away from the Goja owner loop.
type AudioCaptureSession interface {
	Info() AudioCaptureSessionInfo
	Stop(context.Context) error
}

// AudioCaptureBackend owns platform capture resources and their native
// workers. Start may block while permission and stream setup complete, so the
// runtime calls it from a tracked worker. Close initiates teardown for every
// remaining session; Wait joins all backend-owned workers.
type AudioCaptureBackend interface {
	Name() string
	Capabilities() AudioCaptureCapabilities
	Start(context.Context, AudioCaptureOptions, AudioCaptureSink) (AudioCaptureSession, error)
	Close() error
	Wait()
}

// AudioCaptureBackendFactory is an internal dependency seam. Runtime and
// execution tests inject a memory backend that feeds deterministic PCM; normal
// executions select the platform backend.
type AudioCaptureBackendFactory func() AudioCaptureBackend
