package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	stdhttp "net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

type accessibilityWorkbenchControlEnvelope struct {
	Code    int                          `json:"code"`
	Message string                       `json:"message"`
	Data    accessibilityWorkbenchLaunch `json:"data"`
}

func TestAccessibilityWorkbenchControlIsDisabledUnlessConfigured(t *testing.T) {
	handler := NewHandler(nil)
	request := newAccessibilityWorkbenchControlRequest("127.0.0.1:41000", "127.0.0.1:60844")
	request.Header.Set("Origin", "http://127.0.0.1:61955")
	response := httptest.NewRecorder()
	handler.handleAccessibilityWorkbenchControl(response, request)
	if response.Code != stdhttp.StatusNotFound {
		t.Fatalf("control status = %d, want 404", response.Code)
	}
}

func TestAccessibilityWorkbenchControlRejectsUntrustedRemoteAndForwardedRequests(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		host   string
		mutate func(*stdhttp.Request)
	}{
		{name: "remote socket", remote: "192.0.2.10:41000", host: "127.0.0.1:60844"},
		{name: "non-loopback Host", remote: "127.0.0.1:41000", host: "192.0.2.10:60844"},
		{name: "wrong port", remote: "127.0.0.1:41000", host: "127.0.0.1:60843"},
		{name: "missing marker", remote: "127.0.0.1:41000", host: "127.0.0.1:60844", mutate: func(r *stdhttp.Request) {
			r.Header.Del(accessibilityWorkbenchControlMark)
		}},
		{name: "non-loopback browser origin", remote: "127.0.0.1:41000", host: "127.0.0.1:60844", mutate: func(r *stdhttp.Request) {
			r.Header.Set("Origin", "https://example.test")
		}},
		{name: "fetch metadata", remote: "127.0.0.1:41000", host: "127.0.0.1:60844", mutate: func(r *stdhttp.Request) {
			r.Header.Del("Origin")
			r.Header.Set("Sec-Fetch-Site", "same-origin")
		}},
		{name: "forwarded", remote: "127.0.0.1:41000", host: "127.0.0.1:60844", mutate: func(r *stdhttp.Request) {
			r.Header.Set("X-Forwarded-For", "127.0.0.1")
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			controller := newAccessibilityWorkbenchController(t.TempDir())
			handler := NewHandler(nil)
			handler.workbench = controller
			handler.workbenchControlPort = "60844"
			request := newAccessibilityWorkbenchControlRequest(test.remote, test.host)
			request.Header.Set("Origin", "http://127.0.0.1:61955")
			if test.mutate != nil {
				test.mutate(request)
			}
			response := httptest.NewRecorder()
			handler.handleAccessibilityWorkbenchControl(response, request)
			if response.Code != stdhttp.StatusForbidden {
				t.Fatalf("control status = %d, want 403; body=%s", response.Code, response.Body.String())
			}
			if controller.hasActive() {
				t.Fatal("rejected request started a Workbench listener")
			}
		})
	}
}

func TestAccessibilityWorkbenchControlRequiresIndependentFrontend(t *testing.T) {
	controller := newAccessibilityWorkbenchController(t.TempDir())
	handler := NewHandler(nil)
	handler.workbench = controller
	handler.workbenchControlPort = "60844"
	request := newAccessibilityWorkbenchControlRequest("127.0.0.1:41000", "127.0.0.1:60844")
	request.Header.Set("Origin", "http://127.0.0.1:61955")
	response := httptest.NewRecorder()
	handler.handleAccessibilityWorkbenchControl(response, request)
	if response.Code != stdhttp.StatusBadRequest {
		t.Fatalf("control status = %d, want 400; body=%s", response.Code, response.Body.String())
	}
	if controller.hasActive() {
		t.Fatal("missing frontendUrl started a Workbench listener")
	}
}

