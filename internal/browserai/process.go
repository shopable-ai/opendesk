package browserai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Agent is an internal seam, not an extension-configurable transport. Only the
// fixed App Server methods below can be called by the workflow owner.
type Agent interface {
	Call(context.Context, string, any) (json.RawMessage, error)
	Answer(json.RawMessage, any) error
	Messages() <-chan Message
	Done() <-chan struct{}
	Close()
}

type Message struct {
	ID     json.RawMessage
	Method string
	Params json.RawMessage
}
type Factory func(context.Context, string) (Agent, Capabilities, error)

var allowedRPC = map[string]bool{
	"initialize": true, "account/read": true, "config/read": true, "experimentalFeature/list": true,
	"thread/start": true, "thread/resume": true, "thread/unsubscribe": true,
	"turn/start": true, "turn/interrupt": true,
}

// A schema field gate alone cannot prove future startup/tool-registration
// behavior. Extend this reviewed list only with source and real CLI evidence.
var auditedCodexVersions = map[string]bool{"codex-cli 0.159.2": true}

// This list follows Codex rust-v0.159.2's own isolated structured-request
// implementation, with additional browser/desktop entry points disabled.
// See docs/integrations/browser/workflow-codex-app-server-r16.zh-CN.md.
var disabledFeatures = []string{
	"apps", "code_mode", "code_mode_only", "context_management", "current_time_reminder",
	"deferred_executor", "enable_fanout", "goals", "hooks", "image_generation", "memories",
	"multi_agent", "multi_agent_v2", "plugins", "request_permissions_tool", "shell_snapshot",
	"shell_tool", "standalone_web_search", "token_budget", "tool_suggest", "unified_exec", "view_image",
	"browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "js_repl",
	"in_app_browser", "in_app_local_automation",
}

func fixedConfig() map[string]any {
	v := map[string]any{
		"model_provider": "openai", "web_search": "disabled", "default_permissions": ":read-only",
		"openai_base_url": "", "chatgpt_base_url": "https://chatgpt.com/backend-api/",
		"instructions": planningInstructions(), "developer_instructions": planningInstructions(), "compact_prompt": planningInstructions(),
		"history.persistence": "none", "include_environment_context": false,
		"cloud.skills.enabled": false, "skills.include_instructions": false, "skills.bundled.enabled": false,
		"features.skip_host_skill_discovery": true, "tools.experimental_request_user_input.enabled": false,
		"tools.update_plan.enabled": true, "notify": []any{}, "project_doc_max_bytes": 0,
		"analytics.enabled": false, "feedback.enabled": false,
		"otel.exporter": "none", "otel.trace_exporter": "none", "otel.metrics_exporter": "none",
		"otel.log_user_prompt": false, "otel.log_agent_responses": false,
	}
	for _, name := range disabledFeatures {
		v["features."+name] = false
	}
	return v
}

func processArgs(workspace string) []string {
	args := []string{"app-server", "--listen", "stdio://"}
	config := fixedConfig()
	config["model_instructions_file"] = filepath.Join(workspace, "instructions.txt")
	config["experimental_compact_prompt_file"] = filepath.Join(workspace, "compact.txt")
	keys := make([]string, 0, len(config))
	for key := range config {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		// These owned config values are JSON scalars/empty arrays, also valid
		// TOML literals. No caller supplied command, argument, or config enters.
		value, _ := json.Marshal(config[key])
		args = append(args, "-c", key+"="+string(value))
	}
	return args
}

