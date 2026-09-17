package scheduler

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

type controlledSchedulerClock struct {
	mu  sync.RWMutex
	now time.Time
}

func newControlledSchedulerClock(now time.Time) *controlledSchedulerClock {
	return &controlledSchedulerClock{now: now.UTC()}
}

func (c *controlledSchedulerClock) Now() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.now
}

func (c *controlledSchedulerClock) Set(value time.Time) {
	c.mu.Lock()
	c.now = value.UTC()
	c.mu.Unlock()
}

type controlledSchedulerExecutor struct{}

func (controlledSchedulerExecutor) Execute(_ context.Context, job Job) (pkgExecution.ExecutionResult, error) {
	return pkgExecution.ExecutionResult{
		ExecutionID: "exec-" + job.ID,
		Status:      pkgExecution.ExecutionStatusSucceeded,
	}, nil
}

func TestServiceControlledClockProvesTwoOneTimeScheduledRuns(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	base := time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)
	clock := newControlledSchedulerClock(base)
	service, err := NewService(store, controlledSchedulerExecutor{}, Options{
		ScriptRoot:   root,
		PollInterval: time.Hour,
		Now:          clock.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := service.Close(closeCtx); err != nil {
			t.Errorf("close scheduler: %v", err)
		}
	}()

	firstAt := base.Add(15 * time.Second)
	secondAt := base.Add(45 * time.Second)
	first := createControlledAtJob(t, service, "first", firstAt)
	second := createControlledAtJob(t, service, "second", secondAt)

	assertNoRuns(t, store, first.ID)
	assertNoRuns(t, store, second.ID)

	clock.Set(firstAt.Add(-time.Nanosecond))
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	assertNoRuns(t, store, first.ID)
	assertNoRuns(t, store, second.ID)

	clock.Set(firstAt)
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	firstRun := waitForTerminalRun(t, store, first.ID)
	assertScheduledRunContract(t, firstRun, firstAt, "exec-"+first.ID)
	assertNoRuns(t, store, second.ID)
	assertCompletedOneTimeJob(t, store, first.ID)

	// Reprocessing the same controlled instant cannot create another automatic
	// run for a completed one-time Job.
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	assertRunCount(t, store, first.ID, 1)

	clock.Set(secondAt)
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	secondRun := waitForTerminalRun(t, store, second.ID)
	assertScheduledRunContract(t, secondRun, secondAt, "exec-"+second.ID)
	assertCompletedOneTimeJob(t, store, second.ID)
	assertRunCount(t, store, second.ID, 1)

	if firstRun.ExecutionID == secondRun.ExecutionID {
		t.Fatalf("two scheduled jobs reused Execution ID %q", firstRun.ExecutionID)
	}
}

func TestServiceControlledClockPauseOrDeletePreventsFutureAutomaticRun(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	base := time.Date(2026, 9, 18, 13, 0, 0, 0, time.UTC)
	clock := newControlledSchedulerClock(base)
	service, err := NewService(store, controlledSchedulerExecutor{}, Options{
		ScriptRoot:   root,
		PollInterval: time.Hour,
		Now:          clock.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = service.Close(closeCtx)
	}()

	pauseAt := base.Add(15 * time.Second)
	pausedJob := createControlledAtJob(t, service, "pause-before-due", pauseAt)
	clock.Set(base.Add(5 * time.Second))
	if _, err := service.Pause(ctx, pausedJob.ID); err != nil {
		t.Fatal(err)
	}
	clock.Set(pauseAt.Add(time.Second))
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	assertNoRuns(t, store, pausedJob.ID)

	deleteAt := base.Add(45 * time.Second)
	deletedJob := createControlledAtJob(t, service, "delete-before-due", deleteAt)
	clock.Set(base.Add(20 * time.Second))
	if err := service.Delete(ctx, deletedJob.ID); err != nil {
		t.Fatal(err)
	}
	clock.Set(deleteAt.Add(time.Second))
	if err := service.processDue(ctx); err != nil {
		t.Fatal(err)
	}
	runs, err := store.ListRuns(ctx, deletedJob.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 0 {
		t.Fatalf("deleted pre-due job produced runs: %#v", runs)
	}
}

func createControlledAtJob(t *testing.T, service *Service, name string, at time.Time) Job {
	t.Helper()
	job, err := service.CreateJob(context.Background(), CreateJobInput{
		Name:               name,
		ScheduleType:       ScheduleAt,
		ScheduleExpression: at.UTC().Format(time.RFC3339Nano),
		Timezone:           "UTC",
		MisfirePolicy:      MisfireSkip,
		TaskType:           "script",
		SourceType:         SourceInline,
		InlineScript:       "return {ok: true};",
	})
	if err != nil {
		t.Fatal(err)
	}
	if job.NextRunAt == nil || !job.NextRunAt.Equal(at) {
		t.Fatalf("persisted next run = %v, want %v", job.NextRunAt, at)
	}
	return job
}

func waitForTerminalRun(t *testing.T, store *Store, jobID string) JobRun {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		runs, err := store.ListRuns(context.Background(), jobID, 10)
		if err != nil {
			t.Fatal(err)
		}
		if len(runs) == 1 {
			switch runs[0].Status {
			case RunSucceeded, RunFailed, RunCanceled, RunSkipped:
				return runs[0]
			}
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("job %s did not reach one terminal run", jobID)
	return JobRun{}
}

func assertScheduledRunContract(t *testing.T, run JobRun, scheduledAt time.Time, executionID string) {
	t.Helper()
	if run.TriggerType != TriggerScheduled {
		t.Fatalf("triggerType = %q, want scheduled", run.TriggerType)
	}
	if !run.ScheduledAt.Equal(scheduledAt) {
		t.Fatalf("scheduledAt = %s, want %s", run.ScheduledAt, scheduledAt)
	}
	if run.StartedAt == nil || run.StartedAt.Before(scheduledAt) {
		t.Fatalf("startedAt = %v, must not be before %s", run.StartedAt, scheduledAt)
	}
	if run.ExecutionID != executionID {
		t.Fatalf("executionId = %q, want %q", run.ExecutionID, executionID)
	}
	if run.Status != RunSucceeded {
		t.Fatalf("status = %q, want succeeded", run.Status)
	}
}

func assertCompletedOneTimeJob(t *testing.T, store *Store, jobID string) {
	t.Helper()
	job, err := store.GetJob(context.Background(), jobID)
	if err != nil {
		t.Fatal(err)
	}
	if job.Enabled || job.NextRunAt != nil {
		t.Fatalf("completed one-time job still scheduled: enabled=%v next=%v", job.Enabled, job.NextRunAt)
	}
}

func assertNoRuns(t *testing.T, store *Store, jobID string) {
	t.Helper()
	assertRunCount(t, store, jobID, 0)
}

func assertRunCount(t *testing.T, store *Store, jobID string, want int) {
	t.Helper()
	runs, err := store.ListRuns(context.Background(), jobID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != want {
		t.Fatalf("job %s run count = %d, want %d: %#v", jobID, len(runs), want, runs)
	}
}
