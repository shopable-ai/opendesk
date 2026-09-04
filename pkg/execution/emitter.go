package execution

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"
)

const schemaVersion = "0.1.0"

// TerminalSelection 控制终端回显类别。
type TerminalSelection struct {
	Mode         string
	Categories   map[string]bool
	IncludeDebug bool
}

// Emitter 管理事件落盘、摘要聚合与订阅广播。
type Emitter struct {
	mu          sync.Mutex
	executionID string
	selection   TerminalSelection
	artifacts   ExecutionArtifacts
	stdoutFile  *os.File
	stderrFile  *os.File
	eventsFile  *os.File
	sequence    int64
	startedAt   time.Time
	summary     AgentSummary
	status      ExecutionStatus
	counters    map[string]int64
	subscribers map[int]chan RunEvent
	nextSubID   int
}

// NewEmitter 创建执行事件发射器。
func NewEmitter(executionID string, selection TerminalSelection, artifacts ExecutionArtifacts, startedAt time.Time) (*Emitter, error) {
	emitter := &Emitter{
		executionID: executionID,
		selection:   selection,
		artifacts:   artifacts,
		startedAt:   startedAt,
		status:      ExecutionStatusPending,
		counters: map[string]int64{
			"totalEvents": 0,
			"scriptLogs":  0,
			"errorLogs":   0,
		},
		subscribers: make(map[int]chan RunEvent),
		summary: AgentSummary{
			SchemaVersion: schemaVersion,
			ExecutionID:   executionID,
			Status:        string(ExecutionStatusPending),
			StartedAt:     startedAt.Format(time.RFC3339),
			Artifacts:     artifacts,
			Meta:          map[string]any{},
		},
	}

	var err error
	if artifacts.StdoutPath != "" {
		emitter.stdoutFile, err = os.Create(artifacts.StdoutPath)
		if err != nil {
			return nil, fmt.Errorf("create stdout log: %w", err)
		}
	}
	if artifacts.StderrPath != "" {
		emitter.stderrFile, err = os.Create(artifacts.StderrPath)
		if err != nil {
			emitter.closeFiles()
			return nil, fmt.Errorf("create stderr log: %w", err)
		}
	}
	if artifacts.EventLogPath != "" {
		emitter.eventsFile, err = os.Create(artifacts.EventLogPath)
		if err != nil {
			emitter.closeFiles()
			return nil, fmt.Errorf("create event log: %w", err)
		}
	}
	return emitter, nil
}

// SetMeta 设置摘要元信息。
func (e *Emitter) SetMeta(key string, value any) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.summary.Meta == nil {
		e.summary.Meta = map[string]any{}
	}
	e.summary.Meta[key] = value
}

// SetSource 设置摘要来源信息。
func (e *Emitter) SetSource(source, scriptHash string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.summary.Source = source
	e.summary.ScriptHash = scriptHash
}

// SetStatus 更新执行状态。
func (e *Emitter) SetStatus(status ExecutionStatus) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.status = status
	e.summary.Status = string(status)
}

// Emit 写出一条结构化事件。
func (e *Emitter) Emit(category EventCategory, level EventLevel, source EventSource, kind, message string, fields map[string]any) RunEvent {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.sequence++
	e.counters["totalEvents"]++
	if category == EventCategoryScript {
		e.counters["scriptLogs"]++
		e.summary.ScriptLogs = append(e.summary.ScriptLogs, AgentLogItem{
			Timestamp: time.Now().Format(time.RFC3339),
			Level:     string(level),
			Message:   message,
		})
	}
	if category == EventCategoryError {
		e.counters["errorLogs"]++
		e.summary.Errors = append(e.summary.Errors, AgentErrorItem{
			Timestamp: time.Now().Format(time.RFC3339),
			Message:   message,
		})
	}

	event := RunEvent{
		SchemaVersion: schemaVersion,
		EventID:       fmt.Sprintf("%s-%06d", e.executionID, e.sequence),
		ExecutionID:   e.executionID,
		Sequence:      e.sequence,
		Timestamp:     time.Now().Format(time.RFC3339),
		Category:      category,
		Level:         level,
		Source:        source,
		Kind:          kind,
		Message:       message,
		Fields:        fields,
	}

	e.writeEventLocked(event)
	e.writeRawLocked(event)
	e.echoLocked(event)
	e.broadcastLocked(event)
	return event
}

// Result 生成当前执行快照。
func (e *Emitter) Result() ExecutionResult {
	e.mu.Lock()
	defer e.mu.Unlock()

	result := ExecutionResult{
		ExecutionID: e.executionID,
		Source:      e.summary.Source,
		ScriptHash:  e.summary.ScriptHash,
		Status:      e.status,
		StartedAt:   e.summary.StartedAt,
		FinishedAt:  e.summary.FinishedAt,
		DurationMs:  e.summary.DurationMs,
		Artifacts:   e.artifacts,
		Counters:    copyCounters(e.counters),
	}
	if len(e.summary.Errors) > 0 {
		result.Error = e.summary.Errors[len(e.summary.Errors)-1].Message
	}
	return result
}

// Summary 生成当前 Agent 摘要快照。
func (e *Emitter) Summary() AgentSummary {
	e.mu.Lock()
	defer e.mu.Unlock()

	snapshot := e.summary
	if len(e.summary.ScriptLogs) > 0 {
		snapshot.ScriptLogs = append([]AgentLogItem(nil), e.summary.ScriptLogs...)
	}
	if len(e.summary.Errors) > 0 {
		snapshot.Errors = append([]AgentErrorItem(nil), e.summary.Errors...)
	}
	if len(e.summary.Meta) > 0 {
		metaCopy := make(map[string]any, len(e.summary.Meta))
		for k, v := range e.summary.Meta {
			metaCopy[k] = v
		}
		snapshot.Meta = metaCopy
	}
	return snapshot
}

