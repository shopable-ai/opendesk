package browserai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestStrictWorkflowAIProtocol(t *testing.T) {
	valid := req("ai.capabilities.read", "", map[string]any{})
	raw, _ := json.Marshal(valid)
	if _, err := DecodeRequest(raw); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(map[string]any){func(v map[string]any) { v["kind"] = "request" }, func(v map[string]any) { v["protocol"] = "other" }, func(v map[string]any) { v["generation"] = 0 }, func(v map[string]any) { v["ownerId"] = "../private" }, func(v map[string]any) { v["method"] = "command/exec" }, func(v map[string]any) { v["params"] = []any{} }, func(v map[string]any) { v["extraArgs"] = []any{"--yolo"} }} {
		var v map[string]any
		_ = json.Unmarshal(raw, &v)
		mutate(v)
		changed, _ := json.Marshal(v)
		if _, err := DecodeRequest(changed); err == nil {
			t.Fatalf("accepted invalid protocol mutation")
		}
	}
	if _, err := DecodeRequest([]byte(strings.Repeat(" ", MaxMessageBytes+1))); err == nil {
		t.Fatal("unbounded input")
	}
}

func TestAmbientSecretsAndExecutableOverridesAreNotInherited(t *testing.T) {
	for _, key := range []string{"OPENAI_API_KEY", "OPENAI_BASE_URL", "NODE_OPTIONS", "LD_PRELOAD", "HTTP_PROXY", "ANTHROPIC_API_KEY", "CODEX_REMOTE_URL"} {
		t.Setenv(key, "sensitive-value")
	}
	for _, item := range minimalEnvironment() {
		if strings.Contains(item, "sensitive-value") {
			t.Fatal("ambient credential or process injection inherited")
		}
	}
	args := strings.Join(processArgs("/safe/owned-workspace"), " ")
	for _, forbidden := range []string{"--ignore-user-config", "--dangerously", "codex exec"} {
		if strings.Contains(args, forbidden) {
			t.Fatal("unsupported or unsafe launch")
		}
	}
	for _, required := range []string{"features.shell_tool=false", "features.unified_exec=false", "features.hooks=false", "features.plugins=false", "features.apps=false", "notify=[]", "openai_base_url=\"\"", "model_instructions_file=\"/safe/owned-workspace/instructions.txt\"", "otel.exporter=\"none\""} {
		if !strings.Contains(args, required) {
			t.Fatalf("missing launch boundary: %s", required)
		}
	}
}

func TestOwnedProcessDisablesRemoteControlRegardlessOfParentPreference(t *testing.T) {
	const marker = "CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED"
	for _, parentValue := range []string{"", "0", "false", "1"} {
		t.Run("parent_"+parentValue, func(t *testing.T) {
			t.Setenv(marker, parentValue)
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			// Check what a real owned child receives, not merely a proposed map.
			// No value, account identity, or ambient environment is printed.
			cmd := ownedCommand(ctx, "/bin/sh", t.TempDir(), "-c", `[ "$CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED" = "1" ]`)
			if err := cmd.Run(); err != nil {
				t.Fatal("owned child did not start with remote control explicitly disabled")
			}
			count := 0
			for _, value := range cmd.Env {
				if strings.HasPrefix(value, marker+"=") {
					count++
				}
			}
			if count != 1 {
				t.Fatal("ambiguous duplicate remote-control environment value")
			}
		})
	}
	for _, arg := range processArgs("/safe/owned-workspace") {
		if arg == "--remote-control" || strings.HasPrefix(arg, "--remote-control=") {
			t.Fatal("CLI flag can override the disabled startup marker")
		}
	}
	if allowedRPC["remoteControl/enable"] {
		t.Fatal("workflow RPC surface can re-enable remote control")
	}
}

