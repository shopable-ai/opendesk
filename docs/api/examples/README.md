---
title: Examples 快速索引
description: OpenDesk examples 与 Runtime 测试脚本的文件链接和可复制运行命令。
order: 3
---

# Examples 快速索引

所有命令从仓库根目录执行。每项都给出源码链接、可复制命令和对应的检查入口；测试文件
本身由 OpenDesk Runtime 启动，不要用 Node 直接运行。

反引号多行字符串及 ES2015–ES2023 的选定作者基线见
[JavaScript Runtime](../runtime.md#javascript-语言基线)；版本能力由一个统一 language gate 验证，
对应源码为 [javascript-language.js](../../../tests/runtime-api/javascript-language.js)，不为 ES6、ES7、ES8
分别复制测试文件。

## 目录

- [基础 Runtime 与数据](../../../examples/)
- [Custom UI](../../../examples/custom-ui/)
- [macOS 权限与真实应用](../../../examples/mac/)
- [AI recipe](../../../examples/ai-cli/)
- [Native Extension](../../../examples/native-extensions/)
- [完整 Runtime 测试实现](../../../tests/runtime-api/)
- [完整测试目录说明](../../quality/developer-test-catalog.md)

## 基础 Runtime 与数据

- `api-quickstart.js` — [源码](../../../examples/api-quickstart.js)；运行：
  `./opendesk -script examples/api-quickstart.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)。
- `environment.js` — [源码](../../../examples/environment.js)；运行：
  `./opendesk -script examples/environment.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=environment ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `file-json.js` — [源码](../../../examples/file-json.js)；运行：
  `./opendesk -script examples/file-json.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=file-json ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `command.js` — [源码](../../../examples/command.js)；运行：
  `./opendesk -script examples/command.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=command ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `path.js` — [源码](../../../examples/path.js)；运行：
  `./opendesk -script examples/path.js -console-mode script`；检查：
  [path.test.js](../../../tests/runtime-api/unit/path.test.js)。
- `file.js` — [源码](../../../examples/file.js)；运行：
  `./opendesk -script examples/file.js -console-mode script`；检查：
  [file.test.js](../../../tests/runtime-api/unit/file.test.js)。
- `appStorage.js` — [源码](../../../examples/appStorage.js)；运行：
  `./opendesk -script examples/appStorage.js -console-mode script`；检查：
  [storage.test.js](../../../tests/runtime-api/unit/storage.test.js)。
- `console.js` — [源码](../../../examples/console.js)；运行：
  `./opendesk -script examples/console.js -console-mode script`；检查：
  [console.test.js](../../../tests/runtime-api/unit/console.test.js)。
- `globalThis.js` — [源码](../../../examples/globalThis.js)；运行：
  `./opendesk -script examples/globalThis.js -console-mode script`；检查：
  [globals.test.js](../../../tests/runtime-api/unit/globals.test.js)。
- `promise.js` — [源码](../../../examples/promise.js)；运行：
  `./opendesk -script examples/promise.js -console-mode script`；检查：
  [async-lifecycle.js](../../../tests/runtime-api/async-lifecycle.js)。
- `sleep.js` — [源码](../../../examples/sleep.js)；运行：
  `./opendesk -script examples/sleep.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)。
- `timer.js` — [源码](../../../examples/timer.js)；运行：
  `./opendesk -script examples/timer.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)。
- `page.js` — [源码](../../../examples/page.js)；运行：
  `./opendesk -script examples/page.js -console-mode script`；检查：
  [page.test.js](../../../tests/runtime-api/unit/page.test.js)。
