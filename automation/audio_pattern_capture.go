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
	Supported             bool
	Platform              string
	Backend               string
	Verified              bool
	Permission            string
	SystemMix             bool
	Process               bool
	SelfPlaybackExclusion string
	Notes                 string
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
	// CapturedAt is the timestamp of the first sample in Samples. Backends should
	// leave it zero only when the platform provides no capture clock.
	CapturedAt time.Time
	SampleRate int
	Channels   int
	Samples    []float32
	// Discontinuity is true when samples were dropped or the native stream
	// restarted. The matcher must reset before consuming this chunk.
	Discontinuity  bool
	DroppedSamples uint64
}

// AudioCaptureSink is safe to invoke from a native capture goroutine. Neither
// callback may retain or access Goja values. Backends must serialize PCM
// callbacks for a session in capture order; the runtime cannot reconstruct
// sample order from concurrent callbacks. Error may race with the final PCM
// callback.
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
	ID          string
	Backend     string
	SourceScope string
	// SourceVerified must be true only when this session preserves the exact
	// requested system-mix or process scope. A false value makes startup fail.
	SourceVerified bool
	PID            int64
	SampleRate     int
	Channels       int
	StartedAt      time.Time
}

// AudioCaptureSession is one execution-owned native stream. Info returns a
// prompt, non-blocking snapshot that is immutable after Start returns. Stop is
// idempotent, safe to race with backend Close, and promptly observes its
// context. Before Stop returns (including an error or context deadline), it
// must revoke the sink and initiate native shutdown so no new callback can be
// delivered. Wait is concurrency-safe, idempotent, and promptly observes its
// context; it joins every worker and native handle owned by this session. The
// Runtime calls Stop then Wait away from the Goja owner loop before settling
// watcher.wait(). A Wait error means cleanup could not be confirmed and must
// never be reported as a successfully stopped watcher.
type AudioCaptureSession interface {
	Info() AudioCaptureSessionInfo
	Stop(context.Context) error
	Wait(context.Context) error
}

// AudioCaptureBackend owns platform capture resources and their native workers.
// Every method is concurrency-safe; Name and Capabilities return prompt,
// non-blocking snapshots. Name, Platform, Backend, Notes, and session Backend
// values must be static, bounded, non-sensitive metadata; the runtime sanitizes
// identifiers and does not directly publish backend Notes. The runtime may execute up to the advertised watcher
// limit of Start calls concurrently. Start may block while permission and stream
// setup complete, so the runtime calls it from a tracked worker. Start must
// observe context cancellation promptly. If it returns a session together with
// an error, or if the runtime rejects a successfully-created session during
// validation, the runtime immediately revokes its sink and attempts Stop/Wait.
// The backend must continue owning any native resource whose release is not yet
// confirmed so its final Close/Wait can finish cleanup. The Start context bounds
// setup only; a successfully returned session remains active until Stop or
// Close. Start must also tolerate Close racing with an in-progress setup and
// retain ownership of any partially-created resource until it is released.
// Close is idempotent, concurrency-safe, and non-blocking: it revokes all sinks
// and initiates teardown for every remaining session; Wait joins all
// backend-owned workers, is safe to race with session Wait, and promptly
// observes its context. Platform errors must use stable AudioError codes and
// must not include device names, process metadata, or paths in public messages.
type AudioCaptureBackend interface {
	Name() string
	Capabilities() AudioCaptureCapabilities
	Start(context.Context, AudioCaptureOptions, AudioCaptureSink) (AudioCaptureSession, error)
	Close() error
	Wait(context.Context) error
}

// AudioCaptureBackendFactory is an internal dependency seam. Runtime and
// execution tests inject a memory backend that feeds deterministic PCM; normal
// executions select a platform backend when one is implemented; otherwise the
// explicit unsupported backend is used.
type AudioCaptureBackendFactory func() AudioCaptureBackend
