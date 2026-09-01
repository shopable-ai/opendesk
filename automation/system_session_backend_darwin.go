//go:build darwin

package automation

import (
	"context"
	"fmt"
	"os"
	"os/exec"
)

const darwinScreenSaverApplication = "/System/Library/CoreServices/ScreenSaverEngine.app"

type darwinSystemSessionBackend struct{}

func newDefaultSystemSessionBackend() SystemSessionBackend {
	return &darwinSystemSessionBackend{}
}

func (b *darwinSystemSessionBackend) Capabilities() SystemSessionCapabilities {
	stateSupported := darwinSessionStateSupported()
	screenSaverSupported := darwinScreenSaverAvailable()
	return SystemSessionCapabilities{
		SchemaVersion: 1, Platform: "darwin", Backend: "coregraphics-session",
		State: SystemSessionOperationCapability{
			Supported: stateSupported, Verified: false,
			Notes: "public CGSessionCopyCurrentDictionary reports caller WindowServer session identity and console/login state; locked remains unknown",
		},
		Lock: SystemSessionOperationCapability{
			Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true,
			Notes: "macOS has no public stable API for programmatically locking the current GUI session; private CGSession helpers and synthesized shortcuts are not exposed",
		},
		Logout: SystemSessionOperationCapability{
			Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true,
			Notes: "macOS logout requires user-mediated or Automation/private mechanisms and is not exposed as a stable Runtime primitive",
		},
		StartScreenSaver: SystemSessionOperationCapability{
			Supported: screenSaverSupported, Verified: false, Destructive: true, RequiresConfirmation: true,
			Notes: "launches the system ScreenSaverEngine application; host policy may immediately require a password, so repository smoke needs a disposable interactive session",
		},
		Wake: SystemSessionOperationCapability{
			Supported: false, Verified: false,
			Notes: "wake is not exposed; OpenDesk does not bypass a locked or sleeping session",
		},
		SwitchUser: SystemSessionOperationCapability{
			Supported: false, Verified: false,
			Notes: "fast user switching is outside the current System session surface",
		},
	}
}

func (b *darwinSystemSessionBackend) State(ctx context.Context) (SystemSessionState, error) {
	if err := ctx.Err(); err != nil {
		return SystemSessionState{}, err
	}
	return currentDarwinSessionState()
}

func (b *darwinSystemSessionBackend) Lock(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Lock.Notes, nil)
}

func (b *darwinSystemSessionBackend) Logout(context.Context, bool) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Logout.Notes, nil)
}

func (b *darwinSystemSessionBackend) StartScreenSaver(ctx context.Context) error {
	if !darwinScreenSaverAvailable() {
		return systemSessionOperationError("", SystemSessionNotSupported, "ScreenSaverEngine.app or /usr/bin/open is unavailable", nil)
	}
	if err := exec.CommandContext(ctx, "/usr/bin/open", darwinScreenSaverApplication).Run(); err != nil {
		return fmt.Errorf("launch ScreenSaverEngine.app: %w", err)
	}
	return nil
}

func darwinScreenSaverAvailable() bool {
	if info, err := os.Stat("/usr/bin/open"); err != nil || !info.Mode().IsRegular() {
		return false
	}
	info, err := os.Stat(darwinScreenSaverApplication)
	return err == nil && info.IsDir()
}
