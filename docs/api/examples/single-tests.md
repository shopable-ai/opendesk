---
title: 单项接口测试脚本
description: 每个已登记 Runtime unit 接口组的单文件入口、断言来源和可复制命令。
order: 4
---

# 单项接口测试脚本

工作目录：OpenDesk 仓库根目录。准备与源码匹配的主程序后，下面每行只需一条命令；
无需先设置筛选变量。Windows 将 `./dist/opendesk` 换为 `.\dist\opendesk.exe`，脚本路径可保留 `/`。
这是直接 OpenDesk Runtime 入口，不用 Node 执行；不要直接启动 `unit/*.test.js` 或 `gates/suites/*.js`。

## 范围与前置条件

每个入口只选择一个已有 unit 文件（不是单个 API 方法），复用现有 `manifest.js`、选择器和断言。
三个根层 unit 文件 `geometry.js`、`geometry-layout.js`、`ui.js` 同样由 manifest 确定归属。
单项执行不会隐含构建扩展、运行完整 contract/coverage/quality 或完成任何实际示例。

固定入口拒绝已设置的 `OPENDESK_RUNTIME_API_UNIT_FILTER`（含空值），防止残留环境改变或混淆范围。
先移除该变量再运行；确实要选择多个组时仍用 `unit-selected.js`。入口不修改 `Execution.env`。

原有 unit 的参数校验、模拟组合及真实资源需求保持不变。平台能力、权限、UI host、测试 bundle
和 fixture 未就绪时必须报告失败/未验证，不能通过增加 skip 或假返回值宣称通过。尤其：

- `native-extension` 需要被当前 CLI 发现的 `goBasic` 测试 bundle。需要构建准备时使用下文正式入口。
- `sqlite` 的连接、路径、取消等仍是真实操作；单项运行不能代替退出后资源归零与专项 coverage。
- `page`、输入/窗口、`dialog`、`custom-ui`、音视频等 unit 不证明真实桌面或视觉验收通过；保留各自 live gate。

## 独立入口与命令

