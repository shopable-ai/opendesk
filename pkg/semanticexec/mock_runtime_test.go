package semanticexec

import "testing"

func TestRunScenarioHappyPath(t *testing.T) {
	s := Scenario{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     "browser_backoffice_happy_path",
		RecoveryBudget: 1,
		RoutePolicy:    RoutePolicy{PreferredOrder: []string{RouteDOM}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps: []ScenarioStep{{StepID: "s1", Action: "save_form", MockOutcome: StatusSucceeded}},
	}
	result, err := RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != StatusSucceeded {
		t.Fatalf("expected %s, got %s", StatusSucceeded, result.Status)
	}
}

func TestRunScenarioPermissionBlocked(t *testing.T) {
	s := Scenario{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     "native_permission_blocked",
		RecoveryBudget: 2,
		RoutePolicy:    RoutePolicy{PreferredOrder: []string{RouteAccessibility}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps: []ScenarioStep{{
			StepID:           "s1",
			Action:           "grant_permission",
			MockOutcome:      StatusBlocked,
			MockFailureClass: FailureClassPermissionBlocked,
		}},
	}
	result, err := RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != StatusBlocked {
		t.Fatalf("expected %s, got %s", StatusBlocked, result.Status)
	}
	if !result.Steps[0].HumanGateRequired {
		t.Fatal("expected human gate required for permission blocked")
	}
}

func TestRunScenarioPartialSuccess(t *testing.T) {
	s := Scenario{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     "canvas_partial_success",
		RecoveryBudget: 1,
		RoutePolicy:    RoutePolicy{PreferredOrder: []string{RouteRegion}, AllowFallback: false, MaxAttemptsPerStep: 1},
		Steps: []ScenarioStep{{
			StepID:       "s1",
			Action:       "draw_partial_region",
			MockOutcome:  StatusPartial,
			Metadata:     map[string]any{"partialProgress": true},
		}},
	}
	result, err := RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != StatusPartial {
		t.Fatalf("expected %s, got %s", StatusPartial, result.Status)
	}
}

func TestRunScenarioFalseSuccessSuspected(t *testing.T) {
	s := Scenario{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     "false_success_save_without_persist",
		RecoveryBudget: 1,
		RoutePolicy:    RoutePolicy{PreferredOrder: []string{RouteDOM}, AllowFallback: false, MaxAttemptsPerStep: 1},
		Steps: []ScenarioStep{{
			StepID:      "s1",
			Action:      "save_form",
			MockOutcome: StatusFalseSuccessSuspected,
		}},
	}
	result, err := RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.Status != StatusFalseSuccessSuspected {
		t.Fatalf("expected %s, got %s", StatusFalseSuccessSuspected, result.Status)
	}
	if !result.Steps[0].FalseSuccessSuspected {
		t.Fatal("expected step false success flag")
	}
}

func TestRunScenarioRecoveryBudgetExhausted(t *testing.T) {
	s := Scenario{
		SchemaVersion:  SchemaVersion,
		ScenarioID:     "recovery_budget_exhausted",
		RecoveryBudget: 0,
		RoutePolicy:    RoutePolicy{PreferredOrder: []string{RouteAccessibility}, AllowFallback: true, MaxAttemptsPerStep: 2},
		Steps: []ScenarioStep{{
			StepID:           "s1",
			Action:           "grant_permission",
			MockOutcome:      StatusBlocked,
			MockFailureClass: FailureClassPermissionBlocked,
		}},
	}
	result, err := RunScenario(s)
	if err != nil {
		t.Fatalf("RunScenario returned error: %v", err)
	}
	if result.RecoveryUsed != 1 {
		t.Fatalf("expected recoveryUsed=1, got %d", result.RecoveryUsed)
	}
	if result.RecoveryBudget != 0 {
		t.Fatalf("expected recoveryBudget=0, got %d", result.RecoveryBudget)
	}
	if result.Status != StatusBlocked {
		t.Fatalf("expected blocked status, got %s", result.Status)
	}
}
