package automation

import (
	"context"
	"errors"
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
)

const (
	audioPatternDefaultThreshold      = 0.88
	audioPatternDefaultCooldown       = 3 * time.Second
	audioPatternDefaultTimeout        = 30 * time.Second
	audioPatternDefaultStartupTimeout = 10 * time.Second
	audioPatternMaxStartupTimeout     = time.Minute
	audioPatternMaxTimeout            = 10 * time.Minute
	audioPatternStopTimeout           = 5 * time.Second
	audioPatternPCMQueueCapacity      = 4
	audioPatternMaxPCMChunkSamples    = audioPatternCanonicalSampleRate
	audioPatternMaxConcurrentWatchers = 8
	audioPatternMatcherVersion        = "spectral-template-v1"
)

const (
	AudioPatternNotFound          AudioErrorCode = "NOT_FOUND"
	AudioPatternUnsupportedFormat AudioErrorCode = "UNSUPPORTED_FORMAT"
	AudioPatternInvalidReference  AudioErrorCode = "INVALID_REFERENCE"
	AudioPatternPermissionDenied  AudioErrorCode = "PERMISSION_DENIED"
	AudioPatternTargetGone        AudioErrorCode = "TARGET_GONE"
	AudioPatternResourceLimit     AudioErrorCode = "RESOURCE_LIMIT"
	AudioPatternTimeout           AudioErrorCode = "TIMEOUT"
	AudioPatternCanceled          AudioErrorCode = "CANCELED"
	AudioPatternCallbackFailed    AudioErrorCode = "CALLBACK_FAILED"
)

type audioPatternWatchStatus string

const (
	audioPatternListening audioPatternWatchStatus = "listening"
	audioPatternStopping  audioPatternWatchStatus = "stopping"
	audioPatternStopped   audioPatternWatchStatus = "stopped"
	audioPatternFailed    audioPatternWatchStatus = "failed"
)

type audioPatternOnceSignal uint32

const (
	audioPatternOnceSignalNone audioPatternOnceSignal = iota
	audioPatternOnceSignalMatch
	audioPatternOnceSignalBackendError
	audioPatternOnceSignalTimeout
)

type audioPatternWatchOptions struct {
	source         AudioCaptureSource
	references     []audioPatternReferenceSpec
	threshold      float64
	cooldown       time.Duration
	timeout        time.Duration
	startupTimeout time.Duration
}

type audioPatternPendingStart struct {
	id        string
	operation string
	callback  goja.Callable
	once      bool
	resolve   func(interface{}) error
	reject    func(interface{}) error
	cancel    context.CancelFunc
}

type audioPatternReferenceMetadata struct {
	digest     string
	durationMS int64
}

type audioPatternMatchEvent struct {
	SchemaVersion  int
	Type           string
	Backend        string
	Timestamp      time.Time
	Sequence       uint64
	Coalesced      int
	WatchID        string
	PatternID      string
	Confidence     float64
	StartOffsetMS  int64
	EndOffsetMS    int64
	Digest         string
	SourceScope    string
	SourceVerified bool
}

type audioPatternWatchResult struct {
	id        string
	status    audioPatternWatchStatus
	stoppedAt string
	matches   int
	err       string
}

type audioPatternWatch struct {
	owner       *AudioPatternRuntime
	id          string
	operation   string
	once        bool
	callback    goja.Callable // EventLoop owner only.
	onceResolve func(interface{}) error
	onceReject  func(interface{}) error
	onceMatch   *audioPatternMatchEvent
	startReject func(interface{}) error
	waitPromise goja.Value
	waitResolve func(interface{}) error
	waitReject  func(interface{}) error

	// ownerPending mirrors Goja-owner-only callbacks and state as a pure number
	// that lifecycle diagnostics may safely read from a host goroutine.
	ownerPending atomic.Int64

	status         audioPatternWatchStatus
	startedAt      string
	stoppedAt      string
	backend        string
	source         AudioCaptureSource
	sourceScope    string
	sourceVerified bool
	session        AudioCaptureSession
	matcher        *AudioPatternMatcher
	references     map[string]audioPatternReferenceMetadata
	matches        int
	terminal       *audioPatternWatchResult
	timer          *time.Timer

	context              context.Context
	cancel               context.CancelFunc
	pcm                  chan AudioPCMChunk
	accepting            atomic.Bool
	inputFailed          atomic.Bool
	pendingDiscontinuity atomic.Bool
	errorScheduled       atomic.Bool
	onceSignal           atomic.Uint32
	processDone          chan struct{}
	startupMu            sync.Mutex
	ready                bool
	startupErr           error

	pcmQueueMu      sync.Mutex
	queueMu         sync.Mutex
	queued          *audioPatternMatchEvent
	scheduled       bool
	inFlight        bool // EventLoop owner only.
	deferred        *audioPatternMatchEvent
	lateCallbackErr error
}

type audioPatternStartResult struct {
	watch *audioPatternWatch
}

// publishOwnerPending must only run on the EventLoop owner after mutating the
// fields it snapshots. Cross-goroutine diagnostics read ownerPending instead of
// touching Goja values or owner-only state.
func (w *audioPatternWatch) publishOwnerPending() {
	if w == nil {
		return
	}
	pending := int64(0)
	if w.startReject != nil {
		pending++
	}
	if w.onceResolve != nil || w.onceReject != nil {
		pending++
	}
	if w.waitResolve != nil || w.waitReject != nil {
		pending++
	}
	if w.inFlight {
		pending++
	}
	if w.deferred != nil {
		pending++
	}
	w.ownerPending.Store(pending)
}

// AudioPatternRuntime owns all system-output matching resources for one Goja
// execution. The public methods are attached to the existing Audio object; no
// second JavaScript namespace is created.
type AudioPatternRuntime struct {
	runtime *goja.Runtime
	loop    interface {
		RunOnLoop(func(*goja.Runtime)) bool
	}
	context        context.Context
	cancel         context.CancelFunc
	workDir        string
	backend        AudioCaptureBackend
	onAsyncError   func(error)
	promiseCtor    goja.Value
	promiseResolve goja.Callable
	promiseThen    goja.Callable

	closing           atomic.Bool
	workers           atomic.Int64
	wg                sync.WaitGroup
	waitMu            sync.Mutex
	backendReleased   bool // guarded by waitMu; once true it never becomes false.
	mu                sync.Mutex
	nextID            uint64
	sequence          uint64
	pending           map[uint64]audioPatternPendingStart
	watches           map[string]*audioPatternWatch
	closingWatches    []*audioPatternWatch
	orphanSessions    []AudioCaptureSession
	backendWaitFailed bool
}

// attachAudioPatternMethods augments the already-created Audio object and
// returns the execution-scoped lifecycle owner. registerAudio deliberately
// remains responsible for the single public Audio namespace.
func attachAudioPatternMethods(runtimeValue *goja.Runtime, object *goja.Object, opts InitJSOptions) *AudioPatternRuntime {
	ctx := opts.Context
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	var backend AudioCaptureBackend
	if opts.AudioCaptureBackendFactory != nil {
		backend = opts.AudioCaptureBackendFactory()
	}
	if backend == nil {
		backend = newUnsupportedAudioCaptureBackend(runtime.GOOS, "system audio pattern capture has no platform backend")
	}
	manager := &AudioPatternRuntime{
		runtime: runtimeValue, context: ctx, cancel: cancel, workDir: opts.WorkDir,
		backend: backend, onAsyncError: opts.OnAsyncError,
		pending: map[uint64]audioPatternPendingStart{}, watches: map[string]*audioPatternWatch{},
	}
	manager.capturePromiseIntrinsics()
	if opts.EventLoop != nil {
		manager.loop = opts.EventLoop
	}
	_ = object.Set("watchSound", func(call goja.FunctionCall) goja.Value { return manager.watchSound(call) })
	_ = object.Set("waitForSound", func(call goja.FunctionCall) goja.Value { return manager.waitForSound(call) })
	manager.attachCapabilities(object)
	return manager
}

