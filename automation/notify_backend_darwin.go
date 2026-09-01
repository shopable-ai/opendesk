//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework CoreServices -framework UserNotifications
#include <stdlib.h>

int OpenDeskDarwinDeliverNotification(const char *title, const char *message, int sound, char **error_message);
int OpenDeskDarwinListNotifications(char **json_output, char **error_message);
int OpenDeskDarwinRemoveNotification(const char *identifier, char **error_message);
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"runtime"
	"time"
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

func notificationInteractionDarwinListNative() ([]NotificationRecord, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	var cJSON, cError *C.char
	result := C.OpenDeskDarwinListNotifications(&cJSON, &cError)
	defer freeDarwinNotificationCString(cJSON)
	errorMessage := takeDarwinNotificationCString(cError)
	switch int(result) {
	case 0:
		var records []NotificationRecord
		if cJSON == nil {
			return []NotificationRecord{}, nil
		}
		if err := json.Unmarshal([]byte(C.GoString(cJSON)), &records); err != nil {
			return nil, fmt.Errorf("decode native notification list: %w", err)
		}
		if records == nil {
			records = []NotificationRecord{}
		}
		return records, nil
	case 1:
		return nil, errDarwinNativeNotificationUnavailable
	default:
		if errorMessage == "" {
			errorMessage = fmt.Sprintf("native notification list returned status %d", int(result))
		}
		return nil, fmt.Errorf("%s", errorMessage)
	}
}

func notificationInteractionDarwinDismissNative(id string) (bool, error) {
	records, err := notificationInteractionDarwinListNative()
	if err != nil {
		return false, err
	}
	present := false
	for _, record := range records {
		if record.ID == id {
			present = true
			break
		}
	}
	if !present {
		return false, nil
	}

	runtime.LockOSThread()
	cID := C.CString(id)
	var cError *C.char
	result := C.OpenDeskDarwinRemoveNotification(cID, &cError)
	C.free(unsafe.Pointer(cID))
	runtime.UnlockOSThread()
	errorMessage := takeDarwinNotificationCString(cError)
	switch int(result) {
	case 0:
	case 1:
		return false, errDarwinNativeNotificationUnavailable
	default:
		if errorMessage == "" {
			errorMessage = fmt.Sprintf("native notification removal returned status %d", int(result))
		}
		return false, fmt.Errorf("%s", errorMessage)
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		records, err = notificationInteractionDarwinListNative()
		if err != nil {
			return false, err
		}
		stillPresent := false
		for _, record := range records {
			if record.ID == id {
				stillPresent = true
				break
			}
		}
		if !stillPresent {
			return true, nil
		}
		if time.Now().After(deadline) {
			return false, fmt.Errorf("notification %q remained present after removal", id)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func takeDarwinNotificationCString(value *C.char) string {
	if value == nil {
		return ""
	}
	result := C.GoString(value)
	C.free(unsafe.Pointer(value))
	return result
}

func freeDarwinNotificationCString(value *C.char) {
	if value != nil {
		C.free(unsafe.Pointer(value))
	}
}
