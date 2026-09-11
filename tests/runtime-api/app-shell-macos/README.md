# App Shell macOS live fixture

This fixture exercises the P0 App Mode contract with one long-lived
JavaScript Execution and one Custom UI main window. Run it from the repository
root using the current `dist/opendesk` build:

```bash
OPENDESK_APP_SHELL_EVIDENCE_DIR="$PWD/.runtime/tests/app-shell/macos-live" \
  ./dist/opendesk -app tests/runtime-api/app-shell-macos -console-mode script \
  -log-dir .runtime/tests/app-shell/macos-live/run
```

The evidence directory records the Execution ID, `main.js` start count, action
events, activation window identity, and programmatic-close result. A complete
macOS live pass also captures the real `NSStatusItem` menu while checking:

1. the template PNG is proportionally rendered at 18 points, remains clear and
   unclipped, and uses the system tint; record both light and dark appearance
   screenshots when the current desktop can be switched and restored safely;
2. the action label and enabled state change after **Run same-runtime action**;
3. the action disappears and returns after **Toggle action visibility**;
4. the user's window close button hides the window without terminating either
   the main process or UI host;
5. a second invocation of the command exits after ACK and reopens the same
   `hostPid` and `nativeWindowId`, with `main-executions.txt` still equal to 1;
6. **Programmatic close and quit** returns `status: "closed"`, then removes the
   menu-bar item and terminates both processes.

Screenshots and controller output are runtime artifacts and belong under the
top-level `.runtime/tests/app-shell/` directory, not in this fixture directory.

Windows has target-OS executable contract tests in `pkg/appshell`:

```powershell
go test ./pkg/appshell -run 'TestWindows(SingleInstance|Tray|NativeHost)' -count=1
```

Compiling those tests on macOS is only a cross-build check; it is not Windows
Notification Area or named-pipe live evidence.
