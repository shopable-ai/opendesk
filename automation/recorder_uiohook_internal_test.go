//go:build cgo && (darwin || windows || linux)

package automation

import (
	"context"
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
