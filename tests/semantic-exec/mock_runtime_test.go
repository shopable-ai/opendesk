package semanticexec_test

import (
	"testing"

	semanticexec "opendesk/pkg/semanticexec"
)

func TestRunScenarioHappyPath(t *testing.T) {
	s := semanticexec.Scenario{
		SchemaVersion:  semanticexec.SchemaVersion,
		ScenarioID:     "browser_backoffice_happy_path",
		RecoveryBudget: 1,
		RoutePolicy:    semanticexec.RoutePolicy{PreferredOrder: []string{semanticexec.RouteDOM}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps:          []semanticexec.ScenarioStep{{StepID: "s1", Action: "save_form", MockOutcome: semanticexec.StatusSucceeded}},
	}
	result, err := semanticexec.RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != semanticexec.StatusSucceeded {
		t.Fatalf("expected %s, got %s", semanticexec.StatusSucceeded, result.Status)
	}
}

func TestRunScenarioPermissionBlocked(t *testing.T) {
	s := semanticexec.Scenario{
		SchemaVersion:  semanticexec.SchemaVersion,
		ScenarioID:     "native_permission_blocked",
		RecoveryBudget: 2,
		RoutePolicy:    semanticexec.RoutePolicy{PreferredOrder: []string{semanticexec.RouteAccessibility}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps: []semanticexec.ScenarioStep{{
			StepID:           "s1",
			Action:           "grant_permission",
			MockOutcome:      semanticexec.StatusBlocked,
			MockFailureClass: semanticexec.FailureClassPermissionBlocked,
		}},
	}
	result, err := semanticexec.RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != semanticexec.StatusBlocked {
		t.Fatalf("expected %s, got %s", semanticexec.StatusBlocked, result.Status)
	}
	if !result.Steps[0].HumanGateRequired {
		t.Fatal("expected human gate required for permission blocked")
	}
}

func TestRunScenarioPartialSuccess(t *testing.T) {
	s := semanticexec.Scenario{
		SchemaVersion:  semanticexec.SchemaVersion,
		ScenarioID:     "canvas_partial_success",
		RecoveryBudget: 1,
		RoutePolicy:    semanticexec.RoutePolicy{PreferredOrder: []string{semanticexec.RouteRegion}, AllowFallback: false, MaxAttemptsPerStep: 1},
		Steps: []semanticexec.ScenarioStep{{
			StepID:      "s1",
			Action:      "draw_partial_region",
			MockOutcome: semanticexec.StatusPartial,
			Metadata:    map[string]any{"partialProgress": true},
		}},
	}
	result, err := semanticexec.RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != semanticexec.StatusPartial {
		t.Fatalf("expected %s, got %s", semanticexec.StatusPartial, result.Status)
	}
}

func TestRunScenarioFalseSuccessSuspected(t *testing.T) {
	s := semanticexec.Scenario{
		SchemaVersion:  semanticexec.SchemaVersion,
		ScenarioID:     "false_success_save_without_persist",
		RecoveryBudget: 1,
		RoutePolicy:    semanticexec.RoutePolicy{PreferredOrder: []string{semanticexec.RouteDOM}, AllowFallback: false, MaxAttemptsPerStep: 1},
		Steps: []semanticexec.ScenarioStep{{
			StepID:      "s1",
			Action:      "save_form",
			MockOutcome: semanticexec.StatusFalseSuccessSuspected,
		}},
	}
	result, err := semanticexec.RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != semanticexec.StatusFalseSuccessSuspected {
		t.Fatalf("expected %s, got %s", semanticexec.StatusFalseSuccessSuspected, result.Status)
	}
	if !result.Steps[0].FalseSuccessSuspected {
		t.Fatal("expected step false success flag")
	}
}

func TestRunScenarioRecoveryBudgetExhausted(t *testing.T) {
	s := semanticexec.Scenario{
		SchemaVersion:  semanticexec.SchemaVersion,
		ScenarioID:     "recovery_budget_exhausted",
		RecoveryBudget: 0,
		RoutePolicy:    semanticexec.RoutePolicy{PreferredOrder: []string{semanticexec.RouteAccessibility}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps: []semanticexec.ScenarioStep{{
			StepID:           "s1",
			Action:           "grant_permission",
			MockOutcome:      semanticexec.StatusBlocked,
			MockFailureClass: semanticexec.FailureClassPermissionBlocked,
		}},
	}
	result, err := semanticexec.RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.RecoveryUsed != 1 {
		t.Fatalf("expected recoveryUsed=1, got %d", result.RecoveryUsed)
	}
	if result.RecoveryBudget != 0 {
		t.Fatalf("expected recoveryBudget=0, got %d", result.RecoveryBudget)
	}
	if result.Status != semanticexec.StatusBlocked {
		t.Fatalf("expected blocked status, got %s", result.Status)
	}
}
