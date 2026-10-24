package browserai

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

type recordedCall struct {
	Method string
	Params map[string]any
}
type fakeAgent struct {
	mu             sync.Mutex
	messages       chan Message
	done           chan struct{}
	closed         bool
	calls          []recordedCall
	answers        []any
	turns          int
	blockMethod    string
	entered        chan struct{}
	policyMutation func(map[string]any)
	config         map[string]any
}

func newFakeAgent() *fakeAgent {
	return &fakeAgent{messages: make(chan Message, 16), done: make(chan struct{}), config: map[string]any{"model_provider": "openai", "mcp_servers": map[string]any{"user_tool": map[string]any{"command": "must-never-run", "token": "private-config-secret"}}}}
}
func (f *fakeAgent) Close() {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.closed {
		f.closed = true
		close(f.done)
	}
}
func (f *fakeAgent) Done() <-chan struct{}    { return f.done }
func (f *fakeAgent) Messages() <-chan Message { return f.messages }
func (f *fakeAgent) Answer(_ json.RawMessage, v any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.answers = append(f.answers, v)
	return nil
}
func (f *fakeAgent) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	raw, _ := json.Marshal(params)
	var p map[string]any
	_ = json.Unmarshal(raw, &p)
	f.mu.Lock()
	f.calls = append(f.calls, recordedCall{Method: method, Params: p})
	block := f.blockMethod == method
	if method == "turn/start" {
		f.turns++
	}
	turns := f.turns
	f.mu.Unlock()
	if block {
		if f.entered != nil {
			close(f.entered)
		}
		select {
		case <-ctx.Done():
			return nil, failure("E_TIMEOUT")
		case <-f.done:
			return nil, failure("E_DISCONNECTED")
		}
	}
	var result any
	switch method {
	case "config/read":
		result = map[string]any{"config": f.config}
	case "thread/start", "thread/resume":
		thread := "thread-1"
		if p["threadId"] != nil {
			thread = p["threadId"].(string)
		}
		reply := map[string]any{"thread": map[string]any{"id": thread, "environments": []any{}}, "sandbox": map[string]any{"type": "readOnly", "networkAccess": false}, "approvalPolicy": "never", "approvalsReviewer": "user", "modelProvider": "openai", "runtimeWorkspaceRoots": []any{}, "instructionSources": []any{}}
		if f.policyMutation != nil {
			f.policyMutation(reply)
		}
		result = reply
	case "turn/start":
		result = map[string]any{"turn": map[string]any{"id": fmt.Sprintf("turn-%d", turns), "status": "inProgress"}}
	case "turn/interrupt", "thread/unsubscribe":
		result = map[string]any{}
	default:
		return nil, failure("E_CAPABILITY")
	}
	return json.Marshal(result)
}

func setupManager(t *testing.T) (*Manager, **fakeAgent) {
	t.Helper()
	var current *fakeAgent
	m := NewManager(Options{Factory: func(context.Context, string) (Agent, Capabilities, error) {
		current = newFakeAgent()
		caps := initialCapabilities()
		caps.ReadyForTurn = true
		caps.ResumeSupported = true
		caps.AuthState = "chatgpt"
		return current, caps, nil
	}})
	t.Cleanup(m.Close)
	return m, &current
}

var testScope = Scope{OwnerID: "owner-1", RegistrationID: "host-1", Generation: 1}

func req(method, sid string, params any) Request {
	raw, _ := json.Marshal(params)
	return Request{V: 1, Kind: "ai.request", Protocol: Protocol, RequestID: newID(), Scope: testScope, SessionID: sid, Method: method, Params: raw}
}
func invoke(t *testing.T, m *Manager, r Request) any {
	t.Helper()
	reply := m.Handle(context.Background(), r)
	if reply.Error != nil {
		t.Fatalf("%s: %v", r.Method, reply.Error)
	}
	return reply.Result
}
func openSession(t *testing.T, m *Manager, observe bool) *session {
	t.Helper()
	result := invoke(t, m, req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true, Observation: observe}})).(map[string]any)
	return m.sessions[result["sessionId"].(string)]
}
func selectedTarget() *Target {
	return &Target{WindowID: 1, TabID: 2, FrameID: 0, DocumentID: "document-1", URL: "https://example.test/private?secret=not-for-model", Origin: "https://example.test"}
}
func startSession(t *testing.T, m *Manager, s *session, observe bool) {
	t.Helper()
	invoke(t, m, req("ai.plan.start", s.id, map[string]any{"input": "Create a semantic workflow", "outputSchema": map[string]any{"type": "object"}, "consent": Consent{Model: true, Workflow: true, Observation: observe}, "target": selectedTarget()}))
}
func message(m *Manager, s *session, method string, params any) {
	raw, _ := json.Marshal(params)
	m.message(s, s.agent, Message{Method: method, Params: raw})
}
func complete(m *Manager, s *session, text, status string) {
	message(m, s, "item/completed", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "item": map[string]any{"type": "agentMessage", "id": "item-1", "text": text, "phase": "final_answer"}})
	message(m, s, "turn/completed", map[string]any{"threadId": s.threadID, "turn": map[string]any{"id": s.turnID, "status": status}})
}
func events(t *testing.T, m *Manager, s *session) map[string]any {
	t.Helper()
	return invoke(t, m, req("ai.events.read", s.id, map[string]any{"cursor": 0})).(map[string]any)
}

