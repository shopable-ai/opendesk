package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"opendesk/pkg/execution"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// These fixtures control transport bookkeeping and teardown boundaries without
// constructing a JavaScript Runtime or invoking native platform resources.
func lifecycleWorkDir(t *testing.T) string {
	t.Helper()
	base := filepath.Join("..", "..", ".runtime", "tests", "mcp-completeness")
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp(base, "script-lifecycle-")
	if err != nil {
		t.Fatal(err)
	}
	dir, err = filepath.Abs(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}

func lifecycleService(t *testing.T) *ScriptService {
	t.Helper()
	s, err := NewScriptService(ScriptOptions{WorkDir: lifecycleWorkDir(t)})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func lifecyclePending(t *testing.T, s *ScriptService, cancel func()) string {
	t.Helper()
	const id = "internal-cleanup"
	emitter, err := execution.NewEmitter(id, execution.TerminalSelection{Mode: "agent"}, execution.ExecutionArtifacts{}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = emitter.Close() })
	// The emitter has finalized, but RunWithEmitter's cleanup has not returned.
	if _, _, err := emitter.Finalize(execution.ExecutionStatusSucceeded, nil); err != nil {
		t.Fatal(err)
	}
	if !s.manager.Register(id, emitter) || !s.manager.SetCancel(id, cancel) {
		t.Fatal("failed to register private lifecycle fixture")
	}
	s.manager.UpdateResult(execution.ExecutionResult{ExecutionID: id, Status: execution.ExecutionStatusRunning})
	s.active = id
	s.count = 1
	return id
}

func lifecycleComplete(s *ScriptService, id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.manager.Complete(execution.ExecutionResult{ExecutionID: id, Status: execution.ExecutionStatusSucceeded},
		execution.AgentSummary{ExecutionID: id, Status: "succeeded"})
	s.active = ""
}

func TestScriptLifecycleConstructorRejectsBlockedArtifactDirectory(t *testing.T) {
	dir := lifecycleWorkDir(t)
	if err := os.WriteFile(filepath.Join(dir, ".runtime"), []byte("blocked"), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := NewScriptService(ScriptOptions{WorkDir: dir})
	if err == nil || s != nil {
		t.Fatalf("blocked artifact directory returned service=%v error=%v", s, err)
	}
}

func TestScriptLifecycleArtifactSetupFailureDoesNotConsumeSlot(t *testing.T) {
	s := lifecycleService(t)
	blocked := filepath.Join(s.workdir, "not-a-directory")
	if err := os.WriteFile(blocked, nil, 0600); err != nil {
		t.Fatal(err)
	}
	s.artifacts = blocked
	if _, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"}); err == nil {
		t.Fatal("artifact setup unexpectedly succeeded")
	}
	if s.count != 0 || s.active != "" {
		t.Fatalf("setup failure consumed slot: count=%d active=%q", s.count, s.active)
	}
	if _, ok := s.manager.Latest(); ok {
		t.Fatal("setup failure registered a phantom execution")
	}
}

func TestScriptLifecycleInitializationFailureAllowsSameSessionRecovery(t *testing.T) {
	for _, stage := range []string{"snapshot", "stdout", "stderr", "events"} {
		t.Run(stage, func(t *testing.T) {
			s := lifecycleService(t)
			// Recovery must exercise admission without constructing a Runtime.
			s.workdir = filepath.Join(s.workdir, "missing-runner-workdir")
			var artifacts execution.ExecutionArtifacts
			var blocked string
			prepare := func(dir, id, ext string) (execution.ExecutionArtifacts, error) {
				var err error
				artifacts, err = execution.PrepareArtifacts(dir, id, ext)
				if err != nil {
					return artifacts, err
				}
				blocked = map[string]string{"snapshot": artifacts.ScriptSnapshotPath,
					"stdout": artifacts.StdoutPath, "stderr": artifacts.StderrPath, "events": artifacts.EventLogPath}[stage]
				return artifacts, os.Mkdir(blocked, 0700)
			}
			result, err := s.start(map[string]any{"script": "throw new Error('must not execute')"}, prepare)
			if err == nil || result != nil || !strings.Contains(err.Error(), filepath.Base(blocked)) {
				t.Fatalf("%s failure: result=%v error=%v", stage, result, err)
			}
			if s.active != "" || s.count != 0 {
				t.Fatalf("%s failure consumed slot: active=%q count=%d", stage, s.active, s.count)
			}
			if _, ok := s.manager.Latest(); ok {
				t.Fatal("initialization failure registered a phantom execution")
			}
			entries, err := os.ReadDir(artifacts.RunDir)
			if err != nil {
				t.Fatal(err)
			}
			var residue []string
			for _, entry := range entries {
				residue = append(residue, fmt.Sprintf("%s(directory=%t)", entry.Name(), entry.IsDir()))
			}
			t.Logf("%s partial artifacts retained before repair: %v", stage, residue)
			// Observe this process only. lsof is optional diagnostics, not a new
			// Runtime dependency; unavailable platforms retain an explicit gap.
			if lsof, err := exec.LookPath("lsof"); err == nil {
				output, err := exec.Command(lsof, "-n", "-P", "-a", "-p", strconv.Itoa(os.Getpid()), "-F", "n").Output()
				if err != nil {
					t.Fatalf("inspect own file descriptors: %v", err)
				}
				if strings.Contains(string(output), artifacts.RunDir) {
					t.Fatalf("%s failure retained an open artifact descriptor", stage)
				}
				t.Logf("%s: no open descriptors beneath failed artifact directory", stage)
			} else {
				t.Logf("%s: descriptor leak observation unavailable (lsof absent)", stage)
			}
			if err := os.Remove(blocked); err != nil {
				t.Fatal(err)
			}
			recovered, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"})
			if err != nil {
				t.Fatalf("same-session admission after repair: %v", err)
			}
			id := recovered["executionId"].(string)
			record, ok := s.manager.Get(id)
			if !ok || s.count != 1 {
				t.Fatalf("recovery did not register exactly one execution: owned=%t count=%d", ok, s.count)
			}
			select {
			case <-record.Done:
			case <-time.After(5 * time.Second):
				t.Fatal("recovery did not terminate before Runtime initialization")
			}
			record, _ = s.manager.Get(id)
			if record.Result.Status != execution.ExecutionStatusFailed || !strings.Contains(record.Result.Error, "resolve execution working directory") {
				t.Fatalf("recovery unexpectedly reached Runtime: %+v", record.Result)
			}
			if err := s.Close(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestScriptLifecycleRunnerInitializationFailurePublishesTerminalRecord(t *testing.T) {
	s := lifecycleService(t)
	// Artifacts remain valid; only Runner's private workdir normalization fails,
	// before JavaScript or native Runtime initialization can begin.
	s.workdir = filepath.Join(s.workdir, "missing-runner-workdir")
	started, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"})
	if err != nil {
		t.Fatal(err)
	}
	id := started["executionId"].(string)
	record, ok := s.manager.Get(id)
	if !ok {
		t.Fatal("accepted execution was not registered")
	}
	select {
	case <-record.Done:
	case <-time.After(5 * time.Second):
		t.Fatal("initialization failure never completed its record")
	}
	record, _ = s.manager.Get(id)
	if record.Result.Status != execution.ExecutionStatusFailed || record.Cancel != nil || record.Result.FinishedAt == "" ||
		!strings.Contains(record.Result.Error, "resolve execution working directory") || record.Summary.Status != "failed" {
		t.Fatalf("initialization failure lost terminal evidence: result=%+v summary=%+v cancellable=%v", record.Result, record.Summary, record.Cancel != nil)
	}
	s.mu.Lock()
	active := s.active
	s.mu.Unlock()
	if active != "" {
		t.Fatalf("initialization failure left slot occupied by %q", active)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestScriptLifecycleStatusStaysRunningUntilCleanupCompletes(t *testing.T) {
	s := lifecycleService(t)
	id := lifecyclePending(t, s, func() {})
	status, err := s.Status(map[string]any{"executionId": id})
	if err != nil {
		t.Fatal(err)
	}
	if status["status"] != execution.ExecutionStatusRunning {
		t.Fatalf("emitter finalization prematurely exposed terminal status: %v", status)
	}
}

func TestScriptLifecycleCleanupRetainsExclusiveSlot(t *testing.T) {
	s := lifecycleService(t)
	lifecyclePending(t, s, func() {})
	_, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"})
	if err == nil || !strings.Contains(err.Error(), "busy") {
		t.Fatalf("cleanup did not retain exclusive slot: %v", err)
	}
}

func TestScriptLifecycleCloseRejectsNewWorkWhileWaitingForCleanup(t *testing.T) {
	s := lifecycleService(t)
	canceled := make(chan struct{})
	var once sync.Once
	id := lifecyclePending(t, s, func() { once.Do(func() { close(canceled) }) })
	closed := make(chan error, 1)
	go func() { closed <- s.Close() }()
	defer lifecycleComplete(s, id)
	select {
	case <-canceled:
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not request cancellation")
	}
	_, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"})
	if err == nil || !strings.Contains(err.Error(), "closing") {
		t.Fatalf("Close admitted work during cleanup: %v", err)
	}
	select {
	case err := <-closed:
		t.Fatalf("Close returned before lifecycle completion: %v", err)
	default:
	}
	lifecycleComplete(s, id)
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Close did not return after cleanup completed")
	}
}

func TestScriptLifecycleCloseReportsTenSecondCleanupTimeout(t *testing.T) {
	s := lifecycleService(t)
	id := lifecyclePending(t, s, func() {})
	defer lifecycleComplete(s, id)
	started := time.Now()
	err := s.Close()
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("uninterruptible cleanup returned %v, want deadline exceeded", err)
	}
	if elapsed := time.Since(started); elapsed < 10*time.Second {
		t.Fatalf("Close abandoned cleanup before its ten-second budget: %s", elapsed)
	}
	record, _ := s.manager.Get(id)
	select {
	case <-record.Done:
		t.Fatal("shutdown timeout falsely marked unfinished cleanup complete")
	default:
	}
	lifecycleComplete(s, id)
	if err := s.Close(); err != nil {
		t.Fatalf("Close did not recover after delayed cleanup completed: %v", err)
	}
	if _, err := s.Start(map[string]any{"script": "throw new Error('must not execute')"}); err == nil || !strings.Contains(err.Error(), "closing") {
		t.Fatalf("shutdown timeout recovery reopened admission: %v", err)
	}
}

func TestScriptLifecycleRepeatedCancelDoesNotCompleteCleanup(t *testing.T) {
	s := lifecycleService(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	id := lifecyclePending(t, s, cancel)
	for i := 0; i < 2; i++ {
		result, err := s.Cancel(map[string]any{"executionId": id})
		if err != nil || result["cancelRequested"] != true || result["status"] != "canceling" {
			t.Fatalf("cancel %d: result=%v error=%v", i, result, err)
		}
	}
	if ctx.Err() != context.Canceled {
		t.Fatal("transport cancellation was not delivered")
	}
	record, _ := s.manager.Get(id)
	select {
	case <-record.Done:
		t.Fatal("cancel request completed cleanup prematurely")
	default:
	}
}

func TestScriptLifecycleCancelAfterNaturalCompletionPreservesSuccess(t *testing.T) {
	s := lifecycleService(t)
	id := lifecyclePending(t, s, func() { t.Error("completed execution was canceled") })
	lifecycleComplete(s, id)
	for i := 0; i < 2; i++ {
		result, err := s.Cancel(map[string]any{"executionId": id})
		if err != nil || result["cancelRequested"] != false || result["status"] != "succeeded" {
			t.Fatalf("cancel after natural completion: result=%v error=%v", result, err)
		}
	}
}

func TestScriptLifecycleConcurrentCancelAndNaturalCompletionPreserveTerminalRecord(t *testing.T) {
	for iteration := 0; iteration < 64; iteration++ {
		s := &ScriptService{manager: execution.NewManager()}
		_, cancel := context.WithCancel(context.Background())
		id := lifecyclePending(t, s, cancel)
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(3)
		for i := 0; i < 2; i++ {
			go func() {
				defer wg.Done()
				<-start
				result, err := s.Cancel(map[string]any{"executionId": id})
				if err != nil || (result["status"] != "canceling" && result["status"] != "succeeded") {
					t.Errorf("racing cancel: result=%v error=%v", result, err)
				}
			}()
		}
		go func() { defer wg.Done(); <-start; lifecycleComplete(s, id) }()
		close(start)
		wg.Wait()
		cancel()
		record, _ := s.manager.Get(id)
		if record.Result.Status != execution.ExecutionStatusSucceeded || record.Cancel != nil {
			t.Fatalf("racing cancellation overwrote natural completion: %+v", record.Result)
		}
		select {
		case <-record.Done:
		default:
			t.Fatal("natural completion did not close lifecycle barrier")
		}
	}
}