func TestProviderErrorsDoNotDiscloseRawDiagnostics(t *testing.T) {
	for text, code := range map[string]string{"401 authentication token=secret": "E_CODEX_LOGIN_REQUIRED", "rate_limit quota token=secret": "E_RATE_LIMITED", "unsupported model token=secret": "E_MODEL_UNAVAILABLE", "network failed token=secret": "E_NETWORK", "-32602 token=secret": "E_CODEX_UNSUPPORTED", "arbitrary token=secret": "E_PROVIDER"} {
		err := classifyProviderError(json.RawMessage(text))
		raw, _ := json.Marshal(err)
		if err.Code != code || strings.Contains(string(raw), "secret") {
			t.Fatal("unsafe provider error")
		}
	}
}

func TestExistingNetworkProxyIsValidatedWithoutCredentials(t *testing.T) {
	for _, value := range []string{"http://127.0.0.1:3128", "https://proxy.example.test:443/", "socks5h://[::1]:1080"} {
		if !safeProxyURL(value) {
			t.Fatal("valid configured network proxy rejected")
		}
	}
	for _, value := range []string{"http://user:secret@127.0.0.1:3128", "http://127.0.0.1/token", "http://127.0.0.1?token=secret", "http://127.0.0.1#secret", "http://127.0.0.1\nBAD=1", "file:///private", "not-a-url"} {
		if safeProxyURL(value) {
			t.Fatal("unsafe proxy accepted")
		}
	}
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:3128")
	t.Setenv("NO_PROXY", "localhost,127.0.0.1")
	all := strings.Join(minimalEnvironment(), "\n")
	if !strings.Contains(all, "HTTP_PROXY=http://127.0.0.1:3128\n") || !strings.Contains(all, "NO_PROXY=localhost,127.0.0.1") {
		t.Fatal("existing safe network route was not retained")
	}
}

func TestEnvironmentRegistryIsRejectedBeforeProcessStart(t *testing.T) {
	root := t.TempDir()
	t.Setenv("CODEX_HOME", root)
	if err := verifyNoEnvironmentRegistry(); err != nil {
		t.Fatal("absent environment registry rejected")
	}
	if err := os.WriteFile(filepath.Join(root, "environments.toml"), []byte("synthetic configuration must never be read by a launched process"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := launchServer(context.Background(), "/a/process/that/must/not/start", t.TempDir()); err == nil || publicError(err).Code != "E_CODEX_POLICY" {
		t.Fatal("environment registry did not block before executable launch")
	}
	t.Setenv("CODEX_HOME", "relative-home")
	if err := verifyNoEnvironmentRegistry(); err == nil {
		t.Fatal("ambiguous environment registry location accepted")
	}
	t.Setenv("CODEX_HOME", filepath.Join(root, "environments.toml"))
	if err := verifyNoEnvironmentRegistry(); err == nil {
		t.Fatal("unresolvable environment registry location accepted")
	}
}

func TestUnreviewedCLIVersionStopsBeforeSchemaOrAppServer(t *testing.T) {
	workspace := t.TempDir()
	marker := filepath.Join(workspace, "schema-must-not-run")
	program := filepath.Join(workspace, "unknown-codex")
	script := "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo 'codex-cli 999.0.0'; exit 0; fi\ntouch '" + marker + "'\n"
	if err := os.WriteFile(program, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	version, _, err := inspectExecutable(context.Background(), program, workspace)
	if err == nil || publicError(err).Code != "E_CODEX_UNSUPPORTED" || version != "codex-cli 999.0.0" {
		t.Fatal("unreviewed CLI was accepted")
	}
	if _, err = os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("unreviewed CLI ran beyond version inspection")
	}
}

func TestTargetRejectsChildFramesCredentialsAndOriginMismatch(t *testing.T) {
	if !selectedTarget().valid() {
		t.Fatal("valid target rejected")
	}
	for _, mutation := range []func(*Target){func(x *Target) { x.FrameID = 1 }, func(x *Target) { x.URL = "https://user:secret@example.test/" }, func(x *Target) { x.Origin = "https://other.test" }, func(x *Target) { x.URL = "file:///private" }, func(x *Target) { x.DocumentID = "" }} {
		x := selectedTarget()
		mutation(x)
		if x.valid() {
			t.Fatal("invalid document accepted")
		}
	}
}

// A stdio-only child executable exercises the real process/framing adapter.
// It is not a model or a Chrome test and is never used outside Go white-box QA.
func TestAppServerHelperProcess(t *testing.T) {
	helper := false
	for _, arg := range os.Args {
		if arg == "app-server" {
			helper = true
		}
	}
	if !helper {
		return
	}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var r struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Result json.RawMessage `json:"result"`
		}
		_ = json.Unmarshal(scanner.Bytes(), &r)
		if r.Method == "" {
			fmt.Println(`{"method":"turn/completed","params":{"threadId":"thread-stdio","turn":{"id":"turn-stdio","status":"completed"}}}`)
			continue
		}
		if r.Method == "initialized" {
			continue
		}
		var result any = map[string]any{}
		if r.Method == "account/read" {
			result = map[string]any{"account": map[string]any{"type": "chatgpt", "email": "never-forward@example.test"}}
		}
		if r.Method == "turn/start" {
			result = map[string]any{"turn": map[string]any{"id": "turn-stdio", "status": "inProgress"}}
		}
		raw, _ := json.Marshal(map[string]any{"id": r.ID, "result": result})
		fmt.Println(string(raw))
		if r.Method == "turn/start" {
			fmt.Println(`{"method":"item/agentMessage/delta","params":{"threadId":"thread-stdio","turnId":"turn-stdio","delta":"progress"}}`)
			fmt.Println(`{"id":"tool-stdio","method":"item/tool/call","params":{"threadId":"thread-stdio","turnId":"turn-stdio","tool":"opendesk_browser_observe","arguments":{}}}`)
		}
	}
	os.Exit(0)
}

