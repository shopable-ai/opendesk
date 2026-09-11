package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	stdhttp "net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/inspector"
)

type inspectorFakeRunner struct {
	mu                sync.Mutex
	windows           []inspector.WindowCandidate
	blockSnapshot     chan struct{}
	releaseSnapshot   chan struct{}
	ignoreCancel      bool
	snapshotErr       error
	snapshotCalls     int
	validationCalls   int
	captureCalls      int
	lastLocator       inspector.Locator
	lastCaptureWindow inspector.WindowCandidate
	captureErr        error
	captureResult     *inspector.VisualCaptureResult
}

func newInspectorFakeRunner() *inspectorFakeRunner {
	return &inspectorFakeRunner{windows: []inspector.WindowCandidate{{
		Title: "Fixture <script>alert(1)</script>", PID: 4242, Application: "Fixture.app",
		Bounds: inspector.Bounds{X: -120, Y: 40, Width: 640, Height: 480},
		Target: map[string]any{"id": "darwin:4242:native:77"},
	}}}
}

func (f *inspectorFakeRunner) Capabilities(context.Context) (map[string]any, error) {
	return map[string]any{
		"accessibility": map[string]any{"backend": "fake-ax", "available": true},
		"window":        map[string]any{"available": true},
	}, nil
}

func (f *inspectorFakeRunner) Windows(context.Context) ([]inspector.WindowCandidate, error) {
	return append([]inspector.WindowCandidate(nil), f.windows...), nil
}

func (f *inspectorFakeRunner) Snapshot(ctx context.Context, _ map[string]any, _ inspector.Limits) (inspector.SnapshotResult, error) {
	f.mu.Lock()
	f.snapshotCalls++
	block, release, ignore, snapshotErr := f.blockSnapshot, f.releaseSnapshot, f.ignoreCancel, f.snapshotErr
	f.mu.Unlock()
	if block != nil {
		select {
		case block <- struct{}{}:
		default:
		}
		if ignore {
			<-release
		} else {
			select {
			case <-release:
			case <-ctx.Done():
				return inspector.SnapshotResult{}, ctx.Err()
			}
		}
	}
	if snapshotErr != nil {
		return inspector.SnapshotResult{}, snapshotErr
	}
	root := map[string]any{
		"role": "window", "name": "Fixture <img src=x onerror=alert(1)>",
		"bounds": map[string]any{"x": -120, "y": 40, "width": 640, "height": 480, "coordinateSpace": "screen"},
		"children": []any{map[string]any{
			"role": "button", "name": "Save </script><script>alert(2)</script>",
			"identifier": "fixture.save", "value": "must-not-export", "actions": []any{"invoke"},
			"bounds":   map[string]any{"x": -150, "y": 80, "width": 100, "height": 30, "coordinateSpace": "screen"},
			"children": []any{map[string]any{"role": "staticText", "name": "nested secret"}},
		}},
	}
	return inspector.SnapshotResult{
		ExecutionID: "inspector-execution-1",
		Window:      map[string]any{"id": "darwin:4242:native:77", "pid": float64(4242), "title": "Fixture", "x": -120.0, "y": 40.0, "width": 640.0, "height": 480.0},
		Snapshot: map[string]any{
			"requestId": "ax-request-1", "backend": "fake-ax", "root": root,
			"complete": false, "truncated": true, "reason": "maxNodes",
			"stats": map[string]any{"nodes": float64(3), "maxDepth": float64(2)},
		},
	}, nil
}

func (f *inspectorFakeRunner) CaptureVisual(_ context.Context, window inspector.WindowCandidate) (inspector.VisualCaptureResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.captureCalls++
	f.lastCaptureWindow = window
	if f.captureErr != nil {
		return inspector.VisualCaptureResult{}, f.captureErr
	}
	if f.captureResult != nil {
		result := *f.captureResult
		result.PNG = append([]byte(nil), f.captureResult.PNG...)
		return result, nil
	}
	pngBytes := inspectorTestPNG(4, 3)
	return inspector.VisualCaptureResult{
		PNG: pngBytes, PixelWidth: 4, PixelHeight: 3,
		Bounds: window.Bounds, CapturedAt: time.Now().UTC(),
		Method: "fake-window-id", Scope: "exact-window",
		ForegroundVerified: true, OcclusionRisk: false,
	}, nil
}

func inspectorTestPNG(width, height int) []byte {
	value := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			value.SetRGBA(x, y, color.RGBA{R: uint8(20 + x), G: uint8(40 + y), B: 80, A: 255})
		}
	}
	var output bytes.Buffer
	_ = png.Encode(&output, value)
	return output.Bytes()
}

func (f *inspectorFakeRunner) Validate(_ context.Context, _ map[string]any, locator inspector.Locator, _ inspector.Limits) (inspector.ValidationResult, error) {
	f.mu.Lock()
	f.validationCalls++
	f.lastLocator = locator
	f.mu.Unlock()
	return inspector.ValidationResult{
		ExecutionID: "inspector-execution-2", Status: "UNIQUE",
		Element: map[string]any{"role": "button", "name": "Save", "identifier": "fixture.save"},
	}, nil
}

func TestInspectorUnitMuxContainsOnlyReadOnlyInspectorRoutes(t *testing.T) {
	handler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	for _, path := range []string{"/accessibility-workbench/", "/status", "/executions", "/scheduler", "/vision/ocr", "/api/mcp"} {
		request := httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844"+path, nil)
		request.RemoteAddr = "127.0.0.1:41000"
		response := httptest.NewRecorder()
		setupInspectorRoutes(handler).ServeHTTP(response, request)
		if response.Code != stdhttp.StatusNotFound {
			t.Errorf("isolated Inspector unit route %s status = %d, want 404", path, response.Code)
		}
	}
	perform := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/not-a-session/perform", map[string]any{"action": "invoke"}, nil)
	if perform.Code != stdhttp.StatusUnauthorized && perform.Code != stdhttp.StatusNotFound {
		t.Fatalf("mutating Inspector route status = %d", perform.Code)
	}
}

