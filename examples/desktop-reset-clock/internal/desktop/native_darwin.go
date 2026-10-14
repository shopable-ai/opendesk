//go:build darwin && cgo

package desktop

/*
#cgo CFLAGS: -x objective-c -fblocks
#cgo LDFLAGS: -framework Cocoa -framework CoreGraphics -framework UserNotifications
#include <stdlib.h>
void RCAppSetHeroPNG(const unsigned char *data, int length);
void RCAppRun(void);
void RCAppStop(void);
void RCAppUpdate(const char *json);
void RCAppNotify(const char *text);
*/
import "C"
import (
	"context"
	"encoding/json"
	"sync"
	"unsafe"
)

type macUI struct {
	mu     sync.Mutex
	handle func(Action)
}

var activeMac *macUI

func newNative() UI { return &macUI{} }
func (m *macUI) Run(ctx context.Context, handle func(Action)) error {
	m.mu.Lock()
	m.handle = handle
	activeMac = m
	m.mu.Unlock()
	go func() { <-ctx.Done(); C.RCAppStop() }()
	if hero, err := loadC3Hero(); err == nil && len(hero.PNG) > 0 {
		C.RCAppSetHeroPNG((*C.uchar)(unsafe.Pointer(&hero.PNG[0])), C.int(len(hero.PNG)))
	}
	C.RCAppRun() // AppKit must run on main OS thread (locked by cmd).
	m.mu.Lock()
	m.handle = nil
	activeMac = nil
	m.mu.Unlock()
	return nil
}
func (m *macUI) Update(v Display) {
	b, _ := json.Marshal(v)
	s := C.CString(string(b))
	C.RCAppUpdate(s)
	C.free(unsafe.Pointer(s))
}
func (m *macUI) Notify(v string) { s := C.CString(v); C.RCAppNotify(s); C.free(unsafe.Pointer(s)) }

//export RCGoAction
func RCGoAction(name, value *C.char) {
	m := activeMac
	if m == nil {
		return
	}
	m.mu.Lock()
	h := m.handle
	m.mu.Unlock()
	if h != nil {
		go h(Action{Name: C.GoString(name), Value: C.GoString(value)})
	}
}
