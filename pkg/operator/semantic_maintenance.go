package operator

import (
	"path/filepath"
	"sort"

	"opendesk/pkg/semanticexec"
)

type MaintenanceReport struct {
	Coverage          map[string]bool   `json:"coverage"`
	StatusCounts      map[string]int    `json:"statusCounts"`
	ScenarioCount     int               `json:"scenarioCount"`
	ExpectedCount     int               `json:"expectedCount"`
	FailExpectedCount int               `json:"failExpectedCount"`
	FailExpectedIDs   []string          `json:"failExpectedIds,omitempty"`
	Triage            []string          `json:"triage"`
	Passed            bool              `json:"passed"`
}

func AuditSemanticFixtures(fixturesRoot string) (MaintenanceReport, error) {
	report := MaintenanceReport{
		Coverage:     map[string]bool{},
		StatusCounts: map[string]int{},
		Triage:       make([]string, 0),
		Passed:       true,
	}

	scenarios, err := filepath.Glob(filepath.Join(fixturesRoot, "scenarios", "*.json"))
	if err != nil {
		return MaintenanceReport{}, err
	}
	expecteds, err := filepath.Glob(filepath.Join(fixturesRoot, "expected", "*.expected.json"))
	if err != nil {
		return MaintenanceReport{}, err
	}
	report.ScenarioCount = len(scenarios)
	report.ExpectedCount = len(expecteds)
	if len(scenarios) != len(expecteds) {
		report.Passed = false
		report.Triage = append(report.Triage, "expected_contract_mismatch")
	}

	for _, scenarioPath := range scenarios {
		scenario, err := semanticexec.LoadScenario(scenarioPath)
		if err != nil {
			return MaintenanceReport{}, err
		}
		expectedPath := filepath.Join(fixturesRoot, "expected", scenario.ScenarioID+".expected.json")
		expected, err := semanticexec.LoadExpectedOutcome(expectedPath)
		if err != nil {
			return MaintenanceReport{}, err
		}
		report.Coverage[expected.ExpectedStatus] = true
		report.StatusCounts[expected.ExpectedStatus]++
		if expected.ExpectedSuiteDisposition == "fail_expected" {
			report.FailExpectedCount++
			report.FailExpectedIDs = append(report.FailExpectedIDs, scenario.ScenarioID)
		}
		if expected.SchemaVersion != semanticexec.SchemaVersion || scenario.SchemaVersion != semanticexec.SchemaVersion {
			report.Passed = false
			report.Triage = append(report.Triage, "schema_version_drift")
		}
	}

	sort.Strings(report.FailExpectedIDs)
	if !report.Coverage[semanticexec.StatusSucceeded] ||
		!report.Coverage[semanticexec.StatusBlocked] ||
		!report.Coverage[semanticexec.StatusDegraded] ||
		!report.Coverage[semanticexec.StatusPartial] ||
		!report.Coverage[semanticexec.StatusFalseSuccessSuspected] {
		report.Passed = false
		report.Triage = append(report.Triage, "coverage_gap")
	}
	if report.FailExpectedCount == 0 {
		report.Passed = false
		report.Triage = append(report.Triage, "false_success_regression")
	}
	if report.StatusCounts[semanticexec.StatusBlocked] == 0 || report.StatusCounts[semanticexec.StatusFalseSuccessSuspected] == 0 {
		report.Passed = false
		report.Triage = append(report.Triage, "lifecycle_policy_gap")
	}

	return report, nil
}