func TestInspectorTransportPairingAndSourceGuards(t *testing.T) {
	tests := []struct {
		name       string
		host       string
		remote     string
		origin     string
		fetchSite  string
		fetchMode  string
		clientKind string
		forwarded  bool
		want       int
	}{
		{name: "non-browser explicit", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", clientKind: "non-browser", want: 200},
		{name: "browser same origin", host: "127.0.0.1:60844", remote: "[::1]:41000", origin: "http://127.0.0.1:60844", fetchSite: "same-origin", fetchMode: "cors", want: 200},
		{name: "missing source metadata", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", want: 403},
		{name: "remote socket", host: "127.0.0.1:60844", remote: "192.0.2.10:41000", clientKind: "non-browser", want: 403},
		{name: "forged host", host: "localhost:60844", remote: "127.0.0.1:41000", clientKind: "non-browser", want: 403},
		{name: "cross origin", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", origin: "http://evil.invalid", fetchSite: "cross-site", want: 403},
		{name: "null origin", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", origin: "null", want: 403},
		{name: "forwarded", host: "127.0.0.1:60844", remote: "127.0.0.1:41000", clientKind: "non-browser", forwarded: true, want: 403},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
			request := inspectorHTTPRequest(t, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode})
			request.Host, request.RemoteAddr = test.host, test.remote
			request.Header.Set("X-OpenDesk-Inspector", "1")
			request.Header.Del("X-OpenDesk-Inspector-Client")
			if test.origin != "" {
				request.Header.Set("Origin", test.origin)
			}
			if test.fetchSite != "" {
				request.Header.Set("Sec-Fetch-Site", test.fetchSite)
			}
			if test.fetchMode != "" {
				request.Header.Set("Sec-Fetch-Mode", test.fetchMode)
			}
			if test.clientKind != "" {
				request.Header.Set("X-OpenDesk-Inspector-Client", test.clientKind)
			}
			if test.forwarded {
				request.Header.Set("X-Forwarded-For", "127.0.0.1")
			}
			response := httptest.NewRecorder()
			setupInspectorRoutes(handler).ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("status = %d, want %d: %s", response.Code, test.want, response.Body.String())
			}
			if response.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("Inspector unexpectedly enabled CORS")
			}
		})
	}

	handler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	wrong := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": "wrong-code"}, nil)
	if wrong.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("wrong pair status = %d, want 401", wrong.Code)
	}
	first := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
	if first.Code != 200 {
		t.Fatalf("pair status = %d", first.Code)
	}
	replay := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": "already-redeemed"}, nil)
	if replay.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("pair replay status = %d, want 401", replay.Code)
	}
	token := inspectorDataString(t, first, "token")
	request := inspectorHTTPRequest(t, stdhttp.MethodGet, "/capabilities", nil)
	request.Header.Del("X-OpenDesk-Inspector-Client")
	request.Header.Set("Sec-Fetch-Site", "same-origin")
	request.Header.Set("Sec-Fetch-Mode", "cors")
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	setupInspectorRoutes(handler).ServeHTTP(response, request)
	if response.Code != stdhttp.StatusOK {
		t.Fatalf("same-origin GET without Origin status = %d: %s", response.Code, response.Body.String())
	}
	preflight := inspectorHTTPRequest(t, stdhttp.MethodOptions, "/capabilities", nil)
	preflight.Header.Del("X-OpenDesk-Inspector-Client")
	preflight.Header.Set("Origin", "http://evil.invalid")
	preflight.Header.Set("Sec-Fetch-Site", "cross-site")
	preflightResponse := httptest.NewRecorder()
	setupInspectorRoutes(handler).ServeHTTP(preflightResponse, preflight)
	if preflightResponse.Code != stdhttp.StatusForbidden || preflightResponse.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("cross-site preflight = %d headers=%v", preflightResponse.Code, preflightResponse.Header())
	}
}

type inspectorHugeRunner struct{ *inspectorFakeRunner }

func (f inspectorHugeRunner) Snapshot(context.Context, map[string]any, inspector.Limits) (inspector.SnapshotResult, error) {
	return inspector.SnapshotResult{
		ExecutionID: "inspector-huge",
		Window:      map[string]any{"id": "darwin:4242:native:77"},
		Snapshot: map[string]any{
			"requestId": "huge", "backend": "fake-ax", "complete": true,
			"root": map[string]any{"role": "window", "name": strings.Repeat("x", inspectorResponseLimit)},
		},
	}, nil
}

func TestInspectorInputAndResponseLimits(t *testing.T) {
	handler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	pair := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
	token := inspectorDataString(t, pair, "token")
	auth := map[string]string{"Authorization": "Bearer " + token}
	for _, body := range []map[string]any{
		{"windowId": "window-invalid", "unknown": true},
		{"windowId": strings.Repeat("x", inspectorBodyLimit)},
	} {
		response := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", body, auth)
		if response.Code != stdhttp.StatusBadRequest {
			t.Fatalf("invalid/oversized request status = %d: %s", response.Code, response.Body.String())
		}
	}
	for _, locator := range []map[string]any{
		{}, {"role": "xpath"}, {"name": ""}, {"identifier": ""},
	} {
		if err := validateInspectorLocator(locatorForInspectorTest(locator)); err == nil {
			t.Fatalf("illegal locator accepted: %#v", locator)
		}
	}

	hugeHandler := newInspectorHTTPTestHandler(t, inspectorHugeRunner{newInspectorFakeRunner()})
	pair = inspectorDo(t, hugeHandler, stdhttp.MethodPost, "/pair", map[string]any{"code": hugeHandler.inspector.pairCode}, nil)
	token = inspectorDataString(t, pair, "token")
	auth = map[string]string{"Authorization": "Bearer " + token}
	windowsResponse := inspectorDo(t, hugeHandler, stdhttp.MethodGet, "/windows", nil, auth)
	windows := inspectorEnvelopeData(t, windowsResponse).([]any)
	created := inspectorDo(t, hugeHandler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": windows[0].(map[string]any)["windowId"],
	}, auth)
	data := inspectorEnvelopeData(t, created).(map[string]any)
	sessionAuth := map[string]string{
		"Authorization":                "Bearer " + token,
		"X-OpenDesk-Inspector-Session": data["sessionToken"].(string),
	}
	response := inspectorDo(t, hugeHandler, stdhttp.MethodPost, "/sessions/"+data["sessionId"].(string)+"/observations", map[string]any{}, sessionAuth)
	if response.Code != stdhttp.StatusInternalServerError || !strings.Contains(response.Body.String(), "response limit") {
		t.Fatalf("oversized response status/body = %d %s", response.Code, response.Body.String())
	}
}

