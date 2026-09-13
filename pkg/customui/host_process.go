package customui

import (
	"io"
	"os/exec"
)

// hostProcess is the minimal lifecycle contract ProcessDriver needs from a
// Runtime-owned native UI host. Platform-specific launchers may attach stronger
// ownership semantics than os/exec without exposing them through the public UI
// API.
type hostProcess interface {
	PID() int
	Wait() error
	Kill() error
}

type commandHostProcess struct {
	cmd *exec.Cmd
}

func (p *commandHostProcess) PID() int {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return 0
	}
	return p.cmd.Process.Pid
}

func (p *commandHostProcess) Wait() error {
	if p == nil || p.cmd == nil {
		return nil
	}
	return p.cmd.Wait()
}

func (p *commandHostProcess) Kill() error {
	if p == nil || p.cmd == nil || p.cmd.Process == nil {
		return nil
	}
	return p.cmd.Process.Kill()
}

func startCommandHostProcess(command *exec.Cmd, stderr io.Writer) (hostProcess, io.WriteCloser, io.ReadCloser, error) {
	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, nil, nil, err
	}
	command.Stderr = stderr
	if err := command.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, nil, nil, err
	}
	return &commandHostProcess{cmd: command}, stdin, stdout, nil
}
