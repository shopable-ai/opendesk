package http

import (
	"bytes"
	"clawdesk/pkg/container"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

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

	if _, ok := status["runtime_pool"]; !ok {
		t.Error("expected runtime_pool in status")
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
