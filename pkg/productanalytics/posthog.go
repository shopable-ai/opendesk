package productanalytics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	posthog "github.com/posthog/posthog-go"
)

var errAnalyticsTransportDisabled = errors.New("product analytics transport disabled")

const postHogMaximumWireBytes = 512 * 1024

// postHogPrivacyTransport is the final Product Analytics privacy gate.
//
// posthog-go deliberately enriches CaptureModeAnalyticsV1 events with host
// runtime metadata such as $os, $os_version and $go_version after OpenDesk has
// validated its own typed event. OpenDesk's V1 contract is stricter: those
// provider-added dimensions are not part of the product schema. Keep the
// official SDK for batching/retry/shutdown, but scrub SDK-owned enrichment from
// the final JSON body before it reaches the network. $geoip_disable is retained
// because it is a processing-control sentinel, not product telemetry.
type postHogPrivacyTransport struct {
	base http.RoundTripper
}

func newPostHogPrivacyTransport(base http.RoundTripper) *postHogPrivacyTransport {
	if base == nil {
		if defaults, ok := http.DefaultTransport.(*http.Transport); ok {
			base = defaults.Clone()
		} else {
			base = http.DefaultTransport
		}
	}
	return &postHogPrivacyTransport{base: base}
}

func (t *postHogPrivacyTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if t == nil || t.base == nil {
		return nil, errors.New("product analytics privacy transport unavailable")
	}
	if request == nil || request.URL == nil || request.URL.Path != "/i/v1/analytics/events" {
		return t.base.RoundTrip(request)
	}
	if request.Body == nil {
		return nil, errors.New("product analytics PostHog request body is missing")
	}

	body, err := io.ReadAll(io.LimitReader(request.Body, postHogMaximumWireBytes+1))
	closeErr := request.Body.Close()
	if err != nil {
		return nil, fmt.Errorf("read product analytics PostHog body: %w", err)
	}
	if closeErr != nil {
		return nil, fmt.Errorf("close product analytics PostHog body: %w", closeErr)
	}
	if len(body) == 0 || len(body) > postHogMaximumWireBytes {
		return nil, errors.New("product analytics PostHog body exceeds privacy bound")
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("decode product analytics PostHog body: %w", err)
	}
	batch, ok := payload["batch"].([]any)
	if !ok || len(batch) == 0 {
		return nil, errors.New("product analytics PostHog batch is invalid")
	}
	for _, rawEvent := range batch {
		event, ok := rawEvent.(map[string]any)
		if !ok {
			return nil, errors.New("product analytics PostHog event is invalid")
		}
		properties, ok := event["properties"].(map[string]any)
		if !ok {
			return nil, errors.New("product analytics PostHog properties are invalid")
		}
		for key := range properties {
			if strings.HasPrefix(key, "$") && key != "$geoip_disable" {
				delete(properties, key)
			}
		}
		if value, exists := properties["$geoip_disable"]; !exists || value != true {
			return nil, errors.New("product analytics PostHog GeoIP privacy guard is missing")
		}
	}

	scrubbed, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode product analytics PostHog body: %w", err)
	}
	next := request.Clone(request.Context())
	next.Body = io.NopCloser(bytes.NewReader(scrubbed))
	next.ContentLength = int64(len(scrubbed))
	next.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(scrubbed)), nil
	}
	next.Header.Del("Content-Length")
	return t.base.RoundTrip(next)
}

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
	privacy := newPostHogPrivacyTransport(transport)
	gate := newGateTransport(privacy)
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
		Compression:         posthog.CompressionNone,
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
