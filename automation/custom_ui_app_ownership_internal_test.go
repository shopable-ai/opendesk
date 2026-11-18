package automation

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/dop251/goja"
	"opendesk/pkg/appshell"
	"opendesk/pkg/customui"
)

// These tests inject a native-only event into the private owner queue. Public
// JavaScript cannot construct this transport event or the AppOwned marker.
func TestCustomUIInternalAppQuitRoutesSecondaryWindowAndNeverReachesListeners(t *testing.T) {
	for _, appMode := range []bool{false, true} {
		t.Run(map[bool]string{false: "script", true: "app"}[appMode], func(t *testing.T) {
			runtime := goja.New()
			delivered := []string{}
			callback, _ := goja.AssertFunction(runtime.ToValue(func(call goja.FunctionCall) goja.Value {
				delivered = append(delivered, call.Argument(0).ToObject(runtime).Get("type").String())
				return goja.Undefined()
			}))
			u := &CustomUIRuntime{runtime: runtime, queue: customui.NewEventQueue(8), listeners: map[uint64]customUIListener{1: {event: "*", callback: callback}}}
			quitCount := 0
			var shell *appshell.Shell
			if appMode {
				var err error
				shell, err = appshell.New(appshell.Manifest{SchemaVersion: 1, Version: "1.0.0", ID: "com.example.quit-test", Entry: "main.js", Window: appshell.WindowManifest{MainID: "main", CloseBehavior: "hide"}, Tray: appshell.TrayManifest{Enabled: true, PrimaryAction: appshell.ActionOpen, Icons: appshell.TrayIcons{MacOS: "tray.png", Windows: "tray.ico"}}}, nil)
				if err != nil {
					t.Fatal(err)
				}
				shell.SetQuitHook(func() { quitCount++ })
				u.appShell = &AppShellRuntime{shell: shell}
			}
			// Hide-on-close remains in force even for an app main window.
			if err := u.queue.Push(customui.Event{WindowID: "main", Type: "close", Reason: "user"}); err != nil {
				t.Fatal(err)
			}
			u.drainEvents(runtime)
			if appMode && (quitCount != 0 || shell.State() != appshell.StateRunning) {
				t.Fatal("hide-on-close requested quit")
			}
			for _, event := range []customui.Event{{WindowID: "secondary", Type: "appQuit"}, {WindowID: "secondary", Type: "appQuit"}, {WindowID: "secondary", Type: "resize"}} {
				if err := u.queue.Push(event); err != nil {
					t.Fatal(err)
				}
			}
			u.drainEvents(runtime)
			if len(delivered) != 2 || delivered[0] != "close" || delivered[1] != "resize" {
				t.Fatalf("public events = %v", delivered)
			}
			if appMode && (quitCount != 1 || shell.State() != appshell.StateQuitting) {
				t.Fatalf("secondary quit did not reach owner exactly once: count=%d state=%s", quitCount, shell.State())
			}
			if !appMode && quitCount != 0 {
				t.Fatal("script runtime requested App Mode quit")
			}
		})
	}
}

func TestCustomUIInternalAppOwnershipAppliesToAuxiliariesWithoutMainClosePolicy(t *testing.T) {
	shell, err := appshell.New(appshell.Manifest{SchemaVersion: 1, Version: "1.0.0", ID: "com.example.owner-test", Entry: "main.js", Window: appshell.WindowManifest{MainID: "main", CloseBehavior: "hide"}, Tray: appshell.TrayManifest{Enabled: true, PrimaryAction: appshell.ActionOpen, Icons: appshell.TrayIcons{MacOS: "tray.png", Windows: "tray.ico"}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, appMode := range []bool{false, true} {
		u := &CustomUIRuntime{}
		if appMode {
			u.appShell = &AppShellRuntime{shell: shell}
		}
		for _, id := range []string{"main", "recorder", "toolbar", "trusted", "notification", "dialog"} {
			spec := u.appWindowSpec(customui.WindowSpec{ID: id})
			if spec.AppOwned != appMode {
				t.Fatalf("%s appMode=%v AppOwned=%v", id, appMode, spec.AppOwned)
			}
			wantClose := ""
			if appMode && id == "main" {
				wantClose = "hide"
			}
			if spec.AppCloseBehavior != wantClose {
				t.Fatalf("%s close behavior=%q want=%q", id, spec.AppCloseBehavior, wantClose)
			}
		}
	}
}

// This private seam checks only error conversion, without invoking the public
// JavaScript API, a session, or a native UI host.
func TestCustomUIInternalErrorConversion(t *testing.T) {
	primaryCause := errors.New("native failure")
	cleanup := &customui.Error{Code: customui.CodeDriverFailure, Operation: "cleanup", WindowID: "cleanup-window", TargetID: "cleanup-target", Capability: "cleanup", Message: "cleanup failed"}
	for _, tc := range []struct {
		name   string
		code   string
		window string
		joined bool
	}{
		{"single", customui.CodeDriverFailure, "original-window", false},
		{"joined", customui.CodeDriverFailure, "original-window", true},
		{"joined-fallback-window", customui.CodeDriverFailure, "", true},
		{"canceled", customui.CodeCanceled, "", false},
		{"joined-canceled", customui.CodeCanceled, "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			cause := primaryCause
			if tc.code == customui.CodeCanceled {
				cause = context.Canceled
			}
			primary := &customui.Error{Code: tc.code, Operation: "native", WindowID: tc.window, TargetID: "target", Capability: "ui", Message: "primary failed", Cause: cause}
			var input error = primary
			if tc.joined {
				input = fmt.Errorf("outer context: %w", errors.Join(primary, cleanup))
			}
			converted := customUIOperationError(input, "closeAll", "fallback-window")
			for _, original := range []error{input, primary, cause} {
				if !errors.Is(converted, original) {
					t.Errorf("lost original error %q in %q", original, converted)
				}
			}
			if tc.joined {
				if !errors.Is(converted, cleanup) || !strings.Contains(converted.Error(), "cleanup failed") || !strings.Contains(converted.Error(), "outer context") {
					t.Errorf("lost joined cleanup or context: %v", converted)
				}
			}
			wantWindow := tc.window
			if wantWindow == "" {
				wantWindow = "fallback-window"
			}
			var structured *customui.Error
			if !errors.As(converted, &structured) || structured.Code != tc.code || structured.Operation != "closeAll" || structured.WindowID != wantWindow || structured.TargetID != "target" || structured.Capability != "ui" {
				t.Fatalf("incorrect structured metadata: %+v", structured)
			}
			runtime := goja.New()
			jsErr := customUIJSError(runtime, converted)
			for key, want := range map[string]string{"code": tc.code, "operation": "closeAll", "windowId": wantWindow, "targetId": "target", "capability": "ui"} {
				if got := jsErr.Get(key).String(); got != want {
					t.Errorf("%s = %q, want %q", key, got, want)
				}
			}
			if got := jsErr.Get("message").String(); got != converted.Error() {
				t.Errorf("message = %q, want %q", got, converted.Error())
			}
			if primary.Operation != "native" || primary.WindowID != tc.window {
				t.Fatal("mutated original error")
			}
			if !tc.joined {
				want := *primary
				want.Operation, want.WindowID = "closeAll", wantWindow
				if converted.Error() != want.Error() {
					t.Errorf("single error message changed: %q", converted)
				}
			}
		})
	}
	plain := errors.New("plain error")
	for _, input := range []error{nil, plain, context.Canceled, errors.Join(plain, context.Canceled)} {
		if got := customUIOperationError(input, "closeAll", "window"); got != input {
			t.Errorf("unstructured error changed: %v", got)
		}
	}
}
