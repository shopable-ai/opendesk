package recorder

import (
	"context"
	"fmt"
	"time"
)

type ReplayDriver interface {
	CheckPreconditions(context.Context, FlowStep) error
	ResolveTarget(context.Context, FlowStep) (any, error)
	Execute(context.Context, FlowStep, any) error
	Verify(context.Context, FlowStep) error
}

type ReplayStepResult struct {
	StepID       string `json:"stepId"`
	Status       string `json:"status"`
	FailureClass string `json:"failureClass,omitempty"`
	Error        string `json:"error,omitempty"`
	DurationMs   int64  `json:"durationMs"`
}

type ReplayReport struct {
	SchemaVersion     string             `json:"schemaVersion"`
	FlowID            string             `json:"flowId"`
	Mode              string             `json:"mode"`
	Status            string             `json:"status"`
	WrongTargetClicks int                `json:"wrongTargetClicks"`
	Steps             []ReplayStepResult `json:"steps"`
}

func Replay(ctx context.Context, flow Flow, driver ReplayDriver) ReplayReport {
	report := ReplayReport{SchemaVersion: SchemaVersion, FlowID: flow.FlowID, Mode: "deterministic", Status: "running"}
	if flow.Mode != "deterministic" {
		report.Status = "failed"
		report.Steps = append(report.Steps, ReplayStepResult{Status: "failed", FailureClass: "F8", Error: "flow mode is not deterministic"})
		return report
	}
	for _, step := range flow.Steps {
		started := time.Now()
		result := ReplayStepResult{StepID: step.StepID, Status: "running"}
		if err := driver.CheckPreconditions(ctx, step); err != nil {
			return stopReplay(report, result, "F0", err, started)
		}
		target, err := driver.ResolveTarget(ctx, step)
		if err != nil {
			return stopReplay(report, result, "F4", err, started)
		}
		if target == nil && step.Action.Name == "click" {
			return stopReplay(report, result, "F4", fmt.Errorf("target is unresolved"), started)
		}
		if err := driver.Execute(ctx, step, target); err != nil {
			return stopReplay(report, result, "F5", err, started)
		}
		if err := driver.Verify(ctx, step); err != nil {
			return stopReplay(report, result, "F6", err, started)
		}
		result.Status = "passed"
		result.DurationMs = time.Since(started).Milliseconds()
		report.Steps = append(report.Steps, result)
	}
	report.Status = "passed"
	return report
}

func stopReplay(report ReplayReport, result ReplayStepResult, failureClass string, err error, started time.Time) ReplayReport {
	result.Status = "failed"
	result.FailureClass = failureClass
	result.Error = err.Error()
	result.DurationMs = time.Since(started).Milliseconds()
	report.Steps = append(report.Steps, result)
	report.Status = "failed"
	return report
}
