---
title: Examples 快速索引
description: OpenDesk examples 与 Runtime 测试脚本的文件链接和可复制运行命令。
order: 3
---

# Examples 快速索引

所有命令从仓库根目录执行。示例和 Runtime 测试由 OpenDesk 启动，不要用 Node 直接运行。
本页是正式示例入口（`docs/api/examples/`，不是另一套 `docs/examples/`）。基础示例已归入
`examples/runtime/`；旧路径只保留兼容转发，不再作为本页推荐路径。

**单项接口组测试与示例验收是两件事。** `single/<family>.js` 只执行该组已有 unit 用例，
不自动运行示例、不证明真实桌面效果，也不包含该组全部专项 gate。需要当前构建与用例要求的
平台/fixture；缺少资源不能当作通过。每组的独立脚本、完整命令与边界见
[单项测试脚本索引](single-tests.md)。`unit/*.test.js` 是被加载的断言源，不是直接启动入口。

下面保留每个示例的运行命令；相关单项测试和专项/人工检查分别列出。涉及真实输入、剪贴板、
设备或应用的示例仍须按原来的权限与确认要求运行；不要批量执行整个示例目录。

反引号多行字符串及 ES2015–ES2023 的选定作者基线见
[JavaScript Runtime](../runtime.md#javascript-语言基线)；版本能力由一个统一 language gate 验证，
对应源码为 [javascript-language.js](../../../tests/runtime-api/javascript-language.js)，不为 ES6、ES7、ES8
分别复制测试文件。

## 目录

- [基础 Runtime 与数据](../../../examples/runtime/)
- [SQLite Runtime API](../../../examples/sqlite/)
- [Custom UI](../../../examples/custom-ui/)
- [macOS 权限与真实应用](../../../examples/mac/)
- [AI recipe](../../../examples/ai-cli/)
- [Native Extension](../../../examples/native-extensions/)
- [完整 Runtime 测试实现](../../../tests/runtime-api/)
- [完整测试目录说明](../../quality/developer-test-catalog.md)

## 基础 Runtime 与数据

- `api-quickstart.js` — [源码](../../../examples/runtime/api-quickstart.js)；运行：
  `./opendesk -script examples/runtime/api-quickstart.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script`。
- `environment.js` — [源码](../../../examples/runtime/environment.js)；运行：
  `./opendesk -script examples/runtime/environment.js -console-mode script`；接口组检查：
  [单项脚本 system.js](../../../tests/runtime-api/single/system.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/system.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=environment ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `file-json.js` — [源码](../../../examples/runtime/file-json.js)；运行：
  `./opendesk -script examples/runtime/file-json.js -console-mode script`；接口组检查：
  [单项脚本 file-json.js](../../../tests/runtime-api/single/file-json.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/file-json.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=file-json ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `command.js` — [源码](../../../examples/command.js)；运行：
  `./opendesk -script examples/command.js -console-mode script`；接口组检查：
  [单项脚本 command.js](../../../tests/runtime-api/single/command.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/command.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=command ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `path.js` — [源码](../../../examples/runtime/path.js)；运行：
  `./opendesk -script examples/runtime/path.js -console-mode script`；检查：
  [单项脚本 path.js](../../../tests/runtime-api/single/path.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/path.js -console-mode script`。
- `file.js` — [源码](../../../examples/file.js)；运行：
  `./opendesk -script examples/file.js -console-mode script`；检查：
  [单项脚本 file.js](../../../tests/runtime-api/single/file.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script`。
- `appStorage.js` — [源码](../../../examples/appStorage.js)；运行：
  `./opendesk -script examples/appStorage.js -console-mode script`；检查：
  [单项脚本 storage.js](../../../tests/runtime-api/single/storage.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/storage.js -console-mode script`。
- `console.js` — [源码](../../../examples/console.js)；运行：
  `./opendesk -script examples/console.js -console-mode script`；检查：
  [单项脚本 console.js](../../../tests/runtime-api/single/console.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/console.js -console-mode script`。
- `globalThis.js` — [源码](../../../examples/globalThis.js)；运行：
  `./opendesk -script examples/globalThis.js -console-mode script`；检查：
  [单项脚本 globals.js](../../../tests/runtime-api/single/globals.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/globals.js -console-mode script`。
- `promise.js` — [源码](../../../examples/promise.js)；运行：
  `./opendesk -script examples/promise.js -console-mode script`；检查：
  [单项脚本 globals.js](../../../tests/runtime-api/single/globals.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/globals.js -console-mode script`；异步跨栈场景仍由正式 smoke gate 准备 fixture，不能把 `async-lifecycle.js` 单独启动当作通过。
- `sleep.js` — [源码](../../../examples/sleep.js)；运行：
  `./opendesk -script examples/sleep.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script`。
- `timer.js` — [源码](../../../examples/timer.js)；运行：
  `./opendesk -script examples/timer.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script`。
- `page.js` — [源码](../../../examples/page.js)；运行：
  `./opendesk -script examples/page.js -console-mode script`；检查：
  [单项脚本 page.js](../../../tests/runtime-api/single/page.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/page.js -console-mode script`。
- `page.waitfor.js` — [源码](../../../examples/page.waitfor.js)；运行：
  `./opendesk -script examples/page.waitfor.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script`。

## SQLite Runtime API

SQLite 示例与独立 smoke 将数据库和结果写入 `.runtime/tests/sqlite/`；单项 unit 与正式 gate
使用各自 `.runtime/tests/runtime-api/<runId>/` 和 `Execution.artifactDir`。所有命令仍从仓库根目录运行。它们不使用 Scheduler 或 AppStorage 的内部数据库。完整的 API
契约、参数、取消和事务边界见 [SQLite API](../sqlite.md)；各脚本的行为范围见
[SQLite examples README](../../../examples/sqlite/README.md)。

- `sqlite/quickstart.js` — [源码](../../../examples/sqlite/quickstart.js)；运行：
  `./dist/opendesk -script examples/sqlite/quickstart.js -console-mode script`；检查基础建表、绑定、
  `batch`、查询和显式关闭。接口组检查：[单项脚本 sqlite.js](../../../tests/runtime-api/single/sqlite.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/sqlite.js -console-mode script`；其执行结束后的资源计数仍需 SQLite 正式 gate 核验。
- `tests/runtime-api/sqlite-smoke.js` — [公开 Runtime 测试脚本](../../../tests/runtime-api/sqlite-smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/sqlite-smoke.js -console-mode script`；检查路径、值绑定、
  多语句拒绝、只读、查询取消、锁等待、batch 回滚和句柄生命周期。
- `sqlite/persistence-write.js` / `sqlite/persistence-read.js` — [写入脚本](../../../examples/sqlite/persistence-write.js)
  与 [只读验证脚本](../../../examples/sqlite/persistence-read.js)；按顺序运行：
  `./dist/opendesk -script examples/sqlite/persistence-write.js -console-mode script`，然后
  `./dist/opendesk -script examples/sqlite/persistence-read.js -console-mode script`。两次执行使用独立进程，
  后者以 `mode: 'ro'` 验证前者写入的 nonce。
- SQLite 专用正式 gate — [入口](../../../scripts/test_runtime_apis.js)；运行：
  `OPENDESK_RUNTIME_API_MODE=sqlite OPENDESK_BINARY=./dist/opendesk ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`；
  依次运行 `SQLite.open` 与句柄方法的 contract、共享 JS 行为断言、scoped coverage 和 execution cleanup。

## 桌面输入、屏幕、窗口和系统

- `mouse.js` — [源码](../../../examples/mouse.js)；运行：
  `./opendesk -script examples/mouse.js -console-mode script`；检查：
  [单项脚本 mouse.js](../../../tests/runtime-api/single/mouse.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/mouse.js -console-mode script`。
- `keyboard.js` — [源码](../../../examples/keyboard.js)；运行：
  `./opendesk -script examples/keyboard.js -console-mode script`；检查：
  [单项脚本 keyboard.js](../../../tests/runtime-api/single/keyboard.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/keyboard.js -console-mode script`。
- `clipboard.js` — [源码](../../../examples/clipboard.js)；运行：
  `./opendesk -script examples/clipboard.js -console-mode script`；检查：
  [单项脚本 clipboard.js](../../../tests/runtime-api/single/clipboard.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script`。
- `clipboard/rich-smoke.js` — [源码](../../../examples/clipboard/rich-smoke.js)；运行：
  `./opendesk -script examples/clipboard/rich-smoke.js -console-mode script`；检查：
  [单项脚本 clipboard.js](../../../tests/runtime-api/single/clipboard.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script`。
- `clipboard/rich-paste-fixture.js` — [源码](../../../examples/clipboard/rich-paste-fixture.js)；运行：
  `./opendesk -script examples/clipboard/rich-paste-fixture.js -console-mode script`；检查：
  [单项脚本 clipboard.js](../../../tests/runtime-api/single/clipboard.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script`。
- `screen.js` — [源码](../../../examples/screen.js)；运行：
  `./opendesk -script examples/screen.js -console-mode script`；检查：
  [单项脚本 screen.js](../../../tests/runtime-api/single/screen.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script`。
- `screenshot.js` — [源码](../../../examples/screenshot.js)；运行：
  `./opendesk -script examples/screenshot.js -console-mode script`；检查：
  [单项脚本 page.js](../../../tests/runtime-api/single/page.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/page.js -console-mode script`；真实捕获用例 [capture-screen.test.js](../../../tests/runtime-api/live/capture-screen.test.js) 由 live gate 加载，不是直接入口。
- `screenshot_bytes_smoke.js` — [源码](../../../examples/screenshot_bytes_smoke.js)；运行：
  `./opendesk -script examples/screenshot_bytes_smoke.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script`。
- `display-modes.js` — [源码](../../../examples/display-modes.js)；运行：
  `./opendesk -script examples/display-modes.js -console-mode script`；检查：
  [单项脚本 screen.js](../../../tests/runtime-api/single/screen.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script`。
- `screen-record-region.js` — [源码](../../../examples/screen-record-region.js)；运行：
  `./opendesk -script examples/screen-record-region.js -console-mode script`；检查：
  [单项脚本 screen.js](../../../tests/runtime-api/single/screen.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script`；真实屏幕用例 [screen.test.js](../../../tests/runtime-api/live/screen.test.js) 由 live gate 加载，不是直接入口。
- `window-capabilities.js` — [源码](../../../examples/window-capabilities.js)；运行：
  `./opendesk -script examples/window-capabilities.js -console-mode script`；检查：
  [单项脚本 window.js](../../../tests/runtime-api/single/window.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/window.js -console-mode script`。
- `window.js` — [源码](../../../examples/window.js)；运行：
  `./opendesk -script examples/window.js -console-mode script`；检查：
  [单项脚本 window.js](../../../tests/runtime-api/single/window.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/window.js -console-mode script`。
- `window-more.js` — [源码](../../../examples/window-more.js)；运行：
  `./opendesk -script examples/window-more.js -console-mode script`；检查：
  [单项脚本 window.js](../../../tests/runtime-api/single/window.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/window.js -console-mode script`。
- `system.js` — [源码](../../../examples/system.js)；运行：
  `./opendesk -script examples/system.js -console-mode script`；检查：
  [单项脚本 system.js](../../../tests/runtime-api/single/system.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/system.js -console-mode script`。
- `system-session-state.js` — [源码](../../../examples/system-session-state.js)；运行：
  `./opendesk -script examples/system-session-state.js -console-mode script`；检查：
  [单项脚本 system.js](../../../tests/runtime-api/single/system.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/system.js -console-mode script`。
- `notify.js` — [源码](../../../examples/notify.js)；运行：
  `./opendesk -script examples/notify.js -console-mode script`；检查：
  [单项脚本 notify.js](../../../tests/runtime-api/single/notify.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/notify.js -console-mode script`。
- `notifications.js` — [源码](../../../examples/notifications.js)；运行：
  `./opendesk -script examples/notifications.js -console-mode script`；检查：
  [单项脚本 notifications.js](../../../tests/runtime-api/single/notifications.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/notifications.js -console-mode script`。

## Vision、OCR、图像和声音

- `vision.ocr.js` — [源码](../../../examples/vision.ocr.js)；运行：
  `./opendesk -script examples/vision.ocr.js -console-mode script`；检查：
  [单项脚本 vision.js](../../../tests/runtime-api/single/vision.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/vision.js -console-mode script`；需要 OCR provider。
- `vision_bytes_roundtrip.js` — [源码](../../../examples/vision_bytes_roundtrip.js)；运行：
  `./opendesk -script examples/vision_bytes_roundtrip.js -console-mode script`；检查：
  [单项脚本 vision.js](../../../tests/runtime-api/single/vision.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/vision.js -console-mode script`。
- `imageColor.js` — [源码](../../../examples/imageColor.js)；运行：
  `./opendesk -script examples/imageColor.js -console-mode script`；检查：
  [单项脚本 image-color.js](../../../tests/runtime-api/single/image-color.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/image-color.js -console-mode script`。
- `image-color/template-match.js` — [源码](../../../examples/image-color/template-match.js)；输入：
  [source](../../../examples/image-color/fixtures/template-match/scene_color_blocks.png)、
  [template](../../../examples/image-color/fixtures/template-match/template_blue-panel.png)、
  [WeChat panel](../../../examples/image-color/fixtures/wechat-panel.png)（均为版本化图片，不依赖 `.runtime/`）；运行：
  `./opendesk -script examples/image-color/template-match.js`；检查：
  [单项脚本 image-color.js](../../../tests/runtime-api/single/image-color.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/image-color.js -console-mode script`。
- `image-color/wechat-template-match-visual.js` — [源码](../../../examples/image-color/wechat-template-match-visual.js)；在真实 Custom UI 中人工验收微信“消息”按钮的有序状态模板（`#0` 灰色未选中、`#1` 绿色已选中）：两张 source 上的 ROI、实际命中框、模板预览、全图/ROI 一致性和逐项通过/失败判据；从仓库根目录运行：
  `./opendesk -ui -script examples/image-color/wechat-template-match-visual.js -console-mode script`；状态数组只能包含同一控件的不同状态，不能混用灰色消息与绿色联系人；这些 fixture 来自不同截图，仅验证契约，生产请按同一微信版本、主题、DPI 与缩放重新采集。关闭窗口后结束，失败判据会使脚本返回失败状态。
- `image-color/diff.js` — [源码](../../../examples/image-color/diff.js)；运行：
  `./opendesk -script examples/image-color/diff.js -console-mode script`；检查：
  [单项脚本 image-color.js](../../../tests/runtime-api/single/image-color.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/image-color.js -console-mode script`。
- `sound.js` — [源码](../../../examples/sound.js)；运行：
  `./opendesk -script examples/sound.js -console-mode script`；检查：
  [单项脚本 sound.js](../../../tests/runtime-api/single/sound.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/sound.js -console-mode script`。
- `sound-playback.js` — [源码](../../../examples/sound-playback.js)；运行：
  `./opendesk -script examples/sound-playback.js -console-mode script`；检查：
  [单项脚本 sound.js](../../../tests/runtime-api/single/sound.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/sound.js -console-mode script`。
- `audio/control-smoke.js` — [源码](../../../examples/audio/control-smoke.js)；运行：
  `./opendesk -script examples/audio/control-smoke.js -console-mode script`；检查：
  [单项脚本 audio.js](../../../tests/runtime-api/single/audio.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/audio.js -console-mode script`。
- `audio/pattern-watch-smoke.js` — [源码](../../../examples/audio/pattern-watch-smoke.js)；运行：
  `OPENDESK_AUDIO_REFERENCE=/absolute/path/to/new-order.wav ./dist/opendesk -script examples/audio/pattern-watch-smoke.js -console-mode script`；检查：
  当前 capability/source 的 fail-closed skip 或真实平台 `audio.pattern.matched` envelope；Evidence 写入
  `.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/pattern-watch-smoke.json`。

真实声音匹配的观察不能由 Audio unit 测试替代。对应接口组也可以独立检查：
`./dist/opendesk -script tests/runtime-api/single/audio.js -console-mode script`。

## Dialog 与 Custom UI（macOS）

先构建匹配的主程序和 UI host：

```bash
go build -o ./opendesk ./cmd/opendesk && go build -o ./opendesk-ui-host ./cmd/opendesk-ui-host
```

- `dialog.js` — [源码](../../../examples/dialog.js)；运行：
  `./opendesk -ui -script examples/dialog.js -console-mode script`；接口组检查：
  [单项脚本 dialog.js](../../../tests/runtime-api/single/dialog.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/dialog.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=dialog ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `dialog-promise-chain.js` — [源码](../../../examples/dialog-promise-chain.js)；运行：
  `./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script`；接口组检查：
  [单项脚本 dialog.js](../../../tests/runtime-api/single/dialog.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/dialog.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=dialog ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/panel.js` — [源码](../../../examples/custom-ui/panel.js)；运行：
  `./opendesk -ui -script examples/custom-ui/panel.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/form.js` — [源码](../../../examples/custom-ui/form.js)；运行：
  `./opendesk -ui -script examples/custom-ui/form.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/floating-toolbar-wrap-demo.js` — [源码](../../../examples/custom-ui/floating-toolbar-wrap-demo.js)；运行：
  `./opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/five-button-toolbar.js` — [源码](../../../examples/custom-ui/five-button-toolbar.js)；运行：
  `./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/toolbar-vertical-quick-replies.js` — [源码](../../../examples/custom-ui/toolbar-vertical-quick-replies.js)；运行：
  `./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/icon-list.js` — [源码](../../../examples/custom-ui/icon-list.js)；运行：
  `./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script`；接口组检查：
  [单项脚本 custom-ui.js](../../../tests/runtime-api/single/custom-ui.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`；专项完整验收：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。

其他 Custom UI 源码和资源集中在 [`examples/custom-ui/`](../../../examples/custom-ui/)，不再
为每个窗口重复创建一份文档。

## macOS 权限与真实应用

- `global-shortcut-permission-setup.js` — [源码](../../../examples/global-shortcut-permission-setup.js)；运行：
  `./opendesk -script examples/global-shortcut-permission-setup.js -console-mode script`；检查：
  [global-shortcut-smoke.js](../../../tests/runtime-api/global-shortcut-smoke.js)；运行：
  `./dist/opendesk -script tests/runtime-api/global-shortcut-smoke.js -console-mode script`；需要 macOS 权限并按脚本提示触发快捷键。
- `global-shortcut.js` — [源码](../../../examples/global-shortcut.js)；运行：
  `./opendesk -script examples/global-shortcut.js -console-mode script`；检查：
  [单项脚本 global-shortcut.js](../../../tests/runtime-api/single/global-shortcut.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/global-shortcut.js -console-mode script`。
- `mac/request-macos-permissions.js` — [源码](../../../examples/mac/request-macos-permissions.js)；运行：
  `./opendesk -script examples/mac/request-macos-permissions.js -console-mode script`；检查：人工权限观察。
- `mac/request-macos-automation-popup.js` — [源码](../../../examples/mac/request-macos-automation-popup.js)；运行：
  `./opendesk -script examples/mac/request-macos-automation-popup.js -console-mode script`；检查：人工权限观察。
- `mac/screen_displays_inspect.js` — [源码](../../../examples/mac/screen_displays_inspect.js)；运行：
  `./opendesk -script examples/mac/screen_displays_inspect.js -console-mode script`；检查：
  [单项脚本 screen.js](../../../tests/runtime-api/single/screen.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script`；真实屏幕用例 [screen.test.js](../../../tests/runtime-api/live/screen.test.js) 由 live gate 加载，不是直接入口。
- `mac/safari_url_input_flow.js` — [源码](../../../examples/mac/safari_url_input_flow.js)；运行：
  `./opendesk -script examples/mac/safari_url_input_flow.js -console-mode script`；检查：真实 Safari 人工观察。
- `mac/wechat_structured_send.js` — [源码](../../../examples/mac/wechat_structured_send.js)；运行：
  `./opendesk -script examples/mac/wechat_structured_send.js -console-mode script`；检查：真实微信人工观察，发送前必须确认。
- `mac/calculator_mouse_pid_formula_chain/run.js` — [源码](../../../examples/mac/calculator_mouse_pid_formula_chain/run.js)；运行：
  `./opendesk -script examples/mac/calculator_mouse_pid_formula_chain/run.js -console-mode script`；检查：真实计算器人工观察。
- `mac/` 下其他 probe、safari、wechat 和 calculator 文件 — [源码目录](../../../examples/mac/)；检查：
  没有统一的无副作用 gate，使用对应场景文档、截图和人工证据。

## AI recipe

- `ai-cli/write-to-focused-app.js` — [源码](../../../examples/ai-cli/write-to-focused-app.js)；运行：
  `./dist/opendesk ai run examples/ai-cli/write-to-focused-app.js --input '{"text":"Hello from OpenDesk"}'`；检查：
  [Execution Context](../execution.md) 的 recipe contract。单项接口组检查：[单项脚本 execution.js](../../../tests/runtime-api/single/execution.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/execution.js -console-mode script`；它不替代向目标 App 输入文字的现场验收。
- `ai-cli/macos-textedit-recipe.js` — [源码](../../../examples/ai-cli/macos-textedit-recipe.js)；运行：
  `./dist/opendesk ai run examples/ai-cli/macos-textedit-recipe.js`；检查：真实 TextEdit 人工观察。
- `ai-cli/macos-calculator-recipe.js` — [源码](../../../examples/ai-cli/macos-calculator-recipe.js)；运行：
  `./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'`；检查：
  `OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script`。

## Native Extension

先准备与 CLI 配套的 bundle：

```bash
make build
```

- `native-extensions/quickstart.js` — [源码](../../../examples/native-extensions/quickstart.js)；运行：
  `./dist/opendesk -script examples/native-extensions/quickstart.js -console-mode script`；检查：
  [单项脚本 native-extension.js](../../../tests/runtime-api/single/native-extension.js)；运行：
  `./dist/opendesk -script tests/runtime-api/single/native-extension.js -console-mode script`。
- `native-extensions/ocr-quickstart.js` — [源码](../../../examples/native-extensions/ocr-quickstart.js)；运行：
  `./dist/opendesk -script examples/native-extensions/ocr-quickstart.js -console-mode script`；检查：
  [Native Extension 文档](../native-extension.md) 和对应平台 bundle proof。测试原生插件通用契约可用
  `./dist/opendesk -script tests/runtime-api/single/native-extension.js -console-mode script`，但不替代真实 OCR proof。

`single/native-extension.js` 复用原有测试，需要 CLI 实际发现对应的 `goBasic` 测试 bundle；
`make build` 的平台 OCR bundle 不等于全部测试扩展已就绪。需要构建测试扩展时使用
`OPENDESK_RUNTIME_API_MODE=unit-selected OPENDESK_RUNTIME_API_UNIT_FILTER=native-extension ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。

## 正式测试 Scripts

- JavaScript language baseline：[`tests/runtime-api/javascript-language.js`](../../../tests/runtime-api/javascript-language.js)；直接运行：
  `./dist/opendesk -script tests/runtime-api/javascript-language.js -console-mode script`；正式 gate：
  `OPENDESK_RUNTIME_API_MODE=language ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- Runtime API smoke：[`scripts/test_runtime_apis.js`](../../../scripts/test_runtime_apis.js)；运行：
  `./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- Runtime API contract：[`scripts/test_runtime_apis.js`](../../../scripts/test_runtime_apis.js)；运行：
  `OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- Recorder contract：[`scripts/test_recorder.js`](../../../scripts/test_recorder.js)；运行：
  `./dist/opendesk -script scripts/test_recorder.js -console-mode script`。
- E2E smoke：[`scripts/e2e_smoke.js`](../../../scripts/e2e_smoke.js)；运行：
  `./dist/opendesk -script scripts/e2e_smoke.js -console-mode script`。
- App lifecycle live：[`scripts/test_app_lifecycle.js`](../../../scripts/test_app_lifecycle.js)；运行：
  `OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script`。
- Calculator recipe live：[`scripts/test_ai_calculator_recipe.js`](../../../scripts/test_ai_calculator_recipe.js)；运行：
  `OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script`。

Runtime API 的测试实现集中在 [`tests/runtime-api/`](../../../tests/runtime-api/)。单项直接命令使用
`single/<family>.js`，多组选用 `unit-selected.js`；正式跨步骤编排入口仍只有
`scripts/test_runtime_apis.js`。旧 shell wrapper 已删除，已删除的旧 `scripts/*_test.sh` 不要再复制。
