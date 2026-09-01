//go:build darwin && cgo

package main

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>

void OpenDeskRunStatusItem(int parent_pid, const char *status_url, const char *scheduler_url, const char *icon_path);
void OpenDeskShowStartupError(const char *message);
*/
import "C"

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"unsafe"
)

func init() {
	// AppKit owns the main thread for the status item's complete lifetime.
	runtime.LockOSThread()
}

func main() {
	if len(os.Args) == 3 && os.Args[1] == "--startup-error" {
		showStartupError(os.Args[2])
		return
	}
	if len(os.Args) != 5 {
		fmt.Fprintln(os.Stderr, "usage: opendesk-status <parent-pid> <status-url> <scheduler-url> <icon-path>")
		os.Exit(2)
	}
	parentPID, err := strconv.Atoi(os.Args[1])
	if err != nil || parentPID <= 0 {
		fmt.Fprintln(os.Stderr, "opendesk-status: parent PID must be positive")
		os.Exit(2)
	}
	runStatusItem(parentPID, os.Args[2], os.Args[3], os.Args[4])
}

func runStatusItem(parentPID int, statusURL, schedulerURL, iconPath string) {
	cStatusURL := C.CString(statusURL)
	defer C.free(unsafe.Pointer(cStatusURL))
	cSchedulerURL := C.CString(schedulerURL)
	defer C.free(unsafe.Pointer(cSchedulerURL))
	cIconPath := C.CString(iconPath)
	defer C.free(unsafe.Pointer(cIconPath))
	C.OpenDeskRunStatusItem(C.int(parentPID), cStatusURL, cSchedulerURL, cIconPath)
}

func showStartupError(message string) {
	cMessage := C.CString(message)
	defer C.free(unsafe.Pointer(cMessage))
	C.OpenDeskShowStartupError(cMessage)
}
