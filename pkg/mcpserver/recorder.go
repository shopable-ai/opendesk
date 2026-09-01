package mcpserver

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"opendesk/pkg/recorder"
)

func (s *Server) recorderManager() (*recorder.Manager, error) {
	s.recorderOnce.Do(func() {
		if s.recorder != nil {
			return
		}
		root := strings.TrimSpace(os.Getenv("OPENDESK_RECORDER_ROOT"))
		s.recorder, s.recorderErr = recorder.NewManager(root)
	})
	return s.recorder, s.recorderErr
}

func (s *Server) callRecorderTool(name string, args map[string]any) (map[string]any, error) {
	manager, err := s.recorderManager()
	if err != nil {
		return nil, fmt.Errorf("recorder unavailable: %w", err)
	}
	switch name {
	case "tm_recorder_start":
		manifest, err := manager.Start(recorder.StartOptions{
			SessionID: serverStringArg(args, "recordingSessionId"), ExecutionID: serverStringArg(args, "executionId"),
			Goal: serverStringArg(args, "goal"), Source: "mcp",
			ObservationPolicy: recorder.ObservationPolicy(serverStringArg(args, "observationPolicy")),
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "recordingSessionId": manifest.SessionID, "executionId": manifest.ExecutionID, "state": manifest.State, "paths": manifest.Paths}, nil
	case "tm_recorder_status":
		manifest, err := manager.Status(serverStringArg(args, "recordingSessionId"))
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "manifest": manifest}, nil
	case "tm_recorder_annotate":
		hint, err := decodeHint(args["hint"])
		if err != nil {
			return nil, err
		}
		fields, _ := args["fields"].(map[string]any)
		event, err := manager.Annotate(serverStringArg(args, "recordingSessionId"), serverStringArg(args, "executionId"), hint, fields)
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "eventId": event.EventID, "sequence": event.Sequence}, nil
	case "tm_recorder_verify":
		verification, err := decodeVerification(args["verification"])
		if err != nil {
			return nil, err
		}
		event, err := manager.Verify(serverStringArg(args, "recordingSessionId"), serverStringArg(args, "executionId"), serverStringArg(args, "actionId"), verification)
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "eventId": event.EventID, "sequence": event.Sequence}, nil
	case "tm_recorder_stop":
		manifest, err := manager.Stop(serverStringArg(args, "recordingSessionId"))
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "recordingSessionId": manifest.SessionID, "state": manifest.State, "manifest": manifest}, nil
	case "tm_recorder_distill":
		flow, report, err := manager.Distill(serverStringArg(args, "recordingSessionId"))
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "flow": flow, "report": report}, nil
	case "tm_recorder_compile":
		sessionID := serverStringArg(args, "recordingSessionId")
		flow, err := manager.LoadFlow(sessionID)
		if err != nil {
			return nil, err
		}
		path, err := manager.Compile(sessionID, flow, recorder.CompileOptions{ReplayConfigPath: serverStringArg(args, "replayConfigPath")})
		if err != nil {
			return nil, err
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil, readErr
		}
		return map[string]any{"ok": true, "path": path, "mode": "deterministic", "usesAI": recorder.GeneratedJavaScriptUsesAI(string(data))}, nil
	default:
		return nil, fmt.Errorf("unsupported recorder tool: %s", name)
	}
}

func (s *Server) callRecordedTool(name string, args map[string]any, sessionID string) (map[string]any, error) {
	manager, err := s.recorderManager()
	if err != nil {
		return nil, err
	}
	manifest, err := manager.Status(sessionID)
	if err != nil {
		return nil, err
	}
	hint, err := decodeHint(args["recorderHint"])
	if err != nil {
		return nil, err
	}
	before := s.windowObservation()
	requestArgs := cloneArguments(args)
	delete(requestArgs, "recorderHint")
	span, err := manager.Before(sessionID, serverStringArg(args, "executionId"), "mcp", recorder.ActionRequest{Name: recorderActionName(name), Arguments: requestArgs}, hint, before)
	if err != nil {
		return nil, err
	}
	before, err = s.captureRecordedObservation(manager, manifest, span, "before")
	if err != nil {
		result := recorder.ActionResult{OK: false, Error: err.Error(), DurationMs: time.Since(span.StartedAt).Milliseconds()}
		_ = manager.After(span, result, recorder.Observation{CapturedAt: time.Now().UTC().Format(time.RFC3339Nano), Error: "action not executed"}, recorder.Verification{Status: "fail", FailureClass: "F1", Message: err.Error()})
		return nil, err
	}
	span.Before = before
	payload, callErr := s.callToolCore(name, args)
	after, observationErr := s.captureRecordedObservation(manager, manifest, span, "after")
	result := recorder.ActionResult{OK: callErr == nil && payloadOK(payload), DurationMs: time.Since(span.StartedAt).Milliseconds(), Payload: payload}
	verification := recorder.Verification{Status: "unknown", Postconditions: hint.ExpectedPostconditions}
	if callErr != nil {
		result.Error = callErr.Error()
		verification = recorder.Verification{Status: "fail", FailureClass: "F5", Message: callErr.Error(), Postconditions: hint.ExpectedPostconditions}
	}
	if observationErr != nil {
		result.Error = observationErr.Error()
		verification = recorder.Verification{Status: "fail", FailureClass: "F1", Message: observationErr.Error(), Postconditions: hint.ExpectedPostconditions}
	}
	if err := manager.After(span, result, after, verification); err != nil {
		return nil, err
	}
	if callErr != nil {
		return nil, callErr
	}
	if observationErr != nil {
		return nil, observationErr
	}
	if payload == nil {
		payload = map[string]any{}
	}
	payload["recorder"] = map[string]any{"recordingSessionId": sessionID, "executionId": span.ExecutionID, "actionId": span.ActionID, "verification": verification.Status}
	return payload, nil
}

