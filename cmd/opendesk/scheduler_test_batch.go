package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"opendesk/internal/processlock"
	"opendesk/pkg/appdata"
	pkgScheduler "opendesk/pkg/scheduler"
)

const (
	schedulerTestBatchSchemaVersion = 1
	schedulerTestDefaultFirstDelay  = 15 * time.Second
	schedulerTestDefaultSecondDelay = 45 * time.Second
	schedulerTestDefaultTolerance   = 3 * time.Second
	schedulerTestEvidenceFile       = "scheduler-test-result.json"
)

type schedulerTestBatchJob struct {
	Kind                string    `json:"kind"`
	Name                string    `json:"name"`
	SourceType          string    `json:"sourceType"`
	ScriptPath          string    `json:"scriptPath,omitempty"`
	JobID               string    `json:"jobId,omitempty"`
	ExpectedScheduledAt time.Time `json:"expectedScheduledAt"`
	PersistedScheduled  bool      `json:"persistedScheduled"`
}

type schedulerTestBatch struct {
	SchemaVersion       int                     `json:"schemaVersion"`
	BatchID             string                  `json:"batchId"`
	RequestID           string                  `json:"requestId"`
	CreatedAt           time.Time               `json:"createdAt"`
	UpdatedAt           time.Time               `json:"updatedAt"`
	Status              string                  `json:"status"`
	Jobs                []schedulerTestBatchJob `json:"jobs"`
	PreDueCheckedAt     *time.Time              `json:"preDueCheckedAt,omitempty"`
	PreDueHistoryEmpty  bool                    `json:"preDueHistoryEmpty"`
	LastError           string                  `json:"lastError,omitempty"`
	ReportPath          string                  `json:"reportPath,omitempty"`
	RemovedAt           *time.Time              `json:"removedAt,omitempty"`
}

type schedulerTestRunCheck struct {
	Kind                string                     `json:"kind"`
	JobID               string                     `json:"jobId"`
	ExpectedScheduledAt time.Time                  `json:"expectedScheduledAt"`
	PersistedScheduled  bool                       `json:"persistedScheduled"`
	RunCount            int                        `json:"runCount"`
	Run                 *pkgScheduler.JobRun       `json:"run,omitempty"`
	StartLatencyMs      *int64                     `json:"startLatencyMs,omitempty"`
	Checks              map[string]bool            `json:"checks"`
	ArtifactPath        string                     `json:"artifactPath,omitempty"`
	StdoutPath          string                     `json:"stdoutPath,omitempty"`
	PayloadEvidence     map[string]any             `json:"payloadEvidence,omitempty"`
	Problems            []string                   `json:"problems,omitempty"`
}

type schedulerTestVerificationReport struct {
	SchemaVersion       int                     `json:"schemaVersion"`
	BatchID             string                  `json:"batchId"`
	CheckedAt           time.Time               `json:"checkedAt"`
	VerificationStatus  string                  `json:"verificationStatus"`
	RunnerState         string                  `json:"runnerState"`
	LatencyToleranceMs  int64                   `json:"latencyToleranceMs"`
	PreDueHistoryEmpty  bool                    `json:"preDueHistoryEmpty"`
	DifferentExecutions bool                    `json:"differentExecutionIds"`
	Runs                []schedulerTestRunCheck `json:"runs"`
	Problems            []string                `json:"problems,omitempty"`
	NativeVisual        string                  `json:"nativeVisual"`
	PlatformResults     map[string]string       `json:"platformResults"`
}

type schedulerTestRemovalResult struct {
	BatchID          string   `json:"batchId"`
	DeletedJobIDs    []string `json:"deletedJobIds"`
	AlreadyMissing   []string `json:"alreadyMissingJobIds,omitempty"`
	RunningAtRemoval []string `json:"runningAtRemovalJobIds,omitempty"`
	FutureSchedulesRemoved bool `json:"futureSchedulesRemoved"`
	ReportPath       string   `json:"reportPath,omitempty"`
}

func runSchedulerTestCLI(ctx context.Context, args []string) (any, error) {
	if len(args) == 0 {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "usage: opendesk scheduler test <add|verify|remove> ...")
	}
	switch args[0] {
	case "add":
		return schedulerTestAdd(ctx, args[1:])
	case "verify":
		return schedulerTestVerify(ctx, args[1:])
	case "remove":
		return schedulerTestRemove(ctx, args[1:])
	default:
		return nil, schedulerCLIError("SCHEDULER_USAGE", fmt.Sprintf("unknown scheduler test command %q", args[0]))
	}
}

