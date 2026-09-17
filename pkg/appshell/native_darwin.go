//go:build darwin && cgo

package appshell

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#include <stdlib.h>
#include "native_darwin.h"
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"unsafe"
)

type darwinNativeHost struct {
	appPackage *Package
	primaryID  string

	mu           sync.RWMutex
	handler      func(string, string)
	openDocument func(string)
	started      bool
	closed       bool
	done         chan struct{}
	doneOnce     sync.Once
}

var darwinActiveHost struct {
	sync.RWMutex
	host *darwinNativeHost
}

func newPlatformNativeHost(appPackage *Package) (NativeHost, error) {
	primaryID := appPackage.Manifest.Tray.PrimaryAction
	if primaryID != "opendesk.open" {
		for _, item := range appPackage.Manifest.Tray.Menu {
			if item.Action == primaryID {
				primaryID = item.ID
				break
			}
		}
	}
	return &darwinNativeHost{appPackage: appPackage, primaryID: primaryID, done: make(chan struct{})}, nil
}

func (h *darwinNativeHost) Start(_ context.Context, handler func(string, string)) error {
	if handler == nil {
		return fmt.Errorf("AppKit tray action handler is required")
	}
	menuJSON, err := json.Marshal(nativeMenuForManifest(h.appPackage.Manifest))
	if err != nil {
		return fmt.Errorf("encode AppKit tray menu: %w", err)
	}
	icon := C.CString(h.appPackage.MacOSIconPath)
	iconTemplate := C.int(0)
	if h.appPackage.MacOSIconTemplate {
		iconTemplate = 1
	}
	tooltip := C.CString(h.appPackage.Manifest.Tray.Tooltip)
	primary := C.CString(h.primaryID)
	menu := C.CString(string(menuJSON))
	defer C.free(unsafe.Pointer(icon))
	defer C.free(unsafe.Pointer(tooltip))
	defer C.free(unsafe.Pointer(primary))
	defer C.free(unsafe.Pointer(menu))

	darwinActiveHost.Lock()
	if darwinActiveHost.host != nil {
		darwinActiveHost.Unlock()
		return fmt.Errorf("another AppKit App Shell host is already active")
	}
	darwinActiveHost.host = h
	darwinActiveHost.Unlock()
	h.mu.Lock()
	h.handler = handler
	h.mu.Unlock()
	var nativeError *C.char
	if C.ODAppShellStart(icon, iconTemplate, tooltip, primary, menu, &nativeError) == 0 {
		darwinActiveHost.Lock()
		if darwinActiveHost.host == h {
			darwinActiveHost.host = nil
		}
		darwinActiveHost.Unlock()
		h.mu.Lock()
		h.handler = nil
		h.mu.Unlock()
		return darwinError("create macOS menu bar item", nativeError)
	}
	h.mu.Lock()
	h.started = true
	h.mu.Unlock()
	return nil
}

func (h *darwinNativeHost) Activate(context.Context) error {
	h.mu.RLock()
	closed := h.closed
	h.mu.RUnlock()
	if closed {
		return ErrTornDown
	}
	C.ODAppShellActivate()
	return nil
}

func (h *darwinNativeHost) SetOpenDocumentHandler(handler func(string)) {
	h.mu.Lock()
	h.openDocument = handler
	h.mu.Unlock()
}

func (h *darwinNativeHost) OpenFlowFiles(ctx context.Context) ([]string, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var pathsJSON *C.char
	var nativeError *C.char
	if C.ODAppShellPickFlowFiles(&pathsJSON, &nativeError) == 0 {
		return nil, darwinError("open Flow file picker", nativeError)
	}
	if pathsJSON == nil {
		return nil, fmt.Errorf("open Flow file picker: native picker returned no paths")
	}
	defer C.ODAppShellFree(pathsJSON)
	var paths []string
	if err := json.Unmarshal([]byte(C.GoString(pathsJSON)), &paths); err != nil {
		return nil, fmt.Errorf("decode Flow file picker paths: %w", err)
	}
	return paths, nil
}