func TestContinuousTurnsStreamAndReadOnlyThreadPolicy(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, true)
	startSession(t, m, s, true)
	message(m, s, "item/agentMessage/delta", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "itemId": "item-1", "delta": "a"})
	message(m, s, "turn/plan/updated", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "plan": []any{map[string]string{"step": "Observe document", "status": "pending"}}})
	complete(m, s, `{"steps":[]}`, "completed")
	read := events(t, m, s)
	if read["inferenceVerified"] != true || read["state"] != "COMPLETED" {
		t.Fatalf("completion: %#v", read)
	}
	rows := read["events"].([]Event)
	for i, e := range rows {
		if e.Sequence != uint64(i+1) || e.SessionID != s.id {
			t.Fatal("event correlation")
		}
	}
	startSession(t, m, s, false)
	if s.turnID != "turn-2" || s.verified {
		t.Fatal("second turn must reuse thread and clear current turn proof")
	}
	complete(m, s, `{"steps":[]}`, "completed")
	(*fake).mu.Lock()
	calls := append([]recordedCall{}, (*fake).calls...)
	(*fake).mu.Unlock()
	threads := 0
	turns := 0
	for _, c := range calls {
		if c.Method == "thread/start" {
			threads++
			config := c.Params["config"].(map[string]any)
			mcp := config["mcp_servers"].(map[string]any)
			if mcp["user_tool"].(map[string]any)["enabled"] != false {
				t.Fatal("ambient MCP was not disabled")
			}
			if len(c.Params["environments"].([]any)) != 0 || len(c.Params["runtimeWorkspaceRoots"].([]any)) != 0 {
				t.Fatal("execution environment exposed")
			}
		}
		if c.Method == "turn/start" {
			turns++
			raw, _ := json.Marshal(c.Params)
			if strings.Contains(string(raw), "not-for-model") || strings.Contains(string(raw), "document-1") {
				t.Fatal("private target leaked into model input")
			}
			if c.Params["threadId"] != s.threadID || len(c.Params["environments"].([]any)) != 0 {
				t.Fatal("turn isolation lost")
			}
		}
	}
	if threads != 1 || turns != 2 {
		t.Fatalf("threads=%d turns=%d", threads, turns)
	}
}

func TestProbeNeverRunsInferenceAndCannotProveQuota(t *testing.T) {
	m, fake := setupManager(t)
	caps, err := m.Probe(context.Background())
	if err != nil || !caps.ReadyForTurn || caps.InferenceVerified {
		t.Fatalf("probe: %#v %v", caps, err)
	}
	for _, call := range (*fake).calls {
		if call.Method == "turn/start" {
			t.Fatal("probe started inference")
		}
	}
}

func TestProbeMissingLoginUnsupportedAreExplicit(t *testing.T) {
	for state, code := range map[string]string{"CODEX_MISSING": "E_CODEX_MISSING", "CODEX_LOGIN_REQUIRED": "E_CODEX_LOGIN_REQUIRED", "CODEX_UNSUPPORTED": "E_CODEX_UNSUPPORTED", "DISCONNECTED": "E_DISCONNECTED", "NETWORK_ERROR": "E_NETWORK", "RATE_LIMITED": "E_RATE_LIMITED", "MODEL_UNAVAILABLE": "E_MODEL_UNAVAILABLE", "PROVIDER_ERROR": "E_PROVIDER"} {
		t.Run(state, func(t *testing.T) {
			m := NewManager(Options{Factory: func(context.Context, string) (Agent, Capabilities, error) {
				caps := initialCapabilities()
				return nil, caps, failure(code)
			}})
			defer m.Close()
			caps, err := m.Probe(context.Background())
			if err != nil || caps.State != state || caps.ReadyForTurn || caps.InferenceVerified {
				t.Fatalf("unexpected state: %#v %v", caps, err)
			}
		})
	}
}

