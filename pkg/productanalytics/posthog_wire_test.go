package productanalytics

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

type capturedWireEvent struct {
	Event      string         `json:"event"`
	UUID       string         `json:"uuid"`
	DistinctID string         `json:"distinct_id"`
	Timestamp  time.Time      `json:"timestamp"`
	SessionID  string         `json:"session_id"`
	Options    map[string]any `json:"options"`
	Properties map[string]any `json:"properties"`
}

type postHogWireTransport struct {
	mu     sync.Mutex
	events []capturedWireEvent
}

func (t *postHogWireTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	body, err := io.ReadAll(request.Body)
	if err != nil {
		return nil, err
	}
	var batch struct {
		Batch []capturedWireEvent `json:"batch"`
	}
	if err := json.Unmarshal(body, &batch); err != nil {
		return nil, err
	}
	t.mu.Lock()
	t.events = append(t.events, batch.Batch...)
	t.mu.Unlock()
	results := make(map[string]map[string]string, len(batch.Batch))
	for _, event := range batch.Batch {
		results[event.UUID] = map[string]string{"result": "ok"}
	}
	responseBody, err := json.Marshal(map[string]any{"results": results})
	if err != nil {
		return nil, err
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Status:     "200 OK",
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(string(responseBody))),
		Request:    request,
	}, nil
}

func (t *postHogWireTransport) snapshot() []capturedWireEvent {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]capturedWireEvent(nil), t.events...)
}

func TestPostHogWirePayloadContainsOnlyClosedProductSchema(t *testing.T) {
	root := t.TempDir()
	installID := randomID()
	if err := writeConsent(root+"/analytics/consent.json", persistedConsent{
		SchemaVersion: SchemaVersion,
		State:         ConsentGranted,
		InstallID:     installID,
	}); err != nil {
		t.Fatal(err)
	}
	transport := &postHogWireTransport{}
	service, err := New(Options{
		DataRoot: root,
		Config: Config{
			Provider: ProviderPostHog, Endpoint: "https://us.i.posthog.com", ProjectToken: "phc_wire_test",
			Environment: "test", MaxEventBytes: 2048, MaxQueueSize: 32, BatchSize: 6,
			MaxEnqueuedRequests: 1, RequestTimeout: time.Second, FlushInterval: 10 * time.Second,
			MaxRetries: 0, ShutdownTimeout: 500 * time.Millisecond, SessionTimeout: 30 * time.Minute,
		},
		Runtime:   RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Transport: transport,
	})
	if err != nil {
		t.Fatal(err)
	}
	service.Start()
	if !service.ScreenViewed("flow_runner") {
		t.Fatal("screen_viewed rejected")
	}
	if !service.UIAction("flow_runner", "flow.run", "pointer") {
		t.Fatal("ui_action rejected")
	}
	runID := randomID()
	if !service.FlowRunStarted("installed", "foreground", runID) {
		t.Fatal("flow_run_started rejected")
	}
	if !service.FlowRunFinished(runID, "failure", "execution_failed") {
		t.Fatal("flow_run_finished rejected")
	}
	closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := service.Close(closeCtx); err != nil {
		t.Fatalf("close analytics service: %v", err)
	}

	events := transport.snapshot()
	if len(events) != 6 {
		t.Fatalf("wire event count=%d, want 6: %#v", len(events), events)
	}
	seen := map[string]int{}
	for _, event := range events {
		seen[event.Event]++
		if event.DistinctID != installID || event.UUID == "" || event.Timestamp.IsZero() {
			t.Fatalf("invalid wire identity for %s: %+v", event.Event, event)
		}
		for _, key := range []string{"schema_version", "event_id", "occurred_at", "install_id", "process_id", "app_version", "platform", "arch", "environment"} {
			if _, ok := event.Properties[key]; !ok {
				t.Fatalf("%s missing common property %q: %#v", event.Event, key, event.Properties)
			}
		}
		if event.Properties["install_id"] != installID {
			t.Fatalf("%s wire install_id mismatch: %#v", event.Event, event.Properties["install_id"])
		}
		allowed := map[string]bool{
			"schema_version": true, "event_id": true, "occurred_at": true, "install_id": true,
			"process_id": true, "session_id": true, "app_version": true, "platform": true,
			"arch": true, "environment": true, "$geoip_disable": true,
		}
		switch event.Event {
		case "screen_viewed":
			allowed["surface"] = true
		case "ui_action":
			allowed["surface"], allowed["action_id"], allowed["input_method"] = true, true, true
		case "flow_run_started":
			allowed["flow_origin"], allowed["run_source"], allowed["run_id"] = true, true, true
		case "flow_run_finished":
			allowed["flow_origin"], allowed["run_source"], allowed["run_id"] = true, true, true
			allowed["outcome"], allowed["error_code"], allowed["duration_bucket"] = true, true, true
		}
		for key := range event.Properties {
			if !allowed[key] {
				t.Fatalf("%s contains provider-added or unapproved property %q: %#v", event.Event, key, event.Properties)
			}
		}
		if event.Properties["$geoip_disable"] != true {
			t.Fatalf("%s must keep PostHog GeoIP disabled: %#v", event.Event, event.Properties)
		}
		if len(event.Options) != 1 || event.Options["process_person_profile"] != false {
			t.Fatalf("%s unexpected PostHog options: %#v", event.Event, event.Options)
		}
	}
	for _, name := range []string{"app_started", "app_session_started", "screen_viewed", "ui_action", "flow_run_started", "flow_run_finished"} {
		if seen[name] != 1 {
			t.Fatalf("wire event %s count=%d, want 1; seen=%v", name, seen[name], seen)
		}
	}

	encoded, err := json.Marshal(events)
	if err != nil {
		t.Fatal(err)
	}
	wire := strings.ToLower(string(encoded))
	for _, forbidden := range []string{
		"javascript source", "flow source", "secret-value", "token-value", "/users/private/",
		"clipboard-value", "ocr-value", "screenshot-value", "ai-conversation-value",
		"prompt-value", "raw-error-value", "private-flow-id", "private-flow-name",
		"$os", "$os_version", "$os_distro", "$go_version", "$lib", "$lib_version",
	} {
		if strings.Contains(wire, forbidden) {
			t.Fatalf("forbidden product data reached PostHog wire payload: %q", forbidden)
		}
	}
}

