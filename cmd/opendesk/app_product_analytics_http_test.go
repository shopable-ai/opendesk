package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"opendesk/pkg/productanalytics"
)

func TestProductAnalyticsLocalRouteRequiresIndependentLoopbackToken(t *testing.T) {
	service := newDebugProductAnalytics(t)
	runtime := &appProductAnalyticsRuntime{
		service: service,
		token:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	handler := runtime.authorize(runtime.handleStatus)

	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/product/analytics/status", nil)
	request.RemoteAddr = "127.0.0.1:43210"
	response := httptest.NewRecorder()
	handler(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("missing token status=%d", response.Code)
	}

	request = httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/product/analytics/status", nil)
	request.RemoteAddr = "127.0.0.1:43210"
	request.Header.Set(productanalytics.LocalHeader, runtime.token)
	response = httptest.NewRecorder()
	handler(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("valid token status=%d body=%s", response.Code, response.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/product/analytics/status", nil)
	request.RemoteAddr = "203.0.113.10:43210"
	request.Header.Set(productanalytics.LocalHeader, runtime.token)
	response = httptest.NewRecorder()
	handler(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("non-loopback status=%d", response.Code)
	}
}

func TestProductAnalyticsPreferenceFailureIsReportedAsFailure(t *testing.T) {
	service := newDebugProductAnalytics(t)
	if err := service.Close(nil); err != nil {
		t.Fatal(err)
	}
	runtime := &appProductAnalyticsRuntime{
		service: service,
		token:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	request := httptest.NewRequest(http.MethodPost, "http://127.0.0.1/api/product/analytics/enabled", strings.NewReader(`{"enabled":true}`))
	request.RemoteAddr = "127.0.0.1:43210"
	request.Header.Set(productanalytics.LocalHeader, runtime.token)
	response := httptest.NewRecorder()
	runtime.authorize(runtime.handleEnabled)(response, request)
	if response.Code != http.StatusInternalServerError {
		t.Fatalf("preference failure status=%d body=%s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":1`) {
		t.Fatalf("preference failure was reported as success: %s", response.Body.String())
	}
}


func TestProductAnalyticsDiagnosticsRouteIsSanitized(t *testing.T) {
	service := newDebugProductAnalytics(t)
	if !service.ScreenViewed("flow_runner") {
		t.Fatal("expected debug screen event")
	}
	runtime := &appProductAnalyticsRuntime{
		service: service,
		token:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}
	request := httptest.NewRequest(http.MethodGet, "http://127.0.0.1/api/product/analytics/diagnostics", nil)
	request.RemoteAddr = "127.0.0.1:43210"
	request.Header.Set(productanalytics.LocalHeader, runtime.token)
	response := httptest.NewRecorder()
	runtime.authorize(runtime.handleDiagnostics)(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("diagnostics status=%d body=%s", response.Code, response.Body.String())
	}
	body := response.Body.String()
	for _, expected := range []string{`"recentEvents"`, `"screen_viewed"`, `"queueMode"`, `"lastSendResult"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("diagnostics missing %s: %s", expected, body)
		}
	}
	for _, forbidden := range []string{"flow_runner", "distinct_id", "properties", "install_id", "session_id"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("diagnostics leaked event payload field %q: %s", forbidden, body)
		}
	}
}
