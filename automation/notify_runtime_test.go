package automation

import (
	"errors"
	"testing"
	"time"

	"github.com/dop251/goja"
)

func withNotifyBackend(t *testing.T, backend notificationBackend) {
	t.Helper()
	previous := notifyBackend
	notifyBackend = backend
	t.Cleanup(func() {
		notifyBackend = previous
	})
}

func TestNotifyNormalizesOptionsAndPreservesCallerState(t *testing.T) {
	var gotTitle, gotMessage string
	var gotSound bool
	withNotifyBackend(t, func(title, message string, sound bool) error {
		gotTitle, gotMessage, gotSound = title, message, sound
		return nil
	})

	options := &NotifyOptions{Message: "done", Sound: true, Timeout: 7 * time.Second}
	if err := Notify(options); err != nil {
		t.Fatalf("Notify returned error: %v", err)
	}
	if gotTitle != "OpenDesk Notification" || gotMessage != "done" || !gotSound {
		t.Fatalf("unexpected backend request: title=%q message=%q sound=%v", gotTitle, gotMessage, gotSound)
	}
	if options.Title != "" {
		t.Fatalf("Notify mutated caller options title to %q", options.Title)
	}
}

func TestNotifyPassesSilentSoundAndIgnoresTimeoutAtBackend(t *testing.T) {
	var gotSound bool
	withNotifyBackend(t, func(title, message string, sound bool) error {
		gotSound = sound
		if title != "OpenDesk" || message != "quiet" {
			t.Fatalf("unexpected backend request: title=%q message=%q", title, message)
		}
		return nil
	})

	if err := Notify(&NotifyOptions{Title: "OpenDesk", Message: "quiet", Timeout: time.Nanosecond}); err != nil {
		t.Fatalf("Notify returned error: %v", err)
	}
	if gotSound {
		t.Fatal("silent notification unexpectedly requested sound")
	}
}

func TestNotifyRejectsNilOptions(t *testing.T) {
	if err := Notify(nil); err == nil {
		t.Fatal("Notify(nil) returned nil")
	}
}

func TestNotifyWrapsBackendFailure(t *testing.T) {
	want := errors.New("backend unavailable")
	withNotifyBackend(t, func(string, string, bool) error {
		return want
	})

	err := Notify(&NotifyOptions{Message: "failure"})
	if err == nil || err.Error() != "notification failed: backend unavailable" {
		t.Fatalf("unexpected wrapped error: %v", err)
	}
}

func TestInitJSRegistersNotifyBridgeBeforePolyfills(t *testing.T) {
	runtime := goja.New()
	if err := InitJS(runtime); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"notify", "notify____Inject"} {
		if value := runtime.Get(name); value == nil || goja.IsUndefined(value) {
			t.Fatalf("runtime global %s is not registered", name)
		}
	}
}
