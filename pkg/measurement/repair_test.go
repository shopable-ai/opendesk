package measurement

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

type repairExecutorFunc func(context.Context, RepairCandidate) (RepairAttemptOutcome, error)
func (f repairExecutorFunc) RetryFailedStep(ctx context.Context, c RepairCandidate) (RepairAttemptOutcome, error) { return f(ctx, c) }
type repairVerifierFunc func(context.Context, RepairCandidate) (RepairAttemptOutcome, error)
func (f repairVerifierFunc) VerifyBusinessResult(ctx context.Context, c RepairCandidate) (RepairAttemptOutcome, error) { return f(ctx, c) }

func TestMeasurementEligibleFailureClassification(t *testing.T) {
	for _, class := range []FailureClass{FailureTargetNotFound, FailureAmbiguousTarget, FailureWindowChanged, FailureGeometryDrift, FailureOCRMismatch, FailureAccessibility, FailureVisualMismatch} {
		if !MeasurementEligibleFailure(class) { t.Fatalf("expected measurement eligibility for %s", class) }
		if len(DefaultNeededEvidence(class)) == 0 { t.Fatalf("missing evidence request for %s", class) }
	}
	for _, class := range []FailureClass{FailureStateMismatch, FailurePermission, FailureBusinessVerification} {
		if MeasurementEligibleFailure(class) { t.Fatalf("unexpected measurement eligibility for %s", class) }
	}
}

func TestRepairOnlyQualifiesAfterExecutionAndVerificationPass(t *testing.T) {
	now := time.Date(2026, 9, 15, 10, 0, 0, 0, time.UTC)
	failure := AutomationFailure{Class: FailureGeometryDrift, StepID: "tap-total", Message: "target moved", EvidenceRefs: []string{"measurement/old.json"}}
	request, err := NewRepairRequest("calc-task", failure, []string{"recorder/action.json"}, now)
	if err != nil { t.Fatal(err) }
	candidate, err := NewRepairCandidate(request, []string{"measurement/evidence.json"}, ProposedChange{Kind:"locator-constraint", Target:"total", Constraint:map[string]any{"region":"reference-relative"}, Reason:"new measurement confirms geometry drift"}, now)
	if err != nil { t.Fatal(err) }

	rejected, err := ExecuteRepair(context.Background(), candidate,
		repairExecutorFunc(func(context.Context, RepairCandidate)(RepairAttemptOutcome,error){return RepairAttemptOutcome{Pass:true},nil}),
		repairVerifierFunc(func(context.Context, RepairCandidate)(RepairAttemptOutcome,error){return RepairAttemptOutcome{Pass:false,Message:"display value wrong"},nil}), now.Add(time.Minute))
	if err != nil { t.Fatal(err) }
	if rejected.Status != RepairRejected || rejected.QualifiedAt != nil { t.Fatalf("verification failure qualified repair: %+v", rejected) }

	qualified, err := ExecuteRepair(context.Background(), candidate,
		repairExecutorFunc(func(context.Context, RepairCandidate)(RepairAttemptOutcome,error){return RepairAttemptOutcome{Pass:true,Message:"retry pass"},nil}),
		repairVerifierFunc(func(context.Context, RepairCandidate)(RepairAttemptOutcome,error){return RepairAttemptOutcome{Pass:true,Message:"business result pass"},nil}), now.Add(2*time.Minute))
	if err != nil { t.Fatal(err) }
	if qualified.Status != RepairQualified || qualified.QualifiedAt == nil || qualified.Execution == nil || qualified.Verification == nil { t.Fatalf("qualified repair missing gates: %+v", qualified) }
}

func TestRepairHistoryUsesAutomationAuthoringTaskPackage(t *testing.T) {
	root := t.TempDir()
	now := time.Date(2026, 9, 15, 10, 0, 0, 0, time.UTC)
	failure := AutomationFailure{Class: FailureAmbiguousTarget, StepID: "step-2"}
	request, err := NewRepairRequest("task-42", failure, nil, now); if err != nil { t.Fatal(err) }
	candidate, err := NewRepairCandidate(request, []string{"measurement/evidence.json"}, ProposedChange{Kind:"semantic-locator", Reason:"measurement selected the correct candidate"}, now); if err != nil { t.Fatal(err) }
	candidate.Status = RepairRejected
	path, err := AppendRepairHistory(root, failure, request, candidate, now.Add(time.Second)); if err != nil { t.Fatal(err) }
	want := filepath.Join(".runtime", "automation-authoring", "task-42", "measurement", "repair-history.jsonl")
	if !pathHasSuffix(path, want) { t.Fatalf("repair history path=%q want suffix=%q", path, want) }
	entries, err := LoadRepairHistory(root, "task-42"); if err != nil { t.Fatal(err) }
	if len(entries) != 1 || entries[0].Candidate.FailedStep != "step-2" || entries[0].Candidate.Status != RepairRejected { t.Fatalf("history=%+v", entries) }
}

func TestNonMeasurementFailureDoesNotCreateRepairRequest(t *testing.T) {
	for _, class := range []FailureClass{FailurePermission, FailureStateMismatch, FailureBusinessVerification} {
		if _, err := NewRepairRequest("task", AutomationFailure{Class: class, StepID:"s1"}, nil, time.Now()); err == nil { t.Fatalf("class %s should be rejected", class) }
	}
}
