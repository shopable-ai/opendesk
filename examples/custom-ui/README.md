# Custom UI examples

## Reusable UI component states

`ui-components.js` 是面向组件作者的 HTML/CSS 状态画廊：它集中展示 Select 的当前值和
disabled、Input 的 placeholder/filled/invalid、Button 的 normal/busy/disabled/error，
并把状态变化、可访问性 readback 和关闭生命周期写入 Runtime 日志。结构和主题样式分别
位于 `ui-components/panel.html` 与 `ui-components/panel.css`；它们是受限内容，不包含
业务脚本。组件规范见 [`docs/custom-ui/theme-guide.md`](../../docs/custom-ui/theme-guide.md)。

从仓库根目录直接运行：

```bash
./opendesk -ui -script examples/custom-ui/ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/ui-components
```

它是 `manual` 示例，不会自动关闭窗口，也不会注入鼠标或键盘输入。普通示例成功不等于
视觉通过：请按主题规范在真实窗口中检查内容自适应、留白、换行、focus ring 和 select
弹出菜单的 host 差异。

## Native UI component states

`native-ui-components.js` 是独立的 Native track：所有控件都由 `FloatingWindow` 的
真实 AppKit/WinForms peer 绘制，覆盖 Label、Switch、Checkbox、Input、Select、
SegmentedControl、Slider、Progress 以及 Button 的 default/busy/active+badge/error/
disabled。Native 没有 CSS，也没有独立的 success 或 invalid 字段；示例在原生 Label
中写明这些限制，并通过 `getButtonState()` / `getControlState()` 输出 Accessibility
和 bounds readback。

从仓库根目录直接运行：

```bash
./opendesk -ui -script examples/custom-ui/native-ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/native-ui-components
```

Native `FloatingWindow` 不依赖 WebView2；窗口会保持打开直到用户关闭。视觉验收请用
真实窗口检查 fixed geometry、native hover/pressed、Input 点击后的键盘焦点、Select
展开菜单、禁用/错误对比度和长 Label 是否截断；HTML 的截图不能代替 Native 证据。

运行两组自动化检查（从仓库根目录）：

```bash
make check-custom-ui-components
```

检查日志写入 `.runtime/tests/custom-ui/ui-components/`；正式 Runtime gate 的 HTML 与
Native 截图写入 `.runtime/tests/runtime-api/<run-id>/runtime-logs/custom-ui/`。

