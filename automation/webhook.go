package automation

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/dop251/goja"
)

const (
	webhookDefaultMaxRequestBytes   = 1 << 20
	webhookAbsoluteMaxRequestBytes  = 16 << 20
	webhookDefaultMaxResponseBytes  = 1 << 20
	webhookAbsoluteMaxResponseBytes = 16 << 20
	webhookDefaultMaxQueuedRequests = 32
	webhookAbsoluteMaxQueuedRequests = 256
	webhookDefaultMaxQueuedBytes    = 8 << 20
	webhookAbsoluteMaxQueuedBytes   = 64 << 20
	webhookDefaultHandlerTimeout    = 30 * time.Second
	webhookMaxHandlerTimeout        = 10 * time.Minute
	webhookDefaultDedupeWindow      = 5 * time.Minute
	webhookMaxDedupeWindow          = time.Hour
	webhookDefaultMaxDedupeEntries = 256
	webhookAbsoluteMaxDedupeEntries = 4096
	webhookMaxHeaderValueBytes      = 256
)

const (
	webhookSourceHeader   = "X-OpenDesk-Source"
	webhookDeliveryHeader = "X-OpenDesk-Delivery-Id"
)

type webhookLimits struct {
	maxRequestBytes   int
	maxResponseBytes  int
	maxQueuedRequests int
	maxQueuedBytes    int
	handlerTimeout    time.Duration
	dedupeWindow      time.Duration
	maxDedupeEntries  int
}

type webhookHTTPResult struct {
	status    int
	body      []byte
	requestID string
}

type webhookHTTPWaiter struct {
	ch chan webhookHTTPResult
}

type webhookRequestState uint8

const (
	webhookRequestQueued webhookRequestState = iota + 1
	webhookRequestActive
	webhookRequestDone
)

type localWebhookRequest struct {
	requestID  string
	source     string
	deliveryID string
	receivedAt time.Time
	body       interface{}
	bodyBytes  int
	bodyHash   [32]byte
	state      webhookRequestState
	listener   *localWebhookListener
	dedupeKey  string

	waiters map[*webhookHTTPWaiter]struct{}

	cancelResolve  func(interface{}) error
	cancelReason   string
}

type webhookDedupeRecord struct {
	hash      [32]byte
	request   *localWebhookRequest
	result    *webhookHTTPResult
	expiresAt time.Time
}

type webhookNextWaiter struct {
	resolve func(interface{}) error
	reject  func(interface{}) error
}

type localWebhookListener struct {
	id      string
	name    string
	path    string
	token   string
	address string
	limits  webhookLimits
	closed  bool

	queue       []*localWebhookRequest
	queuedBytes int
	active      *localWebhookRequest
	next        *webhookNextWaiter
	dedupe      map[string]*webhookDedupeRecord
}

type webhookServerGeneration struct {
	id       uint64
	listener net.Listener
	server   *http.Server
	stop     chan struct{}
	stopOnce sync.Once
	address  string
}

type localWebhookHost struct {
	owner *HTTPClient

	mu         sync.Mutex
	nextServer uint64
	server     *webhookServerGeneration
	listeners  map[string]*localWebhookListener
	byName     map[string]string
	byPath     map[string]string
}

var localWebhookHosts sync.Map // map[*HTTPClient]*localWebhookHost

// Webhook is a public facade, but its transport is deliberately attached to
// HTTPClient's existing execution-owned network lifecycle. These methods are
// captured by polyfills/009-webhook.js and removed from the normal public http
// surface; Webhook.listen is the only supported user entrypoint.
func init() {
	typ := reflect.TypeOf((*HTTPClient)(nil))
	jsMethodAllowlist[typ] = append(jsMethodAllowlist[typ],
		"WebhookOpen",
		"WebhookHeaders",
		"WebhookNext",
		"WebhookRespond",
		"WebhookClose",
	)
}

func (h *HTTPClient) webhookAvailable() error {
	if h == nil || h.runtime == nil || h.loop == nil {
		return fmt.Errorf("WEBHOOK_UNAVAILABLE: Webhook requires an event-loop-owned Runtime")
	}
	// P0 reuses the existing host-owned local-side-effect gate rather than
	// creating a JavaScript-controlled permission. Trusted local script/AI
	// entrypoints enable native downloads; HTTP/MCP/Scheduler entrypoints do not.
	// This is intentionally not configurable from Webhook.listen options.
	if !h.downloadsOK {
		return fmt.Errorf("WEBHOOK_DISABLED: local Webhook registration is disabled for this Runtime entrypoint")
	}
	if h.context != nil && h.context.Err() != nil {
		return fmt.Errorf("WEBHOOK_CANCELED: execution is closing")
	}
	return nil
}

