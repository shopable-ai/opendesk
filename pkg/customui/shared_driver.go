package customui

import "context"

// NewSessionScopedDriver returns a driver view whose Close only releases the
// execution session. The owner that constructed inner remains responsible for
// closing the underlying native host after every scoped execution has stopped.
// Callers that share a driver between executions should prefer
// NewSessionScopedDriverForSession so resource accounting remains isolated.
func NewSessionScopedDriver(inner Driver) Driver {
	return NewSessionScopedDriverForSession(inner, "")
}

// NewSessionScopedDriverForSession returns a session-scoped view with resource
// accounting keyed to sessionID. The underlying driver is still shared and its
// host lifecycle remains owned by the creator.
func NewSessionScopedDriverForSession(inner Driver, sessionID string) Driver {
	if inner == nil {
		return nil
	}
	return sessionScopedDriver{inner: inner, sessionID: sessionID}
}

type sessionScopedDriver struct {
	inner     Driver
	sessionID string
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

func (d sessionScopedDriver) ResourceCountsForSession(sessionID string) DriverResourceCounts {
	if sessionID == "" {
		sessionID = d.sessionID
	}
	if reporter, ok := d.inner.(SessionDriverResourceReporter); ok {
		return reporter.ResourceCountsForSession(sessionID)
	}
	return d.ResourceCounts()
}
