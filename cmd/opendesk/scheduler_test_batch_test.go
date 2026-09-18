package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	pkgScheduler "opendesk/pkg/scheduler"
)

type schedulerBatchBridgeFixture struct {
	t        *testing.T
	token    string
	mu       sync.Mutex
	jobs     map[string]pkgScheduler.Job
	runs     map[string][]pkgScheduler.JobRun
	created  int
	sequence int
	server   *httptest.Server
}

func newSchedulerBatchBridgeFixture(t *testing.T, scriptRoot, artifactRoot string) *schedulerBatchBridgeFixture {
	t.Helper()
	fixture := &schedulerBatchBridgeFixture{
		t:     t,
		token: strings.Repeat("a", 64),
		jobs:  make(map[string]pkgScheduler.Job),
		runs:  make(map[string][]pkgScheduler.JobRun),
	}
	fixture.server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-OpenDesk-App-Token") != fixture.token {
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/api/scheduler/status":
			fixture.write(writer, schedulerCLIStatus{
				Available: true, RunnerState: "active", ScriptRoot: scriptRoot, ArtifactRoot: artifactRoot,
				LocalEndpoint: fixture.server.URL,
			})
			return
		case "/api/scheduler/jobs":
			switch request.Method {
			case http.MethodGet:
				fixture.mu.Lock()
				jobs := fixture.listLocked()
				fixture.mu.Unlock()
				fixture.write(writer, jobs)
				return
			case http.MethodPost:
				var input pkgScheduler.CreateJobInput
				if err := json.NewDecoder(request.Body).Decode(&input); err != nil {
					writer.WriteHeader(http.StatusBadRequest)
					return
				}
				fixture.mu.Lock()
				job := fixture.createLocked(input)
				fixture.created++
				fixture.mu.Unlock()
				fixture.write(writer, job)
				return
			}
		}

		prefix := "/api/scheduler/jobs/"
		if !strings.HasPrefix(request.URL.Path, prefix) {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		parts := strings.Split(strings.TrimPrefix(request.URL.Path, prefix), "/")
		if len(parts) == 0 || parts[0] == "" {
			writer.WriteHeader(http.StatusNotFound)
			return
		}
		jobID, err := url.PathUnescape(parts[0])
		if err != nil {
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		if len(parts) == 2 && parts[1] == "runs" && request.Method == http.MethodGet {
			fixture.mu.Lock()
			runs := append([]pkgScheduler.JobRun(nil), fixture.runs[jobID]...)
			fixture.mu.Unlock()
			fixture.write(writer, runs)
			return
		}
		if len(parts) == 1 && request.Method == http.MethodDelete {
			fixture.mu.Lock()
			delete(fixture.jobs, jobID)
			fixture.mu.Unlock()
			fixture.write(writer, map[string]any{"id": jobID, "deleted": true})
			return
		}
		writer.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(fixture.server.Close)
	return fixture
}

func (fixture *schedulerBatchBridgeFixture) write(writer http.ResponseWriter, value any) {
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(schedulerCLIEnvelope{Code: 0, Message: "success", Data: mustMarshalJSON(fixture.t, value)}); err != nil {
		fixture.t.Errorf("write bridge response: %v", err)
	}
}

func mustMarshalJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal bridge response: %v", err)
	}
	return data
}

func (fixture *schedulerBatchBridgeFixture) listLocked() []pkgScheduler.Job {
	jobs := make([]pkgScheduler.Job, 0, len(fixture.jobs))
	for _, job := range fixture.jobs {
		jobs = append(jobs, job)
	}
	sort.Slice(jobs, func(left, right int) bool { return jobs[left].ID < jobs[right].ID })
	return jobs
}

