package customui

import "context"

// NewSessionScopedDriver returns a driver view whose Close only releases the
// execution session. The owner that constructed inner remains responsible for
// closing the underlying native host after every scoped execution has stopped.
func NewSessionScopedDriver(inner Driver) Driver {
	if inner == nil {
		return nil
	}
	return sessionScopedDriver{inner: inner}
}

type sessionScopedDriver struct {
	inner Driver
}

func (d sessionScopedDriver) Capabilities(ctx context.Context) Capabilities {
	return d.inner.Capabilities(ctx)
}

func (d sessionScopedDriver) Create(ctx context.Context, sessionID string, spec WindowSpec, sink func(Event)) (DriverWindow, error) {
	return d.inner.Create(ctx, sessionID, spec, sink)
}

func (d sessionScopedDriver) CloseSession(ctx context.Context, sessionID string) error {
	return d.inner.CloseSession(ctx, sessionID)
}

func (d sessionScopedDriver) Close() error {
	return nil
}

func (d sessionScopedDriver) ResourceCounts() DriverResourceCounts {
	if reporter, ok := d.inner.(DriverResourceReporter); ok {
		return reporter.ResourceCounts()
	}
	return DriverResourceCounts{}
}
