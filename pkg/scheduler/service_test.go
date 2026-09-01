package scheduler

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

type recordingExecutor struct {
	calls chan string
	block chan struct{}

	mu          sync.Mutex
	callCount   int
	concurrent  int
	maxParallel int
}

func (e *recordingExecutor) Execute(ctx context.Context, job Job) (pkgExecution.ExecutionResult, error) {
	e.mu.Lock()
	e.callCount++
	e.concurrent++
	if e.concurrent > e.maxParallel {
		e.maxParallel = e.concurrent
	}
	e.mu.Unlock()
	select {
	case e.calls <- job.ID:
	case <-ctx.Done():
	}
	if e.block != nil {
		select {
		case <-e.block:
		case <-ctx.Done():
			e.finishCall()
			return pkgExecution.ExecutionResult{Status: pkgExecution.ExecutionStatusCanceled}, ctx.Err()
		}
	}
	e.finishCall()
	return pkgExecution.ExecutionResult{
		ExecutionID: "exec-" + job.ID,
		Status:      pkgExecution.ExecutionStatusSucceeded,
	}, nil
}

func (e *recordingExecutor) finishCall() {
	e.mu.Lock()
	e.concurrent--
	e.mu.Unlock()
}

func (e *recordingExecutor) snapshot() (int, int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.callCount, e.maxParallel
}