func (a *AudioPatternRuntime) capturePromiseIntrinsics() {
	if a == nil || a.runtime == nil {
		return
	}
	constructor := a.runtime.Get("Promise")
	constructorObject, ok := constructor.(*goja.Object)
	if !ok {
		return
	}
	resolve, ok := goja.AssertFunction(constructorObject.Get("resolve"))
	if !ok {
		return
	}
	prototype, ok := constructorObject.Get("prototype").(*goja.Object)
	if !ok {
		return
	}
	then, ok := goja.AssertFunction(prototype.Get("then"))
	if !ok {
		return
	}
	a.promiseCtor = constructor
	a.promiseResolve = resolve
	a.promiseThen = then
}

func (a *AudioPatternRuntime) attachCapabilities(object *goja.Object) {
	previous, ok := goja.AssertFunction(object.Get("getCapabilities"))
	_ = object.Set("getCapabilities", func(call goja.FunctionCall) goja.Value {
		result := map[string]interface{}{}
		if ok {
			value, err := previous(object)
			if err != nil {
				panic(err)
			}
			if exported, valid := value.Export().(map[string]interface{}); valid {
				for key, item := range exported {
					result[key] = item
				}
			}
		}
		result["patternWatch"] = a.capabilityPayload()
		return a.runtime.ToValue(result)
	})
}

func (a *AudioPatternRuntime) capabilityPayload() map[string]interface{} {
	capability := AudioCaptureCapabilities{Platform: runtime.GOOS, Backend: "unavailable", Permission: "screenRecording"}
	if a != nil && a.backend != nil {
		capability = a.backend.Capabilities()
	}
	selfPlaybackExclusion := audioPatternSelfPlaybackExclusion(capability.SelfPlaybackExclusion)
	loopReady := a != nil && a.loop != nil
	backendReady := capability.Supported && capability.Verified && loopReady
	systemSupported := backendReady && capability.SystemMix && selfPlaybackExclusion != "unavailable"
	processSupported := backendReady && capability.Process
	supported := systemSupported || processSupported
	status := "unsupported"
	if supported {
		status = "experimental"
	}
	permission := audioPatternPermission(capability.Permission)
	platform := audioPatternPublicIdentifier(capability.Platform, runtime.GOOS)
	backend := audioPatternPublicIdentifier(capability.Backend, "")
	if backend == "" && a != nil && a.backend != nil {
		backend = audioPatternPublicIdentifier(a.backend.Name(), "platform-backend")
	}
	if backend == "" {
		backend = "unavailable"
	}
	return map[string]interface{}{
		"supported":  supported,
		"status":     status,
		"platform":   platform,
		"backend":    backend,
		"verified":   capability.Verified,
		"permission": permission,
		"sources": map[string]interface{}{
			"system":  map[string]interface{}{"supported": systemSupported, "permission": permission},
			"process": map[string]interface{}{"supported": processSupported, "permission": permission, "selector": "pid"},
		},
		"selfPlaybackExclusion":  selfPlaybackExclusion,
		"matcherVersion":         audioPatternMatcherVersion,
		"formats":                []string{"mp3", "wav"},
		"sampleRate":             audioPatternCanonicalSampleRate,
		"maxConcurrentWatchers":  audioPatternMaxConcurrentWatchers,
		"maxReferences":          audioPatternMaxReferences,
		"maxReferenceBytes":      audioPatternMaxReferenceBytes,
		"minReferenceDurationMs": int64(audioPatternMinReferenceSamples * 1000 / audioPatternCanonicalSampleRate),
		"maxReferenceDurationMs": int64(audioPatternMaxReferenceSamples * 1000 / audioPatternCanonicalSampleRate),
		"rawAudioExposed":        false,
		"rawAudioPersisted":      false,
		"notes":                  audioPatternCapabilityNotes(supported),
	}
}

func audioPatternPublicIdentifier(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 64 {
		return fallback
	}
	for _, char := range value {
		if char >= 'a' && char <= 'z' || char >= 'A' && char <= 'Z' || char >= '0' && char <= '9' || char == '.' || char == '_' || char == '-' {
			continue
		}
		return fallback
	}
	return value
}

func audioPatternCapabilityNotes(supported bool) string {
	if supported {
		return "audio pattern capture is experimental and capability-gated"
	}
	return "system audio pattern capture is unavailable on this platform/backend"
}

func audioPatternSelfPlaybackExclusion(value string) string {
	switch value {
	case "native":
		return value
	default:
		// A runtime suppression window is reserved by the public contract but
		// is not implemented yet. Never let a backend label alone advertise a
		// system-mix source as protected.
		return "unavailable"
	}
}

func audioPatternPermission(value string) string {
	if value == "screenRecording" {
		return value
	}
	return "none"
}

func (a *AudioPatternRuntime) watchSound(call goja.FunctionCall) goja.Value {
	operation := "Audio.watchSound"
	options, err := parseAudioPatternWatchOptions(call.Argument(0), false, operation)
	if err != nil {
		return a.rejected(err)
	}
	callback, ok := goja.AssertFunction(call.Argument(1))
	if !ok {
		return a.rejected(audioOperationError(operation, AudioInvalidArgument, "callback must be a function", nil))
	}
	return a.start(options, operation, callback, false)
}

func (a *AudioPatternRuntime) waitForSound(call goja.FunctionCall) goja.Value {
	operation := "Audio.waitForSound"
	options, err := parseAudioPatternWatchOptions(call.Argument(0), true, operation)
	if err != nil {
		return a.rejected(err)
	}
	return a.start(options, operation, nil, true)
}

func (a *AudioPatternRuntime) start(options audioPatternWatchOptions, operation string, callback goja.Callable, once bool) goja.Value {
	if a.loop == nil {
		return a.rejected(audioOperationError(operation, AudioNotSupported, "sound pattern watching requires the execution EventLoop", nil))
	}
	if a.closing.Load() {
		return a.rejected(audioOperationError(operation, AudioPatternCanceled, "audio pattern runtime is closing", nil))
	}
	if err := a.validateCapability(options.source, operation); err != nil {
		return a.rejected(err)
	}
	a.mu.Lock()
	if len(a.closingWatches) > 0 || len(a.orphanSessions) > 0 || a.backendWaitFailed {
		a.mu.Unlock()
		return a.rejected(audioOperationError(operation, AudioPatternResourceLimit, "a previous audio capture session has not finished cleanup", nil))
	}
	if len(a.watches)+len(a.pending) >= audioPatternMaxConcurrentWatchers {
		a.mu.Unlock()
		return a.rejected(audioOperationError(operation, AudioPatternResourceLimit, "maximum concurrent sound watchers reached", nil))
	}
	a.nextID++
	startID := a.nextID
	watchID := fmt.Sprintf("audio-watch-%d", startID)
	watchContext, watchCancel := context.WithCancel(a.context)
	promise, resolve, reject := a.runtime.NewPromise()
	a.pending[startID] = audioPatternPendingStart{
		id: watchID, operation: operation, callback: callback, once: once,
		resolve: resolve, reject: reject, cancel: watchCancel,
	}
	a.mu.Unlock()

	a.runWorker(func() {
		result, err := a.prepareWatch(watchContext, watchCancel, watchID, operation, options, once)
		err = wrapAudioPatternError(operation, err)
		if a.closing.Load() {
			if result != nil && result.watch != nil {
				a.stopFailedAudioPatternStart(result.watch, result.watch.session)
			}
			watchCancel()
			return
		}
		if !a.loop.RunOnLoop(func(*goja.Runtime) { a.finishStart(startID, options, result, err) }) {
			if result != nil && result.watch != nil {
				a.stopFailedAudioPatternStart(result.watch, result.watch.session)
			}
			watchCancel()
		}
	})
	return a.runtime.ToValue(promise)
}

