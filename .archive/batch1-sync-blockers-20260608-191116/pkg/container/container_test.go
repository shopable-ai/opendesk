package container

import (
	"context"
	"testing"
	"time"
)

func TestNewContainer(t *testing.T) {
	cfg := &Config{
		RuntimePoolSize: 5,
	}

	container, err := NewContainer(cfg)
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer container.Close()

	if container == nil {
		t.Fatal("expected container to be created")
	}

	if container.RuntimePool() == nil {
		t.Error("expected runtime pool to be initialized")
	}

	if container.Vision() == nil {
		t.Error("expected vision service to be initialized")
	}

	if container.Config() == nil {
		t.Error("expected config to be set")
	}
}

func TestNewContainerWithNilConfig(t *testing.T) {
	container, err := NewContainer(nil)
	if err != nil {
		t.Fatalf("failed to create container with nil config: %v", err)
	}
	defer container.Close()

	if container.Config().RuntimePoolSize != 10 {
		t.Errorf("expected default pool size 10, got %d", container.Config().RuntimePoolSize)
	}
}

func TestContainerGetPutRuntime(t *testing.T) {
	container, err := NewContainer(&Config{RuntimePoolSize: 2})
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer container.Close()

	ctx := context.Background()

	// Get runtime
	rt, err := container.GetRuntime(ctx)
	if err != nil {
		t.Fatalf("failed to get runtime: %v", err)
	}
	if rt == nil {
		t.Fatal("expected runtime, got nil")
	}

	// Test that runtime is properly initialized
	val, err := rt.RunString("typeof page")
	if err != nil {
		t.Fatalf("failed to run script: %v", err)
	}
	if val.String() != "object" {
		t.Errorf("expected page to be object, got %s", val.String())
	}

	// Return runtime
	container.PutRuntime(rt)

	// Get again should work
	rt2, err := container.GetRuntime(ctx)
	if err != nil {
		t.Fatalf("failed to get runtime second time: %v", err)
	}
	if rt2 == nil {
		t.Fatal("expected runtime, got nil")
	}

	container.PutRuntime(rt2)
}

func TestContainerClose(t *testing.T) {
	container, err := NewContainer(&Config{RuntimePoolSize: 2})
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}

	err = container.Close()
	if err != nil {
		t.Errorf("failed to close container: %v", err)
	}

	// Closing again should be safe
	err = container.Close()
	if err != nil {
		t.Errorf("closing container twice should not error: %v", err)
	}
}

func TestContainerConcurrentAccess(t *testing.T) {
	container, err := NewContainer(&Config{RuntimePoolSize: 5})
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer container.Close()

	ctx := context.Background()
	done := make(chan bool)

	// Spawn multiple goroutines accessing the container
	for i := 0; i < 10; i++ {
		go func(id int) {
			rt, err := container.GetRuntime(ctx)
			if err != nil {
				t.Errorf("goroutine %d: failed to get runtime: %v", id, err)
				done <- false
				return
			}

			// Simulate work
			_, err = rt.RunString("1 + 1")
			if err != nil {
				t.Errorf("goroutine %d: failed to run script: %v", id, err)
			}

			time.Sleep(10 * time.Millisecond)
			container.PutRuntime(rt)
			done <- true
		}(i)
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}

func TestContainerVisionService(t *testing.T) {
	container, err := NewContainer(&Config{RuntimePoolSize: 2})
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer container.Close()

	vision := container.Vision()
	if vision == nil {
		t.Fatal("expected vision service to be available")
	}
}
