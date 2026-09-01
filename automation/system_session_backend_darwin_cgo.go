//go:build darwin && cgo

package automation

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework CoreGraphics
#include <stdlib.h>

int OpenDeskDarwinCopySessionState(char **json_output, char **error_message);
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"runtime"
	"unsafe"
)

func darwinSessionStateSupported() bool { return true }

func currentDarwinSessionState() (SystemSessionState, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	var cJSON, cError *C.char
	result := C.OpenDeskDarwinCopySessionState(&cJSON, &cError)
	defer freeSystemSessionCString(cJSON)
	errorMessage := takeSystemSessionCString(cError)
	if result != 0 {
		if errorMessage == "" {
			errorMessage = fmt.Sprintf("CGSessionCopyCurrentDictionary returned status %d", int(result))
		}
		return SystemSessionState{}, fmt.Errorf("%s", errorMessage)
	}
	if cJSON == nil {
		return SystemSessionState{}, fmt.Errorf("CGSessionCopyCurrentDictionary returned no state")
	}
	var state SystemSessionState
	if err := json.Unmarshal([]byte(C.GoString(cJSON)), &state); err != nil {
		return SystemSessionState{}, fmt.Errorf("decode macOS session state: %w", err)
	}
	return state, nil
}

func takeSystemSessionCString(value *C.char) string {
	if value == nil {
		return ""
	}
	result := C.GoString(value)
	C.free(unsafe.Pointer(value))
	return result
}

func freeSystemSessionCString(value *C.char) {
	if value != nil {
		C.free(unsafe.Pointer(value))
	}
}
