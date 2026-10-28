//go:build darwin && cgo

package automation

/*
#cgo LDFLAGS: -framework AppKit -framework ApplicationServices
#include <stdlib.h>
#include "window_app_watch_darwin.h"
*/
import "C"
import "unsafe"

type macAppWindowWatch struct{ native *C.ODAppWindowWatch }

func newAppWindowWatchBackend(pid int, path string) (appWindowWatchBackend, error) {
	text := C.CString(path)
	defer C.free(unsafe.Pointer(text))
	var status C.int
	native := C.od_app_window_watch_start(C.int(pid), text, &status)
	if native == nil {
		code := WindowBackendFailed
		if status == 1 {
			code = WindowStaleTarget
		}
		if status == 2 {
			code = WindowVerificationFailed
		}
		return nil, &WindowError{Code: code, Message: "exact process watch registration failed"}
	}
	return &macAppWindowWatch{native: native}, nil
}
func (w *macAppWindowWatch) Take() (uint32, interface{}, map[string]interface{}) {
	var statuses [13]C.int
	var nativeActive C.int
	bits := C.od_app_window_watch_take(w.native, &statuses[0], &nativeActive)
	names := []string{"appActive", "appTerminated", "axObserver", "focusedWindow", "windowCreated", "mainWindow", "focusedUIElement", "layoutChanged", "windowMoved", "windowResized", "windowDestroyed", "axAppActivated", "axAppDeactivated"}
	registrations := map[string]interface{}{}
	fallback := false
	for i, name := range names {
		supported := statuses[i] == 0
		if !supported {
			fallback = true
		}
		state := "failed"
		if supported {
			state = "registered"
		} else if statuses[i] == -1 {
			state = "not_registered"
		}
		registrations[name] = map[string]interface{}{"supported": supported, "status": int(statuses[i]), "state": state}
	}
	var active interface{}
	if nativeActive >= 0 {
		active = nativeActive == 1
	}
	return uint32(bits), active, map[string]interface{}{"platform": "darwin", "backend": "per-pid-kvo-ax", "registrations": registrations, "fallback": fallback, "fallbackMode": "caller-revalidation", "verified": false}
}
func (w *macAppWindowWatch) Close() {
	if w.native != nil {
		C.od_app_window_watch_stop(w.native)
		w.native = nil
	}
}
