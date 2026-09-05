package execution

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"opendesk/automation"
)

func TestRunJavaScriptAudioPatternFixturesSeam(t *testing.T) {
	workDir := t.TempDir()
	fixtures, reference := writeAudioPatternFixtureSet(t, filepath.Join(workDir, "fixtures"))
	if len(fixtures) != 5 || len(reference) == 0 {
		t.Fatalf("fixture set = %d files/reference samples %d, want 5/non-empty", len(fixtures), len(reference))
	}
	backend := newAudioPatternFixtureBackend(reference)
	scriptContent, err := os.ReadFile(filepath.Join("..", "..", "tests", "runtime-api", "seams", "audio-pattern-fixtures.js"))
	if err != nil {
		t.Fatal(err)
	}
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "artifacts"), "audio-pattern-fixtures", ".js")
	if err != nil {
		t.Fatal(err)
	}
	runResult, _, runErr := Run(Request{
		Context: context.Background(), ExecutionID: "audio-pattern-fixtures", SourceLabel: "runtime API audio pattern fixture seam",
		Ext: ".js", WorkDir: workDir, ScriptContent: scriptContent, Artifacts: artifacts, Timeout: 10 * time.Second,
		Selection:                  TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
		AudioCaptureBackendFactory: func() automation.AudioCaptureBackend { return backend },
	})
	if runErr != nil || runResult.Status != ExecutionStatusSucceeded {
		t.Fatalf("fixture seam status=%s error=%v", runResult.Status, runErr)
	}
	var evidence struct {
		CallbackCount int `json:"callbackCount"`
		Terminal      struct {
			Status  string `json:"status"`
			Matches int    `json:"matches"`
		} `json:"terminal"`
		FirstSignal struct {
			StartOffsetMS int64 `json:"startOffsetMs"`
		} `json:"firstSignal"`
	}
	content, err := os.ReadFile(filepath.Join(workDir, "audio-pattern-fixtures-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(content, &evidence); err != nil {
		t.Fatal(err)
	}
	if evidence.CallbackCount != 1 || evidence.Terminal.Status != "stopped" || evidence.Terminal.Matches != 2 || evidence.FirstSignal.StartOffsetMS >= 500 {
		t.Fatalf("fixture evidence = callbacks:%d terminal:%s/%d first-start:%d, want 1/stopped/2/<500", evidence.CallbackCount, evidence.Terminal.Status, evidence.Terminal.Matches, evidence.FirstSignal.StartOffsetMS)
	}
	starts, stops, active := backend.counts()
	if starts != 2 || stops != 2 || active != 0 {
		t.Fatalf("fixture backend lifecycle = %d/%d/%d, want 2/2/0", starts, stops, active)
	}
	assertAudioPatternRuntimeAPICleanupZero(t, artifacts.EventLogPath)
}

type audioPatternFixtureBackend struct {
	mu            sync.Mutex
	reference     []float32
	starts, stops int
	sessions      map[*audioPatternFixtureSession]struct{}
}

func newAudioPatternFixtureBackend(reference []float32) *audioPatternFixtureBackend {
	return &audioPatternFixtureBackend{reference: append([]float32(nil), reference...), sessions: map[*audioPatternFixtureSession]struct{}{}}
}
func (*audioPatternFixtureBackend) Name() string { return "runtime-api-fixture-memory" }
func (b *audioPatternFixtureBackend) Capabilities() automation.AudioCaptureCapabilities {
	return automation.AudioCaptureCapabilities{Supported: true, Platform: "test", Backend: b.Name(), Verified: true, Permission: "none", SystemMix: true, SelfPlaybackExclusion: "native"}
}
func (b *audioPatternFixtureBackend) Start(ctx context.Context, options automation.AudioCaptureOptions, sink automation.AudioCaptureSink) (automation.AudioCaptureSession, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if options.SampleRate != 48000 || options.Channels != 1 {
		return nil, os.ErrInvalid
	}
	b.mu.Lock()
	b.starts++
	ordinal := b.starts
	s := &audioPatternFixtureSession{owner: b, info: automation.AudioCaptureSessionInfo{ID: "fixture-session", Backend: b.Name(), SourceScope: "system-mix", SourceVerified: true, SampleRate: 48000, Channels: 1, StartedAt: time.Date(2026, 9, 5, 12, 0, ordinal, 0, time.UTC)}, stopped: make(chan struct{})}
	b.sessions[s] = struct{}{}
	reference := append([]float32(nil), b.reference...)
	b.mu.Unlock()
	stream := buildAudioPatternFixtureStream(reference, ordinal)
	for index := 0; index < len(stream); index += 48000 {
		end := index + 48000
		if end > len(stream) {
			end = len(stream)
		}
		sink.Push(automation.AudioPCMChunk{CapturedAt: time.Date(2026, 9, 5, 12, ordinal, index/48000, 0, time.UTC), SampleRate: 48000, Channels: 1, Samples: stream[index:end]})
	}
	return s, nil
}
func (b *audioPatternFixtureBackend) Close() error {
	b.mu.Lock()
	sessions := make([]*audioPatternFixtureSession, 0, len(b.sessions))
	for s := range b.sessions {
		sessions = append(sessions, s)
	}
	b.mu.Unlock()
	for _, s := range sessions {
		_ = s.Stop(context.Background())
	}
	return nil
}
func (b *audioPatternFixtureBackend) Wait(context.Context) error { return nil }
func (b *audioPatternFixtureBackend) counts() (int, int, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.starts, b.stops, len(b.sessions)
}

