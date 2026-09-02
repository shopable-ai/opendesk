package semanticexec

import "testing"

func TestHasPassingVerifierRequiresAtLeastOnePassed(t *testing.T) {
	checks := []VerificationCheck{{CheckID: "c1", CheckType: VerifierUI, Passed: false, Inconclusive: true}}
	if HasPassingVerifier(checks) {
		t.Fatal("did not expect passing verifier")
	}
	checks = append(checks, VerificationCheck{CheckID: "c2", CheckType: VerifierState, Passed: true})
	if !HasPassingVerifier(checks) {
		t.Fatal("expected passing verifier")
	}
}

func TestHasBusinessVerifierPass(t *testing.T) {
	checks := []VerificationCheck{{CheckID: "c1", CheckType: VerifierBusiness, Passed: true}}
	if !HasBusinessVerifierPass(checks) {
		t.Fatal("expected business verifier pass")
	}
}

func TestDetectFalseSuccessWhenActionSucceedsButBusinessVerifierFails(t *testing.T) {
	step := ScenarioStep{StepID: "s1", MockOutcome: StatusFalseSuccessSuspected}
	attempt := RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []VerificationCheck{
		{CheckID: "ui", CheckType: VerifierUI, Passed: true},
		{CheckID: "biz", CheckType: VerifierBusiness, Passed: false},
	}
	if !DetectFalseSuccess(step, attempt, checks) {
		t.Fatal("expected false success detection")
	}
}

func TestDetectFalseSuccessWhenActionFailsDoesNotTrigger(t *testing.T) {
	step := ScenarioStep{StepID: "s1"}
	attempt := RouteAttempt{AttemptIndex: 1, Success: false}
	checks := []VerificationCheck{{CheckID: "biz", CheckType: VerifierBusiness, Passed: false}}
	if DetectFalseSuccess(step, attempt, checks) {
		t.Fatal("did not expect false success detection when action failed")
	}
}

func TestShouldMarkDegradedWhenEvidenceIsInconclusiveAndAllowed(t *testing.T) {
	step := ScenarioStep{StepID: "s1", AllowDegraded: true}
	attempt := RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []VerificationCheck{
		{CheckID: "ui", CheckType: VerifierUI, Passed: true},
		{CheckID: "evidence", CheckType: VerifierEvidence, Inconclusive: true},
	}
	if !ShouldMarkDegraded(step, attempt, checks) {
		t.Fatal("expected degraded classification")
	}
}

func TestShouldMarkDegradedWhenNotAllowed(t *testing.T) {
	step := ScenarioStep{StepID: "s1", AllowDegraded: false}
	attempt := RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []VerificationCheck{
		{CheckID: "ui", CheckType: VerifierUI, Passed: true},
		{CheckID: "evidence", CheckType: VerifierEvidence, Inconclusive: true},
	}
	if ShouldMarkDegraded(step, attempt, checks) {
		t.Fatal("did not expect degraded classification")
	}
}

func TestShouldMarkPartialWhenProgressExistsWithoutMainGoalClosure(t *testing.T) {
	step := ScenarioStep{StepID: "s1", Metadata: map[string]any{"partialProgress": true}}
	attempt := RouteAttempt{AttemptIndex: 1, Success: true}
	checks := []VerificationCheck{
		{CheckID: "ui", CheckType: VerifierUI, Passed: true},
		{CheckID: "state", CheckType: VerifierState, Passed: true},
		{CheckID: "biz", CheckType: VerifierBusiness, Passed: false},
	}
	if !ShouldMarkPartial(step, attempt, checks) {
		t.Fatal("expected partial classification")
	}
}

func TestBuildVerificationChecksForFalseSuccessFixture(t *testing.T) {
	step := ScenarioStep{StepID: "save", MockOutcome: StatusFalseSuccessSuspected}
	attempt := RouteAttempt{AttemptIndex: 1, Success: true}
	checks := BuildVerificationChecks(step, attempt)
	if len(checks) != 2 {
		t.Fatalf("expected 2 checks, got %d", len(checks))
	}
	if checks[0].CheckType != VerifierUI || !checks[0].Passed {
		t.Fatalf("unexpected ui check: %+v", checks[0])
	}
	if checks[1].CheckType != VerifierBusiness || checks[1].Passed {
		t.Fatalf("unexpected business check: %+v", checks[1])
	}
}
