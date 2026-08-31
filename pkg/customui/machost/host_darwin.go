//go:build darwin && cgo

package machost

/*
#cgo CFLAGS: -fobjc-arc
#cgo LDFLAGS: -framework Cocoa -framework WebKit
#include <stdlib.h>
#include "native_darwin.h"
*/
import "C"

import (
	"bufio"
	"fmt"
	"io"
	"runtime"
	"sync"
	"unsafe"
)

var hostOutput struct {
	sync.Mutex
	writer io.Writer
}

//export OpenDeskUIEmitJSON
func OpenDeskUIEmitJSON(raw *C.char) {
	if raw == nil {
		return
	}
	hostOutput.Lock()
	defer hostOutput.Unlock()
	if hostOutput.writer == nil {
		return
	}
	_, _ = fmt.Fprintln(hostOutput.writer, C.GoString(raw))
}

// Run owns the AppKit main thread until the shutdown protocol command or stdin
// EOF terminates the native application event loop.
func Run(input io.Reader, output, diagnostics io.Writer) error {
	if input == nil || output == nil {
		return fmt.Errorf("custom UI host requires input and output streams")
	}
	if diagnostics == nil {
		diagnostics = io.Discard
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if C.OpenDeskUIIsMainThread() != 1 {
		return fmt.Errorf("custom UI host must run on the AppKit main thread")
	}
	hostOutput.Lock()
	hostOutput.writer = output
	hostOutput.Unlock()
	defer func() {
		hostOutput.Lock()
		hostOutput.writer = nil
		hostOutput.Unlock()
	}()

	scanErrors := make(chan error, 1)
	go func() {
		scanner := bufio.NewScanner(input)
		scanner.Buffer(make([]byte, 64*1024), 8*1024*1024)
		for scanner.Scan() {
			line := scanner.Text()
			raw := C.CString(line)
			C.OpenDeskUIHandleCommand(raw)
			C.free(unsafe.Pointer(raw))
		}
		if err := scanner.Err(); err != nil {
			fmt.Fprintf(diagnostics, "custom UI host input failed: %v\n", err)
			scanErrors <- err
		} else {
			scanErrors <- nil
		}
		C.OpenDeskUIShutdown()
	}()

	C.OpenDeskUIRun()
	select {
	case err := <-scanErrors:
		return err
	default:
		return nil
	}
}