type audioPatternFixtureSession struct {
	owner   *audioPatternFixtureBackend
	info    automation.AudioCaptureSessionInfo
	once    sync.Once
	stopped chan struct{}
}

func (s *audioPatternFixtureSession) Info() automation.AudioCaptureSessionInfo { return s.info }
func (s *audioPatternFixtureSession) Stop(context.Context) error {
	s.once.Do(func() {
		s.owner.mu.Lock()
		delete(s.owner.sessions, s)
		s.owner.stops++
		s.owner.mu.Unlock()
		close(s.stopped)
	})
	return nil
}
func (s *audioPatternFixtureSession) Wait(ctx context.Context) error {
	select {
	case <-s.stopped:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func buildAudioPatternFixtureStream(reference []float32, ordinal int) []float32 {
	confuser := make([]float32, len(reference))
	volume := make([]float32, len(reference))
	noise := make([]float32, len(reference))
	resampled := make([]float32, len(reference))
	for i, sample := range reference {
		volume[i] = sample * 0.55
		noise[i] = sample*0.8 + float32(0.008*math.Sin(float64(i)*0.37))
		confuser[i] = float32(0.40 * math.Sin(2*math.Pi*180*float64(i)/48000))
		source := float64(i) * 44100 / 48000
		left := int(source)
		frac := source - float64(left)
		if left+1 < len(reference) {
			resampled[i] = float32(float64(reference[left])*(1-frac) + float64(reference[left+1])*frac)
		} else {
			resampled[i] = reference[len(reference)-1]
		}
	}
	silence := make([]float32, 12000)
	stream := append([]float32{}, confuser...)
	stream = append(stream, volume...)
	stream = append(stream, noise...)
	stream = append(stream, silence...)
	stream = append(stream, resampled...)
	if ordinal == 2 {
		stream = append(stream, confuser...)
		stream = append(stream, reference...)
		stream = append(stream, silence...)
		stream = append(stream, reference...)
	}
	return stream
}

func writeAudioPatternFixtureSet(t *testing.T, dir string) (map[string]string, []float32) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	const rate = 48000
	count := rate / 8
	reference := make([]float32, count)
	for i := range reference {
		x := float64(i) / rate
		envelope := math.Min(1, float64(i)/2400) * math.Min(1, float64(count-i)/2400)
		reference[i] = float32(envelope * (0.42*math.Sin(2*math.Pi*523.25*x) + 0.19*math.Sin(2*math.Pi*880*x) + 0.11*math.Sin(2*math.Pi*1318.5*x)))
	}
	variants := map[string][]float32{"order-reference.wav": reference, "order-volume.wav": scaleFixture(reference, .55), "order-noise.wav": addFixtureNoise(reference), "order-resampled.wav": resampleFixture(reference), "confuser.wav": confuserFixture(count, rate)}
	paths := make(map[string]string, len(variants))
	for name, samples := range variants {
		path := filepath.Join(dir, name)
		writeFixtureWAV(t, path, rate, samples)
		paths[name] = path
	}
	return paths, reference
}
func scaleFixture(in []float32, scale float64) []float32 {
	out := make([]float32, len(in))
	for i, v := range in {
		out[i] = float32(float64(v) * scale)
	}
	return out
}
func addFixtureNoise(in []float32) []float32 {
	out := make([]float32, len(in))
	for i, v := range in {
		out[i] = v*.8 + float32(.008*math.Sin(float64(i)*.37))
	}
	return out
}
func resampleFixture(in []float32) []float32 {
	down := make([]float32, len(in)*44100/48000)
	for i := range down {
		source := float64(i) * 48000 / 44100
		left := int(source)
		if left+1 >= len(in) {
			down[i] = in[len(in)-1]
			continue
		}
		frac := source - float64(left)
		down[i] = float32(float64(in[left])*(1-frac) + float64(in[left+1])*frac)
	}
	out := make([]float32, len(in))
	for i := range out {
		source := float64(i) * 44100 / 48000
		left := int(source)
		if left+1 >= len(down) {
			out[i] = down[len(down)-1]
			continue
		}
		frac := source - float64(left)
		out[i] = float32(float64(down[left])*(1-frac) + float64(down[left+1])*frac)
	}
	return out
}
func confuserFixture(count, rate int) []float32 {
	out := make([]float32, count)
	for i := range out {
		x := float64(i) / float64(rate)
		out[i] = float32(.40 * math.Sin(2*math.Pi*180*x))
	}
	return out
}
func writeFixtureWAV(t *testing.T, path string, rate int, samples []float32) {
	t.Helper()
	data := make([]byte, 44+2*len(samples))
	copy(data, []byte("RIFF"))
	binary.LittleEndian.PutUint32(data[4:], uint32(36+2*len(samples)))
	copy(data[8:], []byte("WAVEfmt "))
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], uint32(rate))
	binary.LittleEndian.PutUint32(data[28:], uint32(rate*2))
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], []byte("data"))
	binary.LittleEndian.PutUint32(data[40:], uint32(2*len(samples)))
	for i, sample := range samples {
		value := math.Max(-1, math.Min(1, float64(sample)))
		binary.LittleEndian.PutUint16(data[44+2*i:], uint16(int16(math.Round(value*32767))))
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
