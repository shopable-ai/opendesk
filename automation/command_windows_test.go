//go:build windows

package automation

import (
	"os/exec"
	"testing"
)

func TestWindowsCommandHideWindowIsExplicitAndUsesCreateNoWindow(t *testing.T) {
	visible := exec.Command("cmd.exe", "/c", "exit", "0")
	configureCommand(visible, false)
	if visible.SysProcAttr != nil {
		t.Fatalf("default CLI command unexpectedly changed Console creation: %+v", visible.SysProcAttr)
	}

	hidden := exec.Command("cmd.exe", "/c", "exit", "0")
	configureCommand(hidden, true)
	if hidden.SysProcAttr == nil || !hidden.SysProcAttr.HideWindow ||
		hidden.SysProcAttr.CreationFlags&windowsCreateNoWindow == 0 {
		t.Fatalf("hidden product command lacks Windows no-Console flags: %+v", hidden.SysProcAttr)
	}
}
