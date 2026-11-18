//go:build darwin || linux

package mcpserver

import (
	"os"
	"os/exec"
	"syscall"
)

// The returned function is valid only before the first Wait: an unreaped leader
// reserves the numeric ID of this command's group, including after its exit.
func ownAPIDocProcess(cmd *exec.Cmd) func() error {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	kill := func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if err == syscall.ESRCH {
			return os.ErrProcessDone
		}
		return err
	}
	return kill
}
