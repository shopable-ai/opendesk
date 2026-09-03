package semanticexec_test

import (
	"testing"

	"opendesk/pkg/operator"
	"opendesk/pkg/semanticexec"
)

func TestAuditSemanticFixtures(t *testing.T) {
	report, err := operator.AuditSemanticFixtures("fixtures")
	if err != nil {
		t.Fatalf("AuditSemanticFixtures returned error: %v", err)
	}
	if report.ScenarioCount != 9 {
		t.Fatalf("expected 9 scenarios, got %d", report.ScenarioCount)
	}
	if report.ExpectedCount != 9 {
		t.Fatalf("expected 9 expected files, got %d", report.ExpectedCount)
	}
	if !report.Coverage[semanticexec.StatusSucceeded] {
		t.Fatal("expected succeeded coverage")
	}
	if !report.Coverage[semanticexec.StatusBlocked] {
		t.Fatal("expected blocked coverage")
	}
	if !report.Coverage[semanticexec.StatusDegraded] {
		t.Fatal("expected degraded coverage")
	}
	if !report.Coverage[semanticexec.StatusPartial] {
		t.Fatal("expected partial coverage")
	}
	if !report.Coverage[semanticexec.StatusFalseSuccessSuspected] {
		t.Fatal("expected false_success_suspected coverage")
	}
	if report.StatusCounts[semanticexec.StatusBlocked] < 3 {
		t.Fatalf("expected at least 3 blocked cases, got %d", report.StatusCounts[semanticexec.StatusBlocked])
	}
	if report.StatusCounts[semanticexec.StatusFailed] < 2 {
		t.Fatalf("expected at least 2 failed cases, got %d", report.StatusCounts[semanticexec.StatusFailed])
	}
	if report.FailExpectedCount != 1 {
		t.Fatalf("expected 1 fail_expected case, got %d", report.FailExpectedCount)
	}
	if len(report.FailExpectedIDs) != 1 || report.FailExpectedIDs[0] != "false_success_save_without_persist" {
		t.Fatalf("unexpected failExpectedIDs: %v", report.FailExpectedIDs)
	}
	if !report.Passed {
		t.Fatalf("expected maintenance report to pass, got triage=%v", report.Triage)
	}
}
