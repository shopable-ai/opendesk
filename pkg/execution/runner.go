package execution

import (
	"opendesk/automation"
	"opendesk/pkg/nativeextension"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

// Request 描述一次脚本执行请求。
type Request struct {
	// Context cancels the complete execution lifecycle: JavaScript evaluation,
	// timers, HTTP workers, and queued Promise callbacks.
	Context        context.Context
	ExecutionID    string
	SourceLabel    string
	Ext            string
	StackMode      string
	ScriptHash     string
	ScriptContent  []byte
	TimeoutMinutes int
	// EnableNativeExtensions opts a trusted local execution into the
	// manifest-generated registry. It never enables arbitrary executable paths.
	EnableNativeExtensions bool
	// EnableUnsafeNativeExtensionCall separately enables the V0 low-level
	// NativeExtension.call compatibility surface for explicit local diagnostics.
	EnableUnsafeNativeExtensionCall bool
	// NativeExtensionRoots is an internal test seam. Product executions use the
	// documented portable/app-bundled and current-user roots.
	NativeExtensionRoots []nativeextension.DiscoveryRoot
	// Timeout is the exact execution deadline used by transports that accept
	// sub-minute timeouts. TimeoutMinutes remains for CLI compatibility.
	Timeout   time.Duration
	Artifacts ExecutionArtifacts
	Selection TerminalSelection
}

// Run 执行脚本并返回结果与摘要。
func Run(req Request) (ExecutionResult, AgentSummary, error) {
	startedAt := time.Now()
	emitter, err := NewEmitter(req.ExecutionID, req.Selection, req.Artifacts, startedAt)
	if err != nil {
		return ExecutionResult{}, AgentSummary{}, err
	}
	defer emitter.Close()
	return RunWithEmitter(req, emitter)
}

// RunWithEmitter 使用现有发射器执行脚本。
func RunWithEmitter(req Request, emitter *Emitter) (ExecutionResult, AgentSummary, error) {
	if emitter == nil {
		return ExecutionResult{}, AgentSummary{}, fmt.Errorf("emitter is required")
	}
	if req.ExecutionID == "" {
		req.ExecutionID = NewExecutionID("exec")
	}
	if req.Ext == "" {
		req.Ext = ".js"
	}
	if req.ScriptHash == "" {
		req.ScriptHash = ComputeScriptHash(req.ScriptContent)
	}

	emitter.SetStatus(ExecutionStatusRunning)
	emitter.SetSource(req.SourceLabel, req.ScriptHash)
	emitter.SetMeta("ext", req.Ext)
	emitter.SetMeta("timeoutMinutes", req.TimeoutMinutes)
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceSystem, "status", "script execution started", map[string]any{
		"source": req.SourceLabel,
		"ext":    req.Ext,
	})
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceSystem, "meta", "script source: "+req.SourceLabel, nil)
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceSystem, "meta", "script hash: "+req.ScriptHash, nil)

	execErr := runScript(req, emitter)
	status := ExecutionStatusSucceeded
	if execErr != nil {
		if strings.Contains(execErr.Error(), "timed out") {
			status = ExecutionStatusTimedOut
		} else {
			status = ExecutionStatusFailed
		}
		emitter.Emit(EventCategoryError, EventLevelError, EventSourceRuntime, "error", execErr.Error(), nil)
	} else {
		emitter.Emit(EventCategorySummary, EventLevelInfo, EventSourceSystem, "summary", "script execution completed", nil)
	}

	result, summary, finalizeErr := emitter.Finalize(status, execErr)
	result.Ext = req.Ext
	if finalizeErr != nil {
		return result, summary, finalizeErr
	}
	if req.Artifacts.SummaryPath != "" {
		if err := WriteLegacySummary(req.Artifacts.SummaryPath, result, summary); err != nil {
			return result, summary, err
		}
	}
	return result, summary, execErr
}

// ComputeScriptHash 计算脚本哈希。
func ComputeScriptHash(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func runScript(req Request, emitter *Emitter) error {
	if req.Ext == ".js" {
		return runJavaScript(req, emitter)
	}
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "status", "starting legacy text script execution", nil)
	page := automation.NewPage()
	return automation.RunScript(page, string(req.ScriptContent))
}

