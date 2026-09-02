package automation

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/faiface/beep"
	"github.com/faiface/beep/mp3"
	"github.com/faiface/beep/speaker"
	"github.com/faiface/beep/wav"
)

type SoundErrorCode string

const (
	SoundInvalidArgument   SoundErrorCode = "INVALID_ARGUMENT"
	SoundNotFound          SoundErrorCode = "NOT_FOUND"
	SoundUnsupportedFormat SoundErrorCode = "UNSUPPORTED_FORMAT"
	SoundBackendFailed     SoundErrorCode = "BACKEND_FAILED"
	SoundCanceled          SoundErrorCode = "CANCELED"
)

// SoundError is projected to JavaScript as an Error with stable code and
// operation properties. The original path is retained for compatibility in
// the message; callers should avoid forwarding it to public logs.
type SoundError struct {
	Code      SoundErrorCode
	Operation string
	Message   string
	Cause     error
}

func (e *SoundError) Error() string {
	if e == nil {
		return ""
	}
	message := strings.TrimSpace(e.Message)
	if message == "" && e.Cause != nil {
		message = e.Cause.Error()
	}
	if message == "" {
		message = "sound operation failed"
	}
	if e.Cause != nil && e.Message != "" {
		message += ": " + e.Cause.Error()
	}
	return string(e.Code) + ": " + message
}

func (e *SoundError) Unwrap() error { return e.Cause }

func (e *SoundError) JSProperties() map[string]interface{} {
	return map[string]interface{}{
		"code":      string(e.Code),
		"operation": e.Operation,
	}
}

type soundStartOptions struct {
	loop bool
}

type soundEventLoop interface {
	RunOnLoop(func(*goja.Runtime)) bool
}

type soundWaiter struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
}

// The beep speaker is process-global. Keep one initialized speaker for all
// Sound instances and resample later streams to its first sample rate. It is
// intentionally kept alive for the process: speaker.Close waits on a platform
// driver and can deadlock when that driver is already blocked in Write.
var globalSoundOutput = struct {
	mu          sync.Mutex
	initialized bool
	sampleRate  beep.SampleRate
	active      int
}{}

func acquireSoundOutput(sampleRate beep.SampleRate) (beep.SampleRate, error) {
	if sampleRate <= 0 {
		return 0, fmt.Errorf("invalid audio sample rate: %d", sampleRate)
	}

	globalSoundOutput.mu.Lock()
	defer globalSoundOutput.mu.Unlock()
	if !globalSoundOutput.initialized {
		if err := speaker.Init(sampleRate, sampleRate.N(time.Second/10)); err != nil {
			return 0, err
		}
		globalSoundOutput.sampleRate = sampleRate
		globalSoundOutput.initialized = true
	}
	globalSoundOutput.active++
	return globalSoundOutput.sampleRate, nil
}

func releaseSoundOutput() {
	globalSoundOutput.mu.Lock()
	defer globalSoundOutput.mu.Unlock()
	if globalSoundOutput.active > 0 {
		globalSoundOutput.active--
	}
}

// Sound provides both the legacy blocking convenience methods and an
// execution-scoped, controllable playback session API.
type Sound struct {
	defaultSoundsDir string
	publicDir        string

	runtime      *goja.Runtime
	loop         soundEventLoop
	context      context.Context
	cancel       context.CancelFunc
	onAsyncError func(error)
	closing      atomic.Bool
	workers      sync.WaitGroup
	workerCount  atomic.Int64
	mu           sync.Mutex
	nextID       uint64
	nextWaitID   uint64
	active       map[string]*SoundPlayback
	pendingWaits map[uint64]soundWaiter
}

// NewSound creates a standalone Sound instance for native callers and tests.
func NewSound() *Sound {
	return newSound(nil, nil, context.Background(), nil)
}

func newSound(runtimeValue *goja.Runtime, loop soundEventLoop, parent context.Context, onAsyncError func(error)) *Sound {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}
	return &Sound{
		defaultSoundsDir: filepath.Join(filepath.Dir(exe), "sounds"),
		publicDir:        "public",
		runtime:          runtimeValue,
		loop:             loop,
		context:          ctx,
		cancel:           cancel,
		onAsyncError:     onAsyncError,
		active:           map[string]*SoundPlayback{},
		pendingWaits:     map[uint64]soundWaiter{},
	}
}