func (a *AudioPatternRuntime) validateCapability(source AudioCaptureSource, operation string) error {
	if a.backend == nil {
		return audioOperationError(operation, AudioNotSupported, "system audio pattern capture is unavailable", nil)
	}
	capability := a.backend.Capabilities()
	if !capability.Supported || !capability.Verified {
		return audioOperationError(operation, AudioNotSupported, "system audio pattern capture is unavailable on this platform/backend", nil)
	}
	switch source.Type {
	case AudioCaptureSourceSystem:
		if !capability.SystemMix || audioPatternSelfPlaybackExclusion(capability.SelfPlaybackExclusion) == "unavailable" {
			return audioOperationError(operation, AudioNotSupported, "system-mix capture is unavailable on this platform/backend", nil)
		}
	case AudioCaptureSourceProcess:
		if !capability.Process {
			return audioOperationError(operation, AudioNotSupported, "process-scoped capture is unavailable on this platform/backend", nil)
		}
	}
	return nil
}

func (a *AudioPatternRuntime) prepareWatch(ctx context.Context, cancel context.CancelFunc, id, operation string, options audioPatternWatchOptions, once bool) (*audioPatternStartResult, error) {
	startupContext, startupCancel := context.WithTimeout(ctx, options.startupTimeout)
	defer startupCancel()
	references, err := loadAudioPatternReferences(startupContext, a.workDir, operation, options.references)
	if err != nil {
		return nil, err
	}
	patterns := make([]AudioPattern, 0, len(references))
	metadata := make(map[string]audioPatternReferenceMetadata, len(references))
	for _, reference := range references {
		patterns = append(patterns, AudioPattern{ID: reference.id, Samples: reference.samples})
		metadata[reference.id] = audioPatternReferenceMetadata{digest: reference.digest, durationMS: reference.durationMS}
	}
	matcher, err := NewAudioPatternMatcher(AudioPatternMatcherConfig{
		Context: startupContext, SampleRate: audioPatternCanonicalSampleRate, Patterns: patterns,
		Threshold: options.threshold, Cooldown: options.cooldown,
		MaxPatternSamples:  audioPatternMaxReferenceSamples,
		MaxBufferedSamples: audioPatternMaxReferenceSamples,
	})
	if err != nil {
		if contextErr := startupContext.Err(); contextErr != nil {
			return nil, audioPatternContextError(operation, contextErr)
		}
		return nil, audioOperationError(operation, AudioPatternInvalidReference, "reference audio could not be prepared for matching", err)
	}
	watch := &audioPatternWatch{
		owner: a, id: id, operation: operation, once: once, status: audioPatternListening,
		source: options.source, matcher: matcher, references: metadata,
		context: ctx, cancel: cancel, pcm: make(chan AudioPCMChunk, audioPatternPCMQueueCapacity),
		processDone: make(chan struct{}),
	}
	watch.accepting.Store(true)
	session, err := a.backend.Start(startupContext, AudioCaptureOptions{
		Source: options.source, SampleRate: audioPatternCanonicalSampleRate, Channels: 1,
	}, AudioCaptureSink{
		PCM:   func(chunk AudioPCMChunk) { a.enqueuePCM(watch, chunk) },
		Error: func(err error) { a.enqueueBackendError(watch, err) },
	})
	if err != nil {
		a.stopFailedAudioPatternStart(watch, session)
		return nil, wrapAudioCaptureBackendError(operation, err)
	}
	if session == nil {
		a.stopFailedAudioPatternStart(watch, nil)
		return nil, audioOperationError(operation, AudioBackendFailed, "audio capture backend returned no session", nil)
	}
	if err := startupContext.Err(); err != nil {
		a.stopFailedAudioPatternStart(watch, session)
		return nil, err
	}
	info := session.Info()
	if err := startupContext.Err(); err != nil {
		a.stopFailedAudioPatternStart(watch, session)
		return nil, err
	}
	if info.SampleRate != audioPatternCanonicalSampleRate || info.Channels != 1 {
		a.stopFailedAudioPatternStart(watch, session)
		return nil, audioOperationError(operation, AudioBackendFailed, "audio capture backend did not provide canonical mono PCM", nil)
	}
	expectedScope := "system-mix"
	if options.source.Type == AudioCaptureSourceProcess {
		expectedScope = "process"
	}
	if info.SourceScope != expectedScope || !info.SourceVerified || options.source.Type == AudioCaptureSourceProcess && info.PID != options.source.PID {
		a.stopFailedAudioPatternStart(watch, session)
		return nil, audioOperationError(operation, AudioBackendFailed, "audio capture backend did not preserve the requested source scope", nil)
	}
	watch.session = session
	watch.backend = audioPatternPublicIdentifier(info.Backend, "")
	if watch.backend == "" {
		watch.backend = audioPatternPublicIdentifier(a.backend.Name(), "platform-backend")
	}
	startedAt := info.StartedAt
	if startedAt.IsZero() {
		startedAt = time.Now().UTC()
	}
	watch.startedAt = startedAt.UTC().Format(time.RFC3339Nano)
	watch.sourceScope = info.SourceScope
	watch.sourceVerified = info.SourceVerified
	return &audioPatternStartResult{watch: watch}, nil
}

func stopAudioPatternCaptureSession(session AudioCaptureSession) (released bool, stopErr error) {
	if session == nil {
		return true, nil
	}
	stopContext, stopCancel := context.WithTimeout(context.Background(), audioPatternStopTimeout)
	stopErr = session.Stop(stopContext)
	waitErr := session.Wait(stopContext)
	stopCancel()
	if waitErr != nil {
		return false, waitErr
	}
	return true, stopErr
}

// stopFailedAudioPatternStart closes the runtime-side privacy boundary before
// waiting for native teardown. If a bounded session wait cannot confirm release,
// the backend remains the lifecycle owner and ResourceCounts retains evidence
// until backend Close/Wait succeeds.
func (a *AudioPatternRuntime) stopFailedAudioPatternStart(watch *audioPatternWatch, session AudioCaptureSession) {
	if watch != nil {
		watch.accepting.Store(false)
		watch.inputFailed.Store(true)
		watch.cancel()
	}
	released, _ := stopAudioPatternCaptureSession(session)
	if released || session == nil {
		return
	}
	a.mu.Lock()
	a.orphanSessions = append(a.orphanSessions, session)
	a.mu.Unlock()
}

