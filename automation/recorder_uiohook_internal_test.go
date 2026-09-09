//go:build cgo && (darwin || windows || linux)

package automation

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestRecorderUIOHookProcessLeaseIsExclusiveAndReusable(t *testing.T) {
	if activeUIOHookBackend.Load() != nil {
		t.Fatal("unexpected active libuiohook backend before lease test")
	}
	first := &uiohookBackend{}
	second := &uiohookBackend{}
	if !acquireUIOHookLease(first) {
		t.Fatal("first backend did not acquire process-wide lease")
	}
	if acquireUIOHookLease(second) {
		t.Fatal("second backend acquired an occupied process-wide lease")
	}
	if first.ResourceCount() != 1 || second.ResourceCount() != 0 {
		t.Fatalf("lease resources first=%d second=%d", first.ResourceCount(), second.ResourceCount())
	}
	if !releaseUIOHookLease(first) || activeUIOHookBackend.Load() != nil {
		t.Fatal("first backend did not release its lease")
	}
	if !acquireUIOHookLease(second) || !releaseUIOHookLease(second) {
		t.Fatal("lease was not reusable after a clean release")
	}
}

func TestRecorderUIOHookStopRetriesTransientRunLoopFailure(t *testing.T) {
	done := make(chan struct{})
	calls := 0
	result := recorderRetryUIOHookStop(context.Background(), done, func() int {
		calls++
		if calls < 3 {
			return recorderUIOHookFailure
		}
		return 0
	}, time.Microsecond)
	if result != 0 || calls != 3 {
		t.Fatalf("stop result=%#x calls=%d", result, calls)
	}
}

func TestRecorderUIOHookStopDoesNotRetryPlatformFailure(t *testing.T) {
	done := make(chan struct{})
	calls := 0
	result := recorderRetryUIOHookStop(context.Background(), done, func() int {
		calls++
		return 0x41
	}, time.Microsecond)
	if result != 0x41 || calls != 1 {
		t.Fatalf("stop result=%#x calls=%d", result, calls)
	}
}

func TestRecorderUIOHookFailedStopQuarantinesLeaseAndCanRecover(t *testing.T) {
	if activeUIOHookBackend.Load() != nil {
		t.Fatal("unexpected active libuiohook backend before recovery test")
	}
	backend := &uiohookBackend{done: make(chan struct{})}
	backend.started.Store(true)
	if !acquireUIOHookLease(backend) {
		t.Fatal("test backend did not acquire process-wide lease")
	}
	var recoverable atomic.Bool
	backend.nativeStop = func() int {
		if !recoverable.Load() {
			return recorderUIOHookFailure
		}
		releaseUIOHookLease(backend)
		backend.doneOnce.Do(func() { close(backend.done) })
		return 0
	}

	firstCtx, firstCancel := context.WithTimeout(context.Background(), time.Millisecond)
	err := backend.Stop(firstCtx)
	firstCancel()
	if err == nil || activeUIOHookBackend.Load() != backend || backend.ResourceCount() != 1 {
		t.Fatalf("failed stop must retain quarantine lease: err=%v active=%p resources=%d", err, activeUIOHookBackend.Load(), backend.ResourceCount())
	}
	if acquireUIOHookLease(&uiohookBackend{}) {
		t.Fatal("another owner acquired a quarantined process-wide lease")
	}

	recoverable.Store(true)
	secondCtx, secondCancel := context.WithTimeout(context.Background(), time.Second)
	err = backend.Stop(secondCtx)
	secondCancel()
	if err != nil || activeUIOHookBackend.Load() != nil || backend.ResourceCount() != 0 {
		t.Fatalf("retryable stop did not recover quarantine: err=%v active=%p resources=%d", err, activeUIOHookBackend.Load(), backend.ResourceCount())
	}
}
