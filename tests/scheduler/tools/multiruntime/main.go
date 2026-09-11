package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/scheduler"

	_ "modernc.org/sqlite"
)

const helperEnv = "OPENDESK_SCHEDULER_OWNER_HELPER"

type recordingExecutor struct {
	calls chan string
	block chan struct{}
	count atomic.Int64
}

func (e *recordingExecutor) Execute(ctx context.Context, job scheduler.Job) (pkgExecution.ExecutionResult, error) {
	e.count.Add(1)
	select {
	case e.calls <- job.ID:
	case <-ctx.Done():
		return pkgExecution.ExecutionResult{Status: pkgExecution.ExecutionStatusCanceled}, ctx.Err()
	}
	if e.block != nil {
		select {
		case <-e.block:
		case <-ctx.Done():
			return pkgExecution.ExecutionResult{Status: pkgExecution.ExecutionStatusCanceled}, ctx.Err()
		}
	}
	return pkgExecution.ExecutionResult{ExecutionID: "exec-" + job.ID, Status: pkgExecution.ExecutionStatusSucceeded}, nil
}

func main() {
	if os.Getenv(helperEnv) == "1" {
		if err := runOwnerHelper(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}

	cases := []struct {
		name string
		run  func() error
	}{
		{"shared-store-and-concurrent-writes", sharedStoreAndConcurrentWrites},
		{"migration-concurrency", migrationConcurrency},
		{"single-active-standby-create-and-takeover", singleActiveStandbyCreateAndTakeover},
		{"standby-does-not-recover-live-run", standbyDoesNotRecoverLiveRun},
		{"crash-takeover", crashTakeover},
		{"restart-persistence", restartPersistence},
	}
	for _, testCase := range cases {
		if err := testCase.run(); err != nil {
			fmt.Fprintf(os.Stderr, "SCHEDULER_MULTIRUNTIME_FAIL case=%s error=%v\n", testCase.name, err)
			os.Exit(1)
		}
		fmt.Printf("SCHEDULER_MULTIRUNTIME_PASS case=%s\n", testCase.name)
	}
}

func sharedStoreAndConcurrentWrites() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-shared-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	storeA, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeA.Close()
	storeB, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeB.Close()

	ctx := context.Background()
	now := time.Now().UTC()
	errCh := make(chan error, 2)
	var wg sync.WaitGroup
	for worker, store := range []*scheduler.Store{storeA, storeB} {
		worker := worker
		store := store
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 20; i++ {
				job := persistentJob(fmt.Sprintf("shared-%d-%d", worker, i), now.Add(time.Hour))
				if err := store.CreateJob(ctx, job); err != nil {
					errCh <- err
					return
				}
			}
		}()
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		return fmt.Errorf("concurrent shared-store write: %w", err)
	}
	jobs, err := storeA.ListJobs(ctx)
	if err != nil {
		return err
	}
	if len(jobs) != 40 {
		return fmt.Errorf("shared-store job count=%d want=40", len(jobs))
	}
	return nil
}

func migrationConcurrency() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-migration-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	legacySchema := `
CREATE TABLE scheduled_jobs (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL,
 schedule_type TEXT NOT NULL, schedule_expression TEXT NOT NULL,
 timezone TEXT NOT NULL, misfire_policy TEXT NOT NULL, task_type TEXT NOT NULL,
 script_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 last_run_at TEXT, next_run_at TEXT
);
CREATE TABLE job_runs (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL, scheduled_at TEXT NOT NULL,
 started_at TEXT, finished_at TEXT, status TEXT NOT NULL,
 error TEXT NOT NULL DEFAULT '', execution_id TEXT NOT NULL DEFAULT ''
);`
	if _, err := db.Exec(legacySchema); err != nil {
		_ = db.Close()
		return err
	}
	if err := db.Close(); err != nil {
		return err
	}

	const workers = 8
	start := make(chan struct{})
	errCh := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			store, err := scheduler.OpenStore(dbPath)
			if err == nil {
				err = store.Close()
			}
			errCh <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if err != nil {
			return fmt.Errorf("concurrent migration: %w", err)
		}
	}
	store, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	return store.Close()
}