func runJavaScript(req Request, emitter *Emitter) error {
	startTime := time.Now()
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "status", "starting JavaScript execution", nil)
	parentContext := req.Context
	if parentContext == nil {
		parentContext = context.Background()
	}
	deadline := executionTimeout(req)
	var (
		ctx    context.Context
		cancel context.CancelFunc
	)
	if deadline > 0 {
		ctx, cancel = context.WithTimeout(parentContext, deadline)
	} else {
		ctx, cancel = context.WithCancel(parentContext)
	}
	defer cancel()

	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	done := make(chan error, 1)

	go func() {
		var (
			runtimeErr   error
			asyncErr     error
			scriptErr    string
			lifecycle    *automation.RuntimeLifecycle
			stopWatchdog func() bool
			watchdogDone chan struct{}
			keepAlive    *eventloop.Interval
			scriptDone   bool
			checkDone    func()
			unhandled    = map[*goja.Promise]string{}
		)

		loop.Run(func(rt *goja.Runtime) {
			// A runtime may be touched only by this event-loop owner. Interrupt is
			// the one documented Goja exception: this context watcher may call it
			// from another goroutine to break a CPU-bound JavaScript loop.
			watchdogDone = make(chan struct{})
			stopWatchdog = context.AfterFunc(ctx, func() {
				defer close(watchdogDone)
				reason := "script execution canceled"
				if errors.Is(ctx.Err(), context.DeadlineExceeded) {
					reason = fmt.Sprintf("script execution timed out after %s", deadline)
				}
				rt.Interrupt(reason)
				loop.StopNoWait()
			})
			// Keep the loop alive until the wrapper's finally block reports that
			// all awaited work has settled. This prevents a Promise-only script
			// from racing loop shutdown before an HTTP callback is queued.
			keepAlive = loop.SetInterval(func(*goja.Runtime) {}, 24*time.Hour)
			rt.SetPromiseRejectionTracker(func(promise *goja.Promise, operation goja.PromiseRejectionOperation) {
				switch operation {
				case goja.PromiseRejectionHandle:
					delete(unhandled, promise)
				case goja.PromiseRejectionReject:
					if asyncErr != nil {
						return
					}
					unhandled[promise] = promise.Result().String()
					// Goja reports Reject before a same-turn .catch() is attached.
					// Check on the next event-loop turn so PromiseRejectionHandle can
					// remove a properly handled rejection first.
					loop.SetTimeout(func(*goja.Runtime) {
						message, stillUnhandled := unhandled[promise]
						if !stillUnhandled || asyncErr != nil {
							return
						}
						delete(unhandled, promise)
						asyncErr = fmt.Errorf("unhandled Promise rejection: %s", message)
						loop.StopNoWait()
					}, 0)
				}
			})

			onAsyncError := func(err error) {
				if err != nil && asyncErr == nil {
					asyncErr = err
					loop.StopNoWait()
				}
			}
			sink := &automationSink{emitter: emitter}
			if err := automation.InitJSWithOptions(rt, automation.InitJSOptions{
				EventSink: sink, Context: ctx, EventLoop: loop, OnAsyncError: onAsyncError,
				EnableNativeExtensions:          req.EnableNativeExtensions,
				EnableUnsafeNativeExtensionCall: req.EnableUnsafeNativeExtensionCall,
				NativeExtensionRoots:            req.NativeExtensionRoots,
				OnReady: func(resources *automation.RuntimeLifecycle) { lifecycle = resources },
			}); err != nil {
				runtimeErr = err
				loop.StopNoWait()
				return
			}
			if err := automation.ApplyRuntimeStackMode(rt, req.StackMode); err != nil {
				runtimeErr = err
				loop.StopNoWait()
				return
			}
			if err := registerExecutionContext(rt, req); err != nil {
				runtimeErr = err
				loop.StopNoWait()
				return
			}
			checkDone = func() {
				if !scriptDone || lifecycle == nil {
					return
				}
				timers, workers, callbacks := lifecycle.AsyncCounts()
				if timers == 0 && workers == 0 && callbacks == 0 && len(unhandled) == 0 {
					loop.StopNoWait()
					return
				}
				// A script may leave a timeout or an HTTP request unawaited. Match
				// JavaScript event-loop semantics by draining those resources before
				// ending the execution; the execution context still bounds the wait.
				loop.SetTimeout(func(*goja.Runtime) { checkDone() }, time.Millisecond)
			}
			if err := rt.Set("__opendeskComplete", func(call goja.FunctionCall) goja.Value {
				scriptErr = toScriptError(call.Argument(0))
				scriptDone = true
				checkDone()
				return goja.Undefined()
			}); err != nil {
				runtimeErr = fmt.Errorf("register script completion callback: %w", err)
				loop.StopNoWait()
				return
			}
			if _, err := rt.RunString(wrapJavaScript(req.ScriptContent)); err != nil {
				runtimeErr = fmt.Errorf("script execution failed: %w", err)
				loop.StopNoWait()
			}
		})

		if stopWatchdog != nil {
			// If cancellation has already started, wait for the only permitted
			// cross-goroutine Runtime call (Interrupt) before ClearInterrupt below.
			// This is the synchronization boundary required by Goja's API.
			if !stopWatchdog() {
				<-watchdogDone
			}
		}
		if keepAlive != nil {
			loop.ClearInterval(keepAlive)
		}

		// The following teardown remains on the runtime-owner goroutine. Workers
		// only see context cancellation and send Go data through RunOnLoop.
		cancel()
		if lifecycle != nil && lifecycle.Timers != nil {
			lifecycle.Timers.Cleanup()
		}
		if lifecycle != nil {
			lifecycle.CancelAsync()
		}
		loop.Terminate()
		if lifecycle != nil {
			lifecycle.Wait()
		}
		if lifecycle != nil {
			timers, workers, callbacks := lifecycle.AsyncCounts()
			emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "cleanup", "runtime async resources drained", map[string]any{
				"timers": timers, "httpWorkers": workers, "promiseCallbacks": callbacks,
			})
			if (timers != 0 || workers != 0 || callbacks != 0) && runtimeErr == nil {
				runtimeErr = fmt.Errorf("runtime cleanup left timers=%d httpWorkers=%d promiseCallbacks=%d", timers, workers, callbacks)
			}
		}
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			if deadline <= 0 {
				done <- fmt.Errorf("script execution timed out: %w", ctx.Err())
				return
			}
			done <- fmt.Errorf("script execution timed out after %s", deadline)
			return
		}
		if errors.Is(ctx.Err(), context.Canceled) && parentContext.Err() != nil {
			done <- fmt.Errorf("script execution canceled: %w", parentContext.Err())
			return
		}
		if runtimeErr != nil {
			done <- runtimeErr
			return
		}
		if asyncErr != nil {
			done <- fmt.Errorf("script asynchronous callback failed: %w", asyncErr)
			return
		}
		if scriptErr != "" {
			done <- fmt.Errorf("script execution failed: %s", scriptErr)
			return
		}
		done <- nil
	}()

	if err := <-done; err != nil {
		return err
	}
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "status", "JavaScript execution finished", map[string]any{
		"durationMs": time.Since(startTime).Milliseconds(),
	})
	return nil
}

