//go:build cgo && (darwin || windows || linux)

package automation

/*
#cgo CFLAGS: -std=c99 -I${SRCDIR}/../third_party/libuiohook/include -I${SRCDIR}/../third_party/libuiohook/src
#cgo darwin CFLAGS: -DUSE_APPLICATION_SERVICES -DUSE_IOKIT -DUSE_OBJC -DUSE_APPKIT
#cgo darwin LDFLAGS: -framework Carbon -framework ApplicationServices -framework IOKit -framework AppKit -lobjc -lpthread
#cgo windows LDFLAGS: -ladvapi32 -luser32
#cgo linux CFLAGS: -DUSE_XINERAMA
#cgo linux LDFLAGS: -lX11 -lXtst -lXinerama -lpthread
#include "recorder_uiohook_bridge.h"
*/
import "C"

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
)

type uiohookBackend struct {
	ready     chan struct{}
	done      chan struct{}
	readyOnce sync.Once
	doneOnce  sync.Once
	stopOnce  sync.Once
	wg        sync.WaitGroup

	sink       func(RecorderInputEvent)
	failure    func(error)
	stopping   atomic.Bool
	started    atomic.Bool
	runResult  atomic.Int32
	stopResult atomic.Int32
}

var activeUIOHookBackend atomic.Pointer[uiohookBackend]

func newRecorderInputBackend() RecorderInputBackend {
	return &uiohookBackend{ready: make(chan struct{}), done: make(chan struct{})}
}

func (b *uiohookBackend) Capabilities() RecorderBackendCapabilities {
	capability := RecorderBackendCapabilities{
		Supported: true, Platform: runtime.GOOS, Backend: "libuiohook-static",
		Permission: "unknown", CoordinateSpace: "screen-logical",
		Limitations: []string{
			"capture is desktop-global; options.within records the initial window context but does not filter input or prevent switching applications",
			"libuiohook mouse coordinates are signed 16-bit values",
			"input source injection identity is reported as unknown",
		},
	}
	if runtime.GOOS == "linux" {
		if strings.TrimSpace(os.Getenv("WAYLAND_DISPLAY")) != "" && strings.TrimSpace(os.Getenv("DISPLAY")) == "" {
			capability.Supported = false
			capability.Permission = "unsupported"
			capability.CoordinateSpace = "unavailable"
			capability.Limitations = append(capability.Limitations, "Wayland full-desktop input capture is unsupported; use an X11 session")
			return capability
		}
		capability.Backend = "libuiohook-x11-static"
		capability.Limitations = append(capability.Limitations, "Linux capture requires an X11 DISPLAY and XRecord/XTest runtime support")
	}
	permission := int(C.opendesk_recorder_uiohook_permission())
	switch permission {
	case 1:
		if runtime.GOOS == "darwin" {
			capability.Permission = "authorized"
		} else {
			capability.Permission = "not-required"
		}
	case 0:
		capability.Permission = "denied"
	default:
		capability.Permission = "unknown"
	}
	return capability
}

func (b *uiohookBackend) Start(ctx context.Context, sink func(RecorderInputEvent), failure func(error)) error {
	if b == nil || sink == nil {
		return recorderError(RecorderInvalidArgument, "Recorder.start", "native backend requires an event sink", nil)
	}
	capability := b.Capabilities()
	if !capability.Supported {
		return recorderError(RecorderCaptureUnavailable, "Recorder.start", strings.Join(capability.Limitations, "; "), nil)
	}
	if capability.Permission == "denied" {
		return recorderError(RecorderCaptureDenied, "Recorder.start", "operating-system input monitoring permission is denied", nil)
	}
	if !acquireUIOHookLease(b) {
		return recorderError(RecorderCaptureOccupied, "Recorder.start", "another execution owns the process-wide input capture lease", nil)
	}
	b.sink = sink
	b.failure = failure
	b.started.Store(true)
	b.wg.Add(1)
	go b.run()
	select {
	case <-b.ready:
		return nil
	case <-b.done:
		return recorderUIOHookResultError("start", int(b.runResult.Load()))
	case <-ctx.Done():
		stopCtx, cancel := context.WithTimeout(context.Background(), recorderBackendStopTimeout)
		_ = b.Stop(stopCtx)
		cancel()
		return recorderError(RecorderCanceled, "Recorder.start", "native input backend did not become ready before cancellation", ctx.Err())
	}
}