func schedulerTestAdd(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler test add", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	requestID := flags.String("request-id", "", "idempotency id")
	firstDelay := flags.Duration("first-delay", schedulerTestDefaultFirstDelay, "first reminder delay")
	secondDelay := flags.Duration("second-delay", schedulerTestDefaultSecondDelay, "second reminder delay")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 || *firstDelay <= 0 || *secondDelay <= *firstDelay {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "test add requires 0 < --first-delay < --second-delay")
	}
	if strings.TrimSpace(*requestID) == "" {
		*requestID = newSchedulerTestID("request")
	}
	storeRoot, err := schedulerTestStoreRoot()
	if err != nil { return nil, err }
	lockCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	lease, err := processlock.Acquire(lockCtx, filepath.Join(storeRoot, ".batch.lock"), 25*time.Millisecond)
	if err != nil {
		return nil, schedulerCLIError("SCHEDULER_TEST_BUSY", fmt.Sprintf("acquire Scheduler test batch lock: %v", err))
	}
	defer lease.Close()

	batch, found, err := findSchedulerTestBatchByRequest(storeRoot, strings.TrimSpace(*requestID))
	if err != nil { return nil, err }
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil { return nil, err }
	if connection.status.RunnerState != "active" {
		return nil, schedulerCLIError("APP_SCHEDULER_NOT_OWNER", "the current OpenDesk desktop App is not the active Scheduler owner")
	}
	fileRelative, err := prepareSchedulerTestPayloadFile(connection.status.ScriptRoot)
	if err != nil { return nil, err }

	if !found {
		base := time.Now().UTC()
		batch = schedulerTestBatch{
			SchemaVersion: schedulerTestBatchSchemaVersion,
			BatchID:       newSchedulerTestID("batch"),
			RequestID:     strings.TrimSpace(*requestID),
			CreatedAt:     base,
			UpdatedAt:     base,
			Status:        "creating",
			Jobs: []schedulerTestBatchJob{
				{
					Kind: "text", Name: "OpenDesk 调度测试 · 文本 · " + shortBatchID(batchIDPlaceholder()),
					SourceType: string(pkgScheduler.SourceInline), ExpectedScheduledAt: base.Add(*firstDelay),
				},
				{
					Kind: "file", Name: "OpenDesk 调度测试 · 文件 · " + shortBatchID(batchIDPlaceholder()),
					SourceType: string(pkgScheduler.SourceFile), ScriptPath: fileRelative, ExpectedScheduledAt: base.Add(*secondDelay),
				},
			},
		}
		// Names are deterministic from the final batch id. This also lets a retry
		// recover a job created just before a client crash without deleting by name.
		batch.Jobs[0].Name = "OpenDesk 调度测试 · 文本 · " + shortBatchID(batch.BatchID)
		batch.Jobs[1].Name = "OpenDesk 调度测试 · 文件 · " + shortBatchID(batch.BatchID)
		if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
		if err := saveCurrentSchedulerTestBatch(storeRoot, batch.BatchID); err != nil { return nil, err }
	} else {
		if batch.Status == "removed" {
			return batch, nil
		}
		if len(batch.Jobs) != 2 {
			return nil, schedulerCLIError("SCHEDULER_TEST_CORRUPT", "stored Scheduler test batch does not contain exactly two jobs")
		}
		batch.Jobs[1].ScriptPath = fileRelative
	}

	// Recover deterministic jobs before creating a missing slot. This closes
	// the create-response persistence crash window without ever deleting by name.
	var allJobs []pkgScheduler.Job
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &allJobs); err != nil { return nil, err }
	for index := range batch.Jobs {
		if batch.Jobs[index].JobID != "" { continue }
		if recovered := recoverSchedulerTestJob(allJobs, batch.Jobs[index]); recovered != nil {
			batch.Jobs[index].JobID = recovered.ID
			batch.Jobs[index].PersistedScheduled = recovered.NextRunAt != nil && recovered.NextRunAt.Equal(batch.Jobs[index].ExpectedScheduledAt)
			batch.UpdatedAt = time.Now().UTC()
			if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
		}
	}

	for index := range batch.Jobs {
		entry := &batch.Jobs[index]
		if entry.JobID != "" { continue }
		if !time.Now().UTC().Before(entry.ExpectedScheduledAt) {
			batch.Status = "partial"
			batch.LastError = fmt.Sprintf("%s test schedule is already due; clean this batch before creating another", entry.Kind)
			batch.UpdatedAt = time.Now().UTC()
			_ = saveSchedulerTestBatch(storeRoot, &batch)
			return batch, nil
		}
		input := pkgScheduler.CreateJobInput{
			Name:               entry.Name,
			ScheduleType:       pkgScheduler.ScheduleAt,
			ScheduleExpression: entry.ExpectedScheduledAt.Format(time.RFC3339Nano),
			Timezone:           "UTC",
			MisfirePolicy:      pkgScheduler.MisfireSkip,
			TaskType:           "script",
		}
		if entry.SourceType == string(pkgScheduler.SourceInline) {
			input.SourceType = pkgScheduler.SourceInline
			input.InlineScript = schedulerTestPayloadScript("text")
		} else {
			input.SourceType = pkgScheduler.SourceFile
			input.ScriptPath = entry.ScriptPath
		}
		var created pkgScheduler.Job
		if err := connection.request(ctx, http.MethodPost, "/api/scheduler/jobs", input, &created); err != nil {
			batch.Status = "partial"
			batch.LastError = err.Error()
			batch.UpdatedAt = time.Now().UTC()
			_ = saveSchedulerTestBatch(storeRoot, &batch)
			return batch, nil
		}
		entry.JobID = created.ID
		entry.PersistedScheduled = created.NextRunAt != nil && created.NextRunAt.Equal(entry.ExpectedScheduledAt)
		batch.UpdatedAt = time.Now().UTC()
		if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
	}

	// Re-query the server, rather than trusting create responses, and capture the
	// pre-due invariant while the product default leaves a 15-second safety gap.
	allJobs = nil
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &allJobs); err != nil { return nil, err }
	byID := make(map[string]pkgScheduler.Job, len(allJobs))
	for _, job := range allJobs { byID[job.ID] = job }
	persistedOK := true
	preDueEmpty := true
	checkedAt := time.Now().UTC()
	for index := range batch.Jobs {
		entry := &batch.Jobs[index]
		persisted, exists := byID[entry.JobID]
		entry.PersistedScheduled = exists && persisted.NextRunAt != nil && persisted.NextRunAt.Equal(entry.ExpectedScheduledAt)
		persistedOK = persistedOK && entry.PersistedScheduled
		var runs []pkgScheduler.JobRun
		if err := connection.request(ctx, http.MethodGet, schedulerRunsPath(entry.JobID, 20), nil, &runs); err != nil { return nil, err }
		if !checkedAt.Before(entry.ExpectedScheduledAt) || len(runs) != 0 { preDueEmpty = false }
	}
	batch.PreDueCheckedAt = &checkedAt
	batch.PreDueHistoryEmpty = preDueEmpty
	batch.LastError = ""
	if persistedOK && preDueEmpty {
		batch.Status = "waiting"
	} else {
		batch.Status = "partial"
		if !persistedOK { batch.LastError = "persisted schedule differs from requested schedule" }
		if !preDueEmpty { batch.LastError = strings.TrimSpace(batch.LastError + "; pre-due empty-history check was not established") }
	}
	batch.UpdatedAt = time.Now().UTC()
	if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
	return batch, nil
}

