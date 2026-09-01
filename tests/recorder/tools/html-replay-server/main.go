package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

type server struct {
	fixture   string
	generated string
	evidence  string
	mu        sync.Mutex
	latest    map[string]any
	complete  map[string]any
}

func main() {
	var address, fixture, generated, evidence string
	flag.StringVar(&address, "addr", "127.0.0.1:18766", "listen address")
	flag.StringVar(&fixture, "fixture", "tests/recorder/fixtures/html/recorder-benchmark.html", "benchmark fixture")
	flag.StringVar(&generated, "generated", "", "generated deterministic JavaScript")
	flag.StringVar(&evidence, "evidence-root", ".runtime/tests/recorder/html-replay", "evidence root")
	flag.Parse()
	if generated == "" {
		log.Fatal("-generated is required")
	}
	if err := os.MkdirAll(evidence, 0o755); err != nil {
		log.Fatal(err)
	}
	s := &server{fixture: fixture, generated: generated, evidence: evidence}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleFixture)
	mux.HandleFunc("/generated/flow.js", s.handleGenerated)
	mux.HandleFunc("/api/action", s.handleAction)
	mux.HandleFunc("/api/observe", s.handleObserve)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/replay-complete", s.handleComplete)
	ready := map[string]any{"ok": true, "url": "http://" + address + "/?run=deterministic-replay&mode=replay", "generatedPath": generated, "evidenceRoot": evidence}
	writeJSON(filepath.Join(evidence, "server-ready.json"), ready)
	encoded, _ := json.Marshal(ready)
	fmt.Println(string(encoded))
	log.Fatal(http.ListenAndServe(address, mux))
}

func (s *server) handleFixture(response http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		http.NotFound(response, request)
		return
	}
	http.ServeFile(response, request, s.fixture)
}

func (s *server) handleGenerated(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("content-type", "text/javascript")
	http.ServeFile(response, request, s.generated)
}

func (s *server) handleAction(response http.ResponseWriter, request *http.Request) {
	var payload map[string]any
	if err := decodeJSON(request.Body, &payload); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	if after, ok := payload["after"].(map[string]any); ok {
		s.mu.Lock()
		s.latest = after
		s.mu.Unlock()
	}
	writeJSON(response, map[string]any{"ok": true})
}

func (s *server) handleObserve(response http.ResponseWriter, request *http.Request) {
	var payload map[string]any
	if err := decodeJSON(request.Body, &payload); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(response, map[string]any{"ok": true})
}

func (s *server) handleState(response http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	payload := map[string]any{"ok": true, "state": s.latest, "completion": s.complete}
	s.mu.Unlock()
	writeJSON(response, payload)
}

func (s *server) handleComplete(response http.ResponseWriter, request *http.Request) {
	var payload map[string]any
	if err := decodeJSON(request.Body, &payload); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	s.complete = payload
	s.mu.Unlock()
	writeJSON(filepath.Join(s.evidence, "replay-result.json"), payload)
	writeJSON(response, map[string]any{"ok": true})
}

func decodeJSON(reader io.Reader, target any) error {
	decoder := json.NewDecoder(io.LimitReader(reader, 1<<20))
	decoder.UseNumber()
	return decoder.Decode(target)
}

func writeJSON(target any, value any) {
	data, _ := json.MarshalIndent(value, "", "  ")
	switch typed := target.(type) {
	case string:
		_ = os.WriteFile(typed, append(data, '\n'), 0o644)
	case http.ResponseWriter:
		typed.Header().Set("content-type", "application/json")
		_, _ = typed.Write(append(data, '\n'))
	}
}
