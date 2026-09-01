//go:build windows

package nativeextension

import (
	"os"
	"os/exec"
)

func configureCommand(_ *exec.Cmd) {}

func terminateCommand(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	_ = cmd.Process.Kill()
}

func lacksExecutePermission(_ os.FileInfo) bool { return false }
