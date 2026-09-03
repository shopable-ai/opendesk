package semanticexec_test

import (
	"testing"

	semanticexec "opendesk/pkg/semanticexec"
)

func TestDeriveExecutionStatusSucceeded(t *testing.T) {
	steps := []semanticexec.StepResult{{StepID: "s1", Status: semanticexec.StatusSucceeded}}
	if got := semanticexec.DeriveExecutionStatus(steps); got != semanticexec.StatusSucceeded {
		t.Fatalf("expected %s, got %s", semanticexec.StatusSucceeded, got)
	}
}

func TestDeriveExecutionStatusBlockedWinsOverPartial(t *testing.T) {
	steps := []semanticexec.StepResult{{StepID: "s1", Status: semanticexec.StatusPartial}, {StepID: "s2", Status: semanticexec.StatusBlocked}}
	if got := semanticexec.DeriveExecutionStatus(steps); got != semanticexec.StatusBlocked {
		t.Fatalf("expected %s, got %s", semanticexec.StatusBlocked, got)
	}
}

func TestDeriveExecutionStatusFalseSuccessWinsOverBlocked(t *testing.T) {
	steps := []semanticexec.StepResult{{StepID: "s1", Status: semanticexec.StatusBlocked}, {StepID: "s2", Status: semanticexec.StatusFalseSuccessSuspected}}
	if got := semanticexec.DeriveExecutionStatus(steps); got != semanticexec.StatusFalseSuccessSuspected {
		t.Fatalf("expected %s, got %s", semanticexec.StatusFalseSuccessSuspected, got)
	}
}

func TestRequiresHumanGateOnAmbiguousFailure(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1"}
	attempts := []semanticexec.RouteAttempt{{AttemptIndex: 1, FailureClass: semanticexec.FailureClassAmbiguous}}
	if !semanticexec.RequiresHumanGate(step, attempts, nil) {
		t.Fatal("expected human gate for ambiguous failure")
	}
}

func TestRequiresHumanGateOnPermissionBlocked(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1"}
	attempts := []semanticexec.RouteAttempt{{AttemptIndex: 1, FailureClass: semanticexec.FailureClassPermissionBlocked}}
	if !semanticexec.RequiresHumanGate(step, attempts, nil) {
		t.Fatal("expected human gate for permission blocked")
	}
}

func TestIsTerminalStatus(t *testing.T) {
	for _, status := range []string{semanticexec.StatusSucceeded, semanticexec.StatusFailed, semanticexec.StatusBlocked, semanticexec.StatusDegraded, semanticexec.StatusPartial, semanticexec.StatusFalseSuccessSuspected} {
		if !semanticexec.IsTerminalStatus(status) {
			t.Fatalf("expected terminal status for %s", status)
		}
	}
	if semanticexec.IsTerminalStatus(semanticexec.StatusRunning) {
		t.Fatal("did not expect running to be terminal")
	}
}

func TestNormalizeFailureClass(t *testing.T) {
	if got := semanticexec.NormalizeFailureClass(semanticexec.FailureClassTimeout); got != semanticexec.FailureClassTimeout {
		t.Fatalf("expected %s, got %s", semanticexec.FailureClassTimeout, got)
	}
	if got := semanticexec.NormalizeFailureClass("unknown"); got != semanticexec.FailureClassNone {
		t.Fatalf("expected empty failure class, got %q", got)
	}
}
