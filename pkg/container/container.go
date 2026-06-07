package container

import (
	"context"
	"fmt"
	"os"
	"clawdesk/automation"
	"clawdesk/pkg/runtime"

	"github.com/dop251/goja"
)

// Container manages application dependencies and their lifecycle
type Container struct {
	runtimePool *runtime.RuntimePool
	vision      *automation.Vision
	config      *Config
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

	// Initialize runtime pool with factory
	pool := runtime.NewRuntimePool(cfg.RuntimePoolSize, func() *goja.Runtime {
		rt := goja.New()
		if err := automation.InitJS(rt); err != nil {
			panic(fmt.Sprintf("failed to initialize JS runtime: %v", err))
		}

		// Initialize axios
		axios := automation.NewAxios(rt)
		axios.RegisterInRuntime()

		return rt
	})

	// Initialize vision service
	vision := automation.NewVision()

	return &Container{
		runtimePool: pool,
		vision:      vision,
		config:      cfg,
	}, nil
}

// RuntimePool returns the runtime pool
func (c *Container) RuntimePool() *runtime.RuntimePool {
	return c.runtimePool
}

// Vision returns the vision service
func (c *Container) Vision() *automation.Vision {
	return c.vision
}

// Config returns the container configuration
func (c *Container) Config() *Config {
	return c.config
}

// GetRuntime is a convenience method to get a runtime from the pool
func (c *Container) GetRuntime(ctx context.Context) (*goja.Runtime, error) {
	return c.runtimePool.Get(ctx)
}

// PutRuntime is a convenience method to return a runtime to the pool
func (c *Container) PutRuntime(rt *goja.Runtime) {
	c.runtimePool.Put(rt)
}

// Close releases all resources held by the container
func (c *Container) Close() error {
	if c.runtimePool != nil {
		return c.runtimePool.Close()
	}
	return nil
}
