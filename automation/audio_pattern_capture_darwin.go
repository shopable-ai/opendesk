//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework CoreMedia -framework CoreAudio -framework AudioToolbox -framework Foundation -framework ApplicationServices
#include <stdint.h>
#include <stddef.h>

int32_t opendesk_audio_pattern_capture_probe(int32_t *platform_available, int32_t *permission_granted);
int32_t opendesk_audio_pattern_capture_create(uint64_t id);
int32_t opendesk_audio_pattern_capture_begin(uint64_t id);
int32_t opendesk_audio_pattern_capture_state(uint64_t id);
int32_t opendesk_audio_pattern_capture_stop(uint64_t id);
int32_t opendesk_audio_pattern_capture_wait(uint64_t id, int32_t timeout_ms);
void opendesk_audio_pattern_capture_release(uint64_t id);
*/
import "C"

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"
)

const (
	darwinPatternOK          int32 = 0
	darwinPatternUnsupported int32 = 1
	darwinPatternPermission  int32 = 2
	darwinPatternFailed      int32 = 3
	darwinPatternPending     int32 = 4
	darwinPatternReady       int32 = 5
	darwinPatternStopped     int32 = 6

	darwinPatternPollInterval = 20 * time.Millisecond
	darwinPatternWaitSlice    = 40 * time.Millisecond
)

// darwinAudioPatternCaptureBackend is a native, execution-owned
// ScreenCaptureKit source. It intentionally implements only the explicit
// system-mix scope: macOS has no process-loopback source that can preserve a
// requested PID without widening the capture to the complete mix.
type darwinAudioPatternCaptureBackend struct {
	mu       sync.Mutex
	closed   bool
	sessions map[uint64]*darwinAudioPatternCaptureSession
}

type darwinAudioPatternCaptureSession struct {
	backend *darwinAudioPatternCaptureBackend
	id      uint64
	sink    AudioCaptureSink
	info    AudioCaptureSessionInfo

	accepting      atomic.Bool
	deactivateOnce sync.Once

	// setupMu closes the gap between publishing a session to backend Close and
	// creating/beginning its native stream. Close may ask a session to stop
	// before ScreenCaptureKit has a handle for it; that request is remembered
	// rather than consumed as a no-op.
	setupMu       sync.Mutex
	setupDone     chan struct{}
	setupDoneOnce sync.Once
	nativeCreated bool // guarded by setupMu
	stopRequested atomic.Bool

	// nativeMu serializes all native handle calls with release. In particular,
	// a concurrent Wait must not query a handle after another Wait has released
	// it.
	nativeMu   sync.Mutex
	finishOnce sync.Once
	finishDone chan struct{}
	resultMu   sync.Mutex
	finished   bool
	finishErr  error
}

var darwinAudioPatternSessions = struct {
	sync.RWMutex
	m map[uint64]*darwinAudioPatternCaptureSession
}{m: make(map[uint64]*darwinAudioPatternCaptureSession)}

// The Objective-C bridge keeps its session registry process-global, so ids
// must also be process-global. Backends are execution-scoped and may start
// concurrently in one OpenDesk process.
var darwinAudioPatternNextID atomic.Uint64

func newDefaultAudioCaptureBackend() AudioCaptureBackend {
	return &darwinAudioPatternCaptureBackend{sessions: make(map[uint64]*darwinAudioPatternCaptureSession)}
}

func (*darwinAudioPatternCaptureBackend) Name() string { return "screencapturekit-system-mix" }

func (*darwinAudioPatternCaptureBackend) Capabilities() AudioCaptureCapabilities {
	var platformAvailable, permissionGranted C.int32_t
	_ = C.opendesk_audio_pattern_capture_probe(&platformAvailable, &permissionGranted)
	platform := int32(platformAvailable) != 0
	verified := platform && int32(permissionGranted) != 0
	selfPlaybackExclusion := "unavailable"
	if verified {
		// The native stream explicitly sets excludesCurrentProcessAudio before
		// it starts. Sound playback is in-process, so it does not re-enter this
		// system-mix stream.
		selfPlaybackExclusion = "native"
	}
	return AudioCaptureCapabilities{
		Supported:             platform,
		Platform:              "darwin",
		Backend:               "screencapturekit-system-mix",
		Verified:              verified,
		Permission:            "screenRecording",
		SystemMix:             platform,
		Process:               false,
		SelfPlaybackExclusion: selfPlaybackExclusion,
		Notes:                 "ScreenCaptureKit system-mix PCM; current-process audio is excluded",
	}
}