func soundOperationError(operation string, code SoundErrorCode, message string, cause error) error {
	return &SoundError{Code: code, Operation: operation, Message: message, Cause: cause}
}

func wrapSoundError(operation string, err error) error {
	if err == nil {
		return nil
	}
	var soundErr *SoundError
	if errors.As(err, &soundErr) {
		copy := *soundErr
		if copy.Operation == "" {
			copy.Operation = operation
		}
		return &copy
	}
	return soundOperationError(operation, SoundBackendFailed, "sound backend failed", err)
}

func soundJSError(runtimeValue *goja.Runtime, err error) *goja.Object {
	return structuredGoError(runtimeValue, wrapSoundError("", err))
}

// resolveFilePath resolves a predefined sound name or a file path. Relative
// paths are intentionally limited to the documented working-directory and
// packaged-resource search locations.
func (s *Sound) resolveFilePath(soundPath string) (string, error) {
	if soundPath == "" || strings.ContainsRune(soundPath, '\x00') {
		return "", soundOperationError("", SoundInvalidArgument, "sound path must be a non-empty string without NUL", nil)
	}

	predefinedSounds := map[string]string{
		"success": "public/done.mp3",
		"fail":    "public/fail.mp3",
		"warning": "public/warn.mp3",
		// The repository ships one generic negative-feedback asset. Keep the
		// error convenience method usable as a compatibility alias instead of
		// resolving an asset that is not packaged.
		"error":   "public/fail.mp3",
		"captcha": "public/captcha.mp3",
	}
	if predefinedName, ok := predefinedSounds[soundPath]; ok {
		soundPath = predefinedName
	}

	possiblePaths := []string{soundPath}
	if !filepath.IsAbs(soundPath) {
		possiblePaths = append(possiblePaths,
			filepath.Join(s.defaultSoundsDir, soundPath),
			filepath.Join(".", soundPath),
			filepath.Join(s.publicDir, soundPath),
		)
	}
	for _, path := range possiblePaths {
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		if info.IsDir() {
			return "", soundOperationError("", SoundInvalidArgument, "sound path must name a file", nil)
		}
		return path, nil
	}
	return "", soundOperationError("", SoundNotFound, fmt.Sprintf("sound file not found: %s", soundPath), nil)
}

func (s *Sound) openStreamer(soundPath string, operation string) (beep.StreamSeekCloser, beep.Format, string, error) {
	fullPath, err := s.resolveFilePath(soundPath)
	if err != nil {
		return nil, beep.Format{}, "", wrapSoundError(operation, err)
	}
	f, err := os.Open(fullPath)
	if err != nil {
		return nil, beep.Format{}, "", soundOperationError(operation, SoundBackendFailed, "failed to open sound file", err)
	}

	var streamer beep.StreamSeekCloser
	var format beep.Format
	switch strings.ToLower(filepath.Ext(fullPath)) {
	case ".wav":
		streamer, format, err = wav.Decode(f)
	case ".mp3":
		streamer, format, err = mp3.Decode(f)
	default:
		_ = f.Close()
		return nil, beep.Format{}, "", soundOperationError(operation, SoundUnsupportedFormat, fmt.Sprintf("unsupported sound file format: %s", filepath.Ext(fullPath)), nil)
	}
	if err != nil {
		_ = f.Close()
		return nil, beep.Format{}, "", soundOperationError(operation, SoundBackendFailed, "failed to decode sound file", err)
	}
	// The decoder owns the file lifecycle after a successful decode.
	return streamer, format, fullPath, nil
}

func (s *Sound) playSound(soundPath, operation string) error {
	playback, err := s.startPlayback(soundPath, false, operation)
	if err != nil {
		return err
	}
	select {
	case <-playback.done:
	case <-s.context.Done():
		// Goja Interrupt can stop JavaScript bytecode, but it cannot interrupt a
		// Go method blocked here. Stop the execution-owned playback directly so
		// SIGINT, transport cancellation, and execution deadlines can release the
		// Runtime even when the platform audio callback never reports completion.
		_ = playback.stop()
		<-playback.done
		return soundOperationError(operation, SoundCanceled, "sound playback canceled", s.context.Err())
	}
	result := playback.resultSnapshot()
	if result.Status == SoundPlaybackFailed {
		return soundOperationError(operation, SoundBackendFailed, "sound playback failed", errors.New(result.Error))
	}
	return nil
}

