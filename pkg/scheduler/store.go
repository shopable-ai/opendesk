package scheduler

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("scheduler record not found")

type Store struct {
	db   *sql.DB
	path string
}

func DefaultDatabasePath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locate user home: %w", err)
	}
	return filepath.Join(home, ".opendesk", "opendesk", "scheduler.db"), nil
}

func OpenStore(path string) (*Store, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		var err error
		path, err = DefaultDatabasePath()
		if err != nil {
			return nil, err
		}
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve scheduler database path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return nil, fmt.Errorf("create scheduler data directory: %w", err)
	}
	db, err := sql.Open("sqlite", absPath)
	if err != nil {
		return nil, fmt.Errorf("open scheduler database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	store := &Store{db: db, path: absPath}
	if err := store.initialize(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) initialize(ctx context.Context) error {
	for _, statement := range []string{
		"PRAGMA busy_timeout = 5000",
		"PRAGMA foreign_keys = ON",
		"PRAGMA journal_mode = WAL",
	} {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("initialize scheduler sqlite: %w", err)
		}
	}
	const schema = `
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    schedule_type TEXT NOT NULL,
    schedule_expression TEXT NOT NULL,
    timezone TEXT NOT NULL,
    misfire_policy TEXT NOT NULL,
    task_type TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'file',
    script_path TEXT NOT NULL,
    inline_script TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_run_at TEXT,
    next_run_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
    ON scheduled_jobs(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS job_runs (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    status TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    execution_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_scheduled
    ON job_runs(job_id, scheduled_at DESC);
`
	if _, err := s.db.ExecContext(ctx, schema); err != nil {
		return fmt.Errorf("migrate scheduler database: %w", err)
	}
	for _, migration := range []struct {
		name       string
		definition string
	}{
		{name: "source_type", definition: "TEXT NOT NULL DEFAULT 'file'"},
		{name: "inline_script", definition: "TEXT NOT NULL DEFAULT ''"},
	} {
		exists, err := s.scheduledJobsColumnExists(ctx, migration.name)
		if err != nil {
			return err
		}
		if !exists {
			statement := fmt.Sprintf("ALTER TABLE scheduled_jobs ADD COLUMN %s %s", migration.name, migration.definition)
			if _, err := s.db.ExecContext(ctx, statement); err != nil {
				return fmt.Errorf("migrate scheduler database column %s: %w", migration.name, err)
			}
		}
	}
	return nil
}

func (s *Store) scheduledJobsColumnExists(ctx context.Context, name string) (bool, error) {
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info(scheduled_jobs)")
	if err != nil {
		return false, fmt.Errorf("inspect scheduler database columns: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, primaryKey int
		var columnName, columnType string
		var defaultValue sql.NullString
		if err := rows.Scan(&cid, &columnName, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return false, fmt.Errorf("scan scheduler database column: %w", err)
		}
		if columnName == name {
			return true, nil
		}
	}
	if err := rows.Err(); err != nil {
		return false, fmt.Errorf("inspect scheduler database columns: %w", err)
	}
	return false, nil
}

func (s *Store) CreateJob(ctx context.Context, job Job) error {
	sourceType := job.SourceType
	if sourceType == "" {
		sourceType = SourceFile
	}
	_, err := s.db.ExecContext(ctx, `
INSERT INTO scheduled_jobs (
    id, name, enabled, schedule_type, schedule_expression, timezone,
    misfire_policy, task_type, source_type, script_path, inline_script, created_at, updated_at,
    last_run_at, next_run_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		job.ID, job.Name, boolInt(job.Enabled), job.ScheduleType,
		job.ScheduleExpression, job.Timezone, job.MisfirePolicy, job.TaskType,
		sourceType, job.ScriptPath, job.InlineScript, formatTime(job.CreatedAt), formatTime(job.UpdatedAt),
		nullTimeValue(job.LastRunAt), nullTimeValue(job.NextRunAt),
	)
	if err != nil {
		return fmt.Errorf("create scheduled job: %w", err)
	}
	return nil
}

func (s *Store) GetJob(ctx context.Context, id string) (Job, error) {
	row := s.db.QueryRowContext(ctx, jobSelect+" WHERE id = ?", id)
	job, err := scanJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	if err != nil {
		return Job{}, fmt.Errorf("get scheduled job: %w", err)
	}
	job.LastRun, err = s.latestRun(ctx, job.ID)
	if err != nil {
		return Job{}, err
	}
	return job, nil
}

func (s *Store) ListJobs(ctx context.Context) ([]Job, error) {
	rows, err := s.db.QueryContext(ctx, jobSelect+" ORDER BY created_at DESC")
	if err != nil {
		return nil, fmt.Errorf("list scheduled jobs: %w", err)
	}
	jobs := make([]Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("scan scheduled job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list scheduled jobs: %w", err)
	}
	for index := range jobs {
		jobs[index].LastRun, err = s.latestRun(ctx, jobs[index].ID)
		if err != nil {
			return nil, err
		}
	}
	return jobs, nil
}

func (s *Store) ListEnabledJobs(ctx context.Context) ([]Job, error) {
	rows, err := s.db.QueryContext(ctx, jobSelect+" WHERE enabled = 1 ORDER BY created_at")
	if err != nil {
		return nil, fmt.Errorf("list enabled jobs: %w", err)
	}
	defer rows.Close()
	jobs := make([]Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (s *Store) ListDueJobs(ctx context.Context, now time.Time, limit int) ([]Job, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, jobSelect+`
 WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
 ORDER BY next_run_at LIMIT ?`, formatTime(now), limit)
	if err != nil {
		return nil, fmt.Errorf("list due jobs: %w", err)
	}
	defer rows.Close()
	jobs := make([]Job, 0)
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (s *Store) SetEnabled(ctx context.Context, id string, enabled bool, nextRun *time.Time, now time.Time) error {
	result, err := s.db.ExecContext(ctx, `
UPDATE scheduled_jobs SET enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
		boolInt(enabled), nullTimeValue(nextRun), formatTime(now), id)
	if err != nil {
		return fmt.Errorf("update scheduled job: %w", err)
	}
	return requireAffected(result)
}

func (s *Store) UpdateNextRun(ctx context.Context, id string, enabled bool, nextRun *time.Time, now time.Time) error {
	return s.SetEnabled(ctx, id, enabled, nextRun, now)
}

func (s *Store) PauseJob(ctx context.Context, id string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `
UPDATE scheduled_jobs SET enabled = 0, next_run_at = NULL, updated_at = ? WHERE id = ?`, formatTime(now), id)
	if err != nil {
		return fmt.Errorf("pause scheduled job: %w", err)
	}
	if err := requireAffected(result); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
UPDATE job_runs SET status = ?, error = ?, finished_at = ?
WHERE job_id = ? AND status = ?`, RunSkipped, "job paused before execution", formatTime(now), id, RunQueued); err != nil {
		return fmt.Errorf("skip paused job runs: %w", err)
	}
	return tx.Commit()
}

func (s *Store) DeleteJob(ctx context.Context, id string, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
UPDATE job_runs SET status = ?, error = ?, finished_at = ?
WHERE job_id = ? AND status = ?`, RunSkipped, "job deleted before execution", formatTime(now), id, RunQueued); err != nil {
		return fmt.Errorf("skip deleted job runs: %w", err)
	}
	result, err := tx.ExecContext(ctx, "DELETE FROM scheduled_jobs WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("delete scheduled job: %w", err)
	}
	if err := requireAffected(result); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ClaimScheduledRun(ctx context.Context, job Job, now time.Time) (JobRun, bool, error) {
	if job.NextRunAt == nil {
		return JobRun{}, false, nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return JobRun{}, false, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `
UPDATE scheduled_jobs SET next_run_at = NULL, updated_at = ?
WHERE id = ? AND enabled = 1 AND next_run_at = ?`,
		formatTime(now), job.ID, formatTime(*job.NextRunAt))
	if err != nil {
		return JobRun{}, false, fmt.Errorf("claim scheduled job: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil || affected == 0 {
		return JobRun{}, false, err
	}
	run := JobRun{
		ID:          newID("run"),
		JobID:       job.ID,
		ScheduledAt: job.NextRunAt.UTC(),
		Status:      RunQueued,
	}
	if err := insertRun(ctx, tx, run); err != nil {
		return JobRun{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return JobRun{}, false, err
	}
	return run, true, nil
}

func (s *Store) CreateManualRun(ctx context.Context, jobID string, now time.Time) (JobRun, error) {
	run := JobRun{ID: newID("run"), JobID: jobID, ScheduledAt: now.UTC(), Status: RunQueued}
	if _, err := s.GetJob(ctx, jobID); err != nil {
		return JobRun{}, err
	}
	if err := insertRun(ctx, s.db, run); err != nil {
		return JobRun{}, err
	}
	return run, nil
}

func (s *Store) MarkRunStarted(ctx context.Context, runID string, now time.Time) (bool, error) {
	result, err := s.db.ExecContext(ctx, `
UPDATE job_runs SET status = ?, started_at = ? WHERE id = ? AND status = ?`,
		RunRunning, formatTime(now), runID, RunQueued)
	if err != nil {
		return false, fmt.Errorf("start scheduled run: %w", err)
	}
	affected, err := result.RowsAffected()
	return affected == 1, err
}

func (s *Store) FinishRun(
	ctx context.Context,
	run JobRun,
	status RunStatus,
	executionID string,
	errText string,
	finishedAt time.Time,
	scheduled bool,
	nextRun *time.Time,
	disable bool,
) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
UPDATE job_runs SET status = ?, finished_at = ?, error = ?, execution_id = ? WHERE id = ?`,
		status, formatTime(finishedAt), errText, executionID, run.ID); err != nil {
		return fmt.Errorf("finish scheduled run: %w", err)
	}
	if scheduled {
		if disable {
			_, err = tx.ExecContext(ctx, `
UPDATE scheduled_jobs SET enabled = 0, next_run_at = NULL, last_run_at = ?, updated_at = ? WHERE id = ?`,
				formatTime(finishedAt), formatTime(finishedAt), run.JobID)
		} else {
			_, err = tx.ExecContext(ctx, `
UPDATE scheduled_jobs
SET last_run_at = ?, updated_at = ?,
    next_run_at = CASE WHEN enabled = 1 THEN ? ELSE NULL END
WHERE id = ?`, formatTime(finishedAt), formatTime(finishedAt), nullTimeValue(nextRun), run.JobID)
		}
	} else {
		_, err = tx.ExecContext(ctx, `
UPDATE scheduled_jobs SET last_run_at = ?, updated_at = ? WHERE id = ?`,
			formatTime(finishedAt), formatTime(finishedAt), run.JobID)
	}
	if err != nil {
		return fmt.Errorf("update job after run: %w", err)
	}
	return tx.Commit()
}

func (s *Store) RecoverInterruptedRuns(ctx context.Context, now time.Time) error {
	_, err := s.db.ExecContext(ctx, `
UPDATE job_runs SET status = ?, finished_at = ?, error = ?
WHERE status IN (?, ?)`, RunCanceled, formatTime(now), "OpenDesk stopped before the run completed", RunQueued, RunRunning)
	if err != nil {
		return fmt.Errorf("recover interrupted scheduler runs: %w", err)
	}
	return nil
}

func (s *Store) ListRuns(ctx context.Context, jobID string, limit int) ([]JobRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.db.QueryContext(ctx, runSelect+`
 WHERE job_id = ? ORDER BY scheduled_at DESC LIMIT ?`, jobID, limit)
	if err != nil {
		return nil, fmt.Errorf("list scheduled runs: %w", err)
	}
	defer rows.Close()
	runs := make([]JobRun, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

const jobSelect = `SELECT id, name, enabled, schedule_type, schedule_expression,
timezone, misfire_policy, task_type, source_type, script_path, inline_script, created_at, updated_at,
last_run_at, next_run_at FROM scheduled_jobs`

const runSelect = `SELECT id, job_id, scheduled_at, started_at, finished_at,
status, error, execution_id FROM job_runs`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanJob(scanner rowScanner) (Job, error) {
	var (
		job              Job
		enabled          int
		created, updated string
		lastRun, nextRun sql.NullString
	)
	err := scanner.Scan(
		&job.ID, &job.Name, &enabled, &job.ScheduleType, &job.ScheduleExpression,
		&job.Timezone, &job.MisfirePolicy, &job.TaskType, &job.SourceType, &job.ScriptPath, &job.InlineScript,
		&created, &updated, &lastRun, &nextRun,
	)
	if err != nil {
		return Job{}, err
	}
	job.Enabled = enabled != 0
	if job.SourceType == "" {
		job.SourceType = SourceFile
	}
	job.HasInlineScript = job.SourceType == SourceInline && job.InlineScript != ""
	job.CreatedAt, err = parseStoredTime(created)
	if err != nil {
		return Job{}, err
	}
	job.UpdatedAt, err = parseStoredTime(updated)
	if err != nil {
		return Job{}, err
	}
	job.LastRunAt, err = parseNullTime(lastRun)
	if err != nil {
		return Job{}, err
	}
	job.NextRunAt, err = parseNullTime(nextRun)
	return job, err
}

func scanRun(scanner rowScanner) (JobRun, error) {
	var (
		run               JobRun
		scheduled         string
		started, finished sql.NullString
	)
	if err := scanner.Scan(&run.ID, &run.JobID, &scheduled, &started, &finished, &run.Status, &run.Error, &run.ExecutionID); err != nil {
		return JobRun{}, err
	}
	var err error
	run.ScheduledAt, err = parseStoredTime(scheduled)
	if err != nil {
		return JobRun{}, err
	}
	run.StartedAt, err = parseNullTime(started)
	if err != nil {
		return JobRun{}, err
	}
	run.FinishedAt, err = parseNullTime(finished)
	return run, err
}

func (s *Store) latestRun(ctx context.Context, jobID string) (*JobRun, error) {
	run, err := scanRun(s.db.QueryRowContext(ctx, runSelect+" WHERE job_id = ? ORDER BY scheduled_at DESC LIMIT 1", jobID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get latest scheduled run: %w", err)
	}
	return &run, nil
}

type sqlExecer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertRun(ctx context.Context, execer sqlExecer, run JobRun) error {
	_, err := execer.ExecContext(ctx, `
INSERT INTO job_runs (id, job_id, scheduled_at, started_at, finished_at, status, error, execution_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, run.ID, run.JobID, formatTime(run.ScheduledAt),
		nullTimeValue(run.StartedAt), nullTimeValue(run.FinishedAt), run.Status, run.Error, run.ExecutionID)
	if err != nil {
		return fmt.Errorf("create scheduled run: %w", err)
	}
	return nil
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func parseStoredTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse scheduler timestamp %q: %w", value, err)
	}
	return parsed.UTC(), nil
}

func parseNullTime(value sql.NullString) (*time.Time, error) {
	if !value.Valid || value.String == "" {
		return nil, nil
	}
	parsed, err := parseStoredTime(value.String)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func nullTimeValue(value *time.Time) any {
	if value == nil || value.IsZero() {
		return nil
	}
	return formatTime(*value)
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func requireAffected(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func newID(prefix string) string {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return prefix + "-" + hex.EncodeToString(raw[:])
	}
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}