func TestAccessibilityWorkbenchControlSupportsIndependentLoopbackFrontend(t *testing.T) {
	controller := newAccessibilityWorkbenchController(t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = controller.shutdown(ctx)
	})
	handler := NewHandler(nil)
	handler.workbench = controller
	handler.workbenchControlPort = "60844"
	frontendURL := "http://127.0.0.1:61955/"
	frontendOrigin := strings.TrimSuffix(frontendURL, "/")
	controlPreflight := httptest.NewRequest(stdhttp.MethodOptions, "http://127.0.0.1:60844"+accessibilityWorkbenchControlPath, nil)
	controlPreflight.RemoteAddr = "127.0.0.1:41000"
	controlPreflight.Host = "127.0.0.1:60844"
	controlPreflight.Header.Set("Origin", frontendOrigin)
	controlPreflight.Header.Set("Access-Control-Request-Method", stdhttp.MethodPost)
	controlPreflight.Header.Set("Access-Control-Request-Headers", "content-type, x-opendesk-workbench-control")
	controlPreflightResponse := httptest.NewRecorder()
	handler.handleAccessibilityWorkbenchControl(controlPreflightResponse, controlPreflight)
	if controlPreflightResponse.Code != stdhttp.StatusNoContent ||
		controlPreflightResponse.Header().Get("Access-Control-Allow-Origin") != frontendOrigin {
		t.Fatalf("control preflight status/origin = %d %q", controlPreflightResponse.Code, controlPreflightResponse.Header().Get("Access-Control-Allow-Origin"))
	}
	if controller.hasActive() {
		t.Fatal("control preflight started a Workbench listener")
	}
	request := newAccessibilityWorkbenchControlRequestWithBody(
		"127.0.0.1:41000",
		"127.0.0.1:60844",
		`{"frontendUrl":"`+frontendURL+`"}`,
	)
	request.Header.Set("Origin", frontendOrigin)
	request.Header.Set("Sec-Fetch-Site", "same-site")
	request.Header.Set("Sec-Fetch-Mode", "cors")
	response := httptest.NewRecorder()
	handler.handleAccessibilityWorkbenchControl(response, request)
	if response.Code != stdhttp.StatusOK {
		t.Fatalf("control status = %d, want 200; body=%s", response.Code, response.Body.String())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != frontendOrigin {
		t.Fatalf("control response origin = %q, want %q", response.Header().Get("Access-Control-Allow-Origin"), frontendOrigin)
	}
	var envelope accessibilityWorkbenchControlEnvelope
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	launchURL, err := url.Parse(envelope.Data.URL)
	if err != nil {
		t.Fatal(err)
	}
	if launchURL.Scheme+"://"+launchURL.Host+launchURL.Path != frontendURL {
		t.Fatalf("external frontend URL = %q, want %q", launchURL.String(), frontendURL)
	}
	fragment, err := url.ParseQuery(launchURL.Fragment)
	if err != nil || fragment.Get("pair") == "" || fragment.Get("api") == "" {
		t.Fatalf("external launch fragment = %q", launchURL.Fragment)
	}
	apiOrigin := fragment.Get("api")
	apiURL, err := url.Parse(apiOrigin)
	if err != nil {
		t.Fatal(err)
	}
	if apiURL.Host == launchURL.Host || apiURL.Host != envelope.Data.Listener {
		t.Fatalf("API listener = %q, frontend = %q, response listener = %q", apiURL.Host, launchURL.Host, envelope.Data.Listener)
	}

	preflight, _ := stdhttp.NewRequest(stdhttp.MethodOptions, apiOrigin+inspectorAPIPrefix+"/pair", nil)
	preflight.Header.Set("Origin", launchURL.Scheme+"://"+launchURL.Host)
	preflight.Header.Set("Access-Control-Request-Method", stdhttp.MethodPost)
	preflight.Header.Set("Access-Control-Request-Headers", "content-type, x-opendesk-inspector")
	preflightResponse, err := stdhttp.DefaultClient.Do(preflight)
	if err != nil {
		t.Fatal(err)
	}
	preflightResponse.Body.Close()
	if preflightResponse.StatusCode != stdhttp.StatusNoContent ||
		preflightResponse.Header.Get("Access-Control-Allow-Origin") != launchURL.Scheme+"://"+launchURL.Host {
		t.Fatalf("preflight status/origin = %d %q", preflightResponse.StatusCode, preflightResponse.Header.Get("Access-Control-Allow-Origin"))
	}

	wrongOrigin, _ := stdhttp.NewRequest(stdhttp.MethodGet, apiOrigin+inspectorAPIPrefix+"/capabilities", nil)
	wrongOrigin.Header.Set("X-OpenDesk-Inspector", "1")
	wrongOrigin.Header.Set("Origin", "http://127.0.0.1:61956")
	wrongResponse, err := stdhttp.DefaultClient.Do(wrongOrigin)
	if err != nil {
		t.Fatal(err)
	}
	wrongResponse.Body.Close()
	if wrongResponse.StatusCode != stdhttp.StatusForbidden || wrongResponse.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("wrong-origin status/CORS = %d %q", wrongResponse.StatusCode, wrongResponse.Header.Get("Access-Control-Allow-Origin"))
	}

	pairBody, _ := json.Marshal(map[string]string{"code": fragment.Get("pair")})
	pairRequest, _ := stdhttp.NewRequest(stdhttp.MethodPost, apiOrigin+inspectorAPIPrefix+"/pair", bytes.NewReader(pairBody))
	setInspectorBrowserTestHeaders(pairRequest, launchURL.Scheme+"://"+launchURL.Host)
	pairResponse, err := stdhttp.DefaultClient.Do(pairRequest)
	if err != nil {
		t.Fatal(err)
	}
	var paired struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(pairResponse.Body).Decode(&paired); err != nil {
		pairResponse.Body.Close()
		t.Fatal(err)
	}
	pairResponse.Body.Close()
	if pairResponse.StatusCode != stdhttp.StatusOK || paired.Data.Token == "" {
		t.Fatalf("external pair status/token = %d %q", pairResponse.StatusCode, paired.Data.Token)
	}

	revokeRequest, _ := stdhttp.NewRequest(stdhttp.MethodDelete, apiOrigin+inspectorAPIPrefix+"/authorization", nil)
	setInspectorBrowserTestHeaders(revokeRequest, launchURL.Scheme+"://"+launchURL.Host)
	revokeRequest.Header.Set("Authorization", "Bearer "+paired.Data.Token)
	revokeResponse, err := stdhttp.DefaultClient.Do(revokeRequest)
	if err != nil {
		t.Fatal(err)
	}
	revokeResponse.Body.Close()
	if revokeResponse.StatusCode != stdhttp.StatusOK {
		t.Fatalf("external revoke status = %d, want 200", revokeResponse.StatusCode)
	}
	waitForWorkbenchListenerToClose(t, apiURL.Host)
}

