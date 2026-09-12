package main

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
)

func TestResolveAppSchedulerScriptRootMatchesProductRecipes(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	home := filepath.Join(root, "home")
	got, err := resolveAppSchedulerScriptRoot("com.opendesk.desktop", root, map[string]string{"HOME": home})
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(home, ".opendesk", "apps", "com.opendesk.desktop", "recipes")
	if got != want {
		t.Fatalf("root = %q, want %q", got, want)
	}

	configured, err := resolveAppSchedulerScriptRoot("com.opendesk.desktop", root, map[string]string{
		"HOME":                         home,
		"OPENDESK_SCRIPT_RUNNER_DIR": "recipes-custom",
	})
	if err != nil {
		t.Fatal(err)
	}
	if configured != filepath.Join(root, "recipes-custom") {
		t.Fatalf("configured root = %q", configured)
	}
}

func TestAppSchedulerBridgeIsTokenProtectedAndReportsState(t *testing.T) {
	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	runtime, err := startAppScheduler(ctx, &Config{SchedulerDBPath: filepath.Join(root, "scheduler.db")}, "com.opendesk.desktop", root, map[string]string{
		"HOME":                         root,
		"OPENDESK_SCRIPT_RUNNER_DIR": filepath.Join(root, "recipes"),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	}()

	response, err := http.Get(runtime.endpoint + "/api/scheduler/status")
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("status without token = %d, want %d", response.StatusCode, http.StatusForbidden)
	}

	request, err := http.NewRequest(http.MethodGet, runtime.endpoint+"/api/scheduler/status", nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-OpenDesk-App-Token", runtime.token)
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status with token = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var payload struct {
		Code int `json:"code"`
		Data struct {
			Available   bool   `json:"available"`
			RunnerState string `json:"runnerState"`
			ScriptRoot  string `json:"scriptRoot"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.Code != 0 || !payload.Data.Available {
		t.Fatalf("payload = %+v", payload)
	}
	if payload.Data.RunnerState != "active" {
		t.Fatalf("runnerState = %q, want active", payload.Data.RunnerState)
	}
	if payload.Data.ScriptRoot != filepath.Join(root, "recipes") {
		t.Fatalf("scriptRoot = %q", payload.Data.ScriptRoot)
	}

	environment := runtime.Environment(map[string]string{"EXISTING": "1"})
	if environment["EXISTING"] != "1" || environment[appSchedulerEndpointEnv] != runtime.endpoint || environment[appSchedulerTokenEnv] != runtime.token {
		t.Fatalf("unexpected App Scheduler environment: %+v", environment)
	}
}
