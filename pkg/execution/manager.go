package execution

import (
	"context"
	"sync"
)

// Record 保存单次执行的运行态信息。
type Record struct {
	Emitter *Emitter
	Result  ExecutionResult
	Summary AgentSummary
	Cancel  func()
	Done    chan struct{}
}

// Manager 管理多执行实例。
type Manager struct {
	mu          sync.RWMutex
	executions  map[string]*Record
	lastCreated string
	closing     bool
}

// NewManager 创建执行管理器。
func NewManager() *Manager {
	return &Manager{executions: map[string]*Record{}}
}

// Register 注册执行实例。
func (m *Manager) Register(executionID string, emitter *Emitter) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closing {
		return false
	}
	m.executions[executionID] = &Record{Emitter: emitter, Done: make(chan struct{})}
	m.lastCreated = executionID
	return true
}

// SetCancel associates a transport-level cancellation function with an
// in-flight execution. The function is invoked outside the manager lock.
func (m *Manager) SetCancel(executionID string, cancel func()) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.executions[executionID]
	if !ok {
		return false
	}
	record.Cancel = cancel
	return true
}

// Cancel requests teardown of an execution and returns whether it was still
// cancellable. Completion remains asynchronous and is observed through the
// normal status, summary, event, and artifact surfaces.
func (m *Manager) Cancel(executionID string) bool {
	m.mu.RLock()
	record, ok := m.executions[executionID]
	var cancel func()
	if ok {
		cancel = record.Cancel
	}
	m.mu.RUnlock()
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

// UpdateResult 更新执行结果快照。
func (m *Manager) UpdateResult(result ExecutionResult) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.executions[result.ExecutionID]
	if !ok {
		record = &Record{}
		m.executions[result.ExecutionID] = record
	}
	record.Result = result
	m.lastCreated = result.ExecutionID
}

// Complete 写入最终结果与摘要。
func (m *Manager) Complete(result ExecutionResult, summary AgentSummary) {
	m.mu.Lock()
	defer m.mu.Unlock()
	record, ok := m.executions[result.ExecutionID]
	if !ok {
		record = &Record{}
		m.executions[result.ExecutionID] = record
	}
	record.Result = result
	record.Summary = summary
	record.Cancel = nil
	if record.Done != nil {
		select {
		case <-record.Done:
		default:
			close(record.Done)
		}
	}
	m.lastCreated = result.ExecutionID
}

// CancelAll requests teardown for every in-flight execution without holding
// the manager lock while calling transport cancellation functions.
func (m *Manager) CancelAll() int {
	m.mu.RLock()
	cancels := make([]func(), 0, len(m.executions))
	for _, record := range m.executions {
		if record != nil && record.Cancel != nil {
			cancels = append(cancels, record.Cancel)
		}
	}
	m.mu.RUnlock()
	for _, cancel := range cancels {
		cancel()
	}
	return len(cancels)
}

// BeginShutdown closes registration before canceling the current snapshot.
func (m *Manager) BeginShutdown() int {
	m.mu.Lock()
	m.closing = true
	cancels := make([]func(), 0, len(m.executions))
	for _, record := range m.executions {
		if record != nil && record.Cancel != nil {
			cancels = append(cancels, record.Cancel)
		}
	}
	m.mu.Unlock()
	for _, cancel := range cancels {
		cancel()
	}
	return len(cancels)
}

// WaitAll waits for the executions that were in flight at call time to finish
// their complete Runtime lifecycle, including custom UI host cleanup.
func (m *Manager) WaitAll(ctx context.Context) error {
	m.mu.RLock()
	done := make([]<-chan struct{}, 0, len(m.executions))
	for _, record := range m.executions {
		if record != nil && record.Cancel != nil && record.Done != nil {
			done = append(done, record.Done)
		}
	}
	m.mu.RUnlock()
	for _, channel := range done {
		select {
		case <-channel:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

// Get 获取执行记录。
func (m *Manager) Get(executionID string) (*Record, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	record, ok := m.executions[executionID]
	if !ok || record == nil {
		return nil, false
	}
	snapshot := *record
	return &snapshot, true
}

// Latest 返回最近一次执行记录。
func (m *Manager) Latest() (*Record, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.lastCreated == "" {
		return nil, false
	}
	record, ok := m.executions[m.lastCreated]
	if !ok || record == nil {
		return nil, false
	}
	snapshot := *record
	return &snapshot, true
}