func minimalEnvironment() []string {
	// Keep official CLI credential-store discovery in Codex itself. Never read
	// its contents or inherit API keys, injected Node options, alternate model
	// endpoints, preloads, proxy credentials, or remote execution settings.
	names := []string{"HOME", "USER", "LOGNAME", "PATH", "CODEX_HOME", "TMPDIR", "TMP", "TEMP",
		"LANG", "LC_ALL", "LC_CTYPE", "SYSTEMROOT", "WINDIR"}
	var env []string
	for _, name := range names {
		if v, ok := os.LookupEnv(name); ok {
			env = append(env, name+"="+v)
		}
	}
	// Preserve the user's existing network route without inheriting proxy
	// credentials or arbitrary process injection. Native launches otherwise
	// lose local VPN/proxy connectivity even while the same CLI works in a
	// terminal. These values stay in the owned child, never in model input.
	for _, name := range []string{"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"} {
		if v, ok := os.LookupEnv(name); ok && safeProxyURL(v) {
			env = append(env, name+"="+v)
		}
	}
	for _, name := range []string{"NO_PROXY", "no_proxy"} {
		if v, ok := os.LookupEnv(name); ok && len(v) <= 4096 && !strings.ContainsAny(v, "\r\n\x00") {
			env = append(env, name+"="+v)
		}
	}
	// Audited Codex 0.159.2 consumes this marker before worker threads and
	// selects DisabledEphemeral. A planning process must not resolve or honor
	// persisted remote-control enrollment, even for the same CLI account.
	env = append(env, "CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED=1")
	return env
}

func safeProxyURL(value string) bool {
	if len(value) > 2048 || strings.ContainsAny(value, "\r\n\x00") {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return false
	}
	switch u.Scheme {
	case "http", "https", "socks5", "socks5h":
		return true
	default:
		return false
	}
}

func discoverCodex() (string, error) {
	if file, err := exec.LookPath("codex"); err == nil && filepath.IsAbs(file) {
		return file, nil
	}
	// Chrome's login-item PATH can omit Homebrew/npm. Only known installation
	// slots of this OS user are checked; no shell rc files or user trees scanned.
	candidates := []string{"/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/opt/codex/bin/codex"}
	if home, err := os.UserHomeDir(); err == nil {
		for _, rel := range []string{".local/bin/codex", ".npm-global/bin/codex", ".bun/bin/codex", ".volta/bin/codex"} {
			candidates = append(candidates, filepath.Join(home, rel))
		}
	}
	for _, file := range candidates {
		if s, err := os.Stat(file); err == nil && s.Mode().IsRegular() && s.Mode().Perm()&0111 != 0 {
			return file, nil
		}
	}
	return "", failure("E_CODEX_MISSING")
}

type limitedOutput struct {
	bytes    []byte
	limit    int
	exceeded bool
}

func (w *limitedOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := w.limit - len(w.bytes)
	if remaining < len(p) {
		w.exceeded = true
		p = p[:remaining]
	}
	w.bytes = append(w.bytes, p...)
	return n, nil
}

func ownedCommand(ctx context.Context, path, workspace string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Dir = workspace
	cmd.Env = minimalEnvironment()
	cmd.Stderr = io.Discard
	configureProcess(cmd)
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		terminateProcess(cmd)
		return nil
	}
	cmd.WaitDelay = time.Second
	return cmd
}