func (s *Server) captureRecordedObservation(manager *recorder.Manager, manifest recorder.Manifest, span recorder.ActionSpan, phase string) (recorder.Observation, error) {
	observation := s.windowObservation()
	if manifest.ObservationPolicy == recorder.ObservationMinimal {
		return observation, nil
	}
	release, err := manager.EnterInternal(manifest.SessionID, span.ActionID)
	if err != nil {
		return observation, err
	}
	defer release()
	stamp := time.Now().UTC().Format("20060102T150405.000000000Z")
	windowPath, pathErr := manager.Store().ArtifactPath(manifest.SessionID, filepath.Join("observations", "windows", span.ActionID+"-"+phase+"-"+stamp+".json"))
	if pathErr != nil {
		return observation, pathErr
	}
	if observation.Window != nil {
		if _, err := manager.Store().WriteJSON(manifest.SessionID, filepath.Join("observations", "windows", filepath.Base(windowPath)), observation.Window); err != nil {
			return observation, err
		}
		observation.WindowRef = windowPath
	}
	screenshotPath, pathErr := manager.Store().ArtifactPath(manifest.SessionID, filepath.Join("observations", "screenshots", span.ActionID+"-"+phase+"-"+stamp+".png"))
	if pathErr != nil {
		return observation, pathErr
	}
	_, captureErr := s.runtime.Screenshot(map[string]any{"target": "activeWindow", "returnType": "path", "path": screenshotPath})
	if captureErr != nil {
		observation.Error = captureErr.Error()
		_, _ = manager.RecordInternal(manifest.SessionID, span.ExecutionID, span.ActionID, phase+".screenshot", observation)
		return observation, fmt.Errorf("recorder %s screenshot: %w", phase, captureErr)
	}
	if info, err := os.Stat(screenshotPath); err != nil || info.Size() == 0 {
		if err == nil {
			err = errors.New("empty screenshot")
		}
		observation.Error = err.Error()
		_, _ = manager.RecordInternal(manifest.SessionID, span.ExecutionID, span.ActionID, phase+".screenshot", observation)
		return observation, fmt.Errorf("recorder %s screenshot artifact: %w", phase, err)
	}
	observation.ScreenshotRef = screenshotPath
	_, err = manager.RecordInternal(manifest.SessionID, span.ExecutionID, span.ActionID, phase+".screenshot", observation)
	return observation, err
}

func (s *Server) windowObservation() recorder.Observation {
	observation := recorder.Observation{CapturedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	window, err := s.runtime.GetActiveWindow()
	if err != nil {
		observation.Error = err.Error()
		return observation
	}
	observation.Window = &recorder.WindowSnapshot{
		Title: serverStringArg(window, "title"), PID: int64(serverNumberArgDefault(window, "pid")),
		Executable: serverStringArg(window, "exePath"), X: serverNumberArgDefault(window, "x"), Y: serverNumberArgDefault(window, "y"),
		Width: serverNumberArgDefault(window, "width"), Height: serverNumberArgDefault(window, "height"),
		Foreground: serverBoolArg(window, "isForeground") || serverBoolArg(window, "hasFocus"),
	}
	return observation
}

func recordableTool(name string) bool {
	switch name {
	case "tm_focus_window", "tm_focus_and_type", "tm_act_on_target", "tm_click_text", "tm_click_region", "tm_click", "tm_type", "tm_press_key", "tm_scroll":
		return true
	default:
		return false
	}
}

func recorderActionName(name string) string {
	switch name {
	case "tm_focus_window":
		return "focusWindow"
	case "tm_focus_and_type":
		return "focusAndType"
	case "tm_type":
		return "type"
	case "tm_press_key":
		return "pressKey"
	case "tm_scroll":
		return "scroll"
	default:
		return "click"
	}
}

func decodeHint(value any) (recorder.ActionHint, error) {
	if value == nil {
		return recorder.ActionHint{}, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return recorder.ActionHint{}, err
	}
	var hint recorder.ActionHint
	if err := json.Unmarshal(data, &hint); err != nil {
		return recorder.ActionHint{}, fmt.Errorf("invalid recorder hint: %w", err)
	}
	return hint, nil
}

func decodeVerification(value any) (recorder.Verification, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return recorder.Verification{}, err
	}
	var verification recorder.Verification
	if err := json.Unmarshal(data, &verification); err != nil {
		return recorder.Verification{}, fmt.Errorf("invalid verification: %w", err)
	}
	if verification.Status != "pass" && verification.Status != "warn" && verification.Status != "fail" && verification.Status != "unknown" {
		return recorder.Verification{}, fmt.Errorf("invalid verification status %q", verification.Status)
	}
	return verification, nil
}

func cloneArguments(arguments map[string]any) map[string]any {
	out := make(map[string]any, len(arguments))
	for key, value := range arguments {
		out[key] = value
	}
	return out
}

func payloadOK(payload map[string]any) bool {
	if payload == nil {
		return true
	}
	if ok, exists := payload["ok"].(bool); exists {
		return ok
	}
	return true
}

func serverNumberArgDefault(args map[string]any, key string) float64 {
	value, _ := serverNumberArg(args, key)
	return value
}
