//go:build windows

package automation

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

const windowsCreateNoWindow = 0x08000000

func configureCommand(cmd *exec.Cmd, hideWindow bool) {
	if hideWindow {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: windowsCreateNoWindow,
		}
	}
}

func terminateCommand(cmd *exec.Cmd, _ bool) error {
	if cmd == nil || cmd.Process == nil {
		return os.ErrProcessDone
	}
	err := cmd.Process.Kill()
	if errors.Is(err, os.ErrProcessDone) {
		return nil
	}
	return err
}
