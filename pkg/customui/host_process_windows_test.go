//go:build windows

package customui

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestWindowsNativeHostParentDeathOwnership(t *testing.T) {
	if pidFile, ok := windowsOwnershipArg("opendesk-parent-harness"); ok {
		runWindowsOwnershipParentHarness(t, pidFile)
		return
	}

	pidFile := filepath.Join(t.TempDir(), "native-ui-child.pid")
	var diagnostics bytes.Buffer
	parent := exec.Command(
		os.Args[0],
		"-test.run=^TestWindowsNativeHostParentDeathOwnership$",
		"--",
		"opendesk-parent-harness",
		pidFile,
	)
	parent.Stdout = &diagnostics
	parent.Stderr = &diagnostics
	if err := parent.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if parent.Process != nil {
			_ = parent.Process.Kill()
		}
		_, _ = parent.Process.Wait()
	}()

	var childPID int
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		data, err := os.ReadFile(pidFile)
		if err == nil {
			childPID, err = strconv.Atoi(string(bytes.TrimSpace(data)))
			if err == nil && childPID > 0 {
				break
			}
		}
		if parent.ProcessState != nil && parent.ProcessState.Exited() {
			break
		}
		time.Sleep(25 * time.Millisecond)
	}
	if childPID <= 0 {
		t.Fatalf("ownership harness did not publish child pid: %s", diagnostics.String())
	}
	childHandle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(childPID))
	if err != nil {
		t.Fatalf("open owned helper pid %d: %v; harness=%s", childPID, err, diagnostics.String())
	}
	defer windows.CloseHandle(childHandle)

	// Simulate Task Manager / abnormal Runtime death. The parent does not run
	// any defer/Close path, so only the OS Job ownership can remove the helper.
	if err := parent.Process.Kill(); err != nil {
		t.Fatalf("kill ownership parent: %v", err)
	}
	_, _ = parent.Process.Wait()
	parent.Process = nil

	status, err := windows.WaitForSingleObject(childHandle, 5000)
	if err != nil {
		t.Fatalf("wait for owned helper after parent death: %v", err)
	}
	if status != windows.WAIT_OBJECT_0 {
		t.Fatalf("owned helper pid %d survived parent death; wait status=0x%X; harness=%s", childPID, status, diagnostics.String())
	}
}

func runWindowsOwnershipParentHarness(t *testing.T, pidFile string) {
	process, stdin, stdout, err := startWindowsOwnedHostProcess(
		os.Args[0],
		[]string{"-test.run=^TestWindowsOwnedHostHelper$", "--", "opendesk-owned-host-helper"},
		os.Stderr,
	)
	if err != nil {
		t.Fatalf("start owned helper: %v", err)
	}
	if err := os.WriteFile(pidFile, []byte(strconv.Itoa(process.PID())), 0o600); err != nil {
		t.Fatalf("write owned helper pid: %v", err)
	}
	// Keep the transport and Job handle alive until this harness process is
	// forcibly terminated by the outer test.
	_ = stdin
	_ = stdout
	for {
		time.Sleep(time.Hour)
	}
}

func TestWindowsOwnedHostHelper(t *testing.T) {
	if _, ok := windowsOwnershipArg("opendesk-owned-host-helper"); !ok {
		return
	}
	for {
		time.Sleep(time.Hour)
	}
}

func windowsOwnershipArg(marker string) (string, bool) {
	for index, value := range os.Args {
		if value != marker {
			continue
		}
		if index+1 < len(os.Args) {
			return os.Args[index+1], true
		}
		return "", true
	}
	return "", false
}

func TestWindowsOwnedHostKillAndWait(t *testing.T) {
	process, stdin, stdout, err := startWindowsOwnedHostProcess(
		os.Args[0],
		[]string{"-test.run=^TestWindowsOwnedHostHelper$", "--", "opendesk-owned-host-helper"},
		os.Stderr,
	)
	if err != nil {
		t.Fatal(err)
	}
	defer stdin.Close()
	defer stdout.Close()
	if process.PID() <= 0 {
		t.Fatalf("owned process pid = %d", process.PID())
	}
	if err := process.Kill(); err != nil {
		t.Fatalf("Kill() = %v", err)
	}
	if err := process.Wait(); err == nil {
		t.Fatal("Wait() after forced Job termination unexpectedly returned nil")
	}
	if err := process.Kill(); err != nil {
		t.Fatalf("repeated Kill() after Wait() = %v", err)
	}
	if process.PID() <= 0 {
		t.Fatal(fmt.Sprintf("owned process pid was lost after cleanup: %d", process.PID()))
	}
}