func webhookHostFor(h *HTTPClient) *localWebhookHost {
	if existing, ok := localWebhookHosts.Load(h); ok {
		return existing.(*localWebhookHost)
	}
	host := &localWebhookHost{
		owner:     h,
		listeners: make(map[string]*localWebhookListener),
		byName:    make(map[string]string),
		byPath:    make(map[string]string),
	}
	actual, _ := localWebhookHosts.LoadOrStore(h, host)
	return actual.(*localWebhookHost)
}

// WebhookOpen is internal transport for Webhook.listen. JavaScript calls it
// only through the public polyfill.
func (h *HTTPClient) WebhookOpen(name string, options map[string]interface{}) (map[string]interface{}, error) {
	if err := h.webhookAvailable(); err != nil {
		return nil, err
	}
	name, err := normalizeWebhookName(name)
	if err != nil {
		return nil, err
	}
	limits, err := parseWebhookLimits(options)
	if err != nil {
		return nil, err
	}
	id, err := randomWebhookID(16)
	if err != nil {
		return nil, fmt.Errorf("WEBHOOK_INTERNAL: generate listener id: %w", err)
	}
	pathID, err := randomWebhookID(24)
	if err != nil {
		return nil, fmt.Errorf("WEBHOOK_INTERNAL: generate listener path: %w", err)
	}
	token, err := randomWebhookToken()
	if err != nil {
		return nil, fmt.Errorf("WEBHOOK_INTERNAL: generate listener credential: %w", err)
	}

	host := webhookHostFor(h)
	host.mu.Lock()
	if _, exists := host.byName[name]; exists {
		host.mu.Unlock()
		return nil, fmt.Errorf("WEBHOOK_NAME_CONFLICT: listener %q is already registered in this execution", name)
	}
	generation, err := host.ensureServerLocked()
	if err != nil {
		host.mu.Unlock()
		return nil, err
	}
	listener := &localWebhookListener{
		id:      id,
		name:    name,
		path:    "/v1/webhook/" + pathID,
		token:   token,
		address: generation.address,
		limits:  limits,
		dedupe:  make(map[string]*webhookDedupeRecord),
	}
	host.listeners[id] = listener
	host.byName[name] = id
	host.byPath[listener.path] = id
	host.mu.Unlock()

	return map[string]interface{}{
		"id":   id,
		"name": name,
		"url":  "http://" + generation.address + listener.path,
	}, nil
}

// WebhookHeaders returns a fresh auth header map. The token is deliberately not
// exposed as a handle property, command argument, URL query, or log field.
func (h *HTTPClient) WebhookHeaders(id string) (map[string]string, error) {
	if err := h.webhookAvailable(); err != nil {
		return nil, err
	}
	host := webhookHostFor(h)
	host.mu.Lock()
	defer host.mu.Unlock()
	listener := host.listeners[id]
	if listener == nil || listener.closed {
		return nil, fmt.Errorf("WEBHOOK_CLOSED: listener is closed")
	}
	return map[string]string{
		"Authorization": "Bearer " + listener.token,
		"Content-Type":  "application/json",
	}, nil
}

// WebhookNext is an internal pull bridge. It is what makes the HTTP transport
// hand pure Go data back to JavaScript on the owning EventLoop without ever
// invoking Goja from an HTTP goroutine.
func (h *HTTPClient) WebhookNext(id string) (goja.Value, error) {
	if h == nil || h.runtime == nil || h.loop == nil {
		return nil, fmt.Errorf("WEBHOOK_UNAVAILABLE: Webhook requires an event-loop-owned Runtime")
	}
	host := webhookHostFor(h)
	promise, resolve, reject := h.runtime.NewPromise()
	value := h.runtime.ToValue(promise)

	host.mu.Lock()
	listener := host.listeners[id]
	if listener == nil {
		host.mu.Unlock()
		_ = reject(h.runtime.NewGoError(fmt.Errorf("WEBHOOK_CLOSED: listener is closed")))
		return value, nil
	}
	if listener.closed {
		host.mu.Unlock()
		_ = resolve(nil)
		return value, nil
	}
	if listener.next != nil {
		host.mu.Unlock()
		_ = reject(h.runtime.NewGoError(fmt.Errorf("WEBHOOK_INTERNAL: only one pending receive is allowed per listener")))
		return value, nil
	}
	if listener.active != nil {
		host.mu.Unlock()
		_ = reject(h.runtime.NewGoError(fmt.Errorf("WEBHOOK_INTERNAL: previous handler result has not completed")))
		return value, nil
	}
	listener.next = &webhookNextWaiter{resolve: resolve, reject: reject}
	host.mu.Unlock()
	host.dispatchOnLoop(id)
	return value, nil
}

