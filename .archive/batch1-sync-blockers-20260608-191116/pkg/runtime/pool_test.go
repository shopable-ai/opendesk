package runtime

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
)

func TestNewRuntimePool(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(5, factory)
	defer pool.Close()

	if pool == nil {
		t.Fatal("expected pool to be created")
	}

	if pool.Size() != 5 {
		t.Errorf("expected pool size 5, got %d", pool.Size())
	}
}

func TestRuntimePoolGetPut(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(2, factory)
	defer pool.Close()

	ctx := context.Background()

	// Get runtime from pool
	rt1, err := pool.Get(ctx)
	if err != nil {
		t.Fatalf("failed to get runtime: %v", err)
	}
	if rt1 == nil {
		t.Fatal("expected runtime, got nil")
	}

	// Return runtime to pool
	pool.Put(rt1)

	// Get again should work
	rt2, err := pool.Get(ctx)
	if err != nil {
		t.Fatalf("failed to get runtime: %v", err)
	}
	if rt2 == nil {
		t.Fatal("expected runtime, got nil")
	}

	pool.Put(rt2)
}

func TestRuntimePoolConcurrency(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(5, factory)
	defer pool.Close()

	var wg sync.WaitGroup
	concurrency := 20

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()

			ctx := context.Background()
			rt, err := pool.Get(ctx)
			if err != nil {
				t.Errorf("goroutine %d: failed to get runtime: %v", id, err)
				return
			}

			// Simulate work
			_, err = rt.RunString("1 + 1")
			if err != nil {
				t.Errorf("goroutine %d: failed to run script: %v", id, err)
			}

			time.Sleep(10 * time.Millisecond)
			pool.Put(rt)
		}(i)
	}

	wg.Wait()
}

func TestRuntimePoolContextCancellation(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(1, factory)
	defer pool.Close()

	ctx := context.Background()

	// Get the only runtime from pool
	rt, err := pool.Get(ctx)
	if err != nil {
		t.Fatalf("failed to get runtime: %v", err)
	}

	// Now pool is empty, create a cancelled context
	cancelledCtx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	// Try to get from empty pool with cancelled context
	_, err = pool.Get(cancelledCtx)
	if err != context.Canceled {
		t.Errorf("expected context.Canceled, got %v", err)
	}

	// Return the runtime
	pool.Put(rt)
}

func TestRuntimePoolClose(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(2, factory)

	// Close the pool
	err := pool.Close()
	if err != nil {
		t.Fatalf("failed to close pool: %v", err)
	}

	// Attempting to get from closed pool should fail
	ctx := context.Background()
	_, err = pool.Get(ctx)
	if err != ErrPoolClosed {
		t.Errorf("expected ErrPoolClosed, got %v", err)
	}

	// Closing again should be safe
	err = pool.Close()
	if err != nil {
		t.Errorf("closing pool twice should not error: %v", err)
	}
}

func TestRuntimePoolPutNil(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(2, factory)
	defer pool.Close()

	// Putting nil should not panic
	pool.Put(nil)
}

func TestRuntimePoolOverflow(t *testing.T) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(2, factory)
	defer pool.Close()

	ctx := context.Background()

	// Get all runtimes from pool
	rt1, _ := pool.Get(ctx)
	rt2, _ := pool.Get(ctx)
	rt3, _ := pool.Get(ctx) // This creates a new one

	// Return all three (pool size is 2, so one will be discarded)
	pool.Put(rt1)
	pool.Put(rt2)
	pool.Put(rt3)

	// Pool should have at most 2 runtimes
	size := pool.Size()
	if size > 2 {
		t.Errorf("expected pool size <= 2, got %d", size)
	}
}

func BenchmarkRuntimePoolGetPut(b *testing.B) {
	factory := func() *goja.Runtime {
		return goja.New()
	}

	pool := NewRuntimePool(10, factory)
	defer pool.Close()

	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rt, _ := pool.Get(ctx)
		rt.RunString("1 + 1")
		pool.Put(rt)
	}
}

func BenchmarkRuntimeDirect(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rt := goja.New()
		rt.RunString("1 + 1")
	}
}
