package visionrun

func readRunGates(reportPath string) (GateStatus, error) {
	report, err := readJSONMap(reportPath)
	if err != nil {
		return GateStatus{}, err
	}
	gates := mapValue(report["gates"])
	return GateStatus{
		GoldenPassed:                   boolValue(gates["goldenPassed"]),
		RealScreenshotValidationPassed: boolValue(gates["realScreenshotValidationPassed"]),
		ActionStageAllowed:             boolValue(gates["actionStageAllowed"]),
		SendAllowed:                    boolValue(gates["sendAllowed"]),
		Blockers:                       normalizeBlockers(gates["blockers"]),
	}, nil
}

func readGateAnswerSummary(reportPath string) (map[string]any, error) {
	report, err := readJSONMap(reportPath)
	if err != nil {
		return nil, err
	}
	return mapValue(report["gateAnswerSummary"]), nil
}

func gateSummary(reportPath string) string {
	summary, err := readGateAnswerSummary(reportPath)
	if err == nil && len(summary) > 0 {
		return formatGateAnswerSummary(summary)
	}
	gates, err := readRunGates(reportPath)
	if err != nil {
		return "gate summary unavailable"
	}
	if !gates.GoldenPassed {
		return "golden passed=false real screenshot validation passed=false action stage allowed=false send allowed=false"
	}
	if !gates.RealScreenshotValidationPassed {
		return "golden passed=true real screenshot validation passed=false action stage allowed=false send allowed=false"
	}
	if !gates.ActionStageAllowed {
		return "golden passed=true real screenshot validation passed=true action stage allowed=false send allowed=false"
	}
	if !gates.SendAllowed {
		return "golden passed=true real screenshot validation passed=true action stage allowed=true send allowed=false"
	}
	return "golden passed=true real screenshot validation passed=true action stage allowed=true send allowed=true"
}

func formatGateAnswerSummary(summary map[string]any) string {
	return "golden passed=" + boolString(boolValue(summary["goldenPassed"])) +
		" real screenshot validation passed=" + boolString(boolValue(summary["realScreenshotValidationPassed"])) +
		" action stage allowed=" + boolString(boolValue(summary["actionStageAllowed"])) +
		" send allowed=" + boolString(boolValue(summary["sendAllowed"]))
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}
