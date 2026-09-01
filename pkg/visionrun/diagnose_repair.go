package visionrun

import "time"

type DiagnoseResult struct {
	RunID              string
	ReportPath         string
	CurrentFailedStage string
	FailureType        string
	Why                string
	NextRepair         string
	Should             string
	Blockers           []Blocker
}

type RepairResult struct {
	RunID      string
	ReportPath string
	Attempt    RepairAttempt
}

func RunDiagnose(bundle *Bundle, validation *RealAppValidationResult) (*DiagnoseResult, error) {
	blockers := validation.Blockers
	why := "real validation failed"
	nextRepair := "refresh screenshot and rerun validation"
	if validation.FailureType == "recognition_problem" {
		why = "required zones were missing in the real screenshot parse"
		nextRepair = "refresh capture or worker region report"
	} else if validation.FailureType == "structure_problem" {
		why = "real screenshot structure drifted too far from golden structure"
		nextRepair = "retry capture and rerun detect/infer"
	}
	report := map[string]any{
		"schemaVersion":      schemaVersion,
		"createdAt":          time.Now().Format(time.RFC3339),
		"runId":              bundle.RunID,
		"currentFailedStage": validation.CurrentFailedStage,
		"failureType":        validation.FailureType,
		"why":                why,
		"nextRepair":         nextRepair,
		"should":             validation.Should,
		"blockers":           blockersToAny(blockers),
	}
	path := bundle.RealAppDir + "/diagnose_report.json"
	if err := writeJSON(path, report); err != nil {
		return nil, err
	}
	return &DiagnoseResult{
		RunID:              bundle.RunID,
		ReportPath:         artifactPath(bundle.RunID, "realapp/diagnose_report.json"),
		CurrentFailedStage: validation.CurrentFailedStage,
		FailureType:        validation.FailureType,
		Why:                why,
		NextRepair:         nextRepair,
		Should:             validation.Should,
		Blockers:           blockers,
	}, nil
}

func RunRepair(bundle *Bundle, diagnose *DiagnoseResult, attempt int) (*RepairResult, error) {
	strategy := diagnose.NextRepair
	if strategy == "" {
		strategy = "refresh evidence and rerun"
	}
	repairAttempt := RepairAttempt{
		Attempt:   attempt,
		Strategy:  strategy,
		Outcome:   "recorded",
		ReRunRefs: []string{artifactPath(bundle.RunID, "realapp/diagnose_report.json")},
	}
	report := map[string]any{
		"schemaVersion": schemaVersion,
		"createdAt":     time.Now().Format(time.RFC3339),
		"runId":         bundle.RunID,
		"attempt":       attempt,
		"strategy":      strategy,
		"outcome":       "recorded repair attempt before rerun",
	}
	path := bundle.RealAppDir + "/repair_report.json"
	if err := writeJSON(path, report); err != nil {
		return nil, err
	}
	return &RepairResult{
		RunID:      bundle.RunID,
		ReportPath: artifactPath(bundle.RunID, "realapp/repair_report.json"),
		Attempt:    repairAttempt,
	}, nil
}
