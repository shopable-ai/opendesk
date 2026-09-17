package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiscoverCurrentAppSchedulerUsesOnlyAuthenticatedLiveBridge(t *testing.T) {
	root := t.TempDir()
	t.Setenv("OPENDESK_APP_DATA_DIR", root)
	token := strings.Repeat("ab", 32)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Header.Get("X-OpenDesk-App-Token") != token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"message": "success",
			"data": map[string]any{
				"available": true,
				"runnerState": "active",
				"scriptRoot": filepath.Join(root, "recipes"),
				"artifactRoot": filepath.Join(root, ".runtime", "runs"),
			},
		})
	}))
	defer server.Close()
	writeTestSchedulerBridge(t, root, "live.json", schedulerCLIBridge{
		SchemaVersion: schedulerCLIBridgeSchemaVersion,
		PackageID: "com.opendesk.desktop",
		ExecutionID: "exec-live",
		Endpoint: server.URL,
		Token: token,
	})
	// A syntactically valid but dead bridge is stale metadata, not a second
	// instance. Discovery must probe it before deciding cardinality.
	writeTestSchedulerBridge(t, root, "stale.json", schedulerCLIBridge{
		SchemaVersion: schedulerCLIBridgeSchemaVersion,
		PackageID: "com.opendesk.desktop",
		ExecutionID: "exec-stale",
		Endpoint: "http://127.0.0.1:1",
		Token: strings.Repeat("cd", 32),
	})

	connection, err := discoverCurrentAppScheduler(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if connection.bridge.ExecutionID != "exec-live" || connection.status.RunnerState != "active" {
		t.Fatalf("unexpected connection: bridge=%+v status=%+v", connection.bridge, connection.status)
	}
}

func TestDiscoverCurrentAppSchedulerRefusesMultipleLiveInstances(t *testing.T) {
	root := t.TempDir()
	t.Setenv("OPENDESK_APP_DATA_DIR", root)
	servers := make([]*httptest.Server, 0, 2)
	for index := 0; index < 2; index++ {
		token := strings.Repeat(string(rune('a'+index)), 64)
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": 0,
				"message": "success",
				"data": map[string]any{"available": true, "runnerState": "active"},
			})
		}))
		servers = append(servers, server)
		writeTestSchedulerBridge(t, root, "live-"+string(rune('0'+index))+".json", schedulerCLIBridge{
			SchemaVersion: schedulerCLIBridgeSchemaVersion,
			PackageID: "com.opendesk.desktop",
			ExecutionID: "exec-"+string(rune('0'+index)),
			Endpoint: server.URL,
			Token: token,
		})
	}
	defer func() { for _, server := range servers { server.Close() } }()

	_, err := discoverCurrentAppScheduler(t.Context())
	var typed *schedulerCommandError
	if err == nil || !strings.Contains(err.Error(), "multiple live") || !errorAs(err, &typed) || typed.Code != "APP_SCHEDULER_AMBIGUOUS" {
		t.Fatalf("expected ambiguous-instance error, got %T %v", err, err)
	}
}

func TestSchedulerBridgeEndpointRejectsNonLoopback(t *testing.T) {
	for _, value := range []string{
		"https://127.0.0.1:1234",
		"http://example.com:1234",
		"http://127.0.0.1:1234/path",
		"http://user@127.0.0.1:1234",
	} {
		if normalized, ok := validateSchedulerBridgeEndpoint(value); ok {
			t.Fatalf("%q unexpectedly accepted as %q", value, normalized)
		}
	}
	if normalized, ok := validateSchedulerBridgeEndpoint("http://127.0.0.1:1234"); !ok || normalized != "http://127.0.0.1:1234" {
		t.Fatalf("loopback endpoint rejected: %q ok=%v", normalized, ok)
	}
}

func TestPrepareSchedulerTestPayloadDoesNotOverwriteConflict(t *testing.T) {
	root := t.TempDir()
	relative, err := prepareSchedulerTestPayloadFile(root)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, filepath.FromSlash(relative))
	original, err := os.ReadFile(path)
	if err != nil || !strings.Contains(string(original), "[SCHEDULER_TEST]") {
		t.Fatalf("prepared payload invalid: err=%v content=%q", err, string(original))
	}
	if _, err := prepareSchedulerTestPayloadFile(root); err != nil {
		t.Fatalf("identical prepared payload should be reusable: %v", err)
	}
	if err := os.WriteFile(path, []byte("// user-owned conflict\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareSchedulerTestPayloadFile(root); err == nil || !strings.Contains(err.Error(), "will not overwrite") {
		t.Fatalf("expected conflict without overwrite, got %v", err)
	}
	current, _ := os.ReadFile(path)
	if string(current) != "// user-owned conflict\n" {
		t.Fatalf("conflicting file was modified: %q", string(current))
	}
}

func writeTestSchedulerBridge(t *testing.T, root, name string, bridge schedulerCLIBridge) {
	t.Helper()
	dir := filepath.Join(root, ".runtime", "scheduler-bridges")
	if err := os.MkdirAll(dir, 0o700); err != nil { t.Fatal(err) }
	data, err := json.Marshal(bridge)
	if err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(dir, name), data, 0o600); err != nil { t.Fatal(err) }
}

// Keep the test independent of errors.As import churn in the command file.
func errorAs(err error, target any) bool {
	switch value := target.(type) {
	case **schedulerCommandError:
		current, ok := err.(*schedulerCommandError)
		if ok { *value = current }
		return ok
	default:
		return false
	}
}