// batchIDPlaceholder only keeps the struct literal visually complete before the
// generated batch id exists; the names are replaced immediately afterward.
func batchIDPlaceholder() string { return "pending" }

func schedulerTestVerify(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler test verify", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	batchID := flags.String("batch", "latest", "batch id or latest")
	wait := flags.Duration("wait", 0, "bounded wait for terminal runs")
	tolerance := flags.Duration("latency-tolerance", schedulerTestDefaultTolerance, "start latency tolerance")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 || *wait < 0 || *tolerance < 0 {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "verify requires non-negative --wait and --latency-tolerance")
	}
	storeRoot, err := schedulerTestStoreRoot()
	if err != nil { return nil, err }
	batch, err := loadSchedulerTestBatch(storeRoot, strings.TrimSpace(*batchID))
	if err != nil { return nil, err }
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil { return nil, err }

	deadline := time.Now().Add(*wait)
	var report schedulerTestVerificationReport
	for {
		report, err = buildSchedulerTestVerification(ctx, connection, batch, *tolerance)
		if err != nil { return nil, err }
		if schedulerTestReportTerminal(report) || *wait == 0 || !time.Now().Before(deadline) { break }
		remaining := time.Until(deadline)
		delay := 250 * time.Millisecond
		if remaining < delay { delay = remaining }
		if delay <= 0 { break }
		select {
		case <-ctx.Done(): return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
	reportRoot := filepath.Join(filepath.Dir(storeRoot), ".runtime", "scheduler-tests", batch.BatchID)
	if err := os.MkdirAll(reportRoot, 0o700); err != nil {
		return nil, schedulerCLIError("SCHEDULER_TEST_REPORT_FAILED", fmt.Sprintf("create Scheduler test report directory: %v", err))
	}
	reportPath := filepath.Join(reportRoot, "report.json")
	if err := writeSchedulerJSONAtomic(reportPath, report, 0o600); err != nil {
		return nil, schedulerCLIError("SCHEDULER_TEST_REPORT_FAILED", err.Error())
	}
	batch.ReportPath = reportPath
	batch.UpdatedAt = time.Now().UTC()
	if report.VerificationStatus == "passed" { batch.Status = "verified" } else if schedulerTestReportTerminal(report) { batch.Status = "verification_failed" }
	if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
	return map[string]any{"batch": batch, "report": report, "reportPath": reportPath}, nil
}

func buildSchedulerTestVerification(ctx context.Context, connection *schedulerCLIConnection, batch schedulerTestBatch, tolerance time.Duration) (schedulerTestVerificationReport, error) {
	now := time.Now().UTC()
	report := schedulerTestVerificationReport{
		SchemaVersion: schedulerTestBatchSchemaVersion,
		BatchID: batch.BatchID,
		CheckedAt: now,
		VerificationStatus: "waiting",
		RunnerState: connection.status.RunnerState,
		LatencyToleranceMs: tolerance.Milliseconds(),
		PreDueHistoryEmpty: batch.PreDueHistoryEmpty,
		DifferentExecutions: false,
		Runs: make([]schedulerTestRunCheck, 0, len(batch.Jobs)),
		NativeVisual: "NOT_RUN",
		PlatformResults: map[string]string{"macos": "NOT_RUN", "windows": "NOT_RUN"},
	}
	if !batch.PreDueHistoryEmpty {
		report.Problems = append(report.Problems, "pre-due empty run history was not established")
	}
	var jobs []pkgScheduler.Job
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &jobs); err != nil { return report, err }
	byID := make(map[string]pkgScheduler.Job, len(jobs))
	for _, job := range jobs { byID[job.ID] = job }
	executionIDs := map[string]bool{}
	allTerminal := true
	allObjectiveChecks := batch.PreDueHistoryEmpty
	for _, expected := range batch.Jobs {
		check := schedulerTestRunCheck{
			Kind: expected.Kind,
			JobID: expected.JobID,
			ExpectedScheduledAt: expected.ExpectedScheduledAt,
			Checks: map[string]bool{},
		}
		persisted, exists := byID[expected.JobID]
		if exists {
			check.PersistedScheduled = (persisted.NextRunAt != nil && persisted.NextRunAt.Equal(expected.ExpectedScheduledAt)) ||
				(persisted.NextRunAt == nil && persisted.ScheduleType == pkgScheduler.ScheduleAt && persisted.ScheduleExpression == expected.ExpectedScheduledAt.Format(time.RFC3339Nano))
		} else {
			check.PersistedScheduled = expected.PersistedScheduled
		}
		check.Checks["persistedScheduleMatches"] = check.PersistedScheduled
		var runs []pkgScheduler.JobRun
		if expected.JobID == "" {
			check.Problems = append(check.Problems, "job was not created")
			allTerminal = false
			allObjectiveChecks = false
			report.Runs = append(report.Runs, check)
			continue
		}
		if err := connection.request(ctx, http.MethodGet, schedulerRunsPath(expected.JobID, 20), nil, &runs); err != nil { return report, err }
		check.RunCount = len(runs)
		check.Checks["ranAtMostOnce"] = len(runs) <= 1
		if len(runs) == 0 {
			if !now.Before(expected.ExpectedScheduledAt) {
				check.Problems = append(check.Problems, "no run exists after the planned time")
			}
			allTerminal = false
			allObjectiveChecks = allObjectiveChecks && check.PersistedScheduled && len(runs) <= 1
			report.Runs = append(report.Runs, check)
			continue
		}
		run := runs[0]
		check.Run = &run
		check.Checks["scheduledAtMatches"] = run.ScheduledAt.Equal(expected.ExpectedScheduledAt)
		check.Checks["triggerIsScheduled"] = run.TriggerType == pkgScheduler.TriggerScheduled
		check.Checks["startedNotEarly"] = run.StartedAt != nil && !run.StartedAt.Before(expected.ExpectedScheduledAt)
		check.Checks["executionIdPresent"] = strings.TrimSpace(run.ExecutionID) != ""
		terminal := schedulerRunTerminal(run.Status)
		check.Checks["terminal"] = terminal
		check.Checks["succeeded"] = run.Status == pkgScheduler.RunSucceeded
		if run.StartedAt != nil {
			latency := run.StartedAt.Sub(expected.ExpectedScheduledAt).Milliseconds()
			check.StartLatencyMs = &latency
			check.Checks["latencyWithinTolerance"] = latency >= 0 && latency <= tolerance.Milliseconds()
		} else {
			check.Checks["latencyWithinTolerance"] = false
		}
		if exists && terminal {
			check.Checks["noNextSchedule"] = persisted.NextRunAt == nil && !persisted.Enabled
		} else {
			check.Checks["noNextSchedule"] = !terminal
		}
		if run.ExecutionID != "" { executionIDs[run.ExecutionID] = true }
		if terminal && run.ExecutionID != "" {
			artifactPath := filepath.Join(connection.status.ArtifactRoot, run.ExecutionID, schedulerTestEvidenceFile)
			stdoutPath := filepath.Join(connection.status.ArtifactRoot, run.ExecutionID, "stdout.log")
			check.ArtifactPath = artifactPath
			check.StdoutPath = stdoutPath
			var payload map[string]any
			if err := readSchedulerJSONFile(artifactPath, &payload); err == nil {
				check.PayloadEvidence = payload
				check.Checks["artifactExecutionMatches"] = stringMapValue(payload, "executionId") == run.ExecutionID
				check.Checks["artifactKindMatches"] = stringMapValue(payload, "kind") == expected.Kind
				toast, _ := payload["toastInvocation"].(map[string]any)
				check.Checks["toastInvocationReturned"] = boolMapValue(toast, "returned") && boolMapValue(toast, "closed")
			} else {
				check.Problems = append(check.Problems, "execution evidence file is unavailable: "+err.Error())
			}
			if stdout, err := os.ReadFile(stdoutPath); err == nil {
				text := string(stdout)
				check.Checks["stdoutAssociated"] = strings.Contains(text, "[SCHEDULER_TEST]") && strings.Contains(text, "kind="+expected.Kind) && strings.Contains(text, run.ExecutionID)
			} else {
				check.Problems = append(check.Problems, "execution stdout is unavailable: "+err.Error())
			}
		}
		for name, passed := range check.Checks {
			if !passed && !(name == "noNextSchedule" && !terminal) {
				check.Problems = append(check.Problems, name+"=false")
			}
		}
		if len(runs) > 1 { check.Problems = append(check.Problems, fmt.Sprintf("one-time job produced %d runs", len(runs))) }
		if !terminal { allTerminal = false }
		if terminal && len(check.Problems) > 0 { allObjectiveChecks = false }
		if !check.PersistedScheduled || len(runs) > 1 { allObjectiveChecks = false }
		report.Runs = append(report.Runs, check)
	}
	if allTerminal && len(batch.Jobs) == 2 {
		report.DifferentExecutions = len(executionIDs) == 2
		if !report.DifferentExecutions {
			report.Problems = append(report.Problems, "the two scheduled runs do not have distinct Execution IDs")
			allObjectiveChecks = false
		}
	}
	for _, check := range report.Runs {
		for _, problem := range check.Problems {
			report.Problems = append(report.Problems, check.Kind+": "+problem)
		}
	}
	if allTerminal {
		if allObjectiveChecks && report.DifferentExecutions {
			report.VerificationStatus = "passed"
		} else {
			report.VerificationStatus = "failed"
		}
	}
	return report, nil
}

