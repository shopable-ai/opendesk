package processlock

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Lease represents an operating-system-backed advisory file lock. Closing the
// lease releases ownership; the operating system also releases it when the
// process exits unexpectedly.
var (
	heldMu sync.Mutex
	held   = make(map[string]struct{})
)

type Lease struct {
	file      *os.File
	path      string
	platform  platformLock
	closeOnce sync.Once
	closeErr  error
}

// TryAcquire attempts to acquire an exclusive lock without waiting. The lock
// file is persistent metadata only; ownership is defined by the kernel lock,
// never by whether the file exists.
func TryAcquire(path string) (*Lease, bool, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, false, fmt.Errorf("process lock path is required")
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, false, fmt.Errorf("resolve process lock path: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(absPath), 0o755); err != nil {
		return nil, false, fmt.Errorf("create process lock directory: %w", err)
	}
	heldMu.Lock()
	if _, exists := held[absPath]; exists {
		heldMu.Unlock()
		return nil, false, nil
	}
	held[absPath] = struct{}{}
	heldMu.Unlock()
	releaseReservation := true
	defer func() {
		if releaseReservation {
			heldMu.Lock()
			delete(held, absPath)
			heldMu.Unlock()
		}
	}()

	file, err := os.OpenFile(absPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, false, fmt.Errorf("open process lock %s: %w", absPath, err)
	}
	platform, acquired, err := tryPlatformLock(file)
	if err != nil {
		_ = file.Close()
		return nil, false, fmt.Errorf("acquire process lock %s: %w", absPath, err)
	}
	if !acquired {
		_ = file.Close()
		return nil, false, nil
	}
	releaseReservation = false
	return &Lease{file: file, path: absPath, platform: platform}, true, nil
}

// Acquire waits for ownership using a bounded retry interval. Callers control
// the total wait through ctx; this function never busy-loops.
func Acquire(ctx context.Context, path string, retryInterval time.Duration) (*Lease, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if retryInterval <= 0 {
		retryInterval = 50 * time.Millisecond
	}
	for {
		lease, acquired, err := TryAcquire(path)
		if err != nil {
			return nil, err
		}
		if acquired {
			return lease, nil
		}
		timer := time.NewTimer(retryInterval)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (l *Lease) Close() error {
	if l == nil {
		return nil
	}
	l.closeOnce.Do(func() {
		if l.file == nil {
			return
		}
		unlockErr := unlockPlatformLock(l.file, l.platform)
		closeErr := l.file.Close()
		l.closeErr = errors.Join(unlockErr, closeErr)
		l.file = nil
		heldMu.Lock()
		delete(held, l.path)
		heldMu.Unlock()
	})
	return l.closeErr
}