func singleActiveStandbyCreateAndTakeover() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-takeover-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	storeA, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeA.Close()
	storeB, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeB.Close()

	execA := &recordingExecutor{calls: make(chan string, 8)}
	execB := &recordingExecutor{calls: make(chan string, 8)}
	options := scheduler.Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond, OwnershipRetryInterval: 20 * time.Millisecond}
	serviceA, err := scheduler.NewService(storeA, execA, options)
	if err != nil {
		return err
	}
	serviceB, err := scheduler.NewService(storeB, execB, options)
	if err != nil {
		return err
	}
	if err := serviceA.Start(context.Background()); err != nil {
		return err
	}
	defer closeService(serviceA)
	if err := serviceB.Start(context.Background()); err != nil {
		return err
	}
	defer closeService(serviceB)
	if serviceA.RunnerState() != scheduler.RunnerStateActive || serviceB.RunnerState() != scheduler.RunnerStateStandby {
		return fmt.Errorf("runner states A=%s B=%s", serviceA.RunnerState(), serviceB.RunnerState())
	}
	if _, err := serviceB.RunNow(context.Background(), "missing"); !errors.Is(err, scheduler.ErrRunnerStandby) {
		return fmt.Errorf("standby RunNow error=%v want ErrRunnerStandby", err)
	}

	job, err := serviceB.CreateJob(context.Background(), dueInlineInput("created from standby"))
	if err != nil {
		return err
	}
	select {
	case id := <-execA.calls:
		if id != job.ID {
			return fmt.Errorf("active executed %s want %s", id, job.ID)
		}
	case id := <-execB.calls:
		return fmt.Errorf("standby executed %s", id)
	case <-time.After(2 * time.Second):
		return errors.New("active did not execute standby-created job")
	}
	if err := waitForRunStatus(storeA, job.ID, scheduler.RunSucceeded, 2*time.Second); err != nil {
		return err
	}
	time.Sleep(100 * time.Millisecond)
	if execA.count.Load() != 1 || execB.count.Load() != 0 {
		return fmt.Errorf("duplicate healthy execution counts active=%d standby=%d", execA.count.Load(), execB.count.Load())
	}

	if err := closeService(serviceA); err != nil {
		return err
	}
	if err := waitForRunnerState(serviceB, scheduler.RunnerStateActive, 2*time.Second); err != nil {
		return err
	}
	job2, err := serviceB.CreateJob(context.Background(), dueInlineInput("after graceful takeover"))
	if err != nil {
		return err
	}
	select {
	case id := <-execB.calls:
		if id != job2.ID {
			return fmt.Errorf("takeover executed %s want %s", id, job2.ID)
		}
	case <-time.After(2 * time.Second):
		return errors.New("standby did not execute after graceful takeover")
	}
	return waitForRunStatus(storeB, job2.ID, scheduler.RunSucceeded, 2*time.Second)
}

func standbyDoesNotRecoverLiveRun() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-live-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	storeA, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeA.Close()
	storeB, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer storeB.Close()

	now := time.Now().UTC()
	job := persistentJob("live-owner", now.Add(-time.Second))
	job.ScheduleType = scheduler.ScheduleEvery
	job.ScheduleExpression = "1m"
	if err := storeA.CreateJob(context.Background(), job); err != nil {
		return err
	}

	block := make(chan struct{})
	execA := &recordingExecutor{calls: make(chan string, 2), block: block}
	execB := &recordingExecutor{calls: make(chan string, 2)}
	options := scheduler.Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond, OwnershipRetryInterval: 20 * time.Millisecond}
	serviceA, err := scheduler.NewService(storeA, execA, options)
	if err != nil {
		return err
	}
	if err := serviceA.Start(context.Background()); err != nil {
		return err
	}
	defer closeService(serviceA)
	select {
	case <-execA.calls:
	case <-time.After(2 * time.Second):
		return errors.New("active run did not start")
	}
	if err := waitForRunStatus(storeA, job.ID, scheduler.RunRunning, 2*time.Second); err != nil {
		return err
	}

	serviceB, err := scheduler.NewService(storeB, execB, options)
	if err != nil {
		return err
	}
	if err := serviceB.Start(context.Background()); err != nil {
		return err
	}
	defer closeService(serviceB)
	if serviceB.RunnerState() != scheduler.RunnerStateStandby {
		return fmt.Errorf("second service state=%s want standby", serviceB.RunnerState())
	}
	time.Sleep(100 * time.Millisecond)
	runs, err := storeB.ListRuns(context.Background(), job.ID, 10)
	if err != nil {
		return err
	}
	if len(runs) != 1 || runs[0].Status != scheduler.RunRunning {
		return fmt.Errorf("standby startup mutated active run: %#v", runs)
	}
	if execB.count.Load() != 0 {
		return fmt.Errorf("standby duplicated live run count=%d", execB.count.Load())
	}
	close(block)
	return waitForRunStatus(storeA, job.ID, scheduler.RunSucceeded, 2*time.Second)
}

