package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
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
			Context:        ctx,
			EventLoop:      loop,
			EnableDownload: true,
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
	}
	h.loop = nil
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
			await sleep(140);
			__state.processed += 1;
			if (request.body.close === true) __hook.close();
			return { status: 200, body: { processed: __state.processed } };
		}, { handlerTimeoutMs: 50, maxQueuedRequests: 4, maxQueuedBytes: 4096 });
	`)

	status, first, _, err := webhookPost(t, harness.url, harness.headers, "timeout-test", "timeout-1", []byte(`{"close":false}`))
	if err != nil || status != http.StatusGatewayTimeout || !strings.Contains(string(first), "RESULT_UNKNOWN") {
		t.Fatalf("active timeout mismatch: status=%d err=%v body=%s", status, err, first)
	}
	status, second, _, err := webhookPost(t, harness.url, harness.headers, "timeout-test", "timeout-2", []byte(`{"close":false}`))
	if err != nil || status != http.StatusGatewayTimeout || !strings.Contains(string(second), "REQUEST_EXPIRED_NOT_STARTED") {
		t.Fatalf("queued timeout mismatch: status=%d err=%v body=%s", status, err, second)
	}

	time.Sleep(180 * time.Millisecond)
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
