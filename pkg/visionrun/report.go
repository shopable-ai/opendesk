package visionrun

import (
	"fmt"
	"path/filepath"
	"time"
)

type StageStatus string

const (
	StageStatusPending StageStatus = "pending"
	StageStatusRunning StageStatus = "running"
	StageStatusPassed  StageStatus = "passed"
	StageStatusFailed  StageStatus = "failed"
	StageStatusBlocked StageStatus = "blocked"
	StageStatusSkipped StageStatus = "skipped"
)

type RunMode string

const (
	RunModeParse    RunMode = "parse"
	RunModeValidate RunMode = "validate"
	RunModeSend     RunMode = "send"
)

type StageName string

const (
	StageRuntimePreflight             StageName = "RuntimePreflight"
	StageGoldenParseImprove           StageName = "GoldenParseImprove"
	StageJudgeGolden                  StageName = "JudgeGolden"
	StageCaptureRealAppScreenshot     StageName = "CaptureRealAppScreenshot"
	StageValidateRealAppAgainstGolden StageName = "ValidateRealAppAgainstGolden"
	StageJudgeRealValidation          StageName = "JudgeRealValidation"
	StageDiagnose                     StageName = "Diagnose"
	StageRepair                       StageName = "Repair"
	StageReRun                        StageName = "ReRun"
	StageEnableActionStage            StageName = "EnableActionStage"
	StageActionabilityRefresh         StageName = "ActionabilityRefresh"
	StageSendSafety                   StageName = "SendSafety"
	StageExecuteSend                  StageName = "ExecuteSend"
	StagePostSendVerify               StageName = "PostSendVerify"
)

type Blocker struct {
	Code            string   `json:"code"`
	Stage           string   `json:"stage"`
	Severity        string   `json:"severity"`
	Message         string   `json:"message"`
	SuggestedRepair string   `json:"suggestedRepair,omitempty"`
	EvidenceRefs    []string `json:"evidenceRefs,omitempty"`
}

type StageResult struct {
	Name       string         `json:"name"`
	Status     StageStatus    `json:"status"`
	StartedAt  string         `json:"startedAt,omitempty"`
	FinishedAt string         `json:"finishedAt,omitempty"`
	Summary    string         `json:"summary,omitempty"`
	Artifacts  []string       `json:"artifacts,omitempty"`
	Blockers   []Blocker      `json:"blockers,omitempty"`
	Metrics    map[string]any `json:"metrics,omitempty"`
}

type GateStatus struct {
	GoldenPassed                   bool      `json:"goldenPassed"`
	RealScreenshotValidationPassed bool      `json:"realScreenshotValidationPassed"`
	ActionStageAllowed             bool      `json:"actionStageAllowed"`
	SendAllowed                    bool      `json:"sendAllowed"`
	Blockers                       []Blocker `json:"blockers,omitempty"`
}

type RepairAttempt struct {
	Attempt   int      `json:"attempt"`
	Strategy  string   `json:"strategy"`
	Outcome   string   `json:"outcome"`
	ReRunRefs []string `json:"reRunRefs,omitempty"`
}

type GateAnswerSummary struct {
	GoldenPassed                   bool     `json:"goldenPassed"`
	RealScreenshotValidationPassed bool     `json:"realScreenshotValidationPassed"`
	ActionStageAllowed             bool     `json:"actionStageAllowed"`
	SendAllowed                    bool     `json:"sendAllowed"`
	BlockingReasonCount            int      `json:"blockingReasonCount"`
	BlockingReasons                []string `json:"blockingReasons,omitempty"`
}

type VisionRunReport struct {
	SchemaVersion string          `json:"schemaVersion"`
	RunID         string          `json:"runId"`
	Mode          RunMode         `json:"mode"`
	StartedAt     string          `json:"startedAt"`
	FinishedAt    string          `json:"finishedAt,omitempty"`
	FinalStatus   string          `json:"finalStatus"`
	Input         map[string]any  `json:"input,omitempty"`
	Stages        []StageResult   `json:"stages"`
	Gates         GateStatus      `json:"gates"`
	Blockers      []Blocker       `json:"blockers,omitempty"`
	RepairHistory []RepairAttempt `json:"repairHistory,omitempty"`
	Artifacts     map[string]any  `json:"artifacts,omitempty"`
	Summary       string          `json:"summary,omitempty"`
}

func buildRunReport(runID, preflightState string) map[string]any {
	now := time.Now().Format(time.RFC3339)
	return map[string]any{
		"schemaVersion": schemaVersion,
		"runId":         runID,
		"mode":          string(RunModeParse),
		"startedAt":     now,
		"finalStatus":   "pending",
		"input": map[string]any{
			"preflightState": preflightState,
		},
		"stages": []StageResult{},
		"gates": GateStatus{
			GoldenPassed:                   false,
			RealScreenshotValidationPassed: false,
			ActionStageAllowed:             false,
			SendAllowed:                    false,
			Blockers:                       []Blocker{},
		},
		"blockers": []Blocker{},
		"artifacts": map[string]any{
			"decision": filepath.ToSlash(filepath.Join("artifacts", "runs", runID, "decision.json")),
		},
		"summary": "run initialized; awaiting stage execution",
		"gateAnswerSummary": map[string]any{
			"goldenPassed":                   false,
			"realScreenshotValidationPassed": false,
			"actionStageAllowed":             false,
			"sendAllowed":                    false,
			"blockingReasonCount":            0,
			"blockingReasons":                []string{},
		},
	}
}

