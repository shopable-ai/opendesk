package automation

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
	"sync/atomic"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

const (
	defaultHTTPRequestTimeout  = 30 * time.Second
	defaultHTTPResponseBodyMax = int64(10 << 20)
)

// HTTPClient is the native bridge below the documented axios polyfill. The
// runtime field is accessed only on its event-loop owner goroutine. A network
// worker receives an immutable Go request payload and returns to JavaScript
// exclusively through EventLoop.RunOnLoop.
type HTTPClient struct {
	runtime      *goja.Runtime
	client       *http.Client
	context      context.Context
	loop         *eventloop.EventLoop
	onAsyncError func(error)
	bodyLimit    int64

	workers *httpWorkers
	nextID  uint64 // event-loop owner only
	pending map[uint64]pendingHTTPRequest
}

type httpWorkers struct {
	wg     sync.WaitGroup
	active atomic.Int64
}

func (w *httpWorkers) start() {
	w.active.Add(1)
	w.wg.Add(1)
}

func (w *httpWorkers) done() {
	w.active.Add(-1)
	w.wg.Done()
}

type httpRequest struct {
	context context.Context
	cancel  context.CancelFunc
	method  string
	url     string
	headers http.Header
	body    []byte
}

type pendingHTTPRequest struct {
	cancel  context.CancelFunc
	resolve func(interface{}) error
	reject  func(interface{}) error
	cleanup func()
}

type httpResponse struct {
	data       interface{}
	status     int
	statusText string
	headers    http.Header
}

// NewHTTPClient is retained for direct, synchronous unit use. Production
// executions must use NewHTTPClientWithOptions with an event loop.
func NewHTTPClient(runtime *goja.Runtime) *HTTPClient {
	return NewHTTPClientWithOptions(runtime, context.Background(), nil, nil)
}

func NewHTTPClientWithOptions(runtime *goja.Runtime, ctx context.Context, loop *eventloop.EventLoop, onAsyncError func(error)) *HTTPClient {
	if ctx == nil {
		ctx = context.Background()
	}
	return &HTTPClient{
		runtime:      runtime,
		client:       &http.Client{},
		context:      ctx,
		loop:         loop,
		onAsyncError: onAsyncError,
		bodyLimit:    defaultHTTPResponseBodyMax,
		workers:      &httpWorkers{},
		pending:      make(map[uint64]pendingHTTPRequest),
	}
}

// Request is exported to JavaScript as http.request(options). It accepts the
// Axios-compatible timeout (milliseconds) and optional AbortSignal-compatible
// signal fields in addition to method, url, headers and data.
func (h *HTTPClient) Request(options *goja.Object) (goja.Value, error) {
	request, cleanup, err := h.requestFromOptions(options)
	if err != nil {
		return nil, err
	}
	if h.loop == nil {
		defer requestCancel(request)
		defer cleanup()
		response, err := performHTTPRequest(h.client, h.bodyLimit, request)
		if err != nil {
			return nil, err
		}
		return h.toValue(response), nil
	}
	return h.doAsync(request, cleanup)
}

// Get is exported to JavaScript as http.get(url, options?).
func (h *HTTPClient) Get(url string, options *goja.Object) (goja.Value, error) {
	if options == nil {
		options = h.runtime.NewObject()
	}
	must(options.Set("method", http.MethodGet))
	must(options.Set("url", url))
	return h.Request(options)
}

// Post is exported to JavaScript as http.post(url, data, options?).
func (h *HTTPClient) Post(url string, data interface{}, options *goja.Object) (goja.Value, error) {
	if options == nil {
		options = h.runtime.NewObject()
	}
	must(options.Set("method", http.MethodPost))
	must(options.Set("url", url))
	must(options.Set("data", data))
	return h.Request(options)
}

