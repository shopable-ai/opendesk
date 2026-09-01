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
	"strings"
	"sync"
	"time"

	"opendesk/pkg/recorder"
)

type actionPayload struct {
	Name      string              `json:"name"`
	Selector  string              `json:"selector"`
	Arguments map[string]any      `json:"arguments"`
	Hint      recorder.ActionHint `json:"hint"`
	Before    map[string]any      `json:"before"`
	After     map[string]any      `json:"after"`
}

type server struct {
	manager  *recorder.Manager
	manifest recorder.Manifest
	evidence string
	fixture  string
	mu       sync.Mutex
	latest   map[string]any
}

func main() {
	var address, recorderRoot, evidenceRoot, fixture string
	flag.StringVar(&address, "addr", "127.0.0.1:18765", "listen address")
	flag.StringVar(&recorderRoot, "recorder-root", ".runtime/recordings", "recorder artifact root")
	flag.StringVar(&evidenceRoot, "evidence-root", ".runtime/tests/recorder/html-benchmark", "test evidence root")
	flag.StringVar(&fixture, "fixture", "tests/recorder/fixtures/html/recorder-benchmark.html", "benchmark fixture")
	flag.Parse()

	manager, err := recorder.NewManager(recorderRoot)
	if err != nil {
		log.Fatal(err)
	}
	manifest, err := manager.Start(recorder.StartOptions{Goal: "Complete the controlled HTML benchmark with recorder-56088", Source: "mcp", ObservationPolicy: recorder.ObservationStandard})
	if err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(evidenceRoot, 0o755); err != nil {
		log.Fatal(err)
	}
	s := &server{manager: manager, manifest: manifest, evidence: evidenceRoot, fixture: fixture}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleFixture)
	mux.HandleFunc("/api/action", s.handleAction)
	mux.HandleFunc("/api/observe", s.handleObserve)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/finalize", s.handleFinalize)
	ready := map[string]any{"ok": true, "url": "http://" + address + "/", "recordingSessionId": manifest.SessionID, "paths": manifest.Paths, "evidenceRoot": evidenceRoot}
	writeJSON(filepath.Join(evidenceRoot, "server-ready.json"), ready)
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

func (s *server) handleAction(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload actionPayload
	if err := decodeJSON(request.Body, &payload); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	if !strings.HasPrefix(payload.Name, "dom.") || !strings.HasPrefix(payload.Selector, "#") {
		http.Error(response, "unsupported action contract", http.StatusBadRequest)
		return
	}
	if payload.Arguments == nil {
		payload.Arguments = map[string]any{}
	}
	payload.Arguments["selector"] = payload.Selector
	before := recorder.Observation{
		CapturedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Target:     &recorder.TargetSnapshot{Description: payload.Hint.TargetDescription, Candidates: []recorder.LocatorCandidate{{Kind: "dom-id", Identifier: payload.Selector, Name: payload.Hint.TargetDescription, Confidence: 1}}},
	}
	span, err := s.manager.Before(s.manifest.SessionID, "html-agent", "mcp", recorder.ActionRequest{Name: payload.Name, Arguments: payload.Arguments}, payload.Hint, before)
	if err != nil {
		http.Error(response, err.Error(), http.StatusConflict)
		return
	}
	verification := verifyDOMPayload(payload)
	result := recorder.ActionResult{OK: verification.Status == "pass", Payload: map[string]any{"beforeState": payload.Before, "afterState": payload.After, "stateChanged": true}}
	after := recorder.Observation{CapturedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	if err := s.manager.After(span, result, after, verification); err != nil {
		http.Error(response, err.Error(), http.StatusInternalServerError)
		return
	}
	s.mu.Lock()
	s.latest = payload.After
	s.mu.Unlock()
	writeJSON(response, map[string]any{"ok": result.OK, "actionId": span.ActionID, "verification": verification})
}

func (s *server) handleObserve(response http.ResponseWriter, request *http.Request) {
	var payload map[string]any
	if err := decodeJSON(request.Body, &payload); err != nil {
		http.Error(response, err.Error(), http.StatusBadRequest)
		return
	}
	release, err := s.manager.EnterInternal(s.manifest.SessionID, "benchmark-load")
	if err != nil {
		http.Error(response, err.Error(), http.StatusConflict)
		return
	}
	defer release()
	event, err := s.manager.RecordInternal(s.manifest.SessionID, "html-agent", "benchmark-load", "page-ready", recorder.Observation{CapturedAt: time.Now().UTC().Format(time.RFC3339Nano)})
	if err != nil {
		http.Error(response, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(response, map[string]any{"ok": true, "eventId": event.EventID})
}

func (s *server) handleState(response http.ResponseWriter, _ *http.Request) {
	s.mu.Lock()
	latest := s.latest
	s.mu.Unlock()
	writeJSON(response, map[string]any{"ok": true, "recordingSessionId": s.manifest.SessionID, "state": latest})
}

func (s *server) handleFinalize(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.Error(response, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	manifest, err := s.manager.Stop(s.manifest.SessionID)
	if err != nil {
		http.Error(response, err.Error(), http.StatusConflict)
		return
	}
	flow, report, err := s.manager.Distill(s.manifest.SessionID)
	if err != nil {
		http.Error(response, err.Error(), http.StatusInternalServerError)
		return
	}
	generatedPath, err := s.manager.Compile(s.manifest.SessionID, flow, recorder.CompileOptions{})
	if err != nil {
		http.Error(response, err.Error(), http.StatusInternalServerError)
		return
	}
	summary := map[string]any{"ok": true, "manifest": manifest, "flow": flow, "distillation": report, "generatedPath": generatedPath, "usesAI": false}
	writeJSON(filepath.Join(s.evidence, "agent-run-summary.json"), summary)
	writeJSON(response, summary)
}

func verifyDOMPayload(payload actionPayload) recorder.Verification {
	verification := recorder.Verification{Status: "pass", Postconditions: payload.Hint.ExpectedPostconditions, Actual: payload.After}
	for _, postcondition := range payload.Hint.ExpectedPostconditions {
		value, _ := postcondition.Value.(map[string]any)
		expected := value["expected"]
		var actual any
		switch value["selector"] {
		case "#token":
			actual = payload.After["token"]
		case "#route":
			actual = payload.After["route"]
		case "#confirm":
			actual = payload.After["confirmed"]
		case "#status":
			actual = payload.After["status"]
		}
		if fmt.Sprint(actual) != fmt.Sprint(expected) {
			verification.Status = "fail"
			verification.FailureClass = "F6"
			verification.Message = fmt.Sprintf("postcondition %s expected %v got %v", postcondition.Kind, expected, actual)
			break
		}
	}
	return verification
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
