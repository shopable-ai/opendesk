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

func TestNotifyRejectsUnsafeNotificationTextBeforeBackend(t *testing.T) {
	called := false
	withNotifyBackend(t, func(string, string, bool) error {
		called = true
		return nil
	})

	for name, options := range map[string]*NotifyOptions{
		"NUL title":     {Title: "bad\x00title", Message: "body"},
		"NUL message":   {Title: "OpenDesk", Message: "bad\x00body"},
		"invalid UTF-8": {Title: string([]byte{0xff}), Message: "body"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := Notify(options); err == nil {
				t.Fatal("Notify unexpectedly returned nil")
			}
		})
	}
	if called {
		t.Fatal("backend was called for invalid notification text")
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

func TestRuntimeNotifyBridgePreservesDocumentedFields(t *testing.T) {
	var gotTitle, gotMessage string
	var gotSound bool
	withNotifyBackend(t, func(title, message string, sound bool) error {
		gotTitle, gotMessage, gotSound = title, message, sound
		return nil
	})

	runtime := goja.New()
	if err := InitJS(runtime); err != nil {
		t.Fatal(err)
	}
	value, err := runtime.RunString(`notify({
		title: 'OpenDesk bridge title',
		message: 'custom bridge body',
		sound: true,
		timeout: 1500,
	})`)
	if err != nil {
		t.Fatal(err)
	}
	if !goja.IsUndefined(value) {
		t.Fatalf("notify result = %v, want undefined", value)
	}
	if gotTitle != "OpenDesk bridge title" || gotMessage != "custom bridge body" || !gotSound {
		t.Fatalf("bridge lost fields: title=%q message=%q sound=%v", gotTitle, gotMessage, gotSound)
	}
}

func TestRuntimeNotifyBridgeRejectsInvalidFieldTypesWhenCalledDirectly(t *testing.T) {
	runtime := goja.New()
	if err := InitJS(runtime); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{
		`notify____Inject({title: 42})`,
		`notify____Inject({message: false})`,
		`notify____Inject({sound: 'yes'})`,
		`notify____Inject({timeout: Infinity})`,
	} {
		if _, err := runtime.RunString(source); err == nil {
			t.Fatalf("%s unexpectedly passed", source)
		}
	}
}
