//go:build darwin

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

// openDeskAppPaths returns paths only when this process is the main executable
// of a real OpenDesk.app. Plain CLI invocations intentionally remain silent.
func openDeskAppPaths() (helper, icon string, ok bool) {
	executable, err := os.Executable()
	if err != nil {
		return "", "", false
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		return "", "", false
	}
	macOSDir := filepath.Dir(executable)
	contentsDir := filepath.Dir(macOSDir)
	appRoot := filepath.Dir(contentsDir)
	if filepath.Base(executable) != "opendesk" || filepath.Base(macOSDir) != "MacOS" ||
		filepath.Base(contentsDir) != "Contents" || filepath.Base(appRoot) != "OpenDesk.app" {
		return "", "", false
	}
	helper = filepath.Join(contentsDir, "Helpers", "opendesk-status")
	icon = filepath.Join(contentsDir, "Resources", "OpenDesk.icns")
	if helperInfo, helperErr := os.Stat(helper); helperErr != nil || !helperInfo.Mode().IsRegular() || helperInfo.Mode()&0o111 == 0 {
		return "", "", false
	}
	if iconInfo, iconErr := os.Stat(icon); iconErr != nil || !iconInfo.Mode().IsRegular() {
		return "", "", false
	}
	return helper, icon, true
}

// startMacOSAppStatusItem creates the visible completion state for a Finder
// launch only after the HTTP socket has been bound successfully.
func startMacOSAppStatusItem(port string) {
	helper, icon, ok := openDeskAppPaths()
	if !ok {
		return
	}
	statusURL := "http://127.0.0.1:" + port + "/status"
	schedulerURL := "http://127.0.0.1:" + port + "/scheduler"
	command := exec.Command(helper, strconv.Itoa(os.Getpid()), statusURL, schedulerURL, icon)
	if err := command.Start(); err != nil {
		terminalPrintf(os.Stderr, "[FRAMEWORK] [WARN] OpenDesk is ready, but the macOS status item could not start: %v\n", err)
	}
}

func reportMacOSAppStartupFailure(startupErr error) {
	helper, _, ok := openDeskAppPaths()
	if !ok || startupErr == nil {
		return
	}
	command := exec.Command(helper, "--startup-error", startupErr.Error())
	if err := command.Start(); err != nil {
		terminalPrintf(os.Stderr, "[FRAMEWORK] [WARN] OpenDesk could not display its startup error: %v\n", err)
	}
}
