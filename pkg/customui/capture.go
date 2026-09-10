package customui

import (
	"context"
	"errors"
	"sync"
	"time"
)

// This registry covers only the current Runtime process. It does not promise
// to remove other applications' or another OpenDesk process's overlays.
var captureVisibility sync.RWMutex
var captureSessions = struct {
	sync.Mutex
	values map[*Session]struct{}
}{values: map[*Session]struct{}{}}

func registerCaptureSession(s *Session) {
	captureSessions.Lock()
	captureSessions.values[s] = struct{}{}
	captureSessions.Unlock()
}
func unregisterCaptureSession(s *Session) {
	captureSessions.Lock()
	delete(captureSessions.values, s)
	captureSessions.Unlock()
}

// SuspendNotifications hides currently visible owned notification windows and
// confirms native on-screen readback before capture. The caller must restore.
// New Show operations are held until restore; ordinary toolbar windows are not
// altered. A timeout/host failure aborts capture rather than returning polluted
// pixels as though exclusion had succeeded.
func SuspendNotifications(ctx context.Context) (func() error, error) {
	captureVisibility.Lock()
	var windows []*Window
	captureSessions.Lock()
	for s := range captureSessions.values {
		s.mu.RLock()
		for _, w := range s.windows {
			if w.spec.Kind == "notification" {
				windows = append(windows, w)
			}
		}
		s.mu.RUnlock()
	}
	captureSessions.Unlock()
	var hidden []*Window
	var once sync.Once
	var restoreErr error
	restore := func() error {
		once.Do(func() {
			defer captureVisibility.Unlock()
			cleanup, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			for _, w := range hidden {
				if w.cachedState().Status == StatusClosed {
					continue
				}
				if _, err := w.show(cleanup); err != nil && w.cachedState().Status != StatusClosed {
					restoreErr = errors.Join(restoreErr, err)
				}
			}
		})
		return restoreErr
	}
	fail := func(err error) (func() error, error) { return nil, errors.Join(err, restore()) }
	for _, w := range windows {
		state, err := w.State(ctx)
		if err != nil {
			return fail(err)
		}
		if state.Status == StatusClosed || !state.Visible {
			continue
		}
		// Include before Hide, so an error after successful native hiding still
		// restores the window rather than leaving an invisible persistent HUD.
		hidden = append(hidden, w)
		if _, err = w.Hide(ctx); err != nil && w.cachedState().Status != StatusClosed {
			return fail(err)
		}
		for {
			state, err = w.State(ctx)
			if err != nil {
				return fail(err)
			}
			if !state.OnScreen || state.Status == StatusClosed {
				break
			}
			timer := time.NewTimer(10 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return fail(ctx.Err())
			case <-timer.C:
			}
		}
	}
	return restore, nil
}
