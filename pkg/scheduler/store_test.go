package scheduler

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestStorePersistsLifecycleAndKeepsRunHistoryAfterDelete(t *testing.T) {
	ctx := context.Background()
	databasePath := filepath.Join(t.TempDir(), "scheduler.db")
	store, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	job := storedTestJob("job-persist", now)
	if err := store.CreateJob(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err := store.PauseJob(ctx, job.ID, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	paused, err := store.GetJob(ctx, job.ID)
	if err != nil || paused.Enabled || paused.NextRunAt != nil {
		t.Fatalf("unexpected paused job: %#v, err=%v", paused, err)
	}
	next := now.Add(10 * time.Minute)
	if err := store.SetEnabled(ctx, job.ID, true, &next, now.Add(2*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	persisted, err := store.GetJob(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !persisted.Enabled || persisted.NextRunAt == nil || !persisted.NextRunAt.Equal(next) {
		t.Fatalf("job did not survive reopen: %#v", persisted)
	}

	run, err := store.CreateManualRun(ctx, job.ID, now.Add(3*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if started, err := store.MarkRunStarted(ctx, run.ID, now.Add(3*time.Minute)); err != nil || !started {
		t.Fatalf("start run: started=%v err=%v", started, err)
	}
	if err := store.FinishRun(ctx, run, RunSucceeded, "exec-test", "", now.Add(4*time.Minute), false, nil, false); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteJob(ctx, job.ID, now.Add(5*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetJob(ctx, job.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted job still exists: %v", err)
	}
	runs, err := store.ListRuns(ctx, job.ID, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].ExecutionID != "exec-test" || runs[0].Status != RunSucceeded {
		t.Fatalf("run history was not preserved: %#v", runs)
	}
}

func TestStorePersistsInlineSourceAcrossReopen(t *testing.T) {
	ctx := context.Background()
	databasePath := filepath.Join(t.TempDir(), "scheduler.db")
	store, err := OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	job := storedTestJob("job-inline-persist", now)
	job.SourceType = SourceInline
	job.ScriptPath = ""
	job.InlineScript = "const privateValue = 'stored-inline-source';"
	job.HasInlineScript = true
	if err := store.CreateJob(ctx, job); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}

	store, err = OpenStore(databasePath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	persisted, err := store.GetJob(ctx, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.SourceType != SourceInline || !persisted.HasInlineScript || persisted.InlineScript != job.InlineScript || persisted.ScriptPath != "" {
		t.Fatalf("inline job did not survive reopen: %#v", persisted)
	}
}

func TestStoreMigratesLegacySchemaIdempotently(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "legacy.db")
	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		t.Fatal(err)
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
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 1, 11, 0, 0, 0, time.UTC)
	if _, err := db.Exec(`INSERT INTO scheduled_jobs VALUES (?, ?, 1, 'every', '5m', 'UTC', 'run_once', 'script', 'legacy.js', ?, ?, NULL, ?)`,
		"legacy-job", "legacy", formatTime(now), formatTime(now), formatTime(now.Add(5*time.Minute))); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO job_runs VALUES (?, ?, ?, ?, ?, 'succeeded', '', 'legacy-exec')`,
		"legacy-run", "legacy-job", formatTime(now), formatTime(now), formatTime(now.Add(time.Second))); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	for attempt := 0; attempt < 2; attempt++ {
		store, err := OpenStore(databasePath)
		if err != nil {
			t.Fatalf("migration attempt %d: %v", attempt+1, err)
		}
		job, err := store.GetJob(context.Background(), "legacy-job")
		if err != nil {
			t.Fatal(err)
		}
		if job.SourceType != SourceFile || job.ScriptPath != "legacy.js" || job.InlineScript != "" {
			t.Fatalf("legacy job changed during migration: %#v", job)
		}
		runs, err := store.ListRuns(context.Background(), job.ID, 10)
		if err != nil || len(runs) != 1 || runs[0].ExecutionID != "legacy-exec" {
			t.Fatalf("legacy run history changed: runs=%#v err=%v", runs, err)
		}
		if err := store.Close(); err != nil {
			t.Fatal(err)
		}
	}
}

func storedTestJob(id string, now time.Time) Job {
	next := now.Add(5 * time.Minute)
	return Job{
		ID:                 id,
		Name:               "test job",
		Enabled:            true,
		ScheduleType:       ScheduleEvery,
		ScheduleExpression: "5m",
		Timezone:           "UTC",
		MisfirePolicy:      MisfireRunOnce,
		TaskType:           "script",
		SourceType:         SourceFile,
		ScriptPath:         "test.js",
		CreatedAt:          now,
		UpdatedAt:          now,
		NextRunAt:          &next,
	}
}
