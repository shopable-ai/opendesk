package container_test

import (
	"testing"

	. "opendesk/pkg/container"
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

	if container.ExecutionCapacity() != 5 {
		t.Errorf("expected execution capacity 5, got %d", container.ExecutionCapacity())
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

func TestContainerDoesNotExposeRuntimeBorrowing(t *testing.T) {
	container, err := NewContainer(&Config{RuntimePoolSize: 2})
	if err != nil {
		t.Fatalf("failed to create container: %v", err)
	}
	defer container.Close()

	if got := container.ExecutionCapacity(); got != 2 {
		t.Fatalf("ExecutionCapacity = %d, want 2", got)
	}
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
