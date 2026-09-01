//go:build windows

package desktopvision

import "os/exec"

func configureProviderCommand(_ *exec.Cmd) {}

func terminateProviderCommand(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}
