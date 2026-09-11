package http

import (
	"bytes"
	"context"
	"encoding/json"
	stdhttp "net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type accessibilityWorkbenchControlEnvelope struct {
	Code    int                          `json:"code"`
	Message string                       `json:"message"`
	Data    accessibilityWorkbenchLaunch `json:"data"`
}

func newAccessibilityWorkbenchTestHandler(t *testing.T) *Handler {
	t.Helper()
	frontendRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(frontendRoot, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"index.html":                        "<!doctype html><title>OpenDesk Inspector</title>",
		filepath.Join("assets", "app.js"):   "console.log('inspector')",
		filepath.Join("assets", "model.js"): "globalThis.model = {}",
		filepath.Join("assets", "app.css"):  "body { color: black; }",
	} {
		if err := os.WriteFile(filepath.Join(frontendRoot, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	service := newInspectorService(newInspectorFakeRunner(), t.TempDir())
	policy := newInspectorNetworkPolicy("60844")
	private := netip.MustParseAddr("192.168.30.10")
	policy.mu.Lock()
	policy.discoverPrivateHosts = func() []netip.Addr { return []netip.Addr{private} }
	policy.privateHosts = map[netip.Addr]struct{}{private: {}}
	policy.primaryLAN = private
	policy.mu.Unlock()
	controller := newAccessibilityWorkbenchController(service, policy, frontendRoot, "test-control-token")
	handler := NewHandler(nil)
	handler.inspector = service
	handler.inspectorPolicy = policy
	handler.workbench = controller
	handler.inspectorOnPaired = controller.onPaired
	handler.inspectorOnIdle = controller.onIdle
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = controller.shutdown(ctx)
		service.close()
	})
	return handler
}

func TestAccessibilityWorkbenchRoutesAreDisabledUnlessConfigured(t *testing.T) {
	handler := NewHandler(nil)
	for _, request := range []*stdhttp.Request{
		newAccessibilityWorkbenchControlRequest("127.0.0.1:41000", "127.0.0.1:60844"),
		httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844/accessibility-workbench/", nil),
	} {
		request.RemoteAddr = "127.0.0.1:41000"
		response := httptest.NewRecorder()
		setupRoutes(handler).ServeHTTP(response, request)
		if response.Code != stdhttp.StatusNotFound {
			t.Fatalf("disabled route %s status = %d, want 404", request.URL.Path, response.Code)
		}
	}
}

func TestAccessibilityWorkbenchServesOnlyFixedSameOriginFrontendAssets(t *testing.T) {
	handler := newAccessibilityWorkbenchTestHandler(t)
	for _, item := range []struct {
		path        string
		contentType string
	}{
		{path: "/accessibility-workbench/", contentType: "text/html"},
		{path: "/accessibility-workbench/assets/app.js", contentType: "javascript"},
		{path: "/accessibility-workbench/assets/model.js", contentType: "javascript"},
		{path: "/accessibility-workbench/assets/app.css", contentType: "text/css"},
	} {
		request := httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844"+item.path, nil)
		request.RemoteAddr = "127.0.0.1:41000"
		response := httptest.NewRecorder()
		setupRoutes(handler).ServeHTTP(response, request)
		if response.Code != stdhttp.StatusOK || !strings.Contains(response.Header().Get("Content-Type"), item.contentType) {
			t.Fatalf("asset %s = %d %q", item.path, response.Code, response.Header().Get("Content-Type"))
		}
		if response.Header().Get("Cache-Control") != "no-store" ||
			!strings.Contains(response.Header().Get("Content-Security-Policy"), "connect-src 'self'") {
			t.Fatalf("asset %s security headers = %#v", item.path, response.Header())
		}
	}
	redirect := httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844/accessibility-workbench?x=1", nil)
	redirect.RemoteAddr = "127.0.0.1:41000"
	redirectResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(redirectResponse, redirect)
	if redirectResponse.Code != stdhttp.StatusTemporaryRedirect || redirectResponse.Header().Get("Location") != "/accessibility-workbench/?x=1" {
		t.Fatalf("canonical redirect = %d %q", redirectResponse.Code, redirectResponse.Header().Get("Location"))
	}
	unknown := httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844/accessibility-workbench/README.md", nil)
	unknown.RemoteAddr = "127.0.0.1:41000"
	unknownResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(unknownResponse, unknown)
	if unknownResponse.Code != stdhttp.StatusNotFound {
		t.Fatalf("unknown asset status = %d, want 404", unknownResponse.Code)
	}
}

func TestAccessibilityWorkbenchLaunchPairsOnTheSame60844Origin(t *testing.T) {
	handler := newAccessibilityWorkbenchTestHandler(t)
	request := newAccessibilityWorkbenchControlRequest("127.0.0.1:41000", "127.0.0.1:60844")
	response := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(response, request)
	if response.Code != stdhttp.StatusOK {
		t.Fatalf("control status = %d: %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("same-origin control unexpectedly enabled CORS")
	}
	var envelope accessibilityWorkbenchControlEnvelope
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	launchURL, err := url.Parse(envelope.Data.URL)
	if err != nil {
		t.Fatal(err)
	}
	fragment, err := url.ParseQuery(launchURL.Fragment)
	if err != nil || fragment.Get("pair") == "" {
		t.Fatalf("launch fragment = %q", launchURL.Fragment)
	}
	if fragment.Get("api") != "" || launchURL.Scheme+"://"+launchURL.Host != "http://127.0.0.1:60844" ||
		launchURL.Path != "/accessibility-workbench/" || envelope.Data.Listener != "127.0.0.1:60844" ||
		envelope.Data.Mode != "local-only" {
		t.Fatalf("same-origin launch = %#v URL=%s", envelope.Data, launchURL)
	}

	pairRequest := inspectorPolicyRequest(t, stdhttp.MethodPost, "/pair", "127.0.0.1:60844", "127.0.0.1:41000", map[string]any{"code": fragment.Get("pair")})
	pairResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(pairResponse, pairRequest)
	if pairResponse.Code != stdhttp.StatusOK {
		t.Fatalf("pair status = %d: %s", pairResponse.Code, pairResponse.Body.String())
	}
	var pairEnvelope struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(pairResponse.Body.Bytes(), &pairEnvelope); err != nil || pairEnvelope.Data.Token == "" {
		t.Fatalf("pair response = %s, %v", pairResponse.Body.String(), err)
	}
	replayResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(replayResponse, inspectorPolicyRequest(t, stdhttp.MethodPost, "/pair", "127.0.0.1:60844", "127.0.0.1:41000", map[string]any{"code": fragment.Get("pair")}))
	if replayResponse.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("pair replay status = %d, want 401", replayResponse.Code)
	}

	revoke := inspectorPolicyRequest(t, stdhttp.MethodDelete, "/authorization", "127.0.0.1:60844", "127.0.0.1:41000", nil)
	revoke.Header.Set("Authorization", "Bearer "+pairEnvelope.Data.Token)
	revokeResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(revokeResponse, revoke)
	if revokeResponse.Code != stdhttp.StatusOK {
		t.Fatalf("revoke status = %d", revokeResponse.Code)
	}
	deadline := time.Now().Add(time.Second)
	for handler.workbench.hasActive() && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	if handler.workbench.hasActive() {
		t.Fatal("revoked Workbench generation remained active")
	}
	inactive := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(inactive, inspectorPolicyRequest(t, stdhttp.MethodGet, "/capabilities", "127.0.0.1:60844", "127.0.0.1:41000", nil))
	if inactive.Code != stdhttp.StatusNotFound {
		t.Fatalf("inactive Inspector API status = %d, want 404", inactive.Code)
	}
}

func TestInspectorNetworkPolicyLocalDefaultTrustedLANAndRejections(t *testing.T) {
	handler := newAccessibilityWorkbenchTestHandler(t)
	policy := handler.inspectorPolicy
	tests := []struct {
		name   string
		host   string
		remote string
		origin string
		mutate func(*stdhttp.Request)
		want   bool
		wantLAN bool
	}{
		{name: "loopback default", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", origin: "http://127.0.0.1:60844", want: true, wantLAN: true},
		{name: "LAN default denied", host: "192.168.30.10:60844", remote: "192.168.30.20:41000", origin: "http://192.168.30.10:60844", wantLAN: true},
		{name: "forged private Host", host: "192.168.30.99:60844", remote: "192.168.30.20:41000", origin: "http://192.168.30.99:60844"},
		{name: "public remote", host: "192.168.30.10:60844", remote: "203.0.113.8:41000", origin: "http://192.168.30.10:60844"},
		{name: "wrong Origin", host: "192.168.30.10:60844", remote: "192.168.30.20:41000", origin: "http://192.168.30.11:60844"},
		{name: "cross-site metadata", host: "192.168.30.10:60844", remote: "192.168.30.20:41000", origin: "http://192.168.30.10:60844", mutate: func(r *stdhttp.Request) { r.Header.Set("Sec-Fetch-Site", "cross-site") }},
		{name: "forwarded", host: "192.168.30.10:60844", remote: "192.168.30.20:41000", origin: "http://192.168.30.10:60844", mutate: func(r *stdhttp.Request) { r.Header.Set("Forwarded", "for=127.0.0.1") }},
	}
	for _, test := range tests {
		t.Run("disabled/"+test.name, func(t *testing.T) {
			request := httptest.NewRequest(stdhttp.MethodPost, "http://"+test.host+accessibilityWorkbenchControlPath, strings.NewReader("{}"))
			request.Host, request.RemoteAddr = test.host, test.remote
			request.Header.Set("Origin", test.origin)
			if test.mutate != nil {
				test.mutate(request)
			}
			err := policy.authorizeSameOrigin(request, true)
			if (err == nil) != test.want {
				t.Fatalf("authorize = %v, want allowed=%v", err, test.want)
			}
		})
	}
	status := policy.setLAN(true)
	if !status.AllowLAN || status.Mode != "trusted-lan" || status.LANURL != "http://192.168.30.10:60844/accessibility-workbench/" || status.Warning == "" {
		t.Fatalf("trusted-LAN status = %#v", status)
	}
	for _, test := range tests {
		t.Run("enabled/"+test.name, func(t *testing.T) {
			request := httptest.NewRequest(stdhttp.MethodPost, "http://"+test.host+accessibilityWorkbenchControlPath, strings.NewReader("{}"))
			request.Host, request.RemoteAddr = test.host, test.remote
			request.Header.Set("Origin", test.origin)
			if test.mutate != nil { test.mutate(request) }
			err := policy.authorizeSameOrigin(request, true)
			if (err == nil) != test.wantLAN {
				t.Fatalf("authorize = %v, want allowed=%v", err, test.wantLAN)
			}
		})
	}
	lanLaunch := newAccessibilityWorkbenchControlRequest("192.168.30.20:41000", "192.168.30.10:60844")
	lanResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(lanResponse, lanLaunch)
	if lanResponse.Code != stdhttp.StatusOK || !strings.Contains(lanResponse.Body.String(), `"mode":"trusted-lan"`) ||
		!strings.Contains(lanResponse.Body.String(), `http://192.168.30.10:60844/accessibility-workbench/`) {
		t.Fatalf("trusted-LAN launch = %d %s", lanResponse.Code, lanResponse.Body.String())
	}
	var lanEnvelope accessibilityWorkbenchControlEnvelope
	if err := json.Unmarshal(lanResponse.Body.Bytes(), &lanEnvelope); err != nil {
		t.Fatal(err)
	}
	lanURL, _ := url.Parse(lanEnvelope.Data.URL)
	lanFragment, _ := url.ParseQuery(lanURL.Fragment)
	lanPair := inspectorPolicyRequest(t, stdhttp.MethodPost, "/pair", "192.168.30.10:60844", "192.168.30.20:41000", map[string]any{"code": lanFragment.Get("pair")})
	lanPairResponse := httptest.NewRecorder()
	setupRoutes(handler).ServeHTTP(lanPairResponse, lanPair)
	if lanPairResponse.Code != stdhttp.StatusOK {
		t.Fatalf("trusted-LAN pair = %d %s", lanPairResponse.Code, lanPairResponse.Body.String())
	}
	handler.workbench.onIdle()
	policy.setLAN(false)
	allowed := httptest.NewRequest(stdhttp.MethodPost, "http://192.168.30.10:60844"+accessibilityWorkbenchControlPath, strings.NewReader("{}"))
	allowed.Host, allowed.RemoteAddr = "192.168.30.10:60844", "192.168.30.20:41000"
	allowed.Header.Set("Origin", "http://192.168.30.10:60844")
	if err := policy.authorizeSameOrigin(allowed, true); err == nil {
		t.Fatal("trusted private request remained allowed after disabling LAN")
	}
	restarted := newInspectorNetworkPolicy("60844")
	if restarted.status().AllowLAN {
		t.Fatal("a new process policy inherited trusted-LAN state")
	}
}

func TestInspectorInternalLANControlRequiresLoopbackAndRandomToken(t *testing.T) {
	handler := newAccessibilityWorkbenchTestHandler(t)
	do := func(method, remote, host, token, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://"+host+accessibilityWorkbenchInternalLANPath, strings.NewReader(body))
		request.RemoteAddr, request.Host = remote, host
		request.Header.Set(accessibilityWorkbenchInternalControlMark, token)
		if body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		response := httptest.NewRecorder()
		setupRoutes(handler).ServeHTTP(response, request)
		return response
	}
	for _, rejected := range []*httptest.ResponseRecorder{
		do(stdhttp.MethodGet, "192.168.30.20:41000", "127.0.0.1:60844", "test-control-token", ""),
		do(stdhttp.MethodGet, "127.0.0.1:41000", "192.168.30.10:60844", "test-control-token", ""),
		do(stdhttp.MethodGet, "127.0.0.1:41000", "127.0.0.1:60844", "wrong", ""),
	} {
		if rejected.Code != stdhttp.StatusForbidden {
			t.Fatalf("internal rejection status = %d, want 403", rejected.Code)
		}
	}
	enabled := do(stdhttp.MethodPost, "127.0.0.1:41000", "127.0.0.1:60844", "test-control-token", `{"allow":true}`)
	if enabled.Code != stdhttp.StatusOK || !handler.inspectorPolicy.status().AllowLAN {
		t.Fatalf("enable status = %d body=%s", enabled.Code, enabled.Body.String())
	}
	queried := do(stdhttp.MethodGet, "127.0.0.1:41000", "127.0.0.1:60844", "test-control-token", "")
	if queried.Code != stdhttp.StatusOK || !strings.Contains(queried.Body.String(), `"allowLAN":true`) {
		t.Fatalf("query status = %d body=%s", queried.Code, queried.Body.String())
	}
	disabled := do(stdhttp.MethodPost, "127.0.0.1:41000", "127.0.0.1:60844", "test-control-token", `{"allow":false}`)
	if disabled.Code != stdhttp.StatusOK || handler.inspectorPolicy.status().AllowLAN {
		t.Fatalf("disable status = %d body=%s", disabled.Code, disabled.Body.String())
	}
}

func TestAccessibilityWorkbenchPairTTLAndSingleActiveGeneration(t *testing.T) {
	handler := newAccessibilityWorkbenchTestHandler(t)
	handler.workbench.pairTTL = 20 * time.Millisecond
	first, err := handler.workbench.launch("127.0.0.1:60844")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := handler.workbench.launch("127.0.0.1:60844"); err == nil || !strings.Contains(err.Error(), "already active") {
		t.Fatalf("second launch error = %v", err)
	}
	parsed, _ := url.Parse(first.URL)
	fragment, _ := url.ParseQuery(parsed.Fragment)
	time.Sleep(handler.workbench.pairTTL + accessibilityWorkbenchPairShutdownGrace + 20*time.Millisecond)
	if handler.workbench.hasActive() {
		t.Fatal("unpaired generation remained active after pair TTL")
	}
	if _, err := handler.inspector.pair(fragment.Get("pair")); err == nil {
		t.Fatal("expired generation pairing code remained usable")
	}
	if _, err := handler.workbench.launch("127.0.0.1:60844"); err != nil {
		t.Fatalf("fresh generation launch failed: %v", err)
	}
}

func newAccessibilityWorkbenchControlRequest(remote, host string) *stdhttp.Request {
	request := httptest.NewRequest(stdhttp.MethodPost, "http://"+host+accessibilityWorkbenchControlPath, strings.NewReader("{}"))
	request.RemoteAddr = remote
	request.Host = host
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "http://"+host)
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	request.Header.Set("Sec-Fetch-Mode", "cors")
	request.Header.Set(accessibilityWorkbenchControlMark, "1")
	return request
}

func inspectorPolicyRequest(t *testing.T, method, path, host, remote string, body any) *stdhttp.Request {
	t.Helper()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, "http://"+host+inspectorAPIPrefix+path, reader)
	request.Host, request.RemoteAddr = host, remote
	request.Header.Set("Origin", "http://"+host)
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	request.Header.Set("Sec-Fetch-Mode", "cors")
	request.Header.Set("X-OpenDesk-Inspector", "1")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request
}
