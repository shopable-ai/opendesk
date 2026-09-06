# 开发者单项接口测试

以下脚本用于开发者回归检查，不是用户使用示例。用户示例见
[单项示例运行](../../../docs/api/examples/single-tests.md)。

从仓库根目录使用匹配源码的 OpenDesk 构建运行，先移除 `OPENDESK_RUNTIME_API_UNIT_FILTER`。
每个脚本复用 manifest 中的原用例；不构建缺失扩展，也不包含退出后资源归零或完整平台验收。
`native-extension` 需先准备 goBasic 测试扩展，SQLite 资源清理和 UI 实窗行为仍使用专项验收。

<!-- runtime-api-single:start -->
- `page`：`./dist/opendesk -script tests/runtime-api/single/page.js -console-mode script`
- `mouse`：`./dist/opendesk -script tests/runtime-api/single/mouse.js -console-mode script`
- `keyboard`：`./dist/opendesk -script tests/runtime-api/single/keyboard.js -console-mode script`
- `global-shortcut`：`./dist/opendesk -script tests/runtime-api/single/global-shortcut.js -console-mode script`
- `events`：`./dist/opendesk -script tests/runtime-api/single/events.js -console-mode script`
- `app`：`./dist/opendesk -script tests/runtime-api/single/app.js -console-mode script`
- `notifications`：`./dist/opendesk -script tests/runtime-api/single/notifications.js -console-mode script`
- `touchscreen`：`./dist/opendesk -script tests/runtime-api/single/touchscreen.js -console-mode script`
- `window`：`./dist/opendesk -script tests/runtime-api/single/window.js -console-mode script`
- `screen`：`./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script`
- `system`：`./dist/opendesk -script tests/runtime-api/single/system.js -console-mode script`
- `execution`：`./dist/opendesk -script tests/runtime-api/single/execution.js -console-mode script`
- `command`：`./dist/opendesk -script tests/runtime-api/single/command.js -console-mode script`
- `path`：`./dist/opendesk -script tests/runtime-api/single/path.js -console-mode script`
- `file`：`./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script`
- `file-json`：`./dist/opendesk -script tests/runtime-api/single/file-json.js -console-mode script`
- `sqlite`：`./dist/opendesk -script tests/runtime-api/single/sqlite.js -console-mode script`
- `storage`：`./dist/opendesk -script tests/runtime-api/single/storage.js -console-mode script`
- `clipboard`：`./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script`
- `console`：`./dist/opendesk -script tests/runtime-api/single/console.js -console-mode script`
- `http`：`./dist/opendesk -script tests/runtime-api/single/http.js -console-mode script`
- `notify`：`./dist/opendesk -script tests/runtime-api/single/notify.js -console-mode script`
- `native-extension`：`./dist/opendesk -script tests/runtime-api/single/native-extension.js -console-mode script`
- `axios`：`./dist/opendesk -script tests/runtime-api/single/axios.js -console-mode script`
- `http-axios`：`./dist/opendesk -script tests/runtime-api/single/http-axios.js -console-mode script`
- `ocr`：`./dist/opendesk -script tests/runtime-api/single/ocr.js -console-mode script`
- `vision`：`./dist/opendesk -script tests/runtime-api/single/vision.js -console-mode script`
- `vision-layout`：`./dist/opendesk -script tests/runtime-api/single/vision-layout.js -console-mode script`
- `image-color`：`./dist/opendesk -script tests/runtime-api/single/image-color.js -console-mode script`
- `sound`：`./dist/opendesk -script tests/runtime-api/single/sound.js -console-mode script`
- `audio`：`./dist/opendesk -script tests/runtime-api/single/audio.js -console-mode script`
- `dialog`：`./dist/opendesk -script tests/runtime-api/single/dialog.js -console-mode script`
- `custom-ui`：`./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script`
- `floating-window`：`./dist/opendesk -script tests/runtime-api/single/floating-window.js -console-mode script`
- `window-library`：`./dist/opendesk -script tests/runtime-api/single/window-library.js -console-mode script`
- `globals`：`./dist/opendesk -script tests/runtime-api/single/globals.js -console-mode script`
- `geometry`：`./dist/opendesk -script tests/runtime-api/single/geometry.js -console-mode script`
- `geometry-layout`：`./dist/opendesk -script tests/runtime-api/single/geometry-layout.js -console-mode script`
- `ui`：`./dist/opendesk -script tests/runtime-api/single/ui.js -console-mode script`
<!-- runtime-api-single:end -->

结果仍写入 `unit-selection.json` 和 `runtime-api-unit-selected.json`，标记 `fullCatalog: false`；
不能替代全量 unit、coverage 或 quality。多组选择、前置条件、证据和正式模式见
[Runtime API 测试说明](../../../docs/quality/runtime-api-test-modules.md)。