func crashTakeover() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-crash-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	readyPath := filepath.Join(root, "owner.ready")

	executable, err := os.Executable()
	if err != nil {
		return err
	}
	command := exec.Command(executable)
	command.Env = append(os.Environ(),
		helperEnv+"=1",
		"OPENDESK_SCHEDULER_OWNER_DB="+dbPath,
		"OPENDESK_SCHEDULER_OWNER_ROOT="+root,
		"OPENDESK_SCHEDULER_OWNER_READY="+readyPath,
	)
	if err := command.Start(); err != nil {
		return err
	}
	childDone := make(chan error, 1)
	go func() { childDone <- command.Wait() }()
	if err := waitForFile(readyPath, 3*time.Second); err != nil {
		_ = command.Process.Kill()
		return err
	}

	store, err := scheduler.OpenStore(dbPath)
	if err != nil {
		_ = command.Process.Kill()
		return err
	}
	defer store.Close()
	executor := &recordingExecutor{calls: make(chan string, 2)}
	service, err := scheduler.NewService(store, executor, scheduler.Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond, OwnershipRetryInterval: 20 * time.Millisecond})
	if err != nil {
		_ = command.Process.Kill()
		return err
	}
	if err := service.Start(context.Background()); err != nil {
		_ = command.Process.Kill()
		return err
	}
	defer closeService(service)
	if service.RunnerState() != scheduler.RunnerStateStandby {
		_ = command.Process.Kill()
		return fmt.Errorf("secondary state=%s want standby", service.RunnerState())
	}

	if err := command.Process.Kill(); err != nil {
		return err
	}
	select {
	case <-childDone:
	case <-time.After(3 * time.Second):
		return errors.New("killed owner process did not exit")
	}
	if err := waitForRunnerState(service, scheduler.RunnerStateActive, 3*time.Second); err != nil {
		return err
	}
	job, err := service.CreateJob(context.Background(), dueInlineInput("after crash takeover"))
	if err != nil {
		return err
	}
	select {
	case id := <-executor.calls:
		if id != job.ID {
			return fmt.Errorf("takeover executed %s want %s", id, job.ID)
		}
	case <-time.After(2 * time.Second):
		return errors.New("crash takeover owner did not execute due job")
	}
	return waitForRunStatus(store, job.ID, scheduler.RunSucceeded, 2*time.Second)
}

func restartPersistence() error {
	root, err := os.MkdirTemp("", "opendesk-scheduler-persist-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(root)
	dbPath := filepath.Join(root, "scheduler.db")
	store, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	job := persistentJob("persisted", time.Now().UTC().Add(time.Hour))
	if err := store.CreateJob(context.Background(), job); err != nil {
		_ = store.Close()
		return err
	}
	if err := store.Close(); err != nil {
		return err
	}
	store, err = scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer store.Close()
	persisted, err := store.GetJob(context.Background(), job.ID)
	if err != nil {
		return err
	}
	if persisted.ID != job.ID || persisted.NextRunAt == nil {
		return fmt.Errorf("persisted job mismatch: %#v", persisted)
	}
	return nil
}

func runOwnerHelper() error {
	dbPath := os.Getenv("OPENDESK_SCHEDULER_OWNER_DB")
	root := os.Getenv("OPENDESK_SCHEDULER_OWNER_ROOT")
	readyPath := os.Getenv("OPENDESK_SCHEDULER_OWNER_READY")
	store, err := scheduler.OpenStore(dbPath)
	if err != nil {
		return err
	}
	defer store.Close()
	service, err := scheduler.NewService(store, &recordingExecutor{calls: make(chan string, 1)}, scheduler.Options{ScriptRoot: root, OwnershipRetryInterval: 20 * time.Millisecond})
	if err != nil {
		return err
	}
	if err := service.Start(context.Background()); err != nil {
		return err
	}
	if service.RunnerState() != scheduler.RunnerStateActive {
		return fmt.Errorf("helper state=%s want active", service.RunnerState())
	}
	if err := os.WriteFile(readyPath, []byte("active\n"), 0o600); err != nil {
		return err
	}
	select {}
}

func persistentJob(id string, next time.Time) scheduler.Job {
	now := time.Now().UTC()
	return scheduler.Job{
		ID:                 id,
		Name:               id,
		Enabled:            true,
		ScheduleType:       scheduler.ScheduleAt,
		ScheduleExpression: next.UTC().Format(time.RFC3339Nano),
		Timezone:           "UTC",
		MisfirePolicy:      scheduler.MisfireRunOnce,
		TaskType:           "script",
		SourceType:         scheduler.SourceInline,
		InlineScript:       "1",
		HasInlineScript:    true,
		CreatedAt:          now,
		UpdatedAt:          now,
		NextRunAt:          ptrTime(next.UTC()),
	}
}

func dueInlineInput(name string) scheduler.CreateJobInput {
	return scheduler.CreateJobInput{
		Name:               name,
		ScheduleType:       scheduler.ScheduleAt,
		ScheduleExpression: time.Now().UTC().Add(150 * time.Millisecond).Format(time.RFC3339Nano),
		Timezone:           "UTC",
		SourceType:         scheduler.SourceInline,
		InlineScript:       "1",
	}
}

func ptrTime(value time.Time) *time.Time { return &value }

func waitForRunnerState(service *scheduler.Service, state scheduler.RunnerState, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if service.RunnerState() == state {
			return nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fmt.Errorf("runner state=%s want=%s", service.RunnerState(), state)
}

func waitForRunStatus(store *scheduler.Store, jobID string, status scheduler.RunStatus, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		runs, err := store.ListRuns(context.Background(), jobID, 10)
		if err == nil && len(runs) > 0 && runs[0].Status == status {
			return nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fmt.Errorf("job %s did not reach status %s", jobID, status)
}

func waitForFile(path string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
			return nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return fmt.Errorf("file did not appear: %s", path)
}

func closeService(service *scheduler.Service) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return service.Close(ctx)
}
