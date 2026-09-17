package productanalytics

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

type blockingProviderTransport struct {
	started chan struct{}
	once    sync.Once
}

func (t *blockingProviderTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	t.once.Do(func() { close(t.started) })
	<-request.Context().Done()
	return nil, request.Context().Err()
}

func TestPostHogProviderShutdownIsBounded(t *testing.T) {
	transport := &blockingProviderTransport{started: make(chan struct{})}
	provider, err := newPostHogProvider(Config{
		Provider: ProviderPostHog, Endpoint: "https://us.i.posthog.com", ProjectToken: "phc_bounded",
		Environment: "test", MaxQueueSize: 4, BatchSize: 1, MaxEnqueuedRequests: 1,
		RequestTimeout: 5 * time.Second, FlushInterval: time.Second, MaxRetries: 0, ShutdownTimeout: 150 * time.Millisecond,
	}, transport)
	if err != nil {
		t.Fatal(err)
	}
	eventID := randomID()
	if err := provider.Enqueue(Event{
		Name: "app_started", DistinctID: randomID(), EventID: eventID, OccurredAt: time.Now().UTC(),
		Properties: map[string]any{
			"schema_version": SchemaVersion, "event_id": eventID, "occurred_at": time.Now().UTC().Format(time.RFC3339Nano),
			"install_id": randomID(), "process_id": randomID(), "app_version": "2.0.1",
			"platform": "macos", "arch": "arm64", "environment": "test",
		},
	}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-transport.started:
	case <-time.After(time.Second):
		t.Fatal("PostHog upload did not start")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	startedAt := time.Now()
	_ = provider.Close(ctx, false)
	if elapsed := time.Since(startedAt); elapsed > time.Second {
		t.Fatalf("bounded shutdown took %s", elapsed)
	}
}

type alwaysFailProvider struct{}

func (alwaysFailProvider) Enqueue(Event) error                { return errors.New("synthetic provider failure") }
func (alwaysFailProvider) Disable()                           {}
func (alwaysFailProvider) Close(context.Context, bool) error { return nil }

func TestProviderFailureIsFailOpenForProductBusiness(t *testing.T) {
	service, err := New(Options{
		DataRoot: t.TempDir(),
		Config:   Config{Provider: ProviderPostHog, Endpoint: "https://us.i.posthog.com", ProjectToken: "phc_failure", Environment: "test"},
		Runtime:  RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		ProviderMaker: func(Config, http.RoundTripper) (Provider, error) {
			return alwaysFailProvider{}, nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	if service.ScreenViewed("flow_runner") {
		t.Fatal("failed provider unexpectedly accepted event")
	}
	status := service.Status()
	if status.DroppedEvents == 0 || status.LastErrorCode != "provider_enqueue_failed" {
		t.Fatalf("status=%+v", status)
	}
	// Product Analytics reports a local drop only; no provider error escapes
	// into the product operation itself.
}

func TestPostHogQueueRemainsBoundedUnderBlockedNetwork(t *testing.T) {
	transport := &blockingProviderTransport{started: make(chan struct{})}
	service, err := New(Options{
		DataRoot: t.TempDir(),
		Config: Config{
			Provider: ProviderPostHog, Endpoint: "https://us.i.posthog.com", ProjectToken: "phc_queue", Environment: "test",
			MaxQueueSize: 2, BatchSize: 1, MaxEnqueuedRequests: 1, RequestTimeout: 5 * time.Second,
			FlushInterval: time.Second, MaxRetries: 0, ShutdownTimeout: 150 * time.Millisecond,
		},
		Runtime:   RuntimeInfo{AppVersion: "2.0.1", Platform: "darwin", Arch: "arm64"},
		Transport: transport,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		service.UIAction("flow_runner", "flow.run", "pointer")
	}
	if service.Status().DroppedEvents == 0 {
		t.Fatal("blocked network never produced a bounded queue drop")
	}
	_, _ = service.SetConsent(false)
}
