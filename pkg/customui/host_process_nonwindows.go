//go:build !windows

package customui

import (
	"io"
	"os/exec"
)

func startPlatformHostProcess(path string, stderr io.Writer) (hostProcess, io.WriteCloser, io.ReadCloser, error) {
	return startCommandHostProcess(exec.Command(path), stderr)
}