func (a *AudioPatternRuntime) finishStart(id uint64, options audioPatternWatchOptions, result *audioPatternStartResult, err error) {
	a.mu.Lock()
	pending, ok := a.pending[id]
	if ok {
		delete(a.pending, id)
	}
	a.mu.Unlock()
	if !ok {
		if result != nil && result.watch != nil {
			a.stopOrphan(result.watch)
		}
		return
	}
	if err != nil || result == nil || result.watch == nil {
		pending.cancel()
		if err == nil {
			err = audioOperationError(pending.operation, AudioBackendFailed, "audio pattern watcher setup returned no result", nil)
		}
		a.settlePromise(pending.reject, audioJSError(a.runtime, err))
		return
	}
	watch := result.watch
	watch.callback = pending.callback
	if pending.once {
		watch.onceResolve = pending.resolve
		watch.onceReject = pending.reject
		watch.publishOwnerPending()
		watch.timer = time.AfterFunc(options.timeout, func() { a.enqueueTimeout(watch, options.timeout) })
	}
	a.mu.Lock()
	a.watches[watch.id] = watch
	a.mu.Unlock()
	a.runWorker(func() { a.processPCM(watch) })
	watch.startupMu.Lock()
	watch.ready = true
	startupErr := watch.startupErr
	watch.startupErr = nil
	watch.startupMu.Unlock()
	if startupErr != nil {
		if !pending.once {
			watch.startReject = pending.reject
			watch.publishOwnerPending()
		}
		a.requestStop(watch, startupErr, false)
		return
	}
	if !pending.once {
		a.settlePromise(pending.resolve, a.watcherObject(watch))
	}
}

func (a *AudioPatternRuntime) enqueuePCM(watch *audioPatternWatch, chunk AudioPCMChunk) {
	if watch == nil || !watch.accepting.Load() || watch.inputFailed.Load() || a.closing.Load() {
		return
	}
	if chunk.SampleRate != audioPatternCanonicalSampleRate || chunk.Channels != 1 {
		a.failAudioPatternInput(watch, audioOperationError(watch.operation, AudioBackendFailed, "audio capture backend emitted non-canonical PCM", nil))
		return
	}
	if chunk.Discontinuity || chunk.DroppedSamples > 0 {
		chunk.Discontinuity = true
	}
	if len(chunk.Samples) == 0 {
		watch.pcmQueueMu.Lock()
		defer watch.pcmQueueMu.Unlock()
		if !watch.accepting.Load() || watch.inputFailed.Load() || a.closing.Load() || watch.pcm == nil {
			return
		}
		if chunk.Discontinuity {
			watch.pendingDiscontinuity.Store(true)
		}
		return
	}
	if len(chunk.Samples) > audioPatternMaxPCMChunkSamples {
		a.failAudioPatternInput(watch, audioOperationError(watch.operation, AudioPatternResourceLimit, "audio capture chunk exceeds the bounded matcher input limit", nil))
		return
	}
	for _, sample := range chunk.Samples {
		value := float64(sample)
		if math.IsNaN(value) || math.IsInf(value, 0) {
			a.failAudioPatternInput(watch, audioOperationError(watch.operation, AudioBackendFailed, "audio capture backend emitted non-finite PCM", nil))
			return
		}
	}
	watch.pcmQueueMu.Lock()
	if !watch.accepting.Load() || watch.inputFailed.Load() || a.closing.Load() || watch.pcm == nil {
		watch.pcmQueueMu.Unlock()
		return
	}
	if len(watch.pcm) >= cap(watch.pcm) {
		watch.pcmQueueMu.Unlock()
		a.failAudioPatternInput(watch, audioOperationError(watch.operation, AudioPatternResourceLimit, "audio capture input queue exceeded its bounded capacity", nil))
		return
	}
	boundedSamples := make([]float32, len(chunk.Samples))
	copy(boundedSamples, chunk.Samples)
	chunk.Samples = boundedSamples
	if watch.pendingDiscontinuity.Swap(false) {
		chunk.Discontinuity = true
	}
	watch.pcm <- chunk
	watch.pcmQueueMu.Unlock()
}

func (a *AudioPatternRuntime) failAudioPatternInput(watch *audioPatternWatch, err error) {
	if watch == nil || !watch.inputFailed.CompareAndSwap(false, true) {
		return
	}
	a.enqueueBackendError(watch, err)
}

func (a *AudioPatternRuntime) processPCM(watch *audioPatternWatch) {
	defer close(watch.processDone)
	for {
		select {
		case <-watch.context.Done():
			return
		case chunk := <-watch.pcm:
			if chunk.Discontinuity || chunk.DroppedSamples > 0 {
				watch.matcher.Reset()
			}
			matches := selectAudioPatternMatches(watch.matcher.Push(chunk.Samples))
			for _, match := range matches {
				metadata := watch.references[match.PatternID]
				timestamp := chunk.CapturedAt
				if timestamp.IsZero() {
					timestamp = time.Now().UTC()
				}
				a.enqueueMatch(watch, audioPatternMatchEvent{
					SchemaVersion: 1, Type: "audio.pattern.matched", Backend: watch.backend,
					Timestamp: timestamp, WatchID: watch.id, PatternID: match.PatternID,
					Confidence:    match.Confidence,
					StartOffsetMS: samplesToAudioPatternMilliseconds(match.StartSample),
					EndOffsetMS:   samplesToAudioPatternMilliseconds(match.EndSample),
					Digest:        metadata.digest, SourceScope: watch.sourceScope,
					SourceVerified: watch.sourceVerified,
				})
			}
		}
	}
}

// selectAudioPatternMatches emits at most one winner for a single analysis
// position. Highest confidence wins; PatternID is the stable tie-breaker.
func selectAudioPatternMatches(matches []AudioPatternMatch) []AudioPatternMatch {
	if len(matches) < 2 {
		return matches
	}
	result := make([]AudioPatternMatch, 0, len(matches))
	for start := 0; start < len(matches); {
		winner := matches[start]
		end := start + 1
		for end < len(matches) && matches[end].EndSample == winner.EndSample {
			candidate := matches[end]
			if candidate.Confidence > winner.Confidence || candidate.Confidence == winner.Confidence && candidate.PatternID < winner.PatternID {
				winner = candidate
			}
			end++
		}
		result = append(result, winner)
		start = end
	}
	return result
}

func samplesToAudioPatternMilliseconds(samples int64) int64 {
	if samples <= 0 {
		return 0
	}
	return samples * 1000 / audioPatternCanonicalSampleRate
}

func (a *AudioPatternRuntime) enqueueMatch(watch *audioPatternWatch, event audioPatternMatchEvent) {
	if watch == nil || !watch.accepting.Load() || a.closing.Load() {
		return
	}
	if watch.once {
		if !watch.onceSignal.CompareAndSwap(uint32(audioPatternOnceSignalNone), uint32(audioPatternOnceSignalMatch)) {
			return
		}
	}
	watch.queueMu.Lock()
	if !watch.accepting.Load() || a.closing.Load() {
		watch.queueMu.Unlock()
		return
	}
	if previous := watch.queued; previous != nil {
		event.Coalesced += previous.Coalesced + 1
	}
	watch.queued = &event
	if watch.scheduled {
		watch.queueMu.Unlock()
		return
	}
	watch.scheduled = true
	watch.queueMu.Unlock()
	if !a.loop.RunOnLoop(func(*goja.Runtime) { a.dispatchMatch(watch) }) {
		watch.queueMu.Lock()
		watch.queued = nil
		watch.scheduled = false
		watch.queueMu.Unlock()
	}
}