func appendRunStage(reportPath string, stage StageResult) error {
	return mutateRunReport(reportPath, func(report map[string]any) {
		stages := arrayOfMaps(report["stages"])
		entry := map[string]any{
			"name":       stage.Name,
			"status":     string(stage.Status),
			"startedAt":  stage.StartedAt,
			"finishedAt": stage.FinishedAt,
			"summary":    stage.Summary,
			"artifacts":  stage.Artifacts,
			"blockers":   stage.Blockers,
			"metrics":    stage.Metrics,
		}
		stages = append(stages, entry)
		report["stages"] = stages
	})
}

func mutateRunReport(path string, mutate func(map[string]any)) error {
	report, err := readJSONMap(path)
	if err != nil {
		return fmt.Errorf("read run report %s: %w", path, err)
	}
	mutate(report)
	report["updatedAt"] = time.Now().Format(time.RFC3339)
	return writeJSON(path, report)
}

func addRunBlockers(reportPath string, blockers ...Blocker) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		existing := normalizeBlockers(report["blockers"])
		existing = append(existing, blockers...)
		report["blockers"] = blockersToAny(existing)
		gates := mapValue(report["gates"])
		gateBlockers := normalizeBlockers(gates["blockers"])
		gateBlockers = append(gateBlockers, blockers...)
		gates["blockers"] = blockersToAny(gateBlockers)
		report["gates"] = gates
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func updateRunGates(reportPath string, mutate func(map[string]any)) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		gates := mapValue(report["gates"])
		mutate(gates)
		report["gates"] = gates
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func updateRunSummary(reportPath, finalStatus, summary string) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		report["finalStatus"] = finalStatus
		report["summary"] = summary
		report["finishedAt"] = time.Now().Format(time.RFC3339)
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func addRepairAttempt(reportPath string, attempt RepairAttempt) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		history := arrayOfMaps(report["repairHistory"])
		history = append(history, map[string]any{
			"attempt":   attempt.Attempt,
			"strategy":  attempt.Strategy,
			"outcome":   attempt.Outcome,
			"reRunRefs": attempt.ReRunRefs,
		})
		report["repairHistory"] = history
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func setRunArtifact(reportPath, key string, value any) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		artifacts := mapValue(report["artifacts"])
		artifacts[key] = value
		report["artifacts"] = artifacts
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func addRunInput(reportPath string, values map[string]any) error {
	if err := mutateRunReport(reportPath, func(report map[string]any) {
		input := mapValue(report["input"])
		for k, v := range values {
			input[k] = v
		}
		report["input"] = input
	}); err != nil {
		return err
	}
	return updateGateAnswerSummary(reportPath)
}

func updateGateAnswerSummary(reportPath string) error {
	return mutateRunReport(reportPath, func(report map[string]any) {
		gates := mapValue(report["gates"])
		blockers := normalizeBlockers(gates["blockers"])
		reasons := make([]string, 0, len(blockers))
		for _, blocker := range blockers {
			msg := blocker.Message
			if msg == "" {
				msg = blocker.Code
			}
			if msg != "" {
				reasons = append(reasons, msg)
			}
		}
		report["gateAnswerSummary"] = map[string]any{
			"goldenPassed":                   boolValue(gates["goldenPassed"]),
			"realScreenshotValidationPassed": boolValue(gates["realScreenshotValidationPassed"]),
			"actionStageAllowed":             boolValue(gates["actionStageAllowed"]),
			"sendAllowed":                    boolValue(gates["sendAllowed"]),
			"blockingReasonCount":            len(reasons),
			"blockingReasons":                reasons,
		}
	})
}

func blockersToAny(blockers []Blocker) []any {
	out := make([]any, 0, len(blockers))
	for _, blocker := range blockers {
		out = append(out, map[string]any{
			"code":            blocker.Code,
			"stage":           blocker.Stage,
			"severity":        blocker.Severity,
			"message":         blocker.Message,
			"suggestedRepair": blocker.SuggestedRepair,
			"evidenceRefs":    blocker.EvidenceRefs,
		})
	}
	return out
}

func normalizeBlockers(raw any) []Blocker {
	items := arrayOfMaps(raw)
	out := make([]Blocker, 0, len(items))
	for _, item := range items {
		out = append(out, Blocker{
			Code:            stringValue(item["code"]),
			Stage:           stringValue(item["stage"]),
			Severity:        stringValue(item["severity"]),
			Message:         stringValue(item["message"]),
			SuggestedRepair: stringValue(item["suggestedRepair"]),
			EvidenceRefs:    normalizeStringSlice(item["evidenceRefs"]),
		})
	}
	return out
}
