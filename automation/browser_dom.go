package automation

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/dop251/goja"
)

//go:embed browser_core_adapter.mjs
var browserCoreAdapter string

// BrowserDOMPolicy is fixed by a trusted execution/MCP host, never by page
// content or JavaScript. It narrows the installed Core's loopback permission.
type BrowserDOMPolicy struct {
	CoreRoot string
	Origin   string
	Tab      int
}

// BrowserDOMRuntime owns only one execution's Core client process. The
// installed Broker/Extension remain the Browser execution subsystem.
type BrowserDOMRuntime struct {
	ctx         context.Context
	cancel      context.CancelFunc
	policy      BrowserDOMPolicy
	executionID string
	source      string
	enabled     bool
	mu          sync.Mutex
	closed      atomic.Bool
	cmd         *exec.Cmd
	stdin       io.WriteCloser
	stdout      *bufio.Scanner
	metadata    map[string]any
}

func NewBrowserDOMRuntime(ctx context.Context, policy BrowserDOMPolicy, executionID, source string, enabled bool) *BrowserDOMRuntime {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	if executionID == "" {
		executionID = "browser-" + browserRequestID()
	}
	return &BrowserDOMRuntime{ctx: ctx, cancel: cancel, policy: policy, executionID: executionID, source: source, enabled: enabled}
}

func browserRequestID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return hex.EncodeToString(bytes)
}

func browserFailure(code, outcome string) map[string]any {
	return map[string]any{"error": map[string]any{"code": code, "outcome": outcome}, "outcome": outcome}
}

func (b *BrowserDOMRuntime) exchange(input map[string]any) map[string]any {
	bytes, err := json.Marshal(input)
	if err != nil || len(bytes) > 65536 {
		return browserFailure("MESSAGE_TOO_LARGE", "NOT_DISPATCHED")
	}
	if _, err := b.stdin.Write(append(bytes, '\n')); err != nil {
		return browserFailure("BROWSER_CLIENT_DISCONNECTED", "OUTCOME_UNKNOWN")
	}
	if !b.stdout.Scan() {
		return browserFailure("BROWSER_CLIENT_DISCONNECTED", "OUTCOME_UNKNOWN")
	}
	var response map[string]any
	if json.Unmarshal(b.stdout.Bytes(), &response) != nil || len(response) == 0 {
		return browserFailure("BROWSER_ADAPTER_RESPONSE_INVALID", "OUTCOME_UNKNOWN")
	}
	return response
}

func (b *BrowserDOMRuntime) start() map[string]any {
	if !b.enabled {
		return browserFailure("BROWSER_DISABLED", "NOT_DISPATCHED")
	}
	if runtime.GOOS != "darwin" {
		return browserFailure("BROWSER_PLATFORM_UNSUPPORTED", "NOT_DISPATCHED")
	}
	if !filepath.IsAbs(b.policy.CoreRoot) || b.policy.Origin == "" || b.policy.Tab < 0 {
		return browserFailure("BROWSER_NOT_CONFIGURED", "NOT_DISPATCHED")
	}
	if b.closed.Load() || b.ctx.Err() != nil {
		return browserFailure("BROWSER_EXECUTION_CLOSED", "NOT_DISPATCHED")
	}
	if b.cmd != nil {
		if b.metadata == nil {
			return browserFailure("BROWSER_CLIENT_START_FAILED", "NOT_DISPATCHED")
		}
		return b.metadata
	}
	b.cmd = exec.CommandContext(b.ctx, "node", "--input-type=module", "-e", browserCoreAdapter)
	b.cmd.Dir = b.policy.CoreRoot
	var err error
	b.stdin, err = b.cmd.StdinPipe()
	if err != nil {
		return browserFailure("BROWSER_CLIENT_START_FAILED", "NOT_DISPATCHED")
	}
	out, err := b.cmd.StdoutPipe()
	if err != nil {
		return browserFailure("BROWSER_CLIENT_START_FAILED", "NOT_DISPATCHED")
	}
	b.cmd.Stderr = io.Discard // No private installation errors or credential text.
	if err = b.cmd.Start(); err != nil {
		return browserFailure("BROWSER_CLIENT_START_FAILED", "NOT_DISPATCHED")
	}
	b.stdout = bufio.NewScanner(out)
	b.stdout.Buffer(make([]byte, 65536), 65536)
	b.metadata = b.exchange(map[string]any{"configure": map[string]any{
		"coreRoot": b.policy.CoreRoot, "origin": b.policy.Origin, "tab": b.policy.Tab,
		"executionId": b.executionID, "source": b.source,
		"bridgeCodeSha256": browserAdapterHash(),
	}})
	if b.metadata["error"] == nil && b.metadata["configured"] != true {
		b.metadata = browserFailure("BROWSER_ADAPTER_RESPONSE_INVALID", "OUTCOME_UNKNOWN")
	}
	return b.metadata
}

