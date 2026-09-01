package recorder

import (
	"fmt"
	"strings"
	"time"
)

func (m *Manager) Distill(sessionID string) (Flow, DistillReport, error) {
	manifest, err := m.Status(sessionID)
	if err != nil {
		return Flow{}, DistillReport{}, err
	}
	if manifest.State != SessionStopped {
		return Flow{}, DistillReport{}, errorsNew("session must be stopped before distillation")
	}
	events, err := m.store.LoadEvents(sessionID)
	if err != nil {
		return Flow{}, DistillReport{}, err
	}
	report := DistillReport{SchemaVersion: SchemaVersion, SessionID: sessionID, RawEventCount: len(events)}
	verifications := make(map[string]Verification)
	for _, event := range events {
		if event.EventType == "action.verification" && event.Verification != nil {
			verifications[event.ActionID] = *event.Verification
		}
	}
	flow := Flow{
		SchemaVersion: SchemaVersion, FlowID: newID("flow"), SessionID: sessionID,
		Goal: manifest.Goal, Mode: "deterministic", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	for _, event := range events {
		if event.Internal || event.Classification == "observe" || event.EventType == "observation.internal" {
			report.RemovedObservations++
			continue
		}
		if event.EventType != "action.after" || event.Request == nil || event.Result == nil {
			continue
		}
		report.CompletedActionCount++
		if !event.Result.OK {
			report.RemovedFailed++
			continue
		}
		verification := Verification{Status: "unknown"}
		if event.Verification != nil {
			verification = *event.Verification
		}
		if newer, ok := verifications[event.ActionID]; ok {
			verification = newer
		}
		if changed, exists := event.Result.Payload["stateChanged"].(bool); exists && !changed {
			report.RemovedNoChange++
			continue
		}
		if verification.Status == "fail" {
			report.RemovedFailed++
			continue
		}
		step := flowStepFromEvent(event, verification, len(flow.Steps)+1)
		if mergeTypedStep(&flow, step) {
			report.MergedActions++
			continue
		}
		flow.Steps = append(flow.Steps, step)
	}
	for index := range flow.Steps {
		flow.Steps[index].StepID = fmt.Sprintf("step-%03d", index+1)
		if len(flow.Steps[index].SourceActionIDs) == 0 {
			return Flow{}, report, fmt.Errorf("flow step %d has no source action ids", index+1)
		}
		if len(flow.Steps[index].ExpectedPostconditions) == 0 {
			report.Warnings = append(report.Warnings, flow.Steps[index].StepID+": missing expected postcondition")
		}
	}
	report.FlowStepCount = len(flow.Steps)
	if _, err := m.store.WriteJSON(sessionID, "distilled/flow.json", flow); err != nil {
		return Flow{}, report, err
	}
	variables := map[string]any{"schemaVersion": SchemaVersion, "sessionId": sessionID, "variables": []any{}}
	if _, err := m.store.WriteJSON(sessionID, "distilled/variables.json", variables); err != nil {
		return Flow{}, report, err
	}
	if _, err := m.store.WriteJSON(sessionID, "distilled/report.json", report); err != nil {
		return Flow{}, report, err
	}
	return flow, report, nil
}

func flowStepFromEvent(event TraceEvent, verification Verification, number int) FlowStep {
	hint := ActionHint{}
	if event.Hint != nil {
		hint = *event.Hint
	}
	intent := strings.TrimSpace(hint.Intent)
	if intent == "" {
		intent = event.Request.Name
	}
	target := strings.TrimSpace(hint.TargetDescription)
	if target == "" {
		target = stringArgument(event.Request.Arguments, "targetDescription")
	}
	locators := []LocatorCandidate{}
	if event.Before != nil && event.Before.Target != nil {
		locators = append(locators, event.Before.Target.Candidates...)
	}
	if len(locators) == 0 {
		locators = locatorCandidatesFromArguments(event.Request.Arguments, event.Before)
	}
	return FlowStep{
		StepID: fmt.Sprintf("step-%03d", number), SourceActionIDs: []string{event.ActionID}, Intent: intent,
		Target: target, Locators: locators, Preconditions: preconditionsFromEvent(event),
		Action: *event.Request, ExpectedPostconditions: hint.ExpectedPostconditions,
		Verification: verification, Risk: riskOrLow(hint.Risk),
	}
}

func locatorCandidatesFromArguments(arguments map[string]any, before *Observation) []LocatorCandidate {
	locator := LocatorCandidate{
		Kind: "window-relative", Name: stringArgument(arguments, "targetLabel"),
		Role: stringArgument(arguments, "targetRole"), ExpectedWindow: stringArgument(arguments, "expectedWindowTitle"),
		ExpectedProcess: int64(numberArgument(arguments, "processId")), Confidence: 1,
	}
	if relative, ok := arguments["windowRelative"].(map[string]any); ok {
		locator.WindowRelative = cloneJSONValue(relative).(map[string]any)
	}
	if x, hasX := arguments["x"]; hasX {
		if y, hasY := arguments["y"]; hasY {
			locator.AbsolutePoint = map[string]any{"x": x, "y": y}
		}
	}
	if before != nil {
		locator.CapturedAt = before.CapturedAt
		if before.ScreenshotRef != "" {
			locator.EvidenceRefs = []string{before.ScreenshotRef}
		}
	}
	if locator.Name == "" && locator.Role == "" && locator.WindowRelative == nil && locator.AbsolutePoint == nil {
		return nil
	}
	return []LocatorCandidate{locator}
}

func preconditionsFromEvent(event TraceEvent) []Postcondition {
	var out []Postcondition
	if event.Before != nil && event.Before.Window != nil {
		window := event.Before.Window
		out = append(out, Postcondition{Kind: "activeWindowTitleEquals", Value: window.Title})
		if window.Executable != "" {
			out = append(out, Postcondition{Kind: "activeExecutableEquals", Value: window.Executable})
		}
	}
	return out
}

func mergeTypedStep(flow *Flow, next FlowStep) bool {
	if len(flow.Steps) == 0 || (next.Action.Name != "type" && next.Action.Name != "dom.fill") {
		return false
	}
	previous := &flow.Steps[len(flow.Steps)-1]
	if previous.Action.Name != next.Action.Name || previous.Target != next.Target || previous.Risk != next.Risk {
		return false
	}
	if next.Action.Name == "dom.fill" {
		if previous.Action.Arguments["selector"] != next.Action.Arguments["selector"] {
			return false
		}
		value, ok := next.Action.Arguments["value"].(string)
		if !ok || value == "<redacted>" {
			return false
		}
		previous.Action.Arguments["value"] = value
		previous.SourceActionIDs = append(previous.SourceActionIDs, next.SourceActionIDs...)
		previous.ExpectedPostconditions = next.ExpectedPostconditions
		previous.Verification = next.Verification
		return true
	}
	left, leftOK := previous.Action.Arguments["text"].(string)
	right, rightOK := next.Action.Arguments["text"].(string)
	if !leftOK || !rightOK || left == "<redacted>" || right == "<redacted>" {
		return false
	}
	previous.Action.Arguments["text"] = left + right
	previous.SourceActionIDs = append(previous.SourceActionIDs, next.SourceActionIDs...)
	previous.ExpectedPostconditions = next.ExpectedPostconditions
	previous.Verification = next.Verification
	return true
}

func stringArgument(arguments map[string]any, key string) string {
	value, _ := arguments[key].(string)
	return value
}

func numberArgument(arguments map[string]any, key string) float64 {
	switch value := arguments[key].(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case int64:
		return float64(value)
	default:
		return 0
	}
}

func riskOrLow(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "low"
	}
	return value
}

func errorsNew(message string) error { return fmt.Errorf("%s", message) }
