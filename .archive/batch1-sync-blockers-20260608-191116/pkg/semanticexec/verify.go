package semanticexec

func BuildVerificationChecks(step ScenarioStep, attempt RouteAttempt) []VerificationCheck {
	switch step.MockOutcome {
	case StatusSucceeded:
		return []VerificationCheck{
			{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Passed: true},
			{CheckID: step.StepID + ":state", CheckType: VerifierState, Passed: true},
			{CheckID: step.StepID + ":business", CheckType: VerifierBusiness, Passed: true},
		}
	case StatusBlocked:
		return []VerificationCheck{{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Inconclusive: true, Message: "blocked before verification"}}
	case StatusPartial:
		return []VerificationCheck{
			{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Passed: true},
			{CheckID: step.StepID + ":state", CheckType: VerifierState, Passed: true},
			{CheckID: step.StepID + ":business", CheckType: VerifierBusiness, Passed: false, Message: "main business goal not closed"},
		}
	case StatusDegraded:
		return []VerificationCheck{
			{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Passed: true},
			{CheckID: step.StepID + ":evidence", CheckType: VerifierEvidence, Inconclusive: true, Message: "evidence insufficient"},
		}
	case StatusFalseSuccessSuspected:
		return []VerificationCheck{
			{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Passed: true},
			{CheckID: step.StepID + ":business", CheckType: VerifierBusiness, Passed: false, Message: "action reported success but business state did not change"},
		}
	default:
		checks := []VerificationCheck{{CheckID: step.StepID + ":ui", CheckType: VerifierUI, Passed: false, Message: "action failed"}}
		if attempt.Success {
			checks = append(checks, VerificationCheck{CheckID: step.StepID + ":state", CheckType: VerifierState, Passed: false, Message: "state validation failed"})
		}
		return checks
	}
}

func HasPassingVerifier(checks []VerificationCheck) bool {
	for _, check := range checks {
		if check.Passed {
			return true
		}
	}
	return false
}

func HasVerifierType(checks []VerificationCheck, verifierType string) bool {
	for _, check := range checks {
		if check.CheckType == verifierType {
			return true
		}
	}
	return false
}

func HasBusinessVerifierPass(checks []VerificationCheck) bool {
	for _, check := range checks {
		if check.CheckType == VerifierBusiness && check.Passed {
			return true
		}
	}
	return false
}

func HasEvidenceVerifierPass(checks []VerificationCheck) bool {
	for _, check := range checks {
		if check.CheckType == VerifierEvidence && check.Passed {
			return true
		}
	}
	return false
}

func HasAnyVerifierFailure(checks []VerificationCheck) bool {
	for _, check := range checks {
		if !check.Passed && !check.Inconclusive {
			return true
		}
	}
	return false
}

func DetectFalseSuccess(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool {
	if !attempt.Success {
		return false
	}
	if partialProgress, _ := step.Metadata["partialProgress"].(bool); partialProgress {
		return false
	}
	for _, check := range checks {
		if check.Inconclusive || check.Passed {
			continue
		}
		if check.CheckType == VerifierBusiness || check.CheckType == VerifierState {
			return true
		}
	}
	return false
}

func ShouldMarkDegraded(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool {
	if !attempt.Success || !step.AllowDegraded {
		return false
	}
	uiPass := false
	hasInconclusive := false
	for _, check := range checks {
		if check.CheckType == VerifierUI && check.Passed {
			uiPass = true
		}
		if check.Inconclusive || (check.CheckType == VerifierEvidence && !check.Passed) {
			hasInconclusive = true
		}
	}
	if DetectFalseSuccess(step, attempt, checks) {
		return false
	}
	return uiPass && hasInconclusive && !HasBusinessVerifierPass(checks)
}

func ShouldMarkPartial(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool {
	if !attempt.Success {
		return false
	}
	if DetectFalseSuccess(step, attempt, checks) {
		return false
	}
	partialProgress, _ := step.Metadata["partialProgress"].(bool)
	if !partialProgress {
		return false
	}
	uiPass := false
	statePass := false
	businessPass := false
	for _, check := range checks {
		if check.CheckType == VerifierUI && check.Passed {
			uiPass = true
		}
		if check.CheckType == VerifierState && check.Passed {
			statePass = true
		}
		if check.CheckType == VerifierBusiness && check.Passed {
			businessPass = true
		}
	}
	return uiPass && statePass && !businessPass
}
