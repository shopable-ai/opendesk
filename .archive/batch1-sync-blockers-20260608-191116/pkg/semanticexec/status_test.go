package semanticexec

import "testing"

func TestDeriveExecutionStatusSucceeded(t *testing.T) {
	steps := []StepResult{{StepID: "s1", Status: StatusSucceeded}}
	if got := DeriveExecutionStatus(steps); got != StatusSucceeded {
		t.Fatalf("expected %s, got %s", StatusSucceeded, got)
	}
}

func TestDeriveExecutionStatusBlockedWinsOverPartial(t *testing.T) {
	steps := []StepResult{{StepID: "s1", Status: StatusPartial}, {StepID: "s2", Status: StatusBlocked}}
	if got := DeriveExecutionStatus(steps); got != StatusBlocked {
		t.Fatalf("expected %s, got %s", StatusBlocked, got)
	}
}

func TestDeriveExecutionStatusFalseSuccessWinsOverBlocked(t *testing.T) {
	steps := []StepResult{{StepID: "s1", Status: StatusBlocked}, {StepID: "s2", Status: StatusFalseSuccessSuspected}}
	if got := DeriveExecutionStatus(steps); got != StatusFalseSuccessSuspected {
		t.Fatalf("expected %s, got %s", StatusFalseSuccessSuspected, got)
	}
}

func TestRequiresHumanGateOnAmbiguousFailure(t *testing.T) {
	step := ScenarioStep{StepID: "s1"}
	attempts := []RouteAttempt{{AttemptIndex: 1, FailureClass: FailureClassAmbiguous}}
	if !RequiresHumanGate(step, attempts, nil) {
		t.Fatal("expected human gate for ambiguous failure")
	}
}

func TestRequiresHumanGateOnPermissionBlocked(t *testing.T) {
	step := ScenarioStep{StepID: "s1"}
	attempts := []RouteAttempt{{AttemptIndex: 1, FailureClass: FailureClassPermissionBlocked}}
	if !RequiresHumanGate(step, attempts, nil) {
		t.Fatal("expected human gate for permission blocked")
	}
}

func TestIsTerminalStatus(t *testing.T) {
	for _, status := range []string{StatusSucceeded, StatusFailed, StatusBlocked, StatusDegraded, StatusPartial, StatusFalseSuccessSuspected} {
		if !IsTerminalStatus(status) {
			t.Fatalf("expected terminal status for %s", status)
		}
	}
	if IsTerminalStatus(StatusRunning) {
		t.Fatal("did not expect running to be terminal")
	}
}

func TestNormalizeFailureClass(t *testing.T) {
	if got := NormalizeFailureClass(FailureClassTimeout); got != FailureClassTimeout {
		t.Fatalf("expected %s, got %s", FailureClassTimeout, got)
	}
	if got := NormalizeFailureClass("unknown"); got != FailureClassNone {
		t.Fatalf("expected empty failure class, got %q", got)
	}
}