func TestInspectorVisualCaptureAuthenticationFreshnessAndPayloadBoundary(t *testing.T) {
	runner := newInspectorFakeRunner()
	handler := newInspectorHTTPTestHandler(t, runner)
	pair := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
	bearer := inspectorDataString(t, pair, "token")
	auth := map[string]string{"Authorization": "Bearer " + bearer}
	windows := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodGet, "/windows", nil, auth)).([]any)
	windowID := windows[0].(map[string]any)["windowId"].(string)
	created := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": windowID,
	}, auth)).(map[string]any)
	sessionID := created["sessionId"].(string)
	sessionToken := created["sessionToken"].(string)
	sessionAuth := map[string]string{
		"Authorization": "Bearer " + bearer, "X-OpenDesk-Inspector-Session": sessionToken,
	}
	observed := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodPost,
		"/sessions/"+sessionID+"/observations", map[string]any{}, sessionAuth)).(map[string]any)
	observationID := observed["observationId"].(string)
	generation := int64(observed["generation"].(float64))
	path := "/sessions/" + sessionID + "/visual-captures"
	input := map[string]any{"observationId": observationID, "generation": generation}

	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, input, nil); response.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("unauthorized visual capture = %d, want 401", response.Code)
	}
	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, input, map[string]string{
		"Authorization": "Bearer " + bearer, "X-OpenDesk-Inspector-Session": "wrong",
	}); response.Code != stdhttp.StatusNotFound {
		t.Fatalf("wrong-session visual capture = %d, want 404", response.Code)
	}
	for _, forbidden := range []map[string]any{
		{"observationId": observationID, "generation": generation, "path": "/tmp/leak.png"},
		{"observationId": observationID, "generation": generation, "clip": map[string]any{"x": 0, "y": 0, "width": 10, "height": 10}},
	} {
		if response := inspectorDo(t, handler, stdhttp.MethodPost, path, forbidden, sessionAuth); response.Code != stdhttp.StatusBadRequest {
			t.Fatalf("forbidden visual input %#v = %d, want 400", forbidden, response.Code)
		}
	}
	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, map[string]any{
		"observationId": "observation-other", "generation": generation,
	}, sessionAuth); response.Code != stdhttp.StatusConflict {
		t.Fatalf("stale observation visual capture = %d, want 409", response.Code)
	}
	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, map[string]any{
		"observationId": observationID, "generation": generation + 1,
	}, sessionAuth); response.Code != stdhttp.StatusConflict {
		t.Fatalf("stale generation visual capture = %d, want 409", response.Code)
	}

	response := inspectorDo(t, handler, stdhttp.MethodPost, path, input, sessionAuth)
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("visual capture Cache-Control = %q", response.Header().Get("Cache-Control"))
	}
	capture := inspectorEnvelopeData(t, response).(map[string]any)
	if capture["schemaVersion"] != "opendesk.inspector.visual-capture/v1" ||
		capture["sessionId"] != sessionID || capture["observationId"] != observationID ||
		capture["generation"] != float64(generation) {
		t.Fatalf("visual capture binding = %#v", capture)
	}
	imageValue := capture["image"].(map[string]any)
	if dataURL, _ := imageValue["dataUrl"].(string); !strings.HasPrefix(dataURL, "data:image/png;base64,") {
		t.Fatalf("visual image data URL = %q", dataURL)
	}
	provenance := capture["captureProvenance"].(map[string]any)
	if provenance["method"] != "fake-window" && provenance["method"] != "fake" && provenance["method"] != "fake-window-id" {
		t.Fatalf("visual provenance = %#v", provenance)
	}
	if provenance["scope"] != "exact-window" || provenance["occlusionRisk"] != false ||
		provenance["foregroundVerified"] != true || provenance["focusChanged"] != false || provenance["persisted"] != false {
		t.Fatalf("visual provenance = %#v", provenance)
	}
	capturedAt, err := time.Parse(time.RFC3339Nano, capture["capturedAt"].(string))
	if err != nil {
		t.Fatal(err)
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, capture["expiresAt"].(string))
	if err != nil || !expiresAt.After(time.Now()) {
		t.Fatalf("visual expiresAt = %v, %v", expiresAt, err)
	}
	if lifetime := expiresAt.Sub(capturedAt); lifetime != inspectorVisualTTL {
		t.Fatalf("visual lifetime = %v, want %v", lifetime, inspectorVisualTTL)
	}
	runner.mu.Lock()
	lastWindow := runner.lastCaptureWindow
	captureCalls := runner.captureCalls
	runner.mu.Unlock()
	if captureCalls != 1 || lastWindow.Target["id"] != "darwin:4242:native:77" ||
		lastWindow.Bounds != (inspector.Bounds{X: -120, Y: 40, Width: 640, Height: 480}) {
		t.Fatalf("capture window = %#v, calls=%d", lastWindow, captureCalls)
	}
	if err := filepath.Walk(handler.inspector.artifactRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".png") {
			t.Fatalf("visual capture was persisted at %s", path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}

	validPNG := inspectorTestPNG(4, 3)
	runner.mu.Lock()
	runner.captureResult = &inspector.VisualCaptureResult{
		PNG: validPNG, PixelWidth: 4, PixelHeight: 3,
		Bounds: inspector.Bounds{X: -120, Y: 40, Width: 640, Height: 480},
		Scope:  "exact-window",
	}
	runner.mu.Unlock()
	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, input, sessionAuth); response.Code != stdhttp.StatusInternalServerError || !strings.Contains(response.Body.String(), "invalid provenance") {
		t.Fatalf("invalid-provenance visual capture = %d %s", response.Code, response.Body.String())
	}

	runner.mu.Lock()
	runner.captureResult = &inspector.VisualCaptureResult{
		PNG: validPNG, PixelWidth: 4, PixelHeight: 3,
		Bounds:     inspector.Bounds{X: -119, Y: 40, Width: 640, Height: 480},
		CapturedAt: time.Now().UTC(), Method: "fake-window-id", Scope: "exact-window",
	}
	runner.mu.Unlock()
	if response := inspectorDo(t, handler, stdhttp.MethodPost, path, input, sessionAuth); response.Code != stdhttp.StatusConflict {
		t.Fatalf("changed-bounds visual capture = %d, want 409: %s", response.Code, response.Body.String())
	}
	status := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodGet, "/sessions/"+sessionID, nil, sessionAuth)).(map[string]any)
	latest := status["latestObservation"].(map[string]any)
	if latest["freshness"] != "stale" || latest["staleReason"] != "STALE_TARGET" {
		t.Fatalf("changed-bounds observation state = %#v", latest)
	}

	largeRunner := newInspectorFakeRunner()
	largeRunner.captureResult = &inspector.VisualCaptureResult{
		PNG: make([]byte, inspectorVisualPNGMaxBytes+1), PixelWidth: 1, PixelHeight: 1,
		Bounds:     inspector.Bounds{X: -120, Y: 40, Width: 640, Height: 480},
		CapturedAt: time.Now().UTC(), Method: "fake-window-id", Scope: "exact-window",
	}
	largeHandler := newInspectorHTTPTestHandler(t, largeRunner)
	largePair := inspectorDo(t, largeHandler, stdhttp.MethodPost, "/pair", map[string]any{"code": largeHandler.inspector.pairCode}, nil)
	largeBearer := inspectorDataString(t, largePair, "token")
	largeAuth := map[string]string{"Authorization": "Bearer " + largeBearer}
	largeWindows := inspectorEnvelopeData(t, inspectorDo(t, largeHandler, stdhttp.MethodGet, "/windows", nil, largeAuth)).([]any)
	largeWindowID := largeWindows[0].(map[string]any)["windowId"].(string)
	largeCreated := inspectorEnvelopeData(t, inspectorDo(t, largeHandler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": largeWindowID,
	}, largeAuth)).(map[string]any)
	largeSessionID := largeCreated["sessionId"].(string)
	largeSessionAuth := map[string]string{
		"Authorization":                "Bearer " + largeBearer,
		"X-OpenDesk-Inspector-Session": largeCreated["sessionToken"].(string),
	}
	largeObserved := inspectorEnvelopeData(t, inspectorDo(t, largeHandler, stdhttp.MethodPost,
		"/sessions/"+largeSessionID+"/observations", map[string]any{}, largeSessionAuth)).(map[string]any)
	largeResponse := inspectorDo(t, largeHandler, stdhttp.MethodPost, "/sessions/"+largeSessionID+"/visual-captures", map[string]any{
		"observationId": largeObserved["observationId"], "generation": largeObserved["generation"],
	}, largeSessionAuth)
	if largeResponse.Code != stdhttp.StatusInternalServerError || strings.Contains(largeResponse.Body.String(), "data:image") {
		t.Fatalf("oversize visual capture = %d %s", largeResponse.Code, largeResponse.Body.String())
	}
}

