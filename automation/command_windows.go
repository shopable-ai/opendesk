//go:build windows

package automation

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

func configureCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
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