func (b *darwinAudioPatternCaptureBackend) Start(ctx context.Context, options AudioCaptureOptions, sink AudioCaptureSink) (AudioCaptureSession, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if options.Source.Type != AudioCaptureSourceSystem {
		return nil, audioOperationError("", AudioNotSupported, "process-scoped system audio capture is unavailable", nil)
	}
	if options.SampleRate != audioPatternCanonicalSampleRate || options.Channels != 1 {
		return nil, audioOperationError("", AudioBackendFailed, "audio capture requires canonical mono PCM", nil)
	}
	capability := b.Capabilities()
	if !capability.Supported {
		return nil, audioOperationError("", AudioNotSupported, "system audio capture is unavailable", nil)
	}
	if !capability.Verified {
		return nil, audioOperationError("", AudioPatternPermissionDenied, "screen recording permission was denied", nil)
	}

	id := darwinAudioPatternNextID.Add(1)
	session := &darwinAudioPatternCaptureSession{
		backend:    b,
		id:         id,
		sink:       sink,
		setupDone:  make(chan struct{}),
		finishDone: make(chan struct{}),
		info: AudioCaptureSessionInfo{
			ID: "sck-audio-" + itoa(id), Backend: b.Name(), SourceScope: "system-mix", SourceVerified: true,
			SampleRate: audioPatternCanonicalSampleRate, Channels: 1,
		},
	}
	session.accepting.Store(true)
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, audioOperationError("", AudioPatternCanceled, "audio capture backend is closing", nil)
	}
	b.sessions[id] = session
	b.mu.Unlock()
	registerDarwinAudioPatternSession(session)

	// Keep Close/Stop from consuming a pre-create shutdown as a no-op. The
	// session is already visible to Close, but Start alone is allowed to create
	// and begin its native stream while this lock is held.
	session.setupMu.Lock()
	if session.stopRequested.Load() {
		session.setupMu.Unlock()
		session.completeSetup()
		err := audioOperationError("", AudioPatternCanceled, "audio capture setup was canceled", nil)
		session.finish(err)
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		session.setupMu.Unlock()
		session.completeSetup()
		session.finish(err)
		return nil, err
	}

	session.nativeMu.Lock()
	createStatus := int32(C.opendesk_audio_pattern_capture_create(C.uint64_t(id)))
	session.nativeMu.Unlock()
	if createStatus != darwinPatternOK {
		session.setupMu.Unlock()
		session.completeSetup()
		err := darwinAudioPatternStatusError(createStatus)
		session.finish(err)
		return nil, err
	}
	session.nativeCreated = true

	// A Close/Stop can record stopRequested without waiting for setupMu. Check
	// it again after native creation so it cannot be followed by begin.
	if session.stopRequested.Load() {
		session.setupMu.Unlock()
		session.completeSetup()
		return session.abortStart(audioOperationError("", AudioPatternCanceled, "audio capture setup was canceled", nil))
	}
	// The context bounds setup, not an active stream. If it expired between
	// create and begin, leave the stream unstarted and drive the normal Stop /
	// Wait cleanup path after releasing setupMu.
	if err := ctx.Err(); err != nil {
		session.setupMu.Unlock()
		session.completeSetup()
		return session.abortStart(err)
	}

	session.nativeMu.Lock()
	beginStatus := int32(C.opendesk_audio_pattern_capture_begin(C.uint64_t(id)))
	session.nativeMu.Unlock()
	session.setupMu.Unlock()
	session.completeSetup()
	if beginStatus != darwinPatternOK {
		err := darwinAudioPatternStatusError(beginStatus)
		return session.abortStart(err)
	}
	if err := session.waitReady(ctx); err != nil {
		return session.abortStart(err)
	}
	if err := ctx.Err(); err != nil {
		return session.abortStart(err)
	}
	return session, nil
}

// abortStart is the only startup-failure path after a native handle might
// exist. It gives both Stop and Wait the same bounded cleanup budget. If the
// join cannot be confirmed, returning the session with the original setup
// error lets the Runtime retain it as an orphan for backend Close/Wait.
func (s *darwinAudioPatternCaptureSession) abortStart(cause error) (AudioCaptureSession, error) {
	cleanupContext, cancel := context.WithTimeout(context.Background(), audioPatternStopTimeout)
	defer cancel()
	_ = s.Stop(cleanupContext)
	if err := s.Wait(cleanupContext); err != nil {
		return s, cause
	}
	return nil, cause
}

func (s *darwinAudioPatternCaptureSession) waitReady(ctx context.Context) error {
	ticker := time.NewTicker(darwinPatternPollInterval)
	defer ticker.Stop()
	for {
		s.nativeMu.Lock()
		status := int32(C.opendesk_audio_pattern_capture_state(C.uint64_t(s.id)))
		s.nativeMu.Unlock()
		switch status {
		case darwinPatternReady:
			s.info.StartedAt = time.Now().UTC()
			return nil
		case darwinPatternPending:
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-ticker.C:
			}
		case darwinPatternStopped:
			return context.Canceled
		default:
			return darwinAudioPatternStatusError(status)
		}
	}
}

