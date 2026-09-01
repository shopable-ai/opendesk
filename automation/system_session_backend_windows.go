//go:build windows

package automation

import (
	"context"
	"fmt"
	"os"
	"time"

	"golang.org/x/sys/windows"
)

var (
	systemSessionUser32          = windows.NewLazySystemDLL("user32.dll")
	systemSessionLockWorkStation = systemSessionUser32.NewProc("LockWorkStation")
	systemSessionExitWindowsEx   = systemSessionUser32.NewProc("ExitWindowsEx")
)

type windowsSystemSessionBackend struct{}

func newDefaultSystemSessionBackend() SystemSessionBackend { return &windowsSystemSessionBackend{} }

func (b *windowsSystemSessionBackend) Capabilities() SystemSessionCapabilities {
	unsupportedScreenSaver := SystemSessionOperationCapability{
		Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true,
		Notes: "no Windows screen-saver action is implemented; lock is available separately",
	}
	return SystemSessionCapabilities{
		SchemaVersion: 1, Platform: "windows", Backend: "win32-session",
		State: SystemSessionOperationCapability{
			Supported: true, Verified: false,
			Notes: "reports process session identity and active-console comparison; locked remains unknown without a WTS notification observer",
		},
		Lock: SystemSessionOperationCapability{
			Supported: true, Verified: false, Destructive: true, RequiresConfirmation: true,
			Notes: "uses the public asynchronous LockWorkStation API on the interactive desktop; initiated does not prove the workstation locked",
		},
		Logout: SystemSessionOperationCapability{
			Supported: true, Verified: false, Destructive: true, RequiresConfirmation: true,
			Notes: "uses ExitWindowsEx(EWX_LOGOFF); force may lose unsaved work and initiated does not prove completion",
		},
		StartScreenSaver: unsupportedScreenSaver,
		Wake:             SystemSessionOperationCapability{Supported: false, Notes: "wake and unlock are intentionally not exposed"},
		SwitchUser:       SystemSessionOperationCapability{Supported: false, Notes: "user switching is outside the current System session surface"},
	}
}

func (b *windowsSystemSessionBackend) State(ctx context.Context) (SystemSessionState, error) {
	if err := ctx.Err(); err != nil {
		return SystemSessionState{}, err
	}
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(uint32(os.Getpid()), &sessionID); err != nil {
		return SystemSessionState{}, fmt.Errorf("ProcessIdToSessionId: %w", err)
	}
	activeSessionID := windows.WTSGetActiveConsoleSessionId()
	active := sessionID == activeSessionID
	state := newSystemSessionState("windows", "win32-session", "background")
	if active {
		state.State = "active"
	}
	state.SessionID = sessionID
	state.Active = active
	state.OnConsole = active
	state.LoginDone = true
	state.ObservedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return state, nil
}

func (b *windowsSystemSessionBackend) Lock(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	result, _, callErr := systemSessionLockWorkStation.Call()
	if result == 0 {
		return fmt.Errorf("LockWorkStation: %w", callErr)
	}
	return nil
}

func (b *windowsSystemSessionBackend) Logout(ctx context.Context, force bool) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	const ewxLogoff = uintptr(0)
	flags := ewxLogoff
	if force {
		flags |= uintptr(0x00000004)
	}
	result, _, callErr := systemSessionExitWindowsEx.Call(flags, uintptr(0))
	if result == 0 {
		return fmt.Errorf("ExitWindowsEx(EWX_LOGOFF): %w", callErr)
	}
	return nil
}

func (b *windowsSystemSessionBackend) StartScreenSaver(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().StartScreenSaver.Notes, nil)
}
