//go:build !darwin && !linux

package mcpserver

import "os/exec"

// The caller bounds pipe draining, but descendant ownership still requires a
// platform-specific implementation and separate evidence on other platforms.
func ownAPIDocProcess(cmd *exec.Cmd) func() error {
	return func() error { return cmd.Process.Kill() }
}
