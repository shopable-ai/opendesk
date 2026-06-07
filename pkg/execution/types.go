package execution

import (
	"fmt"
	"strings"
	"time"
)

// EventCategory 表示结构化日志分类。
type EventCategory string

const (
	EventCategoryFramework EventCategory = "framework"
	EventCategoryMeta      EventCategory = "meta"
	EventCategoryScript    EventCategory = "script"
	EventCategorySummary   EventCategory = "summary"
	EventCategoryError     EventCategory = "error"
)

// EventLevel 表示日志级别。
type EventLevel string

const (
	EventLevelDebug EventLevel = "debug"
	EventLevelInfo  EventLevel = "info"
	EventLevelWarn  EventLevel = "warn"
	EventLevelError EventLevel = "error"
)

// EventSource 表示日志来源。
type EventSource string

const (
	EventSourceConsole EventSource = "console"
	EventSourceRuntime EventSource = "runtime"
	EventSourceSystem  EventSource = "system"
	EventSourceHTTP    EventSource = "http"
)

// ExecutionStatus 表示执行状态。
type ExecutionStatus string

const (
	ExecutionStatusPending   ExecutionStatus = "pending"
	ExecutionStatusRunning   ExecutionStatus = "running"
	ExecutionStatusSucceeded ExecutionStatus = "succeeded"
	ExecutionStatusFailed    ExecutionStatus = "failed"
	ExecutionStatusTimedOut  ExecutionStatus = "timed_out"
	ExecutionStatusCanceled  ExecutionStatus = "canceled"
)

// RunEvent 是单条结构化日志事件。
type RunEvent struct {
	SchemaVersion string         `json:"schemaVersion"`
	EventID       string         `json:"eventId,omitempty"`
	ExecutionID   string         `json:"executionId"`
	Sequence      int64          `json:"sequence"`
	Timestamp     string         `json:"timestamp"`
	Category      EventCategory  `json:"category"`
	Level         EventLevel     `json:"level"`
	Source        EventSource    `json:"source"`
	Kind          string         `json:"kind"`
	Message       string         `json:"message"`
	Fields        map[string]any `json:"fields,omitempty"`
}

// ExecutionArtifacts 记录本次执行的产物路径。
type ExecutionArtifacts struct {
	ExecutionID       string `json:"executionId,omitempty"`
	RunDir            string `json:"runDir,omitempty"`
	StdoutPath        string `json:"stdoutPath,omitempty"`
	StderrPath        string `json:"stderrPath,omitempty"`
	ScriptSnapshotPath string `json:"scriptSnapshotPath,omitempty"`
	SummaryPath       string `json:"summaryPath,omitempty"`
	AgentSummaryPath  string `json:"agentSummaryPath,omitempty"`
	EventLogPath      string `json:"eventLogPath,omitempty"`
}

// ExecutionResult 是执行状态快照。
type ExecutionResult struct {
	ExecutionID string            `json:"executionId"`
	Source      string            `json:"source,omitempty"`
	Ext         string            `json:"ext,omitempty"`
	ScriptHash  string            `json:"scriptHash,omitempty"`
	Status      ExecutionStatus   `json:"status"`
	StartedAt   string            `json:"startedAt,omitempty"`
	FinishedAt  string            `json:"finishedAt,omitempty"`
	DurationMs  int64             `json:"durationMs,omitempty"`
	Error       string            `json:"error,omitempty"`
	Artifacts   ExecutionArtifacts `json:"artifacts,omitempty"`
	Counters    map[string]int64  `json:"counters,omitempty"`
}

// AgentLogItem 是给 Agent 的脚本日志条目。
type AgentLogItem struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

// AgentErrorItem 是给 Agent 的错误条目。
type AgentErrorItem struct {
	Timestamp string `json:"timestamp"`
	Message   string `json:"message"`
}

// AgentSummary 是给 Agent 的最小摘要。
type AgentSummary struct {
	SchemaVersion string             `json:"schemaVersion"`
	ExecutionID   string             `json:"executionId"`
	Status        string             `json:"status"`
	StartedAt     string             `json:"startedAt,omitempty"`
	FinishedAt    string             `json:"finishedAt,omitempty"`
	DurationMs    int64              `json:"durationMs,omitempty"`
	Source        string             `json:"source,omitempty"`
	ScriptHash    string             `json:"scriptHash,omitempty"`
	ScriptLogs    []AgentLogItem     `json:"scriptLogs,omitempty"`
	Errors        []AgentErrorItem   `json:"errors,omitempty"`
	Artifacts     ExecutionArtifacts `json:"artifacts,omitempty"`
	Meta          map[string]any     `json:"meta,omitempty"`
}

// NewExecutionID 生成执行实例 ID。
func NewExecutionID(prefix string) string {
	cleanPrefix := strings.TrimSpace(prefix)
	if cleanPrefix == "" {
		cleanPrefix = "exec"
	}
	stamp := time.Now().Format("20060102-150405")
	return fmt.Sprintf("%s-%s-%06d", cleanPrefix, stamp, time.Now().Nanosecond()%1000000)
}