Run an example directly from the repository root (`/Users/mac/Documents/workspace/clawdesk`); the adjacent strict `clawdesk.runtime.json` enables UI without extra flags. For the fixed installed App, first run `bash scripts/install_macos_cli.sh` as described in [`QUICKSTART.md`](../../QUICKSTART.md#可选安装全局-opendesk-命令), then use `opendesk` below. The horizontal example uses a small helper controller; the vertical and focused examples remain self-contained.

On Windows, build the paired runtime and self-contained native sidecar from the repository root with `pwsh -File scripts/build_windows_app.ps1`. For every `./opendesk` command below, use `.\dist\opendesk.exe` and keep the same repository-relative script arguments. `FloatingWindow` uses native WinForms controls without WebView2; `ui.createWindow()` requires the Microsoft Edge WebView2 Runtime and fails explicitly with `UNSUPPORTED_CAPABILITY` when it is unavailable.

For the horizontal action toolbar, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/toolbar-horizontal-actions.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-horizontal-actions
```

For the vertical customer-service quick replies, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/quick-replies/main.js -console-mode script -log-dir .runtime/examples/custom-ui/quick-replies
```

This example uses only the framework-level `position: { mode: "anchor", ... }` positioning mode to open directly at the active display work area's right-center edge with a 16pt margin. It deliberately declares no `x/y`; the two initial positioning modes are mutually exclusive.

To compare automatic wrapping, two columns, and at-most-two-rows in three real native toolbars, use this one-line command:

```bash
./opendesk -ui -script examples/custom-ui/toolbar-wrap/main.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-wrap
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
./opendesk -ui -script examples/custom-ui/icon-browser/main.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-browser
```

The icon list reads the canonical `pkg/customui/assets/toolbar-icons-v1.json` registry and loads the generated, Runtime-safe `icon-browser/panel.html`. The single scrollable control tree declares all 160 buttons at once in a 10-column by 16-row grid; it has no pagination and is not a 30/32-slot `FloatingWindow` pager. Its scenario-first IDs make the common choices directly searchable: `ai.assistant`, `ai.generate`, `ai.analyze`, `ai.search`, `automation.run`, `automation.schedule`, `automation.trigger`, `automation.configure`, `automation.review`, and `automation.approve`. The window starts in the upper-left safe area and remains draggable. Cards use smaller icons and show only the icon name; repeated row numbers and “click to copy code” hints are kept out of the visual grid while remaining in the button tooltip/Accessibility name. Hover for the full icon name and copy hint. Click an icon to copy one ready-to-paste `FloatingWindow.addButton()` line to the system clipboard, mark the selected card, and update the visible status. Close the window only when finished. The HTML contains no business script or remote resource; the JavaScript controller owns all 160 listeners and Runtime calls.

For a searchable, offline catalog with large/compact display modes, copy controls, and JSON export, open the committed, self-contained file:

```text
docs/custom-ui/icon-list.html
```

It is a durable documentation asset and does not depend on `.runtime/`. Maintainers can regenerate the HTML, contact sheet, and manifest under `.runtime/tests/custom-ui/icon-list/` with:

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

After checking that temporary output, publish the generated HTML with `bash scripts/render_custom_ui_icon_catalog.sh --publish`. This updates both the durable browser icon list at `docs/custom-ui/icon-list.html` and the restricted Runtime view at `examples/custom-ui/icon-browser/panel.html`. The browser list is only a selection aid; run `icon-browser/main.js` above for the real Custom UI window, controller, clipboard, scroll and lifecycle path.

Recorder control surfaces and their UI assets now live under `workflows/human-to-recipe/`; the released Recorder implementation is owned by `internal/recorderbundle/`. Script Runner is owned by `apps/opendesk/`. They are intentionally absent from this teaching directory and from the Example Explorer catalog. See the workflow README for their explicit, side-effectful commands.

The unrelated horizontal toolbar example emits `HORIZONTAL_TOOLBAR_ACTION` records for `start`, `pause`, `stop`, `settings`, `send`, and `timer`; stop restores startPause to `play.fill` / `开始` / inactive. Each example stays open until the user closes it.

Each example uses a JavaScript controller, waits for the native window to become visible, and remains alive until the user closes it. None uses an automatic close timer.

- `support/toolbar-example.js` is the horizontal actions example's shared helper. It validates the JavaScript configuration, maps it to `FloatingWindow`, reports callback errors, and waits for close. It is not run directly; the vertical quick-reply example is intentionally self-contained.
- `toolbar-horizontal-actions.js` keeps orientation, buttons, and action names in a JavaScript object. Its `actionHandlers` remain JavaScript because they can call Runtime APIs and update state.
- `quick-replies/main.js` loads `quick-replies/config.json` and uses one ordinary action callback to copy the chosen reply. It does not set a persistent active/selected state after a click.
- `quick-replies/config.json` is the customer-content and layout-intent source of truth: edit its `toolbar.orientation`, framework `toolbar.position` anchor union, and ordered `buttons[].id` / `label` / `icon` / `reply` fields. It is data consumed by the JavaScript controller, not a second native layout API; anchor mode must not also declare `x/y`, and `FloatingWindow` validates that shared window contract together with toolbar-specific orientation/icon/count/ID constraints.
- `toolbar-wrap/main.js` plus `toolbar-wrap/config.json` opens three interactive native toolbars together: `maxWidth: 252` (five plus one), `maxColumns: 2` (two plus two plus one), and `maxRows: 2` (four plus three). Edit the adjacent JSON to try other limits. Click an icon to toggle its active state, then close all three windows to finish. Its `FLOATING_TOOLBAR_WRAP_DEMO` records show the selected layout and button.
- `five-button-toolbar.js` is the focused standalone Button-first example. It directly uses `new FloatingWindow()` and five `addButton()` calls, opens five native 40×40pt icon buttons in declaration order, and never closes on a timer.
- `floating-toolbar-primitives.js` is the minimal public primitive example: two action groups separated by a native line, a fixed spacer before Help, `getState()` before / after show, and move / close lifecycle logs. It has no business persistence or global shortcut ownership.
- `floating-toolbar-status-label.js` shows the bounded visible Label primitive beside two icon buttons. Its 144pt × 40pt frame remains fixed while `text`, horizontal `alignment`, explicit `verticalAlignment`, and semantic `tone` update; `renderedTextBounds` demonstrates native horizontal/vertical centering without moving the window or its action targets. From the repository root, run `./opendesk -ui -script examples/custom-ui/floating-toolbar-status-label.js -console-mode script`.
- `floating-toolbar-controls.js` demonstrates Switch, Checkbox, Input, Select, Slider, SegmentedControl, standalone Progress and an attached Button badge in one fixed-geometry native toolbar. It never injects mouse or keyboard input and stays open until the user closes it.
- `custom-image-icons.js` combines `original` and `template` local PNG declarations with a built-in icon, then changes that built-in icon to a local image at runtime.
- `icon-browser/main.js` plus generated `icon-browser/panel.html` opens one scrollable Custom UI window whose control tree contains all 160 default icon buttons; it exposes scenario-first AI, unattended-automation, and human-in-the-loop automation choices alongside common SF Symbols. Clicks copy a minimal `addButton()` line, mark the selected card, and log the icon plus usage.
- `panel.js` and `form.js` show when to use lower-level `ui.createWindow()`.

The vertical toolbar has a documented five-button maximum. The sixth button is rejected with `INVALID_SPEC`; it does not wrap into a second column or create an over-height window.

If a callback appears not to run, look for the matching `HORIZONTAL_TOOLBAR_ACTION` or `VERTICAL_QUICK_REPLY_COPIED` console record. `*_ERROR` records include the structured `UI_CALLBACK_FAILED` context. Native single-flight and visual acceptance are covered separately by `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`.