func TestInspectorHTTPReadOnlyReviewImportAndHandoff(t *testing.T) {
	runner := newInspectorFakeRunner()
	handler := newInspectorHTTPTestHandler(t, runner)
	pair := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
	token := inspectorDataString(t, pair, "token")
	auth := map[string]string{"Authorization": "Bearer " + token}

	unauthorized := inspectorDo(t, handler, stdhttp.MethodGet, "/capabilities", nil, nil)
	if unauthorized.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("unauthorized capabilities = %d", unauthorized.Code)
	}
	wrongBearer := inspectorDo(t, handler, stdhttp.MethodGet, "/capabilities", nil, map[string]string{"Authorization": "Bearer wrong"})
	if wrongBearer.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("wrong bearer capabilities = %d", wrongBearer.Code)
	}
	windowsResponse := inspectorDo(t, handler, stdhttp.MethodGet, "/windows", nil, auth)
	windows := inspectorEnvelopeData(t, windowsResponse).([]any)
	windowID := windows[0].(map[string]any)["windowId"].(string)
	created := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": windowID, "limits": map[string]any{"timeout": 1000, "maxDepth": 6, "maxNodes": 50},
	}, auth)
	createdData := inspectorEnvelopeData(t, created).(map[string]any)
	sessionID := createdData["sessionId"].(string)
	sessionToken := createdData["sessionToken"].(string)
	sessionAuth := map[string]string{
		"Authorization":                "Bearer " + token,
		"X-OpenDesk-Inspector-Session": sessionToken,
	}
	wrongSession := map[string]string{"Authorization": "Bearer " + token, "X-OpenDesk-Inspector-Session": "wrong"}
	if response := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/observations", map[string]any{}, wrongSession); response.Code != stdhttp.StatusNotFound {
		t.Fatalf("cross-session credential status = %d, want 404", response.Code)
	}
	secondCreated := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": windowID, "limits": map[string]any{"timeout": 1000, "maxDepth": 6, "maxNodes": 50},
	}, auth)
	secondData := inspectorEnvelopeData(t, secondCreated).(map[string]any)
	crossSession := map[string]string{
		"Authorization":                "Bearer " + token,
		"X-OpenDesk-Inspector-Session": secondData["sessionToken"].(string),
	}
	if response := inspectorDo(t, handler, stdhttp.MethodGet, "/sessions/"+sessionID, nil, crossSession); response.Code != stdhttp.StatusNotFound {
		t.Fatalf("other session token status = %d, want 404", response.Code)
	}
	if response := inspectorDo(t, handler, stdhttp.MethodDelete, "/sessions/"+secondData["sessionId"].(string), nil, map[string]string{
		"Authorization": "Bearer " + token, "X-OpenDesk-Inspector-Session": secondData["sessionToken"].(string),
	}); response.Code != stdhttp.StatusOK {
		t.Fatalf("close second session = %d", response.Code)
	}

	if response := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/perform", map[string]any{"action": "invoke"}, sessionAuth); response.Code != stdhttp.StatusNotFound {
		t.Fatalf("perform route status = %d, want 404", response.Code)
	}
	if response := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/observations", map[string]any{"properties": []string{"value"}}, sessionAuth); response.Code != stdhttp.StatusBadRequest {
		t.Fatalf("value request status = %d, want 400", response.Code)
	}
	for _, path := range []string{"/executions", "/SCRIPT_RUN", "/status"} {
		request := httptest.NewRequest(stdhttp.MethodGet, "http://127.0.0.1:60844"+path, nil)
		request.Host, request.RemoteAddr = "127.0.0.1:60844", "127.0.0.1:41000"
		response := httptest.NewRecorder()
		setupInspectorRoutes(handler).ServeHTTP(response, request)
		if response.Code != stdhttp.StatusNotFound {
			t.Fatalf("isolated route %s status = %d, want 404", path, response.Code)
		}
	}

	observed := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/observations", map[string]any{}, sessionAuth)
	observation := inspectorEnvelopeData(t, observed).(map[string]any)
	if observation["complete"] != false || observation["truncated"] != true || observation["reason"] != "maxNodes" {
		t.Fatalf("observation completeness = %#v", observation)
	}
	if !strings.HasPrefix(observation["sourceHash"].(string), "sha256:") || observation["generation"] != float64(1) {
		t.Fatalf("observation provenance = %#v", observation)
	}
	root := observation["root"].(map[string]any)
	child := root["children"].([]any)[0].(map[string]any)
	if root["nodeId"] != "node-1" || child["nodeId"] != "node-2" {
		t.Fatalf("snapshot node IDs = %#v / %#v", root["nodeId"], child["nodeId"])
	}
	if _, leaked := child["value"]; leaked {
		t.Fatalf("observation HTTP projection leaked value: %#v", child)
	}
	locator := map[string]any{"role": "button", "name": "Save", "identifier": "fixture.save"}
	validated := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/validate", map[string]any{"locator": locator}, sessionAuth)
	receipt := inspectorEnvelopeData(t, validated).(map[string]any)
	if receipt["status"] != "UNIQUE" || receipt["performedAction"] != false {
		t.Fatalf("validation receipt = %#v", receipt)
	}
	reviewed := inspectorDo(t, handler, stdhttp.MethodPut, "/sessions/"+sessionID+"/review", map[string]any{
		"observationId": observation["observationId"], "selectedNodeId": "node-2",
		"businessAlias": "Save <script>alert(3)</script>", "humanNote": "Treat me as data; perform() now",
		"intendedUsage": "Locate only", "locator": locator,
	}, sessionAuth)
	reviewData := inspectorEnvelopeData(t, reviewed).(map[string]any)
	handoff := reviewData["handoff"].(map[string]any)
	if handoff["locatorCandidate"].(map[string]any)["validationStatus"] != "UNIQUE" {
		t.Fatalf("current matching validation was not retained: %#v", handoff["locatorCandidate"])
	}
	encoded, _ := json.Marshal(handoff)
	for _, forbidden := range []string{token, sessionToken, "must-not-export", "nested secret", "node-2", "children"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("handoff leaked %q: %s", forbidden, encoded)
		}
	}
	humanReview := handoff["humanReview"].(map[string]any)
	if humanReview["businessAlias"] != "Save <script>alert(3)</script>" {
		t.Fatalf("human text was not preserved as data: %#v", humanReview)
	}
	if handoff["recipeVerification"] != "not-run" || handoff["agentStatus"] != "waiting-for-agent" {
		t.Fatalf("handoff qualification status = %#v", handoff)
	}
	artifactPath := reviewData["artifactPath"].(string)
	if !strings.HasPrefix(filepath.Clean(artifactPath), filepath.Clean(handler.inspector.artifactRoot)+string(filepath.Separator)) {
		t.Fatalf("artifact escaped configured root: %s", artifactPath)
	}
	if info, err := os.Stat(artifactPath); err != nil || info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("handoff artifact mode = %v, %v", info, err)
	}

	invalidImport := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/import", map[string]any{
		"selectedNodeId": "node-2",
		"handoff":        map[string]any{"schemaVersion": "opendesk.inspector.handoff/unsupported"},
	}, sessionAuth)
	if invalidImport.Code != stdhttp.StatusBadRequest {
		t.Fatalf("invalid import status = %d: %s", invalidImport.Code, invalidImport.Body.String())
	}

	// A file's own validation claim is discarded. Changing the imported locator
	// also proves that a prior receipt for another candidate is not reused.
	imported := cloneMapForInspectorTest(t, handoff)
	imported["locatorCandidate"].(map[string]any)["selector"] = map[string]any{"role": "button", "name": "Different"}
	imported["locatorCandidate"].(map[string]any)["validationStatus"] = "UNIQUE"
	imported["humanReview"].(map[string]any)["businessAlias"] = "Imported <img onerror=alert(4)>"
	importResponse := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+sessionID+"/import", map[string]any{
		"selectedNodeId": "node-2", "handoff": imported,
	}, sessionAuth)
	if importResponse.Code != stdhttp.StatusOK {
		t.Fatalf("import status = %d: %s", importResponse.Code, importResponse.Body.String())
	}
	importData := inspectorEnvelopeData(t, importResponse).(map[string]any)
	if importData["validationStatus"] != "NOT_VALIDATED" {
		t.Fatalf("import validation = %#v", importData)
	}
	importReview := importData["review"].(map[string]any)
	if importReview["evidenceSource"] != "human-review-import" || !strings.HasPrefix(importReview["importSourceHash"].(string), "sha256:") {
		t.Fatalf("import provenance = %#v", importReview)
	}
	if importReview["selectedNodeId"] != "node-2" {
		t.Fatalf("import changed the selected node: %#v", importReview)
	}
	importHandoff := importData["handoff"].(map[string]any)
	if importHandoff["locatorCandidate"].(map[string]any)["validationStatus"] != "NOT_VALIDATED" {
		t.Fatalf("imported handoff trusted stale validation: %#v", importHandoff)
	}
	selectedFacts := importHandoff["observation"].(map[string]any)["selectedElementFacts"].(map[string]any)
	if selectedFacts["identifier"] != "fixture.save" {
		t.Fatalf("imported handoff changed selected element facts: %#v", selectedFacts)
	}

	if runner.snapshotCalls != 1 || runner.validationCalls != 1 {
		t.Fatalf("runner calls snapshot/validate = %d/%d", runner.snapshotCalls, runner.validationCalls)
	}
	if closeResponse := inspectorDo(t, handler, stdhttp.MethodDelete, "/sessions/"+sessionID, nil, sessionAuth); closeResponse.Code != stdhttp.StatusOK {
		t.Fatalf("close session = %d", closeResponse.Code)
	}
	if status := inspectorDo(t, handler, stdhttp.MethodGet, "/sessions/"+sessionID, nil, sessionAuth); status.Code != stdhttp.StatusNotFound {
		t.Fatalf("closed session status = %d, want 404", status.Code)
	}
	if revoke := inspectorDo(t, handler, stdhttp.MethodDelete, "/authorization", nil, auth); revoke.Code != stdhttp.StatusOK {
		t.Fatalf("revoke authorization = %d", revoke.Code)
	}
	if denied := inspectorDo(t, handler, stdhttp.MethodGet, "/capabilities", nil, auth); denied.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("revoked authorization status = %d", denied.Code)
	}
}

