//go:build darwin

package automation

import (
	"context"
	"errors"
	"runtime"
	"sync"
	"time"
)

const (
	windowContentTimeout  = 2 * time.Second
	windowContentMaxDepth = 8
	windowContentMaxNodes = 512
	windowContentMaxBytes = 64 * 1024
)

// No queue or detached timeout workers: at most one private native read is alive.
// This owner does not construct an AccessibilityRuntime or grant its capability.
var windowContentMu sync.Mutex

func (w *darwinWindowManager) windowContent(info *WindowInfo) (string, error) {
	if info == nil || info.ProcessID == 0 || info.Handle == 0 {
		return "", windowOperationError("", WindowStaleTarget, "window content requires an exact native identity", nil)
	}
	if !windowContentMu.TryLock() {
		return "", windowOperationError("", WindowBackendFailed, "another window content read is in progress", nil)
	}
	defer windowContentMu.Unlock()
	expected := *info
	expected.ID = makeWindowID(expected.ProcessID, expected.Handle)
	type result struct {
		text string
		err  error
	}
	done := make(chan result, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		ctx, cancel := context.WithTimeout(context.Background(), windowContentTimeout)
		defer cancel()
		text, err := readDarwinWindowContent(ctx, w, expected)
		// Wait for native cleanup rather than abandoning a provider call on timeout.
		done <- result{text, err}
	}()
	r := <-done
	if r.err == nil {
		return r.text, nil
	}
	code := WindowBackendFailed
	var ax *AccessibilityError
	var win *WindowError
	switch {
	case errors.As(r.err, &win):
		return "", r.err
	case errors.Is(r.err, context.DeadlineExceeded):
		code = WindowTimeout
	case errors.As(r.err, &ax):
		switch ax.Code {
		case AccessibilityPermissionDenied:
			code = WindowPermissionDenied
		case AccessibilityNotSupported:
			code = WindowNotSupported
		case AccessibilityTimeout:
			code = WindowTimeout
		case AccessibilityStaleTarget, AccessibilityTargetNotFound:
			code = WindowStaleTarget
		case AccessibilityAmbiguousTarget:
			code = WindowAmbiguousTarget
		}
	}
	return "", windowOperationError("", code, "window content could not be read completely", r.err)
}

func verifyWindowContentIdentity(ctx context.Context, w *darwinWindowManager, expected WindowInfo) error {
	current, err := w.currentExact(ctx, expected)
	if err != nil {
		return err
	}
	if current == nil || current.ProcessID != expected.ProcessID || current.Handle != expected.Handle ||
		current.ID != expected.ID || current.Title != expected.Title || current.ExePath != expected.ExePath ||
		current.X != expected.X || current.Y != expected.Y || current.Width != expected.Width || current.Height != expected.Height {
		return windowOperationError("", WindowStaleTarget, "window identity changed during content read", nil)
	}
	return nil
}
