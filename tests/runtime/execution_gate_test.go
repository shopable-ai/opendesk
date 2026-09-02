package runtime_test

import (
	"context"
	"errors"
	"testing"
	"time"

	runtime "opendesk/pkg/runtime"
)

func TestExecutionGateLimitsAndReleasesCapacity(t *testing.T) {
	gate := runtime.NewExecutionGate(1)
	if err := gate.Acquire(context.Background()); err != nil {
		t.Fatal(err)
	}
	if gate.InUse() != 1 || gate.Capacity() != 1 {
		t.Fatalf("unexpected gate metrics: inUse=%d capacity=%d", gate.InUse(), gate.Capacity())
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := gate.Acquire(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Acquire error = %v, want deadline exceeded", err)
	}
	gate.Release()
	if err := gate.Acquire(context.Background()); err != nil {
		t.Fatalf("Acquire after Release: %v", err)
	}
	gate.Release()
}

func TestExecutionGateCloseRejectsNewWork(t *testing.T) {
	gate := runtime.NewExecutionGate(2)
	if err := gate.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gate.Acquire(context.Background()); !errors.Is(err, runtime.ErrPoolClosed) {
		t.Fatalf("Acquire after Close = %v, want ErrPoolClosed", err)
	}
}
