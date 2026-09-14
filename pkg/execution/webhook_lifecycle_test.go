package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

type webhookLifecycleConfig struct {
	URL     string            `json:"url"`
	Headers map[string]string `json:"headers"`
}

type webhookLifecycleOutcome struct {
	result ExecutionResult
	err    error
}

func startWebhookLifecycleExecution(t *testing.T) (webhookLifecycleConfig, <-chan webhookLifecycleOutcome) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	workDir := t.TempDir()
	configReady := make(chan webhookLifecycleConfig, 1)
	completed := make(chan webhookLifecycleOutcome, 1)
	go func() {
		defer cancel()
		result, _, err := Run(Request{
			Context:       ctx,
			ExecutionID:   NewExecutionID("webhook-lifecycle"),
			SourceLabel:   "trusted local webhook lifecycle test",
			Ext:           ".js",
			WorkDir:       workDir,
			EnableWebhook: true,
			Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
			ScriptContent: []byte(`
const hook = Webhook.listen("execution-lifecycle", async (request) => {
  if (request.body && request.body.close === true) hook.close();
  return { status: 200, body: { closed: Boolean(request.body && request.body.close) } };
});
__opendeskInspectorResult(JSON.stringify({ url: hook.url, headers: hook.requestHeaders() }));
`),
			InternalResultSink: func(value []byte) error {
				var config webhookLifecycleConfig
				if err := json.Unmarshal(value, &config); err != nil {
					return err
				}
				configReady <- config
				return nil
			},
		})
		completed <- webhookLifecycleOutcome{result: result, err: err}
	}()

	select {
	case config := <-configReady:
		if config.URL == "" || config.Headers["Authorization"] == "" {
			t.Fatal("execution did not provide a webhook connection configuration")
		}
		return config, completed
	case outcome := <-completed:
		t.Fatalf("execution exited before Webhook.close(): status=%s error=%v", outcome.result.Status, outcome.err)
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for webhook execution to become reachable")
	}
	return webhookLifecycleConfig{}, completed
}

func postWebhookLifecycle(config webhookLifecycleConfig, body string) (int, error) {
	request, err := http.NewRequest(http.MethodPost, config.URL, bytes.NewBufferString(body))
	if err != nil {
		return 0, err
	}
	for key, value := range config.Headers {
		request.Header.Set(key, value)
	}
	response, err := (&http.Client{Transport: &http.Transport{Proxy: nil}}).Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	return response.StatusCode, nil
}

func TestWebhookListenerKeepsExecutionAliveThenCloseDrainsAndRevokesRestartedEndpoints(t *testing.T) {
	first, firstDone := startWebhookLifecycleExecution(t)
	select {
	case outcome := <-firstDone:
		t.Fatalf("top-level completion stopped active listener: status=%s error=%v", outcome.result.Status, outcome.err)
	case <-time.After(150 * time.Millisecond):
	}

	status, err := postWebhookLifecycle(first, `{"close":true}`)
	if err != nil || status != http.StatusOK {
		t.Fatalf("close-in-handler delivery = status=%d err=%v", status, err)
	}
	select {
	case outcome := <-firstDone:
		if outcome.err != nil || outcome.result.Status != ExecutionStatusSucceeded {
			t.Fatalf("execution did not drain cleanly after close: status=%s error=%v", outcome.result.Status, outcome.err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("execution did not exit after its final listener closed")
	}

	second, secondDone := startWebhookLifecycleExecution(t)
	if first.URL == second.URL || first.Headers["Authorization"] == second.Headers["Authorization"] {
		t.Fatal("separate executions reused a webhook endpoint or credential")
	}
	if status, err := postWebhookLifecycle(first, `{"close":false}`); err == nil && status == http.StatusOK {
		t.Fatal("old webhook endpoint reached the new execution")
	}
	status, err = postWebhookLifecycle(second, `{"close":true}`)
	if err != nil || status != http.StatusOK {
		t.Fatalf("second execution close delivery = status=%d err=%v", status, err)
	}
	select {
	case outcome := <-secondDone:
		if outcome.err != nil || outcome.result.Status != ExecutionStatusSucceeded {
			t.Fatalf("second execution did not drain cleanly: status=%s error=%v", outcome.result.Status, outcome.err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("second execution did not exit after close")
	}
}
