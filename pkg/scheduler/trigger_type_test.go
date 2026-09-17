package scheduler

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func TestStorePersistsServerOwnedTriggerType(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "scheduler.db")
	store, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 18, 4, 0, 0, 0, time.UTC)
	job := storedTestJob("job-trigger", now)
	job.ScheduleType = ScheduleAt
	job.ScheduleExpression = now.Add(time.Minute).Format(time.RFC3339Nano)
	next := now.Add(time.Minute)
	job.NextRunAt = &next
	if err := store.CreateJob(ctx, job); err != nil {
		t.Fatal(err)
	}

	scheduled, claimed, err := store.ClaimScheduledRun(ctx, job, next)
	if err != nil || !claimed {
		t.Fatalf("ClaimScheduledRun claimed=%v err=%v", claimed, err)
	}
	if scheduled.TriggerType != TriggerScheduled {
		t.Fatalf("scheduled triggerType=%q want=%q", scheduled.TriggerType, TriggerScheduled)
	}
	manual, err := store.CreateManualRun(ctx, job.ID, next.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if manual.TriggerType != TriggerManual {
		t.Fatalf("manual triggerType=%q want=%q", manual.TriggerType, TriggerManual)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	runs, err := store.ListRuns(ctx, job.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 2 {
		t.Fatalf("run count=%d want=2: %#v", len(runs), runs)
	}
	seen := map[TriggerType]bool{}
	for _, run := range runs {
		seen[run.TriggerType] = true
	}
	if !seen[TriggerScheduled] || !seen[TriggerManual] {
		t.Fatalf("persisted trigger types=%v", seen)
	}
}

func TestStoreMigratesLegacyRunTriggerToUnknown(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`
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
);`); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 18, 4, 0, 0, 0, time.UTC)
	if _, err := db.Exec(`INSERT INTO job_runs
(id, job_id, scheduled_at, started_at, finished_at, status, error, execution_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		"legacy-run", "legacy-job", formatTime(now), formatTime(now), formatTime(now.Add(time.Second)),
		RunSucceeded, "", "legacy-execution"); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	exists, err := store.jobRunsColumnExists(context.Background(), "trigger_type")
	if err != nil || !exists {
		t.Fatalf("trigger_type migration exists=%v err=%v", exists, err)
	}
	runs, err := store.ListRuns(context.Background(), "legacy-job", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].TriggerType != TriggerUnknown {
		t.Fatalf("legacy run=%#v", runs)
	}
}