- `page.waitfor.js` — [源码](../../../examples/page.waitfor.js)；运行：
  `./opendesk -script examples/page.waitfor.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)。

## 桌面输入、屏幕、窗口和系统

- `mouse.js` — [源码](../../../examples/mouse.js)；运行：
  `./opendesk -script examples/mouse.js -console-mode script`；检查：
  [mouse.test.js](../../../tests/runtime-api/unit/mouse.test.js)。
- `keyboard.js` — [源码](../../../examples/keyboard.js)；运行：
  `./opendesk -script examples/keyboard.js -console-mode script`；检查：
  [keyboard.test.js](../../../tests/runtime-api/unit/keyboard.test.js)。
- `clipboard.js` — [源码](../../../examples/clipboard.js)；运行：
  `./opendesk -script examples/clipboard.js -console-mode script`；检查：
  [clipboard.test.js](../../../tests/runtime-api/unit/clipboard.test.js)。
- `clipboard/rich-smoke.js` — [源码](../../../examples/clipboard/rich-smoke.js)；运行：
  `./opendesk -script examples/clipboard/rich-smoke.js -console-mode script`；检查：
  [clipboard.test.js](../../../tests/runtime-api/unit/clipboard.test.js)。
- `clipboard/rich-paste-fixture.js` — [源码](../../../examples/clipboard/rich-paste-fixture.js)；运行：
  `./opendesk -script examples/clipboard/rich-paste-fixture.js -console-mode script`；检查：
  [clipboard.test.js](../../../tests/runtime-api/unit/clipboard.test.js)。
- `screen.js` — [源码](../../../examples/screen.js)；运行：
  `./opendesk -script examples/screen.js -console-mode script`；检查：
  [screen.test.js](../../../tests/runtime-api/unit/screen.test.js)。
- `screenshot.js` — [源码](../../../examples/screenshot.js)；运行：
  `./opendesk -script examples/screenshot.js -console-mode script`；检查：
  [capture-screen.test.js](../../../tests/runtime-api/live/capture-screen.test.js)。
- `screenshot_bytes_smoke.js` — [源码](../../../examples/screenshot_bytes_smoke.js)；运行：
  `./opendesk -script examples/screenshot_bytes_smoke.js -console-mode script`；检查：
  [smoke.js](../../../tests/runtime-api/smoke.js)。
- `display-modes.js` — [源码](../../../examples/display-modes.js)；运行：
  `./opendesk -script examples/display-modes.js -console-mode script`；检查：
  [screen.test.js](../../../tests/runtime-api/unit/screen.test.js)。
- `screen-record-region.js` — [源码](../../../examples/screen-record-region.js)；运行：
  `./opendesk -script examples/screen-record-region.js -console-mode script`；检查：
  [screen.test.js](../../../tests/runtime-api/live/screen.test.js)。
- `window-capabilities.js` — [源码](../../../examples/window-capabilities.js)；运行：
  `./opendesk -script examples/window-capabilities.js -console-mode script`；检查：
  [window.test.js](../../../tests/runtime-api/unit/window.test.js)。
- `window.js` — [源码](../../../examples/window.js)；运行：
  `./opendesk -script examples/window.js -console-mode script`；检查：
  [window.test.js](../../../tests/runtime-api/unit/window.test.js)。
- `window-more.js` — [源码](../../../examples/window-more.js)；运行：
  `./opendesk -script examples/window-more.js -console-mode script`；检查：
  [window.test.js](../../../tests/runtime-api/unit/window.test.js)。
- `system.js` — [源码](../../../examples/system.js)；运行：
  `./opendesk -script examples/system.js -console-mode script`；检查：
  [system.test.js](../../../tests/runtime-api/unit/system.test.js)。
- `system-session-state.js` — [源码](../../../examples/system-session-state.js)；运行：
  `./opendesk -script examples/system-session-state.js -console-mode script`；检查：
  [system.test.js](../../../tests/runtime-api/unit/system.test.js)。
- `notify.js` — [源码](../../../examples/notify.js)；运行：
  `./opendesk -script examples/notify.js -console-mode script`；检查：
  [notify.test.js](../../../tests/runtime-api/unit/notify.test.js)。
- `notifications.js` — [源码](../../../examples/notifications.js)；运行：
  `./opendesk -script examples/notifications.js -console-mode script`；检查：
  [notifications.test.js](../../../tests/runtime-api/unit/notifications.test.js)。

## Vision、OCR、图像和声音

- `vision.ocr.js` — [源码](../../../examples/vision.ocr.js)；运行：
  `./opendesk -script examples/vision.ocr.js -console-mode script`；检查：
  [vision.test.js](../../../tests/runtime-api/unit/vision.test.js)；需要 OCR provider。
- `vision_bytes_roundtrip.js` — [源码](../../../examples/vision_bytes_roundtrip.js)；运行：
  `./opendesk -script examples/vision_bytes_roundtrip.js -console-mode script`；检查：
  [vision.test.js](../../../tests/runtime-api/unit/vision.test.js)。
- `imageColor.js` — [源码](../../../examples/imageColor.js)；运行：
  `./opendesk -script examples/imageColor.js -console-mode script`；检查：
  [image-color.test.js](../../../tests/runtime-api/unit/image-color.test.js)。
- `image-color/template-match.js` — [源码](../../../examples/image-color/template-match.js)；运行：
  `./opendesk -script examples/image-color/template-match.js -console-mode script`；检查：
  [image-color.test.js](../../../tests/runtime-api/unit/image-color.test.js)。
- `image-color/diff.js` — [源码](../../../examples/image-color/diff.js)；运行：
  `./opendesk -script examples/image-color/diff.js -console-mode script`；检查：
  [image-color.test.js](../../../tests/runtime-api/unit/image-color.test.js)。
- `sound.js` — [源码](../../../examples/sound.js)；运行：
  `./opendesk -script examples/sound.js -console-mode script`；检查：
  [sound.test.js](../../../tests/runtime-api/unit/sound.test.js)。
- `sound-playback.js` — [源码](../../../examples/sound-playback.js)；运行：
  `./opendesk -script examples/sound-playback.js -console-mode script`；检查：
  [sound.test.js](../../../tests/runtime-api/unit/sound.test.js)。
- `audio/control-smoke.js` — [源码](../../../examples/audio/control-smoke.js)；运行：
  `./opendesk -script examples/audio/control-smoke.js -console-mode script`；检查：
  [audio.test.js](../../../tests/runtime-api/unit/audio.test.js)。

## Dialog 与 Custom UI（macOS）

先构建匹配的主程序和 UI host：

```bash
go build -o ./opendesk ./cmd/opendesk && go build -o ./opendesk-ui-host ./cmd/opendesk-ui-host
```

- `dialog.js` — [源码](../../../examples/dialog.js)；运行：
  `./opendesk -ui -script examples/dialog.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=dialog ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `dialog-promise-chain.js` — [源码](../../../examples/dialog-promise-chain.js)；运行：
  `./opendesk -ui -script examples/dialog-promise-chain.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=dialog ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/panel.js` — [源码](../../../examples/custom-ui/panel.js)；运行：
  `./opendesk -ui -script examples/custom-ui/panel.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/form.js` — [源码](../../../examples/custom-ui/form.js)；运行：
  `./opendesk -ui -script examples/custom-ui/form.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/floating-toolbar-wrap-demo.js` — [源码](../../../examples/custom-ui/floating-toolbar-wrap-demo.js)；运行：
  `./opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/five-button-toolbar.js` — [源码](../../../examples/custom-ui/five-button-toolbar.js)；运行：
  `./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/toolbar-vertical-quick-replies.js` — [源码](../../../examples/custom-ui/toolbar-vertical-quick-replies.js)；运行：
  `./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
- `custom-ui/icon-list.js` — [源码](../../../examples/custom-ui/icon-list.js)；运行：
  `./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script`；检查：
  `OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。

