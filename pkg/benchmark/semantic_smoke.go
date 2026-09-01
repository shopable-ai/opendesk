package benchmark

import (
	"fmt"
	"path/filepath"
	"sort"

	"opendesk/pkg/semanticexec"
)

type SmokeCaseResult struct {
	ScenarioID          string                               `json:"scenarioId"`
	ExpectedDisposition string                               `json:"expectedDisposition"`
	ActualStatus        string                               `json:"actualStatus"`
	Comparison          semanticexec.ComparisonResult        `json:"comparison"`
}

type SmokeSuiteReport struct {
	Cases                  []SmokeCaseResult `json:"cases"`
	Passed                 bool              `json:"passed"`
	ExpectedFailuresHonored int              `json:"expectedFailuresHonored"`
	UnexpectedPasses       int               `json:"unexpectedPasses"`
	UnexpectedFailures     int               `json:"unexpectedFailures"`
	Coverage               map[string]bool   `json:"coverage"`
}

func RunSemanticSmokeSuite(fixturesRoot string) (SmokeSuiteReport, error) {
	scenarioPaths, err := filepath.Glob(filepath.Join(fixturesRoot, "scenarios", "*.json"))
	if err != nil {
		return SmokeSuiteReport{}, fmt.Errorf("glob scenarios: %w", err)
	}
	sort.Strings(scenarioPaths)
	if len(scenarioPaths) == 0 {
		return SmokeSuiteReport{}, fmt.Errorf("no scenario fixtures found under %s", fixturesRoot)
	}

	report := SmokeSuiteReport{
		Cases:    make([]SmokeCaseResult, 0, len(scenarioPaths)),
		Passed:   true,
		Coverage: map[string]bool{},
	}

	for _, scenarioPath := range scenarioPaths {
		scenario, err := semanticexec.LoadScenario(scenarioPath)
		if err != nil {
			return SmokeSuiteReport{}, err
		}
		expectedPath := filepath.Join(fixturesRoot, "expected", scenario.ScenarioID+".expected.json")
		expected, err := semanticexec.LoadExpectedOutcome(expectedPath)
		if err != nil {
			return SmokeSuiteReport{}, err
		}
		actual, err := semanticexec.RunScenario(scenario)
		if err != nil {
			return SmokeSuiteReport{}, err
		}
		comparison := semanticexec.CompareExpected(actual, expected)
		caseResult := SmokeCaseResult{
			ScenarioID:          scenario.ScenarioID,
			ExpectedDisposition: expected.ExpectedSuiteDisposition,
			ActualStatus:        actual.Status,
			Comparison:          comparison,
		}
		report.Cases = append(report.Cases, caseResult)
		report.Coverage[actual.Status] = true

		switch expected.ExpectedSuiteDisposition {
		case "fail_expected":
			if actual.Status == expected.ExpectedStatus {
				report.ExpectedFailuresHonored++
			} else {
				report.UnexpectedPasses++
				report.Passed = false
			}
		default:
			if comparison.Passed {
				continue
			}
			report.UnexpectedFailures++
			report.Passed = false
		}
	}

	if !report.Coverage[semanticexec.StatusSucceeded] ||
		!report.Coverage[semanticexec.StatusBlocked] ||
		!(report.Coverage[semanticexec.StatusPartial] || report.Coverage[semanticexec.StatusDegraded]) ||
		!report.Coverage[semanticexec.StatusFalseSuccessSuspected] {
		report.Passed = false
		return report, fmt.Errorf("smoke suite coverage incomplete: need succeeded, blocked, partial/degraded, false_success_suspected")
	}

	return report, nil
}