// WebhookRespond completes the currently dispatched request. It never starts
// another request before the JavaScript handler (including a returned Promise)
// has settled and the public polyfill reaches this method.
func (h *HTTPClient) WebhookRespond(id, requestID string, envelope map[string]interface{}) error {
	if h == nil || h.runtime == nil || h.loop == nil {
		return fmt.Errorf("WEBHOOK_UNAVAILABLE: Webhook requires an event-loop-owned Runtime")
	}
	host := webhookHostFor(h)

	host.mu.Lock()
	listener := host.listeners[id]
	if listener == nil || listener.active == nil || listener.active.requestID != requestID {
		host.mu.Unlock()
		return fmt.Errorf("WEBHOOK_REQUEST_UNKNOWN: request is not the active request for this listener")
	}
	request := listener.active
	limit := listener.limits.maxResponseBytes
	host.mu.Unlock()

	result := buildWebhookHandlerResult(requestID, envelope, limit)

	host.mu.Lock()
	listener = host.listeners[id]
	if listener == nil || listener.active != request {
		host.mu.Unlock()
		return fmt.Errorf("WEBHOOK_REQUEST_UNKNOWN: request is no longer active")
	}
	listener.active = nil
	request.state = webhookRequestDone
	request.cancelResolve = nil
	if request.dedupeKey != "" {
		if record := listener.dedupe[request.dedupeKey]; record != nil && record.request == request {
			copyResult := result
			record.result = &copyResult
			record.request = nil
			record.expiresAt = time.Now().Add(listener.limits.dedupeWindow)
		}
	}
	waiters := make([]*webhookHTTPWaiter, 0, len(request.waiters))
	for waiter := range request.waiters {
		waiters = append(waiters, waiter)
	}
	request.waiters = nil
	closed := listener.closed
	if closed {
		delete(host.listeners, listener.id)
	}
	host.mu.Unlock()

	for _, waiter := range waiters {
		select {
		case waiter.ch <- result:
		default:
		}
	}
	if !closed {
		host.dispatchOnLoop(id)
	}
	return nil
}

// WebhookClose is idempotent. New calls are revoked before it returns. Queued
// work is rejected as not-started; an already-dispatched handler may finish.
func (h *HTTPClient) WebhookClose(id string) error {
	if h == nil {
		return nil
	}
	host := webhookHostFor(h)
	host.closeListener(id, "LISTENER_CLOSED_NOT_STARTED")
	return nil
}

