package execution

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"opendesk/automation"
)

func TestRunJavaScriptTeardownInterruptsWatchWaitRejectionHandler(t *testing.T) {
	workDir := t.TempDir()
	writeRunnerTeardownWAV(t, filepath.Join(workDir, "reference.wav"))
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "artifacts"), "audio-watch-teardown", ".js")
	if err != nil {
		t.Fatal(err)
	}

	backend := newRunnerTeardownAudioBackend()
	scriptPath := filepath.Join("..", "..", "tests", "runtime-api", "seams", "audio-pattern-teardown.js")
	scriptContent, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan struct {
		status ExecutionStatus
		err    error
	}, 1)
	go func() {
		runResult, _, runErr := Run(Request{
			Context:       ctx,
			ExecutionID:   "audio-watch-teardown",
			SourceLabel:   "runner teardown test",
			Ext:           ".js",
			WorkDir:       workDir,
			ScriptContent: scriptContent,
			Artifacts:     artifacts,
			Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
			AudioCaptureBackendFactory: func() automation.AudioCaptureBackend {
				return backend
			},
		})
		result <- struct {
			status ExecutionStatus
			err    error
		}{status: runResult.Status, err: runErr}
	}()

	armedPath := filepath.Join(workDir, "armed")
	deadline := time.Now().Add(2 * time.Second)
	for {
		select {
		case got := <-result:
			t.Fatalf("execution ended before watcher teardown was armed: status=%s error=%v", got.status, got.err)
		default:
		}
		if _, statErr := os.Stat(armedPath); statErr == nil {
			break
		} else if !os.IsNotExist(statErr) {
			t.Fatal(statErr)
		}
		if time.Now().After(deadline) {
			t.Fatal("sound watcher did not arm before cancellation")
		}
		time.Sleep(time.Millisecond)
	}

	canceledAt := time.Now()
	cancel()
	select {
	case got := <-result:
		if got.status != ExecutionStatusCanceled || got.err == nil {
			t.Fatalf("canceled execution status=%s error=%v", got.status, got.err)
		}
		if elapsed := time.Since(canceledAt); elapsed > time.Second {
			t.Fatalf("teardown took %s after cancellation", elapsed)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("watcher.wait rejection handler blocked runtime teardown")
	}
	if active := backend.activeSessions(); active != 0 {
		t.Fatalf("audio capture sessions after teardown = %d, want 0", active)
	}
}

type runnerTeardownAudioBackend struct {
	mu       sync.Mutex
	sessions map[*runnerTeardownAudioSession]struct{}
}

func newRunnerTeardownAudioBackend() *runnerTeardownAudioBackend {
	return &runnerTeardownAudioBackend{sessions: map[*runnerTeardownAudioSession]struct{}{}}
}

func (b *runnerTeardownAudioBackend) Name() string { return "runner-teardown-test" }

func (b *runnerTeardownAudioBackend) Capabilities() automation.AudioCaptureCapabilities {
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

func (b *runnerTeardownAudioBackend) Start(_ context.Context, options automation.AudioCaptureOptions, _ automation.AudioCaptureSink) (automation.AudioCaptureSession, error) {
	session := &runnerTeardownAudioSession{
		owner: b,
		info: automation.AudioCaptureSessionInfo{
			ID:             "runner-teardown-session",
			Backend:        b.Name(),
			SourceScope:    "system-mix",
			SourceVerified: true,
			SampleRate:     options.SampleRate,
			Channels:       options.Channels,
			StartedAt:      time.Now().UTC(),
		},
	}
	b.mu.Lock()
	b.sessions[session] = struct{}{}
	b.mu.Unlock()
	return session, nil
}

func (b *runnerTeardownAudioBackend) Close() error {
	b.mu.Lock()
	sessions := make([]*runnerTeardownAudioSession, 0, len(b.sessions))
	for session := range b.sessions {
		sessions = append(sessions, session)
	}
	b.mu.Unlock()
	for _, session := range sessions {
		_ = session.Stop(context.Background())
	}
	return nil
}

func (*runnerTeardownAudioBackend) Wait(context.Context) error { return nil }

func (b *runnerTeardownAudioBackend) activeSessions() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.sessions)
}

type runnerTeardownAudioSession struct {
	owner   *runnerTeardownAudioBackend
	info    automation.AudioCaptureSessionInfo
	stopped bool
}

func (s *runnerTeardownAudioSession) Info() automation.AudioCaptureSessionInfo { return s.info }

func (*runnerTeardownAudioSession) Wait(context.Context) error { return nil }

func (s *runnerTeardownAudioSession) Stop(context.Context) error {
	s.owner.mu.Lock()
	defer s.owner.mu.Unlock()
	if !s.stopped {
		s.stopped = true
		delete(s.owner.sessions, s)
	}
	return nil
}

func writeRunnerTeardownWAV(t *testing.T, path string) {
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
	for index := 0; index < sampleCount; index++ {
		sample := int16(math.Round(0.6 * math.Sin(2*math.Pi*660*float64(index)/sampleRate) * 32767))
		binary.LittleEndian.PutUint16(content[44+index*2:46+index*2], uint16(sample))
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
}
