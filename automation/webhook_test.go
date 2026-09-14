package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

type webhookTestRuntime struct {
	ctx       context.Context
	cancel    context.CancelFunc
	loop      *eventloop.EventLoop
	lifecycle *RuntimeLifecycle
	url       string
	headers   map[string]string
}

func newWebhookTestRuntime(t *testing.T, script string) *webhookTestRuntime {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	loop := eventloop.NewEventLoop()
	loop.Start()
	harness := &webhookTestRuntime{ctx: ctx, cancel: cancel, loop: loop}
	ready := make(chan error, 1)
	if !loop.RunOnLoop(func(rt *goja.Runtime) {
		err := InitJSWithOptions(rt, InitJSOptions{
			Context:       ctx,
			EventLoop:     loop,
			EnableWebhook: true,
			OnReady: func(lifecycle *RuntimeLifecycle) {
				harness.lifecycle = lifecycle
			},
		})
		if err == nil {
			_, err = rt.RunString(script)
		}
		if err == nil {
			harness.url = rt.Get("__hook").ToObject(rt).Get("url").String()
			encoded, encodeErr := rt.RunString("JSON.stringify(__hook.requestHeaders())")
			if encodeErr != nil {
				err = encodeErr
			} else {
				err = json.Unmarshal([]byte(encoded.String()), &harness.headers)
			}
		}
		ready <- err
	}) {
		cancel()
		loop.Terminate()
		t.Fatal("failed to schedule webhook test runtime setup")
	}
	if err := <-ready; err != nil {
		cancel()
		loop.Terminate()
		t.Fatalf("initialize webhook test runtime: %v", err)
	}
	t.Cleanup(func() { harness.close(t) })
	return harness
}

func (h *webhookTestRuntime) close(t *testing.T) {
	t.Helper()
	if h.loop == nil {
		return
	}
	done := make(chan struct{}, 1)
	_ = h.loop.RunOnLoop(func(rt *goja.Runtime) {
		_, _ = rt.RunString("if (globalThis.__hook) __hook.close()")
		close(done)
	})
	select {
	case <-done:
	case <-time.After(time.Second):
	}
	h.cancel()
	cancelDone := make(chan struct{}, 1)
	_ = h.loop.RunOnLoop(func(*goja.Runtime) {
		if h.lifecycle != nil {
			h.lifecycle.CancelAsync()
		}
		close(cancelDone)
	})
	select {
	case <-cancelDone:
	case <-time.After(time.Second):
	}
	h.loop.Terminate()
	if h.lifecycle != nil {
		h.lifecycle.Wait()
		if counts := h.lifecycle.ResourceCounts(); !counts.IsZero() {
			t.Fatalf("webhook runtime leaked resources after teardown: %s", counts.String())
		}
	}
	h.loop = nil
}