func TestInspectorObservationRefreshInvalidatesClaimsAndMarksFailureStale(t *testing.T) {
	runner := newInspectorFakeRunner()
	service := newInspectorService(runner, t.TempDir())
	t.Cleanup(service.close)
	pair, err := service.pair(service.pairCode)
	if err != nil {
		t.Fatal(err)
	}
	client, err := service.authorize("Bearer " + pair["token"].(string))
	if err != nil {
		t.Fatal(err)
	}
	windows, err := service.listWindows(context.Background(), client.ID)
	if err != nil {
		t.Fatal(err)
	}
	oldWindowID := windows[0]["windowId"].(string)
	refreshedWindows, err := service.listWindows(context.Background(), client.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.createSession(client.ID, oldWindowID, inspector.Limits{TimeoutMS: 1000, MaxDepth: 6, MaxNodes: 50}); err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("old window id createSession error = %v, want stale", err)
	}
	session, err := service.createSession(client.ID, refreshedWindows[0]["windowId"].(string), inspector.Limits{TimeoutMS: 1000, MaxDepth: 6, MaxNodes: 50})
	if err != nil {
		t.Fatal(err)
	}
	sessionID, sessionToken := session["sessionId"].(string), session["sessionToken"].(string)
	first, err := service.observe(context.Background(), client.ID, sessionID, sessionToken, nil)
	if err != nil {
		t.Fatal(err)
	}
	firstChild := first["root"].(map[string]any)["children"].([]any)[0].(map[string]any)
	locator := inspector.Locator{Role: "button"}
	name, identifier := "Save", "fixture.save"
	locator.Name, locator.Identifier = &name, &identifier
	if _, err := service.validate(context.Background(), client.ID, sessionID, sessionToken, locator, nil); err != nil {
		t.Fatal(err)
	}
	firstReview := inspectorReviewInput{
		ObservationID: first["observationId"].(string), SelectedNodeID: firstChild["nodeId"].(string),
		BusinessAlias: "Save", Locator: locator,
	}
	if _, err := service.saveReview(client.ID, sessionID, sessionToken, firstReview); err != nil {
		t.Fatal(err)
	}

	second, err := service.observe(context.Background(), client.ID, sessionID, sessionToken, nil)
	if err != nil {
		t.Fatal(err)
	}
	secondChild := second["root"].(map[string]any)["children"].([]any)[0].(map[string]any)
	if first["observationId"] == second["observationId"] || firstChild["nodeId"] != secondChild["nodeId"] {
		t.Fatalf("refresh observation/node identity = %#v/%#v then %#v/%#v", first["observationId"], firstChild["nodeId"], second["observationId"], secondChild["nodeId"])
	}
	service.mu.Lock()
	stored := cloneSession(service.sessions[sessionID])
	service.mu.Unlock()
	if stored.Review != nil || len(stored.Validations) != 0 {
		t.Fatalf("refresh retained stale claims: review=%#v validations=%#v", stored.Review, stored.Validations)
	}
	if _, err := service.handoff(client.ID, sessionID, sessionToken); !errors.Is(err, errInspectorPrecondition) {
		t.Fatalf("handoff after refresh error = %v, want precondition", err)
	}

	if _, err := service.validate(context.Background(), client.ID, sessionID, sessionToken, locator, nil); err != nil {
		t.Fatal(err)
	}
	secondReview := firstReview
	secondReview.ObservationID = second["observationId"].(string)
	secondReview.SelectedNodeID = secondChild["nodeId"].(string)
	if _, err := service.saveReview(client.ID, sessionID, sessionToken, secondReview); err != nil {
		t.Fatal(err)
	}
	runner.mu.Lock()
	runner.snapshotErr = &inspector.RuntimeError{Code: "STALE_TARGET", Stage: "window"}
	runner.mu.Unlock()
	if _, err := service.observe(context.Background(), client.ID, sessionID, sessionToken, nil); err == nil {
		t.Fatal("stale target refresh unexpectedly succeeded")
	}
	status, err := service.sessionStatus(client.ID, sessionID, sessionToken)
	if err != nil {
		t.Fatal(err)
	}
	latest := status["latestObservation"].(map[string]any)
	if latest["freshness"] != "stale" || latest["staleReason"] != "STALE_TARGET" || status["hasReview"] != false {
		t.Fatalf("failed refresh state = %#v", status)
	}
	if _, err := service.saveReview(client.ID, sessionID, sessionToken, secondReview); !errors.Is(err, errInspectorPrecondition) {
		t.Fatalf("stale review save error = %v, want precondition", err)
	}
	if _, err := service.handoff(client.ID, sessionID, sessionToken); !errors.Is(err, errInspectorPrecondition) {
		t.Fatalf("stale handoff error = %v, want precondition", err)
	}
}

