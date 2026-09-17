package productanalytics

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

type fakeProvider struct {
	mu       sync.Mutex
	events   []Event
	disabled bool
	closed   bool
}

func (p *fakeProvider) Enqueue(event Event) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.disabled || p.closed {
		return errors.New("closed")
	}
	p.events = append(p.events, event)
	return nil
}
func (p *fakeProvider) Disable() { p.mu.Lock(); p.disabled = true; p.mu.Unlock() }
func (p *fakeProvider) Close(context.Context, bool) error {
	p.mu.Lock()
	p.closed = true
	p.mu.Unlock()
	return nil
}
func (p *fakeProvider) snapshot() []Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]Event(nil), p.events...)
}

func testService(t *testing.T, clock *time.Time, provider **fakeProvider) *Service {
	t.Helper()
	service, err := New(Options{
		DataRoot: t.TempDir(),
		Config:   Config{Provider: ProviderPostHog, Endpoint: "https://us.i.posthog.com", ProjectToken: "phc_test", Environment: "test", MaxEventBytes: 2048, MaxQueueSize: 1000, BatchSize: 20, MaxEnqueuedRequests: 4, RequestTimeout: 3 * time.Second, FlushInterval: 5 * time.Second, MaxRetries: 1, ShutdownTimeout: 750 * time.Millisecond, SessionTimeout: 30 * time.Minute},
		Runtime:  RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Now:      func() time.Time { return *clock },
		ProviderMaker: func(Config, http.RoundTripper) (Provider, error) {
			created := &fakeProvider{}
			*provider = created
			return created, nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func names(events []Event) []string {
	out := make([]string, len(events))
	for i, event := range events {
		out[i] = event.Name
	}
	return out
}

func TestConsentDefaultsClosedAndDoesNotReplayHistory(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	var provider *fakeProvider
	service := testService(t, &now, &provider)
	service.Start()
	if service.ScreenViewed("flow_runner") {
		t.Fatal("screen should be rejected before consent")
	}
	if service.UIAction("flow_runner", "flow.run", "pointer") {
		t.Fatal("action should be rejected before consent")
	}
	status := service.Status()
	if status.Consent != ConsentUnknown || status.InstallIDSet || status.CaptureEnabled {
		t.Fatalf("unexpected pre-consent status: %+v", status)
	}
	if provider != nil {
		t.Fatal("provider must not be created before consent")
	}

	status, err := service.SetConsent(true)
	if err != nil {
		t.Fatal(err)
	}
	if !status.CaptureEnabled || !status.InstallIDSet {
		t.Fatalf("expected enabled status: %+v", status)
	}
	if provider == nil {
		t.Fatal("provider was not created")
	}
	if got := len(provider.snapshot()); got != 0 {
		t.Fatalf("grant must not backfill history or app_started, got %d events", got)
	}

	if !service.ScreenViewed("flow_runner") {
		t.Fatal("screen was not accepted after consent")
	}
	events := provider.snapshot()
	if len(events) != 2 || events[0].Name != "app_session_started" || events[1].Name != "screen_viewed" {
		t.Fatalf("unexpected post-consent events: %v", names(events))
	}
}

func TestExistingConsentEmitsOneAppStartedPerServiceStart(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	root := t.TempDir()
	if err := writeConsent(root+"/analytics/consent.json", persistedConsent{SchemaVersion: 1, State: ConsentGranted, InstallID: randomID()}); err != nil {
		t.Fatal(err)
	}
	provider := &fakeProvider{}
	service, err := New(Options{
		DataRoot:      root,
		Config:        Config{Provider: ProviderPostHog, Endpoint: "https://eu.i.posthog.com", ProjectToken: "phc_test", Environment: "test", MaxEventBytes: 2048, MaxQueueSize: 1000, BatchSize: 20, MaxEnqueuedRequests: 4, RequestTimeout: 3 * time.Second, FlushInterval: 5 * time.Second, MaxRetries: 1, ShutdownTimeout: 750 * time.Millisecond, SessionTimeout: 30 * time.Minute},
		Runtime:       RuntimeInfo{AppVersion: "2.0.1", Platform: "windows", Arch: "amd64"},
		Now:           func() time.Time { return now },
		ProviderMaker: func(Config, http.RoundTripper) (Provider, error) { return provider, nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	service.Start()
	service.Start()
	events := provider.snapshot()
	if len(events) != 1 || events[0].Name != "app_started" {
		t.Fatalf("expected one app_started, got %v", names(events))
	}
	if events[0].Properties["platform"] != "windows" {
		t.Fatalf("platform not normalized: %#v", events[0].Properties["platform"])
	}
}

func TestTenLogicalClicksProduceTenUIActionsWithoutExtraSessions(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	var provider *fakeProvider
	service := testService(t, &now, &provider)
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10; i++ {
		if !service.UIAction("flow_runner", "flow.run", "pointer") {
			t.Fatalf("click %d rejected", i)
		}
		now = now.Add(time.Second)
	}
	events := provider.snapshot()
	uiCount, sessionCount := 0, 0
	for _, event := range events {
		if event.Name == "ui_action" {
			uiCount++
		}
		if event.Name == "app_session_started" {
			sessionCount++
		}
	}
	if uiCount != 10 || sessionCount != 1 {
		t.Fatalf("ui=%d sessions=%d events=%v", uiCount, sessionCount, names(events))
	}
}

func TestFlowFinishedRequiresTrustedStartedRunAndPreservesOutcome(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	var provider *fakeProvider
	service := testService(t, &now, &provider)
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	unknownRun := randomID()
	if service.FlowRunFinished(unknownRun, "success", "") {
		t.Fatal("finish without start must be rejected")
	}
	runID := randomID()
	if !service.FlowRunStarted("local", "foreground", runID) {
		t.Fatal("run start rejected")
	}
	now = now.Add(7 * time.Second)
	if !service.FlowRunFinished(runID, "failure", "execution_failed") {
		t.Fatal("run finish rejected")
	}
	if service.FlowRunFinished(runID, "success", "") {
		t.Fatal("duplicate finish must be rejected")
	}

	events := provider.snapshot()
	var finished *Event
	for i := range events {
		if events[i].Name == "flow_run_finished" {
			finished = &events[i]
		}
	}
	if finished == nil {
		t.Fatal("missing flow_run_finished")
	}
	if finished.Properties["outcome"] != "failure" || finished.Properties["error_code"] != "execution_failed" {
		t.Fatalf("unexpected finish properties: %#v", finished.Properties)
	}
	if finished.Properties["duration_bucket"] != "5_30s" {
		t.Fatalf("unexpected duration bucket: %#v", finished.Properties["duration_bucket"])
	}
}

func TestWithdrawClosesGateClearsIdentityAndStopsNewEvents(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	var provider *fakeProvider
	service := testService(t, &now, &provider)
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	if !service.UIAction("flow_runner", "flow.run", "pointer") {
		t.Fatal("initial action rejected")
	}
	before := len(provider.snapshot())
	status, err := service.SetConsent(false)
	if err != nil {
		t.Fatal(err)
	}
	if status.Consent != ConsentDenied || status.CaptureEnabled || status.InstallIDSet || status.DebugEvents != 0 {
		t.Fatalf("unexpected disabled status: %+v", status)
	}
	if service.UIAction("flow_runner", "flow.run", "pointer") {
		t.Fatal("post-withdraw action accepted")
	}
	if got := len(provider.snapshot()); got != before {
		t.Fatalf("post-withdraw event leaked: before=%d after=%d", before, got)
	}
	provider.mu.Lock()
	disabled, closed := provider.disabled, provider.closed
	provider.mu.Unlock()
	if !disabled || !closed {
		t.Fatalf("provider not disabled/closed: disabled=%v closed=%v", disabled, closed)
	}
}

func TestSessionExpiresAfterThirtyMinutesAndBackgroundDoesNotExtendIt(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	var provider *fakeProvider
	service := testService(t, &now, &provider)
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	service.ScreenViewed("flow_runner")
	now = now.Add(29 * time.Minute)
	service.FlowRunStarted("local", "background", randomID())
	now = now.Add(2 * time.Minute)
	service.UIAction("flow_runner", "flow.list", "pointer")
	sessions := 0
	for _, event := range provider.snapshot() {
		if event.Name == "app_session_started" {
			sessions++
		}
	}
	if sessions != 2 {
		t.Fatalf("expected background run not to extend session, got %d sessions", sessions)
	}
}

func TestDebugProviderNeverBuffersBeforeConsentAndIsBounded(t *testing.T) {
	now := time.Date(2026, 9, 18, 0, 0, 0, 0, time.UTC)
	service, err := New(Options{
		DataRoot: t.TempDir(), Config: Config{Provider: ProviderDebug, Environment: "test"},
		Runtime: RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Now:     func() time.Time { return now }, DebugCapacity: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	service.UIAction("flow_runner", "flow.run", "pointer")
	if len(service.DebugEvents()) != 0 {
		t.Fatal("debug must stay empty without consent")
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		service.UIAction("flow_runner", "flow.run", "pointer")
	}
	if got := len(service.DebugEvents()); got != 3 {
		t.Fatalf("debug ring size=%d", got)
	}
	if service.Status().DroppedEvents == 0 {
		t.Fatal("bounded debug ring should account for dropped oldest events")
	}
}

type countingTransport struct {
	mu    sync.Mutex
	calls int
	block chan struct{}
}

func (t *countingTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	t.mu.Lock()
	t.calls++
	t.mu.Unlock()
	if t.block != nil {
		select {
		case <-request.Context().Done():
			return nil, request.Context().Err()
		case <-t.block:
		}
	}
	return nil, errors.New("synthetic transport")
}
func (t *countingTransport) count() int { t.mu.Lock(); defer t.mu.Unlock(); return t.calls }

func TestGateTransportRejectsAllRequestsAfterDisable(t *testing.T) {
	base := &countingTransport{}
	gate := newGateTransport(base)
	gate.Disable()
	req, _ := http.NewRequest(http.MethodPost, "https://example.invalid/batch", nil)
	if _, err := gate.RoundTrip(req); !errors.Is(err, errAnalyticsTransportDisabled) {
		t.Fatalf("unexpected gate error: %v", err)
	}
	if base.count() != 0 {
		t.Fatalf("disabled gate reached network %d times", base.count())
	}
}