func TestAccessibilityWorkbenchControlRejectsUnsafeFrontendURL(t *testing.T) {
	controller := newAccessibilityWorkbenchController(t.TempDir())
	handler := NewHandler(nil)
	handler.workbench = controller
	handler.workbenchControlPort = "60844"
	for _, frontendURL := range []string{
		"https://127.0.0.1:60845/",
		"http://192.0.2.10:60845/",
		"http://127.0.0.1:60845/#secret",
	} {
		request := newAccessibilityWorkbenchControlRequestWithBody(
			"127.0.0.1:41000",
			"127.0.0.1:60844",
			`{"frontendUrl":"`+frontendURL+`"}`,
		)
		request.Header.Set("Origin", "http://127.0.0.1:61955")
		response := httptest.NewRecorder()
		handler.handleAccessibilityWorkbenchControl(response, request)
		if response.Code != stdhttp.StatusBadRequest {
			t.Fatalf("frontendUrl %q status = %d, want 400", frontendURL, response.Code)
		}
		if controller.hasActive() {
			t.Fatalf("frontendUrl %q started a Workbench listener", frontendURL)
		}
	}
	browserRequest := newAccessibilityWorkbenchControlRequestWithBody(
		"127.0.0.1:41000",
		"127.0.0.1:60844",
		`{"frontendUrl":"http://127.0.0.1:60845/"}`,
	)
	browserRequest.Header.Set("Origin", "http://127.0.0.1:60846")
	browserResponse := httptest.NewRecorder()
	handler.handleAccessibilityWorkbenchControl(browserResponse, browserRequest)
	if browserResponse.Code != stdhttp.StatusBadRequest {
		t.Fatalf("mismatched browser frontend status = %d, want 400", browserResponse.Code)
	}
	if controller.hasActive() {
		t.Fatal("mismatched browser frontend started a Workbench listener")
	}
}