func TestScopeConsentAndReplayFences(t *testing.T) {
	m, _ := setupManager(t)
	r := req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}})
	first := m.Handle(context.Background(), r)
	again := m.Handle(context.Background(), r)
	if first.Error != nil || !reflect.DeepEqual(first, again) || len(m.sessions) != 1 {
		t.Fatal("same mutation was dispatched twice")
	}
	r.Params = json.RawMessage(`{"consent":{"model":true,"workflow":true},"model":"different"}`)
	if reply := m.Handle(context.Background(), r); reply.Error == nil || reply.Error.Code != "E_REQUEST_CONFLICT" {
		t.Fatal("conflicting replay accepted")
	}
	sid := first.Result.(map[string]any)["sessionId"].(string)
	for _, mutate := range []func(*Request){func(r *Request) { r.OwnerID = "other" }, func(r *Request) { r.RegistrationID = "other" }, func(r *Request) { r.Generation = 2 }} {
		other := req("ai.events.read", sid, map[string]any{"cursor": 0})
		mutate(&other)
		if m.Handle(context.Background(), other).Error == nil {
			t.Fatal("cross-owner session read")
		}
	}
	if m.Handle(context.Background(), req("ai.plan.start", sid, map[string]any{"input": "test", "consent": Consent{Model: false, Workflow: true}})).Error == nil {
		t.Fatal("unconsented inference")
	}
	if m.Handle(context.Background(), req("ai.plan.start", sid, map[string]any{"input": "test", "consent": Consent{Model: true, Workflow: true, Observation: true}, "target": selectedTarget()})).Error == nil {
		t.Fatal("new observation scope silently added")
	}
}

func TestWholeOwnerCloseCancelsAnOpeningProcess(t *testing.T) {
	entered := make(chan struct{})
	fake := newFakeAgent()
	fake.blockMethod = "thread/start"
	fake.entered = entered
	m := NewManager(Options{Factory: func(context.Context, string) (Agent, Capabilities, error) { return fake, initialCapabilities(), nil }})
	defer m.Close()
	result := make(chan Response, 1)
	go func() {
		result <- m.Handle(context.Background(), req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}}))
	}()
	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("open did not reach server")
	}
	invoke(t, m, req("ai.session.close", "", map[string]any{}))
	select {
	case reply := <-result:
		if reply.Error == nil {
			t.Fatal("late open survived revoked owner")
		}
	case <-time.After(time.Second):
		t.Fatal("opening process leaked")
	}
	if m.Handle(context.Background(), req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}})).Error == nil {
		t.Fatal("revoked owner reopened")
	}
}

func TestRevokedOwnerCannotReadCachedMutationSuccess(t *testing.T) {
	m, _ := setupManager(t)
	open := req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}})
	invoke(t, m, open)
	invoke(t, m, req("ai.session.close", "", map[string]any{}))
	if r := m.Handle(context.Background(), open); r.Error == nil || r.Error.Code != "E_OWNER" {
		t.Fatal("revoked owner received cached ready state")
	}
}

func TestResumeOnlyOwnedKnownClosedThread(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	complete(m, s, "{}", "completed")
	invoke(t, m, req("ai.session.close", s.id, map[string]any{}))
	result := invoke(t, m, req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}, "resumeSessionId": s.id})).(map[string]any)
	if result["threadId"] != s.threadID || result["sessionId"] == s.id {
		t.Fatal("resume correlation")
	}
	found := false
	for _, c := range (*fake).calls {
		if c.Method == "thread/resume" {
			found = true
			if c.Params["threadId"] != s.threadID {
				t.Fatal("wrong thread resumed")
			}
		}
	}
	if !found {
		t.Fatal("resume did not use App Server")
	}
	if m.Handle(context.Background(), req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}, "resumeSessionId": "some-private-codex-thread"})).Error == nil {
		t.Fatal("unowned history read")
	}
}

func requestObserve(m *Manager, s *session, args any) {
	raw, _ := json.Marshal(map[string]any{"threadId": s.threadID, "turnId": s.turnID, "callId": "call-1", "tool": "opendesk_browser_observe", "namespace": nil, "arguments": args})
	m.message(s, s.agent, Message{ID: json.RawMessage(`"server-request-1"`), Method: "item/tool/call", Params: raw})
}
func observationReceipt(origin string) any {
	return map[string]any{"format": "opendesk.workflow-observation.v1", "runId": "run-1", "resultId": "result-1", "sourceHash": strings.Repeat("a", 64), "summary": map[string]any{"kind": "semantic-dom-summary", "origin": origin, "nodes": []any{}, "truncated": false}}
}

