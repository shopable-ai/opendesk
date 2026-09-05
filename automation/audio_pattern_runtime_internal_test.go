package automation

import (
	"context"
	"errors"
	"math"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
)

func TestAudioPatternRuntimeInternalBoundsPCMAndMarksDiscontinuity(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	t.Cleanup(func() {
		manager.Close()
		manager.Wait()
	})

	largeBacking := make([]float32, 1<<20)
	copy(largeBacking, []float32{0.1, -0.2, 0.3})
	want := largeBacking[:3]
	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate:     audioPatternCanonicalSampleRate,
		Channels:       1,
		Samples:        want,
		DroppedSamples: 7,
	})
	select {
	case chunk := <-watch.pcm:
		if len(chunk.Samples) != len(want) || chunk.DroppedSamples != 7 {
			t.Fatalf("queued chunk = %#v, want retained bounded input", chunk)
		}
		if !chunk.Discontinuity {
			t.Fatal("dropped samples did not mark their PCM chunk discontinuous")
		}
		if cap(chunk.Samples) != len(want) {
			t.Fatalf("queued PCM retained oversized backing capacity %d, want %d", cap(chunk.Samples), len(want))
		}
	default:
		t.Fatal("bounded discontinuous chunk was not queued")
	}

	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate:    audioPatternCanonicalSampleRate,
		Channels:      1,
		Discontinuity: true,
	})
	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate: audioPatternCanonicalSampleRate,
		Channels:   1,
		Samples:    []float32{0.4},
	})
	markerChunk := <-watch.pcm
	if !markerChunk.Discontinuity {
		t.Fatal("marker-only discontinuity was not attached to the next PCM chunk")
	}

	if backend.startCount() != 1 {
		t.Fatalf("backend starts = %d, want 1", backend.startCount())
	}
}

func TestAudioPatternRuntimeInternalRejectsOversizedPCM(t *testing.T) {
	manager, _, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	watch.startupMu.Lock()
	watch.ready = true
	watch.startupMu.Unlock()
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	t.Cleanup(func() {
		manager.Close()
		manager.Wait()
	})

	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate: audioPatternCanonicalSampleRate,
		Channels:   1,
		Samples:    make([]float32, audioPatternMaxPCMChunkSamples+1),
	})
	if got := len(watch.pcm); got != 0 {
		t.Fatalf("oversized chunk queue length = %d, want 0", got)
	}
	if !watch.inputFailed.Load() || loop.pendingCount() != 1 {
		t.Fatalf("oversized input failure = failed:%t pending:%d, want true/1", watch.inputFailed.Load(), loop.pendingCount())
	}
}

func TestAudioPatternRuntimeInternalRejectsNonFinitePCM(t *testing.T) {
	tests := []struct {
		name   string
		sample float32
	}{
		{name: "NaN", sample: float32(math.NaN())},
		{name: "positive infinity", sample: float32(math.Inf(1))},
		{name: "negative infinity", sample: float32(math.Inf(-1))},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			manager, _, options := newAudioPatternInternalTestRuntime(t)
			loop := &audioPatternInternalQueuedLoop{}
			manager.loop = loop
			watch := prepareAudioPatternInternalTestWatch(t, manager, options)
			watch.startupMu.Lock()
			watch.ready = true
			watch.startupMu.Unlock()
			manager.mu.Lock()
			manager.watches[watch.id] = watch
			manager.mu.Unlock()
			manager.runWorker(func() { manager.processPCM(watch) })
			t.Cleanup(func() {
				manager.Close()
				manager.Wait()
			})

			manager.enqueuePCM(watch, AudioPCMChunk{
				SampleRate: audioPatternCanonicalSampleRate,
				Channels:   1,
				Samples:    []float32{0.25, test.sample, -0.25},
			})
			if got := len(watch.pcm); got != 0 {
				t.Fatalf("non-finite chunk queue length = %d, want 0", got)
			}
			if !watch.inputFailed.Load() || loop.pendingCount() != 1 {
				t.Fatalf("non-finite input failure = failed:%t pending:%d, want true/1", watch.inputFailed.Load(), loop.pendingCount())
			}
			if !loop.runNext(manager.runtime) {
				t.Fatal("non-finite input failure completion was not queued")
			}
			waitForAudioPatternInternalCondition(t, func() bool { return loop.pendingCount() == 1 }, "non-finite input stop completion")
			if !loop.runNext(manager.runtime) {
				t.Fatal("non-finite input stop completion was not queued")
			}
			if watch.terminal == nil || watch.terminal.status != audioPatternFailed {
				t.Fatalf("non-finite input terminal = %#v, want failed", watch.terminal)
			}
			if !strings.Contains(watch.terminal.err, string(AudioBackendFailed)) {
				t.Fatalf("non-finite input terminal error = %q, want %s", watch.terminal.err, AudioBackendFailed)
			}
		})
	}
}

func TestAudioPatternRuntimeInternalRejectsPCMQueueOverflow(t *testing.T) {
	manager, _, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	watch.startupMu.Lock()
	watch.ready = true
	watch.startupMu.Unlock()
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	t.Cleanup(func() {
		manager.Close()
		manager.Wait()
	})

	for index := 0; index < audioPatternPCMQueueCapacity; index++ {
		manager.enqueuePCM(watch, AudioPCMChunk{
			SampleRate: audioPatternCanonicalSampleRate,
			Channels:   1,
			Samples:    []float32{float32(index)},
		})
	}
	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate: audioPatternCanonicalSampleRate,
		Channels:   1,
		Samples:    []float32{99},
	})
	if got := len(watch.pcm); got != audioPatternPCMQueueCapacity {
		t.Fatalf("overflow queue length = %d, want existing chronological queue retained", got)
	}
	if !watch.inputFailed.Load() || loop.pendingCount() != 1 {
		t.Fatalf("overflow failure = failed:%t pending:%d, want true/1", watch.inputFailed.Load(), loop.pendingCount())
	}
	for index := 0; index < audioPatternPCMQueueCapacity; index++ {
		queued := <-watch.pcm
		if queued.Discontinuity || queued.Samples[0] != float32(index) {
			t.Fatalf("retained overflow chunk %d = %#v", index, queued)
		}
	}
	manager.enqueuePCM(watch, AudioPCMChunk{
		SampleRate: audioPatternCanonicalSampleRate,
		Channels:   1,
		Samples:    []float32{100},
	})
	if got := len(watch.pcm); got != 0 {
		t.Fatalf("PCM accepted after terminal overload = %d chunks, want 0", got)
	}
}