func schedulerTestRemove(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler test remove", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	batchID := flags.String("batch", "latest", "batch id or latest")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 { return nil, schedulerCLIError("SCHEDULER_USAGE", "remove accepts only --batch") }
	storeRoot, err := schedulerTestStoreRoot()
	if err != nil { return nil, err }
	lockCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	lease, err := processlock.Acquire(lockCtx, filepath.Join(storeRoot, ".batch.lock"), 25*time.Millisecond)
	if err != nil { return nil, schedulerCLIError("SCHEDULER_TEST_BUSY", err.Error()) }
	defer lease.Close()
	batch, err := loadSchedulerTestBatch(storeRoot, strings.TrimSpace(*batchID))
	if err != nil { return nil, err }
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil { return nil, err }
	result := schedulerTestRemovalResult{BatchID: batch.BatchID, ReportPath: batch.ReportPath}
	var jobs []pkgScheduler.Job
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &jobs); err != nil { return nil, err }
	present := map[string]bool{}
	for _, job := range jobs { present[job.ID] = true }
	for _, expected := range batch.Jobs {
		if expected.JobID == "" { continue }
		if !present[expected.JobID] {
			result.AlreadyMissing = append(result.AlreadyMissing, expected.JobID)
			continue
		}
		var runs []pkgScheduler.JobRun
		if err := connection.request(ctx, http.MethodGet, schedulerRunsPath(expected.JobID, 20), nil, &runs); err != nil { return nil, err }
		for _, run := range runs {
			if run.Status == pkgScheduler.RunRunning {
				result.RunningAtRemoval = append(result.RunningAtRemoval, expected.JobID)
				break
			}
		}
		var ignored map[string]any
		if err := connection.request(ctx, http.MethodDelete, "/api/scheduler/jobs/"+urlPathEscape(expected.JobID), nil, &ignored); err != nil { return nil, err }
		result.DeletedJobIDs = append(result.DeletedJobIDs, expected.JobID)
	}
	jobs = nil
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &jobs); err != nil { return nil, err }
	remaining := map[string]bool{}
	for _, job := range jobs { remaining[job.ID] = true }
	result.FutureSchedulesRemoved = true
	for _, expected := range batch.Jobs {
		if expected.JobID != "" && remaining[expected.JobID] { result.FutureSchedulesRemoved = false }
	}
	now := time.Now().UTC()
	batch.RemovedAt = &now
	batch.UpdatedAt = now
	batch.Status = "removed"
	if len(result.RunningAtRemoval) > 0 {
		batch.LastError = "one or more executions were already running; cleanup removed future scheduling but did not stop those executions"
	} else {
		batch.LastError = ""
	}
	if err := saveSchedulerTestBatch(storeRoot, &batch); err != nil { return nil, err }
	return result, nil
}