func (host *localWebhookHost) ensureServerLocked() (*webhookServerGeneration, error) {
	if host.server != nil {
		return host.server, nil
	}
	if host.owner == nil || host.owner.context == nil || host.owner.context.Err() != nil {
		return nil, fmt.Errorf("WEBHOOK_CANCELED: execution is closing")
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return nil, fmt.Errorf("WEBHOOK_LISTEN_FAILED: bind loopback listener: %w", err)
	}
	host.nextServer++
	generation := &webhookServerGeneration{
		id:       host.nextServer,
		listener: listener,
		stop:     make(chan struct{}),
		address:  listener.Addr().String(),
	}
	generation.server = &http.Server{
		Handler:           host,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	host.server = generation

	host.owner.workers.start()
	go host.serve(generation)
	host.owner.workers.start()
	go host.watch(generation)
	return generation, nil
}

func (host *localWebhookHost) serve(generation *webhookServerGeneration) {
	defer host.owner.workers.done()
	err := generation.server.Serve(generation.listener)
	if err == nil || errors.Is(err, http.ErrServerClosed) || errors.Is(err, net.ErrClosed) {
		return
	}
	if host.owner.context != nil && host.owner.context.Err() != nil {
		return
	}
	host.failGeneration(generation, "WEBHOOK_SERVER_FAILED")
}

func (host *localWebhookHost) watch(generation *webhookServerGeneration) {
	defer host.owner.workers.done()
	select {
	case <-host.owner.context.Done():
		host.cancelExecution(generation)
	case <-generation.stop:
	}
}

func (host *localWebhookHost) stopGenerationLocked(generation *webhookServerGeneration) {
	if generation == nil {
		return
	}
	if host.server == generation {
		host.server = nil
	}
	generation.stopOnce.Do(func() { close(generation.stop) })
	_ = generation.listener.Close()
}

func (host *localWebhookHost) cancelExecution(generation *webhookServerGeneration) {
	host.mu.Lock()
	ids := make([]string, 0, len(host.listeners))
	for id := range host.listeners {
		ids = append(ids, id)
	}
	for _, id := range ids {
		host.closeListenerLocked(id, "EXECUTION_CANCELED_NOT_STARTED", true)
	}
	if host.server == generation {
		host.stopGenerationLocked(generation)
	}
	host.mu.Unlock()
	_ = generation.server.Close()
	localWebhookHosts.Delete(host.owner)
	for _, id := range ids {
		host.scheduleListenerState(id)
	}
}

func (host *localWebhookHost) failGeneration(generation *webhookServerGeneration, code string) {
	host.mu.Lock()
	ids := make([]string, 0, len(host.listeners))
	for id, listener := range host.listeners {
		if listener.address == generation.address {
			ids = append(ids, id)
			host.closeListenerLocked(id, code+"_NOT_STARTED", true)
		}
	}
	if host.server == generation {
		host.stopGenerationLocked(generation)
	}
	host.mu.Unlock()
	for _, id := range ids {
		host.scheduleListenerState(id)
	}
}

func (host *localWebhookHost) closeListener(id, queuedCode string) {
	host.mu.Lock()
	listener := host.listeners[id]
	if listener == nil || listener.closed {
		host.mu.Unlock()
		return
	}
	host.closeListenerLocked(id, queuedCode, false)
	stopServer := len(host.byPath) == 0
	generation := host.server
	if stopServer {
		host.stopGenerationLocked(generation)
	}
	host.mu.Unlock()
	host.scheduleListenerState(id)
}

func (host *localWebhookHost) closeListenerLocked(id, queuedCode string, cancelActive bool) {
	listener := host.listeners[id]
	if listener == nil || listener.closed {
		return
	}
	listener.closed = true
	delete(host.byName, listener.name)
	delete(host.byPath, listener.path)

	queued := listener.queue
	listener.queue = nil
	listener.queuedBytes = 0
	for _, request := range queued {
		request.state = webhookRequestDone
		if request.dedupeKey != "" {
			delete(listener.dedupe, request.dedupeKey)
		}
		result := webhookErrorResult(503, queuedCode, request.requestID)
		for waiter := range request.waiters {
			select {
			case waiter.ch <- result:
			default:
			}
		}
		request.waiters = nil
	}
	if cancelActive && listener.active != nil {
		listener.active.cancelReason = "execution_canceled"
	}
	if listener.active == nil && listener.next == nil {
		delete(host.listeners, listener.id)
	}
}

func (host *localWebhookHost) scheduleListenerState(id string) {
	if host.owner == nil || host.owner.loop == nil {
		return
	}
	host.owner.loop.RunOnLoop(func(*goja.Runtime) {
		host.mu.Lock()
		listener := host.listeners[id]
		if listener == nil {
			host.mu.Unlock()
			return
		}
		var next *webhookNextWaiter
		if listener.closed && listener.next != nil {
			next = listener.next
			listener.next = nil
		}
		var cancel func(interface{}) error
		var reason string
		if listener.active != nil && listener.active.cancelReason != "" && listener.active.cancelResolve != nil {
			cancel = listener.active.cancelResolve
			listener.active.cancelResolve = nil
			reason = listener.active.cancelReason
		}
		if listener.closed && listener.active == nil && listener.next == nil {
			delete(host.listeners, listener.id)
		}
		host.mu.Unlock()
		if next != nil {
			_ = next.resolve(nil)
		}
		if cancel != nil {
			_ = cancel(reason)
		}
	})
}

func (host *localWebhookHost) dispatchOnLoop(id string) {
	if host.owner == nil || host.owner.loop == nil {
		return
	}
	host.owner.loop.RunOnLoop(func(*goja.Runtime) { host.dispatch(id) })
}

func (host *localWebhookHost) dispatch(id string) {
	host.mu.Lock()
	listener := host.listeners[id]
	if listener == nil {
		host.mu.Unlock()
		return
	}
	if listener.closed {
		next := listener.next
		listener.next = nil
		if listener.active == nil {
			delete(host.listeners, id)
		}
		host.mu.Unlock()
		if next != nil {
			_ = next.resolve(nil)
		}
		return
	}
	if listener.active != nil || listener.next == nil || len(listener.queue) == 0 {
		host.mu.Unlock()
		return
	}
	request := listener.queue[0]
	listener.queue = listener.queue[1:]
	listener.queuedBytes -= request.bodyBytes
	if listener.queuedBytes < 0 {
		listener.queuedBytes = 0
	}
	listener.active = request
	request.state = webhookRequestActive
	next := listener.next
	listener.next = nil

	cancelPromise, cancelResolve, _ := host.owner.runtime.NewPromise()
	request.cancelResolve = cancelResolve
	cancelReason := request.cancelReason
	payload := host.owner.runtime.NewObject()
	_ = payload.Set("requestId", request.requestID)
	_ = payload.Set("source", request.source)
	if request.deliveryID == "" {
		_ = payload.Set("deliveryId", nil)
	} else {
		_ = payload.Set("deliveryId", request.deliveryID)
	}
	_ = payload.Set("receivedAt", request.receivedAt.UTC().Format(time.RFC3339Nano))
	_ = payload.Set("body", request.body)
	_ = payload.Set("canceled", cancelPromise)
	host.mu.Unlock()

	if cancelReason != "" {
		_ = cancelResolve(cancelReason)
	}
	if err := next.resolve(payload); err != nil {
		host.failActiveDispatch(id, request, err)
	}
}

func (host *localWebhookHost) failActiveDispatch(id string, request *localWebhookRequest, cause error) {
	host.mu.Lock()
	listener := host.listeners[id]
	if listener == nil || listener.active != request {
		host.mu.Unlock()
		return
	}
	listener.active = nil
	request.state = webhookRequestDone
	if request.dedupeKey != "" {
		delete(listener.dedupe, request.dedupeKey)
	}
	waiters := make([]*webhookHTTPWaiter, 0, len(request.waiters))
	for waiter := range request.waiters {
		waiters = append(waiters, waiter)
	}
	request.waiters = nil
	closed := listener.closed
	host.mu.Unlock()
	result := webhookErrorResult(500, "HANDLER_DISPATCH_FAILED", request.requestID)
	for _, waiter := range waiters {
		select {
		case waiter.ch <- result:
		default:
		}
	}
	if !closed {
		host.dispatchOnLoop(id)
	}
	_ = cause
}

func (host *localWebhookHost) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if host.owner == nil || host.owner.workers == nil {
		writeWebhookError(w, 503, "WEBHOOK_UNAVAILABLE", "")
		return
	}
	host.owner.workers.start()
	defer host.owner.workers.done()

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if !webhookLoopbackRemote(r.RemoteAddr) {
		writeWebhookError(w, 403, "SOURCE_NOT_LOOPBACK", "")
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeWebhookError(w, 405, "METHOD_NOT_ALLOWED", "")
		return
	}
	if strings.TrimSpace(r.Header.Get("Origin")) != "" {
		writeWebhookError(w, 403, "BROWSER_ORIGIN_DENIED", "")
		return
	}

	host.mu.Lock()
	listenerID := host.byPath[r.URL.Path]
	listener := host.listeners[listenerID]
	if listener == nil || listener.closed {
		host.mu.Unlock()
		writeWebhookError(w, 404, "WEBHOOK_NOT_FOUND", "")
		return
	}
	address := listener.address
	token := listener.token
	limits := listener.limits
	host.mu.Unlock()

	if r.Host != address {
		writeWebhookError(w, 400, "HOST_MISMATCH", "")
		return
	}
	expectedAuth := []byte("Bearer " + token)
	actualAuth := []byte(r.Header.Get("Authorization"))
	if len(actualAuth) != len(expectedAuth) || subtle.ConstantTimeCompare(actualAuth, expectedAuth) != 1 {
		writeWebhookError(w, 401, "AUTHENTICATION_FAILED", "")
		return
	}
	encoding := strings.TrimSpace(r.Header.Get("Content-Encoding"))
	if encoding != "" && !strings.EqualFold(encoding, "identity") {
		writeWebhookError(w, 415, "CONTENT_ENCODING_UNSUPPORTED", "")
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.EqualFold(mediaType, "application/json") {
		writeWebhookError(w, 415, "CONTENT_TYPE_UNSUPPORTED", "")
		return
	}
	if r.ContentLength > int64(limits.maxRequestBytes) {
		writeWebhookError(w, 413, "REQUEST_BODY_TOO_LARGE", "")
		return
	}

	raw, err := io.ReadAll(io.LimitReader(r.Body, int64(limits.maxRequestBytes)+1))
	if err != nil {
		writeWebhookError(w, 400, "REQUEST_BODY_READ_FAILED", "")
		return
	}
	if len(raw) == 0 {
		writeWebhookError(w, 400, "REQUEST_BODY_MISSING", "")
		return
	}
	if len(raw) > limits.maxRequestBytes {
		writeWebhookError(w, 413, "REQUEST_BODY_TOO_LARGE", "")
		return
	}
	var body interface{}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if err := decoder.Decode(&body); err != nil {
		writeWebhookError(w, 400, "INVALID_JSON", "")
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeWebhookError(w, 400, "INVALID_JSON", "")
		return
	}
	canonical, err := json.Marshal(body)
	if err != nil {
		writeWebhookError(w, 400, "INVALID_JSON", "")
		return
	}
	source, err := normalizeWebhookHeader(r.Header.Get(webhookSourceHeader), "external", 128)
	if err != nil {
		writeWebhookError(w, 400, "SOURCE_INVALID", "")
		return
	}
	deliveryID, err := normalizeWebhookHeader(r.Header.Get(webhookDeliveryHeader), "", webhookMaxHeaderValueBytes)
	if err != nil {
		writeWebhookError(w, 400, "DELIVERY_ID_INVALID", "")
		return
	}

	request, waiter, immediate := host.enqueue(listenerID, body, canonical, source, deliveryID)
	if immediate != nil {
		writeWebhookResult(w, *immediate)
		return
	}
	if request == nil || waiter == nil {
		writeWebhookError(w, 503, "WEBHOOK_UNAVAILABLE", "")
		return
	}

	timer := time.NewTimer(limits.handlerTimeout)
	defer timer.Stop()
	select {
	case result := <-waiter.ch:
		writeWebhookResult(w, result)
	case <-r.Context().Done():
		host.abandonWaiter(request, waiter, "client_disconnected")
	case <-host.owner.context.Done():
		host.abandonWaiter(request, waiter, "execution_canceled")
		writeWebhookError(w, 503, "EXECUTION_CANCELED", request.requestID)
	case <-timer.C:
		notStarted := host.abandonWaiter(request, waiter, "handler_wait_timeout")
		if notStarted {
			writeWebhookError(w, 504, "REQUEST_EXPIRED_NOT_STARTED", request.requestID)
		} else {
			writeWebhookError(w, 504, "RESULT_UNKNOWN", request.requestID)
		}
	}
}

func (host *localWebhookHost) enqueue(listenerID string, body interface{}, canonical []byte, source, deliveryID string) (*localWebhookRequest, *webhookHTTPWaiter, *webhookHTTPResult) {
	requestID, err := randomWebhookID(16)
	if err != nil {
		result := webhookErrorResult(500, "WEBHOOK_INTERNAL", "")
		return nil, nil, &result
	}
	hash := sha256.Sum256(canonical)
	waiter := &webhookHTTPWaiter{ch: make(chan webhookHTTPResult, 1)}
	now := time.Now()

	host.mu.Lock()
	listener := host.listeners[listenerID]
	if listener == nil || listener.closed {
		host.mu.Unlock()
		result := webhookErrorResult(404, "WEBHOOK_NOT_FOUND", requestID)
		return nil, nil, &result
	}
	purgeWebhookDedupeLocked(listener, now)

	dedupeKey := ""
	if deliveryID != "" {
		dedupeKey = source + "\x00" + deliveryID
		if record := listener.dedupe[dedupeKey]; record != nil {
			if record.hash != hash {
				host.mu.Unlock()
				result := webhookErrorResult(409, "DELIVERY_ID_CONFLICT", requestID)
				return nil, nil, &result
			}
			if record.result != nil {
				result := *record.result
				host.mu.Unlock()
				return nil, nil, &result
			}
			if record.request == nil {
				host.mu.Unlock()
				result := webhookErrorResult(503, "DEDUPE_RECORD_INCONSISTENT", requestID)
				return nil, nil, &result
			}
			record.request.waiters[waiter] = struct{}{}
			request := record.request
			host.mu.Unlock()
			return request, waiter, nil
		}
		if len(listener.dedupe) >= listener.limits.maxDedupeEntries {
			host.mu.Unlock()
			result := webhookErrorResult(429, "DEDUPE_CAPACITY", requestID)
			return nil, nil, &result
		}
	}
	if len(listener.queue) >= listener.limits.maxQueuedRequests || listener.queuedBytes+len(canonical) > listener.limits.maxQueuedBytes {
		host.mu.Unlock()
		result := webhookErrorResult(429, "WEBHOOK_QUEUE_FULL", requestID)
		return nil, nil, &result
	}

	request := &localWebhookRequest{
		requestID:  requestID,
		source:     source,
		deliveryID: deliveryID,
		receivedAt: now.UTC(),
		body:       body,
		bodyBytes:  len(canonical),
		bodyHash:   hash,
		state:      webhookRequestQueued,
		listener:   listener,
		dedupeKey:  dedupeKey,
		waiters:    map[*webhookHTTPWaiter]struct{}{waiter: {}},
	}
	listener.queue = append(listener.queue, request)
	listener.queuedBytes += len(canonical)
	if dedupeKey != "" {
		listener.dedupe[dedupeKey] = &webhookDedupeRecord{hash: hash, request: request}
	}
	host.mu.Unlock()
	host.dispatchOnLoop(listenerID)
	return request, waiter, nil
}

func (host *localWebhookHost) abandonWaiter(request *localWebhookRequest, waiter *webhookHTTPWaiter, reason string) bool {
	if request == nil || waiter == nil || request.listener == nil {
		return false
	}
	listenerID := request.listener.id
	host.mu.Lock()
	listener := host.listeners[listenerID]
	if listener == nil {
		host.mu.Unlock()
		return request.state == webhookRequestQueued
	}
	delete(request.waiters, waiter)
	notStarted := request.state == webhookRequestQueued
	if notStarted && len(request.waiters) == 0 {
		for index, queued := range listener.queue {
			if queued == request {
				listener.queue = append(listener.queue[:index], listener.queue[index+1:]...)
				listener.queuedBytes -= request.bodyBytes
				if listener.queuedBytes < 0 {
					listener.queuedBytes = 0
				}
				break
			}
		}
		request.state = webhookRequestDone
		if request.dedupeKey != "" {
			if record := listener.dedupe[request.dedupeKey]; record != nil && record.request == request {
				delete(listener.dedupe, request.dedupeKey)
			}
		}
	}
	if request.state == webhookRequestActive && len(request.waiters) == 0 {
		request.cancelReason = reason
	}
	host.mu.Unlock()
	if request.state == webhookRequestActive {
		host.scheduleListenerState(listenerID)
	}
	return notStarted
}

func purgeWebhookDedupeLocked(listener *localWebhookListener, now time.Time) {
	for key, record := range listener.dedupe {
		if record != nil && record.result != nil && !record.expiresAt.IsZero() && !now.Before(record.expiresAt) {
			delete(listener.dedupe, key)
		}
	}
}

func buildWebhookHandlerResult(requestID string, envelope map[string]interface{}, maxBytes int) webhookHTTPResult {
	if envelope == nil {
		return webhookErrorResult(500, "HANDLER_RESULT_INVALID", requestID)
	}
	kind, _ := envelope["kind"].(string)
	switch kind {
	case "handlerError":
		return webhookErrorResult(500, "HANDLER_FAILED", requestID)
	case "invalid":
		return webhookErrorResult(500, "HANDLER_RESULT_INVALID", requestID)
	case "result":
	default:
		return webhookErrorResult(500, "HANDLER_RESULT_INVALID", requestID)
	}
	status, ok := webhookInteger(envelope["status"])
	if !ok || status < 200 || status > 599 {
		return webhookErrorResult(500, "HANDLER_STATUS_INVALID", requestID)
	}
	body := envelope["body"]
	encoded, err := json.Marshal(body)
	if err != nil {
		return webhookErrorResult(500, "HANDLER_BODY_INVALID", requestID)
	}
	if len(encoded) > maxBytes {
		return webhookErrorResult(500, "HANDLER_RESPONSE_TOO_LARGE", requestID)
	}
	return webhookHTTPResult{status: status, body: encoded, requestID: requestID}
}

func webhookInteger(value interface{}) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), int64(int(typed)) == typed
	case float64:
		integer := int(typed)
		return integer, float64(integer) == typed
	case json.Number:
		parsed, err := typed.Int64()
		return int(parsed), err == nil && int64(int(parsed)) == parsed
	default:
		return 0, false
	}
}