func TestAccessibilityWorkbenchControlExpiresUnpairedListener(t *testing.T) {
	controller := newAccessibilityWorkbenchController(t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = controller.shutdown(ctx)
	})
	controller.pairTTL = 30 * time.Millisecond
	frontendURL, err := url.Parse("http://127.0.0.1:61955/")
	if err != nil {
		t.Fatal(err)
	}
	launch, err := controller.launch(frontendURL)
	if err != nil {
		t.Fatal(err)
	}
	apiOrigin := workbenchAPIOrigin(t, launch.URL)
	parsed, err := url.Parse(apiOrigin)
	if err != nil {
		t.Fatal(err)
	}
	waitForWorkbenchListenerToClose(t, parsed.Host)
}

func TestAccessibilityWorkbenchControlRejectsASecondActiveLaunch(t *testing.T) {
	controller := newAccessibilityWorkbenchController(t.TempDir())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = controller.shutdown(ctx)
	})
	frontendURL, err := url.Parse("http://127.0.0.1:61955/")
	if err != nil {
		t.Fatal(err)
	}
	first, err := controller.launch(frontendURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := controller.launch(frontendURL); err == nil || !strings.Contains(err.Error(), "already active") {
		t.Fatalf("second launch error = %v, want active-session rejection", err)
	}
	apiOrigin := workbenchAPIOrigin(t, first.URL)
	request, _ := stdhttp.NewRequest(stdhttp.MethodGet, apiOrigin+inspectorAPIPrefix+"/capabilities", nil)
	setInspectorBrowserTestHeaders(request, "http://127.0.0.1:61955")
	response, err := stdhttp.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != stdhttp.StatusUnauthorized {
		t.Fatalf("first Workbench was disrupted; status = %d", response.StatusCode)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := controller.shutdown(ctx); err != nil {
		t.Fatal(err)
	}
}

func newAccessibilityWorkbenchControlRequest(remote, host string) *stdhttp.Request {
	return newAccessibilityWorkbenchControlRequestWithBody(remote, host, "{}")
}

func newAccessibilityWorkbenchControlRequestWithBody(remote, host, body string) *stdhttp.Request {
	request := httptest.NewRequest(stdhttp.MethodPost, "http://"+host+accessibilityWorkbenchControlPath, strings.NewReader(body))
	request.RemoteAddr = remote
	request.Host = host
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(accessibilityWorkbenchControlMark, "1")
	return request
}

func setInspectorBrowserTestHeaders(request *stdhttp.Request, origin string) {
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-OpenDesk-Inspector", "1")
	request.Header.Set("Origin", origin)
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	request.Header.Set("Sec-Fetch-Mode", "cors")
}

func workbenchAPIOrigin(t *testing.T, launchURL string) string {
	t.Helper()
	parsed, err := url.Parse(launchURL)
	if err != nil {
		t.Fatal(err)
	}
	fragment, err := url.ParseQuery(parsed.Fragment)
	if err != nil || fragment.Get("api") == "" {
		t.Fatalf("launch URL has no API origin: %q", launchURL)
	}
	return fragment.Get("api")
}

func waitForWorkbenchListenerToClose(t *testing.T, address string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		connection, err := net.DialTimeout("tcp", address, 50*time.Millisecond)
		if err != nil {
			return
		}
		connection.Close()
		if time.Now().After(deadline) {
			t.Fatalf("Workbench listener %s remained open", address)
		}
		time.Sleep(10 * time.Millisecond)
	}
}
