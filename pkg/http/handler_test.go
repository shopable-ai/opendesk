package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"opendesk/pkg/container"
	"opendesk/pkg/customui"
	pkgExecution "opendesk/pkg/execution"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCustomUICapabilityRequiresServerOptInAndLoopbackClient(t *testing.T) {
	tests := []struct {
		name          string
		serverEnabled bool
		remoteAddr    string
		forwardedFor  string
		host          string
		origin        string
		wantStatus    int
	}{
		{name: "server disabled", serverEnabled: false, remoteAddr: "127.0.0.1:48000", host: "127.0.0.1:60844", wantStatus: http.StatusForbidden},
		{name: "remote client rejected", serverEnabled: true, remoteAddr: "192.0.2.10:48000", host: "127.0.0.1:60844", wantStatus: http.StatusForbidden},
		{name: "double opt in", serverEnabled: true, remoteAddr: "127.0.0.1:48000", host: "127.0.0.1:60844", wantStatus: http.StatusOK},
		{name: "IPv6 loopback double opt in", serverEnabled: true, remoteAddr: "[::1]:48000", host: "[::1]:60844", wantStatus: http.StatusOK},
		{name: "forged Host rejected", serverEnabled: true, remoteAddr: "127.0.0.1:48000", host: "example.invalid", wantStatus: http.StatusForbidden},
		{name: "forged Origin rejected", serverEnabled: true, remoteAddr: "127.0.0.1:48000", host: "127.0.0.1:60844", origin: "http://example.invalid", wantStatus: http.StatusForbidden},
		{name: "forwarded loopback does not bypass socket source", serverEnabled: true, remoteAddr: "192.0.2.10:48000", forwardedFor: "127.0.0.1", host: "127.0.0.1:60844", wantStatus: http.StatusForbidden},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			cfg := &container.Config{RuntimePoolSize: 1, EnableCustomUI: test.serverEnabled, CustomUIDriver: customui.NewMemoryDriver()}
			service, err := container.NewContainer(cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer service.Close()
			handler := NewHandler(service)
			body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
				Script:       `const uiCapabilities = ui.getCapabilities(); const dialogCapabilities = Dialog.getCapabilities(); if (!uiCapabilities.enabled || uiCapabilities.activationSource !== "httpRequest" || !dialogCapabilities.enabled || dialogCapabilities.activationSource !== "httpRequest" || Execution.activationSource !== "httpRequest") throw new Error("HTTP ui/Dialog capability source missing")`,
				Capabilities: []string{"ui"},
			}))
			request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
			request.RemoteAddr = test.remoteAddr
			request.Host = test.host
			if test.forwardedFor != "" {
				request.Header.Set("X-Forwarded-For", test.forwardedFor)
			}
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			response := httptest.NewRecorder()
			handler.HandleExecutions(response, request)
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d body=%s, want %d", response.Code, response.Body.String(), test.wantStatus)
			}
			if response.Code == http.StatusOK {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				handler.manager.CancelAll()
				if err := handler.manager.WaitAll(ctx); err != nil {
					t.Fatalf("execution cleanup: %v", err)
				}
			}
		})
	}
}

