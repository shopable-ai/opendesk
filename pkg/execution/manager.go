package execution

import "sync"

// Record 保存单次执行的运行态信息。
type Record struct {
	Emitter *Emitter
	Result  ExecutionResult
	Summary AgentSummary
	Cancel  func()
}

// Manager 管理多执行实例。
type Manager struct {
	mu          sync.RWMutex
	executions  map[string]*Record
	lastCreated string
}

// NewManager 创建执行管理器。
func NewManager() *Manager {
	return &Manager{executions: map[string]*Record{}}
}

// Register 注册执行实例。
func (m *Manager) Register(executionID string, emitter *Emitter) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.executions[executionID] = &Record{Emitter: emitter}
	m.lastCreated = executionID
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
	m.lastCreated = result.ExecutionID
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
