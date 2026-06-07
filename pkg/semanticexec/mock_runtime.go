package semanticexec

import "fmt"

func RunScenario(s Scenario) (ExecutionResult, error) {
	if s.ScenarioID == "" {
		return ExecutionResult{}, fmt.Errorf("scenarioId is required")
	}
	if len(s.Steps) == 0 {
		return ExecutionResult{}, fmt.Errorf("at least one scenario step is required")
	}

	result := ExecutionResult{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     s.ScenarioID,
		RecoveryBudget: s.RecoveryBudget,
		Steps:          make([]StepResult, 0, len(s.Steps)),
	}

	for _, step := range s.Steps {
		stepResult := runStep(step, s.RoutePolicy)
		result.Steps = append(result.Steps, stepResult)
		result.RecoveryUsed += maxInt(0, len(stepResult.RouteAttempts)-1)
	}

	result.Status = DeriveExecutionStatus(result.Steps)
	result.Summary = synthesizeSummary(result)
	return result, nil
}

func runStep(step ScenarioStep, policy RoutePolicy) StepResult {
	attempts := buildAttempts(step, policy)
	checks := BuildVerificationChecks(step, latestAttempt(attempts))
	status := DeriveStepStatus(step, attempts, checks)
	failureClass := NormalizeFailureClass(step.MockFailureClass)
	if failureClass == FailureClassNone {
		failureClass = NormalizeFailureClass(latestAttempt(attempts).FailureClass)
	}
	return StepResult{
		StepID:                step.StepID,
		Status:                status,
		RouteAttempts:         attempts,
		Verifications:         checks,
		FalseSuccessSuspected: status == StatusFalseSuccessSuspected,
		HumanGateRequired:     RequiresHumanGate(step, attempts, checks),
		FailureClass:          failureClass,
		Summary:               summarizeStep(step, status, failureClass),
	}
}

func buildAttempts(step ScenarioStep, policy RoutePolicy) []RouteAttempt {
	preferred := RouteMock
	if len(policy.PreferredOrder) > 0 && policy.PreferredOrder[0] != "" {
		preferred = policy.PreferredOrder[0]
	}
	attempts := []RouteAttempt{{
		AttemptIndex: 1,
		RouteKind:    preferred,
		Success:      step.MockOutcome != StatusBlocked && step.MockOutcome != StatusFailed,
		FailureClass: NormalizeFailureClass(step.MockFailureClass),
		Detail:       "primary mock route attempt",
	}}

	if step.MockOutcome == StatusBlocked && policy.AllowFallback && policy.MaxAttemptsPerStep > 1 {
		attempts = append(attempts, RouteAttempt{
			AttemptIndex: 2,
			RouteKind:    RouteAIRecovery,
			Success:      false,
			FailureClass: NormalizeFailureClass(step.MockFailureClass),
			Detail:       "fallback attempt remained blocked",
		})
	}
	return attempts
}

func synthesizeSummary(result ExecutionResult) string {
	return fmt.Sprintf("scenario %s finished with status=%s steps=%d recoveryUsed=%d", result.ScenarioID, result.Status, len(result.Steps), result.RecoveryUsed)
}

func summarizeStep(step ScenarioStep, status, failureClass string) string {
	if failureClass != FailureClassNone {
		return fmt.Sprintf("step %s action=%s status=%s failureClass=%s", step.StepID, step.Action, status, failureClass)
	}
	return fmt.Sprintf("step %s action=%s status=%s", step.StepID, step.Action, status)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