func (a *AudioPatternRuntime) dispatchMatch(watch *audioPatternWatch) {
	watch.queueMu.Lock()
	event := watch.queued
	watch.queued = nil
	watch.scheduled = false
	watch.queueMu.Unlock()
	if event == nil || a.closing.Load() || !watch.accepting.Load() || !a.hasWatch(watch) {
		return
	}
	a.sequence++
	event.Sequence = a.sequence
	watch.matches += event.Coalesced + 1
	if watch.once {
		copy := *event
		watch.onceMatch = &copy
		if watch.timer != nil {
			watch.timer.Stop()
			watch.timer = nil
		}
		a.requestStop(watch, nil, false)
		return
	}
	if watch.inFlight {
		copy := *event
		if watch.deferred != nil {
			copy.Coalesced += watch.deferred.Coalesced + 1
		}
		watch.deferred = &copy
		watch.publishOwnerPending()
		return
	}
	if watch.callback == nil {
		return
	}
	watch.inFlight = true
	watch.publishOwnerPending()
	value, err := watch.callback(goja.Undefined(), a.runtime.ToValue(audioPatternEventPayload(*event)))
	if err != nil {
		a.finishCallback(watch, err)
		return
	}
	a.awaitCallback(watch, value)
}

func (a *AudioPatternRuntime) awaitCallback(watch *audioPatternWatch, value goja.Value) {
	if a.promiseCtor == nil || a.promiseResolve == nil || a.promiseThen == nil {
		a.finishCallback(watch, errors.New("intrinsic Promise bridge is unavailable"))
		return
	}
	promiseValue, err := a.promiseResolve(a.promiseCtor, value)
	if err != nil {
		a.finishCallback(watch, err)
		return
	}
	onFulfilled := a.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		a.finishCallback(watch, nil)
		return goja.Undefined()
	})
	onRejected := a.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		// Rejection values are intentionally not coerced: user-controlled
		// toString/valueOf hooks can throw and strand the callback in-flight.
		a.finishCallback(watch, errors.New("callback Promise rejected"))
		return goja.Undefined()
	})
	if _, err := a.promiseThen(promiseValue, onFulfilled, onRejected); err != nil {
		a.finishCallback(watch, err)
	}
}

func (a *AudioPatternRuntime) finishCallback(watch *audioPatternWatch, callbackErr error) {
	if watch == nil || !watch.inFlight {
		return
	}
	watch.inFlight = false
	watch.publishOwnerPending()
	if watch.status != audioPatternListening {
		// Explicit stop does not wait for an already-entered callback Promise,
		// because that callback is allowed to await watcher.wait(). Preserve the
		// callback error signal without changing the watcher's terminal state.
		if callbackErr != nil && !a.closing.Load() {
			err := audioOperationError("Audio.watchSound", AudioPatternCallbackFailed, "sound pattern callback failed after watcher stop", callbackErr)
			if watch.status == audioPatternStopping {
				watch.lateCallbackErr = err
			} else {
				a.reportAsync(err)
			}
		}
		return
	}
	if callbackErr != nil {
		err := audioOperationError("Audio.watchSound", AudioPatternCallbackFailed, "sound pattern callback failed", callbackErr)
		a.requestStop(watch, err, true)
		return
	}
	deferred := watch.deferred
	watch.deferred = nil
	watch.publishOwnerPending()
	if deferred != nil && watch.accepting.Load() && a.hasWatch(watch) {
		a.dispatchDeferred(watch, *deferred)
	}
}

func (a *AudioPatternRuntime) dispatchDeferred(watch *audioPatternWatch, event audioPatternMatchEvent) {
	if watch == nil || !watch.accepting.Load() {
		return
	}
	if watch.inFlight {
		watch.deferred = &event
		watch.publishOwnerPending()
		return
	}
	if watch.callback == nil {
		return
	}
	watch.inFlight = true
	watch.publishOwnerPending()
	value, err := watch.callback(goja.Undefined(), a.runtime.ToValue(audioPatternEventPayload(event)))
	if err != nil {
		a.finishCallback(watch, err)
		return
	}
	a.awaitCallback(watch, value)
}

func (a *AudioPatternRuntime) enqueueBackendError(watch *audioPatternWatch, err error) {
	if err == nil || watch == nil || !watch.accepting.Load() || a.closing.Load() {
		return
	}
	watch.inputFailed.Store(true)
	err = wrapAudioCaptureBackendError(watch.operation, err)
	if watch.once {
		// Arbitration happens before either startup latching or EventLoop
		// scheduling. Whichever producer first claims the one-shot signal wins;
		// owner-loop task order cannot subsequently rewrite that result.
		if !watch.onceSignal.CompareAndSwap(uint32(audioPatternOnceSignalNone), uint32(audioPatternOnceSignalBackendError)) {
			return
		}
	}
	watch.startupMu.Lock()
	if !watch.ready {
		if watch.startupErr == nil {
			watch.startupErr = err
		}
		watch.startupMu.Unlock()
		return
	}
	watch.startupMu.Unlock()
	if a.loop == nil {
		return
	}
	if !watch.errorScheduled.CompareAndSwap(false, true) {
		return
	}
	a.loop.RunOnLoop(func(*goja.Runtime) {
		if !a.hasWatch(watch) || !watch.accepting.Load() {
			return
		}
		if watch.once {
			a.requestStop(watch, err, false)
			return
		}
		a.requestStop(watch, err, true)
	})
}

func (a *AudioPatternRuntime) enqueueTimeout(watch *audioPatternWatch, timeout time.Duration) {
	if watch == nil || !watch.once || !watch.accepting.Load() || a.closing.Load() || a.loop == nil {
		return
	}
	if !watch.onceSignal.CompareAndSwap(uint32(audioPatternOnceSignalNone), uint32(audioPatternOnceSignalTimeout)) {
		return
	}
	a.loop.RunOnLoop(func(*goja.Runtime) {
		if !a.hasWatch(watch) || !watch.accepting.Load() {
			return
		}
		err := audioOperationError("Audio.waitForSound", AudioPatternTimeout, fmt.Sprintf("timed out after %s", timeout), nil)
		a.requestStop(watch, err, false)
	})
}

func (a *AudioPatternRuntime) requestStop(watch *audioPatternWatch, failure error, report bool) bool {
	if watch == nil || watch.status != audioPatternListening || !a.hasWatch(watch) {
		return false
	}
	watch.status = audioPatternStopping
	watch.accepting.Store(false)
	watch.cancel()
	if watch.timer != nil {
		watch.timer.Stop()
		watch.timer = nil
	}
	watch.callback = nil
	watch.deferred = nil
	watch.publishOwnerPending()
	watch.queueMu.Lock()
	watch.queued = nil
	watch.scheduled = false
	watch.queueMu.Unlock()
	session := watch.session
	a.runWorker(func() {
		var stopErr error
		unreleased := false
		if session != nil {
			ctx, cancel := context.WithTimeout(context.Background(), audioPatternStopTimeout)
			stopErr = session.Stop(ctx)
			if waitErr := session.Wait(ctx); waitErr != nil {
				unreleased = true
				if stopErr == nil {
					stopErr = waitErr
				}
			}
			cancel()
		}
		if failure == nil && stopErr != nil {
			failure = wrapAudioCaptureBackendError(watch.operation, stopErr)
		}
		<-watch.processDone
		if a.closing.Load() || a.loop == nil {
			return
		}
		_ = a.loop.RunOnLoop(func(*goja.Runtime) { a.finishStop(watch, failure, report, unreleased) })
	})
	return true
}