func (b *darwinAudioPatternCaptureBackend) remove(id uint64) {
	b.mu.Lock()
	delete(b.sessions, id)
	b.mu.Unlock()
}

func (b *darwinAudioPatternCaptureBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	sessions := make([]*darwinAudioPatternCaptureSession, 0, len(b.sessions))
	for _, session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		session.requestCloseStop()
	}
	return nil
}

func (b *darwinAudioPatternCaptureBackend) Wait(ctx context.Context) error {
	b.mu.Lock()
	sessions := make([]*darwinAudioPatternCaptureSession, 0, len(b.sessions))
	for _, session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		if err := session.Wait(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (s *darwinAudioPatternCaptureSession) Info() AudioCaptureSessionInfo { return s.info }

func (s *darwinAudioPatternCaptureSession) Stop(ctx context.Context) error {
	if s == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	// Revocation is immediate and does not wait for an in-flight Cgo callback.
	// Native Wait owns that join through its callback dispatch group.
	s.deactivate()
	s.stopRequested.Store(true)
	if err := s.lockSetup(ctx); err != nil {
		// Start observes stopRequested before it creates or begins a stream, so
		// even a caller whose context expires cannot leave a future stream live.
		return err
	}
	defer s.setupMu.Unlock()
	if !s.nativeCreated {
		return ctx.Err()
	}
	s.nativeMu.Lock()
	status := int32(C.opendesk_audio_pattern_capture_stop(C.uint64_t(s.id)))
	s.nativeMu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	return darwinAudioPatternStatusError(status)
}

func (s *darwinAudioPatternCaptureSession) Wait(ctx context.Context) error {
	if s == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.awaitSetup(ctx); err != nil {
		return err
	}
	if done, err := s.result(); done {
		return s.awaitFinish(ctx, err)
	}
	ticker := time.NewTicker(darwinPatternWaitSlice)
	defer ticker.Stop()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		s.nativeMu.Lock()
		status := int32(C.opendesk_audio_pattern_capture_wait(C.uint64_t(s.id), C.int32_t(darwinPatternWaitSlice/time.Millisecond)))
		s.nativeMu.Unlock()
		switch status {
		case darwinPatternPending, darwinPatternReady:
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-ticker.C:
			}
		case darwinPatternStopped:
			s.finish(nil)
			_, err := s.result()
			return s.awaitFinish(ctx, err)
		default:
			// A concurrent waiter may have released the handle after observing
			// the same terminal state. Always prefer its cached outcome.
			if done, err := s.result(); done {
				return s.awaitFinish(ctx, err)
			}
			s.finish(darwinAudioPatternStatusError(status))
			_, err := s.result()
			return s.awaitFinish(ctx, err)
		}
	}
}

func (s *darwinAudioPatternCaptureSession) result() (bool, error) {
	s.resultMu.Lock()
	defer s.resultMu.Unlock()
	return s.finished, s.finishErr
}

func (s *darwinAudioPatternCaptureSession) finish(err error) {
	s.finishOnce.Do(func() {
		s.deactivate()
		s.resultMu.Lock()
		s.finished, s.finishErr = true, err
		s.resultMu.Unlock()
		s.nativeMu.Lock()
		C.opendesk_audio_pattern_capture_release(C.uint64_t(s.id))
		s.nativeMu.Unlock()
		if s.backend != nil {
			s.backend.remove(s.id)
		}
		if s.finishDone != nil {
			close(s.finishDone)
		}
	})
}

func (s *darwinAudioPatternCaptureSession) deactivate() {
	if s == nil {
		return
	}
	s.deactivateOnce.Do(func() {
		s.accepting.Store(false)
		unregisterDarwinAudioPatternSession(s.id)
	})
}

func (s *darwinAudioPatternCaptureSession) completeSetup() {
	if s == nil {
		return
	}
	s.setupDoneOnce.Do(func() { close(s.setupDone) })
}

func (s *darwinAudioPatternCaptureSession) awaitSetup(ctx context.Context) error {
	if s == nil || s.setupDone == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-s.setupDone:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *darwinAudioPatternCaptureSession) awaitFinish(ctx context.Context, result error) error {
	if s == nil || s.finishDone == nil {
		return result
	}
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-s.finishDone:
		return result
	case <-ctx.Done():
		return ctx.Err()
	}
}