func TestInspectorTreeProjectionPreservesOrderAndEnforcesReadOnlyLimits(t *testing.T) {
	root := map[string]any{
		"role": "window", "nativeSubrole": "AXStandardWindow", "value": "root-secret", "unknown": "drop-me",
		"children": []any{
			map[string]any{"role": "group", "identifier": "first", "children": []any{
				map[string]any{"role": "button", "identifier": "deep", "value": "child-secret"},
			}},
			map[string]any{"role": "button", "identifier": "second"},
		},
	}
	state := inspectorTreeProjection{}
	projected := projectInspectorSnapshotNode(root, 0, inspector.Limits{MaxDepth: 1, MaxNodes: 10}, &state)
	if facts := safeSelectedElementFacts(projected); facts["nativeSubrole"] != "AXStandardWindow" {
		t.Fatalf("selected element facts lost nativeSubrole: %#v", facts)
	}
	children := projected["children"].([]any)
	if len(children) != 2 || children[0].(map[string]any)["identifier"] != "first" || children[1].(map[string]any)["identifier"] != "second" {
		t.Fatalf("projected child order = %#v", children)
	}
	if !state.Truncated || state.Reason != "controllerMaxDepth" || state.Nodes != 3 || state.MaxDepth != 1 {
		t.Fatalf("depth projection state = %#v", state)
	}
	encoded, _ := json.Marshal(projected)
	for _, forbidden := range []string{"root-secret", "child-secret", "drop-me", "\"value\"", "\"unknown\""} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("tree projection leaked %q: %s", forbidden, encoded)
		}
	}
	state = inspectorTreeProjection{}
	projected = projectInspectorSnapshotNode(root, 0, inspector.Limits{MaxDepth: 8, MaxNodes: 2}, &state)
	if !state.Truncated || state.Reason != "controllerMaxNodes" || state.Nodes != 2 || len(projected["children"].([]any)) != 1 {
		t.Fatalf("node projection state/tree = %#v %#v", state, projected)
	}
}

