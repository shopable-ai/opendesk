package main

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
)

// executionSignalController gives direct CLI executions two-stage signal
// handling: the first signal requests normal Runtime teardown, while a second
// signal forces process exit if a native operation did not honor cancellation.
type executionSignalController struct {
	ctx         context.Context
	cancel      context.CancelFunc
	signals     <-chan os.Signal
	stopSignals func()
	forceExit   func(int)
	stopped     chan struct{}
	stopOnce    sync.Once
	canceling   atomic.Bool
}

func newDirectExecutionSignalController(parent context.Context) *executionSignalController {
	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	return newExecutionSignalController(parent, signals, func() { signal.Stop(signals) }, os.Exit)
}

// newExecutionSignalController accepts injected signal and exit functions so
// the state transition can be tested without sending signals to the test
// process or calling os.Exit.
func newExecutionSignalController(
	parent context.Context,
	signals <-chan os.Signal,
	stopSignals func(),
	forceExit func(int),
) *executionSignalController {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	controller := &executionSignalController{
		ctx:         ctx,
		cancel:      cancel,
		signals:     signals,
		stopSignals: stopSignals,
		forceExit:   forceExit,
		stopped:     make(chan struct{}),
	}
	go controller.run()
	return controller
}

func (c *executionSignalController) run() {
	select {
	case <-c.stopped:
		return
	case <-c.ctx.Done():
		// A same-script takeover can request cancellation without an OS signal.
		c.canceling.Store(true)
	case sig := <-c.signals:
		if c.canceling.Swap(true) {
			c.forceExit(executionSignalExitCode(sig))
			return
		}
		c.cancel()
	}

	// Keep explicit ownership of the signal until normal teardown calls Stop.
	// This ensures a second Ctrl-C/SIGTERM is never swallowed by a context that
	// was already canceled but whose native operation has not returned.
	select {
	case <-c.stopped:
		return
	case sig := <-c.signals:
		c.forceExit(executionSignalExitCode(sig))
	}
}

func (c *executionSignalController) Context() context.Context {
	return c.ctx
}

func (c *executionSignalController) Cancel() {
	c.canceling.Store(true)
	c.cancel()
}

func (c *executionSignalController) Stop() {
	c.stopOnce.Do(func() {
		if c.stopSignals != nil {
			c.stopSignals()
		}
		close(c.stopped)
		c.cancel()
	})
}

func executionSignalExitCode(sig os.Signal) int {
	switch sig {
	case os.Interrupt:
		return 130
	case syscall.SIGTERM:
		return 143
	default:
		return 1
	}
}