func TestAudioPatternRuntimeInternalRejectsWidenedProcessScope(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	options.source = AudioCaptureSource{Type: AudioCaptureSourceProcess, PID: 42}
	ctx, cancel := context.WithCancel(manager.context)
	defer cancel()
	_, err := manager.prepareWatch(ctx, cancel, "audio-watch-process", "Audio.watchSound", options, false)
	assertAudioPatternTestError(t, err, AudioBackendFailed, manager.workDir)
	_, _, stopCalls := backend.counts()
	if stopCalls != 1 {
		t.Fatalf("scope mismatch stopped %d sessions, want 1", stopCalls)
	}
	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalRejectsUnverifiedSystemScope(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	backend.sessionSourceUnverified = true
	ctx, cancel := context.WithCancel(manager.context)
	defer cancel()

	_, err := manager.prepareWatch(ctx, cancel, "audio-watch-system", "Audio.watchSound", options, false)
	assertAudioPatternTestError(t, err, AudioBackendFailed, manager.workDir)
	_, _, stopCalls := backend.counts()
	if stopCalls != 1 || backend.activeSessionCount() != 0 {
		t.Fatalf("unverified system session cleanup = stops:%d active:%d, want 1/0", stopCalls, backend.activeSessionCount())
	}

	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalBoundsFirstMatchAndBackendErrorScheduling(t *testing.T) {
	loop := &audioPatternInternalQueuedLoop{}
	manager := &AudioPatternRuntime{loop: loop, watches: map[string]*audioPatternWatch{}}
	watch := &audioPatternWatch{owner: manager, id: "audio-watch-test", once: true, ready: true}
	watch.accepting.Store(true)
	manager.watches[watch.id] = watch

	manager.enqueueMatch(watch, audioPatternMatchEvent{PatternID: "first", EndOffsetMS: 10})
	manager.enqueueMatch(watch, audioPatternMatchEvent{PatternID: "second", EndOffsetMS: 20})
	watch.queueMu.Lock()
	queued := watch.queued
	watch.queueMu.Unlock()
	if queued == nil || queued.PatternID != "first" {
		t.Fatalf("one-shot queue retained %#v, want first match", queued)
	}
	if calls := loop.count(); calls != 1 {
		t.Fatalf("one-shot match scheduled %d callbacks, want 1", calls)
	}

	manager.enqueueBackendError(watch, audioOperationError("", AudioBackendFailed, "first", nil))
	manager.enqueueBackendError(watch, audioOperationError("", AudioBackendFailed, "second", nil))
	if calls := loop.count(); calls != 1 {
		t.Fatalf("backend error overtook a latched one-shot match: scheduled callbacks = %d, want 1", calls)
	}
}

func TestAudioPatternRuntimeInternalOneShotFirstProducerSignalWins(t *testing.T) {
	tests := []struct {
		name  string
		want  audioPatternOnceSignal
		first func(*AudioPatternRuntime, *audioPatternWatch)
	}{
		{
			name: "match",
			want: audioPatternOnceSignalMatch,
			first: func(manager *AudioPatternRuntime, watch *audioPatternWatch) {
				manager.enqueueMatch(watch, audioPatternMatchEvent{PatternID: "order"})
			},
		},
		{
			name: "backend error",
			want: audioPatternOnceSignalBackendError,
			first: func(manager *AudioPatternRuntime, watch *audioPatternWatch) {
				manager.enqueueBackendError(watch, errors.New("private backend detail"))
			},
		},
		{
			name: "timeout",
			want: audioPatternOnceSignalTimeout,
			first: func(manager *AudioPatternRuntime, watch *audioPatternWatch) {
				manager.enqueueTimeout(watch, time.Second)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			loop := &audioPatternInternalQueuedLoop{}
			manager := &AudioPatternRuntime{loop: loop, watches: map[string]*audioPatternWatch{}}
			watch := &audioPatternWatch{owner: manager, id: "audio-watch-once", operation: "Audio.waitForSound", once: true, ready: true}
			watch.accepting.Store(true)
			manager.watches[watch.id] = watch

			test.first(manager, watch)
			// Every other producer arrives before the queued owner task executes.
			// None may reinterpret the already-claimed terminal signal.
			manager.enqueueMatch(watch, audioPatternMatchEvent{PatternID: "late-match"})
			manager.enqueueBackendError(watch, errors.New("late backend error"))
			manager.enqueueTimeout(watch, time.Second)

			got := audioPatternOnceSignal(watch.onceSignal.Load())
			if got != test.want {
				t.Fatalf("one-shot signal = %v, want %v", got, test.want)
			}
			if calls := loop.count(); calls != 1 {
				t.Fatalf("scheduled owner tasks = %d, want exactly one", calls)
			}
		})
	}
}

func TestAudioPatternRuntimeInternalFreezesOnceBeforeConcurrentBackendCallbacks(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	options.timeout = time.Minute

	watchContext, watchCancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(watchContext, watchCancel, "audio-watch-once-race", "Audio.waitForSound", options, true)
	if err != nil {
		watchCancel()
		t.Fatal(err)
	}
	watch := result.watch
	if !watch.once {
		watchCancel()
		t.Fatal("one-shot mode was not frozen before the backend received its sink")
	}

	backend.mu.Lock()
	var emitError func(error)
	for session := range backend.sessions {
		emitError = session.sink.Error
		break
	}
	backend.mu.Unlock()
	if emitError == nil {
		watchCancel()
		t.Fatal("backend session did not retain its error sink")
	}

	manager.mu.Lock()
	manager.pending[1] = audioPatternPendingStart{
		id:        watch.id,
		operation: watch.operation,
		once:      true,
		resolve:   func(interface{}) error { return nil },
		reject:    func(interface{}) error { return nil },
		cancel:    watchCancel,
	}
	manager.mu.Unlock()

	startErrors := make(chan struct{})
	var errorsDone sync.WaitGroup
	errorsDone.Add(1)
	go func() {
		defer errorsDone.Done()
		<-startErrors
		for index := 0; index < 4096; index++ {
			emitError(errors.New("concurrent startup failure"))
		}
	}()

	close(startErrors)
	manager.finishStart(1, options, result, nil)
	errorsDone.Wait()

	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalCloseWaitReleasesResources(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	manager.runWorker(func() { manager.processPCM(watch) })

	waitForAudioPatternInternalCondition(t, func() bool {
		workers, _, watches, sessions := manager.ResourceCounts()
		return workers == 1 && watches == 1 && sessions == 1
	}, "active watcher resources")

	manager.Close()
	manager.Close() // idempotent teardown must not close the backend twice.
	manager.Wait()

	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("resources after Close/Wait = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
	closeCalls, waitCalls, stopCalls := backend.counts()
	if closeCalls != 1 || waitCalls != 1 || stopCalls != 1 {
		t.Fatalf("backend lifecycle = close:%d wait:%d session-stop:%d, want 1/1/1", closeCalls, waitCalls, stopCalls)
	}
}

func TestAudioPatternRuntimeInternalConcurrentWaitIsMonotonic(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	manager.runWorker(func() { manager.processPCM(watch) })
	manager.Close()

	const waiters = 32
	start := make(chan struct{})
	var waits sync.WaitGroup
	waits.Add(waiters)
	for index := 0; index < waiters; index++ {
		go func() {
			defer waits.Done()
			<-start
			manager.Wait()
		}()
	}
	close(start)
	waits.Wait()

	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("resources after concurrent Wait = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
	closeCalls, waitCalls, stopCalls := backend.counts()
	if closeCalls != 1 || waitCalls != 1 || stopCalls != 1 {
		t.Fatalf("concurrent backend lifecycle = close:%d wait:%d session-stop:%d, want 1/1/1", closeCalls, waitCalls, stopCalls)
	}

	backend.mu.Lock()
	backend.waitErr = errors.New("a later backend wait must not run")
	backend.mu.Unlock()
	manager.Wait()
	_, waitCalls, _ = backend.counts()
	if waitCalls != 1 {
		t.Fatalf("backend Wait calls after confirmed release = %d, want 1", waitCalls)
	}
	workers, pending, watches, sessions = manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("confirmed release regressed = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
}

func TestAudioPatternRuntimeInternalCountsUseRaceSafeOwnerSnapshot(t *testing.T) {
	manager := &AudioPatternRuntime{
		pending: map[uint64]audioPatternPendingStart{},
		watches: map[string]*audioPatternWatch{},
	}
	watch := &audioPatternWatch{id: "audio-watch-counts"}
	manager.watches[watch.id] = watch
	settle := func(interface{}) error { return nil }
	event := &audioPatternMatchEvent{PatternID: "order"}

	setOwnerState := func() {
		watch.startReject = settle
		watch.onceResolve = settle
		watch.onceReject = settle
		watch.waitResolve = settle
		watch.waitReject = settle
		watch.inFlight = true
		watch.deferred = event
		watch.publishOwnerPending()
	}
	clearOwnerState := func() {
		watch.startReject = nil
		watch.onceResolve = nil
		watch.onceReject = nil
		watch.waitResolve = nil
		watch.waitReject = nil
		watch.inFlight = false
		watch.deferred = nil
		watch.publishOwnerPending()
	}

	setOwnerState()
	if _, pending, watches, _ := manager.ResourceCounts(); pending != 5 || watches != 1 {
		t.Fatalf("full owner snapshot = pending:%d watches:%d, want 5/1", pending, watches)
	}
	if workers, callbacks := manager.AsyncCounts(); workers != 0 || callbacks != 6 {
		t.Fatalf("full async snapshot = workers:%d callbacks:%d, want 0/6", workers, callbacks)
	}

	stop := make(chan struct{})
	var readers sync.WaitGroup
	for index := 0; index < 4; index++ {
		readers.Add(1)
		go func() {
			defer readers.Done()
			for {
				select {
				case <-stop:
					return
				default:
					manager.ResourceCounts()
					manager.AsyncCounts()
				}
			}
		}()
	}
	for index := 0; index < 10_000; index++ {
		setOwnerState()
		watch.queueMu.Lock()
		watch.queued = event
		watch.scheduled = true
		watch.queueMu.Unlock()
		runtime.Gosched()
		watch.queueMu.Lock()
		watch.queued = nil
		watch.scheduled = false
		watch.queueMu.Unlock()
		clearOwnerState()
	}
	close(stop)
	readers.Wait()

	if _, pending, watches, _ := manager.ResourceCounts(); pending != 0 || watches != 1 {
		t.Fatalf("cleared owner snapshot = pending:%d watches:%d, want 0/1", pending, watches)
	}
	if workers, callbacks := manager.AsyncCounts(); workers != 0 || callbacks != 1 {
		t.Fatalf("cleared async snapshot = workers:%d callbacks:%d, want 0/1", workers, callbacks)
	}
}

func TestAudioPatternRuntimeInternalCloseStopsInputBeforePromiseSettlement(t *testing.T) {
	manager, backend, _ := newAudioPatternInternalTestRuntime(t)
	watchContext, watchCancel := context.WithCancel(manager.context)
	watch := &audioPatternWatch{
		owner: manager, id: "audio-watch-close-order", operation: "Audio.watchSound",
		status: audioPatternListening, context: watchContext, cancel: watchCancel,
	}
	watch.accepting.Store(true)
	manager.watches[watch.id] = watch

	settlements := 0
	checkBoundary := func(interface{}) error {
		backend.mu.Lock()
		closes := backend.closes
		backend.mu.Unlock()
		if closes != 1 || watch.accepting.Load() || watch.status != audioPatternStopping {
			t.Fatalf("Promise settled before capture boundary: close=%d accepting=%t status=%s", closes, watch.accepting.Load(), watch.status)
		}
		settlements++
		return nil
	}
	_, pendingCancel := context.WithCancel(manager.context)
	manager.pending[1] = audioPatternPendingStart{
		id: "audio-watch-pending", operation: "Audio.watchSound", cancel: pendingCancel,
		reject: checkBoundary,
	}
	watch.waitReject = checkBoundary

	manager.Close()
	manager.Wait()
	if settlements != 2 {
		t.Fatalf("Promise settlements = %d, want 2", settlements)
	}
}

func TestAudioPatternRuntimeInternalRetainsCleanupEvidenceWhenBackendWaitFails(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	manager.runWorker(func() { manager.processPCM(watch) })
	backend.waitErr = context.DeadlineExceeded

	manager.Close()
	manager.Wait()
	_, _, watches, sessions := manager.ResourceCounts()
	if watches != 1 || sessions != 1 {
		t.Fatalf("failed backend Wait cleanup evidence = watches:%d sessions:%d, want 1/1", watches, sessions)
	}

	backend.waitErr = nil
	manager.Wait()
	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("resources after successful retry = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
}

func TestAudioPatternRuntimeInternalBackendWaitFailureUsesSingleSentinel(t *testing.T) {
	manager, backend, _ := newAudioPatternInternalTestRuntime(t)
	backend.waitErr = context.DeadlineExceeded

	manager.Close()
	manager.Wait()
	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 1 {
		t.Fatalf("backend Wait sentinel = workers:%d pending:%d watches:%d sessions:%d, want 0/0/0/1", workers, pending, watches, sessions)
	}

	backend.waitErr = nil
	manager.Wait()
	workers, pending, watches, sessions = manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("resources after sentinel retry = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
	_, waitCalls, _ := backend.counts()
	if waitCalls != 2 {
		t.Fatalf("backend Wait retry calls = %d, want 2", waitCalls)
	}
}

func TestAudioPatternRuntimeInternalSessionWaitFailureMarksWatcherFailed(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	manager.runWorker(func() { manager.processPCM(watch) })
	backend.sessionWaitErr = context.DeadlineExceeded

	if !manager.requestStop(watch, nil, false) {
		t.Fatal("explicit stop was rejected for a listening watcher")
	}
	waitForAudioPatternInternalCondition(t, func() bool { return loop.pendingCount() == 1 }, "session Wait failure completion")
	if !loop.runNext(manager.runtime) {
		t.Fatal("session Wait failure completion was not queued")
	}
	if watch.terminal == nil || watch.terminal.status != audioPatternFailed || watch.status != audioPatternFailed {
		t.Fatalf("session Wait failure terminal = status:%s result:%#v, want failed", watch.status, watch.terminal)
	}
	_, _, watches, sessions := manager.ResourceCounts()
	if watches == 0 || sessions == 0 || backend.activeSessionCount() == 0 {
		t.Fatalf("unconfirmed session cleanup evidence = watches:%d sessions:%d backendActive:%d", watches, sessions, backend.activeSessionCount())
	}
	if workers, callbacks := manager.AsyncCounts(); workers != 0 || callbacks != 0 {
		t.Fatalf("terminal cleanup evidence kept script alive: workers:%d callbacks:%d", workers, callbacks)
	}
	startsBefore := backend.startCount()
	retry := manager.start(options, "Audio.watchSound", nil, false).Export().(*goja.Promise)
	if retry.State() != goja.PromiseStateRejected {
		t.Fatalf("watch start with orphan session = %v, want rejected", retry.State())
	}
	if code := retry.Result().ToObject(manager.runtime).Get("code").String(); code != string(AudioPatternResourceLimit) {
		t.Fatalf("watch start with orphan session code = %q, want %q", code, AudioPatternResourceLimit)
	}
	if backend.startCount() != startsBefore {
		t.Fatalf("backend starts after orphan session = %d, want %d", backend.startCount(), startsBefore)
	}

	manager.Close()
	manager.Wait()
	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 || backend.activeSessionCount() != 0 {
		t.Fatalf("resources after backend Close/Wait = workers:%d pending:%d watches:%d sessions:%d backendActive:%d", workers, pending, watches, sessions, backend.activeSessionCount())
	}
}

func TestAudioPatternRuntimeInternalOneShotRejectsWhenSessionWaitFails(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	watchContext, watchCancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(watchContext, watchCancel, "audio-watch-once-cleanup", "Audio.waitForSound", options, true)
	if err != nil {
		watchCancel()
		t.Fatal(err)
	}
	watch := result.watch
	resolved := 0
	rejected := 0
	watch.onceResolve = func(interface{}) error {
		resolved++
		return nil
	}
	watch.onceReject = func(interface{}) error {
		rejected++
		return nil
	}
	watch.onceMatch = &audioPatternMatchEvent{PatternID: "order", Timestamp: time.Now().UTC()}
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()
	manager.runWorker(func() { manager.processPCM(watch) })
	backend.sessionWaitErr = context.DeadlineExceeded

	if !manager.requestStop(watch, nil, false) {
		t.Fatal("one-shot match stop was rejected")
	}
	waitForAudioPatternInternalCondition(t, func() bool { return loop.pendingCount() == 1 }, "one-shot cleanup failure completion")
	if !loop.runNext(manager.runtime) {
		t.Fatal("one-shot cleanup failure completion was not queued")
	}
	if resolved != 0 || rejected != 1 || watch.status != audioPatternFailed {
		t.Fatalf("one-shot cleanup settlement = resolved:%d rejected:%d status:%s, want 0/1/failed", resolved, rejected, watch.status)
	}
	_, _, _, sessions := manager.ResourceCounts()
	if sessions == 0 {
		t.Fatal("one-shot cleanup failure erased orphan session evidence")
	}

	manager.Close()
	manager.Wait()
	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("one-shot resources after backend Close/Wait = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
}

func TestAudioPatternRuntimeInternalCloseRejectsStartupLatchedContinuousWatch(t *testing.T) {
	manager, _, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop

	watchContext, watchCancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(watchContext, watchCancel, "audio-watch-startup-error", "Audio.watchSound", options, false)
	if err != nil {
		watchCancel()
		t.Fatal(err)
	}
	watch := result.watch
	manager.enqueueBackendError(watch, errors.New("capture failed during startup"))

	var rejected interface{}
	rejectCalls := 0
	manager.mu.Lock()
	manager.pending[1] = audioPatternPendingStart{
		id:        watch.id,
		operation: watch.operation,
		once:      false,
		reject: func(value interface{}) error {
			rejectCalls++
			rejected = value
			return nil
		},
		cancel: watchCancel,
	}
	manager.mu.Unlock()

	manager.finishStart(1, options, result, nil)
	if watch.startReject == nil {
		t.Fatal("startup-latched continuous watcher did not retain its start rejection")
	}
	_, pending, watches, sessions := manager.ResourceCounts()
	if pending != 1 || watches != 1 || sessions != 1 {
		t.Fatalf("startup-latched resources = pending:%d watches:%d sessions:%d, want 1/1/1", pending, watches, sessions)
	}

	manager.Close()
	if rejectCalls != 1 {
		t.Fatalf("Close invoked startup rejection %d times, want 1", rejectCalls)
	}
	if watch.startReject != nil {
		t.Fatal("Close retained startup rejection after invoking it")
	}
	errorObject, ok := rejected.(*goja.Object)
	if !ok {
		t.Fatalf("Close rejection = %T, want *goja.Object", rejected)
	}
	if code := errorObject.Get("code").String(); code != string(AudioPatternCanceled) {
		t.Fatalf("Close rejection code = %q, want %q", code, AudioPatternCanceled)
	}
	_, pending, watches, sessions = manager.ResourceCounts()
	if pending != 0 || watches != 1 || sessions != 1 {
		t.Fatalf("resources immediately after Close = pending:%d watches:%d sessions:%d, want 0/1/1 until backend Wait confirms release", pending, watches, sessions)
	}

	manager.Wait()
	workers, pending, watches, sessions := manager.ResourceCounts()
	if workers != 0 || pending != 0 || watches != 0 || sessions != 0 {
		t.Fatalf("resources after Close/Wait = workers:%d pending:%d watches:%d sessions:%d", workers, pending, watches, sessions)
	}
}

func TestAudioPatternRuntimeInternalStopsSessionReturnedWithStartError(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	startErr := errors.New("backend returned a session and an error")
	backend.startErr = startErr

	watchContext, watchCancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(watchContext, watchCancel, "audio-watch-start-error", "Audio.watchSound", options, false)
	if result != nil {
		t.Fatalf("prepareWatch result = %#v, want nil", result)
	}
	var audioErr *AudioError
	if !errors.As(err, &audioErr) || audioErr.Code != AudioBackendFailed {
		t.Fatalf("prepareWatch error = %v, want sanitized BACKEND_FAILED", err)
	}
	if strings.Contains(err.Error(), startErr.Error()) {
		t.Fatalf("prepareWatch error leaked backend detail: %v", err)
	}
	_, _, stopCalls := backend.counts()
	if stopCalls != 1 || backend.activeSessionCount() != 0 {
		t.Fatalf("session cleanup after Start error = stops:%d active:%d, want 1/0", stopCalls, backend.activeSessionCount())
	}

	manager.Close()
	manager.Wait()
}

func TestWrapAudioCaptureBackendErrorSanitizesNativeDetails(t *testing.T) {
	secret := "Headphones of Alice /Applications/Shop.app pid=4242"
	tests := []struct {
		name string
		err  error
		code AudioErrorCode
	}{
		{name: "unknown", err: errors.New(secret), code: AudioBackendFailed},
		{name: "known", err: audioOperationError("native", AudioPatternPermissionDenied, secret, errors.New(secret)), code: AudioPatternPermissionDenied},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := wrapAudioCaptureBackendError("Audio.waitForSound", test.err)
			var audioErr *AudioError
			if !errors.As(err, &audioErr) || audioErr.Code != test.code || audioErr.Operation != "Audio.waitForSound" {
				t.Fatalf("sanitized error = %#v, want code %s", err, test.code)
			}
			if strings.Contains(err.Error(), secret) || audioErr.Cause != nil {
				t.Fatalf("sanitized error retained native detail: %#v", audioErr)
			}
		})
	}
}

func TestAudioPatternRuntimeInternalPromiseSettlementReportsAbruptErrors(t *testing.T) {
	manager, _, _ := newAudioPatternInternalTestRuntime(t)
	reported := make(chan error, 2)
	manager.onAsyncError = func(err error) { reported <- err }
	sentinel := errors.New("promise reaction failed")
	manager.settlePromise(func(interface{}) error { return sentinel }, nil)
	select {
	case err := <-reported:
		if !errors.Is(err, sentinel) {
			t.Fatalf("reported settlement error = %v, want sentinel", err)
		}
	default:
		t.Fatal("Promise settlement error was not reported")
	}

	manager.closing.Store(true)
	manager.settlePromise(func(interface{}) error { return &goja.InterruptedError{} }, nil)
	select {
	case err := <-reported:
		t.Fatalf("teardown Interrupt was reported as an async error: %v", err)
	default:
	}
	manager.settlePromise(func(interface{}) error { return sentinel }, nil)
	select {
	case err := <-reported:
		if !errors.Is(err, sentinel) {
			t.Fatalf("teardown non-Interrupt settlement error = %v, want sentinel", err)
		}
	default:
		t.Fatal("teardown swallowed a non-Interrupt settlement error")
	}

	manager.cancel()
}

func TestAudioPatternRuntimeInternalCapabilityFailsClosedWithoutVerificationOrNativeExclusion(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	t.Cleanup(func() {
		manager.Close()
		manager.Wait()
	})

	base := backend.Capabilities()
	capability := manager.capabilityPayload()
	if capability["supported"] != false || capability["verified"] != true {
		t.Fatalf("capability without EventLoop did not fail closed: %#v", capability)
	}
	manager.loop = &audioPatternInternalQueuedLoop{}
	base.Verified = false
	backend.capabilities = &base
	capability = manager.capabilityPayload()
	if capability["supported"] != false || capability["verified"] != false {
		t.Fatalf("unverified capability did not fail closed: %#v", capability)
	}
	if err := manager.validateCapability(options.source, "Audio.watchSound"); err == nil {
		t.Fatal("unverified backend was allowed to start")
	}

	base.Verified = true
	base.SelfPlaybackExclusion = "runtime-guard"
	backend.capabilities = &base
	capability = manager.capabilityPayload()
	sources := capability["sources"].(map[string]interface{})
	system := sources["system"].(map[string]interface{})
	if system["supported"] != false || capability["selfPlaybackExclusion"] != "unavailable" {
		t.Fatalf("unimplemented runtime guard was advertised: %#v", capability)
	}
}

func TestAudioPatternRuntimeInternalSanitizesCapabilityAndSessionMetadata(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	manager.loop = &audioPatternInternalQueuedLoop{}
	capability := backend.Capabilities()
	capability.Platform = "secret platform /Users/alice"
	capability.Backend = "device:Alice Headphones"
	capability.Notes = "pid=4242 /Applications/Shop.app"
	backend.capabilities = &capability
	backend.sessionBackend = "device:Alice Headphones"

	payload := manager.capabilityPayload()
	if payload["platform"] != runtime.GOOS || payload["backend"] != backend.Name() {
		t.Fatalf("sanitized capability identifiers = platform:%q backend:%q", payload["platform"], payload["backend"])
	}
	for _, value := range []string{payload["platform"].(string), payload["backend"].(string), payload["notes"].(string)} {
		if strings.Contains(value, "alice") || strings.Contains(value, "Alice") || strings.Contains(value, "4242") || strings.Contains(value, "/Applications") {
			t.Fatalf("capability metadata leaked backend detail: %q", value)
		}
	}

	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	if watch.backend != backend.Name() {
		t.Fatalf("sanitized session backend = %q, want %q", watch.backend, backend.Name())
	}
	manager.stopOrphan(watch)
	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalStopsLateStartupSessionAndRejectsTimeout(t *testing.T) {
	manager, backend, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	manager.loop = loop
	backend.returnAfterContextDone = true
	options.startupTimeout = 50 * time.Millisecond

	value := manager.start(options, "Audio.watchSound", nil, false)
	promise, ok := value.Export().(*goja.Promise)
	if !ok {
		t.Fatalf("Audio.watchSound returned %T, want Promise", value.Export())
	}
	waitForAudioPatternInternalCondition(t, func() bool { return loop.pendingCount() == 1 }, "late-start timeout completion")
	if !loop.runNext(manager.runtime) {
		t.Fatal("late-start timeout completion was not queued")
	}
	if promise.State() != goja.PromiseStateRejected {
		t.Fatalf("late-start Promise state = %v, want rejected", promise.State())
	}
	errorObject := promise.Result().ToObject(manager.runtime)
	if code := errorObject.Get("code").String(); code != string(AudioPatternTimeout) {
		t.Fatalf("late-start rejection code = %q, want %q", code, AudioPatternTimeout)
	}
	if operation := errorObject.Get("operation").String(); operation != "Audio.watchSound" {
		t.Fatalf("late-start rejection operation = %q, want Audio.watchSound", operation)
	}
	_, _, stopCalls := backend.counts()
	if stopCalls != 1 || backend.activeSessionCount() != 0 {
		t.Fatalf("late-start session cleanup = stops:%d active:%d, want 1/0", stopCalls, backend.activeSessionCount())
	}

	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalLateCallbackRejectionAfterExplicitStop(t *testing.T) {
	manager, _, options := newAudioPatternInternalTestRuntime(t)
	loop := &audioPatternInternalQueuedLoop{}
	asyncErrors := make(chan error, 1)
	manager.loop = loop
	manager.onAsyncError = func(err error) { asyncErrors <- err }

	watchContext, watchCancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(watchContext, watchCancel, "audio-watch-late-callback", "Audio.watchSound", options, false)
	if err != nil {
		watchCancel()
		t.Fatal(err)
	}
	callbackValue, err := manager.runtime.RunString(`
		globalThis.__audioPatternLateReject = undefined;
		(() => new Promise((resolve, reject) => {
			globalThis.__audioPatternLateReject = reject;
		}))
	`)
	if err != nil {
		watchCancel()
		t.Fatal(err)
	}
	callback, ok := goja.AssertFunction(callbackValue)
	if !ok {
		watchCancel()
		t.Fatalf("callback value = %T, want function", callbackValue.Export())
	}

	manager.mu.Lock()
	manager.pending[1] = audioPatternPendingStart{
		id:        result.watch.id,
		operation: result.watch.operation,
		callback:  callback,
		once:      false,
		resolve:   func(interface{}) error { return nil },
		reject:    func(interface{}) error { return nil },
		cancel:    watchCancel,
	}
	manager.mu.Unlock()
	manager.finishStart(1, options, result, nil)
	watch := result.watch

	manager.enqueueMatch(watch, audioPatternMatchEvent{
		SchemaVersion: 1,
		Type:          "audio.pattern.matched",
		WatchID:       watch.id,
		PatternID:     "order",
		Timestamp:     time.Now().UTC(),
	})
	if !loop.runNext(manager.runtime) {
		t.Fatal("match callback dispatch was not queued")
	}
	if !watch.inFlight {
		t.Fatal("callback Promise was not retained as in-flight")
	}
	if !manager.requestStop(watch, nil, false) {
		t.Fatal("explicit stop was rejected for a listening watcher")
	}
	if _, err := manager.runtime.RunString(`__audioPatternLateReject(new Error("late callback rejection"));`); err != nil {
		t.Fatal(err)
	}
	if watch.inFlight {
		t.Fatal("late callback rejection retained the in-flight marker")
	}
	if watch.status != audioPatternStopping || watch.terminal != nil {
		t.Fatalf("late callback rejection changed an in-progress stop: status:%s terminal:%#v", watch.status, watch.terminal)
	}
	select {
	case err := <-asyncErrors:
		t.Fatalf("late callback error was reported before watcher stop settled: %v", err)
	default:
	}

	waitForAudioPatternInternalCondition(t, func() bool { return loop.pendingCount() == 1 }, "explicit stop completion")
	if !loop.runNext(manager.runtime) {
		t.Fatal("explicit stop completion was not queued")
	}
	if watch.status != audioPatternStopped || watch.terminal == nil || watch.terminal.status != audioPatternStopped {
		t.Fatalf("watch terminal state before callback settlement = status:%s terminal:%#v", watch.status, watch.terminal)
	}
	terminal := watch.terminal
	select {
	case err := <-asyncErrors:
		var audioErr *AudioError
		if !errors.As(err, &audioErr) || audioErr.Code != AudioPatternCallbackFailed {
			t.Fatalf("late callback error = %#v, want CALLBACK_FAILED", err)
		}
	case <-time.After(time.Second):
		t.Fatal("late callback rejection was not reported asynchronously")
	}
	if watch.status != audioPatternStopped || watch.terminal != terminal || watch.terminal.status != audioPatternStopped || watch.terminal.err != "" {
		t.Fatalf("late callback rejection changed terminal state: status:%s terminal:%#v", watch.status, watch.terminal)
	}

	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalWatcherWaitUsesOneBoundedPromise(t *testing.T) {
	manager, _, options := newAudioPatternInternalTestRuntime(t)
	watch := prepareAudioPatternInternalTestWatch(t, manager, options)
	manager.mu.Lock()
	manager.watches[watch.id] = watch
	manager.mu.Unlock()

	first := manager.waitWatcher(watch)
	for index := 0; index < 1000; index++ {
		if next := manager.waitWatcher(watch); !first.StrictEquals(next) {
			t.Fatalf("wait call %d returned a different Promise", index+2)
		}
	}
	_, pending, watches, _ := manager.ResourceCounts()
	if pending != 1 || watches != 1 {
		t.Fatalf("repeated wait resources = pending:%d watches:%d, want 1/1", pending, watches)
	}

	manager.finishStop(watch, nil, false, false)
	promise, ok := first.Export().(*goja.Promise)
	if !ok || promise.State() != goja.PromiseStateFulfilled {
		t.Fatalf("cached wait Promise = %#v, want fulfilled", first.Export())
	}
	if next := manager.waitWatcher(watch); !first.StrictEquals(next) {
		t.Fatal("terminal watcher did not retain the bounded wait Promise")
	}
	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalCallbackUsesCapturedPromiseIntrinsics(t *testing.T) {
	manager, _, _ := newAudioPatternInternalTestRuntime(t)
	watch := &audioPatternWatch{owner: manager, status: audioPatternListening, inFlight: true}
	if err := manager.runtime.Set("Promise", goja.Undefined()); err != nil {
		t.Fatal(err)
	}

	manager.awaitCallback(watch, manager.runtime.ToValue(1))
	if watch.inFlight {
		t.Fatal("mutating global Promise stranded a fulfilled callback")
	}
	if watch.status != audioPatternListening {
		t.Fatalf("fulfilled callback changed watcher status to %s", watch.status)
	}
	manager.Close()
	manager.Wait()
}

func TestAudioPatternRuntimeInternalDoesNotCoerceCallbackRejectionReason(t *testing.T) {
	manager, _, _ := newAudioPatternInternalTestRuntime(t)
	asyncErrors := make(chan error, 1)
	manager.onAsyncError = func(err error) { asyncErrors <- err }
	watch := &audioPatternWatch{owner: manager, status: audioPatternStopped, inFlight: true}
	rejected, err := manager.runtime.RunString(`Promise.reject(new Proxy(Object.create(null), {
		get() { throw new Error('rejection reason must not be coerced'); }
	}))`)
	if err != nil {
		t.Fatal(err)
	}

	manager.awaitCallback(watch, rejected)
	if watch.inFlight {
		t.Fatal("hostile rejection reason stranded the callback in-flight")
	}
	select {
	case err := <-asyncErrors:
		var audioErr *AudioError
		if !errors.As(err, &audioErr) || audioErr.Code != AudioPatternCallbackFailed {
			t.Fatalf("callback rejection error = %#v, want CALLBACK_FAILED", err)
		}
		if strings.Contains(err.Error(), "must not be coerced") {
			t.Fatalf("callback rejection reason was coerced: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("hostile callback rejection was not reported")
	}
	manager.Close()
	manager.Wait()
}

func newAudioPatternInternalTestRuntime(t *testing.T) (*AudioPatternRuntime, *audioPatternInternalFakeBackend, audioPatternWatchOptions) {
	t.Helper()
	workDir := t.TempDir()
	referencePath := filepath.Join(workDir, "order.wav")
	samples := make([]float64, audioPatternCanonicalSampleRate/4)
	for index := range samples {
		samples[index] = 0.6 * math.Sin(2*math.Pi*660*float64(index)/audioPatternCanonicalSampleRate)
	}
	writeAudioPatternTestWAV(t, referencePath, audioPatternCanonicalSampleRate, samples)

	runtimeValue := goja.New()
	ctx, cancel := context.WithCancel(context.Background())
	backend := &audioPatternInternalFakeBackend{sessions: map[*audioPatternInternalFakeSession]struct{}{}}
	manager := &AudioPatternRuntime{
		runtime: runtimeValue,
		context: ctx,
		cancel:  cancel,
		workDir: workDir,
		backend: backend,
		pending: map[uint64]audioPatternPendingStart{},
		watches: map[string]*audioPatternWatch{},
	}
	manager.capturePromiseIntrinsics()
	options := audioPatternWatchOptions{
		source:         AudioCaptureSource{Type: AudioCaptureSourceSystem},
		references:     []audioPatternReferenceSpec{{id: "order", path: filepath.Base(referencePath)}},
		threshold:      0.9,
		cooldown:       time.Second,
		startupTimeout: time.Second,
	}
	return manager, backend, options
}

func prepareAudioPatternInternalTestWatch(t *testing.T, manager *AudioPatternRuntime, options audioPatternWatchOptions) *audioPatternWatch {
	t.Helper()
	ctx, cancel := context.WithCancel(manager.context)
	result, err := manager.prepareWatch(ctx, cancel, "audio-watch-test", "Audio.watchSound", options, false)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	if result == nil || result.watch == nil {
		cancel()
		t.Fatal("prepareWatch returned no watcher")
	}
	return result.watch
}

func waitForAudioPatternInternalCondition(t *testing.T, condition func() bool, description string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for !condition() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", description)
		}
		time.Sleep(time.Millisecond)
	}
}

type audioPatternInternalFakeBackend struct {
	mu                      sync.Mutex
	starts                  int
	closes                  int
	waits                   int
	waitErr                 error
	sessionWaitErr          error
	stops                   int
	startErr                error
	returnAfterContextDone  bool
	capabilities            *AudioCaptureCapabilities
	sessionBackend          string
	sessionSourceUnverified bool
	sessions                map[*audioPatternInternalFakeSession]struct{}
}

type audioPatternInternalQueuedLoop struct {
	mu        sync.Mutex
	calls     int
	callbacks []func(*goja.Runtime)
}

func (l *audioPatternInternalQueuedLoop) RunOnLoop(callback func(*goja.Runtime)) bool {
	l.mu.Lock()
	l.calls++
	l.callbacks = append(l.callbacks, callback)
	l.mu.Unlock()
	return true
}

func (l *audioPatternInternalQueuedLoop) count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.calls
}

func (l *audioPatternInternalQueuedLoop) pendingCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.callbacks)
}

func (l *audioPatternInternalQueuedLoop) runNext(runtimeValue *goja.Runtime) bool {
	l.mu.Lock()
	if len(l.callbacks) == 0 {
		l.mu.Unlock()
		return false
	}
	callback := l.callbacks[0]
	l.callbacks = l.callbacks[1:]
	l.mu.Unlock()
	callback(runtimeValue)
	return true
}

func (b *audioPatternInternalFakeBackend) Name() string { return "internal-fake" }

func (b *audioPatternInternalFakeBackend) Capabilities() AudioCaptureCapabilities {
	if b.capabilities != nil {
		return *b.capabilities
	}
	return AudioCaptureCapabilities{
		Supported:             true,
		Platform:              "test",
		Backend:               b.Name(),
		Verified:              true,
		Permission:            "none",
		SystemMix:             true,
		SelfPlaybackExclusion: "native",
	}
}

func (b *audioPatternInternalFakeBackend) Start(ctx context.Context, options AudioCaptureOptions, sink AudioCaptureSink) (AudioCaptureSession, error) {
	b.mu.Lock()
	b.starts++
	sessionBackend := b.sessionBackend
	if sessionBackend == "" {
		sessionBackend = b.Name()
	}
	session := &audioPatternInternalFakeSession{
		owner: b,
		sink:  sink,
		info: AudioCaptureSessionInfo{
			ID:             "internal-session",
			Backend:        sessionBackend,
			SourceScope:    "system-mix",
			SourceVerified: !b.sessionSourceUnverified,
			SampleRate:     options.SampleRate,
			Channels:       options.Channels,
			StartedAt:      time.Now().UTC(),
		},
	}
	b.sessions[session] = struct{}{}
	startErr := b.startErr
	returnAfterContextDone := b.returnAfterContextDone
	b.mu.Unlock()
	if returnAfterContextDone {
		<-ctx.Done()
	}
	return session, startErr
}

func (b *audioPatternInternalFakeBackend) Close() error {
	b.mu.Lock()
	b.closes++
	sessions := make([]*audioPatternInternalFakeSession, 0, len(b.sessions))
	for session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		_ = session.Stop(context.Background())
	}
	return nil
}

func (b *audioPatternInternalFakeBackend) Wait(context.Context) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.waits++
	if b.waitErr != nil {
		return b.waitErr
	}
	// A successful backend-wide join confirms release of any session whose
	// bounded session Wait previously failed or timed out.
	b.sessions = map[*audioPatternInternalFakeSession]struct{}{}
	return nil
}

func (b *audioPatternInternalFakeBackend) startCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.starts
}

func (b *audioPatternInternalFakeBackend) counts() (closes, waits, stops int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.closes, b.waits, b.stops
}

func (b *audioPatternInternalFakeBackend) activeSessionCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.sessions)
}

type audioPatternInternalFakeSession struct {
	owner   *audioPatternInternalFakeBackend
	sink    AudioCaptureSink
	info    AudioCaptureSessionInfo
	stopped bool
}

func (s *audioPatternInternalFakeSession) Info() AudioCaptureSessionInfo { return s.info }

func (s *audioPatternInternalFakeSession) Wait(context.Context) error {
	s.owner.mu.Lock()
	defer s.owner.mu.Unlock()
	if s.owner.sessionWaitErr != nil {
		return s.owner.sessionWaitErr
	}
	delete(s.owner.sessions, s)
	return nil
}

func (s *audioPatternInternalFakeSession) Stop(context.Context) error {
	s.owner.mu.Lock()
	defer s.owner.mu.Unlock()
	if s.stopped {
		return nil
	}
	s.stopped = true
	s.sink = AudioCaptureSink{}
	s.owner.stops++
	return nil
}