其他 Custom UI 源码和资源集中在 [`examples/custom-ui/`](../../../examples/custom-ui/)，不再
为每个窗口重复创建一份文档。

## macOS 权限与真实应用

- `global-shortcut-permission-setup.js` — [源码](../../../examples/global-shortcut-permission-setup.js)；运行：
  `./opendesk -script examples/global-shortcut-permission-setup.js -console-mode script`；检查：
  [global-shortcut-smoke.js](../../../tests/runtime-api/global-shortcut-smoke.js)。
- `global-shortcut.js` — [源码](../../../examples/global-shortcut.js)；运行：
  `./opendesk -script examples/global-shortcut.js -console-mode script`；检查：
  [global-shortcut.test.js](../../../tests/runtime-api/unit/global-shortcut.test.js)。
- `mac/request-macos-permissions.js` — [源码](../../../examples/mac/request-macos-permissions.js)；运行：
  `./opendesk -script examples/mac/request-macos-permissions.js -console-mode script`；检查：人工权限观察。
- `mac/request-macos-automation-popup.js` — [源码](../../../examples/mac/request-macos-automation-popup.js)；运行：
  `./opendesk -script examples/mac/request-macos-automation-popup.js -console-mode script`；检查：人工权限观察。
- `mac/screen_displays_inspect.js` — [源码](../../../examples/mac/screen_displays_inspect.js)；运行：
  `./opendesk -script examples/mac/screen_displays_inspect.js -console-mode script`；检查：
  [screen.test.js](../../../tests/runtime-api/live/screen.test.js)。
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
  [Execution Context](../execution.md) 的 recipe contract。
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
  [native-extension.test.js](../../../tests/runtime-api/unit/native-extension.test.js)。
- `native-extensions/ocr-quickstart.js` — [源码](../../../examples/native-extensions/ocr-quickstart.js)；运行：
  `./dist/opendesk -script examples/native-extensions/ocr-quickstart.js -console-mode script`；检查：
  [Native Extension 文档](../native-extension.md) 和对应平台 bundle proof。

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

Runtime API 的测试实现集中在 [`tests/runtime-api/`](../../../tests/runtime-api/)，执行入口统一为
`scripts/test_runtime_apis.js`。旧 shell wrapper 已删除，已删除的旧 `scripts/*_test.sh` 不要再复制。
