# Custom UI examples

Run an example directly from the repository root (`/Users/mac/Documents/workspace/clawdesk`); the adjacent strict `clawdesk.runtime.json` enables UI without extra flags. For the fixed installed App, first run `bash scripts/install_macos_cli.sh` as described in [`QUICKSTART.md`](../../QUICKSTART.md#可选安装全局-opendesk-命令), then use `opendesk` below. The horizontal example uses a small helper controller; the vertical and focused examples remain self-contained.

For the horizontal action toolbar, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/toolbar-horizontal-actions.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-horizontal-actions
```

For the vertical customer-service quick replies, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies
```

This example uses only the framework-level `position: { mode: "anchor", ... }` positioning mode to open directly at the active display work area's right-center edge with a 16pt margin. It deliberately declares no `x/y`; the two initial positioning modes are mutually exclusive.

To compare automatic wrapping, two columns, and at-most-two-rows in three real native toolbars, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo
```

For the focused five-button toolbar, use the maintainer-prepared root `opendesk` and sibling `opendesk-ui-host`, then start it with this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script -log-dir .runtime/examples/custom-ui/five-button-toolbar
```

The example uses only the documented `FloatingWindow` API: five direct `addButton()` calls, a start/pause state transition, stop reset, and structured `FIVE_BUTTON_TOOLBAR_ACTION` / `FIVE_BUTTON_TOOLBAR_ERROR` records. Test-only gates and counters stay in the formal test instead of introducing an example-side wrapper API.

For the compact native toolbar primitives—Button, Separator, fixed Spacer, shared WindowState, and move / close lifecycle events—run this one-line command from the repository root:

```bash
./opendesk -ui -script examples/custom-ui/floating-toolbar-primitives.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-primitives
```

The example remains an icon-first action toolbar: the separator and spacer are noninteractive native structure, not disabled buttons. Dragging prints a `TOOLBAR_MOVE` state event; closing prints `TOOLBAR_CLOSE`. It intentionally does not persist the position—use `AppStorage` in application code only when that policy is desired.

For the first-class native settings controls, attached Button badge, and standalone Progress, run this one-line command from the repository root:

```bash
./opendesk -ui -script examples/custom-ui/floating-toolbar-controls.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-controls
```

The example keeps one window open for direct interaction. Switch and Checkbox remain semantically distinct; Select and SegmentedControl use bounded immutable options; Slider uses a fixed range; Progress can change between determinate and indeterminate. `show()` does not activate the host. Only a direct user gesture into the native Input activates keyboard focus, and no script-side focus API is exposed.

To mix script-local PNG images with a built-in icon, and compare color-preserving `original` with native-tinted `template` rendering, run this one-line command from the repository root:

```bash
./opendesk -ui -script examples/custom-ui/custom-image-icons.js -console-mode script -log-dir .runtime/examples/custom-ui/custom-image-icons
```

The two custom paths are resolved relative to `custom-image-icons.js`, not the shell working directory. The Settings callback also demonstrates replacing a built-in icon with a validated local PNG after the window is visible.

To browse all 160 default icons in one real Runtime Custom UI window, run this one-line command from the repository root:

```bash
./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-list
```

The icon list reads the canonical `pkg/customui/assets/toolbar-icons-v1.json` registry and loads the generated, Runtime-safe `icon-list.html`. The single scrollable control tree declares all 160 buttons at once in a 10-column by 16-row grid; it has no pagination and is not a 30/32-slot `FloatingWindow` pager. Its scenario-first IDs make the common choices directly searchable: `ai.assistant`, `ai.generate`, `ai.analyze`, `ai.search`, `automation.run`, `automation.schedule`, `automation.trigger`, `automation.configure`, `automation.review`, and `automation.approve`. The window starts in the upper-left safe area and remains draggable. Cards use smaller icons and show only the icon name; repeated row numbers and “click to copy code” hints are kept out of the visual grid while remaining in the button tooltip/Accessibility name. Hover for the full icon name and copy hint. Click an icon to copy one ready-to-paste `FloatingWindow.addButton()` line to the system clipboard, mark the selected card, and update the visible status. Close the window only when finished. The HTML contains no business script or remote resource; the JavaScript controller owns all 160 listeners and Runtime calls.

For a searchable, offline catalog with large/compact display modes, copy controls, and JSON export, open the committed, self-contained file:

```text
docs/custom-ui/icon-list.html
```

It is a durable documentation asset and does not depend on `.runtime/`. Maintainers can regenerate the HTML, contact sheet, and manifest under `.runtime/tests/custom-ui/icon-list/` with:

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

After checking that temporary output, publish the generated HTML with `bash scripts/render_custom_ui_icon_catalog.sh --publish`. This updates both the durable browser icon list at `docs/custom-ui/icon-list.html` and the restricted Runtime view at `examples/custom-ui/icon-list.html`. The browser list is only a selection aid; run `icon-list.js` above for the real Custom UI window, controller, clipboard, scroll and lifecycle path.

For the file-backed recording console, run this one-line command from the repository root:

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

`recording-console.js` is a real control surface for the execution-owned [Recorder Runtime](../../docs/api/recorder-runtime.md), not an MCP intent mock. Clicking “开始录制” is the immediate authorization for this capture and starts a three-second start-context period. During that period, focus the intended starting window; only then does the controller retain its PID and title as provenance and start the listener, so the focusing click is not recorded. Capture is desktop-global after startup: the user may switch windows and applications without ending the session. The tray exposes visible prepare, capture, save, actions, generate and run stages. “暂停录制／继续录制” checks `status().captureState` and dispatches the explicit `session.pause()` or `session.resume()` method; resume can occur in any window. Pausing keeps the native listener and lease, so stop before sensitive work or a long interruption.

“停止并保存” calls `session.stop()` once, displays full or partial save details, then passes the saved directory to the existing `Recorder.buildActions()`. “生成脚本” is enabled only for ready actions and calls the existing `Recorder.generateScript()` after a separate click. Once a candidate exists the same control becomes “重新生成”; another explicit click clears the prior in-memory candidate/run view and repeats `generateScript()` plus `File.read()` from the unchanged ready actions. The details window reads the returned `scriptFile` with `File.read()` into a scrollable, selectable multi-line preview; “复制脚本” uses the Runtime clipboard API and does not grant the HTML direct clipboard access.

While capture is active, every Custom UI button click first passes its original event to `session.excludeControlClick(event)`. Recorder writes the matched native event IDs into an explicit `RECORDER_CONTROL_CLICK` raw boundary; Actions excludes only those references and never guesses from control coordinates. If that boundary cannot be established, the listener can still stop safely but the controller does not build or generate Actions. A saved blocked result remains a warning state: the tray shows the first structured issue and the details artifact card shows its `code`, `eventId`, and message with generation disabled. Bounded ≤4-point libuiohook drag jitter is normalized as an auditable click; a real drag remains blocked. Every non-pause inter-action gap is emitted as a fixed `sleep` call: recorded timing is kept at 1× speed and clamped to the default 500ms–30s range. The generation API exposes the timing bounds and speed multiplier for deliberate system or AI adjustment.

Generation still does not replay anything. A separate “试运行” click first leaves a three-second preparation interval, then launches the returned file as a Fresh Run through the formal `Command.run()` → `./dist/opendesk -script <scriptFile> -console-mode script` chain; it never uses `eval` or interprets actions. Recorded PID and title remain candidate provenance and never block execution; the generated script still enforces the recorded OS, while the operator uses that interval to restore the intended starting desktop and application state. The controller shows running, exit code, bounded stdout/stderr and the child log directory. Exit code 0 proves only that the child Runtime completed, not that the target application's business result is correct, and the immutable candidate remains `verification: "not-run"`. “取消试运行” aborts preparation or the execution-owned process group while keeping the console open. Opening details temporarily hides the always-on-top tray so the two surfaces do not overlap; “收起” or “关闭详情” restores the tray without ending the flow. Closing the main tray cancels an in-flight run before teardown. No run happens without the user's explicit click.

“重置界面” clears the controller's target, saved/actions/generated/source/run/error references and returns to ready. It does not delete immutable recording files and does not call `session.stop()` again after a finalized session. The user can then record again; after a run succeeds, fails or is canceled, the same generated source also remains available for another explicit run until reset. Start, pause/resume, stop, generate and run are single-flight; cancel-run is the only deliberate interruption path. Capture cancel, window close, script failure and host/execution teardown still converge on the existing Recorder cleanup. Errors and partial paths remain visible in both surfaces.

Keyboard capture is off by default. For an explicitly non-sensitive keyboard fixture only, prefix the same command with `OPENDESK_RECORDER_CAPTURE_KEYBOARD=1`. The HTML files contain only constrained markup and stable IDs; `recording-console/controller.js` owns both windows' shared UI state and calls the one public Runtime object.

For fast browser-only layout work on the tray, run this one-line command from the repository root, then open the printed `/tray.html` URL:

```bash
node examples/custom-ui/recording-console/serve-tray-preview.js --host 127.0.0.1 --port 8000
```

The preview serves `tray.html` with the adjacent `tray.css`, so `http://127.0.0.1:8000/tray.html` renders the same initial layout as the Custom UI tray. It is intentionally static: buttons have no Recorder callbacks and it is not Runtime or lifecycle evidence. To expose it on a LAN, pass the desired local address explicitly; use another port such as `8001` if the current server already owns `8000`.

Do not open `tray.html` or `recorder.html` with `file://` when testing the Custom UI example: those files deliberately contain layout only. Run the exact OpenDesk command above so `recording-console.js` creates native windows and binds real callbacks. State, user action and close records use `RECORDER_UI_STATE=...`, `RECORDER_UI_ACTION=...` and `RECORDER_UI_CLOSE=...` in the declared log directory.

The unrelated horizontal toolbar example emits `HORIZONTAL_TOOLBAR_ACTION` records for `start`, `pause`, `stop`, `settings`, `send`, and `timer`; stop restores startPause to `play.fill` / `开始` / inactive. Each example stays open until the user closes it.

Each example uses a JavaScript controller, waits for the native window to become visible, and remains alive until the user closes it. None uses an automatic close timer.

- `toolbar-example.js` is the horizontal actions example's shared helper. It validates the JavaScript configuration, maps it to `FloatingWindow`, reports callback errors, and waits for close. It is not run directly; the vertical quick-reply example is intentionally self-contained.
- `toolbar-horizontal-actions.js` keeps orientation, buttons, and action names in a JavaScript object. Its `actionHandlers` remain JavaScript because they can call Runtime APIs and update state.
- `toolbar-vertical-quick-replies.js` loads the quick-reply data and uses one ordinary action callback to copy the chosen reply. It does not set a persistent active/selected state after a click.
- `toolbar-vertical-quick-replies.json` is the customer-content and layout-intent source of truth: edit its `toolbar.orientation`, framework `toolbar.position` anchor union, and ordered `buttons[].id` / `label` / `icon` / `reply` fields. It is data consumed by the JavaScript controller, not a second native layout API; anchor mode must not also declare `x/y`, and `FloatingWindow` validates that shared window contract together with toolbar-specific orientation/icon/count/ID constraints.
- `floating-toolbar-wrap-demo.js` plus `floating-toolbar-wrap-demo.json` opens three interactive native toolbars together: `maxWidth: 252` (five plus one), `maxColumns: 2` (two plus two plus one), and `maxRows: 2` (four plus three). Edit the adjacent JSON to try other limits. Click an icon to toggle its active state, then close all three windows to finish. Its `FLOATING_TOOLBAR_WRAP_DEMO` records show the selected layout and button.
- `five-button-toolbar.js` is the focused standalone Button-first example. It directly uses `new FloatingWindow()` and five `addButton()` calls, opens five native 40×40pt icon buttons in declaration order, and never closes on a timer.
- `floating-toolbar-primitives.js` is the minimal public primitive example: two action groups separated by a native line, a fixed spacer before Help, `getState()` before / after show, and move / close lifecycle logs. It has no business persistence or global shortcut ownership.
- `floating-toolbar-status-label.js` shows the bounded visible Label primitive beside two icon buttons. Its 144pt × 40pt frame remains fixed while `text`, horizontal `alignment`, explicit `verticalAlignment`, and semantic `tone` update; `renderedTextBounds` demonstrates native horizontal/vertical centering without moving the window or its action targets. From the repository root, run `./opendesk -ui -script examples/custom-ui/floating-toolbar-status-label.js -console-mode script`.
- `floating-toolbar-controls.js` demonstrates Switch, Checkbox, Input, Select, Slider, SegmentedControl, standalone Progress and an attached Button badge in one fixed-geometry native toolbar. It never injects mouse or keyboard input and stays open until the user closes it.
- `custom-image-icons.js` combines `original` and `template` local PNG declarations with a built-in icon, then changes that built-in icon to a local image at runtime.
- `icon-list.js` plus generated `icon-list.html` opens one scrollable Custom UI window whose control tree contains all 160 default icon buttons; it exposes scenario-first AI, unattended-automation, and human-in-the-loop automation choices alongside common SF Symbols. Clicks copy a minimal `addButton()` line, mark the selected card, and log the icon plus usage.
- `panel.js` and `form.js` show when to use lower-level `ui.createWindow()`.
- `floating-recording-toolbar.js` is a compatibility entry that reuses the same `recording-console/controller.js` and `Recorder` object; it no longer carries a simulated recording model.
- `recording-console.js` plus `recording-console/controller.js` is the default script-recorder entry and shared state coordinator; `tray.html` is its compact surface and `recorder.html` is its detailed surface.

The vertical toolbar has a documented five-button maximum. The sixth button is rejected with `INVALID_SPEC`; it does not wrap into a second column or create an over-height window.

If a callback appears not to run, look for the matching `HORIZONTAL_TOOLBAR_ACTION` or `VERTICAL_QUICK_REPLY_COPIED` console record. `*_ERROR` records include the structured `UI_CALLBACK_FAILED` context. Native single-flight and visual acceptance are covered separately by `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`.
