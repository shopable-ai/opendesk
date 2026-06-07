package execution

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
	"clawdesk/automation"

	"github.com/dop251/goja"
)

// Request 描述一次脚本执行请求。
type Request struct {
	ExecutionID    string
	SourceLabel    string
	Ext            string
	StackMode      string
	ScriptHash     string
	ScriptContent  []byte
	TimeoutMinutes int
	Artifacts      ExecutionArtifacts
	Selection      TerminalSelection
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
	rt := goja.New()
	sink := &automationSink{emitter: emitter}
	if err := automation.InitJSWithOptions(rt, automation.InitJSOptions{EventSink: sink}); err != nil {
		return err
	}
	if err := automation.ApplyRuntimeStackMode(rt, req.StackMode); err != nil {
		return err
	}
	if err := registerExecutionContext(rt, req); err != nil {
		return err
	}
	axios := automation.NewAxios(rt)
	axios.RegisterInRuntime()

	startTime := time.Now()
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "status", "starting JavaScript execution", nil)
	done := make(chan error, 1)
	script := strings.TrimSpace(string(req.ScriptContent))
	if !strings.HasPrefix(script, "(async") && !strings.HasPrefix(script, "async") {
		script = fmt.Sprintf(`
            (async () => {
                try {
                    %s
                } catch (err) {
                    console.error(err && err.message ? err.message : err);
                    throw err;
                }
            })();
        `, script)
	}
	completeScript := fmt.Sprintf(`
        globalThis.__scriptComplete = false;
        globalThis.__activeTimers = globalThis.__activeTimers || 0;

        (async () => {
            try {
                await %s;

                await new Promise(resolve => {
                    const checkTimers = () => {
                        const activeTimers = globalThis.__activeTimers || 0;
                        if (activeTimers === 0) {
                            globalThis.__scriptComplete = true;
                            resolve();
                        } else {
                            setTimeout(checkTimers, 100);
                        }
                    };
                    checkTimers();
                });

                console.log("script execution completed successfully");
            } catch (err) {
                console.error(err && err.message ? err.message : err);
                throw err;
            }
        })();
    `, script)

	go func() {
		_, err := rt.RunString(completeScript)
		if err != nil {
			done <- fmt.Errorf("script execution failed: %w", err)
			return
		}
		for {
			time.Sleep(100 * time.Millisecond)
			completeValue := rt.Get("__scriptComplete")
			if completeValue != nil && completeValue.ToBoolean() {
				break
			}
		}
		done <- nil
	}()

	var err error
	if req.TimeoutMinutes == 0 {
		err = <-done
	} else {
		select {
		case err = <-done:
		case <-time.After(time.Duration(req.TimeoutMinutes) * time.Minute):
			err = fmt.Errorf("script execution timed out after %d minutes", req.TimeoutMinutes)
		}
	}
	if err != nil {
		return err
	}
	emitter.Emit(EventCategoryMeta, EventLevelInfo, EventSourceRuntime, "status", "JavaScript execution finished", map[string]any{
		"durationMs": time.Since(startTime).Milliseconds(),
	})
	return nil
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
