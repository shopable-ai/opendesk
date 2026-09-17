package main

import (
	"context"
	"sort"
	"sync"
	"time"

	"opendesk/pkg/appshell"
	pkgExecution "opendesk/pkg/execution"
	pkgScheduler "opendesk/pkg/scheduler"
)

const appProductActivityBarrierTimeout = 750 * time.Millisecond

// appProductActivityCoordinator is process-owned product lifecycle state. It
// does not know about promotions or JavaScript. Native desktop features ask for
// a short pre-start barrier, publish their active lifetime, and keep executing
// even if the UI owner cannot acknowledge the barrier in time.
type appProductActivityCoordinator struct {
	mu      sync.Mutex
	version uint64
	pending map[uint64]chan struct{}
	active  map[string]int
}

type appProductActivitySnapshot struct {
	Version     uint64   `json:"version"`
	Pending     int      `json:"pending"`
	Active      bool     `json:"active"`
	ActiveKinds []string `json:"activeKinds"`
}

func newAppProductActivityCoordinator() *appProductActivityCoordinator {
	return &appProductActivityCoordinator{
		pending: make(map[uint64]chan struct{}),
		active:  make(map[string]int),
	}
}

func (c *appProductActivityCoordinator) request() (uint64, <-chan struct{}) {
	if c == nil {
		closed := make(chan struct{})
		close(closed)
		return 0, closed
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.version++
	version := c.version
	ready := make(chan struct{})
	c.pending[version] = ready
	return version, ready
}

func (c *appProductActivityCoordinator) cancelRequest(version uint64) {
	if c == nil || version == 0 {
		return
	}
	c.mu.Lock()
	delete(c.pending, version)
	c.mu.Unlock()
}

func (c *appProductActivityCoordinator) acknowledgePending() int {
	if c == nil {
		return 0
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	count := len(c.pending)
	for version, ready := range c.pending {
		close(ready)
		delete(c.pending, version)
	}
	return count
}

func (c *appProductActivityCoordinator) begin(kind string) func() {
	if c == nil || kind == "" {
		return func() {}
	}
	c.mu.Lock()
	c.version++
	c.active[kind]++
	c.mu.Unlock()
	var once sync.Once
	return func() {
		once.Do(func() {
			c.mu.Lock()
			c.version++
			if c.active[kind] <= 1 {
				delete(c.active, kind)
			} else {
				c.active[kind]--
			}
			c.mu.Unlock()
		})
	}
}

func (c *appProductActivityCoordinator) snapshot() appProductActivitySnapshot {
	if c == nil {
		return appProductActivitySnapshot{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	kinds := make([]string, 0, len(c.active))
	for kind, count := range c.active {
		if count > 0 {
			kinds = append(kinds, kind)
		}
	}
	sort.Strings(kinds)
	return appProductActivitySnapshot{
		Version:     c.version,
		Pending:     len(c.pending),
		Active:      len(kinds) != 0,
		ActiveKinds: kinds,
	}
}

// waitBeforeProductDesktopActivity asks the long-lived App JavaScript owner to
// remove passive product surfaces before a native desktop feature starts. The
// barrier is deliberately bounded: promotion/UI failure must never prevent a
// Recorder, Measurement, Scheduler, or other real business task from running.
func waitBeforeProductDesktopActivity(ctx context.Context, shell *appshell.Shell, activity *appProductActivityCoordinator, kind, source string) bool {
	if activity == nil || shell == nil {
		return true
	}
	version, ready := activity.request()
	if err := shell.DispatchAction("opendesk.activity.suspend", source); err != nil {
		activity.cancelRequest(version)
		return false
	}
	if ctx == nil {
		ctx = context.Background()
	}
	timer := time.NewTimer(appProductActivityBarrierTimeout)
	defer timer.Stop()
	select {
	case <-ready:
		return true
	case <-ctx.Done():
		activity.cancelRequest(version)
		return false
	case <-timer.C:
		activity.cancelRequest(version)
		return false
	}
}

// appActivitySchedulerExecutor keeps scheduled JavaScript runs in the same
// product activity model without teaching pkg/scheduler anything about UI.
type appActivitySchedulerExecutor struct {
	inner    pkgScheduler.Executor
	activity *appProductActivityCoordinator
	shell    *appshell.Shell
}

func (e *appActivitySchedulerExecutor) Execute(ctx context.Context, job pkgScheduler.Job) (pkgExecution.ExecutionResult, error) {
	if e == nil || e.inner == nil {
		return pkgExecution.ExecutionResult{}, context.Canceled
	}
	waitBeforeProductDesktopActivity(ctx, e.shell, e.activity, "scheduler", "scheduler")
	finish := e.activity.begin("scheduler")
	defer finish()
	return e.inner.Execute(ctx, job)
}