func TestCustomUIServerOptInDoesNotAuthorizeAnUndeclaredHTTPRequest(t *testing.T) {
	driver := customui.NewMemoryDriver()
	service, err := container.NewContainer(&container.Config{RuntimePoolSize: 1, EnableCustomUI: true, CustomUIDriver: driver})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	handler := NewHandler(service)
	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{Script: `
		const capabilities = ui.getCapabilities();
		const dialogCapabilities = Dialog.getCapabilities();
		if (capabilities.enabled || capabilities.activationSource !== "disabled" || dialogCapabilities.enabled || dialogCapabilities.activationSource !== "disabled" || Execution.activationSource !== "disabled") {
			throw new Error("HTTP request gained undeclared UI capability");
		}
	`}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:48000"
	request.Host = "127.0.0.1:60844"
	response := httptest.NewRecorder()
	handler.HandleExecutions(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := handler.manager.WaitAll(ctx); err != nil {
		t.Fatal(err)
	}
	record, ok := handler.manager.Latest()
	if !ok || record.Result.Status != pkgExecution.ExecutionStatusSucceeded {
		t.Fatalf("execution = %#v", record)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("undeclared request created UI resources: %#v", counts)
	}
}

func TestCustomUIRejectsUnknownHTTPCapability(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()
	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{Script: "1+1", Capabilities: []string{"not-real"}}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:48000"
	request.Host = "127.0.0.1:60844"
	response := httptest.NewRecorder()
	handler.HandleExecutions(response, request)
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "unsupported execution capability") {
		t.Fatalf("unexpected response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func withTestLogDir(t *testing.T, req ScriptRequest) ScriptRequest {
	t.Helper()
	req.LogDir = filepath.Join(t.TempDir(), "run")
	return req
}

func setupTestHandler(t *testing.T) (*Handler, func()) {
	cfg := &container.Config{
		RuntimePoolSize: 2,
	}

	c, err := container.NewContainer(cfg)
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}

	handler := NewHandler(c)

	cleanup := func() {
		c.Close()
	}

	return handler, cleanup
}

func TestHandleScriptExecution(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	tests := []struct {
		name           string
		method         string
		body           interface{}
		expectedStatus int
		expectedCode   int
		checkData      bool
	}{
		{
			name:           "valid script",
			method:         http.MethodPost,
			body:           withTestLogDir(t, ScriptRequest{Script: "1 + 1"}),
			expectedStatus: http.StatusOK,
			expectedCode:   0,
			checkData:      true,
		},
		{
			name:           "empty script",
			method:         http.MethodPost,
			body:           ScriptRequest{Script: ""},
			expectedStatus: http.StatusBadRequest,
			expectedCode:   http.StatusBadRequest,
		},
		{
			name:           "invalid method",
			method:         http.MethodGet,
			body:           nil,
			expectedStatus: http.StatusMethodNotAllowed,
			expectedCode:   http.StatusMethodNotAllowed,
		},
		{
			name:           "script with error",
			method:         http.MethodPost,
			body:           withTestLogDir(t, ScriptRequest{Script: "throw new Error('test error')"}),
			expectedStatus: http.StatusOK,
			expectedCode:   0,
			checkData:      true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body []byte
			if tt.body != nil {
				body, _ = json.Marshal(tt.body)
			}

			req := httptest.NewRequest(tt.method, "/SCRIPT_RUN", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			handler.HandleScriptExecution(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, w.Code)
			}

			var resp ScriptResponse
			if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}

			if resp.Code != tt.expectedCode {
				t.Errorf("expected code %d, got %d", tt.expectedCode, resp.Code)
			}
			if tt.checkData {
				data, ok := resp.Data.(map[string]interface{})
				if !ok {
					t.Fatalf("expected response data map, got %#v", resp.Data)
				}
				if _, ok := data["executionId"]; !ok {
					t.Fatalf("expected executionId in response data: %#v", data)
				}
			}
		})
	}
}

func TestHandleExecutionsAcceptsLegacyStack(t *testing.T) {
	testHandleExecutionsStack(t, "legacy")
}

func TestHandleExecutionsAcceptsUpgradedStack(t *testing.T) {
	testHandleExecutionsStack(t, "upgraded")
}

func TestHandleExecutionsAcceptsPlaywrightStack(t *testing.T) {
	testHandleExecutionsStack(t, "playwright")
}

func TestHandleExecutionsDefaultsToLegacyWhenStackMissing(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{Script: "console.log('ok')"}))
	req := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleExecutions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var resp ScriptResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	data, ok := resp.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("expected response data map, got %#v", resp.Data)
	}
	if data["status"] != "running" {
		t.Fatalf("expected running status, got %#v", data)
	}
}