func (h *HTTPClient) requestFromOptions(options *goja.Object) (httpRequest, func(), error) {
	if options == nil {
		return httpRequest{}, nil, fmt.Errorf("options is required")
	}
	request := httpRequest{
		method:  toStringHTTP(options.Get("method"), http.MethodGet),
		url:     toStringHTTP(options.Get("url"), ""),
		headers: make(http.Header),
	}
	if request.url == "" {
		return httpRequest{}, nil, fmt.Errorf("url is required")
	}
	request.headers.Set("User-Agent", "Mozilla/5.0 (Clawdesk Runtime HTTP)")

	if data := options.Get("data"); data != nil && !goja.IsUndefined(data) && !goja.IsNull(data) {
		switch value := data.Export().(type) {
		case string:
			request.body = []byte(value)
			if strings.Contains(value, "=") && !strings.Contains(value, "{") {
				request.headers.Set("Content-Type", "application/x-www-form-urlencoded")
			} else {
				request.headers.Set("Content-Type", "text/plain")
			}
		default:
			body, err := json.Marshal(value)
			if err != nil {
				return httpRequest{}, nil, fmt.Errorf("failed to marshal request data: %w", err)
			}
			request.body = body
			request.headers.Set("Content-Type", "application/json")
		}
	}
	if headerObject := options.Get("headers"); headerObject != nil && !goja.IsUndefined(headerObject) && !goja.IsNull(headerObject) {
		headers := headerObject.ToObject(h.runtime)
		if headers != nil {
			for _, key := range headers.Keys() {
				request.headers.Set(key, headers.Get(key).String())
			}
		}
	}

	ctx, cancel := h.requestContext(options.Get("timeout"))
	request.context = ctx
	request.cancel = cancel
	cleanup := h.bindAbortSignal(options.Get("signal"), cancel)
	return request, func() {
		cleanup()
		cancel()
	}, nil
}

func (h *HTTPClient) requestContext(timeoutValue goja.Value) (context.Context, context.CancelFunc) {
	timeout := defaultHTTPRequestTimeout
	if timeoutValue != nil && !goja.IsUndefined(timeoutValue) && !goja.IsNull(timeoutValue) {
		milliseconds := timeoutValue.ToInteger()
		if milliseconds <= 0 {
			return context.WithCancel(h.context)
		}
		const maxMilliseconds = int64((24 * time.Hour) / time.Millisecond)
		if milliseconds > maxMilliseconds {
			milliseconds = maxMilliseconds
		}
		timeout = time.Duration(milliseconds) * time.Millisecond
	}
	return context.WithTimeout(h.context, timeout)
}

// bindAbortSignal registers one Go cancellation function while the runtime is
// on its owner goroutine. The callback itself only invokes context.CancelFunc;
// it does not use Goja, so the network worker receives no JS values.
func (h *HTTPClient) bindAbortSignal(value goja.Value, cancel context.CancelFunc) func() {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return func() {}
	}
	signal := value.ToObject(h.runtime)
	if signal == nil {
		return func() {}
	}
	if signal.Get("aborted").ToBoolean() {
		cancel()
		return func() {}
	}
	listener := h.runtime.ToValue(func(goja.FunctionCall) goja.Value {
		cancel()
		return goja.Undefined()
	})
	if add, ok := goja.AssertFunction(signal.Get("addEventListener")); ok {
		if _, err := add(signal, h.runtime.ToValue("abort"), listener); err == nil {
			return func() {
				if remove, ok := goja.AssertFunction(signal.Get("removeEventListener")); ok {
					_, _ = remove(signal, h.runtime.ToValue("abort"), listener)
				}
			}
		}
	}
	// The fallback retains compatibility with signal-like objects that expose
	// only onabort. The documented AbortController uses event listeners.
	previous := signal.Get("onabort")
	must(signal.Set("onabort", listener))
	return func() { must(signal.Set("onabort", previous)) }
}

func (h *HTTPClient) doAsync(request httpRequest, cleanup func()) (goja.Value, error) {
	promise, resolve, reject := h.runtime.NewPromise()
	h.nextID++
	id := h.nextID
	h.pending[id] = pendingHTTPRequest{cancel: requestCancelFunc(request), resolve: resolve, reject: reject, cleanup: cleanup}

	client := h.client
	limit := h.bodyLimit
	loop := h.loop
	workers := h.workers
	workers.start()
	go func(request httpRequest, requestID uint64) {
		defer workers.done()
		response, requestErr := performHTTPRequest(client, limit, request)
		// The closure is queued only; all Goja conversion and Promise settlement
		// happen inside finishRequest on the event-loop owner goroutine.
		loop.RunOnLoop(func(runtime *goja.Runtime) {
			h.finishRequest(runtime, requestID, response, requestErr)
		})
	}(request, id)
	return h.runtime.ToValue(promise), nil
}

