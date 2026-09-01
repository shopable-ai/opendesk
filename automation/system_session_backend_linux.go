//go:build linux

package automation

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

type linuxSystemSessionBackend struct {
	loginctl  string
	sessionID string
}

func newDefaultSystemSessionBackend() SystemSessionBackend {
	path, _ := exec.LookPath("loginctl")
	return &linuxSystemSessionBackend{loginctl: path, sessionID: strings.TrimSpace(os.Getenv("XDG_SESSION_ID"))}
}

func (b *linuxSystemSessionBackend) available() bool { return b.loginctl != "" && b.sessionID != "" }

func (b *linuxSystemSessionBackend) Capabilities() SystemSessionCapabilities {
	available := b.available()
	notes := "requires systemd-logind loginctl and XDG_SESSION_ID for the current graphical session"
	return SystemSessionCapabilities{
		SchemaVersion: 1, Platform: "linux", Backend: "systemd-logind",
		State:            SystemSessionOperationCapability{Supported: available, Verified: false, Notes: notes + "; reads show-session properties"},
		Lock:             SystemSessionOperationCapability{Supported: available, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: notes + "; requests lock-session and depends on the desktop session manager honoring it"},
		Logout:           SystemSessionOperationCapability{Supported: available, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: notes + "; terminate-session ends every process in the current session; force=true is not supported"},
		StartScreenSaver: SystemSessionOperationCapability{Supported: false, Verified: false, Destructive: true, RequiresConfirmation: true, Notes: "desktop screen-saver D-Bus APIs are not uniform across Linux environments"},
		Wake:             SystemSessionOperationCapability{Supported: false, Notes: "wake and unlock are intentionally not exposed"},
		SwitchUser:       SystemSessionOperationCapability{Supported: false, Notes: "user switching is outside the current System session surface"},
	}
}

func (b *linuxSystemSessionBackend) State(ctx context.Context) (SystemSessionState, error) {
	if !b.available() {
		return SystemSessionState{}, systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().State.Notes, nil)
	}
	output, err := exec.CommandContext(ctx, b.loginctl, "show-session", b.sessionID, "--no-pager",
		"--property=Id", "--property=User", "--property=Active", "--property=Remote", "--property=State", "--property=LockedHint").Output()
	if err != nil {
		return SystemSessionState{}, fmt.Errorf("loginctl show-session: %w", err)
	}
	properties := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		key, value, ok := strings.Cut(scanner.Text(), "=")
		if ok {
			properties[key] = value
		}
	}
	if err := scanner.Err(); err != nil {
		return SystemSessionState{}, fmt.Errorf("parse loginctl show-session: %w", err)
	}
	stateName := strings.ToLower(properties["State"])
	if stateName == "" {
		stateName = "unknown"
	}
	state := newSystemSessionState("linux", "systemd-logind", stateName)
	state.SessionID = properties["Id"]
	if userID, err := strconv.ParseUint(properties["User"], 10, 32); err == nil {
		state.UserID = userID
	}
	if active, ok := parseSystemSessionBoolean(properties["Active"]); ok {
		state.Active = active
		state.OnConsole = active
	}
	if remote, ok := parseSystemSessionBoolean(properties["Remote"]); ok {
		state.Remote = remote
	}
	if locked, ok := parseSystemSessionBoolean(properties["LockedHint"]); ok {
		state.Locked = locked
	}
	state.LoginDone = true
	return state, nil
}

func (b *linuxSystemSessionBackend) Lock(ctx context.Context) error {
	if !b.available() {
		return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Lock.Notes, nil)
	}
	if err := exec.CommandContext(ctx, b.loginctl, "--no-ask-password", "lock-session", b.sessionID).Run(); err != nil {
		return fmt.Errorf("loginctl lock-session: %w", err)
	}
	return nil
}

func (b *linuxSystemSessionBackend) Logout(ctx context.Context, force bool) error {
	if !b.available() {
		return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().Logout.Notes, nil)
	}
	if force {
		return systemSessionOperationError("", SystemSessionInvalidArgument, "force=true is not supported by the systemd-logind backend", nil)
	}
	if err := exec.CommandContext(ctx, b.loginctl, "--no-ask-password", "terminate-session", b.sessionID).Run(); err != nil {
		return fmt.Errorf("loginctl terminate-session: %w", err)
	}
	return nil
}

func (b *linuxSystemSessionBackend) StartScreenSaver(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, b.Capabilities().StartScreenSaver.Notes, nil)
}

func parseSystemSessionBoolean(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "yes", "true", "1":
		return true, true
	case "no", "false", "0":
		return false, true
	default:
		return false, false
	}
}