// PlaySuccess plays the packaged success sound and waits for completion.
func (s *Sound) PlaySuccess() error { return s.playSound("success", "Sound.playSuccess") }

// PlayFail plays the packaged failure sound and waits for completion.
func (s *Sound) PlayFail() error { return s.playSound("fail", "Sound.playFail") }

// PlayWarning plays the packaged warning sound and waits for completion.
func (s *Sound) PlayWarning() error { return s.playSound("warning", "Sound.playWarning") }

// PlayError plays the packaged error sound and waits for completion.
func (s *Sound) PlayError() error { return s.playSound("error", "Sound.playError") }

// PlayCaptcha plays the packaged captcha sound and waits for completion.
func (s *Sound) PlayCaptcha() error { return s.playSound("captcha", "Sound.playCaptcha") }

// PlaySound is the legacy blocking path-based player.
func (s *Sound) PlaySound(soundPath string) error { return s.playSound(soundPath, "Sound.playSound") }

// Play is an alias for PlaySound and intentionally remains blocking.
func (s *Sound) Play(soundPath string) error { return s.playSound(soundPath, "Sound.play") }

type SoundPlaybackStatus string

const (
	SoundPlaybackPlaying   SoundPlaybackStatus = "playing"
	SoundPlaybackPaused    SoundPlaybackStatus = "paused"
	SoundPlaybackStopping  SoundPlaybackStatus = "stopping"
	SoundPlaybackCompleted SoundPlaybackStatus = "completed"
	SoundPlaybackStopped   SoundPlaybackStatus = "stopped"
	SoundPlaybackFailed    SoundPlaybackStatus = "failed"
)

type SoundPlaybackResult struct {
	ID     string
	Path   string
	Status SoundPlaybackStatus
	Error  string
}

type soundControlState uint32

const (
	soundControlPlaying soundControlState = iota
	soundControlPaused
	soundControlStopped
)

// soundControlStreamer is the concurrency-safe equivalent of beep.Ctrl for
// runtime-owned playback. beep.Ctrl requires speaker.Lock while mutating its
// fields; that lock can be held by the speaker while a platform driver is
// blocked writing audio, which would make stop/pause/resume block the JS API.
type soundControlStreamer struct {
	streamer beep.Streamer
	state    atomic.Uint32
}

func newSoundControlStreamer(streamer beep.Streamer) *soundControlStreamer {
	control := &soundControlStreamer{streamer: streamer}
	control.state.Store(uint32(soundControlPlaying))
	return control
}

func (c *soundControlStreamer) Stream(samples [][2]float64) (int, bool) {
	switch soundControlState(c.state.Load()) {
	case soundControlStopped:
		return 0, false
	case soundControlPaused:
		for i := range samples {
			samples[i] = [2]float64{}
		}
		return len(samples), true
	default:
		return c.streamer.Stream(samples)
	}
}

func (c *soundControlStreamer) Err() error {
	return c.streamer.Err()
}

func (c *soundControlStreamer) setPaused() {
	c.state.Store(uint32(soundControlPaused))
}

func (c *soundControlStreamer) setPlaying() {
	c.state.Store(uint32(soundControlPlaying))
}

func (c *soundControlStreamer) setStopped() {
	c.state.Store(uint32(soundControlStopped))
}

// SoundPlayback is a handle for one non-blocking playback. Its fields are
// private because the JavaScript projection is deliberately explicit.
type SoundPlayback struct {
	owner       *Sound
	id          string
	path        string
	loop        bool
	startedAt   string
	control     *soundControlStreamer
	source      beep.StreamSeekCloser
	done        chan struct{}
	doneOnce    sync.Once
	mu          sync.Mutex
	status      SoundPlaybackStatus
	stopRequest bool
	terminal    bool
	result      SoundPlaybackResult
}

func (p *SoundPlayback) Status() SoundPlaybackStatus {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.status
}

func (p *SoundPlayback) IsPlaying() bool {
	status := p.Status()
	return status == SoundPlaybackPlaying || status == SoundPlaybackPaused || status == SoundPlaybackStopping
}

func (p *SoundPlayback) resultSnapshot() SoundPlaybackResult {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.result
}

func (p *SoundPlayback) resultMap() map[string]interface{} {
	result := p.resultSnapshot()
	value := map[string]interface{}{
		"id":     result.ID,
		"path":   result.Path,
		"status": string(result.Status),
	}
	if result.Error != "" {
		value["error"] = result.Error
	}
	return value
}