func (h *HTTPClient) finishRequest(runtime *goja.Runtime, id uint64, response httpResponse, requestErr error) {
	pending, exists := h.pending[id]
	if !exists {
		return
	}
	delete(h.pending, id)
	pending.cleanup()
	if requestErr != nil {
		if err := pending.reject(runtime.NewGoError(requestErr)); err != nil {
			h.reportAsyncError(err)
		}
		return
	}
	if err := pending.resolve(h.toValue(response)); err != nil {
		h.reportAsyncError(err)
	}
}

func performHTTPRequest(client *http.Client, bodyLimit int64, request httpRequest) (httpResponse, error) {
	req, err := http.NewRequestWithContext(request.context, request.method, request.url, bytes.NewReader(request.body))
	if err != nil {
		return httpResponse{}, fmt.Errorf("HTTP request configuration error: %w", err)
	}
	req.Header = request.headers.Clone()
	response, err := client.Do(req)
	if err != nil {
		return httpResponse{}, normalizeHTTPError(request.context, err)
	}
	defer response.Body.Close()
	if bodyLimit <= 0 {
		bodyLimit = defaultHTTPResponseBodyMax
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, bodyLimit+1))
	if err != nil {
		return httpResponse{}, normalizeHTTPError(request.context, err)
	}
	if int64(len(body)) > bodyLimit {
		return httpResponse{}, fmt.Errorf("HTTP response body exceeds configured limit of %d bytes", bodyLimit)
	}
	var data interface{}
	if err := json.Unmarshal(body, &data); err != nil {
		data = string(body)
	}
	return httpResponse{data: data, status: response.StatusCode, statusText: response.Status, headers: response.Header.Clone()}, nil
}

func normalizeHTTPError(ctx context.Context, err error) error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("HTTP request timed out: %w", ctx.Err())
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return fmt.Errorf("HTTP request canceled: %w", ctx.Err())
	}
	return fmt.Errorf("HTTP request failed: %w", err)
}

func (h *HTTPClient) toValue(response httpResponse) goja.Value {
	value := h.runtime.NewObject()
	must(value.Set("data", response.data))
	must(value.Set("status", response.status))
	must(value.Set("statusText", response.statusText))
	must(value.Set("headers", response.headers))
	return value
}

func (h *HTTPClient) reportAsyncError(err error) {
	if err != nil && h.onAsyncError != nil {
		h.onAsyncError(err)
	}
}

// CancelPending is called by the runtime owner during teardown. It cancels
// request contexts and deliberately discards callbacks after the event loop has
// stopped, so no Promise continuation can outlive an execution.
func (h *HTTPClient) CancelPending() {
	for id, pending := range h.pending {
		delete(h.pending, id)
		pending.cancel()
	}
}

// Wait blocks until network workers have observed cancellation. It does not
// access Goja and is safe after EventLoop.Terminate.
func (h *HTTPClient) Wait() {
	if h != nil && h.workers != nil {
		h.workers.wg.Wait()
	}
}

// ActiveWorkers and PendingCallbacks are lifecycle diagnostics used by the
// execution owner and tests. They are intentionally absent from the JS API
// allowlist, proving new exported Go methods do not become JS methods.
func (h *HTTPClient) ActiveWorkers() int64 {
	if h == nil || h.workers == nil {
		return 0
	}
	return h.workers.active.Load()
}

func (h *HTTPClient) PendingCallbacks() int {
	return len(h.pending)
}

func requestCancel(request httpRequest) {
	if cancel := requestCancelFunc(request); cancel != nil {
		cancel()
	}
}

func requestCancelFunc(request httpRequest) context.CancelFunc {
	return request.cancel
}

func toStringHTTP(value goja.Value, fallback string) string {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return fallback
	}
	return value.String()
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