func executionTimeout(req Request) time.Duration {
	if req.Timeout > 0 {
		return req.Timeout
	}
	if req.TimeoutMinutes > 0 {
		return time.Duration(req.TimeoutMinutes) * time.Minute
	}
	return 0
}

func wrapJavaScript(source []byte) string {
	return fmt.Sprintf(`
		globalThis.__scriptError = "";
		Promise.resolve().then(async function () {
			try {
				await (async function __opendeskUserScript() {
%s
				})();
				console.log("script execution completed successfully");
			} catch (err) {
				console.error(err && err.message ? err.message : err);
				globalThis.__scriptError = String(err && (err.stack || err.message) || err);
			} finally {
				globalThis.__opendeskComplete(globalThis.__scriptError);
			}
		});
	`, string(source))
}

func toScriptError(value goja.Value) string {
	if value == nil || goja.IsUndefined(value) || goja.IsNull(value) {
		return ""
	}
	return strings.TrimSpace(value.String())
}

type automationSink struct {
	emitter *Emitter
}

func (s *automationSink) Emit(category, level, source, kind, message string, fields map[string]any) {
	if s == nil || s.emitter == nil {
		return
	}
	s.emitter.Emit(parseCategory(category), parseLevel(level), parseSource(source), kind, message, fields)
}

func parseCategory(raw string) EventCategory {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case string(EventCategoryFramework):
		return EventCategoryFramework
	case string(EventCategoryMeta):
		return EventCategoryMeta
	case string(EventCategoryScript):
		return EventCategoryScript
	case string(EventCategorySummary):
		return EventCategorySummary
	case string(EventCategoryError):
		return EventCategoryError
	default:
		return EventCategoryFramework
	}
}

func parseLevel(raw string) EventLevel {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case string(EventLevelDebug):
		return EventLevelDebug
	case string(EventLevelWarn):
		return EventLevelWarn
	case string(EventLevelError):
		return EventLevelError
	default:
		return EventLevelInfo
	}
}

func parseSource(raw string) EventSource {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case string(EventSourceConsole):
		return EventSourceConsole
	case string(EventSourceSystem):
		return EventSourceSystem
	case string(EventSourceHTTP):
		return EventSourceHTTP
	default:
		return EventSourceRuntime
	}
}

func registerExecutionContext(rt *goja.Runtime, req Request) error {
	if rt == nil {
		return fmt.Errorf("runtime is required")
	}
	artifactDir := ""
	if strings.TrimSpace(req.Artifacts.RunDir) != "" {
		artifactDir = req.Artifacts.RunDir
	}
	context := map[string]any{
		"executionId": req.ExecutionID,
		"stack":       normalizeStackModeForContext(req.StackMode),
		"artifactDir": artifactDir,
		"source":      req.SourceLabel,
		"ext":         req.Ext,
		"scriptHash":  req.ScriptHash,
	}
	return rt.Set("Execution", context)
}

func normalizeStackModeForContext(mode string) string {
	switch strings.TrimSpace(strings.ToLower(mode)) {
	case string(automation.RuntimeStackUpgraded):
		return string(automation.RuntimeStackUpgraded)
	case string(automation.RuntimeStackPlaywright):
		return string(automation.RuntimeStackPlaywright)
	default:
		return string(automation.RuntimeStackLegacy)
	}
}