func (p *SoundPlayback) finish() {
	p.mu.Lock()
	if p.terminal {
		p.mu.Unlock()
		return
	}
	status := SoundPlaybackCompleted
	message := ""
	if p.stopRequest {
		status = SoundPlaybackStopped
	} else if p.source != nil {
		if err := p.source.Err(); err != nil {
			status = SoundPlaybackFailed
			message = err.Error()
		}
	}
	p.status = status
	p.terminal = true
	p.result = SoundPlaybackResult{ID: p.id, Path: p.path, Status: status, Error: message}
	p.doneOnce.Do(func() { close(p.done) })
	p.mu.Unlock()
}

func (p *SoundPlayback) stop() bool {
	p.mu.Lock()
	if p.terminal || p.stopRequest || p.control == nil {
		p.mu.Unlock()
		return false
	}
	p.stopRequest = true
	p.status = SoundPlaybackStopping
	control := p.control
	control.setStopped()
	p.mu.Unlock()
	// Stop is a logical session transition. Do not wait for the platform audio
	// buffer to drain before notifying JavaScript or tearing down the runtime.
	p.finish()
	return true
}

func (p *SoundPlayback) pause() bool {
	p.mu.Lock()
	if p.terminal || p.stopRequest || p.control == nil || p.status != SoundPlaybackPlaying {
		p.mu.Unlock()
		return false
	}
	control := p.control
	p.status = SoundPlaybackPaused
	control.setPaused()
	p.mu.Unlock()
	return true
}

func (p *SoundPlayback) resume() bool {
	p.mu.Lock()
	if p.terminal || p.stopRequest || p.control == nil || p.status != SoundPlaybackPaused {
		p.mu.Unlock()
		return false
	}
	control := p.control
	p.status = SoundPlaybackPlaying
	control.setPlaying()
	p.mu.Unlock()
	return true
}

func (s *Sound) startPlayback(soundPath string, loop bool, operation string) (*SoundPlayback, error) {
	if s.closing.Load() {
		return nil, soundOperationError(operation, SoundCanceled, "Sound runtime is closing", nil)
	}
	streamer, format, fullPath, err := s.openStreamer(soundPath, operation)
	if err != nil {
		return nil, err
	}
	speakerRate, err := acquireSoundOutput(format.SampleRate)
	if err != nil {
		_ = streamer.Close()
		return nil, soundOperationError(operation, SoundBackendFailed, "failed to initialize speaker", err)
	}

	var stream beep.Streamer = streamer
	if loop {
		stream = beep.Loop(-1, streamer)
	}
	if format.SampleRate != speakerRate {
		stream = beep.Resample(4, format.SampleRate, speakerRate, stream)
	}
	p := &SoundPlayback{
		owner:     s,
		path:      fullPath,
		loop:      loop,
		startedAt: time.Now().UTC().Format(time.RFC3339Nano),
		control:   newSoundControlStreamer(stream),
		source:    streamer,
		done:      make(chan struct{}),
		status:    SoundPlaybackPlaying,
	}

	s.mu.Lock()
	if s.closing.Load() {
		s.mu.Unlock()
		_ = streamer.Close()
		releaseSoundOutput()
		return nil, soundOperationError(operation, SoundCanceled, "Sound runtime is closing", nil)
	}
	s.nextID++
	p.id = fmt.Sprintf("sound-%d", s.nextID)
	s.active[p.id] = p
	s.mu.Unlock()

	s.workerCount.Add(1)
	s.workers.Add(1)
	speaker.Play(beep.Seq(p.control, beep.Callback(p.finish)))
	go s.watchPlayback(p)
	return p, nil
}

func (s *Sound) watchPlayback(p *SoundPlayback) {
	defer s.workerCount.Add(-1)
	defer s.workers.Done()
	<-p.done
	_ = p.source.Close()
	s.mu.Lock()
	if current, ok := s.active[p.id]; ok && current == p {
		delete(s.active, p.id)
	}
	s.mu.Unlock()
	releaseSoundOutput()
}

func (s *Sound) stop(id string) bool {
	s.mu.Lock()
	p := s.active[id]
	s.mu.Unlock()
	if p == nil {
		return false
	}
	return p.stop()
}

