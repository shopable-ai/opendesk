package benchmark

import (
	"testing"
)

func TestRunSemanticSmokeSuiteRequiresOutcomeCoverage(t *testing.T) {
	report, err := RunSemanticSmokeSuite("../../tests/semantic-exec/fixtures")
	if err != nil {
		t.Fatalf("RunSemanticSmokeSuite returned error: %v", err)
	}
	if !report.Coverage["succeeded"] {
		t.Fatal("expected succeeded coverage")
	}
	if !report.Coverage["blocked"] {
		t.Fatal("expected blocked coverage")
	}
	if !(report.Coverage["partial"] || report.Coverage["degraded"]) {
		t.Fatal("expected partial or degraded coverage")
	}
	if !report.Coverage["false_success_suspected"] {
		t.Fatal("expected false_success_suspected coverage")
	}
}

func TestRunSemanticSmokeSuiteGeneratesStableReport(t *testing.T) {
	report, err := RunSemanticSmokeSuite("../../tests/semantic-exec/fixtures")
	if err != nil {
		t.Fatalf("RunSemanticSmokeSuite returned error: %v", err)
	}
	if len(report.Cases) != 9 {
		t.Fatalf("expected 9 cases, got %d", len(report.Cases))
	}
	if report.ExpectedFailuresHonored != 1 {
		t.Fatalf("expected 1 honored expected failure, got %d", report.ExpectedFailuresHonored)
	}
}

func TestRunSemanticSmokeSuiteFailsOnFalseSuccessCase(t *testing.T) {
	report, err := RunSemanticSmokeSuite("../../tests/semantic-exec/fixtures")
	if err != nil {
		t.Fatalf("RunSemanticSmokeSuite returned error: %v", err)
	}
	if report.UnexpectedPasses != 0 {
		t.Fatalf("expected no unexpected passes, got %d", report.UnexpectedPasses)
	}
	if report.ExpectedFailuresHonored != 1 {
		t.Fatalf("expected false-success case to be treated as honored expected failure, got %d", report.ExpectedFailuresHonored)
	}
}
