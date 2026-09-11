# 基础 Runtime 示例

所有命令从仓库根目录运行，使用 OpenDesk Runtime 执行，不使用 Node 运行公开示例。本目录是基础 JavaScript / Execution / File / Command / System 能力的唯一 canonical 位置。

## 入门与 JavaScript Runtime

| 示例 | 直接运行 | 说明 |
| --- | --- | --- |
| [api-quickstart.js](api-quickstart.js) | `./dist/opendesk -script examples/runtime/api-quickstart.js -console-mode script` | Runtime 快速入口。 |
| [console.js](console.js) | `./dist/opendesk -script examples/runtime/console.js -console-mode script` | `console.log/info/warn/error/debug/group/time`。 |
| [global-this.js](global-this.js) | `./dist/opendesk -script examples/runtime/global-this.js -console-mode script` | `globalThis` 临时属性与函数。 |
| [promise.js](promise.js) | `./dist/opendesk -script examples/runtime/promise.js -console-mode script` | `await`、`Promise.all`、rejection、`Promise.race`。 |
| [sleep.js](sleep.js) | `./dist/opendesk -script examples/runtime/sleep.js -console-mode script` | `sleep()` / `sleepSeconds()`。 |
| [timer.js](timer.js) | `./dist/opendesk -script examples/runtime/timer.js -console-mode script` | `setTimeout` / `setInterval` 及清理。 |
| [page-wait.js](page-wait.js) | `./dist/opendesk -script examples/runtime/page-wait.js -console-mode script` | 固定等待、条件轮询、取消与 `waitForAll`。 |

这些条目在 `examples/catalog.json` 中标记为 `safe`，适合 Example Explorer 一键运行。

## Execution、文件和命令

| 示例 | 直接运行 | 说明 |
| --- | --- | --- |
| [environment.js](environment.js) | `./dist/opendesk -script examples/runtime/environment.js -console-mode script` | 只打印白名单环境摘要。 |
| [path.js](path.js) | `./dist/opendesk -script examples/runtime/path.js -console-mode script` | 路径、`Execution.scriptPath` / `scriptDir`。 |
| [file.js](file.js) | `./dist/opendesk -script examples/runtime/file.js -console-mode script` | 隔离的文本文件读写、复制、移动与目录操作。 |
| [file-json.js](file-json.js) | `./dist/opendesk -script examples/runtime/file-json.js -console-mode script` | `File.readJSON()` / `writeJSON()`。 |
| [command.js](command.js) | `./dist/opendesk -script examples/runtime/command.js -console-mode script` | 固定 echo 子进程；没有用户可注入 shell 文本。 |

HTTP 由 [http.js](http.js) 展示，因为它有外部测试服务前置条件，不是 Explorer 默认 safe quickstart。

## 本地持久化与 System

| 示例 | Explorer | 说明 |
| --- | --- | --- |
| [app-storage.js](app-storage.js) | `manual` | 写持久化 AppStorage；键使用本次 `Execution.id` 前缀。 |
| [system-info.js](system-info.js) | `manual` | 输出 process/network/user/fingerprint 等详细本机信息；分享日志前必须审阅。 |
| [system-session-state.js](system-session-state.js) | `safe` | 只读 session capabilities/state。 |

`manual` 表示 Explorer 可搜索并显示源码/前置条件，但不会提供一键 Run。

## 旧路径已退休

过去位于 `examples/` 根目录的 Runtime 入口已经删除。新代码、文档和命令只使用 `examples/runtime/...`。Catalog 中如保留 `legacyNames`，只用于历史名称和搜索上下文，不表示旧文件仍可执行。

## Example 与 Test 的边界

带 `.test.js` 或 smoke 语义的实现不属于 Explorer 的普通 curated 列表；正式 Runtime contract 继续由 `tests/runtime-api/` 承担。不要因为某个公开 Example 成功执行，就把对应 API 或跨平台行为标记为正式测试通过。

平台限制和精确 API 契约分别以 [`docs/api/`](../../docs/api/README.md) 中的对应 Reference 为准。
