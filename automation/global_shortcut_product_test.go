package automation

import "testing"

func TestGlobalShortcutLeaseReleasesOnlyItsOwnRegistration(t *testing.T) {
	backend := newMemoryGlobalShortcutBackend()
	first, err := registerGlobalShortcutWithBackend("CommandOrControl+Alt+Shift+M", func() {}, backend)
	if err != nil {
		t.Fatal(err)
	}
	second, err := registerGlobalShortcutWithBackend("CommandOrControl+Alt+Shift+N", func() {}, backend)
	if err != nil {
		t.Fatal(err)
	}
	if backend.Active() != 2 {
		t.Fatalf("active registrations = %d, want 2", backend.Active())
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if backend.Active() != 1 {
		t.Fatalf("closing first lease removed another registration: active=%d", backend.Active())
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	if backend.Active() != 1 {
		t.Fatalf("idempotent close changed registrations: active=%d", backend.Active())
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	if backend.Active() != 0 {
		t.Fatalf("registrations leaked: active=%d", backend.Active())
	}
}
