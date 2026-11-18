package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"opendesk/pkg/execution"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxScriptBytes = 128 * 1024
const maxScriptHistory = 64
const maxScriptSummaryBytes = 384 * 1024

// ScriptOptions is host authorization, never decoded from a tool request.
// WorkDir is a path base, not an access-control root.
type ScriptOptions struct {
	WorkDir      string
	Capabilities []string
}

// ScriptService owns only the executions submitted to this server session.
// The existing execution Runner owns all JavaScript and native lifecycle work.
type ScriptService struct {
	mu                         sync.Mutex
	manager                    *execution.Manager
	workdir, artifacts, active string
	capabilities               map[string]bool
	count                      int
	closing                    bool
}

func NewScriptService(options ScriptOptions) (*ScriptService, error) {
	capabilities := map[string]bool{"command": false, "download": false, "webhook": false, "accessibility": false, "sqlite": false, "custom-ui": false, "native-extensions": false}
	for _, name := range options.Capabilities {
		if _, exists := capabilities[name]; !exists {
			return nil, fmt.Errorf("unsupported host script capability %q", name)
		}
		capabilities[name] = true
	}
	workdir := options.WorkDir
	if workdir == "" {
		var err error
		workdir, err = os.Getwd()
		if err != nil {
			return nil, err
		}
	}
	workdir, err := filepath.Abs(workdir)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(workdir)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("script working directory must exist")
	}
	base := filepath.Join(workdir, ".runtime", "mcp")
	if err := os.MkdirAll(base, 0700); err != nil {
		return nil, err
	}
	artifacts, err := os.MkdirTemp(base, "session-")
	if err != nil {
		return nil, err
	}
	return &ScriptService{manager: execution.NewManager(), workdir: workdir, artifacts: artifacts, capabilities: capabilities}, nil
}

func (s *ScriptService) Capabilities() map[string]any {
	capabilities := make(map[string]bool, len(s.capabilities))
	for name, enabled := range s.capabilities {
		capabilities[name] = enabled
	}
	return map[string]any{"enabled": true, "capabilities": capabilities,
		// These are authorization facts and next diagnostic steps, not resource
		// probes. In particular, installing this CLI does not install a UI host
		// or a plugin bundle, and a file's presence does not prove compatibility.
		"conditionalCapabilities": map[string]any{
			"custom-ui": map[string]any{"enabled": capabilities["custom-ui"], "checked": false,
				"requirements": []string{"supported platform and graphical session", "compatible opendesk-ui-host resolved relative to this executable", "method-specific host capabilities"},
				"inspect":      "ui.getCapabilities() in an authorized execution; host handshake and actual window behavior require separate validation"},
			"native-extensions": map[string]any{"enabled": capabilities["native-extensions"], "checked": false,
				"requirements": []string{"installed bundles in controlled discovery roots", "valid manifest and matching platform executable", "plugin-specific permissions and dependencies"},
				"inspect":      "NativeExtensions.list() and NativeExtensions.diagnostics() in an authorized execution; discovery does not execute or validate a plugin method"},
		},
		"maxActive": 1, "maxExecutionsPerSession": maxScriptHistory, "maxScriptBytes": maxScriptBytes, "defaultTimeoutMs": 30000, "maxTimeoutMs": 300000, "environment": "empty", "appMode": false, "browserDOM": false, "recorderCapture": false, "unsafeNativeExtensionCall": false}
}