func TestInspectorObservationRuntimeErrorsKeepStructuredHTTPStates(t *testing.T) {
	for _, test := range []struct {
		code string
		want int
	}{
		{code: "PERMISSION_DENIED", want: stdhttp.StatusForbidden},
		{code: "STALE_TARGET", want: stdhttp.StatusConflict},
		{code: "TIMEOUT", want: stdhttp.StatusGatewayTimeout},
		{code: "CANCELED", want: stdhttp.StatusGatewayTimeout},
		{code: "BACKEND_FAILED", want: stdhttp.StatusServiceUnavailable},
	} {
		t.Run(test.code, func(t *testing.T) {
			runner := newInspectorFakeRunner()
			runner.snapshotErr = &inspector.RuntimeError{Code: test.code, Stage: "snapshot"}
			handler := newInspectorHTTPTestHandler(t, runner)
			pair := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
			token := inspectorDataString(t, pair, "token")
			auth := map[string]string{"Authorization": "Bearer " + token}
			windows := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodGet, "/windows", nil, auth)).([]any)
			created := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", map[string]any{
				"windowId": windows[0].(map[string]any)["windowId"],
			}, auth)).(map[string]any)
			sessionAuth := map[string]string{
				"Authorization":                "Bearer " + token,
				"X-OpenDesk-Inspector-Session": created["sessionToken"].(string),
			}
			response := inspectorDo(t, handler, stdhttp.MethodPost, "/sessions/"+created["sessionId"].(string)+"/observations", map[string]any{}, sessionAuth)
			if response.Code != test.want || !strings.Contains(response.Body.String(), test.code) {
				t.Fatalf("runtime error %s HTTP = %d %s, want %d", test.code, response.Code, response.Body.String(), test.want)
			}
		})
	}
}

func TestInspectorTTLConcurrencyLateResponseAndShutdown(t *testing.T) {
	runner := newInspectorFakeRunner()
	runner.blockSnapshot = make(chan struct{}, 1)
	runner.releaseSnapshot = make(chan struct{})
	runner.ignoreCancel = true
	service := newInspectorService(runner, t.TempDir())
	t.Cleanup(service.close)
	pair, err := service.pair(service.pairCode)
	if err != nil {
		t.Fatal(err)
	}
	client, err := service.authorize("Bearer " + pair["token"].(string))
	if err != nil {
		t.Fatal(err)
	}
	windows, err := service.listWindows(context.Background(), client.ID)
	if err != nil {
		t.Fatal(err)
	}
	session, err := service.createSession(client.ID, windows[0]["windowId"].(string), inspector.Limits{TimeoutMS: 1000, MaxDepth: 6, MaxNodes: 50})
	if err != nil {
		t.Fatal(err)
	}
	sessionID, sessionToken := session["sessionId"].(string), session["sessionToken"].(string)
	result := make(chan error, 1)
	go func() {
		_, err := service.observe(context.Background(), client.ID, sessionID, sessionToken, nil)
		result <- err
	}()
	<-runner.blockSnapshot
	if _, err := service.validate(context.Background(), client.ID, sessionID, sessionToken, inspector.Locator{Role: "button"}, nil); !errors.Is(err, errInspectorConflict) {
		t.Fatalf("concurrent validation error = %v, want conflict", err)
	}
	service.mu.Lock()
	service.sessions[sessionID].Generation++
	service.mu.Unlock()
	close(runner.releaseSnapshot)
	if err := <-result; err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("late observation error = %v, want stale", err)
	}
	service.mu.Lock()
	if stored := service.sessions[sessionID].Observation; stored != nil {
		t.Fatalf("late observation overwrote current scope: %#v", stored)
	}
	service.mu.Unlock()

	now := time.Now()
	service.now = func() time.Time { return now.Add(inspectorClientTTL + time.Second) }
	if _, err := service.authorize("Bearer " + pair["token"].(string)); !errors.Is(err, errInspectorExpired) {
		t.Fatalf("expired client authorize = %v", err)
	}
	service.cleanupExpired()
	service.mu.Lock()
	remaining := len(service.sessions)
	service.mu.Unlock()
	if remaining != 0 {
		t.Fatalf("expired client retained %d sessions", remaining)
	}

	cancelRunner := newInspectorFakeRunner()
	cancelRunner.blockSnapshot = make(chan struct{}, 1)
	cancelRunner.releaseSnapshot = make(chan struct{})
	cancelService := newInspectorService(cancelRunner, t.TempDir())
	pair, _ = cancelService.pair(cancelService.pairCode)
	client, _ = cancelService.authorize("Bearer " + pair["token"].(string))
	windows, _ = cancelService.listWindows(context.Background(), client.ID)
	session, _ = cancelService.createSession(client.ID, windows[0]["windowId"].(string), inspector.Limits{TimeoutMS: 1000, MaxDepth: 6, MaxNodes: 50})
	result = make(chan error, 1)
	go func() {
		_, err := cancelService.observe(context.Background(), client.ID, session["sessionId"].(string), session["sessionToken"].(string), nil)
		result <- err
	}()
	<-cancelRunner.blockSnapshot
	cancelService.close()
	if err := <-result; !errors.Is(err, context.Canceled) {
		t.Fatalf("shutdown observation error = %v, want canceled", err)
	}
}