func webhookErrorResult(status int, code, requestID string) webhookHTTPResult {
	body, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{
			"code":      code,
			"requestId": nullableWebhookRequestID(requestID),
		},
	})
	return webhookHTTPResult{status: status, body: body, requestID: requestID}
}

func nullableWebhookRequestID(requestID string) interface{} {
	if requestID == "" {
		return nil
	}
	return requestID
}

func writeWebhookResult(w http.ResponseWriter, result webhookHTTPResult) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if result.requestID != "" {
		w.Header().Set("X-OpenDesk-Request-Id", result.requestID)
	}
	w.WriteHeader(result.status)
	_, _ = w.Write(result.body)
}

func writeWebhookError(w http.ResponseWriter, status int, code, requestID string) {
	writeWebhookResult(w, webhookErrorResult(status, code, requestID))
}

func parseWebhookLimits(options map[string]interface{}) (webhookLimits, error) {
	limits := webhookLimits{
		maxRequestBytes:   webhookDefaultMaxRequestBytes,
		maxResponseBytes:  webhookDefaultMaxResponseBytes,
		maxQueuedRequests: webhookDefaultMaxQueuedRequests,
		maxQueuedBytes:    webhookDefaultMaxQueuedBytes,
		handlerTimeout:    webhookDefaultHandlerTimeout,
		dedupeWindow:      webhookDefaultDedupeWindow,
		maxDedupeEntries:  webhookDefaultMaxDedupeEntries,
	}
	allowed := map[string]bool{
		"maxRequestBytes": true, "maxResponseBytes": true, "maxQueuedRequests": true,
		"maxQueuedBytes": true, "handlerTimeoutMs": true, "dedupeWindowMs": true,
		"maxDedupeEntries": true,
	}
	for key := range options {
		if !allowed[key] {
			return limits, fmt.Errorf("WEBHOOK_INVALID_OPTION: unsupported option %q", key)
		}
	}
	var err error
	if limits.maxRequestBytes, err = webhookOptionInt(options, "maxRequestBytes", limits.maxRequestBytes, 1, webhookAbsoluteMaxRequestBytes); err != nil {
		return limits, err
	}
	if limits.maxResponseBytes, err = webhookOptionInt(options, "maxResponseBytes", limits.maxResponseBytes, 1, webhookAbsoluteMaxResponseBytes); err != nil {
		return limits, err
	}
	if limits.maxQueuedRequests, err = webhookOptionInt(options, "maxQueuedRequests", limits.maxQueuedRequests, 1, webhookAbsoluteMaxQueuedRequests); err != nil {
		return limits, err
	}
	if limits.maxQueuedBytes, err = webhookOptionInt(options, "maxQueuedBytes", limits.maxQueuedBytes, 1, webhookAbsoluteMaxQueuedBytes); err != nil {
		return limits, err
	}
	handlerTimeoutMs, err := webhookOptionInt(options, "handlerTimeoutMs", int(limits.handlerTimeout/time.Millisecond), 100, int(webhookMaxHandlerTimeout/time.Millisecond))
	if err != nil {
		return limits, err
	}
	limits.handlerTimeout = time.Duration(handlerTimeoutMs) * time.Millisecond
	dedupeWindowMs, err := webhookOptionInt(options, "dedupeWindowMs", int(limits.dedupeWindow/time.Millisecond), 1000, int(webhookMaxDedupeWindow/time.Millisecond))
	if err != nil {
		return limits, err
	}
	limits.dedupeWindow = time.Duration(dedupeWindowMs) * time.Millisecond
	if limits.maxDedupeEntries, err = webhookOptionInt(options, "maxDedupeEntries", limits.maxDedupeEntries, 1, webhookAbsoluteMaxDedupeEntries); err != nil {
		return limits, err
	}
	if limits.maxQueuedBytes < limits.maxRequestBytes {
		return limits, fmt.Errorf("WEBHOOK_INVALID_OPTION: maxQueuedBytes must be at least maxRequestBytes")
	}
	return limits, nil
}