func (fixture *schedulerBatchBridgeFixture) createLocked(input pkgScheduler.CreateJobInput) pkgScheduler.Job {
	fixture.sequence++
	at, err := time.Parse(time.RFC3339Nano, input.ScheduleExpression)
	if err != nil {
		fixture.t.Fatalf("parse fixture scheduled time: %v", err)
	}
	now := time.Now().UTC()
	job := pkgScheduler.Job{
		ID:                 "job-fixture-" + strconvItoa(fixture.sequence),
		Name:               input.Name,
		ScheduleType:       input.ScheduleType,
		ScheduleExpression: input.ScheduleExpression,
		Timezone:           input.Timezone,
		MisfirePolicy:      input.MisfirePolicy,
		TaskType:           input.TaskType,
		SourceType:         input.SourceType,
		ScriptPath:         input.ScriptPath,
		Enabled:            true,
		NextRunAt:          &at,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	fixture.jobs[job.ID] = job
	return job
}

func (fixture *schedulerBatchBridgeFixture) add(job pkgScheduler.Job) {
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	fixture.jobs[job.ID] = job
}

func (fixture *schedulerBatchBridgeFixture) has(jobID string) bool {
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	_, found := fixture.jobs[jobID]
	return found
}

func (fixture *schedulerBatchBridgeFixture) createCount() int {
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	return fixture.created
}

// strconvItoa is intentionally tiny so this fixture does not take a production
// dependency just to create readable fake server IDs.
func strconvItoa(value int) string {
	if value == 0 {
		return "0"
	}
	buffer := [20]byte{}
	index := len(buffer)
	for value > 0 {
		index--
		buffer[index] = byte('0' + value%10)
		value /= 10
	}
	return string(buffer[index:])
}

func writeSchedulerBatchBridge(t *testing.T, root string, fixture *schedulerBatchBridgeFixture) {
	t.Helper()
	bridgeRoot := filepath.Join(root, ".runtime", "scheduler-bridges")
	bridge := schedulerCLIBridge{
		SchemaVersion: schedulerCLIBridgeSchemaVersion,
		PackageID:     "com.opendesk.desktop",
		ExecutionID:   "scheduler-test-owner",
		Endpoint:      fixture.server.URL,
		Token:         fixture.token,
		PublishedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := writeSchedulerJSONAtomic(filepath.Join(bridgeRoot, "owner.json"), bridge, 0o600); err != nil {
		t.Fatalf("write discovery bridge: %v", err)
	}
}

func TestSchedulerTestBatchRetryRecoversPartialCreateAndRemovesOnlySavedJobIDs(t *testing.T) {
	root := t.TempDir()
	t.Setenv("OPENDESK_APP_DATA_DIR", root)
	scriptRoot := filepath.Join(root, "scripts")
	artifactRoot := filepath.Join(root, "artifacts")
	if err := os.MkdirAll(scriptRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	fixture := newSchedulerBatchBridgeFixture(t, scriptRoot, artifactRoot)
	writeSchedulerBatchBridge(t, root, fixture)

	ctx := context.Background()
	firstRaw, err := schedulerTestAdd(ctx, []string{"--request-id", "request-a1", "--first-delay", "30s", "--second-delay", "90s"})
	if err != nil {
		t.Fatalf("first add: %v", err)
	}
	first, ok := firstRaw.(schedulerTestBatch)
	if !ok || first.Status != "waiting" || len(first.Jobs) != 2 {
		t.Fatalf("first batch = %#v", firstRaw)
	}
	if fixture.createCount() != 2 || first.Jobs[0].JobID == "" || first.Jobs[1].JobID == "" {
		t.Fatalf("first add did not create exactly two persisted jobs: %#v", first)
	}

	retryRaw, err := schedulerTestAdd(ctx, []string{"--request-id", "request-a1", "--first-delay", "30s", "--second-delay", "90s"})
	if err != nil {
		t.Fatalf("retry add: %v", err)
	}
	retry := retryRaw.(schedulerTestBatch)
	if retry.BatchID != first.BatchID || retry.Jobs[0].JobID != first.Jobs[0].JobID || retry.Jobs[1].JobID != first.Jobs[1].JobID {
		t.Fatalf("request retry changed batch identity: first=%#v retry=%#v", first, retry)
	}
	if fixture.createCount() != 2 {
		t.Fatalf("retry created duplicate Scheduler jobs: creates=%d", fixture.createCount())
	}

	userJob := pkgScheduler.Job{ID: "job-user-same-name", Name: first.Jobs[0].Name, Enabled: true}
	fixture.add(userJob)
	removedRaw, err := schedulerTestRemove(ctx, []string{"--batch", first.BatchID})
	if err != nil {
		t.Fatalf("remove batch: %v", err)
	}
	removed := removedRaw.(schedulerTestRemovalResult)
	if !removed.FutureSchedulesRemoved || len(removed.DeletedJobIDs) != 2 {
		t.Fatalf("batch removal = %#v", removed)
	}
	if fixture.has(first.Jobs[0].JobID) || fixture.has(first.Jobs[1].JobID) || !fixture.has(userJob.ID) {
		t.Fatalf("batch removal did not use exact saved job IDs")
	}

	storeRoot, err := schedulerTestStoreRoot()
	if err != nil {
		t.Fatal(err)
	}
	partialAt := time.Now().UTC().Add(5 * time.Minute).Round(0)
	partial := schedulerTestBatch{
		SchemaVersion: schedulerTestBatchSchemaVersion,
		BatchID:       "batch-b2",
		RequestID:     "request-b2",
		Status:        "creating",
		Jobs: []schedulerTestBatchJob{
			{Kind: "text", Name: "OpenDesk 调度测试 · 文本 · b2", SourceType: string(pkgScheduler.SourceInline), ExpectedScheduledAt: partialAt},
			{Kind: "file", Name: "OpenDesk 调度测试 · 文件 · b2", SourceType: string(pkgScheduler.SourceFile), ExpectedScheduledAt: partialAt.Add(time.Minute)},
		},
	}
	if err := saveSchedulerTestBatch(storeRoot, &partial); err != nil {
		t.Fatal(err)
	}
	fixture.add(pkgScheduler.Job{
		ID: "job-recovered", Name: partial.Jobs[0].Name, ScheduleType: pkgScheduler.ScheduleAt,
		ScheduleExpression: partial.Jobs[0].ExpectedScheduledAt.Format(time.RFC3339Nano), SourceType: pkgScheduler.SourceInline,
		Enabled: true, NextRunAt: &partialAt,
	})
	createsBeforeRecovery := fixture.createCount()
	recoveredRaw, err := schedulerTestAdd(ctx, []string{"--request-id", partial.RequestID, "--first-delay", "30s", "--second-delay", "90s"})
	if err != nil {
		t.Fatalf("recover partial batch: %v", err)
	}
	recovered := recoveredRaw.(schedulerTestBatch)
	if recovered.Jobs[0].JobID != "job-recovered" || recovered.Jobs[1].JobID == "" {
		t.Fatalf("partial recovery did not preserve server-created job: %#v", recovered)
	}
	if fixture.createCount() != createsBeforeRecovery+1 {
		t.Fatalf("partial recovery must create only the missing job: before=%d after=%d", createsBeforeRecovery, fixture.createCount())
	}
}
