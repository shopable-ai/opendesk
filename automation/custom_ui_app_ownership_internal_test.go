package automation

import (
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