func TestObservationNeedsExactPendingApprovalAndTrustedReceipt(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, true)
	startSession(t, m, s, true)
	requestObserve(m, s, map[string]any{})
	read := events(t, m, s)
	var approvalID string
	for _, e := range read["events"].([]Event) {
		if e.Type == "tool.request" {
			approvalID = e.ApprovalID
			if !reflect.DeepEqual(e.Target, selectedTarget()) {
				t.Fatal("target changed")
			}
		}
	}
	if approvalID == "" || s.state != "APPROVAL_REQUIRED" || len((*fake).answers) != 0 {
		t.Fatal("observation ran before explicit approval")
	}
	for _, params := range []any{map[string]any{"approvalId": "wrong", "decision": "approve", "result": observationReceipt(selectedTarget().Origin)}, map[string]any{"approvalId": approvalID, "decision": "approve", "result": observationReceipt("https://other.test")}, map[string]any{"approvalId": approvalID, "decision": "approve", "result": map[string]any{"url": "private"}}} {
		if m.Handle(context.Background(), req("ai.approval.answer", s.id, params)).Error == nil {
			t.Fatal("invalid observation approval accepted")
		}
	}
	for _, mutate := range []func(map[string]any){
		func(r map[string]any) { r["sourceHash"] = "short" },
		func(r map[string]any) { r["summary"].(map[string]any)["nodes"] = nil },
		func(r map[string]any) { r["summary"].(map[string]any)["nodes"] = make([]any, 25) },
		func(r map[string]any) { r["summary"].(map[string]any)["nodes"] = []any{"untyped"} },
	} {
		receipt := observationReceipt(selectedTarget().Origin).(map[string]any)
		mutate(receipt)
		if m.Handle(context.Background(), req("ai.approval.answer", s.id, map[string]any{"approvalId": approvalID, "decision": "approve", "result": receipt})).Error == nil {
			t.Fatal("invalid source hash or semantic nodes accepted")
		}
	}
	answer := req("ai.approval.answer", s.id, map[string]any{"approvalId": approvalID, "decision": "approve", "result": observationReceipt(selectedTarget().Origin)})
	invoke(t, m, answer)
	invoke(t, m, answer)
	if len((*fake).answers) != 1 {
		t.Fatal("approval effect replayed")
	}
	encoded, _ := json.Marshal((*fake).answers[0])
	if strings.Contains(string(encoded), "not-for-model") {
		t.Fatal("private target URL leaked")
	}
	if m.Handle(context.Background(), req("ai.approval.answer", s.id, map[string]any{"approvalId": approvalID, "decision": "deny"})).Error == nil {
		t.Fatal("stale approval reused")
	}
}

func TestObservationRejectsModelChosenTargetsAndPerTurnRevocation(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, true)
	startSession(t, m, s, true)
	requestObserve(m, s, map[string]any{"url": "https://evil.test"})
	if len(s.pending) != 0 || len((*fake).answers) != 1 {
		t.Fatal("model selected a different target")
	}
	complete(m, s, "{}", "completed")
	startSession(t, m, s, false)
	requestObserve(m, s, map[string]any{})
	if len(s.pending) != 0 || len((*fake).answers) != 2 {
		t.Fatal("prior turn observation consent reused")
	}
}

func TestAppServerToolReplayDoesNotCreateAnotherApproval(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, true)
	startSession(t, m, s, true)
	requestObserve(m, s, map[string]any{})
	var id string
	for key := range s.pending {
		id = key
	}
	invoke(t, m, req("ai.approval.answer", s.id, map[string]any{"approvalId": id, "decision": "deny"}))
	for _, pair := range [][2]string{{"server-request-1", "call-2"}, {"server-request-2", "call-1"}} {
		raw, _ := json.Marshal(map[string]any{"threadId": s.threadID, "turnId": s.turnID, "callId": pair[1], "tool": "opendesk_browser_observe", "arguments": map[string]any{}})
		requestID, _ := json.Marshal(pair[0])
		m.message(s, s.agent, Message{ID: requestID, Method: "item/tool/call", Params: raw})
	}
	if len(s.pending) != 0 || s.toolCount != 1 || len((*fake).answers) != 3 {
		t.Fatal("replayed App Server tool request re-opened an observation authorization")
	}
	count := 0
	for _, e := range s.events {
		if e.Type == "tool.request" {
			count++
		}
	}
	if count != 1 {
		t.Fatal("tool replay created another UI approval")
	}
}