func TestWebhookRequiresIndependentHostAuthorization(t *testing.T) {
	for _, test := range []struct {
		name           string
		enableDownload bool
		enableWebhook  bool
		options        string
		wantError      string
	}{
		{name: "download does not authorize webhook", enableDownload: true, options: `{ enableWebhook: true }`, wantError: "WEBHOOK_DISABLED"},
		{name: "host webhook authorization works without download", enableWebhook: true, options: `{}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			loop := eventloop.NewEventLoop()
			loop.Start()
			defer loop.Terminate()

			var lifecycle *RuntimeLifecycle
			ready := make(chan error, 1)
			if !loop.RunOnLoop(func(rt *goja.Runtime) {
				err := InitJSWithOptions(rt, InitJSOptions{
					Context:        ctx,
					EventLoop:      loop,
					EnableDownload: test.enableDownload,
					EnableWebhook:  test.enableWebhook,
					OnReady: func(value *RuntimeLifecycle) {
						lifecycle = value
					},
				})
				if err == nil {
					_, err = rt.RunString(`
						if (typeof http.webhookOpen !== "undefined") throw new Error("native webhook bridge leaked on http");
						globalThis.__hook = Webhook.listen("authorization", () => ({ status: 200, body: { ok: true } }), ` + test.options + `);
					`)
				}
				if err == nil {
					_, err = rt.RunString(`__hook.close()`)
				}
				ready <- err
			}) {
				t.Fatal("failed to schedule authorization test")
			}

			err := <-ready
			if test.wantError == "" {
				if err != nil {
					t.Fatalf("Webhook.listen unexpectedly failed: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), test.wantError) {
				t.Fatalf("Webhook.listen error = %v, want %s", err, test.wantError)
			}

			cancel()
			if lifecycle != nil {
				canceled := make(chan struct{}, 1)
				if !loop.RunOnLoop(func(*goja.Runtime) {
					lifecycle.CancelAsync()
					close(canceled)
				}) {
					t.Fatal("failed to schedule authorization teardown")
				}
				select {
				case <-canceled:
				case <-time.After(time.Second):
					t.Fatal("authorization teardown did not run")
				}
				lifecycle.Wait()
				if counts := lifecycle.ResourceCounts(); !counts.IsZero() {
					t.Fatalf("authorization runtime leaked resources: %s", counts.String())
				}
			}
		})
	}
}

func (h *webhookTestRuntime) eval(t *testing.T, expression string) goja.Value {
	t.Helper()
	result := make(chan struct {
		value goja.Value
		err   error
	}, 1)
	if !h.loop.RunOnLoop(func(rt *goja.Runtime) {
		value, err := rt.RunString(expression)
		result <- struct {
			value goja.Value
			err   error
		}{value: value, err: err}
	}) {
		t.Fatal("failed to schedule JavaScript evaluation")
	}
	out := <-result
	if out.err != nil {
		t.Fatalf("evaluate %q: %v", expression, out.err)
	}
	return out.value
}

func webhookPost(t *testing.T, url string, headers map[string]string, source, deliveryID string, body []byte) (int, []byte, time.Duration, error) {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, nil, 0, err
	}
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	if source != "" {
		request.Header.Set(webhookSourceHeader, source)
	}
	if deliveryID != "" {
		request.Header.Set(webhookDeliveryHeader, deliveryID)
	}
	client := &http.Client{Transport: &http.Transport{Proxy: nil}}
	started := time.Now()
	response, err := client.Do(request)
	elapsed := time.Since(started)
	if err != nil {
		return 0, nil, elapsed, err
	}
	defer response.Body.Close()
	payload, readErr := io.ReadAll(response.Body)
	return response.StatusCode, payload, elapsed, readErr
}

func webhookRaw(t *testing.T, request *http.Request) (int, []byte, error) {
	t.Helper()
	response, err := (&http.Client{Transport: &http.Transport{Proxy: nil}}).Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	payload, readErr := io.ReadAll(response.Body)
	return response.StatusCode, payload, readErr
}

func webhookQueueLength(t *testing.T, harness *webhookTestRuntime) int {
	t.Helper()
	parsed, err := url.Parse(harness.url)
	if err != nil {
		t.Fatalf("parse webhook URL: %v", err)
	}
	host := webhookHostFor(harness.lifecycle.HTTP)
	host.mu.Lock()
	defer host.mu.Unlock()
	listener := host.listeners[host.byPath[parsed.Path]]
	if listener == nil {
		return -1
	}
	return len(listener.queue)
}

func waitForWebhook(t *testing.T, description string, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", description)
}

func TestWebhookListenProcessesRealLoopbackHTTPInSingleExecution(t *testing.T) {
	harness := newWebhookTestRuntime(t, `
		globalThis.__state = { active: 0, maxActive: 0, processed: 0 };
		globalThis.__hook = Webhook.listen("order-query-response", async (request) => {
			const event = request.body;
			if (!event || event.type !== "order.query.response" || typeof event.orderId !== "string") {
				return { status: 400, body: { code: "INVALID_ORDER_EVENT" } };
			}
			__state.active += 1;
			__state.maxActive = Math.max(__state.maxActive, __state.active);
			try {
				await sleep(50);
				__state.processed += 1;
				return {
					status: 200,
					body: { orderId: event.orderId, orderStatus: event.status, processed: __state.processed }
				};
			} finally {
				__state.active -= 1;
			}
		}, {
			maxRequestBytes: 256,
			maxQueuedBytes: 1024,
			handlerTimeoutMs: 1000,
			dedupeWindowMs: 60000,
			maxDedupeEntries: 8
		});
	`)

	bodyA := []byte(`{"type":"order.query.response","orderId":"A-100","status":"paid"}`)
	status, payload, elapsed, err := webhookPost(t, harness.url, harness.headers, "order-helper", "delivery-a", bodyA)
	if err != nil {
		t.Fatalf("post first event: %v", err)
	}
	if status != http.StatusOK {
		t.Fatalf("first event status = %d body=%s", status, payload)
	}
	if elapsed < 30*time.Millisecond {
		t.Fatalf("response returned before async handler settled: %s", elapsed)
	}
	if !strings.Contains(string(payload), `"orderId":"A-100"`) || !strings.Contains(string(payload), `"processed":1`) {
		t.Fatalf("unexpected first business result: %s", payload)
	}

	// Same source + delivery id + canonical JSON must replay the actual result
	// without invoking the handler again.
	status, replay, _, err := webhookPost(t, harness.url, harness.headers, "order-helper", "delivery-a", bodyA)
	if err != nil || status != http.StatusOK {
		t.Fatalf("dedupe replay failed: status=%d err=%v body=%s", status, err, replay)
	}
	if string(replay) != string(payload) {
		t.Fatalf("dedupe replay changed result: first=%s replay=%s", payload, replay)
	}
	if processed := harness.eval(t, "__state.processed").ToInteger(); processed != 1 {
		t.Fatalf("dedupe replay invoked handler again: processed=%d", processed)
	}

	conflict := []byte(`{"type":"order.query.response","orderId":"A-100","status":"refunded"}`)
	status, conflictBody, _, err := webhookPost(t, harness.url, harness.headers, "order-helper", "delivery-a", conflict)
	if err != nil || status != http.StatusConflict || !strings.Contains(string(conflictBody), "DELIVERY_ID_CONFLICT") {
		t.Fatalf("delivery conflict mismatch: status=%d err=%v body=%s", status, err, conflictBody)
	}

	// Two independent deliveries may arrive concurrently, but the JavaScript
	// handler must remain single-flight.
	type reply struct {
		status int
		body   []byte
		err    error
	}
	replies := make(chan reply, 2)
	for _, tc := range []struct {
		id   string
		body string
	}{
		{"delivery-b", `{"type":"order.query.response","orderId":"B-200","status":"shipped"}`},
		{"delivery-c", `{"type":"order.query.response","orderId":"C-300","status":"pending"}`},
	} {
		go func(deliveryID, body string) {
			status, payload, _, err := webhookPost(t, harness.url, harness.headers, "order-helper", deliveryID, []byte(body))
			replies <- reply{status: status, body: payload, err: err}
		}(tc.id, tc.body)
	}
	for range 2 {
		reply := <-replies
		if reply.err != nil || reply.status != http.StatusOK {
			t.Fatalf("concurrent delivery failed: status=%d err=%v body=%s", reply.status, reply.err, reply.body)
		}
	}
	if maxActive := harness.eval(t, "__state.maxActive").ToInteger(); maxActive != 1 {
		t.Fatalf("handler was concurrent: maxActive=%d", maxActive)
	}
	if processed := harness.eval(t, "__state.processed").ToInteger(); processed != 3 {
		t.Fatalf("unexpected processed count after distinct deliveries: %d", processed)
	}

	badHeaders := map[string]string{"Authorization": "Bearer wrong", "Content-Type": "application/json"}
	status, badAuth, _, err := webhookPost(t, harness.url, badHeaders, "order-helper", "bad-auth", bodyA)
	if err != nil || status != http.StatusUnauthorized || !strings.Contains(string(badAuth), "AUTHENTICATION_FAILED") {
		t.Fatalf("bad auth mismatch: status=%d err=%v body=%s", status, err, badAuth)
	}
	if processed := harness.eval(t, "__state.processed").ToInteger(); processed != 3 {
		t.Fatalf("bad auth reached business handler: processed=%d", processed)
	}

	status, malformed, _, err := webhookPost(t, harness.url, harness.headers, "order-helper", "bad-json", []byte(`{"type":`))
	if err != nil || status != http.StatusBadRequest || !strings.Contains(string(malformed), "INVALID_JSON") {
		t.Fatalf("invalid json mismatch: status=%d err=%v body=%s", status, err, malformed)
	}

	largeBody := []byte(`{"value":"` + strings.Repeat("x", 300) + `"}`)
	status, tooLarge, _, err := webhookPost(t, harness.url, harness.headers, "order-helper", "too-large", largeBody)
	if err != nil || status != http.StatusRequestEntityTooLarge || !strings.Contains(string(tooLarge), "REQUEST_BODY_TOO_LARGE") {
		t.Fatalf("oversize mismatch: status=%d err=%v body=%s", status, err, tooLarge)
	}
}

func TestWebhookTimeoutDoesNotReleaseSingleFlightAndCloseInsideHandlerDoesNotDeadlock(t *testing.T) {
	harness := newWebhookTestRuntime(t, `
		globalThis.__state = { processed: 0 };
		globalThis.__hook = Webhook.listen("timeout-test", async (request) => {
			await sleep(250);
			__state.processed += 1;
			if (request.body.close === true) __hook.close();
			return { status: 200, body: { processed: __state.processed } };
		}, { maxRequestBytes: 4096, handlerTimeoutMs: 100, maxQueuedRequests: 4, maxQueuedBytes: 4096 });
	`)

	status, first, _, err := webhookPost(t, harness.url, harness.headers, "timeout-test", "timeout-1", []byte(`{"close":false}`))
	if err != nil || status != http.StatusGatewayTimeout || !strings.Contains(string(first), "RESULT_UNKNOWN") {
		t.Fatalf("active timeout mismatch: status=%d err=%v body=%s", status, err, first)
	}
	status, second, _, err := webhookPost(t, harness.url, harness.headers, "timeout-test", "timeout-2", []byte(`{"close":false}`))
	if err != nil || status != http.StatusGatewayTimeout || !strings.Contains(string(second), "REQUEST_EXPIRED_NOT_STARTED") {
		t.Fatalf("queued timeout mismatch: status=%d err=%v body=%s", status, err, second)
	}

	time.Sleep(290 * time.Millisecond)
	if processed := harness.eval(t, "__state.processed").ToInteger(); processed != 1 {
		t.Fatalf("timed-out active handler did not finish exactly once: processed=%d", processed)
	}

	// Re-register after explicit close uses a new listener instance. Closing from
	// inside the active handler must revoke future calls without waiting on itself.
	harness.eval(t, `
		__hook.close();
		globalThis.__hook = Webhook.listen("close-inside", async () => {
			__hook.close();
			await sleep(10);
			return { status: 200, body: { closed: true } };
		}, { handlerTimeoutMs: 500 });
		globalThis.__newUrl = __hook.url;
		globalThis.__newHeaders = JSON.stringify(__hook.requestHeaders());
	`)
	newURL := harness.eval(t, "__newUrl").String()
	var newHeaders map[string]string
	if err := json.Unmarshal([]byte(harness.eval(t, "__newHeaders").String()), &newHeaders); err != nil {
		t.Fatalf("decode re-registered headers: %v", err)
	}
	status, body, _, err := webhookPost(t, newURL, newHeaders, "close-test", "close-1", []byte(`{"close":true}`))
	if err != nil || status != http.StatusOK || !strings.Contains(string(body), `"closed":true`) {
		t.Fatalf("close-inside handler failed: status=%d err=%v body=%s", status, err, body)
	}

	_, _, _, oldErr := webhookPost(t, newURL, newHeaders, "close-test", "close-2", []byte(`{"close":true}`))
	if oldErr == nil {
		t.Fatal("closed webhook endpoint unexpectedly remained callable")
	}
}

func TestWebhookRejectsProtocolFailuresBeforeBusinessHandler(t *testing.T) {
	harness := newWebhookTestRuntime(t, `
		globalThis.__state = { calls: 0 };
		globalThis.__hook = Webhook.listen("protocol", async (request) => {
			__state.calls += 1;
			if (request.body.kind === "throw") throw new Error("expected handler failure");
			if (request.body.kind === "large-response") return { status: 200, body: { value: "x".repeat(1024) } };
			return {
				status: 200,
				body: {
					requestId: request.requestId,
					deliveryId: request.deliveryId,
					receivedAt: request.receivedAt,
					signalPresent: typeof request.signal.aborted === "boolean",
					calls: __state.calls,
				},
			};
		}, { maxRequestBytes: 512, maxResponseBytes: 512, maxQueuedBytes: 512 });
	`)

	request, err := http.NewRequest(http.MethodGet, harness.url, nil)
	if err != nil {
		t.Fatal(err)
	}
	status, payload, err := webhookRaw(t, request)
	if err != nil || status != http.StatusMethodNotAllowed || !strings.Contains(string(payload), "METHOD_NOT_ALLOWED") {
		t.Fatalf("wrong method = status=%d err=%v body=%s", status, err, payload)
	}

	request, err = http.NewRequest(http.MethodPost, harness.url, strings.NewReader(`{"kind":"normal"}`))
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range harness.headers {
		request.Header.Set(key, value)
	}
	request.Host = "localhost"
	status, payload, err = webhookRaw(t, request)
	if err != nil || status != http.StatusBadRequest || !strings.Contains(string(payload), "HOST_MISMATCH") {
		t.Fatalf("wrong Host = status=%d err=%v body=%s", status, err, payload)
	}

	for _, test := range []struct {
		name     string
		mutate   func(*http.Request)
		want     int
		contains string
	}{
		{name: "origin", mutate: func(request *http.Request) { request.Header.Set("Origin", "https://example.test") }, want: http.StatusForbidden, contains: "BROWSER_ORIGIN_DENIED"},
		{name: "encoding", mutate: func(request *http.Request) { request.Header.Set("Content-Encoding", "gzip") }, want: http.StatusUnsupportedMediaType, contains: "CONTENT_ENCODING_UNSUPPORTED"},
		{name: "content type", mutate: func(request *http.Request) { request.Header.Set("Content-Type", "text/plain") }, want: http.StatusUnsupportedMediaType, contains: "CONTENT_TYPE_UNSUPPORTED"},
	} {
		t.Run(test.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodPost, harness.url, strings.NewReader(`{"kind":"normal"}`))
			if err != nil {
				t.Fatal(err)
			}
			for key, value := range harness.headers {
				request.Header.Set(key, value)
			}
			test.mutate(request)
			status, payload, err := webhookRaw(t, request)
			if err != nil || status != test.want || !strings.Contains(string(payload), test.contains) {
				t.Fatalf("%s = status=%d err=%v body=%s", test.name, status, err, payload)
			}
		})
	}

	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "bad-json", []byte(`{"kind":`))
	if err != nil || status != http.StatusBadRequest || !strings.Contains(string(payload), "INVALID_JSON") {
		t.Fatalf("malformed JSON = status=%d err=%v body=%s", status, err, payload)
	}
	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "too-large", []byte(`{"value":"`+strings.Repeat("x", 600)+`"}`))
	if err != nil || status != http.StatusRequestEntityTooLarge || !strings.Contains(string(payload), "REQUEST_BODY_TOO_LARGE") {
		t.Fatalf("oversize request = status=%d err=%v body=%s", status, err, payload)
	}
	if calls := harness.eval(t, "__state.calls").ToInteger(); calls != 0 {
		t.Fatalf("protocol rejection reached handler: calls=%d", calls)
	}

	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "throw", []byte(`{"kind":"throw"}`))
	if err != nil || status != http.StatusInternalServerError || !strings.Contains(string(payload), "HANDLER_FAILED") {
		t.Fatalf("handler throw = status=%d err=%v body=%s", status, err, payload)
	}
	if calls := harness.eval(t, "__state.calls").ToInteger(); calls != 1 {
		t.Fatalf("handler throw was retried: calls=%d", calls)
	}

	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "large-response", []byte(`{"kind":"large-response"}`))
	if err != nil || status != http.StatusInternalServerError || !strings.Contains(string(payload), "HANDLER_RESPONSE_TOO_LARGE") {
		t.Fatalf("oversize response = status=%d err=%v body=%s", status, err, payload)
	}

	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "fields", []byte(`{"kind":"normal"}`))
	if err != nil || status != http.StatusOK || !strings.Contains(string(payload), `"deliveryId":"fields"`) || !strings.Contains(string(payload), `"signalPresent":true`) {
		t.Fatalf("request contract = status=%d err=%v body=%s", status, err, payload)
	}
	status, _, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "", []byte(`{"kind":"normal"}`))
	if err != nil || status != http.StatusOK {
		t.Fatalf("first no-delivery-id request = status=%d err=%v", status, err)
	}
	status, _, _, err = webhookPost(t, harness.url, harness.headers, "protocol", "", []byte(`{"kind":"normal"}`))
	if err != nil || status != http.StatusOK {
		t.Fatalf("second no-delivery-id request = status=%d err=%v", status, err)
	}
	if calls := harness.eval(t, "__state.calls").ToInteger(); calls != 5 {
		t.Fatalf("missing delivery id incorrectly deduped or handler count drifted: calls=%d", calls)
	}

	message := harness.eval(t, `(() => { try { Webhook.listen("invalid", () => ({status:200, body:{}}), { mode: "async" }); } catch (error) { return String(error); } return "missing error"; })()`).String()
	if !strings.Contains(message, "WEBHOOK_INVALID_OPTION") {
		t.Fatalf("unsupported option error = %s", message)
	}
	message = harness.eval(t, `(() => { try { Webhook.listen("protocol", () => ({status:200, body:{}})); } catch (error) { return String(error); } return "missing error"; })()`).String()
	if !strings.Contains(message, "WEBHOOK_NAME_CONFLICT") {
		t.Fatalf("same-name conflict error = %s", message)
	}
	harness.eval(t, `const recovered = Webhook.listen("invalid", () => ({status:200, body:{ok:true}})); recovered.close();`)
}

func TestWebhookQueueCapacityAndCancellationSignals(t *testing.T) {
	harness := newWebhookTestRuntime(t, `
		globalThis.__state = { calls: 0, started: 0, aborted: 0 };
		globalThis.__hook = Webhook.listen("capacity", async (request) => {
			__state.calls += 1;
			__state.started += 1;
			request.signal.addEventListener("abort", () => { __state.aborted += 1; }, { once: true });
			if (request.body.kind === "wait-abort") {
				await new Promise((resolve) => request.signal.addEventListener("abort", resolve, { once: true }));
			} else {
				await sleep(200);
			}
			return { status: 200, body: { calls: __state.calls } };
		}, { maxRequestBytes: 512, maxQueuedRequests: 1, maxQueuedBytes: 512, handlerTimeoutMs: 1000, maxDedupeEntries: 1 });
	`)

	type reply struct {
		status int
		body   []byte
		err    error
	}
	first := make(chan reply, 1)
	go func() {
		status, body, _, err := webhookPost(t, harness.url, harness.headers, "capacity", "", []byte(`{"kind":"slow"}`))
		first <- reply{status: status, body: body, err: err}
	}()
	waitForWebhook(t, "first handler start", func() bool { return harness.eval(t, "__state.started").ToInteger() == 1 })
	second := make(chan reply, 1)
	go func() {
		status, body, _, err := webhookPost(t, harness.url, harness.headers, "capacity", "", []byte(`{"kind":"slow"}`))
		second <- reply{status: status, body: body, err: err}
	}()
	waitForWebhook(t, "second request queueing", func() bool { return webhookQueueLength(t, harness) == 1 })
	status, payload, _, err := webhookPost(t, harness.url, harness.headers, "capacity", "", []byte(`{"kind":"slow"}`))
	if err != nil || status != http.StatusTooManyRequests || !strings.Contains(string(payload), "WEBHOOK_QUEUE_FULL") {
		t.Fatalf("queue capacity = status=%d err=%v body=%s", status, err, payload)
	}
	for _, result := range []reply{<-first, <-second} {
		if result.err != nil || result.status != http.StatusOK {
			t.Fatalf("accepted queued request = status=%d err=%v body=%s", result.status, result.err, result.body)
		}
	}

	status, _, _, err = webhookPost(t, harness.url, harness.headers, "capacity", "dedupe-one", []byte(`{"kind":"slow"}`))
	if err != nil || status != http.StatusOK {
		t.Fatalf("first protected delivery = status=%d err=%v", status, err)
	}
	status, payload, _, err = webhookPost(t, harness.url, harness.headers, "capacity", "dedupe-two", []byte(`{"kind":"slow"}`))
	if err != nil || status != http.StatusTooManyRequests || !strings.Contains(string(payload), "DEDUPE_CAPACITY") {
		t.Fatalf("dedupe capacity = status=%d err=%v body=%s", status, err, payload)
	}

	requestContext, cancelRequest := context.WithCancel(context.Background())
	defer cancelRequest()
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, harness.url, strings.NewReader(`{"kind":"wait-abort"}`))
	if err != nil {
		t.Fatal(err)
	}
	for key, value := range harness.headers {
		request.Header.Set(key, value)
	}
	clientDone := make(chan error, 1)
	go func() {
		_, err := (&http.Client{Transport: &http.Transport{Proxy: nil}}).Do(request)
		clientDone <- err
	}()
	waitForWebhook(t, "abortable handler start", func() bool { return harness.eval(t, "__state.started").ToInteger() == 4 })
	cancelRequest()
	if err := <-clientDone; err == nil {
		t.Fatal("client disconnect unexpectedly received an HTTP result")
	}
	waitForWebhook(t, "client disconnect abort signal", func() bool { return harness.eval(t, "__state.aborted").ToInteger() == 1 })

	active := make(chan reply, 1)
	go func() {
		status, body, _, err := webhookPost(t, harness.url, harness.headers, "capacity", "", []byte(`{"kind":"wait-abort"}`))
		active <- reply{status: status, body: body, err: err}
	}()
	waitForWebhook(t, "execution-cancel handler start", func() bool { return harness.eval(t, "__state.started").ToInteger() == 5 })
	harness.cancel()
	result := <-active
	if result.err != nil && !errors.Is(result.err, io.EOF) && !strings.Contains(result.err.Error(), "connection") {
		t.Fatalf("execution cancellation request error = %v", result.err)
	}
	waitForWebhook(t, "execution cancellation abort signal", func() bool { return harness.eval(t, "__state.aborted").ToInteger() == 2 })
}
