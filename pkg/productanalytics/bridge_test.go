package productanalytics

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestLocalBridgeRejectsNonLoopbackAndStripsPrivateEnvironment(t *testing.T) {
	if NewLocalBridge(map[string]string{
		LocalEndpointEnv: "https://example.com", LocalTokenEnv: stringsOf('a', 64), RunSourceEnv: "foreground",
	}) != nil {
		t.Fatal("non-loopback bridge endpoint must be rejected")
	}
	input := map[string]string{LocalEndpointEnv: "http://127.0.0.1:1234", LocalTokenEnv: stringsOf('a', 64), RunSourceEnv: "foreground", "SAFE": "1"}
	stripped := StripPrivateEnvironment(input)
	if _, ok := stripped[LocalTokenEnv]; ok {
		t.Fatal("analytics token leaked")
	}
	if _, ok := stripped[RunSourceEnv]; ok {
		t.Fatal("analytics run source leaked")
	}
	if stripped["SAFE"] != "1" || stripped[LocalEndpointEnv] == "" {
		t.Fatalf("unrelated environment changed: %#v", stripped)
	}
}

func TestLocalBridgePreservesStartFinishOrder(t *testing.T) {
	var mu sync.Mutex
	var paths []string
	var bodies []map[string]any
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(LocalHeader) != stringsOf('a', 64) {
			t.Errorf("missing bridge token")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		paths = append(paths, r.URL.Path)
		bodies = append(bodies, body)
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server.Listener = listener
	server.Start()
	defer server.Close()

	bridge := NewLocalBridge(map[string]string{
		LocalEndpointEnv: server.URL, LocalTokenEnv: stringsOf('a', 64), RunSourceEnv: "foreground",
	})
	if bridge == nil {
		t.Fatal("bridge unavailable")
	}
	runID := randomID()
	bridge.RunStarted("installed", runID)
	bridge.RunFinished(runID, "success", "")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	bridge.Close(ctx)
	mu.Lock()
	defer mu.Unlock()
	if len(paths) != 2 || paths[0] != "/api/product/analytics/run/start" || paths[1] != "/api/product/analytics/run/finish" {
		t.Fatalf("unexpected bridge order: %#v", paths)
	}
	if bodies[0]["flowOrigin"] != "installed" || bodies[0]["runSource"] != "foreground" || bodies[1]["outcome"] != "success" {
		t.Fatalf("unexpected bridge payloads: %#v", bodies)
	}
}

func stringsOf(r rune, count int) string {
	out := make([]rune, count)
	for i := range out {
		out[i] = r
	}
	return string(out)
}