func TestHTTPExecutionCannotEnableNativeExtensions(t *testing.T) {
	t.Setenv("SKIP_FYNE_INIT", "1")
	tests := []struct {
		name    string
		path    string
		handler func(http.ResponseWriter, *http.Request)
	}{
		{name: "legacy SCRIPT_RUN", path: "/SCRIPT_RUN"},
		{name: "executions", path: "/executions"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, cleanup := setupTestHandler(t)
			defer cleanup()
			if test.path == "/SCRIPT_RUN" {
				test.handler = handler.HandleScriptExecution
			} else {
				test.handler = handler.HandleExecutions
			}

			marker := filepath.Join(t.TempDir(), "must-not-start")
			payload := map[string]any{
				"script":                 `if (typeof NativeExtensions !== "undefined" || typeof NativeExtension !== "undefined") throw new Error("HTTP exposed a Native Extension global");`,
				"timeout":                2,
				"logDir":                 filepath.Join(t.TempDir(), "run"),
				"enableNativeExtensions": true,
				"enableNativeExtension":  true,
				"nativeExtensionRoots":   []string{filepath.Dir(marker)},
				"executable":             marker,
				"extension":              "com.attacker.plugin",
				"wireMethod":             "attack",
				"protocol":               "attacker-protocol",
				"version":                999,
				"discoveryRoot":          filepath.Dir(marker),
			}
			body, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodPost, test.path, bytes.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			test.handler(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
			}

			var created ScriptResponse
			if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
				t.Fatal(err)
			}
			data, ok := created.Data.(map[string]any)
			if !ok {
				t.Fatalf("execution data = %#v", created.Data)
			}
			executionID, _ := data["executionId"].(string)
			if executionID == "" {
				t.Fatalf("missing execution id: %#v", data)
			}

			deadline := time.Now().Add(3 * time.Second)
			finished := false
			for time.Now().Before(deadline) {
				record, exists := handler.manager.Get(executionID)
				if exists && record.Result.Status != pkgExecution.ExecutionStatusPending && record.Result.Status != pkgExecution.ExecutionStatusRunning {
					if record.Result.Status != pkgExecution.ExecutionStatusSucceeded {
						t.Fatalf("HTTP execution status = %s error=%s", record.Result.Status, record.Result.Error)
					}
					finished = true
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if !finished {
				t.Fatal("HTTP execution did not finish")
			}
			if _, err := os.Stat(marker); !os.IsNotExist(err) {
				t.Fatalf("HTTP request started or created the malicious executable marker: %v", err)
			}
		})
	}
}

func testHandleExecutionsStack(t *testing.T, stack string) {
	t.Helper()
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{Script: "console.log('ok')", Stack: stack}))
	req := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleExecutions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp ScriptResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Code != 0 {
		t.Fatalf("expected code 0, got %d", resp.Code)
	}
	data, ok := resp.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("expected response data map, got %#v", resp.Data)
	}
	if data["executionId"] == nil || data["statusUrl"] == nil {
		t.Fatalf("unexpected execution response payload: %#v", data)
	}
}

func TestHandleExecutionsReturnsArtifactPaths(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{Script: "console.log('ok')", Stack: "upgraded"}))
	req := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.HandleExecutions(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var resp ScriptResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	data, ok := resp.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("expected response data map, got %#v", resp.Data)
	}
	artifacts, ok := data["artifacts"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected artifacts map, got %#v", data["artifacts"])
	}
	if artifacts["runDir"] == nil || artifacts["summaryPath"] == nil {
		t.Fatalf("expected runDir and summaryPath in artifacts: %#v", artifacts)
	}
}

