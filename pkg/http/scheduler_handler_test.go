package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/pkg/container"
	pkgExecution "opendesk/pkg/execution"
	pkgScheduler "opendesk/pkg/scheduler"
)

type schedulerHTTPExecutor struct{}

func (schedulerHTTPExecutor) Execute(_ context.Context, job pkgScheduler.Job) (pkgExecution.ExecutionResult, error) {
	return pkgExecution.ExecutionResult{
		ExecutionID: "http-test-" + job.ID,
		Status:      pkgExecution.ExecutionStatusSucceeded,
	}, nil
}

type schedulerEnvelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func TestSchedulerHTTPAPIAndEmbeddedUI(t *testing.T) {
	server, service, store, appContainer, root := newSchedulerHTTPTestServer(t)
	defer closeSchedulerHTTPTest(t, service, store, appContainer)
	defer server.Close()

	response, err := stdhttp.Get(server.URL + "/scheduler")
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusOK {
		t.Fatalf("scheduler page status=%d", response.StatusCode)
	}
	pageText := string(page)
	for _, marker := range []string{"OpenDesk Scheduler", "create-form", "source-type", "inline-script", "jobs-body", "runs-list"} {
		if !strings.Contains(pageText, marker) {
			t.Fatalf("scheduler page missing %q", marker)
		}
	}
	if strings.Contains(pageText, "<script src=") || strings.Contains(pageText, "react") || strings.Contains(pageText, "vue") {
		t.Fatal("scheduler page unexpectedly depends on a frontend runtime")
	}

	createBody := map[string]any{
		"name":               "HTTP smoke",
		"scriptPath":         filepath.Base(filepath.Join(root, "safe.js")),
		"scheduleType":       "at",
		"scheduleExpression": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		"timezone":           "UTC",
		"misfirePolicy":      "run_once",
		"taskType":           "script",
	}
	var created pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs", createBody, &created)
	if created.ID == "" || created.Name != "HTTP smoke" {
		t.Fatalf("unexpected created job: %#v", created)
	}

	var jobs []pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodGet, "/api/scheduler/jobs", nil, &jobs)
	if len(jobs) != 1 || jobs[0].ID != created.ID {
		t.Fatalf("unexpected jobs: %#v", jobs)
	}

	var paused pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/pause", nil, &paused)
	if paused.Enabled {
		t.Fatal("pause did not disable job")
	}
	var resumed pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/resume", nil, &resumed)
	if !resumed.Enabled {
		t.Fatal("resume did not enable job")
	}

	var queued pkgScheduler.JobRun
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/run", nil, &queued)
	if queued.ID == "" || queued.Status != pkgScheduler.RunQueued {
		t.Fatalf("unexpected run-now response: %#v", queued)
	}
	var runs []pkgScheduler.JobRun
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		schedulerRequest(t, server.URL, stdhttp.MethodGet, "/api/scheduler/jobs/"+created.ID+"/runs", nil, &runs)
		if len(runs) == 1 && runs[0].Status == pkgScheduler.RunSucceeded {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(runs) != 1 || runs[0].Status != pkgScheduler.RunSucceeded || runs[0].ExecutionID == "" {
		t.Fatalf("run-now did not finish: %#v", runs)
	}

	var deleted map[string]any
	schedulerRequest(t, server.URL, stdhttp.MethodDelete, "/api/scheduler/jobs/"+created.ID, nil, &deleted)
	if deleted["deleted"] != true {
		t.Fatalf("unexpected delete response: %#v", deleted)
	}
	schedulerRequest(t, server.URL, stdhttp.MethodGet, "/api/scheduler/jobs", nil, &jobs)
	if len(jobs) != 0 {
		t.Fatalf("deleted job remains listed: %#v", jobs)
	}
}