func schedulerTestStoreRoot() (string, error) {
	root, err := appdata.Resolve(appdata.DesktopPackageID, nil)
	if err != nil { return "", schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", err.Error()) }
	path := filepath.Join(root, "scheduler-test-batches")
	if err := os.MkdirAll(path, 0o700); err != nil {
		return "", schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", err.Error())
	}
	return path, nil
}

func schedulerTestBatchPath(root, batchID string) string {
	return filepath.Join(root, batchID+".json")
}

func saveSchedulerTestBatch(root string, batch *schedulerTestBatch) error {
	if batch == nil || !validSchedulerTestID(batch.BatchID, "batch") {
		return schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", "invalid Scheduler test batch id")
	}
	batch.UpdatedAt = time.Now().UTC()
	if err := writeSchedulerJSONAtomic(schedulerTestBatchPath(root, batch.BatchID), batch, 0o600); err != nil {
		return schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", err.Error())
	}
	return nil
}

func saveCurrentSchedulerTestBatch(root, batchID string) error {
	if !validSchedulerTestID(batchID, "batch") { return schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", "invalid current batch id") }
	return writeSchedulerJSONAtomic(filepath.Join(root, "current.json"), map[string]any{"schemaVersion": 1, "batchId": batchID}, 0o600)
}

func loadSchedulerTestBatch(root, requested string) (schedulerTestBatch, error) {
	batchID := strings.TrimSpace(requested)
	if batchID == "" || batchID == "latest" {
		var pointer struct { BatchID string `json:"batchId"` }
		if err := readSchedulerJSONFile(filepath.Join(root, "current.json"), &pointer); err != nil {
			return schedulerTestBatch{}, schedulerCLIError("SCHEDULER_TEST_NOT_FOUND", "no current Scheduler test batch is available")
		}
		batchID = pointer.BatchID
	}
	if !validSchedulerTestID(batchID, "batch") {
		return schedulerTestBatch{}, schedulerCLIError("SCHEDULER_TEST_NOT_FOUND", "invalid Scheduler test batch id")
	}
	var batch schedulerTestBatch
	if err := readSchedulerJSONFile(schedulerTestBatchPath(root, batchID), &batch); err != nil {
		return schedulerTestBatch{}, schedulerCLIError("SCHEDULER_TEST_NOT_FOUND", fmt.Sprintf("load Scheduler test batch: %v", err))
	}
	if batch.SchemaVersion != schedulerTestBatchSchemaVersion || batch.BatchID != batchID {
		return schedulerTestBatch{}, schedulerCLIError("SCHEDULER_TEST_CORRUPT", "Scheduler test batch has an unsupported schema or mismatched id")
	}
	return batch, nil
}

func findSchedulerTestBatchByRequest(root, requestID string) (schedulerTestBatch, bool, error) {
	entries, err := os.ReadDir(root)
	if err != nil { return schedulerTestBatch{}, false, schedulerCLIError("SCHEDULER_TEST_STORAGE_FAILED", err.Error()) }
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "batch-") || !strings.HasSuffix(entry.Name(), ".json") { continue }
		var batch schedulerTestBatch
		if readSchedulerJSONFile(filepath.Join(root, entry.Name()), &batch) != nil { continue }
		if batch.SchemaVersion == schedulerTestBatchSchemaVersion && batch.RequestID == requestID {
			return batch, true, nil
		}
	}
	return schedulerTestBatch{}, false, nil
}

