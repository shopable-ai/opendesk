package runtime

import (
	"context"
	"sync"
	"time"

	"github.com/dop251/goja"
)

// RuntimePool manages a pool of goja.Runtime instances for concurrent script execution
type RuntimePool struct {
	pool        chan *goja.Runtime
	factory     func() *goja.Runtime
	mu          sync.Mutex
	closed      bool
	maxIdleTime time.Duration
	lastUsed    map[*goja.Runtime]time.Time
	stopCleanup chan struct{}
}

// NewRuntimePool creates a new runtime pool with the specified size and factory function
func NewRuntimePool(size int, factory func() *goja.Runtime) *RuntimePool {
	if size <= 0 {
		size = 10 // default pool size
	}

	p := &RuntimePool{
		pool:        make(chan *goja.Runtime, size),
		factory:     factory,
		maxIdleTime: 10 * time.Minute,
		lastUsed:    make(map[*goja.Runtime]time.Time),
		stopCleanup: make(chan struct{}),
	}

	// Pre-create runtime instances
	for i := 0; i < size; i++ {
		rt := factory()
		p.pool <- rt
		p.lastUsed[rt] = time.Now()
	}

	// Start cleanup goroutine
	go p.cleanup()

	return p
}

// Get retrieves a runtime from the pool or creates a new one if pool is empty
func (p *RuntimePool) Get(ctx context.Context) (*goja.Runtime, error) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil, ErrPoolClosed
	}
	p.mu.Unlock()

	select {
	case rt := <-p.pool:
		p.mu.Lock()
		p.lastUsed[rt] = time.Now()
		p.mu.Unlock()
		return rt, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
		// Pool is empty, create new runtime
		rt := p.factory()
		p.mu.Lock()
		p.lastUsed[rt] = time.Now()
		p.mu.Unlock()
		return rt, nil
	}
}

// Put returns a runtime to the pool
func (p *RuntimePool) Put(rt *goja.Runtime) {
	if rt == nil {
		return
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return
	}

	p.lastUsed[rt] = time.Now()

	select {
	case p.pool <- rt:
		// Successfully returned to pool
	default:
		// Pool is full, discard the runtime
		delete(p.lastUsed, rt)
	}
}

// Close shuts down the pool and releases all resources
func (p *RuntimePool) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return nil
	}

	p.closed = true
	close(p.stopCleanup)
	close(p.pool)

	// Clear tracking map
	p.lastUsed = make(map[*goja.Runtime]time.Time)

	return nil
}

// cleanup periodically removes idle runtimes from the pool
func (p *RuntimePool) cleanup() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.mu.Lock()
			now := time.Now()
			for rt, lastUsed := range p.lastUsed {
				if now.Sub(lastUsed) > p.maxIdleTime {
					// Remove from tracking
					delete(p.lastUsed, rt)
					// Try to drain from pool and replace with fresh runtime
					select {
					case old := <-p.pool:
						if old == rt {
							p.pool <- p.factory()
						} else {
							p.pool <- old
						}
					default:
					}
				}
			}
			p.mu.Unlock()
		case <-p.stopCleanup:
			return
		}
	}
}

// Size returns the current number of runtimes in the pool
func (p *RuntimePool) Size() int {
	return len(p.pool)
}