func inspectExecutable(ctx context.Context, path, workspace string) (string, bool, error) {
	var output limitedOutput
	output.limit = 256
	cmd := ownedCommand(ctx, path, workspace, "--version")
	cmd.Stdout = &output
	if cmd.Run() != nil || output.exceeded {
		return "", false, failure("E_CODEX_UNSUPPORTED")
	}
	version := strings.TrimSpace(string(output.bytes))
	if !strings.HasPrefix(version, "codex-cli ") || strings.ContainsAny(version, "\n\r") {
		return "", false, failure("E_CODEX_UNSUPPORTED")
	}
	if !auditedCodexVersions[version] {
		return version, false, failure("E_CODEX_UNSUPPORTED")
	}
	// Generate the actual installed protocol without loading a thread, account
	// history, tools, or inference. Unknown fields may be silently ignored by
	// older servers, so sending modern JSON alone is not a compatibility check.
	schemaDir, err := os.MkdirTemp(workspace, "protocol-")
	if err != nil {
		return "", false, failure("E_PROVIDER")
	}
	defer os.RemoveAll(schemaDir)
	cmd = ownedCommand(ctx, path, workspace, "app-server", "generate-json-schema", "--experimental", "--out", schemaDir)
	cmd.Stdout = io.Discard
	if cmd.Run() != nil {
		return version, false, failure("E_CODEX_UNSUPPORTED")
	}
	resumeSupported := false
	for file, fields := range map[string][]string{
		"ThreadStartParams.json":  {"environments", "runtimeWorkspaceRoots", "selectedCapabilityRoots", "dynamicTools", "config"},
		"TurnStartParams.json":    {"environments", "runtimeWorkspaceRoots", "sandboxPolicy", "outputSchema"},
		"ThreadResumeParams.json": {"threadId", "runtimeWorkspaceRoots", "config"},
	} {
		f, err := os.Open(filepath.Join(schemaDir, "v2", file))
		if err != nil {
			return version, false, failure("E_CODEX_UNSUPPORTED")
		}
		raw, readErr := io.ReadAll(io.LimitReader(f, 2*1024*1024+1))
		f.Close()
		if readErr != nil || len(raw) > 2*1024*1024 {
			return version, false, failure("E_CODEX_UNSUPPORTED")
		}
		var schema struct {
			Properties map[string]json.RawMessage `json:"properties"`
		}
		if json.Unmarshal(raw, &schema) != nil {
			return version, false, failure("E_CODEX_UNSUPPORTED")
		}
		if file == "ThreadResumeParams.json" {
			resumeSupported = len(schema.Properties["environments"]) > 0
		}
		for _, name := range fields {
			if len(schema.Properties[name]) == 0 {
				return version, false, failure("E_CODEX_UNSUPPORTED")
			}
		}
	}
	return version, resumeSupported, nil
}

type rpcResult struct {
	Result json.RawMessage
	Error  json.RawMessage
}
type appServer struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	mu       sync.Mutex
	writeMu  sync.Mutex
	seq      uint64
	pending  map[string]chan rpcResult
	messages chan Message
	done     chan struct{}
	closed   sync.Once
	cancel   context.CancelFunc
}

func launchServer(ctx context.Context, path, workspace string) (*appServer, error) {
	if err := verifyNoEnvironmentRegistry(); err != nil {
		return nil, err
	}
	for _, name := range []string{"instructions.txt", "compact.txt"} {
		if err := os.WriteFile(filepath.Join(workspace, name), []byte(planningInstructions()), 0600); err != nil {
			return nil, failure("E_PROVIDER")
		}
	}
	procCtx, cancel := context.WithCancel(ctx)
	cmd := ownedCommand(procCtx, path, workspace, processArgs(workspace)...)
	in, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, failure("E_PROVIDER")
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		in.Close()
		cancel()
		return nil, failure("E_PROVIDER")
	}
	if err = cmd.Start(); err != nil {
		in.Close()
		cancel()
		return nil, failure("E_CODEX_UNSUPPORTED")
	}
	p := &appServer{cmd: cmd, stdin: in, pending: map[string]chan rpcResult{}, messages: make(chan Message, 128), done: make(chan struct{}), cancel: cancel}
	go p.read(out)
	go func() { _ = cmd.Wait(); p.Close() }()
	return p, nil
}

func verifyNoEnvironmentRegistry() error {
	// Codex 0.159.2 connects environments.toml entries before initialize. They
	// can contain stdio executables, so per-thread environments:[] is too late
	// to disable that startup path. Check existence only; never read or alter it.
	root := os.Getenv("CODEX_HOME")
	if root == "" {
		home, err := os.UserHomeDir()
		if err != nil || !filepath.IsAbs(home) {
			return failure("E_CODEX_POLICY")
		}
		root = filepath.Join(home, ".codex")
	}
	if !filepath.IsAbs(root) {
		return failure("E_CODEX_POLICY")
	}
	if _, err := os.Lstat(filepath.Join(root, "environments.toml")); !os.IsNotExist(err) {
		return failure("E_CODEX_POLICY")
	}
	return nil
}