func scriptFields(args map[string]any, allowed ...string) error {
	for name := range args {
		found := false
		for _, key := range allowed {
			if name == key {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("unsupported script argument")
		}
	}
	return nil
}

func (s *ScriptService) Start(args map[string]any) (map[string]any, error) {
	return s.start(args, execution.PrepareArtifacts)
}

// start keeps artifact initialization controllable for internal failure tests;
// clients cannot supply this dependency or any artifact paths.
func (s *ScriptService) start(args map[string]any, prepare func(string, string, string) (execution.ExecutionArtifacts, error)) (map[string]any, error) {
	if err := scriptFields(args, "script", "input", "timeoutMs"); err != nil {
		return nil, err
	}
	script, ok := args["script"].(string)
	if !ok || strings.TrimSpace(script) == "" || len(script) > maxScriptBytes {
		return nil, fmt.Errorf("script must be non-empty JavaScript within 128 KiB")
	}
	timeout := 30000.0
	if _, exists := args["timeoutMs"]; exists {
		var ok bool
		timeout, ok = serverNumberArg(args, "timeoutMs")
		if !ok || math.IsNaN(timeout) || math.IsInf(timeout, 0) || timeout != math.Trunc(timeout) || timeout < 1 || timeout > 300000 {
			return nil, fmt.Errorf("timeoutMs must be an integer from 1 to 300000")
		}
	}
	input, exists := args["input"]
	if !exists {
		input = map[string]any{}
	}
	// Copy JSON input before handing it to another goroutine, preserving null.
	encodedInput, err := json.Marshal(input)
	if err != nil || len(encodedInput) > maxScriptBytes {
		return nil, fmt.Errorf("input must be JSON within 128 KiB")
	}
	if err := json.Unmarshal(encodedInput, &input); err != nil {
		return nil, err
	}
	if input == nil {
		// Runner reserves Go nil for an absent input; explicit JSON null needs
		// the same RawMessage sentinel used by the existing local AI CLI.
		input = json.RawMessage("null")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing {
		return nil, fmt.Errorf("script service is closing")
	}
	if s.active != "" {
		return nil, fmt.Errorf("script service is busy; inspect the active execution before submitting another")
	}
	if s.count >= maxScriptHistory {
		return nil, fmt.Errorf("script session execution limit reached; start a new server session")
	}
	// The monotonic per-session suffix avoids wall-clock ID collisions.
	id := fmt.Sprintf("%s-%d", execution.NewExecutionID("mcp"), s.count+1)
	artifacts, err := prepare(filepath.Join(s.artifacts, id), id, ".js")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(artifacts.ScriptSnapshotPath, []byte(script), 0600); err != nil {
		return nil, err
	}
	// An empty category selection is essential: agent mode alone still echoes
	// selected console events and would corrupt MCP's JSON-only stdout.
	emitter, err := execution.NewEmitter(id, execution.TerminalSelection{Mode: "agent"}, artifacts, time.Now())
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	if !s.manager.Register(id, emitter) {
		cancel()
		emitter.Close()
		return nil, fmt.Errorf("script service is closing")
	}
	s.manager.SetCancel(id, cancel)
	s.manager.UpdateResult(execution.ExecutionResult{ExecutionID: id, Status: execution.ExecutionStatusRunning, Artifacts: artifacts})
	s.count++
	s.active = id
	request := execution.Request{
		Context: ctx, ExecutionID: id, SourceLabel: "mcp:inline", Ext: ".js", ScriptContent: []byte(script),
		Input: input, WorkDir: s.workdir, Environment: map[string]string{}, Timeout: time.Duration(timeout) * time.Millisecond,
		Artifacts: artifacts, EnableCommand: s.capabilities["command"], EnableDownload: s.capabilities["download"],
		EnableWebhook: s.capabilities["webhook"], EnableAccessibility: s.capabilities["accessibility"],
		EnableSQLite: s.capabilities["sqlite"], EnableCustomUI: s.capabilities["custom-ui"],
		EnableNativeExtensions: s.capabilities["native-extensions"],
	}
	go func() {
		defer cancel()
		result, summary, runErr := execution.RunWithEmitter(request, emitter)
		// A normalization/setup failure can precede Runner finalization. It must
		// still publish a terminal record, never leave a phantom running task.
		if result.ExecutionID == "" {
			if runErr == nil {
				runErr = fmt.Errorf("execution returned no result")
			}
			// Publish from the in-memory snapshot even when disk finalization
			// itself failed. Retrying a persist operation cannot close this ID.
			result, summary = emitter.Result(), emitter.Summary()
			result.ExecutionID, result.Artifacts = id, artifacts
			switch result.Status {
			case execution.ExecutionStatusFailed, execution.ExecutionStatusTimedOut, execution.ExecutionStatusCanceled:
			default:
				result.Status = execution.ExecutionStatusFailed
			}
			if result.Error == "" || result.Error == runErr.Error() {
				result.Error = runErr.Error()
			} else {
				result.Error += "; finalization: " + runErr.Error()
			}
			if result.FinishedAt == "" {
				result.FinishedAt = time.Now().Format(time.RFC3339)
			}
			summary.ExecutionID, summary.Artifacts = id, artifacts
			summary.Status, summary.FinishedAt = string(result.Status), result.FinishedAt
			summary.Errors = append(summary.Errors, execution.AgentErrorItem{Timestamp: result.FinishedAt, Message: runErr.Error()})
		} else if runErr != nil && (result.Status == execution.ExecutionStatusSucceeded || result.Error != runErr.Error()) {
			// Runner returns the script error on normal failure, but may instead
			// return a later legacy-summary persistence error. Preserve both.
			if result.Status == execution.ExecutionStatusSucceeded {
				result.Status = execution.ExecutionStatusFailed
			}
			if result.Error == "" || result.Error == runErr.Error() {
				result.Error = runErr.Error()
			} else {
				result.Error += "; finalization: " + runErr.Error()
			}
			summary.Status = string(result.Status)
			summary.Errors = append(summary.Errors, execution.AgentErrorItem{Timestamp: time.Now().Format(time.RFC3339), Message: runErr.Error()})
		}
		emitter.Close()
		s.mu.Lock()
		s.manager.Complete(result, summary)
		s.active = ""
		s.mu.Unlock()
	}()
	return map[string]any{"ok": true, "executionId": id, "status": "running", "artifacts": artifacts}, nil
}

func (s *ScriptService) record(args map[string]any) (*execution.Record, error) {
	if err := scriptFields(args, "executionId"); err != nil {
		return nil, err
	}
	id := serverStringArg(args, "executionId")
	if strings.TrimSpace(id) == "" || len(id) > 256 {
		return nil, fmt.Errorf("executionId is required")
	}
	record, ok := s.manager.Get(id)
	if !ok {
		return nil, fmt.Errorf("executionId is not owned by this server session")
	}
	return record, nil
}

func (s *ScriptService) Status(args map[string]any) (map[string]any, error) {
	record, err := s.record(args)
	if err != nil {
		return nil, err
	}
	result, summary := record.Result, record.Summary
	if record.Cancel != nil {
		result, summary = record.Emitter.Result(), record.Emitter.Summary()
		// Only Manager.Complete proves the full RunWithEmitter call returned.
		result.Status = execution.ExecutionStatusRunning
	}
	ok := result.Status == execution.ExecutionStatusRunning || result.Status == execution.ExecutionStatusPending || result.Status == execution.ExecutionStatusSucceeded
	payload := map[string]any{"ok": ok, "executionId": result.ExecutionID, "status": result.Status, "result": result, "summary": summary}
	encoded, encodeErr := json.Marshal(payload)
	if encodeErr != nil || len(encoded) > maxScriptSummaryBytes {
		return map[string]any{"ok": false, "executionId": result.ExecutionID, "status": result.Status, "artifacts": result.Artifacts, "error": "script result exceeds response budget; inspect local artifacts; no partial result returned"}, nil
	}
	return payload, nil
}

func (s *ScriptService) Cancel(args map[string]any) (map[string]any, error) {
	record, err := s.record(args)
	if err != nil {
		return nil, err
	}
	requested := s.manager.Cancel(record.Result.ExecutionID)
	status := string(record.Result.Status)
	if requested {
		status = "canceling"
	} else if current, ok := s.manager.Get(record.Result.ExecutionID); ok {
		status = string(current.Result.Status)
	}
	return map[string]any{"ok": true, "executionId": record.Result.ExecutionID, "cancelRequested": requested, "status": status}, nil
}

// Close stops only this session's work. Native platform calls may not support
// hard cancellation, so shutdown waits for at most ten seconds and reports it.
func (s *ScriptService) Close() error {
	s.mu.Lock()
	s.closing = true
	s.mu.Unlock()
	s.manager.BeginShutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return s.manager.WaitAll(ctx)
}
