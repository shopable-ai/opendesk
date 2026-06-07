package execution

import (
	"sync"
)

// Record 保存单次执行的运行态信息。
type Record struct {
	Emitter *Emitter
	Result  ExecutionResult
	Summary AgentSummary
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
	m.lastCreated = result.ExecutionID
}

// Get 获取执行记录。
func (m *Manager) Get(executionID string) (*Record, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	record, ok := m.executions[executionID]
	return record, ok
}

// Latest 返回最近一次执行记录。
func (m *Manager) Latest() (*Record, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.lastCreated == "" {
		return nil, false
	}
	record, ok := m.executions[m.lastCreated]
	return record, ok
}
