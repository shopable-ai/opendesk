package main

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/productanalytics"
)

func newDebugProductAnalytics(t *testing.T) *productanalytics.Service {
	t.Helper()
	service, err := productanalytics.New(productanalytics.Options{
		DataRoot: t.TempDir(),
		Config:   productanalytics.Config{Provider: productanalytics.ProviderDebug, Environment: "test"},
		Runtime:  productanalytics.RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	return service
}

func appAnalyticsRequest(t *testing.T, ctx context.Context, source string) pkgExecution.Request {
	t.Helper()
	root := t.TempDir()
	executionID := pkgExecution.NewExecutionID("recipe-analytics")
	artifacts, err := pkgExecution.PrepareArtifacts(filepath.Join(root, "run"), executionID, ".js")
	if err != nil {
		t.Fatal(err)
	}
	return pkgExecution.Request{
		Context: ctx, ExecutionID: executionID, SourceLabel: source, Ext: ".js",
		ScriptContent: []byte(`console.log("recipe analytics");`), WorkDir: root,
		Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}, ColorMode: "never"},
	}
}

func flowEvents(service *productanalytics.Service) []productanalytics.Event {
	result := []productanalytics.Event{}
	for _, event := range service.DebugEvents() {
		if event.Name == "flow_run_started" || event.Name == "flow_run_finished" {
			result = append(result, event)
		}
	}
	return result
}

func TestAppRecipeAnalyticsFollowsTrueExecutionLifecycle(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		service := newDebugProductAnalytics(t)
		result, _, err := runAppRecipeWithProductAnalytics(service, appAnalyticsRequest(t, context.Background(), "recipe-success"))
		if err != nil || result.Status != pkgExecution.ExecutionStatusSucceeded {
			t.Fatalf("result=%s err=%v", result.Status, err)
		}
		events := flowEvents(service)
		if len(events) != 2 || events[0].Name != "flow_run_started" || events[1].Properties["outcome"] != "success" {
			t.Fatalf("events=%#v", events)
		}
	})

	t.Run("failure", func(t *testing.T) {
		service := newDebugProductAnalytics(t)
		request := appAnalyticsRequest(t, context.Background(), "recipe-failure")
		request.ScriptContent = []byte(`throw new Error("recipe failed");`)
		result, _, err := runAppRecipeWithProductAnalytics(service, request)
		if err == nil || result.Status != pkgExecution.ExecutionStatusFailed {
			t.Fatalf("result=%s err=%v", result.Status, err)
		}
		events := flowEvents(service)
		if len(events) != 2 || events[1].Properties["outcome"] != "failure" || events[1].Properties["error_code"] != "execution_failed" {
			t.Fatalf("events=%#v", events)
		}
	})

	t.Run("startup-rejected", func(t *testing.T) {
		service := newDebugProductAnalytics(t)
		request := appAnalyticsRequest(t, context.Background(), "recipe-startup-rejected")
		request.Environment = map[string]string{"INVALID-NAME": "reject-before-running"}
		if _, _, err := runAppRecipeWithProductAnalytics(service, request); err == nil {
			t.Fatal("invalid recipe request unexpectedly started")
		}
		if events := flowEvents(service); len(events) != 0 {
			t.Fatalf("startup rejection produced analytics lifecycle: %#v", events)
		}
	})

	t.Run("cancelled", func(t *testing.T) {
		service := newDebugProductAnalytics(t)
		ctx, cancel := context.WithCancel(context.Background())
		request := appAnalyticsRequest(t, ctx, "recipe-cancel")
		request.ScriptContent = []byte(`await new Promise(() => {});`)
		done := make(chan pkgExecution.ExecutionResult, 1)
		go func() {
			result, _, _ := runAppRecipeWithProductAnalytics(service, request)
			done <- result
		}()
		deadline := time.Now().Add(2 * time.Second)
		for len(flowEvents(service)) == 0 && time.Now().Before(deadline) {
			time.Sleep(10 * time.Millisecond)
		}
		if len(flowEvents(service)) == 0 {
			t.Fatal("recipe never reached true started state")
		}
		cancel()
		select {
		case result := <-done:
			if result.Status != pkgExecution.ExecutionStatusCanceled {
				t.Fatalf("status=%s", result.Status)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("recipe did not cancel")
		}
		events := flowEvents(service)
		if len(events) != 2 || events[1].Properties["outcome"] != "cancelled" {
			t.Fatalf("events=%#v", events)
		}
	})
}

func TestAppRecipeRunnerStripsPrivateAnalyticsEnvironment(t *testing.T) {
	privateToken := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	runner := newAppRecipeRunner(appRecipeRunnerConfig{}, map[string]string{
		productanalytics.LocalEndpointEnv:  "http://127.0.0.1:12345",
		productanalytics.LocalTokenEnv:     privateToken,
		productanalytics.EnabledEnv:        "1",
		productanalytics.CaptureEnabledEnv: "1",
		productanalytics.RunSourceEnv:      "foreground",
		productanalytics.DebugOverrideEnv:  "1",
		"SAFE":                           "preserved",
	}, nil)
	for _, name := range []string{
		productanalytics.LocalTokenEnv,
		productanalytics.EnabledEnv,
		productanalytics.CaptureEnabledEnv,
		productanalytics.RunSourceEnv,
		productanalytics.DebugOverrideEnv,
	} {
		if _, ok := runner.environment[name]; ok {
			t.Fatalf("private analytics environment leaked into Recipe: %s", name)
		}
	}
	if runner.environment["SAFE"] != "preserved" {
		t.Fatalf("unrelated environment changed: %#v", runner.environment)
	}
}
