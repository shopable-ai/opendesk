package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOfficialAppInspectorSharesSchedulerListenerAndKeepsGenericHTTPClosed(t *testing.T) {
	root := t.TempDir()
	appRoot := filepath.Join(root, "apps", "opendesk")
	frontendRoot := filepath.Join(root, "apps", "inspector_web")
	for _, relative := range []string{
		"index.html",
		filepath.Join("assets", "app.css"),
		filepath.Join("assets", "app.js"),
		filepath.Join("assets", "model.js"),
	} {
		path := filepath.Join(frontendRoot, relative)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("test asset"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(appRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	environment := map[string]string{
		"HOME":                       root,
		"OPENDESK_SCRIPT_RUNNER_DIR": filepath.Join(root, "recipes"),
	}
	runtime, err := startAppScheduler(ctx, &Config{SchedulerDBPath: filepath.Join(root, "scheduler.db")}, appInspectorProductID, appRoot, environment)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	}()

	if runtime.InspectorURL() != runtime.endpoint+appInspectorPagePath {
		t.Fatalf("InspectorURL = %q, want same endpoint %q", runtime.InspectorURL(), runtime.endpoint+appInspectorPagePath)
	}
	if environment[appInspectorURLEnv] != runtime.InspectorURL() || environment[appLocalEndpointEnv] != runtime.endpoint {
		t.Fatalf("App Inspector environment = %+v", environment)
	}

	pageResponse, err := http.Get(runtime.InspectorURL())
	if err != nil {
		t.Fatal(err)
	}
	_ = pageResponse.Body.Close()
	if pageResponse.StatusCode != http.StatusOK {
		t.Fatalf("Inspector page status = %d, want %d", pageResponse.StatusCode, http.StatusOK)
	}
	if got := pageResponse.Header.Get("Content-Security-Policy"); !strings.Contains(got, "connect-src 'self'") {
		t.Fatalf("Inspector CSP = %q", got)
	}

	genericResponse, err := http.Get(runtime.endpoint + "/SCRIPT_RUN")
	if err != nil {
		t.Fatal(err)
	}
	_ = genericResponse.Body.Close()
	if genericResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("generic Runtime route status = %d, want %d", genericResponse.StatusCode, http.StatusNotFound)
	}

	launchRequest, err := http.NewRequest(http.MethodPost, runtime.endpoint+"/api/accessibility-workbench/v1/launch", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	launchRequest.Header.Set("Content-Type", "application/json")
	launchRequest.Header.Set("Origin", runtime.endpoint)
	launchRequest.Header.Set("Sec-Fetch-Site", "same-origin")
	launchRequest.Header.Set("X-OpenDesk-Workbench-Control", "1")
	launchResponse, err := http.DefaultClient.Do(launchRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer launchResponse.Body.Close()
	if launchResponse.StatusCode != http.StatusOK {
		t.Fatalf("Inspector launch status = %d, want %d", launchResponse.StatusCode, http.StatusOK)
	}
	var payload struct {
		Code int `json:"code"`
		Data struct {
			URL      string `json:"url"`
			Listener string `json:"listener"`
			Mode     string `json:"mode"`
		} `json:"data"`
	}
	if err := json.NewDecoder(launchResponse.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Code != 0 || payload.Data.Listener != strings.TrimPrefix(runtime.endpoint, "http://") || payload.Data.Mode != "local-only" || !strings.HasPrefix(payload.Data.URL, runtime.InspectorURL()+"#") {
		t.Fatalf("unexpected Inspector launch payload: %+v", payload)
	}
}

func TestThirdPartyAppDoesNotMountOfficialInspector(t *testing.T) {
	root := t.TempDir()
	appRoot := filepath.Join(root, "apps", "third-party")
	frontendRoot := filepath.Join(root, "apps", "inspector_web")
	for _, relative := range []string{"index.html", filepath.Join("assets", "app.css"), filepath.Join("assets", "app.js"), filepath.Join("assets", "model.js")} {
		path := filepath.Join(frontendRoot, relative)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("test asset"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	environment := map[string]string{"HOME": root, "OPENDESK_SCRIPT_RUNNER_DIR": filepath.Join(root, "recipes")}
	runtime, err := startAppScheduler(context.Background(), &Config{SchedulerDBPath: filepath.Join(root, "scheduler.db")}, "com.example.app", appRoot, environment)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	if runtime.InspectorURL() != "" {
		t.Fatalf("third-party App InspectorURL = %q, want empty", runtime.InspectorURL())
	}
	if _, exists := environment[appInspectorURLEnv]; exists {
		t.Fatal("third-party App must not receive official Inspector URL")
	}
}