func acquireUIOHookLease(backend *uiohookBackend) bool {
	return backend != nil && activeUIOHookBackend.CompareAndSwap(nil, backend)
}

func releaseUIOHookLease(backend *uiohookBackend) bool {
	return backend != nil && activeUIOHookBackend.CompareAndSwap(backend, nil)
}

func (b *uiohookBackend) run() {
	defer b.wg.Done()
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	result := int(C.opendesk_recorder_uiohook_run())
	b.runResult.Store(int32(result))
	releaseUIOHookLease(b)
	b.doneOnce.Do(func() { close(b.done) })
	if !b.stopping.Load() && b.failure != nil {
		b.failure(recorderUIOHookResultError("run", result))
	}
}

func (b *uiohookBackend) Stop(ctx context.Context) error {
	if b == nil || !b.started.Load() {
		return nil
	}
	b.stopping.Store(true)
	select {
	case <-b.done:
		return recorderUIOHookResultError("run", int(b.runResult.Load()))
	default:
	}
	b.stopOnce.Do(func() {
		result := int(C.opendesk_recorder_uiohook_stop())
		b.stopResult.Store(int32(result))
	})
	select {
	case <-b.done:
		stopResult := int(b.stopResult.Load())
		if stopResult != 0 {
			return recorderUIOHookResultError("stop", stopResult)
		}
		result := int(b.runResult.Load())
		if result != 0 {
			return recorderUIOHookResultError("run", result)
		}
		return nil
	case <-ctx.Done():
		return recorderError(RecorderCaptureUnavailable, "RecorderSession.stop", "native input backend did not exit before the stop deadline", ctx.Err())
	}
}

func (b *uiohookBackend) Wait() {
	if b != nil {
		b.wg.Wait()
	}
}

func (b *uiohookBackend) ResourceCount() int {
	if activeUIOHookBackend.Load() == b {
		return 1
	}
	return 0
}

func (b *uiohookBackend) dispatch(event RecorderInputEvent) {
	if event.Type == recorderEventHookEnabled {
		b.readyOnce.Do(func() { close(b.ready) })
	}
	if b.sink != nil {
		b.sink(event)
	}
}

func recorderUIOHookResultError(operation string, result int) error {
	if result == 0 {
		return nil
	}
	code := RecorderCaptureUnavailable
	message := fmt.Sprintf("libuiohook %s failed with status 0x%02x", operation, result)
	switch result {
	case 0x20:
		message = "libuiohook could not open the X11 display"
	case 0x21:
		message = "the X11 RECORD extension is unavailable"
	case 0x30:
		message = "libuiohook could not install the Windows input hook"
	case 0x40:
		code = RecorderCaptureDenied
		message = "macOS Accessibility/Input Monitoring permission is disabled"
	case 0x41:
		message = "libuiohook could not create the macOS event tap"
	}
	return recorderError(code, "Recorder."+operation, message, nil)
}

func recorderCaptureLeaseCount() int {
	if activeUIOHookBackend.Load() != nil {
		return 1
	}
	return 0
}

//export opendeskRecorderDispatch
func opendeskRecorderDispatch(eventType C.uint16_t, nativeTime C.uint64_t, mask C.uint16_t, keycode C.uint16_t, rawcode C.uint16_t, keychar C.uint16_t, button C.uint16_t, clicks C.uint16_t, x C.int16_t, y C.int16_t, amount C.uint16_t, rotation C.int16_t, direction C.uint8_t) {
	backend := activeUIOHookBackend.Load()
	if backend == nil {
		return
	}
	backend.dispatch(RecorderInputEvent{
		Type: uint16(eventType), NativeTime: uint64(nativeTime), Mask: uint16(mask),
		Keycode: uint16(keycode), Rawcode: uint16(rawcode), Keychar: uint16(keychar),
		Button: uint16(button), Clicks: uint16(clicks), X: int16(x), Y: int16(y),
		Amount: uint16(amount), Rotation: int16(rotation), Direction: uint8(direction),
	})
}