// lockSetup is context-aware. A Stop that cannot acquire setupMu still records
// stopRequested first, which prevents Start from creating/beginning a stream
// after the caller has given up waiting.
func (s *darwinAudioPatternCaptureSession) lockSetup(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	ticker := time.NewTicker(time.Millisecond)
	defer ticker.Stop()
	for {
		if s.setupMu.TryLock() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

// requestCloseStop is the non-blocking Close variant. If setup is currently
// holding the mutex, stopRequested is already enough to make Start fail
// closed; otherwise it starts native teardown immediately.
func (s *darwinAudioPatternCaptureSession) requestCloseStop() {
	if s == nil {
		return
	}
	s.deactivate()
	s.stopRequested.Store(true)
	if !s.setupMu.TryLock() {
		return
	}
	defer s.setupMu.Unlock()
	if !s.nativeCreated {
		return
	}
	s.nativeMu.Lock()
	_ = C.opendesk_audio_pattern_capture_stop(C.uint64_t(s.id))
	s.nativeMu.Unlock()
}

func registerDarwinAudioPatternSession(session *darwinAudioPatternCaptureSession) {
	if session == nil {
		return
	}
	darwinAudioPatternSessions.Lock()
	darwinAudioPatternSessions.m[session.id] = session
	darwinAudioPatternSessions.Unlock()
}

func unregisterDarwinAudioPatternSession(id uint64) {
	darwinAudioPatternSessions.Lock()
	delete(darwinAudioPatternSessions.m, id)
	darwinAudioPatternSessions.Unlock()
}

func lookupDarwinAudioPatternSession(id uint64) *darwinAudioPatternCaptureSession {
	darwinAudioPatternSessions.RLock()
	session := darwinAudioPatternSessions.m[id]
	darwinAudioPatternSessions.RUnlock()
	return session
}

func (s *darwinAudioPatternCaptureSession) pushPCM(samples []float32, discontinuity bool, dropped uint64) {
	if s == nil || len(samples) == 0 && !discontinuity {
		return
	}
	if !s.accepting.Load() {
		return
	}
	// Stop may race after this check; that callback is already in flight and
	// the native dispatch group makes Wait join it before releasing the bridge.
	s.sink.Push(AudioPCMChunk{
		CapturedAt: time.Now().UTC(), SampleRate: audioPatternCanonicalSampleRate, Channels: 1,
		Samples: samples, Discontinuity: discontinuity, DroppedSamples: dropped,
	})
}

func (s *darwinAudioPatternCaptureSession) pushError(err error) {
	if s == nil || err == nil {
		return
	}
	if s.accepting.Load() {
		s.sink.Fail(err)
	}
}

func darwinAudioPatternStatusError(status int32) error {
	switch status {
	case darwinPatternOK, darwinPatternReady, darwinPatternStopped:
		return nil
	case darwinPatternUnsupported:
		return audioOperationError("", AudioNotSupported, "system audio capture is unavailable", nil)
	case darwinPatternPermission:
		return audioOperationError("", AudioPatternPermissionDenied, "screen recording permission was denied", nil)
	default:
		return audioOperationError("", AudioBackendFailed, "system audio capture backend failed", nil)
	}
}

func itoa(value uint64) string { // bounded internal identifier; never derived from host metadata.
	if value == 0 {
		return "0"
	}
	var digits [20]byte
	index := len(digits)
	for value > 0 {
		index--
		digits[index] = byte('0' + value%10)
		value /= 10
	}
	return string(digits[index:])
}

// opendesk_audio_pattern_capture_pcm is invoked from the native serial output
// queue. The C buffer is copied before returning and never reaches JavaScript.
//
//export opendesk_audio_pattern_capture_pcm
func opendesk_audio_pattern_capture_pcm(id C.uint64_t, samples *C.float, sampleCount C.size_t, discontinuity C.int, dropped C.ulonglong) {
	count := int(sampleCount)
	if discontinuity != 0 && samples == nil && count == 0 {
		if session := lookupDarwinAudioPatternSession(uint64(id)); session != nil {
			session.pushPCM(nil, true, uint64(dropped))
		}
		return
	}
	if samples == nil || count <= 0 || count > audioPatternMaxPCMChunkSamples {
		if session := lookupDarwinAudioPatternSession(uint64(id)); session != nil {
			session.pushError(audioOperationError("", AudioPatternResourceLimit, "native audio capture chunk exceeds the bounded matcher input limit", nil))
		}
		return
	}
	session := lookupDarwinAudioPatternSession(uint64(id))
	if session == nil {
		return
	}
	input := unsafe.Slice((*float32)(unsafe.Pointer(samples)), count)
	copySamples := append([]float32(nil), input...)
	session.pushPCM(copySamples, discontinuity != 0, uint64(dropped))
}

//export opendesk_audio_pattern_capture_error
func opendesk_audio_pattern_capture_error(id C.uint64_t, status C.int32_t) {
	if session := lookupDarwinAudioPatternSession(uint64(id)); session != nil {
		session.pushError(darwinAudioPatternStatusError(int32(status)))
	}
}