func (s *Sound) stopAll() int {
	s.mu.Lock()
	playbacks := make([]*SoundPlayback, 0, len(s.active))
	for _, p := range s.active {
		playbacks = append(playbacks, p)
	}
	s.mu.Unlock()
	stopped := 0
	for _, p := range playbacks {
		if p.stop() {
			stopped++
		}
	}
	return stopped
}

func (s *Sound) activeSnapshot() []map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := make([]map[string]interface{}, 0, len(s.active))
	for _, p := range s.active {
		p.mu.Lock()
		item := map[string]interface{}{
			"id":        p.id,
			"path":      p.path,
			"status":    string(p.status),
			"loop":      p.loop,
			"startedAt": p.startedAt,
		}
		p.mu.Unlock()
		result = append(result, item)
	}
	return result
}

func (s *Sound) waitPlayback(p *SoundPlayback) goja.Value {
	if s.loop == nil || s.runtime == nil {
		return s.rejected(soundOperationError("SoundPlayback.wait", SoundBackendFailed, "Sound playback wait requires the execution EventLoop", nil))
	}
	promise, resolve, reject := s.runtime.NewPromise()
	select {
	case <-p.done:
		_ = resolve(s.runtime.ToValue(p.resultMap()))
		return s.runtime.ToValue(promise)
	default:
	}

	s.mu.Lock()
	if s.closing.Load() {
		s.mu.Unlock()
		_ = reject(soundJSError(s.runtime, soundOperationError("SoundPlayback.wait", SoundCanceled, "Sound runtime is closing", nil)))
		return s.runtime.ToValue(promise)
	}
	s.nextWaitID++
	waitID := s.nextWaitID
	s.pendingWaits[waitID] = soundWaiter{resolve: resolve, reject: reject}
	s.mu.Unlock()

	s.workerCount.Add(1)
	s.workers.Add(1)
	go func() {
		defer s.workerCount.Add(-1)
		defer s.workers.Done()
		select {
		case <-p.done:
			result := p.resultMap()
			if s.closing.Load() {
				return
			}
			if !s.loop.RunOnLoop(func(*goja.Runtime) { s.finishWait(waitID, result) }) {
				s.reportAsync(soundOperationError("SoundPlayback.wait", SoundCanceled, "playback completion could not return to the EventLoop", nil))
				return
			}
		case <-s.context.Done():
			return
		}
	}()
	return s.runtime.ToValue(promise)
}

func (s *Sound) finishWait(waitID uint64, result map[string]interface{}) {
	s.mu.Lock()
	waiter, ok := s.pendingWaits[waitID]
	if ok {
		delete(s.pendingWaits, waitID)
	}
	s.mu.Unlock()
	if ok {
		_ = waiter.resolve(s.runtime.ToValue(result))
	}
}

func (s *Sound) rejected(err error) goja.Value {
	promise, _, reject := s.runtime.NewPromise()
	_ = reject(soundJSError(s.runtime, err))
	return s.runtime.ToValue(promise)
}

func (s *Sound) playbackObject(p *SoundPlayback) goja.Value {
	object := s.runtime.NewObject()
	_ = object.Set("id", p.id)
	_ = object.Set("path", p.path)
	_ = object.Set("startedAt", p.startedAt)
	_ = object.Set("status", func(goja.FunctionCall) goja.Value { return s.runtime.ToValue(string(p.Status())) })
	_ = object.Set("isPlaying", func(goja.FunctionCall) goja.Value { return s.runtime.ToValue(p.IsPlaying()) })
	_ = object.Set("pause", func(goja.FunctionCall) goja.Value { return s.runtime.ToValue(p.pause()) })
	_ = object.Set("resume", func(goja.FunctionCall) goja.Value { return s.runtime.ToValue(p.resume()) })
	_ = object.Set("stop", func(goja.FunctionCall) goja.Value { return s.runtime.ToValue(p.stop()) })
	_ = object.Set("wait", func(goja.FunctionCall) goja.Value { return s.waitPlayback(p) })
	return object
}

func soundPathArgument(value goja.Value, operation string) (string, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", soundOperationError(operation, SoundInvalidArgument, "sound path must be a string", nil)
	}
	path, ok := value.Export().(string)
	if !ok || path == "" || strings.ContainsRune(path, '\x00') {
		return "", soundOperationError(operation, SoundInvalidArgument, "sound path must be a non-empty string without NUL", nil)
	}
	return path, nil
}

func parseSoundStartOptions(value goja.Value) (soundStartOptions, error) {
	return parseSoundStartOptionsFor("Sound.start", value)
}

