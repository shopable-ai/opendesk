//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework CoreServices
#include <stdlib.h>

int OpenDeskDarwinDeliverNotification(const char *title, const char *message, int sound);
*/
import "C"

import (
	"fmt"
	"runtime"
	"unsafe"
)

func notifyDarwinNative(title, message string, sound bool) error {
	// AppKit notification registration is main-thread-affine. The call is
	// synchronous; keeping this goroutine on its OS thread also avoids a Go
	// scheduler migration while NSApplication/NSUserNotificationCenter is
	// initialized.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))
	cMessage := C.CString(message)
	defer C.free(unsafe.Pointer(cMessage))

	result := C.OpenDeskDarwinDeliverNotification(cTitle, cMessage, C.int(boolToInt(sound)))
	switch int(result) {
	case 0:
		return nil
	case 1:
		return errDarwinNativeNotificationUnavailable
	default:
		return fmt.Errorf("native notification delivery returned status %d", int(result))
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