func prepareSchedulerTestPayloadFile(scriptRoot string) (string, error) {
	root, err := filepath.Abs(strings.TrimSpace(scriptRoot))
	if err != nil || root == "" { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", "Scheduler script root is unavailable") }
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", "Scheduler script root is not a real directory")
	}
	dir := filepath.Join(root, ".opendesk-scheduler-tests")
	if info, err := os.Lstat(dir); err == nil {
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", "reserved Scheduler test directory is not a real directory") }
	} else if errors.Is(err, os.ErrNotExist) {
		if err := os.Mkdir(dir, 0o700); err != nil { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", err.Error()) }
	} else { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", err.Error()) }
	path := filepath.Join(dir, "file-reminder-v1.js")
	content := []byte(schedulerTestPayloadScript("file"))
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", "reserved Scheduler test payload is not a regular file") }
		existing, readErr := os.ReadFile(path)
		if readErr != nil { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", readErr.Error()) }
		if string(existing) != string(content) { return "", schedulerCLIError("SCHEDULER_TEST_FILE_CONFLICT", "reserved Scheduler test payload already exists with different content; OpenDesk will not overwrite it") }
	} else if errors.Is(err, os.ErrNotExist) {
		file, createErr := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if createErr != nil { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", createErr.Error()) }
		_, writeErr := file.Write(content)
		closeErr := file.Close()
		if writeErr != nil || closeErr != nil { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", errors.Join(writeErr, closeErr).Error()) }
	} else { return "", schedulerCLIError("SCHEDULER_TEST_FILE_FAILED", err.Error()) }
	return filepath.ToSlash(filepath.Join(".opendesk-scheduler-tests", "file-reminder-v1.js")), nil
}

func schedulerTestPayloadScript(kind string) string {
	label := "文件"
	if kind == "text" { label = "文本" }
	return fmt.Sprintf(`'use strict';
const kind = %q;
const firedAt = new Date().toISOString();
console.log('[SCHEDULER_TEST] stage=start kind=' + kind + ' executionId=' + Execution.executionId + ' firedAt=' + firedAt);
const toastInvocation = {called: false, returned: false, closed: false, error: ''};
let toastError = null;
try {
  toastInvocation.called = true;
  const notice = await ui.toast({
    message: 'OpenDesk 计划调度测试 · %s提醒 · ' + firedAt,
    caption: 'Execution …' + Execution.executionId.slice(-12),
    level: 'success',
    timeoutMs: 2500,
    closable: true,
  });
  toastInvocation.returned = true;
  await notice.waitUntilClosed();
  toastInvocation.closed = true;
} catch (error) {
  toastError = error;
  toastInvocation.error = String(error && error.message || error);
}
const evidence = {
  schemaVersion: 1,
  kind,
  executionId: Execution.executionId,
  source: Execution.source,
  firedAt,
  completedAt: new Date().toISOString(),
  toastInvocation,
  nativeVisualConfirmed: false,
};
const evidencePath = File.join(Execution.artifactDir, 'scheduler-test-result.json');
await File.writeJSON(evidencePath, evidence, {spaces: 2});
console.log('[SCHEDULER_TEST] stage=complete kind=' + kind + ' executionId=' + Execution.executionId + ' evidence=' + evidencePath);
if (toastError) throw toastError;
return evidence;
`, kind, label)
}

func recoverSchedulerTestJob(jobs []pkgScheduler.Job, expected schedulerTestBatchJob) *pkgScheduler.Job {
	for index := range jobs {
		job := &jobs[index]
		if job.Name != expected.Name || job.ScheduleType != pkgScheduler.ScheduleAt || job.SourceType != pkgScheduler.SourceType(expected.SourceType) { continue }
		if job.ScheduleExpression != expected.ExpectedScheduledAt.Format(time.RFC3339Nano) { continue }
		if expected.SourceType == string(pkgScheduler.SourceFile) && job.ScriptPath != expected.ScriptPath { continue }
		return job
	}
	return nil
}

func schedulerRunsPath(jobID string, limit int) string {
	return "/api/scheduler/jobs/" + urlPathEscape(jobID) + "/runs?limit=" + fmt.Sprintf("%d", limit)
}

func urlPathEscape(value string) string {
	// Scheduler IDs are generated from a strict prefix/hex alphabet. Keep a
	// defensive escape here without importing URL handling into call sites.
	replacer := strings.NewReplacer("%", "%25", "/", "%2F", "?", "%3F", "#", "%23")
	return replacer.Replace(value)
}

func schedulerRunTerminal(status pkgScheduler.RunStatus) bool {
	switch status {
	case pkgScheduler.RunSucceeded, pkgScheduler.RunFailed, pkgScheduler.RunCanceled, pkgScheduler.RunSkipped:
		return true
	default:
		return false
	}
}

func schedulerTestReportTerminal(report schedulerTestVerificationReport) bool {
	if len(report.Runs) != 2 { return false }
	for _, run := range report.Runs {
		if run.Run == nil || !schedulerRunTerminal(run.Run.Status) { return false }
	}
	return true
}

func stringMapValue(values map[string]any, key string) string {
	if values == nil { return "" }
	value, _ := values[key].(string)
	return value
}

func boolMapValue(values map[string]any, key string) bool {
	if values == nil { return false }
	value, _ := values[key].(bool)
	return value
}

func writeSchedulerJSONAtomic(path string, value any, mode os.FileMode) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil { return err }
	data = append(data, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil { return err }
	temp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*.json")
	if err != nil { return err }
	tempPath := temp.Name()
	cleanup := true
	defer func() { if cleanup { _ = os.Remove(tempPath) } }()
	if err := temp.Chmod(mode); err != nil { _ = temp.Close(); return err }
	if _, err := temp.Write(data); err != nil { _ = temp.Close(); return err }
	if err := temp.Sync(); err != nil { _ = temp.Close(); return err }
	if err := temp.Close(); err != nil { return err }
	if err := os.Rename(tempPath, path); err != nil { return err }
	cleanup = false
	return nil
}

func readSchedulerJSONFile(path string, value any) error {
	info, err := os.Lstat(path)
	if err != nil { return err }
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() > 4<<20 { return fmt.Errorf("not a safe Scheduler JSON file") }
	data, err := os.ReadFile(path)
	if err != nil { return err }
	return json.Unmarshal(data, value)
}

func newSchedulerTestID(prefix string) string {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err == nil { return prefix + "-" + hex.EncodeToString(raw[:]) }
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

func validSchedulerTestID(value, prefix string) bool {
	value = strings.TrimSpace(value)
	if !strings.HasPrefix(value, prefix+"-") || len(value) > 80 { return false }
	for _, ch := range value[len(prefix)+1:] {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') { return false }
	}
	return true
}

func shortBatchID(value string) string {
	value = strings.TrimPrefix(value, "batch-")
	if len(value) > 8 { return value[:8] }
	return value
}

// stableSchedulerTestJobs is used by contract tests and keeps report order
// deterministic even if a caller reconstructs a batch from persisted state.
func stableSchedulerTestJobs(values []schedulerTestBatchJob) []schedulerTestBatchJob {
	result := append([]schedulerTestBatchJob(nil), values...)
	sort.SliceStable(result, func(i, j int) bool { return result[i].ExpectedScheduledAt.Before(result[j].ExpectedScheduledAt) })
	return result
}