func TestSchedulerHTTPInlineLifecycleDoesNotLeakSource(t *testing.T) {
	server, service, store, appContainer, _ := newSchedulerHTTPTestServer(t)
	defer closeSchedulerHTTPTest(t, service, store, appContainer)
	defer server.Close()
	secret := "INLINE_PRIVATE_TOKEN_83f42b"
	createBody := map[string]any{
		"name":               "inline HTTP smoke",
		"sourceType":         "inline",
		"inlineScript":       "const secret = '" + secret + "'; return {ok:true};",
		"scheduleType":       "at",
		"scheduleExpression": time.Now().Add(time.Hour).UTC().Format(time.RFC3339),
		"timezone":           "UTC",
		"misfirePolicy":      "run_once",
		"taskType":           "script",
	}
	var created pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs", createBody, &created)
	if created.SourceType != pkgScheduler.SourceInline || !created.HasInlineScript || created.ScriptPath != "" || created.InlineScript != "" {
		t.Fatalf("unexpected public inline job: %#v", created)
	}

	response, err := stdhttp.Get(server.URL + "/api/scheduler/jobs")
	if err != nil {
		t.Fatal(err)
	}
	listedBody, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusOK {
		t.Fatalf("list status=%d body=%s", response.StatusCode, listedBody)
	}
	if bytes.Contains(listedBody, []byte(secret)) || bytes.Contains(listedBody, []byte("inlineScript")) {
		t.Fatalf("job list leaked inline source: %s", listedBody)
	}
	persisted, err := store.GetJob(context.Background(), created.ID)
	if err != nil || !strings.Contains(persisted.InlineScript, secret) {
		t.Fatalf("inline source was not persisted: err=%v job=%#v", err, persisted)
	}

	var paused pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/pause", nil, &paused)
	if paused.Enabled {
		t.Fatal("inline pause did not disable job")
	}
	var resumed pkgScheduler.Job
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/resume", nil, &resumed)
	if !resumed.Enabled {
		t.Fatal("inline resume did not enable job")
	}
	var queued pkgScheduler.JobRun
	schedulerRequest(t, server.URL, stdhttp.MethodPost, "/api/scheduler/jobs/"+created.ID+"/run", nil, &queued)
	var runs []pkgScheduler.JobRun
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		schedulerRequest(t, server.URL, stdhttp.MethodGet, "/api/scheduler/jobs/"+created.ID+"/runs", nil, &runs)
		if len(runs) == 1 && runs[0].Status == pkgScheduler.RunSucceeded {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if len(runs) != 1 || runs[0].ExecutionID == "" || runs[0].Status != pkgScheduler.RunSucceeded {
		t.Fatalf("inline run did not finish: %#v", runs)
	}
	var deleted map[string]any
	schedulerRequest(t, server.URL, stdhttp.MethodDelete, "/api/scheduler/jobs/"+created.ID, nil, &deleted)
	if deleted["deleted"] != true {
		t.Fatalf("inline delete response: %#v", deleted)
	}
}

func TestSchedulerHTTPRejectsOversizedAndUnknownBodiesWithoutSourceLeak(t *testing.T) {
	server, service, store, appContainer, _ := newSchedulerHTTPTestServer(t)
	defer closeSchedulerHTTPTest(t, service, store, appContainer)
	defer server.Close()

	oversized := bytes.Repeat([]byte("x"), schedulerRequestBodyLimit+1)
	response, err := stdhttp.Post(server.URL+"/api/scheduler/jobs", "application/json", bytes.NewReader(oversized))
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusBadRequest || !bytes.Contains(body, []byte("request body exceeds")) {
		t.Fatalf("oversized body status=%d body=%s", response.StatusCode, body)
	}

	secret := "SHOULD_NOT_APPEAR_IN_ERROR_f08e"
	invalid := map[string]any{
		"name": "invalid", "sourceType": "inline", "scriptPath": "safe.js",
		"inlineScript": secret, "scheduleType": "at",
		"scheduleExpression": time.Now().Add(time.Hour).UTC().Format(time.RFC3339), "timezone": "UTC",
	}
	encoded, _ := json.Marshal(invalid)
	response, err = stdhttp.Post(server.URL+"/api/scheduler/jobs", "application/json", bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusBadRequest || bytes.Contains(body, []byte(secret)) {
		t.Fatalf("invalid source response status=%d leaked body=%s", response.StatusCode, body)
	}

	unknown := strings.NewReader(`{"name":"unknown","unexpected":true}`)
	response, err = stdhttp.Post(server.URL+"/api/scheduler/jobs", "application/json", unknown)
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusBadRequest || !bytes.Contains(body, []byte("unknown field")) {
		t.Fatalf("unknown field status=%d body=%s", response.StatusCode, body)
	}
}

func TestSchedulerRoutesRejectRemoteHostAndCrossOrigin(t *testing.T) {
	server, service, store, appContainer, _ := newSchedulerHTTPTestServer(t)
	defer closeSchedulerHTTPTest(t, service, store, appContainer)
	defer server.Close()
	mux := SetupRoutesWithScheduler(appContainer, service)

	tests := []struct {
		name       string
		remoteAddr string
		host       string
		origin     string
	}{
		{name: "remote client", remoteAddr: "203.0.113.10:1234", host: "127.0.0.1:60844"},
		{name: "dns rebinding host", remoteAddr: "127.0.0.1:1234", host: "attacker.example"},
		{name: "cross origin", remoteAddr: "127.0.0.1:1234", host: "127.0.0.1:60844", origin: "https://attacker.example"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(stdhttp.MethodGet, "http://"+test.host+"/api/scheduler/jobs", nil)
			request.RemoteAddr = test.remoteAddr
			request.Host = test.host
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, request)
			if response.Code != stdhttp.StatusForbidden {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
			if response.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("scheduler response unexpectedly enables CORS")
			}
		})
	}
}

func newSchedulerHTTPTestServer(t *testing.T) (*httptest.Server, *pkgScheduler.Service, *pkgScheduler.Store, *container.Container, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "safe.js"), []byte("console.log('safe')"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := pkgScheduler.OpenStore(filepath.Join(root, "scheduler.db"))
	if err != nil {
		t.Fatal(err)
	}
	service, err := pkgScheduler.NewService(store, schedulerHTTPExecutor{}, pkgScheduler.Options{ScriptRoot: root, PollInterval: 10 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	appContainer, err := container.NewContainer(&container.Config{RuntimePoolSize: 1})
	if err != nil {
		t.Fatal(err)
	}
	return httptest.NewServer(SetupRoutesWithScheduler(appContainer, service)), service, store, appContainer, root
}

func closeSchedulerHTTPTest(t *testing.T, service *pkgScheduler.Service, store *pkgScheduler.Store, appContainer *container.Container) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := service.Close(ctx); err != nil {
		t.Errorf("close scheduler: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Errorf("close store: %v", err)
	}
	if err := appContainer.Close(); err != nil {
		t.Errorf("close container: %v", err)
	}
}

func schedulerRequest(t *testing.T, baseURL, method, path string, body any, destination any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := stdhttp.NewRequest(method, baseURL+path, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := stdhttp.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var envelope schedulerEnvelope
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode %s %s: %v", method, path, err)
	}
	if response.StatusCode != stdhttp.StatusOK || envelope.Code != 0 {
		t.Fatalf("%s %s status=%d code=%d message=%s", method, path, response.StatusCode, envelope.Code, envelope.Message)
	}
	if destination != nil && len(envelope.Data) > 0 {
		if err := json.Unmarshal(envelope.Data, destination); err != nil {
			t.Fatalf("decode data for %s %s: %v", method, path, err)
		}
	}
}
