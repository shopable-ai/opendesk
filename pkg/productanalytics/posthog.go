package productanalytics

import (
	"context"
	"errors"
	"net/http"
	"sync"

	posthog "github.com/posthog/posthog-go"
)

var errAnalyticsTransportDisabled = errors.New("product analytics transport disabled")

type gateTransport struct {
	base http.RoundTripper
	mu   sync.Mutex

	enabled  bool
	nextID   uint64
	inFlight map[uint64]context.CancelFunc
}

func newGateTransport(base http.RoundTripper) *gateTransport {
	if base == nil {
		if defaults, ok := http.DefaultTransport.(*http.Transport); ok {
			base = defaults.Clone()
		} else {
			base = http.DefaultTransport
		}
	}
	return &gateTransport{base: base, enabled: true, inFlight: map[uint64]context.CancelFunc{}}
}

func (g *gateTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	g.mu.Lock()
	if !g.enabled {
		g.mu.Unlock()
		return nil, errAnalyticsTransportDisabled
	}
	g.nextID++
	id := g.nextID
	ctx, cancel := context.WithCancel(request.Context())
	g.inFlight[id] = cancel
	g.mu.Unlock()

	defer func() {
		g.mu.Lock()
		delete(g.inFlight, id)
		g.mu.Unlock()
		cancel()
	}()
	return g.base.RoundTrip(request.Clone(ctx))
}

func (g *gateTransport) Disable() {
	g.mu.Lock()
	if !g.enabled {
		g.mu.Unlock()
		return
	}
	g.enabled = false
	cancels := make([]context.CancelFunc, 0, len(g.inFlight))
	for _, cancel := range g.inFlight {
		cancels = append(cancels, cancel)
	}
	g.mu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
}

type silentPostHogLogger struct{}

func (silentPostHogLogger) Debugf(string, ...interface{}) {}
func (silentPostHogLogger) Logf(string, ...interface{})   {}
func (silentPostHogLogger) Warnf(string, ...interface{})  {}
func (silentPostHogLogger) Errorf(string, ...interface{}) {}

type postHogProvider struct {
	client posthog.Client
	gate   *gateTransport
}

func newPostHogProvider(config Config, transport http.RoundTripper) (Provider, error) {
	gate := newGateTransport(transport)
	maxRetries := config.MaxRetries
	client, err := posthog.NewWithConfig(config.ProjectToken, posthog.Config{
		Endpoint:            config.Endpoint,
		DisableGeoIP:        posthog.Ptr(true),
		IsServer:            posthog.Ptr(false),
		Interval:            config.FlushInterval,
		Transport:           gate,
		Logger:              silentPostHogLogger{},
		BatchSize:           config.BatchSize,
		MaxQueueSize:        config.MaxQueueSize,
		MaxRetries:          &maxRetries,
		ShutdownTimeout:     config.ShutdownTimeout,
		BatchUploadTimeout:  config.RequestTimeout,
		BatchSubmitTimeout:  -1, // never block the caller when upload workers are saturated
		MaxEnqueuedRequests: config.MaxEnqueuedRequests,
		CaptureMode:         posthog.CaptureModeAnalyticsV1,
	})
	if err != nil {
		gate.Disable()
		return nil, err
	}
	return &postHogProvider{client: client, gate: gate}, nil
}

func (p *postHogProvider) Enqueue(event Event) error {
	if p == nil || p.client == nil {
		return errors.New("posthog provider unavailable")
	}
	properties := posthog.NewProperties()
	for key, value := range event.Properties {
		properties[key] = value
	}
	// Keep PostHog person profiles disabled. The project token is a public
	// capture credential only; no Identify/Alias or feature-flag APIs are used.
	properties["$process_person_profile"] = false
	return p.client.Enqueue(posthog.Capture{
		Uuid:       event.EventID,
		DistinctId: event.DistinctID,
		Event:      event.Name,
		Timestamp:  event.OccurredAt,
		Properties: properties,
	})
}

func (p *postHogProvider) Disable() {
	if p != nil && p.gate != nil {
		p.gate.Disable()
	}
}

func (p *postHogProvider) Close(ctx context.Context, discard bool) error {
	if p == nil || p.client == nil {
		return nil
	}
	// The upstream SDK flushes on Close. For consent withdrawal, close the
	// transport gate before invoking CloseWithContext so queue draining and SDK
	// retries cannot start another network request. On ordinary granted exit we
	// permit only the caller-provided bounded flush, then close the gate.
	if discard {
		p.Disable()
	}
	if ctx == nil {
		ctx = context.Background()
	}
	err := p.client.CloseWithContext(ctx)
	if !discard {
		p.Disable()
	}
	return err
}