func (a *AudioPatternRuntime) finishStop(watch *audioPatternWatch, failure error, report, unreleased bool) {
	a.mu.Lock()
	if current := a.watches[watch.id]; current != watch {
		a.mu.Unlock()
		return
	}
	delete(a.watches, watch.id)
	if unreleased {
		a.closingWatches = append(a.closingWatches, watch)
	}
	a.mu.Unlock()
	watch.stoppedAt = time.Now().UTC().Format(time.RFC3339Nano)
	status := audioPatternStopped
	message := ""
	if failure != nil {
		status = audioPatternFailed
		message = failure.Error()
	}
	watch.status = status
	if !unreleased {
		watch.session = nil
		watch.matcher = nil
		watch.references = nil
		watch.pcmQueueMu.Lock()
		watch.pcm = nil
		watch.pcmQueueMu.Unlock()
	}
	watch.terminal = &audioPatternWatchResult{
		id: watch.id, status: status, stoppedAt: watch.stoppedAt, matches: watch.matches, err: message,
	}
	if watch.waitResolve != nil {
		a.settlePromise(watch.waitResolve, a.runtime.ToValue(audioPatternWatchResultPayload(*watch.terminal)))
	}
	watch.waitResolve = nil
	watch.waitReject = nil
	watch.publishOwnerPending()
	if watch.startReject != nil {
		reject := watch.startReject
		watch.startReject = nil
		watch.publishOwnerPending()
		if failure == nil {
			failure = audioOperationError(watch.operation, AudioBackendFailed, "audio pattern watcher failed during startup", nil)
		}
		a.settlePromise(reject, audioJSError(a.runtime, failure))
	}
	if watch.onceResolve != nil || watch.onceReject != nil {
		resolve, reject := watch.onceResolve, watch.onceReject
		watch.onceResolve, watch.onceReject = nil, nil
		watch.publishOwnerPending()
		if failure != nil {
			if reject != nil {
				a.settlePromise(reject, audioJSError(a.runtime, failure))
			}
		} else if watch.onceMatch != nil && resolve != nil {
			a.settlePromise(resolve, a.runtime.ToValue(audioPatternEventPayload(*watch.onceMatch)))
		}
	}
	watch.onceMatch = nil
	if failure != nil && report {
		a.reportAsync(failure)
	}
	if watch.lateCallbackErr != nil {
		lateCallbackErr := watch.lateCallbackErr
		watch.lateCallbackErr = nil
		a.reportAsync(lateCallbackErr)
	}
}

func (a *AudioPatternRuntime) watcherObject(watch *audioPatternWatch) goja.Value {
	object := a.runtime.NewObject()
	_ = object.Set("id", watch.id)
	_ = object.Set("backend", watch.backend)
	_ = object.Set("startedAt", watch.startedAt)
	_ = object.Set("sourceScope", watch.sourceScope)
	_ = object.Set("sourceVerified", watch.sourceVerified)
	_ = object.Set("status", func(goja.FunctionCall) goja.Value { return a.runtime.ToValue(string(watch.status)) })
	_ = object.Set("stop", func(goja.FunctionCall) goja.Value { return a.runtime.ToValue(a.requestStop(watch, nil, false)) })
	_ = object.Set("wait", func(goja.FunctionCall) goja.Value { return a.waitWatcher(watch) })
	return object
}

func (a *AudioPatternRuntime) waitWatcher(watch *audioPatternWatch) goja.Value {
	if watch.waitPromise != nil {
		return watch.waitPromise
	}
	promise, resolve, reject := a.runtime.NewPromise()
	watch.waitPromise = a.runtime.ToValue(promise)
	if watch.terminal != nil {
		a.settlePromise(resolve, a.runtime.ToValue(audioPatternWatchResultPayload(*watch.terminal)))
		return watch.waitPromise
	}
	if a.closing.Load() {
		a.settlePromise(reject, audioJSError(a.runtime, audioOperationError("AudioPatternWatcher.wait", AudioPatternCanceled, "sound watcher wait canceled during execution teardown", nil)))
		return watch.waitPromise
	}
	watch.waitResolve = resolve
	watch.waitReject = reject
	watch.publishOwnerPending()
	return watch.waitPromise
}

func audioPatternEventPayload(event audioPatternMatchEvent) map[string]interface{} {
	data := map[string]interface{}{
		"watchId": event.WatchID, "patternId": event.PatternID, "confidence": event.Confidence,
		"startOffsetMs": event.StartOffsetMS, "endOffsetMs": event.EndOffsetMS,
		"referenceDigest": event.Digest, "sourceScope": event.SourceScope,
		"sourceVerified": event.SourceVerified, "contentIncluded": false,
	}
	return map[string]interface{}{
		"schemaVersion": event.SchemaVersion, "type": event.Type, "backend": event.Backend,
		"timestamp": event.Timestamp.UTC().Format(time.RFC3339Nano), "sequence": event.Sequence,
		"coalesced": event.Coalesced, "data": data,
	}
}

func audioPatternWatchResultPayload(result audioPatternWatchResult) map[string]interface{} {
	value := map[string]interface{}{
		"id": result.id, "status": string(result.status), "stoppedAt": result.stoppedAt,
	}
	if result.matches > 0 {
		value["matches"] = result.matches
	}
	if result.err != "" {
		value["error"] = result.err
	}
	return value
}

func (a *AudioPatternRuntime) hasWatch(watch *audioPatternWatch) bool {
	if a == nil || watch == nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.watches[watch.id] == watch
}

func (a *AudioPatternRuntime) stopOrphan(watch *audioPatternWatch) {
	if watch == nil {
		return
	}
	watch.accepting.Store(false)
	watch.inputFailed.Store(true)
	watch.cancel()
	session := watch.session
	if session != nil && !a.closing.Load() {
		a.runWorker(func() { a.stopFailedAudioPatternStart(watch, session) })
	}
}

func (a *AudioPatternRuntime) runWorker(worker func()) {
	a.workers.Add(1)
	a.wg.Add(1)
	go func() {
		defer func() {
			a.workers.Add(-1)
			a.wg.Done()
		}()
		worker()
	}()
}

func (a *AudioPatternRuntime) rejected(err error) goja.Value {
	promise, _, reject := a.runtime.NewPromise()
	a.settlePromise(reject, audioJSError(a.runtime, err))
	return a.runtime.ToValue(promise)
}

// settlePromise keeps resolver failures visible without letting a hostile or
// abrupt Promise reaction prevent the remaining watcher cleanup settlements.
// Interrupts are expected while the runner is forcing teardown; other errors
// still enter the execution async-error channel.
func (a *AudioPatternRuntime) settlePromise(settle func(interface{}) error, value interface{}) {
	if settle == nil {
		return
	}
	if err := settle(value); err != nil {
		var interrupted *goja.InterruptedError
		if a.closing.Load() && errors.As(err, &interrupted) {
			return
		}
		a.reportAsync(err)
	}
}