func TestCancelWaitsForTerminalAndNeverReplaysTurn(t *testing.T) {
	m, fake := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	reply := invoke(t, m, req("ai.plan.cancel", s.id, map[string]any{})).(map[string]any)
	if reply["state"] != "CANCELLING" || s.state != "CANCELLING" {
		t.Fatal("cancel acknowledgement was treated as completion")
	}
	message(m, s, "turn/completed", map[string]any{"threadId": s.threadID, "turn": map[string]any{"id": s.turnID, "status": "interrupted"}})
	if s.state != "CANCELLED" || s.verified || (*fake).turns != 1 {
		t.Fatal("cancel did not end exact turn")
	}
	t.Run("local-timeout-is-not-model-terminal", func(t *testing.T) {
		m, _ := setupManager(t)
		s := openSession(t, m, false)
		startSession(t, m, s, false)
		original := failure("E_TIMEOUT")
		m.failSession(s, original)
		s.mu.Lock()
		defer s.mu.Unlock()
		last := s.events[len(s.events)-1]
		if last.Error == nil || last.Error.Outcome != "OUTCOME_UNKNOWN" || last.Error.Code != "E_TIMEOUT" {
			t.Fatal("local failure lacks unknown outcome")
		}
		if original.Outcome != "" {
			t.Fatal("shared error was mutated")
		}
	})

}

func TestPrivilegedServerRequestAndExecutionAreBlocked(t *testing.T) {
	for _, kind := range []string{"commandExecution", "fileChange", "mcpToolCall", "collabToolCall", "webSearch", "imageView", "approval"} {
		t.Run(kind, func(t *testing.T) {
			m, fake := setupManager(t)
			s := openSession(t, m, false)
			startSession(t, m, s, false)
			if kind == "approval" {
				m.message(s, s.agent, Message{ID: json.RawMessage(`42`), Method: "item/commandExecution/requestApproval", Params: json.RawMessage(`{"command":"secret-command"}`)})
			} else {
				message(m, s, "item/started", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "item": map[string]any{"type": kind, "id": "item"}})
			}
			if !s.closed || s.state != "FAILED" || !(*fake).closed {
				t.Fatal("privileged tool escaped")
			}
			raw, _ := json.Marshal(s.events)
			if strings.Contains(string(raw), "secret-command") {
				t.Fatal("approval diagnostics leaked")
			}
		})
	}
}

func TestConfiguredModelRouteRetainsIsolation(t *testing.T) {
	for _, row := range []struct {
		name     string
		endpoint any
		allowed  bool
	}{
		{"official", "https://api.openai.com/v1", true},
		{"configured_loopback", "http://127.0.0.1:10100/v1", true},
		{"ipv6_loopback", "http://[::1]:10100/v1", true},
		{"remote_http", "http://example.test:10100/v1", false},
		{"private_network", "http://192.168.1.10:10100/v1", false},
		{"userinfo", "http://secret@127.0.0.1:10100/v1", false},
		{"query", "http://127.0.0.1:10100/v1?token=secret", false},
		{"fragment", "http://127.0.0.1:10100/v1#secret", false},
		{"other_service", "http://127.0.0.1:10100/admin", false},
		{"wrong_type", []any{}, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			agent := newFakeAgent()
			agent.config["openai_base_url"] = row.endpoint
			_, err := startThread(context.Background(), agent, t.TempDir(), "", "", false, true)
			if row.allowed {
				if err != nil {
					t.Fatal(err)
				}
				for _, call := range agent.calls {
					if call.Method != "thread/start" {
						continue
					}
					config := call.Params["config"].(map[string]any)
					if config["openai_base_url"] != row.endpoint {
						t.Fatal("validated configured route was not frozen for the thread")
					}
					if call.Params["sandbox"] != "read-only" || call.Params["approvalPolicy"] != "never" ||
						config["features.shell_tool"] != false || config["features.hooks"] != false ||
						config["mcp_servers"].(map[string]any)["user_tool"].(map[string]any)["enabled"] != false {
						t.Fatal("local route widened planning authority")
					}
				}
			} else if err == nil || publicError(err).Code != "E_CODEX_POLICY" {
				t.Fatal("unapproved model endpoint accepted")
			}
			if agent.turns != 0 {
				t.Fatal("route check started inference")
			}
		})
	}
}