func TestCreateJobValidatesFileAndInlineSources(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Date(2026, 9, 1, 7, 0, 0, 0, time.UTC)
	service, err := NewService(store, &recordingExecutor{calls: make(chan string, 1)}, Options{ScriptRoot: root, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	base := CreateJobInput{
		Name: "source validation", ScheduleType: ScheduleAt,
		ScheduleExpression: now.Add(time.Hour).Format(time.RFC3339), Timezone: "UTC",
	}
	tests := []struct {
		name    string
		modify  func(*CreateJobInput)
		wantErr bool
		typeOut SourceType
	}{
		{name: "legacy file default", modify: func(input *CreateJobInput) { input.ScriptPath = "safe.js" }, typeOut: SourceFile},
		{name: "explicit file", modify: func(input *CreateJobInput) { input.SourceType = SourceFile; input.ScriptPath = "safe.js" }, typeOut: SourceFile},
		{name: "inline", modify: func(input *CreateJobInput) { input.SourceType = SourceInline; input.InlineScript = "return {ok:true};" }, typeOut: SourceInline},
		{name: "both", modify: func(input *CreateJobInput) {
			input.SourceType = SourceInline
			input.ScriptPath = "safe.js"
			input.InlineScript = "1"
		}, wantErr: true},
		{name: "neither", modify: func(input *CreateJobInput) {}, wantErr: true},
		{name: "blank inline", modify: func(input *CreateJobInput) { input.SourceType = SourceInline; input.InlineScript = " \n\t" }, wantErr: true},
		{name: "oversized inline", modify: func(input *CreateJobInput) {
			input.SourceType = SourceInline
			input.InlineScript = strings.Repeat("x", MaxInlineScriptBytes+1)
		}, wantErr: true},
		{name: "unknown source", modify: func(input *CreateJobInput) { input.SourceType = "shell"; input.InlineScript = "1" }, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := base
			input.Name += " " + test.name
			test.modify(&input)
			job, err := service.CreateJob(context.Background(), input)
			if test.wantErr {
				if err == nil {
					t.Fatalf("unexpected success: %#v", job)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if job.SourceType != test.typeOut {
				t.Fatalf("sourceType=%q want=%q", job.SourceType, test.typeOut)
			}
		})
	}
}

func TestInlineAtEveryAndCronRecoverAfterRestart(t *testing.T) {
	root := t.TempDir()
	databasePath := filepath.Join(root, "scheduler.db")
	t0 := time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)
	store1, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	service1, err := NewService(store1, &recordingExecutor{calls: make(chan string, 1)}, Options{ScriptRoot: root, Now: func() time.Time { return t0 }})
	if err != nil {
		t.Fatal(err)
	}
	if err := service1.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	inputs := []CreateJobInput{
		{Name: "inline at", ScheduleType: ScheduleAt, ScheduleExpression: t0.Add(time.Minute).Format(time.RFC3339), Timezone: "UTC", SourceType: SourceInline, InlineScript: "1"},
		{Name: "inline every", ScheduleType: ScheduleEvery, ScheduleExpression: "1m", Timezone: "UTC", SourceType: SourceInline, InlineScript: "2"},
		{Name: "inline cron", ScheduleType: ScheduleCron, ScheduleExpression: "1 8 * * *", Timezone: "UTC", SourceType: SourceInline, InlineScript: "3"},
	}
	jobs := make([]Job, 0, len(inputs))
	for _, input := range inputs {
		job, err := service1.CreateJob(context.Background(), input)
		if err != nil {
			t.Fatal(err)
		}
		jobs = append(jobs, job)
	}
	closeService(t, service1)
	if err := store1.Close(); err != nil {
		t.Fatal(err)
	}

	t1 := t0.Add(2 * time.Minute)
	store2, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store2.Close()
	executor := &recordingExecutor{calls: make(chan string, len(jobs))}
	service2, err := NewService(store2, executor, Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond, Now: func() time.Time { return t1 }})
	if err != nil {
		t.Fatal(err)
	}
	if err := service2.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer closeService(t, service2)
	called := make(map[string]bool)
	deadline := time.After(2 * time.Second)
	for len(called) < len(jobs) {
		select {
		case id := <-executor.calls:
			called[id] = true
		case <-deadline:
			t.Fatalf("recovered inline calls=%v", called)
		}
	}
	for _, job := range jobs {
		waitForRunStatus(t, store2, job.ID, RunSucceeded)
		persisted, err := store2.GetJob(context.Background(), job.ID)
		if err != nil || persisted.SourceType != SourceInline || persisted.InlineScript == "" {
			t.Fatalf("inline source unavailable after recovery: job=%#v err=%v", persisted, err)
		}
	}
}

func TestServiceRecoveryRunsOneMisfireAndUsesFixedDelay(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("console.log('safe')"), 0o644); err != nil {
		t.Fatal(err)
	}
	databasePath := filepath.Join(root, "scheduler.db")
	t0 := time.Date(2026, 9, 1, 8, 0, 0, 0, time.UTC)

	store1, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	executor1 := &recordingExecutor{calls: make(chan string, 2)}
	service1, err := NewService(store1, executor1, Options{ScriptRoot: root, Now: func() time.Time { return t0 }})
	if err != nil {
		t.Fatal(err)
	}
	if err := service1.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	job, err := service1.CreateJob(context.Background(), CreateJobInput{
		Name: "persistent every", ScheduleType: ScheduleEvery, ScheduleExpression: "5m",
		Timezone: "UTC", ScriptPath: "safe.js",
	})
	if err != nil {
		t.Fatal(err)
	}
	closeService(t, service1)
	if err := store1.Close(); err != nil {
		t.Fatal(err)
	}

	t1 := t0.Add(20 * time.Minute)
	store2, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store2.Close()
	executor2 := &recordingExecutor{calls: make(chan string, 4)}
	service2, err := NewService(store2, executor2, Options{
		ScriptRoot: root, PollInterval: 10 * time.Millisecond, Now: func() time.Time { return t1 },
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := service2.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer closeService(t, service2)
	select {
	case called := <-executor2.calls:
		if called != job.ID {
			t.Fatalf("unexpected recovered job %s", called)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("recovered misfire was not executed")
	}
	waitForRunStatus(t, store2, job.ID, RunSucceeded)
	persisted, err := store2.GetJob(context.Background(), job.ID)
	if err != nil {
		t.Fatal(err)
	}
	wantNext := t1.Add(5 * time.Minute)
	if persisted.NextRunAt == nil || !persisted.NextRunAt.Equal(wantNext) {
		t.Fatalf("fixed-delay next run=%v want=%v", persisted.NextRunAt, wantNext)
	}
	time.Sleep(50 * time.Millisecond)
	if count, _ := executor2.snapshot(); count != 1 {
		t.Fatalf("misfire catch-up ran %d times, want exactly once", count)
	}
}

func TestServiceSerializesRunNowExecutions(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("1 + 1"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	block := make(chan struct{})
	executor := &recordingExecutor{calls: make(chan string, 4), block: block}
	now := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	service, err := NewService(store, executor, Options{ScriptRoot: root, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer closeService(t, service)
	job, err := service.CreateJob(context.Background(), CreateJobInput{
		Name: "serial", ScheduleType: ScheduleAt, ScheduleExpression: now.Add(time.Hour).Format(time.RFC3339),
		Timezone: "UTC", ScriptPath: "safe.js",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunNow(context.Background(), job.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RunNow(context.Background(), job.ID); err != nil {
		t.Fatal(err)
	}
	select {
	case <-executor.calls:
	case <-time.After(time.Second):
		t.Fatal("first run did not start")
	}
	select {
	case <-executor.calls:
		t.Fatal("second run started while first run was blocked")
	case <-time.After(75 * time.Millisecond):
	}
	close(block)
	select {
	case <-executor.calls:
	case <-time.After(time.Second):
		t.Fatal("second run did not start after first completed")
	}
	waitForRunCount(t, store, job.ID, 2)
	if _, maxParallel := executor.snapshot(); maxParallel != 1 {
		t.Fatalf("scheduler execution parallelism=%d want=1", maxParallel)
	}
}

func TestCreatePastAtWithSkipFailsClosed(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Date(2026, 9, 1, 9, 0, 0, 0, time.UTC)
	service, err := NewService(store, &recordingExecutor{calls: make(chan string, 1)}, Options{ScriptRoot: root, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.CreateJob(context.Background(), CreateJobInput{
		Name: "expired", ScheduleType: ScheduleAt, ScheduleExpression: now.Add(-time.Hour).Format(time.RFC3339),
		Timezone: "UTC", MisfirePolicy: MisfireSkip, ScriptPath: "safe.js",
	})
	if err == nil {
		t.Fatal("expired at+skip job unexpectedly created")
	}
}

func TestRecoverySkipMovesToFutureWithoutCatchUp(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("1"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	now := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	every := storedTestJob("job-skip-every", now.Add(-time.Hour))
	every.MisfirePolicy = MisfireSkip
	at := Job{
		ID: "job-skip-at", Name: "expired at", Enabled: true,
		ScheduleType: ScheduleAt, ScheduleExpression: now.Add(-time.Hour).Format(time.RFC3339),
		Timezone: "UTC", MisfirePolicy: MisfireSkip, TaskType: "script", ScriptPath: "safe.js",
		CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: now.Add(-2 * time.Hour),
	}
	pastAt := now.Add(-time.Hour)
	at.NextRunAt = &pastAt
	if err := store.CreateJob(context.Background(), every); err != nil {
		t.Fatal(err)
	}
	if err := store.CreateJob(context.Background(), at); err != nil {
		t.Fatal(err)
	}
	executor := &recordingExecutor{calls: make(chan string, 2)}
	service, err := NewService(store, executor, Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	defer closeService(t, service)
	recoveredEvery, err := store.GetJob(context.Background(), every.ID)
	if err != nil {
		t.Fatal(err)
	}
	if recoveredEvery.NextRunAt == nil || !recoveredEvery.NextRunAt.Equal(now.Add(5*time.Minute)) {
		t.Fatalf("skip every next=%v", recoveredEvery.NextRunAt)
	}
	recoveredAt, err := store.GetJob(context.Background(), at.ID)
	if err != nil {
		t.Fatal(err)
	}
	if recoveredAt.Enabled || recoveredAt.NextRunAt != nil {
		t.Fatalf("expired at+skip should be disabled: %#v", recoveredAt)
	}
	time.Sleep(30 * time.Millisecond)
	if count, _ := executor.snapshot(); count != 0 {
		t.Fatalf("skip recovery executed %d catch-up runs", count)
	}
}

func waitForRunStatus(t *testing.T, store *Store, jobID string, status RunStatus) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		runs, err := store.ListRuns(context.Background(), jobID, 10)
		if err == nil && len(runs) > 0 && runs[0].Status == status {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job %s did not reach status %s", jobID, status)
}

func waitForRunCount(t *testing.T, store *Store, jobID string, count int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		runs, err := store.ListRuns(context.Background(), jobID, 10)
		if err == nil && len(runs) == count {
			complete := true
			for _, run := range runs {
				complete = complete && run.Status == RunSucceeded
			}
			if complete {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("job %s did not complete %d runs", jobID, count)
}

func closeService(t *testing.T, service *Service) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := service.Close(ctx); err != nil {
		t.Errorf("close scheduler: %v", err)
	}
}