func TestHandleExecutionCancelUsesSharedExecutionContext(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
		Script:  `await new Promise((resolve) => setTimeout(resolve, 1000));`,
		Timeout: 2,
	}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.HandleExecutions(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("create status = %d", response.Code)
	}
	var created ScriptResponse
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	data, ok := created.Data.(map[string]interface{})
	if !ok {
		t.Fatalf("create data = %#v", created.Data)
	}
	executionID, _ := data["executionId"].(string)
	if executionID == "" || data["cancelUrl"] == nil {
		t.Fatalf("missing cancellation metadata: %#v", data)
	}

	cancelRequest := httptest.NewRequest(http.MethodDelete, "/executions/"+executionID, nil)
	cancelResponse := httptest.NewRecorder()
	handler.HandleExecutionRoutes(cancelResponse, cancelRequest)
	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("cancel status = %d body=%s", cancelResponse.Code, cancelResponse.Body.String())
	}
	// The request must reach a finalized status, not merely acknowledge the
	// DELETE. Keep the window generous enough for an instrumented race build on
	// a loaded developer machine while preserving an observable upper bound.
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		record, exists := handler.manager.Get(executionID)
		if exists && record.Result.Status != pkgExecution.ExecutionStatusPending && record.Result.Status != pkgExecution.ExecutionStatusRunning {
			if record.Result.Status != pkgExecution.ExecutionStatusCanceled {
				t.Fatalf("cancelled execution status = %s", record.Result.Status)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("cancelled execution did not finish")
}

func TestHandleExecutionCancelCleansActiveFloatingToolbar(t *testing.T) {
	driver := customui.NewMemoryDriver()
	service, err := container.NewContainer(&container.Config{RuntimePoolSize: 1, EnableCustomUI: true, CustomUIDriver: driver})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	handler := NewHandler(service)
	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
		Script: `
			const toolbar = new FloatingWindow({x:40,y:40,title:"HTTP cancel"});
			toolbar.addButton("save", "Save", "paperplane.fill", async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			});
			await toolbar.show();
			await toolbar.waitUntilClosed();
		`,
		Timeout: 5, Capabilities: []string{"ui"},
	}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:48000"
	request.Host = "127.0.0.1:60844"
	response := httptest.NewRecorder()
	handler.HandleExecutions(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("create status=%d body=%s", response.Code, response.Body.String())
	}
	var created ScriptResponse
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	data := created.Data.(map[string]interface{})
	executionID := data["executionId"].(string)
	deadline := time.Now().Add(2 * time.Second)
	for {
		state, ok := driver.WindowState(executionID, "floating-toolbar-1")
		if ok && state.Visible {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("HTTP FloatingWindow toolbar did not become visible")
		}
		time.Sleep(time.Millisecond)
	}
	cancelRequest := httptest.NewRequest(http.MethodDelete, "/executions/"+executionID, nil)
	cancelResponse := httptest.NewRecorder()
	handler.HandleExecutionRoutes(cancelResponse, cancelRequest)
	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("cancel status=%d body=%s", cancelResponse.Code, cancelResponse.Body.String())
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := handler.manager.WaitAll(ctx); err != nil {
		t.Fatal(err)
	}
	record, ok := handler.manager.Get(executionID)
	if !ok || record.Result.Status != pkgExecution.ExecutionStatusCanceled {
		t.Fatalf("cancelled record=%#v exists=%v", record, ok)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("FloatingWindow resources remain after HTTP cancel: %#v", counts)
	} else {
		t.Logf("HTTP cancel FloatingWindow resources: sinks=%d hostProcesses=%d", counts.Sinks, counts.HostProcesses)
	}
}

func TestHandleStatus(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/status", nil)
	w := httptest.NewRecorder()

	handler.HandleStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var status map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&status); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if status["status"] != "ok" {
		t.Errorf("expected status ok, got %v", status["status"])
	}

	if _, ok := status["execution_capacity"]; !ok {
		t.Error("expected execution_capacity in status")
	}

	if _, ok := status["vision_enabled"]; !ok {
		t.Error("expected vision_enabled in status")
	}
}

func TestSetupRoutes(t *testing.T) {
	cfg := &container.Config{
		RuntimePoolSize: 2,
	}

	c, err := container.NewContainer(cfg)
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer c.Close()

	mux := SetupRoutes(c)
	if mux == nil {
		t.Fatal("expected mux to be created")
	}

	routes := []string{
		"/SCRIPT_RUN",
		"/status",
		"/executions",
		"/vision/ocr",
		"/vision/detect-ui",
	}

	for _, route := range routes {
		req := httptest.NewRequest(http.MethodGet, route, nil)
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, req)

		if w.Code == http.StatusNotFound {
			t.Errorf("route %s not registered", route)
		}
	}
}

func TestNewServer(t *testing.T) {
	cfg := &container.Config{
		RuntimePoolSize: 2,
	}

	c, err := container.NewContainer(cfg)
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer c.Close()

	server := NewServer(c, "8080")
	if server == nil {
		t.Fatal("expected server to be created")
	}

	if server.server.Addr != ":8080" {
		t.Errorf("expected addr :8080, got %s", server.server.Addr)
	}
}

