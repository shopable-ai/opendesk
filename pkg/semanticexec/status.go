package semanticexec

func DeriveStepStatus(step ScenarioStep, attempts []RouteAttempt, checks []VerificationCheck) string {
	if DetectFalseSuccess(step, latestAttempt(attempts), checks) {
		return StatusFalseSuccessSuspected
	}
	if RequiresHumanGate(step, attempts, checks) {
		return StatusBlocked
	}

	failureClass := NormalizeFailureClass(step.MockFailureClass)
	for _, attempt := range attempts {
		attemptFailure := NormalizeFailureClass(attempt.FailureClass)
		if isBlockedFailure(attemptFailure) {
			return StatusBlocked
		}
		if failureClass == FailureClassNone {
			failureClass = attemptFailure
		}
	}
	if isBlockedFailure(failureClass) {
		return StatusBlocked
	}

	if ShouldMarkPartial(step, latestAttempt(attempts), checks) {
		return StatusPartial
	}
	if ShouldMarkDegraded(step, latestAttempt(attempts), checks) {
		return StatusDegraded
	}
	if latestAttempt(attempts).Success && HasPassingVerifier(checks) && HasBusinessVerifierPass(checks) {
		return StatusSucceeded
	}
	return StatusFailed
}

func DeriveExecutionStatus(steps []StepResult) string {
	hasBlocked := false
	hasFailed := false
	hasPartial := false
	hasDegraded := false
	for _, step := range steps {
		switch step.Status {
		case StatusFalseSuccessSuspected:
			return StatusFalseSuccessSuspected
		case StatusBlocked:
			hasBlocked = true
		case StatusFailed:
			hasFailed = true
		case StatusPartial:
			hasPartial = true
		case StatusDegraded:
			hasDegraded = true
		}
	}
	if hasBlocked {
		return StatusBlocked
	}
	if hasFailed {
		return StatusFailed
	}
	if hasPartial {
		return StatusPartial
	}
	if hasDegraded {
		return StatusDegraded
	}
	return StatusSucceeded
}

func RequiresHumanGate(step ScenarioStep, attempts []RouteAttempt, checks []VerificationCheck) bool {
	if step.RequiresHumanGate {
		return true
	}
	for _, attempt := range attempts {
		switch NormalizeFailureClass(attempt.FailureClass) {
		case FailureClassAmbiguous, FailureClassPermissionBlocked:
			return true
		}
	}
	for _, check := range checks {
		if check.Metadata != nil {
			if required, ok := check.Metadata["humanGateRequired"].(bool); ok && required {
				return true
			}
		}
	}
	return false
}

func IsTerminalStatus(status string) bool {
	switch status {
	case StatusSucceeded, StatusFailed, StatusBlocked, StatusDegraded, StatusPartial, StatusFalseSuccessSuspected:
		return true
	default:
		return false
	}
}

func IsBlockedLike(status string) bool {
	return status == StatusBlocked
}

func IsSuccessLike(status string) bool {
	switch status {
	case StatusSucceeded, StatusDegraded, StatusPartial:
		return true
	default:
		return false
	}
}

func NormalizeFailureClass(raw string) string {
	switch raw {
	case FailureClassPreconditionFailed,
		FailureClassTargetNotFound,
		FailureClassAmbiguous,
		FailureClassPermissionBlocked,
		FailureClassVerificationFailed,
		FailureClassDriverError,
		FailureClassTimeout,
		FailureClassEnvironmentalDrift,
		FailureClassFalseSuccess:
		return raw
	default:
		return FailureClassNone
	}
}

func isBlockedFailure(failureClass string) bool {
	switch failureClass {
	case FailureClassPreconditionFailed, FailureClassAmbiguous, FailureClassPermissionBlocked:
		return true
	default:
		return false
	}
}

func latestAttempt(attempts []RouteAttempt) RouteAttempt {
	if len(attempts) == 0 {
		return RouteAttempt{}
	}
	return attempts[len(attempts)-1]
}