func (p *appServer) Close() {
	p.closed.Do(func() { close(p.done); _ = p.stdin.Close(); p.cancel(); terminateProcess(p.cmd) })
}
func (p *appServer) Done() <-chan struct{}    { return p.done }
func (p *appServer) Messages() <-chan Message { return p.messages }
func (p *appServer) write(v any) error {
	raw, err := json.Marshal(v)
	if err != nil || len(raw) > 512*1024 {
		return failure("E_LIMIT")
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	select {
	case <-p.done:
		return failure("E_DISCONNECTED")
	default:
	}
	if _, err = p.stdin.Write(append(raw, '\n')); err != nil {
		p.Close()
		return failure("E_DISCONNECTED")
	}
	return nil
}
func (p *appServer) read(r io.Reader) {
	defer p.Close()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 4096), 512*1024)
	for scanner.Scan() {
		var v struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
			Result json.RawMessage `json:"result"`
			Error  json.RawMessage `json:"error"`
		}
		if json.Unmarshal(scanner.Bytes(), &v) != nil {
			return
		}
		if v.Method != "" {
			select {
			case p.messages <- Message{ID: v.ID, Method: v.Method, Params: v.Params}:
			case <-p.done:
				return
			default:
				return
			}
		} else if len(v.ID) > 0 {
			p.mu.Lock()
			ch := p.pending[string(v.ID)]
			delete(p.pending, string(v.ID))
			p.mu.Unlock()
			if ch != nil {
				ch <- rpcResult{Result: v.Result, Error: v.Error}
			}
		} else {
			return
		}
	}
}

func (p *appServer) Call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if !allowedRPC[method] {
		return nil, failure("E_CAPABILITY")
	}
	p.mu.Lock()
	p.seq++
	id := fmt.Sprintf("od-%d", p.seq)
	keyBytes, _ := json.Marshal(id)
	key := string(keyBytes)
	ch := make(chan rpcResult, 1)
	p.pending[key] = ch
	p.mu.Unlock()
	defer func() { p.mu.Lock(); delete(p.pending, key); p.mu.Unlock() }()
	if err := p.write(map[string]any{"id": id, "method": method, "params": params}); err != nil {
		return nil, err
	}
	select {
	case reply := <-ch:
		if len(reply.Error) > 0 && string(reply.Error) != "null" {
			return nil, classifyProviderError(reply.Error)
		}
		if len(reply.Result) == 0 {
			return nil, failure("E_CODEX_UNSUPPORTED")
		}
		return reply.Result, nil
	case <-ctx.Done():
		p.Close()
		return nil, failure("E_OUTCOME_UNKNOWN")
	case <-p.done:
		return nil, failure("E_DISCONNECTED")
	}
}

func (p *appServer) Answer(id json.RawMessage, result any) error {
	if len(id) == 0 || len(id) > 128 || !json.Valid(id) {
		return failure("E_SCHEMA")
	}
	return p.write(map[string]any{"id": id, "result": result})
}

