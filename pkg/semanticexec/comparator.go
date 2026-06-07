package semanticexec

type ComparisonResult struct {
	Passed                 bool     `json:"passed"`
	StatusMatch            bool     `json:"statusMatch"`
	FailureClassMatch      bool     `json:"failureClassMatch"`
	HumanGateMatch         bool     `json:"humanGateMatch"`
	FalseSuccessGuardPass  bool     `json:"falseSuccessGuardPass"`
	Failures               []string `json:"failures,omitempty"`
}

func CompareExpected(actual ExecutionResult, expected ExpectedOutcome) ComparisonResult {
	result := ComparisonResult{
		Passed:                true,
		StatusMatch:           true,
		FailureClassMatch:     true,
		HumanGateMatch:        true,
		FalseSuccessGuardPass: true,
		Failures:              make([]string, 0),
	}

	if actual.Status != expected.ExpectedStatus {
		result.Passed = false
		result.StatusMatch = false
		result.Failures = append(result.Failures, "status mismatch")
	}

	actualHumanGate := false
	actualFalseSuccess := false
	actualFailureClass := FailureClassNone
	for _, step := range actual.Steps {
		if step.HumanGateRequired {
			actualHumanGate = true
		}
		if step.FalseSuccessSuspected {
			actualFalseSuccess = true
		}
		if actualFailureClass == FailureClassNone && step.FailureClass != FailureClassNone {
			actualFailureClass = step.FailureClass
		}
	}

	if actualHumanGate != expected.ExpectedHumanGate {
		result.Passed = false
		result.HumanGateMatch = false
		result.Failures = append(result.Failures, "human gate mismatch")
	}
	if actualFalseSuccess != expected.ExpectedFalseSuccess {
		result.Passed = false
		result.FalseSuccessGuardPass = false
		result.Failures = append(result.Failures, "false success mismatch")
	}
	if expected.ExpectedFailureClass != "" && actualFailureClass != expected.ExpectedFailureClass {
		result.Passed = false
		result.FailureClassMatch = false
		result.Failures = append(result.Failures, "failure class mismatch")
	}

	return result
}