func TestInstallIDPersistsAcrossServiceRestart(t *testing.T) {
	root := t.TempDir()
	clock := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	service, err := New(Options{
		DataRoot: root,
		Config:   Config{Provider: ProviderDebug, Environment: "test"},
		Runtime:  RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Now:      func() time.Time { return clock },
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	persisted, err := readConsent(root + "/analytics/consent.json")
	if err != nil || !validID(persisted.InstallID) {
		t.Fatalf("persisted consent=%+v err=%v", persisted, err)
	}
	if err := service.Close(context.Background()); err != nil {
		t.Fatal(err)
	}

	restarted, err := New(Options{
		DataRoot: root,
		Config:   Config{Provider: ProviderDebug, Environment: "test"},
		Runtime:  RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Now:      func() time.Time { return clock },
	})
	if err != nil {
		t.Fatal(err)
	}
	restarted.Start()
	if !restarted.ScreenViewed("flow_runner") {
		t.Fatal("restarted service rejected screen event")
	}
	for _, event := range restarted.DebugEvents() {
		if event.DistinctID != persisted.InstallID {
			t.Fatalf("install id changed across restart: got %s want %s", event.DistinctID, persisted.InstallID)
		}
	}
}

type cancelAwareTransport struct {
	started chan struct{}
	once    sync.Once
}

func (t *cancelAwareTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	t.once.Do(func() { close(t.started) })
	<-request.Context().Done()
	return nil, request.Context().Err()
}

func TestGateTransportCancelsInflightRequestOnDisable(t *testing.T) {
	base := &cancelAwareTransport{started: make(chan struct{})}
	gate := newGateTransport(base)
	request, _ := http.NewRequest(http.MethodPost, "https://example.invalid/i/v1/analytics/events", strings.NewReader("{}"))
	done := make(chan error, 1)
	go func() {
		_, err := gate.RoundTrip(request)
		done <- err
	}()
	select {
	case <-base.started:
	case <-time.After(time.Second):
		t.Fatal("transport request did not start")
	}
	gate.Disable()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("in-flight request was not canceled")
		}
	case <-time.After(time.Second):
		t.Fatal("in-flight request did not stop after analytics disable")
	}
}

func TestTypedAPIRejectsRawPrivateIdentityInputs(t *testing.T) {
	clock := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	service, err := New(Options{
		DataRoot: t.TempDir(), Config: Config{Provider: ProviderDebug, Environment: "test"},
		Runtime: RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Now:     func() time.Time { return clock },
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	if service.ScreenViewed("/Users/private/script.js") {
		t.Fatal("raw path was accepted as a surface")
	}
	if service.UIAction("flow_runner", "private-flow-name", "pointer") {
		t.Fatal("raw private action identity was accepted")
	}
	if service.FlowRunStarted("private-flow-id", "foreground", randomID()) {
		t.Fatal("raw private flow identity was accepted")
	}
	if service.FlowRunFinished(randomID(), "unknown", "unknown") {
		t.Fatal("unknown is not a terminal outcome")
	}
}