func browserAdapterHash() string {
	value := sha256.Sum256([]byte(browserCoreAdapter))
	return hex.EncodeToString(value[:])
}

// browserDOMIntegerAtLeast accepts Goja-exported and MCP JSON integers while
// rejecting fractional, non-finite and out-of-range browser identities.
func browserDOMIntegerAtLeast(value any, minimum float64) bool {
	var number float64
	switch typed := value.(type) {
	case int:
		number = float64(typed)
	case int64:
		number = float64(typed)
	case float64:
		number = typed
	default:
		return false
	}
	return number >= minimum && number <= 9007199254740991 && math.Trunc(number) == number
}

// Reject malformed envelopes before starting Node. Browser Core remains the
// sole owner of selector semantics, opaque target identity and actionability.
func browserDOMBasicArgsValid(operation string, params map[string]any) bool {
	if timeout, present := params["timeoutMs"]; present && !browserDOMIntegerAtLeast(timeout, 1) {
		return false
	}
	object := func(key string) (map[string]any, bool) {
		value, ok := params[key].(map[string]any)
		return value, ok && len(value) > 0
	}
	optionalString := func(key string) bool {
		value, present := params[key]
		if !present {
			return true
		}
		_, ok := value.(string)
		return ok
	}
	switch operation {
	case "status", "tabs":
		return true
	case "observe", "locate":
		scope, ok := object("scope")
		if !ok || !browserDOMIntegerAtLeast(scope["tab"], 0) || !browserDOMIntegerAtLeast(scope["frame"], 0) {
			return false
		}
		for key := range scope {
			if key != "tab" && key != "frame" && key != "document" {
				return false
			}
		}
		if document, present := scope["document"]; present {
			value, valid := document.(string)
			if !valid || strings.TrimSpace(value) == "" {
				return false
			}
		}
		if operation == "observe" {
			return true
		}
		query, ok := object("query")
		if !ok {
			return false
		}
		kind, valid := query["kind"].(string)
		return valid && strings.TrimSpace(kind) != ""
	case "read":
		_, ok := object("target")
		return ok && (params["field"] == "text" || params["field"] == "value")
	case "click", "fill":
		_, ok := object("target")
		if !ok || !optionalString("value") || !optionalString("sourceReadRequestId") {
			return false
		}
		if operation == "fill" {
			_, provided := params["value"].(string)
			return provided
		}
		return true
	case "wait", "verify":
		_, ok := object("target")
		if !ok {
			return false
		}
		condition, ok := object("condition")
		if !ok || (condition["field"] != "text" && condition["field"] != "value") {
			return false
		}
		switch condition["kind"] {
		case "equals":
			_, provided := condition["expected"].(string)
			return provided
		case "nonEmpty":
			_, provided := condition["expected"]
			return !provided
		default:
			return false
		}
	default:
		return false
	}
}

