//go:build darwin

package appshell

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
)

func TestDarwinSingleInstanceActivatesPrimaryBeforeSecondaryReturns(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	var activations atomic.Int64
	lease, primary, err := AcquireSingleInstance(context.Background(), manifest, func() bool {
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

	secondaryLease, secondaryPrimary, err := AcquireSingleInstance(context.Background(), manifest, func() bool {
		t.Fatal("secondary callback must not own an execution")
		return false
	})
	if err != nil || secondaryPrimary || secondaryLease != nil {
		t.Fatalf("primary=%v lease=%T err=%v", secondaryPrimary, secondaryLease, err)
	}
	if activations.Load() != 1 {
		t.Fatalf("secondary returned before the primary acknowledged activation: %d", activations.Load())
	}

	darwinLease := lease.(*darwinInstanceLease)
	darwinLease.closing.Store(true)
	if _, _, err := AcquireSingleInstance(context.Background(), manifest, func() bool { return true }); !errors.Is(err, ErrInstanceQuitting) {
		t.Fatalf("quitting primary should reject activation, got %v", err)
	}
}

func TestDarwinSingleInstanceReleasesIdentityAfterShutdown(t *testing.T) {
	manifest, err := ParseManifest([]byte(validManifestJSON()))
	if err != nil {
		t.Fatal(err)
	}
	manifest.ID = "com.opendesk.single-instance-release"
	lease, primary, err := AcquireSingleInstance(context.Background(), manifest, func() bool { return true })
	if err != nil || !primary {
		t.Fatalf("first acquire primary=%v err=%v", primary, err)
	}
	if err := lease.Close(); err != nil {
		t.Fatal(err)
	}
	lease.Wait()

	again, primary, err := AcquireSingleInstance(context.Background(), manifest, func() bool { return true })
	if err != nil || !primary || again == nil {
		t.Fatalf("second acquire primary=%v lease=%T err=%v", primary, again, err)
	}
	if err := again.Close(); err != nil {
		t.Fatal(err)
	}
	again.Wait()
}