func TestInspectorPairAndSessionExpiry(t *testing.T) {
	pairHandler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	pairHandler.inspector.now = func() time.Time { return pairHandler.inspector.pairExpiresAt.Add(time.Second) }
	if response := inspectorDo(t, pairHandler, stdhttp.MethodPost, "/pair", map[string]any{"code": pairHandler.inspector.pairCode}, nil); response.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("expired pair status = %d, want 401", response.Code)
	}

	handler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	pair := inspectorDo(t, handler, stdhttp.MethodPost, "/pair", map[string]any{"code": handler.inspector.pairCode}, nil)
	bearer := inspectorDataString(t, pair, "token")
	auth := map[string]string{"Authorization": "Bearer " + bearer}
	windows := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodGet, "/windows", nil, auth)).([]any)
	windowID := windows[0].(map[string]any)["windowId"].(string)
	created := inspectorEnvelopeData(t, inspectorDo(t, handler, stdhttp.MethodPost, "/sessions", map[string]any{
		"windowId": windowID, "limits": map[string]any{"timeout": 1000, "maxDepth": 6, "maxNodes": 50},
	}, auth)).(map[string]any)
	sessionID, sessionToken := created["sessionId"].(string), created["sessionToken"].(string)
	handler.inspector.mu.Lock()
	sessionExpiresAt := handler.inspector.sessions[sessionID].ExpiresAt
	handler.inspector.mu.Unlock()
	handler.inspector.now = func() time.Time { return sessionExpiresAt.Add(time.Second) }
	sessionAuth := map[string]string{
		"Authorization": "Bearer " + bearer, "X-OpenDesk-Inspector-Session": sessionToken,
	}
	if response := inspectorDo(t, handler, stdhttp.MethodGet, "/sessions/"+sessionID, nil, sessionAuth); response.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("expired session status = %d, want 401", response.Code)
	}

	bearerHandler := newInspectorHTTPTestHandler(t, newInspectorFakeRunner())
	pair = inspectorDo(t, bearerHandler, stdhttp.MethodPost, "/pair", map[string]any{"code": bearerHandler.inspector.pairCode}, nil)
	bearer = inspectorDataString(t, pair, "token")
	client, err := bearerHandler.inspector.authorize("Bearer " + bearer)
	if err != nil {
		t.Fatal(err)
	}
	bearerHandler.inspector.now = func() time.Time { return client.ExpiresAt.Add(time.Second) }
	if response := inspectorDo(t, bearerHandler, stdhttp.MethodGet, "/capabilities", nil, map[string]string{"Authorization": "Bearer " + bearer}); response.Code != stdhttp.StatusUnauthorized {
		t.Fatalf("expired bearer status = %d, want 401", response.Code)
	}
}

func newInspectorHTTPTestHandler(t *testing.T, runner inspector.Runner) *Handler {
	t.Helper()
	handler := &Handler{
		inspector:     newInspectorService(runner, t.TempDir()),
		inspectorHost: "127.0.0.1:60844",
	}
	t.Cleanup(handler.inspector.close)
	return handler
}

func inspectorHTTPRequest(t *testing.T, method, path string, body any) *stdhttp.Request {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, "http://127.0.0.1:60844"+inspectorAPIPrefix+path, reader)
	request.RemoteAddr = "127.0.0.1:41000"
	request.Host = "127.0.0.1:60844"
	request.Header.Set("X-OpenDesk-Inspector", "1")
	request.Header.Set("X-OpenDesk-Inspector-Client", "non-browser")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request
}

func inspectorDo(t *testing.T, handler *Handler, method, path string, body any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	request := inspectorHTTPRequest(t, method, path, body)
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response := httptest.NewRecorder()
	setupInspectorRoutes(handler).ServeHTTP(response, request)
	return response
}

func inspectorEnvelopeData(t *testing.T, response *httptest.ResponseRecorder) any {
	t.Helper()
	if response.Code != stdhttp.StatusOK {
		t.Fatalf("Inspector response status = %d: %s", response.Code, response.Body.String())
	}
	var envelope map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope["code"] != float64(0) {
		t.Fatalf("Inspector envelope = %#v", envelope)
	}
	return envelope["data"]
}

func inspectorDataString(t *testing.T, response *httptest.ResponseRecorder, key string) string {
	t.Helper()
	data := inspectorEnvelopeData(t, response).(map[string]any)
	value, ok := data[key].(string)
	if !ok || value == "" {
		t.Fatalf("Inspector data %s = %#v", key, data[key])
	}
	return value
}

func cloneMapForInspectorTest(t *testing.T, value map[string]any) map[string]any {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func locatorForInspectorTest(value map[string]any) inspector.Locator {
	result := inspector.Locator{}
	if role, ok := value["role"].(string); ok {
		result.Role = role
	}
	if name, ok := value["name"].(string); ok {
		result.Name = &name
	}
	if identifier, ok := value["identifier"].(string); ok {
		result.Identifier = &identifier
	}
	return result
}