func TestHandleScriptExecutionConcurrency(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	done := make(chan bool)
	concurrency := 10
	runtimeDir := t.TempDir()

	for i := 0; i < concurrency; i++ {
		go func(id int) {
			body, _ := json.Marshal(ScriptRequest{
				Script: "1 + 1",
				LogDir: filepath.Join(runtimeDir, fmt.Sprintf("run-%d", id)),
			})
			req := httptest.NewRequest(http.MethodPost, "/SCRIPT_RUN", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")

			w := httptest.NewRecorder()
			handler.HandleScriptExecution(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("goroutine %d: expected status 200, got %d", id, w.Code)
			}

			done <- true
		}(i)
	}

	for i := 0; i < concurrency; i++ {
		<-done
	}
}

func TestHandleScriptExecutionWithTimeout(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
		Script:  "1 + 1",
		Timeout: 5,
	}))

	req := httptest.NewRequest(http.MethodPost, "/SCRIPT_RUN", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	handler.HandleScriptExecution(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestServerShutdown(t *testing.T) {
	cfg := &container.Config{
		RuntimePoolSize: 2,
	}

	c, err := container.NewContainer(cfg)
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer c.Close()

	server := NewServer(c, "0")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil && !strings.Contains(err.Error(), "closed") {
		t.Errorf("unexpected shutdown error: %v", err)
	}
}

func TestServerShutdownCancelsActiveFloatingToolbarAndDrainsResources(t *testing.T) {
	driver := customui.NewMemoryDriver()
	service, err := container.NewContainer(&container.Config{RuntimePoolSize: 1, EnableCustomUI: true, CustomUIDriver: driver})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	server := NewServer(service, "0")

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
		Script: `
			const toolbar = new FloatingWindow({x:80,y:80,title:"Server shutdown"});
			toolbar.addButton("stop", "Stop", "stop.fill");
			await toolbar.show();
			await toolbar.waitUntilClosed();
		`,
		Capabilities: []string{"ui"},
	}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:48000"
	request.Host = "127.0.0.1:60844"
	response := httptest.NewRecorder()
	server.handler.HandleExecutions(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		counts := driver.ResourceCounts()
		if counts.Sinks == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("active HTTP FloatingWindow toolbar was not created")
		}
		time.Sleep(time.Millisecond)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		t.Fatalf("Shutdown() = %v", err)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("resources remain after server shutdown: %#v", counts)
	} else {
		t.Logf("server shutdown FloatingWindow resources: sinks=%d hostProcesses=%d", counts.Sinks, counts.HostProcesses)
	}
	record, ok := server.handler.manager.Latest()
	if !ok || record.Result.Status != pkgExecution.ExecutionStatusCanceled {
		t.Fatalf("shutdown execution = %#v", record)
	}
}

func TestServerShutdownCancelsActiveDialogAndDrainsResources(t *testing.T) {
	driver := customui.NewMemoryDriver()
	service, err := container.NewContainer(&container.Config{RuntimePoolSize: 1, EnableCustomUI: true, CustomUIDriver: driver})
	if err != nil {
		t.Fatal(err)
	}
	defer service.Close()
	server := NewServer(service, "0")

	body, _ := json.Marshal(withTestLogDir(t, ScriptRequest{
		Script:       `await Dialog.alert({title:"shutdown dialog",message:"await server shutdown"});`,
		Capabilities: []string{"ui"},
	}))
	request := httptest.NewRequest(http.MethodPost, "/executions", bytes.NewReader(body))
	request.RemoteAddr = "127.0.0.1:48000"
	request.Host = "127.0.0.1:60844"
	response := httptest.NewRecorder()
	server.handler.HandleExecutions(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", response.Code, response.Body.String())
	}

	deadline := time.Now().Add(2 * time.Second)
	for driver.ResourceCounts().Sinks != 1 {
		if time.Now().After(deadline) {
			t.Fatal("active HTTP Dialog window was not created")
		}
		time.Sleep(time.Millisecond)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		t.Fatalf("Shutdown() = %v", err)
	}
	if counts := driver.ResourceCounts(); counts.Sinks != 0 || counts.HostProcesses != 0 {
		t.Fatalf("resources remain after Dialog server shutdown: %#v", counts)
	}
	record, ok := server.handler.manager.Latest()
	if !ok || record.Result.Status != pkgExecution.ExecutionStatusCanceled {
		t.Fatalf("shutdown Dialog execution = %#v", record)
	}
}

func TestHandleVisionOCR_MethodNotAllowed(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/vision/ocr", nil)
	w := httptest.NewRecorder()

	handler.HandleVisionOCR(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", w.Code)
	}
}

func TestHandleVisionOCR_MissingImage(t *testing.T) {
	handler, cleanup := setupTestHandler(t)
	defer cleanup()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	writer.WriteField("provider", "paddle")
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, "/vision/ocr", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	w := httptest.NewRecorder()

	handler.HandleVisionOCR(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}
