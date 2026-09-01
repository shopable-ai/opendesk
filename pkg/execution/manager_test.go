package execution

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestManagerCancelAllAndWaitAll(t *testing.T) {
	manager := NewManager()
	manager.Register("one", nil)
	manager.Register("two", nil)
	var canceled atomic.Int64
	for _, id := range []string{"one", "two"} {
		id := id
		if !manager.SetCancel(id, func() {
			canceled.Add(1)
			go manager.Complete(ExecutionResult{ExecutionID: id}, AgentSummary{})
		}) {
			t.Fatalf("failed to register cancel for %s", id)
		}
	}
	if count := manager.CancelAll(); count != 2 {
		t.Fatalf("CancelAll count = %d, want 2", count)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := manager.WaitAll(ctx); err != nil {
		t.Fatal(err)
	}
	if canceled.Load() != 2 {
		t.Fatalf("canceled = %d, want 2", canceled.Load())
	}
}

func TestManagerBeginShutdownRejectsNewExecutions(t *testing.T) {
	manager := NewManager()
	if !manager.Register("before", nil) {
		t.Fatal("initial registration failed")
	}
	var canceled atomic.Int64
	if !manager.SetCancel("before", func() {
		canceled.Add(1)
		manager.Complete(ExecutionResult{ExecutionID: "before"}, AgentSummary{})
	}) {
		t.Fatal("set cancel failed")
	}
	if count := manager.BeginShutdown(); count != 1 {
		t.Fatalf("BeginShutdown count = %d", count)
	}
	if manager.Register("after", nil) {
		t.Fatal("registration succeeded after shutdown gate closed")
	}
	if canceled.Load() != 1 {
		t.Fatalf("cancel count = %d", canceled.Load())
	}
}
