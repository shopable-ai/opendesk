//go:build windows

package appshell

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"

	"golang.org/x/sys/windows"
)

func TestWindowsInstanceLeaseDetachesActivePipeExactlyOnce(t *testing.T) {
	const (
		first  = windows.Handle(0x101)
		second = windows.Handle(0x202)
	)
	lease := &windowsInstanceLease{activePipe: first}
	if got := lease.detachActivePipe(first); got != first {
		t.Fatalf("first detach=%#x want %#x", got, first)
	}
	if got := lease.detachActivePipe(first); got != 0 {
		t.Fatalf("stale pipe retained duplicate close ownership: %#x", got)
	}
	lease.activePipe = second
	if got := lease.detachActivePipe(first); got != 0 || lease.activePipe != second {
		t.Fatalf("stale server cleared replacement pipe: got=%#x active=%#x", got, lease.activePipe)
	}
	if got := lease.detachActivePipe(0); got != second || lease.activePipe != 0 {
		t.Fatalf("shutdown detach=%#x active=%#x", got, lease.activePipe)
	}
}

func TestWindowsSingleInstanceActivationACKAndQuittingGate(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	manifest.ID = "com.opendesk.windows-single-instance-test"
	var activations atomic.Int64
	var accepting atomic.Bool
	accepting.Store(true)
	lease, primary, err := AcquireSingleInstance(context.Background(), manifest, func() bool {
		if !accepting.Load() {
			return false
		}
		activations.Add(1)
		return true
	})
	if err != nil || !primary || lease == nil {
		t.Fatalf("primary=%v lease=%T err=%v", primary, lease, err)
	}
	t.Cleanup(func() {
		_ = lease.Close()
		lease.Wait()
	})

	secondary, secondaryPrimary, err := AcquireSingleInstance(context.Background(), manifest, func() bool {
		t.Fatal("secondary must not create an execution owner")
		return false
	})
	if err != nil || secondaryPrimary || secondary != nil {
		t.Fatalf("secondary primary=%v lease=%T err=%v", secondaryPrimary, secondary, err)
	}
	if activations.Load() != 1 {
		t.Fatalf("secondary returned before activation ACK: %d", activations.Load())
	}

	accepting.Store(false)
	if _, _, err := AcquireSingleInstance(context.Background(), manifest, func() bool { return true }); !errors.Is(err, ErrInstanceQuitting) {
		t.Fatalf("quitting primary should reject activation, got %v", err)
	}
}
