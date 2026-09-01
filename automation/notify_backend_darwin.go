//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework CoreServices -framework UserNotifications
#include <stdlib.h>

int OpenDeskDarwinDeliverNotification(const char *title, const char *message, int sound, char **error_message);
*/
import "C"

import (
	"fmt"
	"runtime"
	"unsafe"
)

func notifyDarwinNative(title, message string, sound bool) error {
	// Keep the synchronous Objective-C/UserNotifications bridge on one OS
	// thread for the lifetime of its autorelease pool and XPC callbacks.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))
	cMessage := C.CString(message)
	defer C.free(unsafe.Pointer(cMessage))

	var cError *C.char
	result := C.OpenDeskDarwinDeliverNotification(cTitle, cMessage, C.int(boolToInt(sound)), &cError)
	errorMessage := ""
	if cError != nil {
		errorMessage = C.GoString(cError)
		C.free(unsafe.Pointer(cError))
	}
	switch int(result) {
	case 0:
		return nil
	case 1:
		return errDarwinNativeNotificationUnavailable
	default:
		if errorMessage == "" {
			errorMessage = fmt.Sprintf("native notification delivery returned status %d", int(result))
		}
		return fmt.Errorf("%s", errorMessage)
	}
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
