//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework AppKit -framework Foundation
#include <stdint.h>
#include <stdlib.h>

char *opendesk_desktop_events_running_applications_json(void);
int64_t opendesk_clipboard_change_count(void);
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"strconv"
	"unsafe"
)

func listDesktopApplicationsPlatform() ([]desktopApplicationState, error) {
	raw := C.opendesk_desktop_events_running_applications_json()
	if raw == nil {
		return nil, fmt.Errorf("NSWorkspace runningApplications returned no JSON")
	}
	defer C.free(unsafe.Pointer(raw))
	var applications []desktopApplicationState
	if err := json.Unmarshal([]byte(C.GoString(raw)), &applications); err != nil {
		return nil, fmt.Errorf("parse NSWorkspace runningApplications: %w", err)
	}
	return applications, nil
}

func desktopClipboardRevisionPlatform() (desktopClipboardRevision, error) {
	changeCount := int64(C.opendesk_clipboard_change_count())
	if changeCount < 0 {
		return desktopClipboardRevision{}, fmt.Errorf("NSPasteboard changeCount is unavailable")
	}
	return desktopClipboardRevision{Revision: strconv.FormatInt(changeCount, 10), ChangeCount: changeCount}, nil
}