func TestPolicyWideningIsRejectedBeforeInference(t *testing.T) {
	for _, mutation := range []func(map[string]any){func(p map[string]any) { p["sandbox"] = map[string]any{"type": "dangerFullAccess"} }, func(p map[string]any) { p["thread"].(map[string]any)["environments"] = []any{"local"} }, func(p map[string]any) { p["approvalPolicy"] = "on-request" }, func(p map[string]any) { p["approvalsReviewer"] = "auto_review" }, func(p map[string]any) { p["instructionSources"] = []string{"/private/prompt"} },
		func(p map[string]any) { delete(p, "instructionSources") },
		func(p map[string]any) { p["instructionSources"] = nil },
		func(p map[string]any) { delete(p, "runtimeWorkspaceRoots") },
		func(p map[string]any) { p["runtimeWorkspaceRoots"] = nil },
	} {
		fake := newFakeAgent()
		fake.policyMutation = mutation
		m := NewManager(Options{Factory: func(context.Context, string) (Agent, Capabilities, error) { return fake, initialCapabilities(), nil }})
		reply := m.Handle(context.Background(), req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}}))
		if reply.Error == nil || reply.Error.Code != "E_CODEX_POLICY" || fake.turns != 0 {
			t.Fatal("policy widening accepted")
		}
		m.Close()
	}
}

func TestEventBudgetCursorAndForeignThread(t *testing.T) {
	m, _ := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	before := s.sequence
	message(m, s, "item/completed", map[string]any{"threadId": "foreign", "turnId": s.turnID, "item": map[string]any{"type": "agentMessage", "text": "secret"}})
	if s.sequence != before {
		t.Fatal("foreign thread event surfaced")
	}
	for i := 0; i < 300; i++ {
		message(m, s, "item/agentMessage/delta", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "delta": strings.Repeat("字", 100)})
	}
	if m.Handle(context.Background(), req("ai.events.read", s.id, map[string]any{"cursor": 0})).Error == nil {
		t.Fatal("lost event cursor silently resumed")
	}
	read := invoke(t, m, req("ai.events.read", s.id, map[string]any{"cursor": s.events[0].Sequence - 1, "limit": 24}))
	raw, _ := json.Marshal(read)
	if len(raw) > MaxMessageBytes {
		t.Fatal("event batch exceeded native frame")
	}
}

func TestTerminalWithoutMessageDoesNotVerifyInference(t *testing.T) {
	m, _ := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	message(m, s, "turn/completed", map[string]any{"threadId": s.threadID, "turn": map[string]any{"id": s.turnID, "status": "completed"}})
	if s.verified || s.state != "FAILED" {
		t.Fatal("empty turn marked inference success")
	}
}

func TestEscapedEventCannotPinPagination(t *testing.T) {
	m, _ := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	message(m, s, "item/completed", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "item": map[string]any{"type": "agentMessage", "text": strings.Repeat("<", 20*1024)}})
	read := events(t, m, s)
	if read["state"] != "FAILED" || read["hasMore"] != false || read["cursor"] != s.sequence {
		t.Fatal("oversized escaped event stranded the cursor")
	}
	raw, _ := json.Marshal(read)
	if len(raw) > MaxMessageBytes {
		t.Fatal("oversized terminal frame")
	}
}

func TestProviderRetryIsProgressUntilTrustedTerminal(t *testing.T) {
	m, _ := setupManager(t)
	s := openSession(t, m, false)
	startSession(t, m, s, false)
	message(m, s, "error", map[string]any{"threadId": s.threadID, "turnId": s.turnID, "willRetry": true, "error": map[string]any{"message": "not forwarded", "codexErrorInfo": "serverOverloaded"}})
	if s.closed || s.state != "RUNNING" {
		t.Fatal("recoverable provider notification killed the session")
	}
	complete(m, s, "{}", "completed")
	if !s.verified {
		t.Fatal("retry progress hid successful terminal")
	}
}

func TestCleanupStillWorksAfterMutationLedgerBudgetIsExhausted(t *testing.T) {
	m, _ := setupManager(t)
	s := openSession(t, m, false)
	for len(m.ledger) < 512 {
		m.ledger[newID()] = &ledgerEntry{done: make(chan struct{})}
	}
	invoke(t, m, req("ai.session.close", "", map[string]any{}))
	if !s.closed {
		t.Fatal("full mutation ledger blocked owner cleanup")
	}
}
