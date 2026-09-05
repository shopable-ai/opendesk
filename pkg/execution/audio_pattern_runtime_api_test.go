package execution

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"opendesk/automation"
)

func TestRunJavaScriptAudioPatternPositiveSeam(t *testing.T) {
	workDir := t.TempDir()
	referencePCM := writeAudioPatternRuntimeAPIWAV(t, filepath.Join(workDir, "reference.wav"))
	backend := newAudioPatternRuntimeAPIBackend(referencePCM)

	scriptPath := filepath.Join("..", "..", "tests", "runtime-api", "seams", "audio-pattern-positive.js")
	scriptContent, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "artifacts"), "audio-pattern-positive", ".js")
	if err != nil {
		t.Fatal(err)
	}

	runResult, _, runErr := Run(Request{
		Context:       context.Background(),
		ExecutionID:   "audio-pattern-positive",
		SourceLabel:   "runtime API audio pattern positive seam",
		Ext:           ".js",
		WorkDir:       workDir,
		ScriptContent: scriptContent,
		Artifacts:     artifacts,
		Timeout:       10 * time.Second,
		Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		AudioCaptureBackendFactory: func() automation.AudioCaptureBackend {
			return backend
		},
	})
	if runErr != nil {
		starts, stops, active := backend.counts()
		t.Fatalf("Run audio pattern positive seam: %v (backend starts:%d stops:%d active:%d)", runErr, starts, stops, active)
	}
	if runResult.Status != ExecutionStatusSucceeded {
		t.Fatalf("execution status = %s, want %s", runResult.Status, ExecutionStatusSucceeded)
	}

	var evidence struct {
		CallbackCount      int    `json:"callbackCount"`
		ContinuousWatchID  string `json:"continuousWatchId"`
		ContinuousSequence uint64 `json:"continuousSequence"`
		OneShotSequence    uint64 `json:"oneShotSequence"`
		OneShotSettlements int    `json:"oneShotSettlements"`
		Terminal           struct {
			ID      string `json:"id"`
			Status  string `json:"status"`
			Matches int    `json:"matches"`
		} `json:"terminal"`
	}
	evidenceContent, err := os.ReadFile(filepath.Join(workDir, "audio-pattern-positive-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(evidenceContent, &evidence); err != nil {
		t.Fatalf("decode JavaScript evidence: %v", err)
	}
	if evidence.CallbackCount != 1 || evidence.OneShotSettlements != 1 {
		t.Fatalf("JavaScript settlements = callback:%d one-shot:%d, want 1 and 1", evidence.CallbackCount, evidence.OneShotSettlements)
	}
	if evidence.ContinuousWatchID == "" || evidence.Terminal.ID != evidence.ContinuousWatchID {
		t.Fatalf("terminal watcher id = %q, want %q", evidence.Terminal.ID, evidence.ContinuousWatchID)
	}
	if evidence.Terminal.Status != "stopped" || evidence.Terminal.Matches != 1 {
		t.Fatalf("terminal result = status:%q matches:%d, want stopped/1", evidence.Terminal.Status, evidence.Terminal.Matches)
	}
	if evidence.ContinuousSequence == 0 || evidence.OneShotSequence <= evidence.ContinuousSequence {
		t.Fatalf("match sequences = continuous:%d one-shot:%d, want increasing positive values", evidence.ContinuousSequence, evidence.OneShotSequence)
	}

	starts, stops, active := backend.counts()
	if starts != 2 || stops != 2 || active != 0 {
		t.Fatalf("backend lifecycle = starts:%d stops:%d active:%d, want 2/2/0", starts, stops, active)
	}
	assertAudioPatternRuntimeAPICleanupZero(t, artifacts.EventLogPath)
}

