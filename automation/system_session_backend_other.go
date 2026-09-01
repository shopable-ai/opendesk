//go:build !darwin && !linux && !windows

package automation

import "context"

type unsupportedSystemSessionBackend struct{}

func newDefaultSystemSessionBackend() SystemSessionBackend { return &unsupportedSystemSessionBackend{} }

func (b *unsupportedSystemSessionBackend) Capabilities() SystemSessionCapabilities {
	return unsupportedSystemSessionCapabilities("unsupported", "system session primitives are unavailable on this platform")
}

func (b *unsupportedSystemSessionBackend) State(context.Context) (SystemSessionState, error) {
	return SystemSessionState{}, systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().State.Notes, nil)
}

func (b *unsupportedSystemSessionBackend) Lock(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Lock.Notes, nil)
}

func (b *unsupportedSystemSessionBackend) Logout(context.Context, bool) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Logout.Notes, nil)
}

func (b *unsupportedSystemSessionBackend) StartScreenSaver(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().StartScreenSaver.Notes, nil)
}