func parseSoundStartOptionsFor(operation string, value goja.Value) (soundStartOptions, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return soundStartOptions{}, nil
	}
	options, ok := value.Export().(map[string]interface{})
	if !ok {
		return soundStartOptions{}, soundOperationError(operation, SoundInvalidArgument, "options must be an object", nil)
	}
	result := soundStartOptions{}
	for key, raw := range options {
		switch key {
		case "loop":
			loop, ok := raw.(bool)
			if !ok {
				return soundStartOptions{}, soundOperationError(operation, SoundInvalidArgument, "options.loop must be boolean", nil)
			}
			result.loop = loop
		default:
			return soundStartOptions{}, soundOperationError(operation, SoundInvalidArgument, "unknown "+operation+" option: "+key, nil)
		}
	}
	return result, nil
}

func soundIDArgument(value goja.Value, operation string) (string, error) {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return "", soundOperationError(operation, SoundInvalidArgument, "playback id must be a string", nil)
	}
	id, ok := value.Export().(string)
	if !ok || id == "" || strings.ContainsRune(id, '\x00') {
		return "", soundOperationError(operation, SoundInvalidArgument, "playback id must be a non-empty string without NUL", nil)
	}
	return id, nil
}

func registerSound(runtimeValue *goja.Runtime, opts InitJSOptions) *Sound {
	// Legacy exported Play* methods are supplied by AutoMapObject. Playback
	// sessions intentionally use an explicit bridge: their handles and wait()
	// Promise must remain owned by this Goja Runtime/EventLoop and by execution
	// teardown, so the unexported native lifecycle methods are not allowlisted.
	sound := newSound(runtimeValue, opts.EventLoop, opts.Context, opts.OnAsyncError)
	methods := AutoMapObject(runtimeValue, sound)
	start := func(operation string) func(goja.FunctionCall) goja.Value {
		return func(call goja.FunctionCall) goja.Value {
			path, err := soundPathArgument(call.Argument(0), operation)
			if err != nil {
				panic(soundJSError(runtimeValue, err))
			}
			options, err := parseSoundStartOptionsFor(operation, call.Argument(1))
			if err != nil {
				panic(soundJSError(runtimeValue, err))
			}
			playback, err := sound.startPlayback(path, options.loop, operation)
			if err != nil {
				panic(soundJSError(runtimeValue, err))
			}
			return sound.playbackObject(playback)
		}
	}
	methods["start"] = start("Sound.start")
	methods["playAsync"] = start("Sound.playAsync")
	methods["stop"] = func(call goja.FunctionCall) goja.Value {
		id, err := soundIDArgument(call.Argument(0), "Sound.stop")
		if err != nil {
			panic(soundJSError(runtimeValue, err))
		}
		return runtimeValue.ToValue(sound.stop(id))
	}
	methods["stopAll"] = func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(sound.stopAll())
	}
	methods["getActive"] = func(goja.FunctionCall) goja.Value {
		return runtimeValue.ToValue(sound.activeSnapshot())
	}
	runtimeValue.Set("Sound", methods)
	return sound
}

// Close stops every playback owned by this execution and rejects waiters
// before the Goja EventLoop is terminated.
func (s *Sound) Close() {
	if s == nil || !s.closing.CompareAndSwap(false, true) {
		return
	}
	s.cancel()
	s.mu.Lock()
	playbacks := make([]*SoundPlayback, 0, len(s.active))
	for _, p := range s.active {
		playbacks = append(playbacks, p)
	}
	waiters := s.pendingWaits
	s.pendingWaits = map[uint64]soundWaiter{}
	s.mu.Unlock()
	for id, waiter := range waiters {
		_ = waiter.reject(soundJSError(s.runtime, soundOperationError(fmt.Sprintf("SoundPlayback.wait[%d]", id), SoundCanceled, "playback wait canceled during execution teardown", nil)))
	}
	for _, p := range playbacks {
		_ = p.stop()
	}
}

func (s *Sound) Wait() {
	if s != nil {
		s.workers.Wait()
	}
}

func (s *Sound) ResourceCounts() (workers int64, pending, playbacks int) {
	if s == nil {
		return 0, 0, 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.workerCount.Load(), len(s.pendingWaits), len(s.active)
}

func (s *Sound) reportAsync(err error) {
	if err != nil && s.onAsyncError != nil {
		s.onAsyncError(err)
	}
}
