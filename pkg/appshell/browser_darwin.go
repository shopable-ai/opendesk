//go:build darwin && cgo

package appshell

/*
#include <stdlib.h>
#include "native_darwin.h"
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"unsafe"
)

var browserDialogToken atomic.Uint64

func (h *darwinNativeHost) BrowserPrompt(ctx context.Context, prompt BrowserPrompt) (BrowserChoice, error) {
	var choice BrowserChoice
	if err := ctx.Err(); err != nil {
		return choice, err
	}
	prompt.Token = browserDialogToken.Add(1)
	if deadline, ok := ctx.Deadline(); ok && (prompt.DeadlineMillis == 0 || deadline.UnixMilli() < prompt.DeadlineMillis) {
		prompt.DeadlineMillis = deadline.UnixMilli()
	}
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-done:
			return
		case <-ctx.Done():
			C.ODAppShellCancelBrowserPrompt(C.ulonglong(prompt.Token))
		}
	}()
	data, err := json.Marshal(prompt)
	if err != nil {
		return choice, err
	}
	request := C.CString(string(data))
	defer C.free(unsafe.Pointer(request))
	var response, nativeError *C.char
	if C.ODAppShellBrowserPrompt(request, &response, &nativeError) == 0 {
		return choice, darwinError("Browser dialog", nativeError)
	}
	if response == nil {
		return choice, fmt.Errorf("Browser dialog returned no choice")
	}
	defer C.ODAppShellFree(response)
	if err = ctx.Err(); err != nil {
		return choice, err
	}
	err = json.Unmarshal([]byte(C.GoString(response)), &choice)
	return choice, err
}