// Finalize 结束执行并写出摘要文件。
func (e *Emitter) Finalize(status ExecutionStatus, execErr error) (ExecutionResult, AgentSummary, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.status = status
	e.summary.Status = string(status)
	e.summary.FinishedAt = time.Now().Format(time.RFC3339)
	e.summary.DurationMs = time.Since(e.startedAt).Milliseconds()
	if execErr != nil {
		e.summary.Errors = append(e.summary.Errors, AgentErrorItem{
			Timestamp: time.Now().Format(time.RFC3339),
			Message:   execErr.Error(),
		})
	}

	if e.artifacts.AgentSummaryPath != "" {
		if err := writeJSONFile(e.artifacts.AgentSummaryPath, e.summary); err != nil {
			return ExecutionResult{}, AgentSummary{}, err
		}
	}

	result := ExecutionResult{
		ExecutionID: e.executionID,
		Source:      e.summary.Source,
		ScriptHash:  e.summary.ScriptHash,
		Status:      e.status,
		StartedAt:   e.summary.StartedAt,
		FinishedAt:  e.summary.FinishedAt,
		DurationMs:  e.summary.DurationMs,
		Artifacts:   e.artifacts,
		Counters:    copyCounters(e.counters),
	}
	if execErr != nil {
		result.Error = execErr.Error()
	}

	doneEvent := RunEvent{
		SchemaVersion: schemaVersion,
		EventID:       fmt.Sprintf("%s-done", e.executionID),
		ExecutionID:   e.executionID,
		Sequence:      e.sequence + 1,
		Timestamp:     time.Now().Format(time.RFC3339),
		Category:      EventCategorySummary,
		Level:         EventLevelInfo,
		Source:        EventSourceSystem,
		Kind:          "done",
		Message:       string(status),
		Fields: map[string]any{
			"durationMs": e.summary.DurationMs,
		},
	}
	e.writeEventLocked(doneEvent)
	e.broadcastLocked(doneEvent)

	return result, e.summary, nil
}

// Subscribe 订阅执行事件。
func (e *Emitter) Subscribe(buffer int) (int, <-chan RunEvent) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if buffer <= 0 {
		buffer = 32
	}
	id := e.nextSubID
	e.nextSubID++
	ch := make(chan RunEvent, buffer)
	e.subscribers[id] = ch
	return id, ch
}

// Unsubscribe 取消订阅执行事件。
func (e *Emitter) Unsubscribe(id int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if ch, ok := e.subscribers[id]; ok {
		close(ch)
		delete(e.subscribers, id)
	}
}

// Close 关闭发射器资源。
func (e *Emitter) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	for id, ch := range e.subscribers {
		close(ch)
		delete(e.subscribers, id)
	}
	return e.closeFiles()
}

func (e *Emitter) writeEventLocked(event RunEvent) {
	if e.eventsFile == nil {
		return
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return
	}
	writer := bufio.NewWriter(e.eventsFile)
	_, _ = writer.Write(payload)
	_ = writer.WriteByte('\n')
	_ = writer.Flush()
}

func (e *Emitter) writeRawLocked(event RunEvent) {
	line := event.Message
	if event.Fields != nil && len(event.Fields) > 0 {
		if payload, err := json.Marshal(event.Fields); err == nil {
			line = fmt.Sprintf("%s %s", line, string(payload))
		}
	}
	line += "\n"

	if event.Category == EventCategoryError {
		if e.stderrFile != nil {
			_, _ = e.stderrFile.WriteString(line)
		}
		return
	}
	if e.stdoutFile != nil {
		_, _ = e.stdoutFile.WriteString(line)
	}
}

func (e *Emitter) echoLocked(event RunEvent) {
	if !e.selection.Categories[string(event.Category)] {
		return
	}
	if event.Level == EventLevelDebug && !e.selection.IncludeDebug {
		return
	}
	line := formatTerminalEvent(event)
	if event.Category == EventCategoryError {
		_, _ = os.Stderr.WriteString(line + "\n")
		return
	}
	_, _ = os.Stdout.WriteString(line + "\n")
}

func (e *Emitter) broadcastLocked(event RunEvent) {
	for id, ch := range e.subscribers {
		select {
		case ch <- event:
		default:
			close(ch)
			delete(e.subscribers, id)
		}
	}
}

func (e *Emitter) closeFiles() error {
	if e.stdoutFile != nil {
		if err := e.stdoutFile.Close(); err != nil {
			return err
		}
		e.stdoutFile = nil
	}
	if e.stderrFile != nil {
		if err := e.stderrFile.Close(); err != nil {
			return err
		}
		e.stderrFile = nil
	}
	if e.eventsFile != nil {
		if err := e.eventsFile.Close(); err != nil {
			return err
		}
		e.eventsFile = nil
	}
	return nil
}

func copyCounters(src map[string]int64) map[string]int64 {
	out := make(map[string]int64, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

func writeJSONFile(path string, payload any) error {
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal %s: %w", path, err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func formatTerminalEvent(event RunEvent) string {
	prefix := strings.ToUpper(string(event.Category))
	return fmt.Sprintf("[%s] %s", prefix, event.Message)
}