func (b *BrowserDOMRuntime) Call(operation string, args map[string]any) map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	// Preserve disabled/closed failures, but reject malformed calls before
	// starting the Browser Core client or creating execution trace resources.
	if !b.enabled {
		return browserFailure("BROWSER_DISABLED", "NOT_DISPATCHED")
	}
	if b.closed.Load() || b.ctx.Err() != nil {
		return browserFailure("BROWSER_EXECUTION_CLOSED", "NOT_DISPATCHED")
	}
	if args == nil {
		args = map[string]any{}
	}
	allowed := map[string]string{
		"status": "", "tabs": "", "observe": "scope timeoutMs", "locate": "scope query timeoutMs",
		"read": "target field timeoutMs", "act": "operation target value sourceReadRequestId timeoutMs",
		"wait": "target condition timeoutMs", "verify": "target condition timeoutMs",
	}
	keys, supported := allowed[operation]
	if !supported {
		return browserFailure("UNSUPPORTED_OPERATION", "NOT_DISPATCHED")
	}
	for key := range args {
		if !strings.Contains(" "+keys+" ", " "+key+" ") {
			return browserFailure("INVALID_ARGUMENT", "NOT_DISPATCHED")
		}
	}
	params := make(map[string]any, len(args))
	for key, value := range args {
		params[key] = value
	}
	if operation == "act" {
		operation, _ = params["operation"].(string)
		delete(params, "operation")
		if operation != "fill" && operation != "click" {
			return browserFailure("UNSUPPORTED_OPERATION", "NOT_DISPATCHED")
		}
	}
	if !browserDOMBasicArgsValid(operation, params) {
		return browserFailure("INVALID_ARGUMENT", "NOT_DISPATCHED")
	}
	metadata := b.start()
	if metadata["error"] != nil {
		return metadata
	}
	input := map[string]any{"requestId": browserRequestID(), "operation": operation, "params": params,
		"caller": map[string]any{"transport": b.source, "capability": "BrowserDOM", "executionId": b.executionID}}
	if timeout, ok := params["timeoutMs"]; ok {
		input["timeoutMs"] = timeout
		delete(params, "timeoutMs")
	}
	response := b.exchange(input)
	if response["error"] == nil && (response["outcome"] != "SUCCEEDED" || response["requestId"] != input["requestId"]) {
		response = browserFailure("BROWSER_ADAPTER_RESPONSE_INVALID", "OUTCOME_UNKNOWN")
	}
	if response["requestId"] == nil {
		response["requestId"] = input["requestId"]
	}
	response["browserExecution"] = metadata
	return response
}

func (b *BrowserDOMRuntime) Close() {
	if b == nil || b.closed.Swap(true) {
		return
	}
	b.cancel() // Cancels a blocked native client read independently of Goja.
}

func (b *BrowserDOMRuntime) Wait() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.cmd != nil && b.cmd.Process != nil {
		_ = b.cmd.Wait()
	}
}

func registerBrowserDOM(vm *goja.Runtime, opts InitJSOptions) *BrowserDOMRuntime {
	owner := NewBrowserDOMRuntime(opts.Context, opts.BrowserDOMPolicy, opts.ExecutionID, "recipe", opts.EnableBrowserDOM)
	object := vm.NewObject()
	for _, name := range []string{"status", "tabs", "observe", "locate", "read", "act", "wait", "verify"} {
		method := name
		_ = object.Set(method, func(call goja.FunctionCall) goja.Value {
			var args map[string]any
			if len(call.Arguments) > 0 && !goja.IsUndefined(call.Argument(0)) {
				var ok bool
				args, ok = call.Argument(0).Export().(map[string]any)
				if !ok {
					return vm.ToValue(browserFailure("INVALID_ARGUMENT", "NOT_DISPATCHED"))
				}
			}
			return vm.ToValue(owner.Call(method, args))
		})
	}
	_ = object.Set("close", func() { owner.Close() })
	_ = vm.Set("BrowserDOM", object)
	return owner
}

// BrowserMCPCall preserves the Core response/error/outcome instead of wrapping
// structured failure classes into an undifferentiated MCP internal error.
func (b *BrowserDOMRuntime) BrowserMCPCall(operation string, args map[string]any) (map[string]any, error) {
	return b.Call(strings.TrimSpace(operation), args), nil
}
