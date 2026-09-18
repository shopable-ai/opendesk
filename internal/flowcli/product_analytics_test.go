package flowcli

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	pkgExecution "opendesk/pkg/execution"
	"opendesk/pkg/productanalytics"
)

type analyticsBridgeRecorder struct {
	mu     sync.Mutex
	paths  []string
	bodies []map[string]any
	token  string
}

func (r *analyticsBridgeRecorder) handler(w http.ResponseWriter, request *http.Request) {
	if request.Header.Get(productanalytics.LocalHeader) != r.token {
		http.Error(w, "bad token", http.StatusForbidden)
		return
	}
	var body map[string]any
	_ = json.NewDecoder(request.Body).Decode(&body)
	r.mu.Lock()
	r.paths = append(r.paths, request.URL.Path)
	r.bodies = append(r.bodies, body)
	r.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"code":0,"message":"success","data":{"accepted":true}}`))
}

func (r *analyticsBridgeRecorder) snapshot() ([]string, []map[string]any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	paths := append([]string(nil), r.paths...)
	bodies := make([]map[string]any, len(r.bodies))
	copy(bodies, r.bodies)
	return paths, bodies
}

func installedFlowAnalyticsRequest(t *testing.T, ctx context.Context, source string) pkgExecution.Request {
	t.Helper()
	root := t.TempDir()
	executionID := pkgExecution.NewExecutionID("installed-flow-analytics")
	artifacts, err := pkgExecution.PrepareArtifacts(filepath.Join(root, "run"), executionID, ".js")
	if err != nil {
		t.Fatal(err)
	}
	return pkgExecution.Request{
		Context: ctx, ExecutionID: executionID, SourceLabel: source, Ext: ".js",
		ScriptContent: []byte(`
if (Execution.env.OPENDESK_APP_ANALYTICS_TOKEN) throw new Error('analytics token leaked');
if (Execution.env.OPENDESK_APP_ANALYTICS_RUN_SOURCE) throw new Error('analytics source leaked');
if (Execution.env.OPENDESK_ANALYTICS_DEBUG) throw new Error('analytics debug override leaked');
console.log('FLOW_ANALYTICS_ISOLATION_OK');
`),
		WorkDir: root,
		Environment: map[string]string{
			productanalytics.LocalEndpointEnv:  "http://127.0.0.1:1",
			productanalytics.LocalTokenEnv:     "should-be-stripped",
			productanalytics.RunSourceEnv:      "foreground",
			productanalytics.DebugOverrideEnv:  "should-be-stripped",
			productanalytics.EnabledEnv:        "1",
			productanalytics.CaptureEnabledEnv: "1",
			"SAFE":                           "preserved",
		},
		Artifacts: artifacts,
		Selection: pkgExecution.TerminalSelection{Mode: "quiet", Categories: map[string]bool{}, ColorMode: "never"},
	}
}

func newAnalyticsBridgeServer(t *testing.T) (map[string]string, *analyticsBridgeRecorder, func()) {
	t.Helper()
	token := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	recorder := &analyticsBridgeRecorder{token: token}
	server := httptest.NewServer(http.HandlerFunc(recorder.handler))
	environment := map[string]string{
		productanalytics.LocalEndpointEnv: server.URL,
		productanalytics.LocalTokenEnv:    token,
		productanalytics.RunSourceEnv:     "foreground",
	}
	return environment, recorder, server.Close
}

func TestInstalledFlowAnalyticsTrueLifecycleAndIsolation(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		environment, recorder, closeServer := newAnalyticsBridgeServer(t)
		defer closeServer()
		request := installedFlowAnalyticsRequest(t, context.Background(), "flow-success")
		result, _, err := runInstalledFlowExecution(environment, request)
		if err != nil || result.Status != pkgExecution.ExecutionStatusSucceeded {
			t.Fatalf("result=%s err=%v", result.Status, err)
		}
		paths, bodies := recorder.snapshot()
		if len(paths) != 2 || paths[0] != "/api/product/analytics/run/start" || paths[1] != "/api/product/analytics/run/finish" {
			t.Fatalf("paths=%#v bodies=%#v", paths, bodies)
		}
		if bodies[1]["outcome"] != "success" {
			t.Fatalf("finish=%#v", bodies[1])
		}
	})

	t.Run("failure", func(t *testing.T) {
		environment, recorder, closeServer := newAnalyticsBridgeServer(t)
		defer closeServer()
		request := installedFlowAnalyticsRequest(t, context.Background(), "flow-failure")
		request.ScriptContent = []byte(`throw new Error('flow failed');`)
		result, _, err := runInstalledFlowExecution(environment, request)
		if err == nil || result.Status != pkgExecution.ExecutionStatusFailed {
			t.Fatalf("result=%s err=%v", result.Status, err)
		}
		paths, bodies := recorder.snapshot()
		if len(paths) != 2 || bodies[1]["outcome"] != "failure" || bodies[1]["errorCode"] != "execution_failed" {
			t.Fatalf("paths=%#v bodies=%#v", paths, bodies)
		}
	})

	t.Run("startup-rejected", func(t *testing.T) {
		environment, recorder, closeServer := newAnalyticsBridgeServer(t)
		defer closeServer()
		request := installedFlowAnalyticsRequest(t, context.Background(), "flow-startup-rejected")
		request.Environment["INVALID-NAME"] = "reject-before-running"
		if _, _, err := runInstalledFlowExecution(environment, request); err == nil {
			t.Fatal("invalid Flow request unexpectedly started")
		}
		paths, _ := recorder.snapshot()
		if len(paths) != 0 {
			t.Fatalf("startup rejection produced analytics requests: %#v", paths)
		}
	})

	t.Run("cancelled", func(t *testing.T) {
		environment, recorder, closeServer := newAnalyticsBridgeServer(t)
		defer closeServer()
		ctx, cancel := context.WithCancel(context.Background())
		request := installedFlowAnalyticsRequest(t, ctx, "flow-cancel")
		request.ScriptContent = []byte(`await new Promise(() => {});`)
		done := make(chan pkgExecution.ExecutionResult, 1)
		go func() {
			result, _, _ := runInstalledFlowExecution(environment, request)
			done <- result
		}()
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			paths, _ := recorder.snapshot()
			if len(paths) > 0 {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
		paths, _ := recorder.snapshot()
		if len(paths) == 0 {
			t.Fatal("installed Flow never reached true started state")
		}
		cancel()
		select {
		case result := <-done:
			if result.Status != pkgExecution.ExecutionStatusCanceled {
				t.Fatalf("status=%s", result.Status)
			}
		case <-time.After(3 * time.Second):
			t.Fatal("installed Flow did not cancel")
		}
		paths, bodies := recorder.snapshot()
		if len(paths) != 2 || bodies[1]["outcome"] != "cancelled" {
			t.Fatalf("paths=%#v bodies=%#v", paths, bodies)
		}
	})
}
