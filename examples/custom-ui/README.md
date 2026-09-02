# Custom UI examples

Run an example directly from the repository root (`/Users/mac/Documents/workspace/clawdesk`); the adjacent strict `clawdesk.runtime.json` enables UI without extra flags. For the fixed installed App, first run `bash scripts/install_macos_cli.sh` as described in [`QUICKSTART.md`](../../QUICKSTART.md#可选安装全局-opendesk-命令), then use `opendesk` below. The two toolbar examples share a small controller, while keeping the data that users normally change close to each scenario.

For the horizontal action toolbar, use this one-line command:

```bash
./dist/opendesk -ui -script examples/custom-ui/toolbar-horizontal-actions.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-horizontal-actions
```

For the vertical customer-service quick replies, use this one-line command:

```bash
./dist/opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies
```

To compare automatic wrapping, two columns, and at-most-two-rows in three real native toolbars, use this one-line command:

```bash
opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo
```

For the minimal five-button toolbar, run `make build` once from the repository root to refresh both `dist/opendesk` and `dist/opendesk-ui-host`, then start it with this one-line command:

```bash
./dist/opendesk -script examples/custom-ui/minimal-five-button-toolbar.js
```

To browse all 150 built-in icons in one real Runtime Custom UI window, run this one-line command from the repository root:

```bash
./dist/opendesk -ui -script examples/custom-ui/icon-catalog.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-catalog
```

The catalog reads the canonical `pkg/customui/assets/toolbar-icons-v1.json` registry and loads the generated, Runtime-safe `icon-catalog.html`. The single scrollable control tree declares all 150 buttons at once in a 10-column by 15-row grid; it has no pagination and is not a 30/32-slot `FloatingWindow` pager. The window starts in the upper-left safe area and remains draggable. Cards use smaller icons and show only the icon name; repeated row numbers and “click to copy code” hints are kept out of the visual grid while remaining in the button tooltip/Accessibility name. Hover for the full icon name and copy hint. Click an icon to copy one ready-to-paste `FloatingWindow.addButton()` line to the system clipboard, mark the selected card, and update the visible status. Close the window only when finished. The HTML contains no business script or remote resource; the JavaScript controller owns all 150 listeners and Runtime calls.

For a searchable, offline catalog with large/compact display modes, copy controls, and JSON export, open the committed, self-contained file:

```text
docs/custom-ui/icon-catalog.html
```

It is a durable documentation asset and does not depend on `.runtime/`. Maintainers can regenerate the HTML, contact sheet, and manifest under `.runtime/tests/custom-ui/icon-catalog/` with:

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

After checking that temporary output, publish the generated HTML with `bash scripts/render_custom_ui_icon_catalog.sh --publish`. This updates both the durable browser catalog at `docs/custom-ui/icon-catalog.html` and the restricted Runtime view at `examples/custom-ui/icon-catalog.html`. The browser catalog is only a selection aid; run `icon-catalog.js` above for the real Custom UI window, controller, clipboard, scroll and lifecycle path.

For the file-backed recording console, run this one-line command from the repository root:

```bash
./dist/opendesk -ui -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

`recording-console.js` starts with the self-contained `recording-console/tray.html` control tray: its inline style block is automatically split into `content.html` and `content.css` before the Custom UI window is created. `recording-console/recorder.html` / `recorder.css` is the expanded settings page opened with “展开”; both contain only constrained markup and stable control IDs, while the JavaScript controller owns shared state and listeners. The blank native title avoids duplicating the HTML header. Its start, pause and stop buttons emit explicit UI intents only—Recorder sessions must still be created and stopped through the MCP tools in [`docs/api/recorder.md`](../../docs/api/recorder.md). The Screenshot button is real and writes PNGs below the declared `.runtime` log directory.

For fast browser-only layout work on the tray, run this one-line command from the repository root, then open the printed `/tray.html` URL:

```bash
node examples/custom-ui/recording-console/serve-tray-preview.js --host 127.0.0.1 --port 8000
```

The preview serves the self-contained `tray.html`, so `http://127.0.0.1:8000/tray.html` renders the same markup and CSS as the Custom UI tray. It is intentionally layout-only: buttons have no Recorder callbacks there. To use the current LAN address, explicitly pass `--host 192.168.30.104`; use another port such as `8001` if the current server already owns `8000`.

Do not open `tray.html` or `recorder.html` with `file://` when testing the Custom UI example: those files deliberately contain layout only. Run the command above so `recording-console.js` creates both native windows and binds their callbacks. Every small-tray operation writes a concise `RECORDER_TRAY_ACTION={...}` record to the terminal and `.runtime/examples/custom-ui/recording-console/stdout.log`; `RECORDER_UI_INTENT={...}` is the separate recorder-intent record.

Click start/pause twice, stop once, and each remaining button once. The horizontal example emits `HORIZONTAL_TOOLBAR_ACTION` records for `start`, `pause`, `stop`, `settings`, `send`, and `timer`; stop restores startPause to `play.fill` / `开始` / inactive. The toolbar stays open until the user closes it.

Each example uses a JavaScript controller, waits for the native window to become visible, and remains alive until the user closes it. None uses an automatic close timer.

- `toolbar-example.js` is the shared controller. It validates the small JavaScript/JSON configuration, maps it to `FloatingWindow`, reports callback errors, and waits for close. It is not run directly.
- `toolbar-horizontal-actions.js` keeps orientation, buttons, and action names in a JavaScript object. Its `actionHandlers` remain JavaScript because they can call Runtime APIs and update state.
- `toolbar-vertical-quick-replies.js` loads the quick-reply data and uses one callback to copy the chosen reply.
- `toolbar-vertical-quick-replies.json` is the customer-content and layout-intent source of truth: edit its `toolbar.orientation` and ordered `buttons[].id` / `label` / `icon` / `reply` fields. It is data consumed by the JavaScript controller, not a second native layout API; the existing `FloatingWindow` constructor and `addButton()` validation still reject unsupported orientation, icon, count and ID values.
- `floating-toolbar-wrap-demo.js` plus `floating-toolbar-wrap-demo.json` opens three interactive native toolbars together: `maxWidth: 252` (five plus one), `maxColumns: 2` (two plus two plus one), and `maxRows: 2` (four plus three). Edit the adjacent JSON to try other limits. Click an icon to toggle its active state, then close all three windows to finish. Its `FLOATING_TOOLBAR_WRAP_DEMO` records show the selected layout and button.
- `minimal-five-button-toolbar.js` is the short standalone Button-first example. It opens five native 40×40pt SF Symbol buttons in declaration order and never closes on a timer.
- `icon-catalog.js` plus generated `icon-catalog.html` opens one scrollable Custom UI window whose control tree contains all 150 icon buttons; clicks copy a minimal `addButton()` line, mark the selected card, and log the icon plus usage.
- `panel.js` and `form.js` show when to use lower-level `ui.createWindow()`.
- `floating-recording-toolbar.js` is a lower-level custom HTML/CSS example, not the default simple-toolbar API.
- `recording-console.js` plus self-contained `recording-console/tray.html` is the default small recording tray; `recording-console/recorder.html` and `recording-console/recorder.css` are its expanded settings page.

The vertical toolbar has a documented five-button maximum. The sixth button is rejected with `INVALID_SPEC`; it does not wrap into a second column or create an over-height window.

If a callback appears not to run, look for the matching `HORIZONTAL_TOOLBAR_ACTION` or `VERTICAL_QUICK_REPLY_SELECTED` console record. `*_ERROR` records include the structured `UI_CALLBACK_FAILED` context. Native single-flight and visual acceptance are covered separately by `./scripts/test_runtime_apis.sh custom-ui`.
