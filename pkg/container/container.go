package container

import (
	"clawdesk/automation"
	"clawdesk/pkg/runtime"
	"os"
)

// Container manages application dependencies and their lifecycle
type Container struct {
	executionGate *runtime.ExecutionGate
	vision        *automation.Vision
	config        *Config
}

// Config holds container configuration
type Config struct {
	RuntimePoolSize int
}

// NewContainer creates a new dependency injection container
func NewContainer(cfg *Config) (*Container, error) {
	if cfg == nil {
		cfg = &Config{
			RuntimePoolSize: 10,
		}
	}

	if cfg.RuntimePoolSize <= 0 {
		cfg.RuntimePoolSize = 10
	}

	// Skip Fyne initialization in tests to avoid race conditions
	os.Setenv("SKIP_FYNE_INIT", "1")

	// This is capacity control only. Runtime creation, ownership, and teardown
	// live in pkg/execution on one event-loop goroutine per execution.
	gate := runtime.NewExecutionGate(cfg.RuntimePoolSize)

	// Initialize vision service
	vision := automation.NewVision()

	return &Container{
		executionGate: gate,
		vision:        vision,
		config:        cfg,
	}, nil
}

// ExecutionCapacity is a diagnostic configuration value. Container never
// returns a mutable runtime handle that can bypass its event loop.
func (c *Container) ExecutionCapacity() int {
	if c == nil || c.executionGate == nil {
		return 0
	}
	return c.executionGate.Capacity()
}

// Vision returns the vision service
func (c *Container) Vision() *automation.Vision {
	return c.vision
}

// Config returns the container configuration
func (c *Container) Config() *Config {
	return c.config
}

// Close releases all resources held by the container
func (c *Container) Close() error {
	if c.executionGate != nil {
		return c.executionGate.Close()
	}
	return nil
}