func TestRunJavaScriptAudioPatternCleanupFailureSeam(t *testing.T) {
	workDir := t.TempDir()
	referencePCM := writeAudioPatternRuntimeAPIWAV(t, filepath.Join(workDir, "reference.wav"))
	backend := newAudioPatternRuntimeAPIBackend(referencePCM)
	backend.failSessionWait(1, errors.New("private-session-wait-detail"))

	scriptPath := filepath.Join("..", "..", "tests", "runtime-api", "seams", "audio-pattern-cleanup-failure.js")
	scriptContent, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "artifacts"), "audio-pattern-cleanup-failure", ".js")
	if err != nil {
		t.Fatal(err)
	}

	runResult, _, runErr := Run(Request{
		Context:       context.Background(),
		ExecutionID:   "audio-pattern-cleanup-failure",
		SourceLabel:   "runtime API audio pattern cleanup failure seam",
		Ext:           ".js",
		WorkDir:       workDir,
		ScriptContent: scriptContent,
		Artifacts:     artifacts,
		Timeout:       10 * time.Second,
		Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		AudioCaptureBackendFactory: func() automation.AudioCaptureBackend {
			return backend
		},
	})
	if runErr != nil {
		starts, stops, active := backend.counts()
		t.Fatalf("Run audio pattern cleanup failure seam: %v (backend starts:%d stops:%d active:%d)", runErr, starts, stops, active)
	}
	if runResult.Status != ExecutionStatusSucceeded {
		t.Fatalf("execution status = %s, want %s", runResult.Status, ExecutionStatusSucceeded)
	}

	var evidence struct {
		Settlements int  `json:"settlements"`
		Resolved    bool `json:"resolved"`
		Rejection   struct {
			Code      string `json:"code"`
			Operation string `json:"operation"`
			Message   string `json:"message"`
		} `json:"rejection"`
	}
	evidenceContent, err := os.ReadFile(filepath.Join(workDir, "audio-pattern-cleanup-failure-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(evidenceContent, &evidence); err != nil {
		t.Fatalf("decode JavaScript evidence: %v", err)
	}
	if evidence.Settlements != 1 || evidence.Resolved {
		t.Fatalf("JavaScript cleanup settlement = count:%d resolved:%t, want 1/false", evidence.Settlements, evidence.Resolved)
	}
	if evidence.Rejection.Code != string(automation.AudioBackendFailed) || evidence.Rejection.Operation != "Audio.waitForSound" {
		t.Fatalf("JavaScript cleanup rejection = code:%q operation:%q, want %q/Audio.waitForSound", evidence.Rejection.Code, evidence.Rejection.Operation, automation.AudioBackendFailed)
	}
	if strings.Contains(evidence.Rejection.Message, "private-session-wait-detail") {
		t.Fatalf("JavaScript cleanup rejection exposed private backend detail: %q", evidence.Rejection.Message)
	}

	starts, stops, active := backend.counts()
	if starts != 1 || stops != 1 || active != 0 {
		t.Fatalf("backend lifecycle = starts:%d stops:%d active:%d, want 1/1/0", starts, stops, active)
	}
	assertAudioPatternRuntimeAPICleanupZero(t, artifacts.EventLogPath)
}

type audioPatternRuntimeAPIBackend struct {
	mu        sync.Mutex
	reference []float32
	starts    int
	stops     int
	closed    bool
	sessions  map[*audioPatternRuntimeAPISession]struct{}
	waitErrs  map[int]error
}

func newAudioPatternRuntimeAPIBackend(reference []float32) *audioPatternRuntimeAPIBackend {
	return &audioPatternRuntimeAPIBackend{
		reference: append([]float32(nil), reference...),
		sessions:  make(map[*audioPatternRuntimeAPISession]struct{}),
		waitErrs:  make(map[int]error),
	}
}

func (b *audioPatternRuntimeAPIBackend) failSessionWait(ordinal int, err error) {
	b.mu.Lock()
	b.waitErrs[ordinal] = err
	b.mu.Unlock()
}

func (*audioPatternRuntimeAPIBackend) Name() string { return "runtime-api-memory" }

func (b *audioPatternRuntimeAPIBackend) Capabilities() automation.AudioCaptureCapabilities {
	return automation.AudioCaptureCapabilities{
		Supported:             true,
		Platform:              "test",
		Backend:               b.Name(),
		Verified:              true,
		Permission:            "none",
		SystemMix:             true,
		SelfPlaybackExclusion: "native",
	}
}

func (b *audioPatternRuntimeAPIBackend) Start(ctx context.Context, options automation.AudioCaptureOptions, sink automation.AudioCaptureSink) (automation.AudioCaptureSession, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if options.Source.Type != automation.AudioCaptureSourceSystem || options.SampleRate != 48000 || options.Channels != 1 {
		return nil, errors.New("unexpected audio capture options")
	}

	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, errors.New("audio capture backend is closed")
	}
	b.starts++
	ordinal := b.starts
	session := &audioPatternRuntimeAPISession{
		owner: b,
		info: automation.AudioCaptureSessionInfo{
			ID:             "runtime-api-memory-session",
			Backend:        b.Name(),
			SourceScope:    "system-mix",
			SourceVerified: true,
			SampleRate:     options.SampleRate,
			Channels:       options.Channels,
			StartedAt:      time.Date(2026, 9, 5, 12, 0, ordinal, 0, time.UTC),
		},
		stopped: make(chan struct{}),
		waitErr: b.waitErrs[ordinal],
	}
	b.sessions[session] = struct{}{}
	reference := append([]float32(nil), b.reference...)
	b.mu.Unlock()

	if ordinal == 2 {
		// Deliver two complete cues in one matcher Push. The silent release gap
		// permits a second matcher result while waitForSound must still expose only
		// the first producer signal to JavaScript.
		stream := make([]float32, 0, len(reference)*3)
		stream = append(stream, reference...)
		stream = append(stream, make([]float32, len(reference))...)
		stream = append(stream, reference...)
		pushAudioPatternRuntimeAPIChunk(sink, stream, ordinal, 0)
	} else {
		pushAudioPatternRuntimeAPIChunk(sink, reference, ordinal, 0)
	}
	return session, nil
}