func TestRealStdioAdapterCorrelatesRepliesStreamsAndToolAnswers(t *testing.T) {
	file, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	workspace := t.TempDir()
	wrapper := filepath.Join(workspace, "codex-fixture")
	quoted := "'" + strings.ReplaceAll(file, "'", "'\"'\"'") + "'"
	if err = os.WriteFile(wrapper, []byte("#!/bin/sh\nexec "+quoted+" -test.run=TestAppServerHelperProcess -- \"$@\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	agent, err := launchServer(ctx, wrapper, workspace)
	if err != nil {
		t.Fatal(err)
	}
	defer agent.Close()
	if _, err = agent.Call(ctx, "initialize", map[string]any{}); err != nil {
		t.Fatal(err)
	}
	if _, err = agent.Call(ctx, "command/exec", map[string]any{"command": []string{"touch", "bad"}}); err == nil {
		t.Fatal("generic executor RPC exposed")
	}
	if _, err = agent.Call(ctx, "turn/start", map[string]any{"threadId": "thread-stdio"}); err != nil {
		t.Fatal(err)
	}
	var tool Message
	for i := 0; i < 2; i++ {
		select {
		case msg := <-agent.Messages():
			if msg.Method == "item/tool/call" {
				tool = msg
			}
		case <-ctx.Done():
			t.Fatal("stdio events were not received")
		}
	}
	if len(tool.ID) == 0 {
		t.Fatal("server request id lost")
	}
	if err = agent.Answer(tool.ID, map[string]any{"success": false, "contentItems": []any{}}); err != nil {
		t.Fatal(err)
	}
	select {
	case msg := <-agent.Messages():
		if msg.Method != "turn/completed" {
			t.Fatal("tool answer did not reach App Server")
		}
	case <-ctx.Done():
		t.Fatal("tool answer timed out")
	}
	agent.Close()
	select {
	case <-agent.Done():
	case <-time.After(time.Second):
		t.Fatal("owned child did not close")
	}
}

func TestInstalledCodexProbe(t *testing.T) {
	if os.Getenv("OPENDESK_TEST_REAL_CODEX") != "1" {
		t.Skip("opt-in actual installed CLI probe; no model turn or login is performed")
	}
	m := NewManager(Options{})
	defer m.Close()
	caps, err := m.Probe(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(caps)
	t.Log(string(raw))
	if caps.InferenceVerified {
		t.Fatal("diagnostic probe must not claim inference")
	}
	if !caps.CLIInstalled {
		t.Fatal("opt-in CLI was not discovered")
	}
	if caps.State == "CODEX_INITIALIZING" {
		t.Fatal("probe omitted terminal diagnostic state")
	}
}

func TestInstalledCodexContinuousSession(t *testing.T) {
	if os.Getenv("OPENDESK_TEST_REAL_CODEX_TURNS") != "1" {
		t.Skip("opt-in synthetic real Codex inference; no browser or private input")
	}
	m := NewManager(Options{TurnTimeout: 2 * time.Minute, Factory: func(ctx context.Context, workspace string) (Agent, Capabilities, error) {
		agent, caps, err := defaultFactory(ctx, workspace)
		if err != nil {
			return agent, caps, err
		}
		return &safePolicyEvidenceAgent{Agent: agent, t: t}, caps, nil
	}})
	defer m.Close()
	s := openSession(t, m, false)
	check := func(s *session, prompt string, want float64) {
		invoke(t, m, req("ai.plan.start", s.id, map[string]any{"input": prompt, "outputSchema": map[string]any{"type": "object", "properties": map[string]any{"value": map[string]any{"type": "number"}}, "required": []string{"value"}, "additionalProperties": false}, "consent": Consent{Model: true, Workflow: true}}))
		deadline := time.Now().Add(100 * time.Second)
		cursor := uint64(0)
		last := ""
		count := 0
		for time.Now().Before(deadline) {
			read := invoke(t, m, req("ai.events.read", s.id, map[string]any{"cursor": cursor})).(map[string]any)
			cursor = read["cursor"].(uint64)
			for _, e := range read["events"].([]Event) {
				if e.TurnID != s.turnID {
					continue
				}
				count++
				if e.Type == "message.completed" {
					last = e.Text
				}
				if e.Type == "turn.completed" {
					if e.Status != "completed" {
						t.Fatalf("actual turn failed: %s providerCode=%s", e.Error, e.Error.ProviderCode)
					}
					var value struct {
						Value float64 `json:"value"`
					}
					if json.Unmarshal([]byte(last), &value) != nil || value.Value != want {
						t.Fatalf("synthetic memory mismatch: wanted %.0f", want)
					}
					if read["inferenceVerified"] != true {
						t.Fatal("actual inference missing terminal proof")
					}
					t.Logf("actual turn completed; correlated events=%d; synthetic value=%.0f", count, want)
					return
				}
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatal("real model did not finish within the synthetic test budget")
	}
	check(s, "This is a synthetic protocol test. Return JSON with value equal to 17. Do not call tools.", 17)
	check(s, "Continue the preceding synthetic test. Add 4 to the previous value, and return the new value as JSON. Do not call tools.", 21)
	if !s.resumable {
		closed := invoke(t, m, req("ai.session.close", s.id, map[string]any{})).(map[string]any)
		if closed["resumable"] != false {
			t.Fatal("CLI without a safe cold-resume protocol advertised recovery")
		}
		result := m.Handle(context.Background(), req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}, "resumeSessionId": s.id}))
		if result.Error == nil || result.Error.Code != "E_CODEX_UNSUPPORTED" {
			t.Fatal("unsafe cold resume was attempted")
		}
		t.Run("cold_resume", func(t *testing.T) {
			t.Skip("installed CLI has no environments override on thread/resume; safe refusal verified, cold recovery NOT_TESTED")
		})
		return
	}
	invoke(t, m, req("ai.session.close", s.id, map[string]any{}))
	resumed := invoke(t, m, req("ai.session.open", "", map[string]any{"consent": Consent{Model: true, Workflow: true}, "resumeSessionId": s.id})).(map[string]any)
	next := m.sessions[resumed["sessionId"].(string)]
	check(next, "Continue the synthetic protocol test after resume. Add 3 to the previous value and return JSON. Do not call tools.", 24)
	// Interrupt a new turn through the real App Server; its ACK alone is not PASS.
	invoke(t, m, req("ai.plan.start", next.id, map[string]any{"input": "For this synthetic cancellation check, compute a long explanation of Fibonacci recurrence, then return value 99. Do not call tools.", "consent": Consent{Model: true, Workflow: true}}))
	invoke(t, m, req("ai.plan.cancel", next.id, map[string]any{}))
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		next.mu.Lock()
		state := next.state
		next.mu.Unlock()
		if state == "CANCELLED" {
			t.Log("actual turn/interrupt followed by interrupted terminal receipt")
			return
		}
		if state == "FAILED" {
			t.Fatal("actual cancellation did not produce a terminal receipt")
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("actual cancellation terminal receipt was not observed")
}

// This opt-in test wrapper logs booleans/counts only, never full provider
// responses, environment paths, account bodies, or thread contents.
type safePolicyEvidenceAgent struct {
	Agent
	t *testing.T
}

func (a *safePolicyEvidenceAgent) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	raw, err := a.Agent.Call(ctx, method, params)
	if method == "thread/resume" && err == nil {
		var v struct {
			Thread struct {
				Environments json.RawMessage `json:"environments"`
			} `json:"thread"`
			Sandbox struct {
				Type          string `json:"type"`
				NetworkAccess bool   `json:"networkAccess"`
			} `json:"sandbox"`
			ApprovalPolicy        string   `json:"approvalPolicy"`
			ApprovalsReviewer     string   `json:"approvalsReviewer"`
			ModelProvider         string   `json:"modelProvider"`
			RuntimeWorkspaceRoots []string `json:"runtimeWorkspaceRoots"`
			InstructionSources    []string `json:"instructionSources"`
		}
		_ = json.Unmarshal(raw, &v)
		a.t.Logf("actual resume policy: noEnvironments=%t readOnly=%t networkDenied=%t approvalNever=%t reviewerUser=%t officialProvider=%t rootsCount=%d instructionCount=%d", string(v.Thread.Environments) == "[]", v.Sandbox.Type == "readOnly", !v.Sandbox.NetworkAccess, v.ApprovalPolicy == "never", v.ApprovalsReviewer == "user", v.ModelProvider == "openai", len(v.RuntimeWorkspaceRoots), len(v.InstructionSources))
	}
	return raw, err
}

func TestInstalledCodexAmbientMCPIsNotStarted(t *testing.T) {
	if os.Getenv("OPENDESK_TEST_REAL_CODEX") != "1" {
		t.Skip("opt-in real CLI with synthetic config, no credentials and no inference")
	}
	path, err := discoverCodex()
	if err != nil {
		t.Fatal(err)
	}
	fixture := t.TempDir()
	marker := filepath.Join(fixture, "mcp-was-started")
	config := fmt.Sprintf("[mcp_servers.ambient_canary]\ncommand = '/bin/sh'\nargs = ['-c', 'echo unexpected > %s']\n", marker)
	if err = os.WriteFile(filepath.Join(fixture, "config.toml"), []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_HOME", fixture)
	workspace := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	agent, err := launchServer(ctx, path, workspace)
	if err != nil {
		t.Fatal(err)
	}
	defer agent.Close()
	if _, err = agent.Call(ctx, "initialize", map[string]any{"clientInfo": map[string]any{"name": "opendesk_browser_workflow_canary", "version": "16.0.0"}, "capabilities": map[string]any{"experimentalApi": true}}); err != nil {
		t.Fatal(err)
	}
	if err = agent.write(map[string]any{"method": "initialized"}); err != nil {
		t.Fatal(err)
	}
	if _, err = startThread(ctx, agent, workspace, "", "", false, true); err != nil {
		t.Fatal(err)
	}
	// SessionConfigured can precede asynchronous MCP startup. Keep the actual
	// child alive for a bounded startup window before inspecting the canary.
	select {
	case <-time.After(time.Second):
	case <-agent.Done():
		t.Fatal("actual App Server exited before the MCP startup observation window")
	case <-ctx.Done():
		t.Fatal("MCP startup observation window timed out")
	}
	if _, err = os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("ambient user MCP executable was started")
	}
	t.Log("actual app-server accepted no-environment thread; synthetic ambient MCP canary did not start during the live 1s startup window")
}

func TestInstalledCodexCancellation(t *testing.T) {
	if os.Getenv("OPENDESK_TEST_REAL_CODEX_TURNS") != "1" {
		t.Skip("opt-in synthetic real Codex turn and interrupt; no browser or private input")
	}
	m := NewManager(Options{})
	defer m.Close()
	s := openSession(t, m, false)
	invoke(t, m, req("ai.plan.start", s.id, map[string]any{"input": "This is a synthetic cancellation protocol test. Produce a long explanation of Fibonacci recurrence. Do not call tools.", "consent": Consent{Model: true, Workflow: true}}))
	// Wait for actual model output, so this proves an active inference can be
	// interrupted. A start RPC acknowledgement alone may precede activation.
	streamed := false
	streamDeadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(streamDeadline) {
		s.mu.Lock()
		for _, e := range s.events {
			if e.Type == "message.delta" {
				streamed = true
			}
		}
		s.mu.Unlock()
		if streamed {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if !streamed {
		t.Fatal("actual inference did not start streaming before cancel test")
	}
	invoke(t, m, req("ai.plan.cancel", s.id, map[string]any{}))
	deadline := time.Now().Add(6 * time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		state := s.state
		s.mu.Unlock()
		if state == "CANCELLED" {
			t.Log("actual turn/interrupt followed by interrupted terminal receipt; inference not claimed")
			return
		}
		if state == "FAILED" || state == "COMPLETED" {
			t.Fatal("actual cancel did not produce an interrupted terminal receipt")
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("actual cancellation terminal receipt was not observed")
}

func TestInstalledCodexWorkflowProposal(t *testing.T) {
	if os.Getenv("OPENDESK_TEST_REAL_CODEX_WORKFLOW") != "1" {
		t.Skip("opt-in synthetic Browser workflow fixture; no webpage content is read")
	}
	evidenceDir := filepath.Join("..", "..", ".runtime", "tests", "browserai")
	raw, err := os.ReadFile(filepath.Join(evidenceDir, "workflow-input.json"))
	if err != nil {
		t.Fatal("create the documented synthetic Browser input fixture first")
	}
	var fixture struct {
		Input string `json:"input"`
	}
	if strict(raw, &fixture) != nil || len(fixture.Input) == 0 || len(fixture.Input) > MaxInputBytes {
		t.Fatal("invalid synthetic Browser fixture")
	}
	m := NewManager(Options{})
	defer m.Close()
	s := openSession(t, m, false)
	invoke(t, m, req("ai.plan.start", s.id, map[string]any{"input": fixture.Input, "consent": Consent{Model: true, Workflow: true}}))
	deadline := time.Now().Add(60 * time.Second)
	cursor := uint64(0)
	last := ""
	count := 0
	for time.Now().Before(deadline) {
		read := invoke(t, m, req("ai.events.read", s.id, map[string]any{"cursor": cursor})).(map[string]any)
		cursor = read["cursor"].(uint64)
		for _, e := range read["events"].([]Event) {
			if e.TurnID != s.turnID {
				continue
			}
			count++
			if e.Type == "message.completed" {
				last = e.Text
			}
			if e.Type == "turn.completed" {
				if e.Status != "completed" || read["inferenceVerified"] != true || !json.Valid([]byte(last)) {
					t.Fatal("actual workflow proposal did not complete as JSON")
				}
				if err = os.WriteFile(filepath.Join(evidenceDir, "real-workflow-proposal.json"), []byte(last+"\n"), 0600); err != nil {
					t.Fatal(err)
				}
				t.Logf("actual workflow proposal completed; correlated events=%d; synthetic JSON bytes=%d; Browser compiler validation is separate", count, len(last))
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("actual workflow proposal did not finish within the synthetic test budget")
}