func (h *darwinNativeHost) ConfirmFlowTrust(ctx context.Context, prompt FlowTrustPrompt) (FlowTrustDecision, error) {
	if err := ctx.Err(); err != nil {
		return FlowTrustCancel, err
	}
	flowID := C.CString(prompt.FlowID)
	name := C.CString(prompt.Name)
	publisherID := C.CString(prompt.PublisherID)
	keyID := C.CString(prompt.PublisherKeyID)
	fingerprint := C.CString(prompt.PublisherFingerprint)
	defer C.free(unsafe.Pointer(flowID))
	defer C.free(unsafe.Pointer(name))
	defer C.free(unsafe.Pointer(publisherID))
	defer C.free(unsafe.Pointer(keyID))
	defer C.free(unsafe.Pointer(fingerprint))
	decision := C.int(0)
	var nativeError *C.char
	if C.ODAppShellConfirmFlowTrust(flowID, name, publisherID, keyID, fingerprint, &decision, &nativeError) == 0 {
		return FlowTrustCancel, darwinError("show Flow trust prompt", nativeError)
	}
	switch int(decision) {
	case 1:
		return FlowTrustFlow, nil
	case 2:
		return FlowTrustPublisher, nil
	default:
		return FlowTrustCancel, nil
	}
}

func (h *darwinNativeHost) UpdateMenuItem(_ context.Context, id string, patch MenuItemPatch) error {
	itemID := C.CString(id)
	defer C.free(unsafe.Pointer(itemID))
	var label *C.char
	hasLabel := 0
	if patch.Label != nil {
		label = C.CString(*patch.Label)
		defer C.free(unsafe.Pointer(label))
		hasLabel = 1
	}
	enabled, hasEnabled := 0, 0
	if patch.Enabled != nil {
		hasEnabled = 1
		if *patch.Enabled {
			enabled = 1
		}
	}
	visible, hasVisible := 0, 0
	if patch.Visible != nil {
		hasVisible = 1
		if *patch.Visible {
			visible = 1
		}
	}
	var nativeError *C.char
	if C.ODAppShellUpdateMenuItem(itemID, label, C.int(hasLabel), C.int(enabled), C.int(hasEnabled), C.int(visible), C.int(hasVisible), &nativeError) == 0 {
		return darwinError("update macOS menu item", nativeError)
	}
	return nil
}

func (h *darwinNativeHost) Teardown(context.Context) error {
	h.doneOnce.Do(func() {
		h.mu.Lock()
		h.closed = true
		h.handler = nil
		h.openDocument = nil
		h.mu.Unlock()
		darwinActiveHost.Lock()
		if darwinActiveHost.host == h {
			darwinActiveHost.host = nil
		}
		darwinActiveHost.Unlock()
		C.ODAppShellTeardown()
		close(h.done)
	})
	return nil
}

func (h *darwinNativeHost) Wait() { <-h.done }

func (h *darwinNativeHost) RunMain(context.Context) error {
	h.mu.RLock()
	started := h.started
	h.mu.RUnlock()
	if !started {
		return ErrNotStarted
	}
	C.ODAppShellRun()
	return nil
}

func darwinError(operation string, nativeError *C.char) error {
	message := "unknown AppKit error"
	if nativeError != nil {
		message = C.GoString(nativeError)
		C.ODAppShellFree(nativeError)
	}
	return fmt.Errorf("%s: %s", operation, message)
}

//export opendeskAppShellDarwinAction
func opendeskAppShellDarwinAction(itemID *C.char, source *C.char) {
	darwinActiveHost.RLock()
	host := darwinActiveHost.host
	darwinActiveHost.RUnlock()
	if host == nil {
		return
	}
	host.mu.RLock()
	handler := host.handler
	closed := host.closed
	host.mu.RUnlock()
	if handler != nil && !closed {
		handler(C.GoString(itemID), C.GoString(source))
	}
}

//export opendeskAppShellDarwinOpenDocument
func opendeskAppShellDarwinOpenDocument(path *C.char) {
	darwinActiveHost.RLock()
	host := darwinActiveHost.host
	darwinActiveHost.RUnlock()
	if host == nil {
		return
	}
	host.mu.RLock()
	handler := host.openDocument
	closed := host.closed
	host.mu.RUnlock()
	if handler != nil && !closed {
		handler(C.GoString(path))
	}
}