func (b *audioPatternRuntimeAPIBackend) Close() error {
	b.mu.Lock()
	b.closed = true
	sessions := make([]*audioPatternRuntimeAPISession, 0, len(b.sessions))
	for session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		_ = session.Stop(context.Background())
	}
	return nil
}

func (b *audioPatternRuntimeAPIBackend) Wait(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	if b.closed {
		b.sessions = make(map[*audioPatternRuntimeAPISession]struct{})
	}
	b.mu.Unlock()
	return nil
}

func (b *audioPatternRuntimeAPIBackend) counts() (starts, stops, active int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.starts, b.stops, len(b.sessions)
}

type audioPatternRuntimeAPISession struct {
	owner    *audioPatternRuntimeAPIBackend
	info     automation.AudioCaptureSessionInfo
	stopOnce sync.Once
	stopped  chan struct{}
	waitErr  error
}

func (s *audioPatternRuntimeAPISession) Info() automation.AudioCaptureSessionInfo { return s.info }

func (s *audioPatternRuntimeAPISession) Stop(context.Context) error {
	s.stopOnce.Do(func() {
		s.owner.mu.Lock()
		if s.waitErr == nil {
			delete(s.owner.sessions, s)
		}
		s.owner.stops++
		s.owner.mu.Unlock()
		close(s.stopped)
	})
	return nil
}

func (s *audioPatternRuntimeAPISession) Wait(ctx context.Context) error {
	if s.waitErr != nil {
		return s.waitErr
	}
	select {
	case <-s.stopped:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func pushAudioPatternRuntimeAPIChunk(sink automation.AudioCaptureSink, samples []float32, ordinal, offset int) {
	sink.Push(automation.AudioPCMChunk{
		CapturedAt: time.Date(2026, 9, 5, 12, ordinal, offset, 0, time.UTC),
		SampleRate: 48000,
		Channels:   1,
		Samples:    append([]float32(nil), samples...),
	})
}

func writeAudioPatternRuntimeAPIWAV(t *testing.T, path string) []float32 {
	t.Helper()
	const (
		sampleRate  = 48000
		sampleCount = sampleRate / 4
	)
	dataSize := sampleCount * 2
	content := make([]byte, 44+dataSize)
	copy(content[0:4], "RIFF")
	binary.LittleEndian.PutUint32(content[4:8], uint32(36+dataSize))
	copy(content[8:12], "WAVE")
	copy(content[12:16], "fmt ")
	binary.LittleEndian.PutUint32(content[16:20], 16)
	binary.LittleEndian.PutUint16(content[20:22], 1)
	binary.LittleEndian.PutUint16(content[22:24], 1)
	binary.LittleEndian.PutUint32(content[24:28], sampleRate)
	binary.LittleEndian.PutUint32(content[28:32], sampleRate*2)
	binary.LittleEndian.PutUint16(content[32:34], 2)
	binary.LittleEndian.PutUint16(content[34:36], 16)
	copy(content[36:40], "data")
	binary.LittleEndian.PutUint32(content[40:44], uint32(dataSize))

	// Mirror the WAV decoder's mono float conversion so the backend delivers
	// exact canonical PCM to the public Runtime API.
	pcm := make([]float32, 0, sampleCount)
	for index := 0; index < sampleCount; index++ {
		timePoint := float64(index) / sampleRate
		wave := 0.45*math.Sin(2*math.Pi*523.25*timePoint) + 0.20*math.Sin(2*math.Pi*880*timePoint)
		sample := int16(math.Round(wave * 32767))
		binary.LittleEndian.PutUint16(content[44+index*2:46+index*2], uint16(sample))
		decoded := float32(float64(sample) / (1<<16 - 1))
		pcm = append(pcm, decoded)
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	return pcm
}

func assertAudioPatternRuntimeAPICleanupZero(t *testing.T, eventLogPath string) {
	t.Helper()
	file, err := os.Open(eventLogPath)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	wanted := []string{"audioPatternWorkers", "audioPatternPending", "audioPatternWatches", "audioPatternSessions"}
	found := false
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var event RunEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			t.Fatalf("decode runtime event: %v", err)
		}
		if event.Kind != "cleanup" || event.Message != "runtime async resources drained" {
			continue
		}
		found = true
		for _, field := range wanted {
			value, ok := event.Fields[field].(float64)
			if !ok || value != 0 {
				t.Fatalf("cleanup %s = %#v, want 0", field, event.Fields[field])
			}
		}
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if !found {
		t.Fatal("runtime cleanup event was not emitted")
	}
}
