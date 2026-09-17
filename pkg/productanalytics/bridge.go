package productanalytics

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	LocalEndpointEnv  = "OPENDESK_APP_LOCAL_ENDPOINT"
	LocalTokenEnv     = "OPENDESK_APP_ANALYTICS_TOKEN"
	EnabledEnv        = "OPENDESK_APP_ANALYTICS_ENABLED"
	CaptureEnabledEnv = "OPENDESK_APP_ANALYTICS_CAPTURE_ENABLED"
	RunSourceEnv      = "OPENDESK_APP_ANALYTICS_RUN_SOURCE"
	DebugOverrideEnv  = "OPENDESK_ANALYTICS_DEBUG"
	LocalHeader       = "X-OpenDesk-Analytics-Token"
)

type localBridgeMessage struct {
	path string
	body []byte
}

// LocalBridge is a tiny first-party process bridge. It only talks to the
// primary App's existing loopback local-services listener; it is not a second
// analytics transport and never contacts PostHog directly.
type LocalBridge struct {
	endpoint string
	token    string
	source   string
	client   *http.Client
	queue    chan localBridgeMessage
	done     chan struct{}
	close    sync.Once
}

func NewLocalBridge(environment map[string]string) *LocalBridge {
	endpoint := strings.TrimSpace(environment[LocalEndpointEnv])
	token := strings.TrimSpace(environment[LocalTokenEnv])
	source := strings.ToLower(strings.TrimSpace(environment[RunSourceEnv]))
	if !validLocalEndpoint(endpoint) || !validBridgeToken(token) || !allowedRunSources[source] {
		return nil
	}
	bridge := &LocalBridge{
		endpoint: strings.TrimRight(endpoint, "/"),
		token:    token,
		source:   source,
		client:   &http.Client{Timeout: 750 * time.Millisecond},
		queue:    make(chan localBridgeMessage, 4),
		done:     make(chan struct{}),
	}
	go bridge.loop()
	return bridge
}

func (b *LocalBridge) Source() string {
	if b == nil {
		return ""
	}
	return b.source
}

func (b *LocalBridge) RunStarted(flowOrigin, runID string) bool {
	if b == nil || !allowedFlowOrigins[flowOrigin] || !validID(runID) {
		return false
	}
	return b.enqueue("/api/product/analytics/run/start", map[string]any{
		"flowOrigin": flowOrigin,
		"runSource":  b.source,
		"runId":      runID,
	})
}

func (b *LocalBridge) RunFinished(runID, outcome, errorCode string) bool {
	if b == nil || !validID(runID) || !allowedOutcomes[outcome] || !allowedErrorCodes[errorCode] {
		return false
	}
	if outcome == "success" || outcome == "cancelled" {
		errorCode = ""
	}
	return b.enqueue("/api/product/analytics/run/finish", map[string]any{
		"runId":     runID,
		"outcome":   outcome,
		"errorCode": errorCode,
	})
}

func (b *LocalBridge) enqueue(path string, value any) bool {
	if b == nil {
		return false
	}
	payload, err := json.Marshal(value)
	if err != nil || len(payload) > defaultMaxEventBytes {
		return false
	}
	select {
	case b.queue <- localBridgeMessage{path: path, body: payload}:
		return true
	default:
		// Analytics is fail-open. A saturated local bridge drops instead of
		// blocking or delaying the business execution.
		return false
	}
}

func (b *LocalBridge) loop() {
	defer close(b.done)
	for message := range b.queue {
		request, err := http.NewRequest(http.MethodPost, b.endpoint+message.path, bytes.NewReader(message.body))
		if err != nil {
			continue
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set(LocalHeader, b.token)
		response, err := b.client.Do(request)
		if err != nil {
			continue
		}
		_ = response.Body.Close()
	}
}

func (b *LocalBridge) Close(ctx context.Context) {
	if b == nil {
		return
	}
	b.close.Do(func() { close(b.queue) })
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-b.done:
	case <-ctx.Done():
	}
}

func StripPrivateEnvironment(values map[string]string) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		result[key] = value
	}
	delete(result, LocalTokenEnv)
	delete(result, EnabledEnv)
	delete(result, CaptureEnabledEnv)
	delete(result, RunSourceEnv)
	delete(result, DebugOverrideEnv)
	return result
}

func validLocalEndpoint(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path != "" || parsed.Port() == "" {
		return false
	}
	host := strings.TrimSpace(parsed.Hostname())
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func validBridgeToken(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
			return false
		}
	}
	return true
}