func (a *AudioPatternRuntime) reportAsync(err error) {
	if err != nil && a.onAsyncError != nil {
		a.onAsyncError(err)
	}
}

// Close is called on the Goja owner before EventLoop termination. Native input
// is disabled and backend teardown is signaled before any retained Promise is
// rejected, so user catch/finally handlers cannot prolong capture. Wait performs
// the blocking join afterwards.
func (a *AudioPatternRuntime) Close() {
	if a == nil || !a.closing.CompareAndSwap(false, true) {
		return
	}
	a.cancel()
	a.mu.Lock()
	pending := a.pending
	a.pending = map[uint64]audioPatternPendingStart{}
	watches := make([]*audioPatternWatch, 0, len(a.watches))
	for _, watch := range a.watches {
		watches = append(watches, watch)
	}
	a.closingWatches = append(a.closingWatches, watches...)
	a.watches = map[string]*audioPatternWatch{}
	a.mu.Unlock()
	// Phase one contains no Goja settlement. Establish the privacy and resource
	// boundary first, even if a later user Promise reaction blocks or throws.
	for _, item := range pending {
		item.cancel()
	}
	for _, watch := range watches {
		watch.accepting.Store(false)
		watch.cancel()
		watch.status = audioPatternStopping
		if watch.timer != nil {
			watch.timer.Stop()
			watch.timer = nil
		}
		watch.callback = nil
		watch.deferred = nil
		watch.publishOwnerPending()
		watch.queueMu.Lock()
		watch.queued = nil
		watch.scheduled = false
		watch.queueMu.Unlock()
	}
	if a.backend != nil {
		if err := a.backend.Close(); err != nil {
			a.reportAsync(wrapAudioCaptureBackendError("Audio.cleanup", err))
		}
	}

	// Phase two settles Goja Promises only after every stream has been made
	// non-accepting and backend.Close has initiated native shutdown.
	for _, item := range pending {
		a.settlePromise(item.reject, audioJSError(a.runtime, audioOperationError(item.operation, AudioPatternCanceled, "sound watcher setup canceled during execution teardown", nil)))
	}
	for _, watch := range watches {
		canceled := audioJSError(a.runtime, audioOperationError("Audio.cleanup", AudioPatternCanceled, "sound watcher canceled during execution teardown", nil))
		if watch.onceReject != nil {
			a.settlePromise(watch.onceReject, canceled)
		}
		watch.onceResolve = nil
		watch.onceReject = nil
		watch.publishOwnerPending()
		watch.onceMatch = nil
		if watch.startReject != nil {
			a.settlePromise(watch.startReject, canceled)
			watch.startReject = nil
		}
		watch.publishOwnerPending()
		if watch.waitReject != nil {
			a.settlePromise(watch.waitReject, canceled)
		}
		watch.waitResolve = nil
		watch.waitReject = nil
		watch.publishOwnerPending()
	}
}

// Wait joins native resources after the Goja owner has completed Close and the
// EventLoop has stopped admitting lifecycle work. Calls are serialized and may
// retry a failed backend join, but once release is confirmed later calls are
// no-ops so cleanup state cannot regress. It must not race with future
// runWorker calls, which the Close-before-Wait lifecycle excludes.
func (a *AudioPatternRuntime) Wait() {
	if a == nil {
		return
	}
	a.waitMu.Lock()
	defer a.waitMu.Unlock()
	if a.backendReleased {
		return
	}
	a.wg.Wait()
	backendReleased := true
	if a.backend != nil {
		ctx, cancel := context.WithTimeout(context.Background(), audioPatternStopTimeout)
		if err := a.backend.Wait(ctx); err != nil {
			backendReleased = false
		}
		cancel()
	}
	a.mu.Lock()
	closingWatches := a.closingWatches
	if backendReleased {
		a.backendReleased = true
		a.backendWaitFailed = false
		a.closingWatches = nil
		a.orphanSessions = nil
	} else {
		a.backendWaitFailed = true
	}
	a.mu.Unlock()
	if !backendReleased {
		return
	}
	for _, watch := range closingWatches {
		watch.session = nil
		watch.matcher = nil
		watch.references = nil
		watch.pcmQueueMu.Lock()
		watch.pcm = nil
		watch.pcmQueueMu.Unlock()
	}
}

func (a *AudioPatternRuntime) ResourceCounts() (workers int64, pending, watches, sessions int) {
	if a == nil {
		return 0, 0, 0, 0
	}
	a.mu.Lock()
	pending = len(a.pending)
	items := make([]*audioPatternWatch, 0, len(a.watches))
	for _, watch := range a.watches {
		items = append(items, watch)
		if watch.session != nil {
			sessions++
		}
	}
	closingItems := append([]*audioPatternWatch(nil), a.closingWatches...)
	watches = len(items) + len(closingItems)
	sessions += len(a.orphanSessions)
	for _, watch := range closingItems {
		if watch.session != nil {
			sessions++
		}
	}
	// A failed backend-wide Wait is evidence of an unconfirmed native resource,
	// but it must not double-count a session already retained above.
	if a.backendWaitFailed && sessions == 0 {
		sessions = 1
	}
	a.mu.Unlock()
	for _, watch := range items {
		pending += int(watch.ownerPending.Load())
		watch.queueMu.Lock()
		if watch.queued != nil || watch.scheduled {
			pending++
		}
		watch.queueMu.Unlock()
	}
	return a.workers.Load(), pending, watches, sessions
}

// AsyncCounts reports only work that should keep a successfully completed
// script alive. Terminal cleanup evidence is deliberately excluded: execution
// teardown must be allowed to call backend Close/Wait and release it.
func (a *AudioPatternRuntime) AsyncCounts() (workers int64, callbacks int) {
	if a == nil {
		return 0, 0
	}
	a.mu.Lock()
	callbacks = len(a.pending)
	items := make([]*audioPatternWatch, 0, len(a.watches))
	for _, watch := range a.watches {
		items = append(items, watch)
	}
	callbacks += len(items)
	a.mu.Unlock()
	for _, watch := range items {
		callbacks += int(watch.ownerPending.Load())
		watch.queueMu.Lock()
		if watch.queued != nil || watch.scheduled {
			callbacks++
		}
		watch.queueMu.Unlock()
	}
	return a.workers.Load(), callbacks
}