<!-- runtime-api-single:start -->
| 接口组 ID | 单文件入口 | 唯一断言来源 | 从仓库根目录运行 |
| --- | --- | --- | --- |
| `page` | [page.js](../../../tests/runtime-api/single/page.js) | [原用例](../../../tests/runtime-api/unit/page.test.js) | `./dist/opendesk -script tests/runtime-api/single/page.js -console-mode script` |
| `mouse` | [mouse.js](../../../tests/runtime-api/single/mouse.js) | [原用例](../../../tests/runtime-api/unit/mouse.test.js) | `./dist/opendesk -script tests/runtime-api/single/mouse.js -console-mode script` |
| `keyboard` | [keyboard.js](../../../tests/runtime-api/single/keyboard.js) | [原用例](../../../tests/runtime-api/unit/keyboard.test.js) | `./dist/opendesk -script tests/runtime-api/single/keyboard.js -console-mode script` |
| `global-shortcut` | [global-shortcut.js](../../../tests/runtime-api/single/global-shortcut.js) | [原用例](../../../tests/runtime-api/unit/global-shortcut.test.js) | `./dist/opendesk -script tests/runtime-api/single/global-shortcut.js -console-mode script` |
| `events` | [events.js](../../../tests/runtime-api/single/events.js) | [原用例](../../../tests/runtime-api/unit/events.test.js) | `./dist/opendesk -script tests/runtime-api/single/events.js -console-mode script` |
| `app` | [app.js](../../../tests/runtime-api/single/app.js) | [原用例](../../../tests/runtime-api/unit/app.test.js) | `./dist/opendesk -script tests/runtime-api/single/app.js -console-mode script` |
| `notifications` | [notifications.js](../../../tests/runtime-api/single/notifications.js) | [原用例](../../../tests/runtime-api/unit/notifications.test.js) | `./dist/opendesk -script tests/runtime-api/single/notifications.js -console-mode script` |
| `touchscreen` | [touchscreen.js](../../../tests/runtime-api/single/touchscreen.js) | [原用例](../../../tests/runtime-api/unit/touchscreen.test.js) | `./dist/opendesk -script tests/runtime-api/single/touchscreen.js -console-mode script` |
| `window` | [window.js](../../../tests/runtime-api/single/window.js) | [原用例](../../../tests/runtime-api/unit/window.test.js) | `./dist/opendesk -script tests/runtime-api/single/window.js -console-mode script` |
| `screen` | [screen.js](../../../tests/runtime-api/single/screen.js) | [原用例](../../../tests/runtime-api/unit/screen.test.js) | `./dist/opendesk -script tests/runtime-api/single/screen.js -console-mode script` |
| `system` | [system.js](../../../tests/runtime-api/single/system.js) | [原用例](../../../tests/runtime-api/unit/system.test.js) | `./dist/opendesk -script tests/runtime-api/single/system.js -console-mode script` |
| `execution` | [execution.js](../../../tests/runtime-api/single/execution.js) | [原用例](../../../tests/runtime-api/unit/execution.test.js) | `./dist/opendesk -script tests/runtime-api/single/execution.js -console-mode script` |
| `command` | [command.js](../../../tests/runtime-api/single/command.js) | [原用例](../../../tests/runtime-api/unit/command.test.js) | `./dist/opendesk -script tests/runtime-api/single/command.js -console-mode script` |
| `path` | [path.js](../../../tests/runtime-api/single/path.js) | [原用例](../../../tests/runtime-api/unit/path.test.js) | `./dist/opendesk -script tests/runtime-api/single/path.js -console-mode script` |
| `file` | [file.js](../../../tests/runtime-api/single/file.js) | [原用例](../../../tests/runtime-api/unit/file.test.js) | `./dist/opendesk -script tests/runtime-api/single/file.js -console-mode script` |
| `file-json` | [file-json.js](../../../tests/runtime-api/single/file-json.js) | [原用例](../../../tests/runtime-api/unit/file-json.test.js) | `./dist/opendesk -script tests/runtime-api/single/file-json.js -console-mode script` |
| `sqlite` | [sqlite.js](../../../tests/runtime-api/single/sqlite.js) | [原用例](../../../tests/runtime-api/unit/sqlite.test.js) | `./dist/opendesk -script tests/runtime-api/single/sqlite.js -console-mode script` |
| `storage` | [storage.js](../../../tests/runtime-api/single/storage.js) | [原用例](../../../tests/runtime-api/unit/storage.test.js) | `./dist/opendesk -script tests/runtime-api/single/storage.js -console-mode script` |
| `clipboard` | [clipboard.js](../../../tests/runtime-api/single/clipboard.js) | [原用例](../../../tests/runtime-api/unit/clipboard.test.js) | `./dist/opendesk -script tests/runtime-api/single/clipboard.js -console-mode script` |
| `console` | [console.js](../../../tests/runtime-api/single/console.js) | [原用例](../../../tests/runtime-api/unit/console.test.js) | `./dist/opendesk -script tests/runtime-api/single/console.js -console-mode script` |
| `http` | [http.js](../../../tests/runtime-api/single/http.js) | [原用例](../../../tests/runtime-api/unit/http.test.js) | `./dist/opendesk -script tests/runtime-api/single/http.js -console-mode script` |
| `notify` | [notify.js](../../../tests/runtime-api/single/notify.js) | [原用例](../../../tests/runtime-api/unit/notify.test.js) | `./dist/opendesk -script tests/runtime-api/single/notify.js -console-mode script` |
| `native-extension` | [native-extension.js](../../../tests/runtime-api/single/native-extension.js) | [原用例](../../../tests/runtime-api/unit/native-extension.test.js) | `./dist/opendesk -script tests/runtime-api/single/native-extension.js -console-mode script` |
| `axios` | [axios.js](../../../tests/runtime-api/single/axios.js) | [原用例](../../../tests/runtime-api/unit/axios.test.js) | `./dist/opendesk -script tests/runtime-api/single/axios.js -console-mode script` |
| `http-axios` | [http-axios.js](../../../tests/runtime-api/single/http-axios.js) | [原用例](../../../tests/runtime-api/unit/http-axios.test.js) | `./dist/opendesk -script tests/runtime-api/single/http-axios.js -console-mode script` |
| `ocr` | [ocr.js](../../../tests/runtime-api/single/ocr.js) | [原用例](../../../tests/runtime-api/unit/ocr.test.js) | `./dist/opendesk -script tests/runtime-api/single/ocr.js -console-mode script` |
| `vision` | [vision.js](../../../tests/runtime-api/single/vision.js) | [原用例](../../../tests/runtime-api/unit/vision.test.js) | `./dist/opendesk -script tests/runtime-api/single/vision.js -console-mode script` |
| `vision-layout` | [vision-layout.js](../../../tests/runtime-api/single/vision-layout.js) | [原用例](../../../tests/runtime-api/unit/vision-layout.test.js) | `./dist/opendesk -script tests/runtime-api/single/vision-layout.js -console-mode script` |
| `image-color` | [image-color.js](../../../tests/runtime-api/single/image-color.js) | [原用例](../../../tests/runtime-api/unit/image-color.test.js) | `./dist/opendesk -script tests/runtime-api/single/image-color.js -console-mode script` |
| `sound` | [sound.js](../../../tests/runtime-api/single/sound.js) | [原用例](../../../tests/runtime-api/unit/sound.test.js) | `./dist/opendesk -script tests/runtime-api/single/sound.js -console-mode script` |
| `audio` | [audio.js](../../../tests/runtime-api/single/audio.js) | [原用例](../../../tests/runtime-api/unit/audio.test.js) | `./dist/opendesk -script tests/runtime-api/single/audio.js -console-mode script` |
| `dialog` | [dialog.js](../../../tests/runtime-api/single/dialog.js) | [原用例](../../../tests/runtime-api/unit/dialog.test.js) | `./dist/opendesk -script tests/runtime-api/single/dialog.js -console-mode script` |
| `custom-ui` | [custom-ui.js](../../../tests/runtime-api/single/custom-ui.js) | [原用例](../../../tests/runtime-api/unit/custom-ui.test.js) | `./dist/opendesk -script tests/runtime-api/single/custom-ui.js -console-mode script` |
| `floating-window` | [floating-window.js](../../../tests/runtime-api/single/floating-window.js) | [原用例](../../../tests/runtime-api/unit/floating-window.test.js) | `./dist/opendesk -script tests/runtime-api/single/floating-window.js -console-mode script` |
| `window-library` | [window-library.js](../../../tests/runtime-api/single/window-library.js) | [原用例](../../../tests/runtime-api/unit/window-library.test.js) | `./dist/opendesk -script tests/runtime-api/single/window-library.js -console-mode script` |
| `globals` | [globals.js](../../../tests/runtime-api/single/globals.js) | [原用例](../../../tests/runtime-api/unit/globals.test.js) | `./dist/opendesk -script tests/runtime-api/single/globals.js -console-mode script` |
| `geometry` | [geometry.js](../../../tests/runtime-api/single/geometry.js) | [原用例](../../../tests/runtime-api/geometry.js) | `./dist/opendesk -script tests/runtime-api/single/geometry.js -console-mode script` |
| `geometry-layout` | [geometry-layout.js](../../../tests/runtime-api/single/geometry-layout.js) | [原用例](../../../tests/runtime-api/geometry-layout.js) | `./dist/opendesk -script tests/runtime-api/single/geometry-layout.js -console-mode script` |
| `ui` | [ui.js](../../../tests/runtime-api/single/ui.js) | [原用例](../../../tests/runtime-api/ui.js) | `./dist/opendesk -script tests/runtime-api/single/ui.js -console-mode script` |
<!-- runtime-api-single:end -->

