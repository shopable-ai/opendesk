package execution

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func runLifecycleScript(t *testing.T, stack, script string, options ...func(*Request)) error {
	t.Helper()
	artifacts, err := PrepareArtifacts(filepath.Join(t.TempDir(), stack), NewExecutionID("lifecycle"), ".js")
	if err != nil {
		t.Fatal(err)
	}
	req := Request{
		ExecutionID:   artifacts.ExecutionID,
		SourceLabel:   "runtime lifecycle test",
		Ext:           ".js",
		StackMode:     stack,
		ScriptContent: []byte(script),
		Timeout:       2 * time.Second,
		Artifacts:     artifacts,
		Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	}
	for _, option := range options {
		option(&req)
	}
	_, _, err = Run(req)
	return err
}

func TestRuntimeAsyncHTTPAndAbortAcrossStacks(t *testing.T) {
	var slowCanceled atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/not-found":
			http.Error(w, "missing", http.StatusNotFound)
		case "/slow":
			select {
			case <-r.Context().Done():
				slowCanceled.Store(true)
			case <-time.After(2 * time.Second):
				_, _ = w.Write([]byte(`{"late":true}`))
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	for _, stack := range []string{"legacy", "upgraded", "playwright"} {
		t.Run(stack, func(t *testing.T) {
			script := fmt.Sprintf(`
                const accepted = await Promise.all(Array.from({ length: 4 }, () => axios.get(%q + "/ok")));
                if (accepted.some((response) => !response.data.ok)) throw new Error("concurrent axios result mismatch");
                const interval = setInterval(() => {}, 1);
                await new Promise((resolve) => setTimeout(resolve, 8));
                clearInterval(interval);
                let statusError = "";
                try { await axios.get(%q + "/not-found"); } catch (error) { statusError = String(error && error.message || error); }
                if (!statusError.includes("status code 404")) throw new Error("4xx was not normalized: " + statusError);
                let networkError = "";
                try { await axios.get("http://127.0.0.1:1", { timeout: 80 }); } catch (error) { networkError = String(error && error.message || error); }
                if (!networkError.includes("HTTP request failed")) throw new Error("network error was not normalized: " + networkError);
                const controller = new AbortController();
                setTimeout(() => controller.abort("test cancellation"), 20);
                let cancelError = "";
                try { await axios.get(%q + "/slow", { timeout: 1000, signal: controller.signal }); } catch (error) { cancelError = String(error && error.message || error); }
                if (!cancelError.includes("HTTP request canceled")) throw new Error("abort did not cancel HTTP: " + cancelError);
            `, server.URL, server.URL, server.URL)
			if err := runLifecycleScript(t, stack, script); err != nil {
				t.Fatalf("Run(%s) = %v", stack, err)
			}
		})
	}
	if !slowCanceled.Load() {
		t.Fatal("slow handler did not observe request cancellation")
	}
}

func TestRuntimeReportsUnhandledPromiseRejectionAcrossStacks(t *testing.T) {
	for _, stack := range []string{"legacy", "upgraded", "playwright"} {
		t.Run(stack, func(t *testing.T) {
			err := runLifecycleScript(t, stack, `Promise.reject(new Error("unhandled lifecycle rejection"));`)
			if err == nil || !strings.Contains(err.Error(), "unhandled lifecycle rejection") {
				t.Fatalf("unhandled rejection error = %v", err)
			}
		})
	}
}

func TestRuntimeExecutionContextCancelsSlowHTTPAndDrainsWorkers(t *testing.T) {
	canceled := make(chan struct{}, 1)
	started := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started <- struct{}{}
		select {
		case <-r.Context().Done():
			canceled <- struct{}{}
		case <-time.After(2 * time.Second):
			_, _ = w.Write([]byte(`{"late":true}`))
		}
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-started
		cancel()
	}()
	err := runLifecycleScript(t, "legacy", fmt.Sprintf(`await axios.get(%q, { timeout: 1000 });`, server.URL), func(req *Request) {
		req.Context = ctx
	})
	if err == nil || !strings.Contains(err.Error(), "canceled") {
		t.Fatalf("context cancellation error = %v", err)
	}
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("slow HTTP handler did not observe execution context cancellation")
	}
}

func TestRuntimeLifecycleDoesNotAccumulateGoroutines(t *testing.T) {
	baseline := runtime.NumGoroutine()
	for i := 0; i < 8; i++ {
		if err := runLifecycleScript(t, "legacy", `
            const interval = setInterval(() => {}, 1);
            await new Promise((resolve) => setTimeout(resolve, 4));
            clearInterval(interval);
        `); err != nil {
			t.Fatal(err)
		}
	}
	deadline := time.Now().Add(time.Second)
	for runtime.NumGoroutine() > baseline+4 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if current := runtime.NumGoroutine(); current > baseline+4 {
		t.Fatalf("goroutine leak: baseline=%d current=%d", baseline, current)
	}
}