func parseAudioPatternWatchOptions(value goja.Value, allowTimeout bool, operation string) (audioPatternWatchOptions, error) {
	result := audioPatternWatchOptions{
		threshold: audioPatternDefaultThreshold, cooldown: audioPatternDefaultCooldown,
		timeout: audioPatternDefaultTimeout, startupTimeout: audioPatternDefaultStartupTimeout,
	}
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return result, audioOperationError(operation, AudioInvalidArgument, "options must be an object", nil)
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return result, audioOperationError(operation, AudioInvalidArgument, "options must be an object", nil)
	}
	allowed := map[string]bool{"source": true, "references": true, "threshold": true, "cooldownMs": true, "startupTimeoutMs": true}
	if allowTimeout {
		allowed["timeoutMs"] = true
	}
	for key := range options {
		if !allowed[key] {
			return result, audioOperationError(operation, AudioInvalidArgument, "options contains an unknown field: "+key, nil)
		}
	}
	rawSource, exists := options["source"]
	if !exists {
		return result, audioOperationError(operation, AudioInvalidArgument, "options.source is required", nil)
	}
	source, err := parseAudioPatternSource(rawSource, operation)
	if err != nil {
		return result, err
	}
	result.source = source
	rawReferences, exists := options["references"]
	if !exists {
		return result, audioOperationError(operation, AudioInvalidArgument, "options.references is required", nil)
	}
	references, ok := rawReferences.([]interface{})
	if !ok || len(references) == 0 || len(references) > audioPatternMaxReferences {
		return result, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("options.references must be an array with 1 to %d items", audioPatternMaxReferences), nil)
	}
	seen := map[string]bool{}
	for index, raw := range references {
		item, ok := raw.(map[string]interface{})
		if !ok || len(item) != 2 {
			return result, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("options.references[%d] must contain exactly id and path", index), nil)
		}
		id, idOK := item["id"].(string)
		path, pathOK := item["path"].(string)
		id = strings.TrimSpace(id)
		if !idOK || id == "" || len(id) > 128 || strings.ContainsRune(id, '\x00') {
			return result, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("options.references[%d].id must be a non-empty string of at most 128 characters", index), nil)
		}
		if seen[id] {
			return result, audioOperationError(operation, AudioInvalidArgument, "reference ids must be unique", nil)
		}
		seen[id] = true
		if !pathOK || strings.TrimSpace(path) == "" || strings.ContainsRune(path, '\x00') {
			return result, audioOperationError(operation, AudioInvalidArgument, fmt.Sprintf("options.references[%d].path must be a non-empty string without NUL", index), nil)
		}
		result.references = append(result.references, audioPatternReferenceSpec{id: id, path: path})
	}
	if raw, exists := options["threshold"]; exists {
		value, ok := audioPatternFiniteNumber(raw)
		if !ok || value <= 0 || value > 1 {
			return result, audioOperationError(operation, AudioInvalidArgument, "options.threshold must be finite and in (0, 1]", nil)
		}
		result.threshold = value
	}
	if raw, exists := options["cooldownMs"]; exists {
		milliseconds, ok := audioPatternFiniteInteger(raw)
		if !ok || milliseconds < 0 || milliseconds > int64(audioPatternMaxTimeout/time.Millisecond) {
			return result, audioOperationError(operation, AudioInvalidArgument, "options.cooldownMs must be an integer between 0 and 600000", nil)
		}
		result.cooldown = time.Duration(milliseconds) * time.Millisecond
	}
	if raw, exists := options["startupTimeoutMs"]; exists {
		milliseconds, ok := audioPatternFiniteInteger(raw)
		if !ok || milliseconds <= 0 || milliseconds > int64(audioPatternMaxStartupTimeout/time.Millisecond) {
			return result, audioOperationError(operation, AudioInvalidArgument, "options.startupTimeoutMs must be an integer between 1 and 60000", nil)
		}
		result.startupTimeout = time.Duration(milliseconds) * time.Millisecond
	}
	if raw, exists := options["timeoutMs"]; exists {
		milliseconds, ok := audioPatternFiniteInteger(raw)
		if !ok || milliseconds <= 0 || milliseconds > int64(audioPatternMaxTimeout/time.Millisecond) {
			return result, audioOperationError(operation, AudioInvalidArgument, "options.timeoutMs must be an integer between 1 and 600000", nil)
		}
		result.timeout = time.Duration(milliseconds) * time.Millisecond
	}
	return result, nil
}

func parseAudioPatternSource(raw interface{}, operation string) (AudioCaptureSource, error) {
	object, ok := raw.(map[string]interface{})
	if !ok {
		return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "options.source must be an object", nil)
	}
	typeName, ok := object["type"].(string)
	if !ok {
		return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "options.source.type must be system or process", nil)
	}
	switch typeName {
	case string(AudioCaptureSourceSystem):
		if len(object) != 1 {
			return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "system source must contain only type", nil)
		}
		return AudioCaptureSource{Type: AudioCaptureSourceSystem}, nil
	case string(AudioCaptureSourceProcess):
		if len(object) != 2 {
			return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "process source must contain exactly type and pid", nil)
		}
		pid, ok := audioPatternFiniteInteger(object["pid"])
		if !ok || pid <= 0 || pid > math.MaxInt32 {
			return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "options.source.pid must be a positive 32-bit integer", nil)
		}
		return AudioCaptureSource{Type: AudioCaptureSourceProcess, PID: pid}, nil
	default:
		return AudioCaptureSource{}, audioOperationError(operation, AudioInvalidArgument, "options.source.type must be system or process", nil)
	}
}

func audioPatternFiniteNumber(raw interface{}) (float64, bool) {
	var value float64
	switch typed := raw.(type) {
	case int:
		value = float64(typed)
	case int64:
		value = float64(typed)
	case float64:
		value = typed
	default:
		return 0, false
	}
	return value, !math.IsNaN(value) && !math.IsInf(value, 0)
}

func audioPatternFiniteInteger(raw interface{}) (int64, bool) {
	value, ok := audioPatternFiniteNumber(raw)
	if !ok || value != math.Trunc(value) || value < math.MinInt64 || value > math.MaxInt64 {
		return 0, false
	}
	return int64(value), true
}

func wrapAudioPatternError(operation string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return audioOperationError(operation, AudioPatternTimeout, "audio pattern operation timed out", err)
	}
	if errors.Is(err, context.Canceled) {
		return audioOperationError(operation, AudioPatternCanceled, "audio pattern operation was canceled", err)
	}
	return wrapAudioOperationError(operation, err)
}

// wrapAudioCaptureBackendError deliberately does not expose backend error text.
// Native error strings can contain user-named devices, executable paths, PIDs,
// or other host metadata. Backends may select a stable AudioError code, but the
// public message is owned and sanitized here.
func wrapAudioCaptureBackendError(operation string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return audioOperationError(operation, AudioPatternTimeout, "audio capture operation timed out", nil)
	}
	if errors.Is(err, context.Canceled) {
		return audioOperationError(operation, AudioPatternCanceled, "audio capture operation was canceled", nil)
	}
	code := AudioBackendFailed
	var audioErr *AudioError
	if errors.As(err, &audioErr) {
		switch audioErr.Code {
		case AudioNotSupported, AudioDeviceUnavailable, AudioPatternPermissionDenied,
			AudioPatternTargetGone, AudioPatternResourceLimit, AudioBackendFailed:
			code = audioErr.Code
		}
	}
	messages := map[AudioErrorCode]string{
		AudioNotSupported:            "audio capture is not supported",
		AudioDeviceUnavailable:       "audio capture device is unavailable",
		AudioPatternPermissionDenied: "audio capture permission was denied",
		AudioPatternTargetGone:       "audio capture target is unavailable",
		AudioPatternResourceLimit:    "audio capture resource limit was reached",
		AudioBackendFailed:           "audio capture backend failed",
	}
	return audioOperationError(operation, code, messages[code], nil)
}

func audioPatternContextError(operation string, err error) error {
	return wrapAudioPatternError(operation, err)
}

// Stable ordering is useful to tests and diagnostics without exposing the map
// containing Goja-owned callback references.
func (a *AudioPatternRuntime) activeWatchIDs() []string {
	a.mu.Lock()
	defer a.mu.Unlock()
	result := make([]string, 0, len(a.watches))
	for id := range a.watches {
		result = append(result, id)
	}
	sort.Strings(result)
	return result
}