## 结果与完整验收

单项结果位于 `.runtime/tests/runtime-api/<Execution.id>/results/`（正式上下文则使用它的 runDir）：
`unit-selection.json` 记录选中的 ID 和用例路径，`runtime-api-unit-selected.json` 记录执行结果。
选择记录明确 `scope: selected-unit-files`、`fullCatalog: false`；失败会抛错，不能获得空测试的绿色结果。
这些文件不能替代全量 `unit.json`、coverage 或 quality，缺少实机验证不能写成已通过。

多组直接运行仍支持：

```bash
OPENDESK_RUNTIME_API_UNIT_FILTER=file,path ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
```

需要构建来源、watchdog、测试扩展准备和清理证据时仍用原正式入口：

```bash
OPENDESK_RUNTIME_API_MODE=unit-selected OPENDESK_RUNTIME_API_UNIT_FILTER=native-extension ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
OPENDESK_RUNTIME_API_MODE=sqlite ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

原正式编排继承 POSIX 工具依赖；上述正式命令不是 Windows 原生完整 gate 已移植的声明。
真实应用、权限弹窗、录屏、图像视觉和 Recipe 仍按[示例索引](README.md)的专项/人工步骤验收。

## 维护

新增接口组时，在原 manifest 登记独立 unit 用例，并增加一个同名 `single/<id>.js` 薄入口。
不要复制断言或扩大入口职责。表格和薄入口模板由 `scripts/lib/runtime-api-entrypoints.js`
定义；现有 `node scripts/audit_test_architecture.js` 核对 manifest、入口、断言文件和本文表格一致。

```bash
node --test tests/test-architecture/layout.test.js tests/test-architecture/runtime-api-modules.test.js tests/test-architecture/runtime-api-entrypoints.test.js
```

这是目录、入口控制流与文档一致性测试，不是 Runtime API 的实机验证。不能用这些结果替代上面的直接命令。
