package execution

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"opendesk/automation"
)

type recorderRuntimeFixtureBackend struct {
	mu                   sync.Mutex
	active               bool
	starts, stops, waits int
}

func (*recorderRuntimeFixtureBackend) Capabilities() automation.RecorderBackendCapabilities {
	return automation.RecorderBackendCapabilities{Supported: true, Platform: "darwin", Backend: "runtime-fixture-memory", Permission: "not-required", CoordinateSpace: "screen-logical"}
}

func (b *recorderRuntimeFixtureBackend) Start(ctx context.Context, sink func(automation.RecorderInputEvent), _ func(error)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	b.mu.Lock()
	b.active = true
	b.starts++
	b.mu.Unlock()
	sink(automation.RecorderInputEvent{Type: 1, NativeTime: 990}) // HOOK_ENABLED readiness
	sink(automation.RecorderInputEvent{Type: 7, NativeTime: 1000, Button: 1, Clicks: 1, X: 20, Y: 30})
	sink(automation.RecorderInputEvent{Type: 8, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	sink(automation.RecorderInputEvent{Type: 6, NativeTime: 1010, Button: 1, Clicks: 1, X: 20, Y: 30})
	return nil
}

func (b *recorderRuntimeFixtureBackend) Stop(context.Context) error {
	b.mu.Lock()
	b.active = false
	b.stops++
	b.mu.Unlock()
	return nil
}

func (b *recorderRuntimeFixtureBackend) Wait() {
	b.mu.Lock()
	b.waits++
	b.mu.Unlock()
}

func (b *recorderRuntimeFixtureBackend) counts() (starts, stops, waits int, active bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.starts, b.stops, b.waits, b.active
}

func TestRunJavaScriptRecorderSessionPrivateBackendSeam(t *testing.T) {
	workDir := t.TempDir()
	script, err := os.ReadFile(filepath.Join("..", "..", "tests", "runtime-api", "seams", "recorder-session.js"))
	if err != nil {
		t.Fatal(err)
	}
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), "artifacts"), "recorder-session", ".js")
	if err != nil {
		t.Fatal(err)
	}
	backend := &recorderRuntimeFixtureBackend{}
	result, _, runErr := Run(Request{
		Context: context.Background(), ExecutionID: "recorder-session", SourceLabel: "runtime API Recorder private backend seam",
		Ext: ".js", WorkDir: workDir, ScriptContent: script, Artifacts: artifacts, Timeout: 10 * time.Second,
		Selection: TerminalSelection{Mode: "quiet", Categories: map[string]bool{}}, EnableRecorderCapture: true,
		RecorderBackendFactory: func() automation.RecorderInputBackend { return backend },
		RecorderWindowProbe: func() (*automation.WindowInfo, error) {
			return &automation.WindowInfo{
				ID: "recorder-fixture-window", ProcessID: 42, Title: "Recorder Fixture",
				X: 0, Y: 0, Width: 800, Height: 600, ExeName: "RecorderFixture.app", Handle: 42,
				IsForeground: true, HasFocus: true,
			}, nil
		},
		RecorderDisplayResolver: func() []automation.DisplayInfo {
			return []automation.DisplayInfo{{Index: 1, ID: "fixture-display", X: 0, Y: 0, Width: 800, Height: 600, PixelWidth: 800, PixelHeight: 600, Scale: 1}}
		},
	})
	if runErr != nil || result.Status != ExecutionStatusSucceeded {
		t.Fatalf("Recorder Runtime seam status=%s error=%v", result.Status, runErr)
	}
	var evidence struct {
		First struct {
			CaptureState string `json:"captureState"`
			StorageState string `json:"storageState"`
		} `json:"first"`
		Built struct {
			Readiness   string `json:"readiness"`
			ActionCount int    `json:"actionCount"`
		} `json:"built"`
	}
	payload, err := os.ReadFile(filepath.Join(workDir, "recorder-session-result.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(payload, &evidence); err != nil {
		t.Fatal(err)
	}
	if evidence.First.CaptureState != "stopped" || evidence.First.StorageState != "saved" || evidence.Built.Readiness != "ready" || evidence.Built.ActionCount != 1 {
		t.Fatalf("evidence=%#v", evidence)
	}
	starts, stops, waits, active := backend.counts()
	if starts != 1 || stops != 1 || waits != 1 || active {
		t.Fatalf("backend lifecycle=%d/%d/%d active=%t", starts, stops, waits, active)
	}
}