func webhookOptionInt(options map[string]interface{}, key string, fallback, minimum, maximum int) (int, error) {
	value, exists := options[key]
	if !exists || value == nil {
		return fallback, nil
	}
	integer, ok := webhookInteger(value)
	if !ok || integer < minimum || integer > maximum {
		return 0, fmt.Errorf("WEBHOOK_INVALID_OPTION: %s must be an integer in %d..%d", key, minimum, maximum)
	}
	return integer, nil
}

func normalizeWebhookName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 128 || !utf8.ValidString(name) {
		return "", fmt.Errorf("WEBHOOK_INVALID_NAME: name must be valid UTF-8 and 1..128 bytes")
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f || r == '/' || r == '\\' {
			return "", fmt.Errorf("WEBHOOK_INVALID_NAME: name contains unsupported control or path characters")
		}
	}
	return name, nil
}

func normalizeWebhookHeader(value, fallback string, maximum int) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	if len(value) > maximum || !utf8.ValidString(value) {
		return "", fmt.Errorf("invalid header value")
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return "", fmt.Errorf("invalid header value")
		}
	}
	return value, nil
}

func webhookLoopbackRemote(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func randomWebhookID(bytesCount int) (string, error) {
	buffer := make([]byte, bytesCount)
	if _, err := io.ReadFull(rand.Reader, buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func randomWebhookToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, buffer); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buffer), nil
}
