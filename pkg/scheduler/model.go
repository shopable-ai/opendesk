package scheduler

import "time"

type ScheduleType string

const (
	ScheduleAt    ScheduleType = "at"
	ScheduleEvery ScheduleType = "every"
	ScheduleCron  ScheduleType = "cron"
)

type MisfirePolicy string

const (
	MisfireRunOnce MisfirePolicy = "run_once"
	MisfireSkip    MisfirePolicy = "skip"
)

type RunStatus string

const (
	RunQueued    RunStatus = "queued"
	RunRunning   RunStatus = "running"
	RunSucceeded RunStatus = "succeeded"
	RunFailed    RunStatus = "failed"
	RunCanceled  RunStatus = "canceled"
	RunSkipped   RunStatus = "skipped"
)

type SourceType string

const (
	SourceFile   SourceType = "file"
	SourceInline SourceType = "inline"

	MaxInlineScriptBytes = 256 << 10
)

type Job struct {
	ID                 string        `json:"id"`
	Name               string        `json:"name"`
	Enabled            bool          `json:"enabled"`
	ScheduleType       ScheduleType  `json:"scheduleType"`
	ScheduleExpression string        `json:"scheduleExpression"`
	Timezone           string        `json:"timezone"`
	MisfirePolicy      MisfirePolicy `json:"misfirePolicy"`
	TaskType           string        `json:"taskType"`
	SourceType         SourceType    `json:"sourceType"`
	ScriptPath         string        `json:"scriptPath,omitempty"`
	HasInlineScript    bool          `json:"hasInlineScript,omitempty"`
	InlineScript       string        `json:"-"`
	CreatedAt          time.Time     `json:"createdAt"`
	UpdatedAt          time.Time     `json:"updatedAt"`
	LastRunAt          *time.Time    `json:"lastRunAt,omitempty"`
	NextRunAt          *time.Time    `json:"nextRunAt,omitempty"`
	LastRun            *JobRun       `json:"lastRun,omitempty"`
}

type JobRun struct {
	ID          string     `json:"id"`
	JobID       string     `json:"jobId"`
	ScheduledAt time.Time  `json:"scheduledAt"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
	Status      RunStatus  `json:"status"`
	Error       string     `json:"error,omitempty"`
	ExecutionID string     `json:"executionId,omitempty"`
}

type CreateJobInput struct {
	Name               string        `json:"name"`
	ScheduleType       ScheduleType  `json:"scheduleType"`
	ScheduleExpression string        `json:"scheduleExpression"`
	Timezone           string        `json:"timezone"`
	MisfirePolicy      MisfirePolicy `json:"misfirePolicy,omitempty"`
	TaskType           string        `json:"taskType,omitempty"`
	SourceType         SourceType    `json:"sourceType,omitempty"`
	ScriptPath         string        `json:"scriptPath,omitempty"`
	InlineScript       string        `json:"inlineScript,omitempty"`
}
