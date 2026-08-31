// Package runtime contains execution-capacity primitives. It deliberately does
// not own, pool, or return JavaScript runtime values: a runtime is mutable
// and is owned for its whole lifetime by one event-loop goroutine.
package runtime

import (
	"context"
	"sync"
)

// ExecutionGate limits concurrent executions without lending a mutable
// JavaScript runtime to the caller. A caller that acquired the gate must call
// Release exactly once.
type ExecutionGate struct {
	permits chan struct{}
	closed  chan struct{}
	once    sync.Once
}

// NewExecutionGate creates a bounded, cancellation-aware concurrency gate.
func NewExecutionGate(size int) *ExecutionGate {
	if size <= 0 {
		size = 10
	}
	return &ExecutionGate{
		permits: make(chan struct{}, size),
		closed:  make(chan struct{}),
	}
}

// Acquire reserves one execution slot. It never exposes a runtime object.
func (g *ExecutionGate) Acquire(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-g.closed:
		return ErrPoolClosed
	default:
	}
	select {
	case g.permits <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-g.closed:
		return ErrPoolClosed
	}
}

// Release returns an execution slot. Extra releases are ignored so deferred
// cleanup remains safe when admission failed before a slot was acquired.
func (g *ExecutionGate) Release() {
	select {
	case <-g.permits:
	default:
	}
}

// Close rejects new acquisitions. Existing executions remain responsible for
// their own contexts and teardown.
func (g *ExecutionGate) Close() error {
	g.once.Do(func() { close(g.closed) })
	return nil
}

// Capacity is the configured maximum number of concurrent executions.
func (g *ExecutionGate) Capacity() int {
	return cap(g.permits)
}

// InUse is a diagnostic metric only; it is not an ownership handle.
func (g *ExecutionGate) InUse() int {
	return len(g.permits)
}
