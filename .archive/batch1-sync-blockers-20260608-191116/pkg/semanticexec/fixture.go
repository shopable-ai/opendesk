package semanticexec

import (
	"encoding/json"
	"fmt"
	"os"
)

func LoadScenario(path string) (Scenario, error) {
	var scenario Scenario
	data, err := os.ReadFile(path)
	if err != nil {
		return Scenario{}, fmt.Errorf("read scenario %s: %w", path, err)
	}
	if err := json.Unmarshal(data, &scenario); err != nil {
		return Scenario{}, fmt.Errorf("decode scenario %s: %w", path, err)
	}
	if scenario.SchemaVersion == "" {
		scenario.SchemaVersion = SchemaVersion
	}
	if scenario.ScenarioID == "" {
		return Scenario{}, fmt.Errorf("scenarioId is required in %s", path)
	}
	if len(scenario.Steps) == 0 {
		return Scenario{}, fmt.Errorf("steps are required in %s", path)
	}
	return scenario, nil
}

func LoadExpectedOutcome(path string) (ExpectedOutcome, error) {
	var expected ExpectedOutcome
	data, err := os.ReadFile(path)
	if err != nil {
		return ExpectedOutcome{}, fmt.Errorf("read expected outcome %s: %w", path, err)
	}
	if err := json.Unmarshal(data, &expected); err != nil {
		return ExpectedOutcome{}, fmt.Errorf("decode expected outcome %s: %w", path, err)
	}
	if expected.SchemaVersion == "" {
		expected.SchemaVersion = SchemaVersion
	}
	if expected.ScenarioID == "" {
		return ExpectedOutcome{}, fmt.Errorf("scenarioId is required in %s", path)
	}
	if expected.ExpectedStatus == "" {
		return ExpectedOutcome{}, fmt.Errorf("expectedStatus is required in %s", path)
	}
	if expected.ExpectedSuiteDisposition == "" {
		expected.ExpectedSuiteDisposition = "pass"
	}
	return expected, nil
}