func classifyProviderError(raw json.RawMessage) *Error {
	// Only a fixed classification crosses the trust boundary. In particular a
	// provider error may contain auth headers, file paths, or account identity.
	s := strings.ToLower(string(raw))
	var details struct {
		CodexErrorInfo json.RawMessage `json:"codexErrorInfo"`
		Error          struct {
			CodexErrorInfo json.RawMessage `json:"codexErrorInfo"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &details)
	if len(details.CodexErrorInfo) == 0 {
		details.CodexErrorInfo = details.Error.CodexErrorInfo
	}
	var providerCode string
	_ = json.Unmarshal(details.CodexErrorInfo, &providerCode)
	known := map[string]bool{"contextWindowExceeded": true, "sessionBudgetExceeded": true, "usageLimitExceeded": true, "rateLimitExceeded": true, "flexUnavailable": true, "serverOverloaded": true, "cyberPolicy": true, "misalignmentPolicyViolation": true, "tooManyDenials": true, "internalServerError": true, "unauthorized": true, "badRequest": true, "sandboxError": true, "other": true}
	if !known[providerCode] {
		providerCode = ""
	}
	withCode := func(code string) *Error { e := failure(code); e.ProviderCode = providerCode; return e }
	switch {
	case strings.Contains(s, "rate_limit"), strings.Contains(s, "ratelimit"), strings.Contains(s, "usage limit"), strings.Contains(s, "usagelimitexceeded"), strings.Contains(s, "sessionbudgetexceeded"), strings.Contains(s, "quota"), strings.Contains(s, "429"):
		return withCode("E_RATE_LIMITED")
	case strings.Contains(s, "unauthorized"), strings.Contains(s, "authentication"), strings.Contains(s, "not logged"), strings.Contains(s, "401"):
		return withCode("E_CODEX_LOGIN_REQUIRED")
	case strings.Contains(s, "modelnotfound"), strings.Contains(s, "model_not_found"), strings.Contains(s, "model unavailable"), strings.Contains(s, "unsupported model"):
		return withCode("E_MODEL_UNAVAILABLE")
	case strings.Contains(s, "network"), strings.Contains(s, "connection"), strings.Contains(s, "dns"), strings.Contains(s, "timed out"), strings.Contains(s, "httpconnectionfailed"):
		return withCode("E_NETWORK")
	case strings.Contains(s, "-32601"), strings.Contains(s, "-32602"), strings.Contains(s, "experimentalapi"), strings.Contains(s, "unknown field"):
		return withCode("E_CODEX_UNSUPPORTED")
	default:
		return withCode("E_PROVIDER")
	}
}

func defaultFactory(ctx context.Context, workspace string) (Agent, Capabilities, error) {
	caps := initialCapabilities()
	path, err := discoverCodex()
	if err != nil {
		caps.State = "CODEX_MISSING"
		caps.Reason = "E_CODEX_MISSING"
		return nil, caps, err
	}
	caps.CLIInstalled = true
	checkCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	version, resumeSupported, err := inspectExecutable(checkCtx, path, workspace)
	caps.CLIVersion = version
	caps.ResumeSupported = resumeSupported
	if err != nil {
		caps.State = "CODEX_UNSUPPORTED"
		caps.Reason = publicError(err).Code
		return nil, caps, err
	}
	p, err := launchServer(ctx, path, workspace)
	if err != nil {
		caps.State = "CODEX_UNSUPPORTED"
		return nil, caps, err
	}
	failed := true
	defer func() {
		if failed {
			p.Close()
		}
	}()
	if _, err = p.Call(checkCtx, "initialize", map[string]any{
		"clientInfo":   map[string]string{"name": "opendesk_browser_workflow", "title": "OpenDesk Browser Workflow", "version": "16.0.0"},
		"capabilities": map[string]any{"experimentalApi": true},
	}); err != nil {
		caps.State = "CODEX_UNSUPPORTED"
		caps.Reason = publicError(err).Code
		return nil, caps, err
	}
	if err = p.write(map[string]any{"method": "initialized"}); err != nil {
		return nil, caps, err
	}
	caps.AppServerCompatible = true
	account, err := p.Call(checkCtx, "account/read", map[string]any{"refreshToken": false})
	if err != nil {
		caps.State = providerState(err)
		caps.Reason = publicError(err).Code
		return nil, caps, err
	}
	var auth struct {
		Account *struct {
			Type string `json:"type"`
		} `json:"account"`
	}
	if json.Unmarshal(account, &auth) != nil {
		caps.State = "CODEX_UNSUPPORTED"
		return nil, caps, failure("E_CODEX_UNSUPPORTED")
	}
	// Other auth modes are not silently relabelled as the user's ChatGPT plan.
	if auth.Account == nil {
		caps.AuthState = "none"
		caps.State = "CODEX_LOGIN_REQUIRED"
		return nil, caps, failure("E_CODEX_LOGIN_REQUIRED")
	}
	if auth.Account.Type != "chatgpt" && auth.Account.Type != "apiKey" {
		caps.State = "CODEX_UNSUPPORTED"
		return nil, caps, failure("E_CODEX_UNSUPPORTED")
	}
	caps.AuthState = auth.Account.Type
	if auth.Account.Type != "chatgpt" {
		caps.State = "CODEX_LOGIN_REQUIRED"
		caps.Reason = "CHATGPT_LOGIN_REQUIRED"
		return nil, caps, failure("E_CODEX_LOGIN_REQUIRED")
	}
	caps.State = "READY_FOR_TURN"
	caps.ReadyForTurn = true
	caps.SupportedTools = []string{"browser.observe"}
	failed = false
	return p, caps, nil
}
