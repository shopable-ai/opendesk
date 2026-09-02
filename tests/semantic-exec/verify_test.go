package semanticexec_test

import (
	"testing"

	semanticexec "opendesk/pkg/semanticexec"
)

func TestHasPassingVerifierRequiresAtLeastOnePassed(t *testing.T) {
	checks := []semanticexec.VerificationCheck{{CheckID: "c1", CheckType: semanticexec.VerifierUI, Passed: false, Inconclusive: true}}
	if semanticexec.HasPassingVerifier(checks) {
		t.Fatal("did not expect passing verifier")
	}
	checks = append(checks, semanticexec.VerificationCheck{CheckID: "c2", CheckType: semanticexec.VerifierState, Passed: true})
	if !semanticexec.HasPassingVerifier(checks) {
		t.Fatal("expected passing verifier")
	}
}

func TestHasBusinessVerifierPass(t *testing.T) {
	checks := []semanticexec.VerificationCheck{{CheckID: "c1", CheckType: semanticexec.VerifierBusiness, Passed: true}}
	if !semanticexec.HasBusinessVerifierPass(checks) {
		t.Fatal("expected business verifier pass")
	}
}

func TestDetectFalseSuccessWhenActionSucceedsButBusinessVerifierFails(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1", MockOutcome: semanticexec.StatusFalseSuccessSuspected}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []semanticexec.VerificationCheck{
		{CheckID: "ui", CheckType: semanticexec.VerifierUI, Passed: true},
		{CheckID: "biz", CheckType: semanticexec.VerifierBusiness, Passed: false},
	}
	if !semanticexec.DetectFalseSuccess(step, attempt, checks) {
		t.Fatal("expected false success detection")
	}
}

func TestDetectFalseSuccessWhenActionFailsDoesNotTrigger(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1"}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: false}
	checks := []semanticexec.VerificationCheck{{CheckID: "biz", CheckType: semanticexec.VerifierBusiness, Passed: false}}
	if semanticexec.DetectFalseSuccess(step, attempt, checks) {
		t.Fatal("did not expect false success detection when action failed")
	}
}

func TestShouldMarkDegradedWhenEvidenceIsInconclusiveAndAllowed(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1", AllowDegraded: true}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []semanticexec.VerificationCheck{
		{CheckID: "ui", CheckType: semanticexec.VerifierUI, Passed: true},
		{CheckID: "evidence", CheckType: semanticexec.VerifierEvidence, Inconclusive: true},
	}
	if !semanticexec.ShouldMarkDegraded(step, attempt, checks) {
		t.Fatal("expected degraded classification")
	}
}

func TestShouldMarkDegradedWhenNotAllowed(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1", AllowDegraded: false}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []semanticexec.VerificationCheck{
		{CheckID: "ui", CheckType: semanticexec.VerifierUI, Passed: true},
		{CheckID: "evidence", CheckType: semanticexec.VerifierEvidence, Inconclusive: true},
	}
	if semanticexec.ShouldMarkDegraded(step, attempt, checks) {
		t.Fatal("did not expect degraded classification")
	}
}

func TestShouldMarkPartialWhenProgressExistsWithoutMainGoalClosure(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "s1", Metadata: map[string]any{"partialProgress": true}}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []semanticexec.VerificationCheck{
		{CheckID: "ui", CheckType: semanticexec.VerifierUI, Passed: true},
		{CheckID: "state", CheckType: semanticexec.VerifierState, Passed: true},
		{CheckID: "biz", CheckType: semanticexec.VerifierBusiness, Passed: false},
	}
	if !semanticexec.ShouldMarkPartial(step, attempt, checks) {
		t.Fatal("expected partial classification")
	}
}

func TestBuildVerificationChecksForFalseSuccessFixture(t *testing.T) {
	step := semanticexec.ScenarioStep{StepID: "save", MockOutcome: semanticexec.StatusFalseSuccessSuspected}
	attempt := semanticexec.RouteAttempt{AttemptIndex: 1, Success: true}
	checks := semanticexec.BuildVerificationChecks(step, attempt)
	if len(checks) != 2 {
		t.Fatalf("expected 2 checks, got %d", len(checks))
	}
	if checks[0].CheckType != semanticexec.VerifierUI || !checks[0].Passed {
		t.Fatalf("unexpected ui check: %+v", checks[0])
	}
	if checks[1].CheckType != semanticexec.VerifierBusiness || checks[1].Passed {
		t.Fatalf("unexpected business check: %+v", checks[1])
	}
}
